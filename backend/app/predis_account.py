"""Read Predis account credits through its read-only, account-authorized MCP connection."""

import base64
import hashlib
import json
import re
import secrets
import time
from datetime import UTC, date, datetime
from urllib.parse import urlencode
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from cryptography.fernet import Fernet, InvalidToken
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ProviderOAuthConnection

MCP_URL = "https://mcp.predis.ai/mcp"
AUTH_METADATA_URL = "https://mcp.predis.ai/.well-known/oauth-authorization-server"
PROTOCOL = "2025-06-18"
PROVIDER = "predis"
_redis = Redis.from_url(settings.redis_url, socket_connect_timeout=2, socket_timeout=2)


class PredisConnectionError(Exception):
    """Safe account connection failure. Do not expose provider responses or tokens."""


def _cipher() -> Fernet:
    try:
        return Fernet(settings.predis_oauth_encryption_key.encode())
    except (ValueError, TypeError) as exc:
        raise PredisConnectionError("Configure PREDIS_OAUTH_ENCRYPTION_KEY first") from exc


def _redirect_uri() -> str:
    origin = settings.public_app_url.rstrip("/")
    if not origin.startswith("https://") and settings.app_env == "production":
        raise PredisConnectionError("PUBLIC_APP_URL must use HTTPS")
    if not origin.startswith(("https://", "http://")):
        raise PredisConnectionError("Configure PUBLIC_APP_URL first")
    return f"{origin}/api/v1/predis/oauth/callback"


def _metadata(client: httpx.Client) -> dict:
    response = client.get(AUTH_METADATA_URL)
    response.raise_for_status()
    data = response.json()
    if data.get("issuer") != "https://mcp.predis.ai":
        raise PredisConnectionError("Predis authorization server could not be verified")
    return data


def start_connection(user_id: str, session_id: str) -> str:
    _cipher()
    redirect_uri = _redirect_uri()
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    state = secrets.token_urlsafe(32)
    registration_key = "predis-oauth-client:" + hashlib.sha256(redirect_uri.encode()).hexdigest()
    try:
        with httpx.Client(timeout=12) as client:
            metadata = _metadata(client)
            cached = _redis.get(registration_key)
            if cached:
                client_id = cached.decode()
            else:
                registration = client.post(
                    metadata["registration_endpoint"],
                    json={
                        "client_name": "BookLender Studio",
                        "redirect_uris": [redirect_uri],
                        "grant_types": ["authorization_code", "refresh_token"],
                        "response_types": ["code"],
                        "token_endpoint_auth_method": "none",
                        "scope": "studio.read",
                    },
                )
                registration.raise_for_status()
                client_id = registration.json()["client_id"]
                _redis.setex(registration_key, 60 * 60 * 24 * 30, client_id)
        _redis.setex(
            f"predis-oauth:{state}",
            600,
            json.dumps(
                {
                    "verifier": verifier,
                    "client_id": client_id,
                    "user_id": user_id,
                    "session_id": session_id,
                    "redirect_uri": redirect_uri,
                }
            ),
        )
    except (httpx.HTTPError, RedisError, ValueError, KeyError, TypeError) as exc:
        raise PredisConnectionError("Could not start Predis sign-in. Try again later") from exc
    return (
        metadata["authorization_endpoint"]
        + "?"
        + urlencode(
            {
                "response_type": "code",
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "scope": "studio.read",
                "resource": MCP_URL,
                "state": state,
            }
        )
    )


def finish_connection(
    db: Session, *, state: str, code: str, issuer: str | None, user_id: str, session_id: str
) -> None:
    if issuer and issuer != "https://mcp.predis.ai":
        raise PredisConnectionError("Predis sign-in returned an unexpected issuer")
    if not state or not code:
        raise PredisConnectionError("Predis sign-in was cancelled")
    key = f"predis-oauth:{state}"
    try:
        raw = _redis.getdel(key)
    except Exception as exc:
        raise PredisConnectionError("Predis sign-in state is unavailable") from exc
    if not raw:
        raise PredisConnectionError("Predis sign-in expired. Connect again")
    pending = json.loads(raw)
    if pending["user_id"] != user_id or pending["session_id"] != session_id:
        raise PredisConnectionError("Predis sign-in session changed. Connect again")
    try:
        with httpx.Client(timeout=12) as client:
            metadata = _metadata(client)
            response = client.post(
                metadata["token_endpoint"],
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": pending["redirect_uri"],
                    "client_id": pending["client_id"],
                    "code_verifier": pending["verifier"],
                    "resource": MCP_URL,
                },
            )
            response.raise_for_status()
            token = response.json()
        if not token.get("access_token"):
            raise ValueError("Missing access token")
        credentials = {
            "client_id": pending["client_id"],
            "access_token": token["access_token"],
            "refresh_token": token.get("refresh_token"),
            "expires_at": time.time() + int(token.get("expires_in") or 3600),
        }
        encrypted = _cipher().encrypt(json.dumps(credentials).encode()).decode()
        connection = db.get(ProviderOAuthConnection, PROVIDER)
        if connection is None:
            connection = ProviderOAuthConnection(provider=PROVIDER, encrypted_credentials=encrypted)
            db.add(connection)
        else:
            connection.encrypted_credentials = encrypted
        connection.connected_by = UUID(user_id)
        db.commit()
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise PredisConnectionError("Predis sign-in could not be completed. Connect again") from exc


def disconnect(db: Session) -> None:
    connection = db.get(ProviderOAuthConnection, PROVIDER)
    if connection:
        db.delete(connection)
        db.commit()


def _credentials(db: Session, connection: ProviderOAuthConnection) -> dict:
    try:
        credentials = json.loads(_cipher().decrypt(connection.encrypted_credentials.encode()))
    except (InvalidToken, ValueError, TypeError) as exc:
        raise PredisConnectionError("Predis connection needs to be reconnected") from exc
    if credentials.get("expires_at", 0) > time.time() + 60:
        return credentials
    if not credentials.get("refresh_token"):
        raise PredisConnectionError("Predis session expired. Connect again")
    try:
        with httpx.Client(timeout=12) as client:
            metadata = _metadata(client)
            response = client.post(
                metadata["token_endpoint"],
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": credentials["refresh_token"],
                    "client_id": credentials["client_id"],
                    "resource": MCP_URL,
                },
            )
            response.raise_for_status()
            token = response.json()
        credentials["access_token"] = token["access_token"]
        credentials["refresh_token"] = token.get("refresh_token") or credentials["refresh_token"]
        credentials["expires_at"] = time.time() + int(token.get("expires_in") or 3600)
        connection.encrypted_credentials = (
            _cipher().encrypt(json.dumps(credentials).encode()).decode()
        )
        db.commit()
        return credentials
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise PredisConnectionError("Predis session expired. Connect again") from exc


def _rpc(
    client: httpx.Client,
    token: str,
    method: str,
    request_id: int | None,
    params: dict | None = None,
    session_id: str | None = None,
) -> tuple[dict, str | None]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": PROTOCOL,
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    payload = {"jsonrpc": "2.0", "method": method}
    if request_id is not None:
        payload["id"] = request_id
    if params is not None:
        payload["params"] = params
    response = client.post(MCP_URL, json=payload, headers=headers)
    response.raise_for_status()
    if request_id is None:
        return {}, response.headers.get("Mcp-Session-Id") or session_id
    if "text/event-stream" in response.headers.get("content-type", ""):
        events = [
            line[5:].strip() for line in response.text.splitlines() if line.startswith("data:")
        ]
        data = next((json.loads(item) for item in events if item and item != "[DONE]"), {})
    else:
        data = response.json()
    if "error" in data:
        raise PredisConnectionError("Predis account did not return credit information")
    return data.get("result") or {}, response.headers.get("Mcp-Session-Id") or session_id


def _credit_number(value) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (ValueError, TypeError):
        return None
    return number if 0 <= number < 1_000_000_000 else None


def _extract_balance(value, depth: int = 0) -> float | None:
    """Accept an explicitly named remaining balance, never a plan allowance or price."""
    if depth > 5:
        return None
    if isinstance(value, dict):
        # Some account tools group the balance under a `credits` object and call the
        # nested field simply `remaining` or `available`.
        for key, amount in value.items():
            if key.casefold().replace("_", "").replace("-", "") in {"credit", "credits"} and isinstance(amount, dict):
                for nested_key, nested_amount in amount.items():
                    if nested_key.casefold().replace("_", "").replace("-", "") in {
                        "remaining", "available", "left", "balance",
                    }:
                        number = _credit_number(nested_amount)
                        if number is not None:
                            return number
        for key, amount in value.items():
            normalized = key.casefold().replace("_", "").replace("-", "")
            if normalized in {
                "remainingcredits",
                "creditsremaining",
                "availablecredits",
                "creditavailable",
                "remainingcredit",
                "creditsleft",
                "creditleft",
                "creditbalance",
                "balancecredits",
                "currentcreditbalance",
            }:
                number = _credit_number(amount)
                if number is not None:
                    return number
        for item in value.values():
            number = _extract_balance(item, depth + 1)
            if number is not None:
                return number
    elif isinstance(value, list):
        for item in value:
            number = _extract_balance(item, depth + 1)
            if number is not None:
                return number
    return None


def _text_balance(value: str) -> float | None:
    match = re.search(
        r"(?:remaining|available|balance)\s+(?:ai\s+)?credits?\s*[:=]\s*([\d,]+(?:\.\d+)?)",
        value,
        re.I,
    )
    if not match:
        match = re.search(
            r"credits?\s+(?:remaining|available|balance)\s*[:=]\s*([\d,]+(?:\.\d+)?)", value, re.I
        )
    return _credit_number(match.group(1).replace(",", "")) if match else None


def _tool_data(output: dict) -> list:
    """Return structured MCP values and any JSON-encoded text content."""
    if output.get("structuredContent") is not None:
        return [output["structuredContent"]]
    values = [{key: item for key, item in output.items() if key != "content"}]
    for block in output.get("content", []):
        if block.get("type") != "text":
            continue
        content = block.get("text") or ""
        try:
            values.append(json.loads(content))
        except ValueError:
            values.append(content)
    return values


def _safe_tool_arguments(tool: dict, days: list[str]) -> dict | None:
    """Fill only conventional read-query parameters; skip tools needing unknown input."""
    schema = tool.get("inputSchema") or {}
    properties = schema.get("properties") or {}
    args = {}
    for field in schema.get("required") or []:
        normalized = str(field).casefold().replace("_", "").replace("-", "")
        spec = properties.get(field) or {}
        if "default" in spec:
            args[field] = spec["default"]
        elif normalized in {"limit", "pagesize", "perpage", "maxresults"}:
            args[field] = 100
        elif normalized in {"page", "pagenumber", "offset"}:
            args[field] = 1 if normalized != "offset" else 0
        elif normalized in {"from", "start", "startdate", "fromdate", "since"} and days:
            args[field] = days[0]
        elif normalized in {"to", "end", "enddate", "todate", "until"} and days:
            args[field] = days[-1]
        elif spec.get("enum"):
            args[field] = spec["enum"][0]
        else:
            return None
    return args


def _usage_records(value, zone: ZoneInfo, seen: set | None = None, depth: int = 0) -> list[tuple[date, float]]:
    """Read only explicit per-run credit charges; do not treat plan balance as spend."""
    if depth > 8:
        return []
    if seen is None:
        seen = set()
    records = []
    if isinstance(value, dict):
        normalized = {str(key).casefold().replace("_", "").replace("-", ""): item
                      for key, item in value.items()}
        amount = next((normalized[key] for key in (
            "creditsused", "creditused", "creditsconsumed", "creditconsumed",
            "creditcost", "creditscharged", "creditcharged", "usedcredits",
        ) if key in normalized), None)
        timestamp = next((normalized[key] for key in (
            "createdat", "completedat", "updatedat", "timestamp", "date", "created",
        ) if key in normalized), None)
        number = _credit_number(amount)
        if number is not None and timestamp is not None:
            try:
                if isinstance(timestamp, (int, float)):
                    moment = datetime.fromtimestamp(timestamp, tz=UTC)
                else:
                    raw = str(timestamp).strip()
                    if len(raw) == 10:
                        day = date.fromisoformat(raw)
                        identity = next((normalized[name] for name in ("id", "runid", "jobid", "postid")
                                         if normalized.get(name) is not None), None)
                        key = (str(identity) if identity is not None else json.dumps(
                            {name: item for name, item in normalized.items()
                             if isinstance(item, (str, int, float, bool, type(None)))},
                            sort_keys=True, default=str))
                        if key not in seen:
                            seen.add(key)
                            records.append((day, number))
                        moment = None
                    else:
                        moment = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                if moment is not None:
                    if moment.tzinfo is None:
                        moment = moment.replace(tzinfo=UTC)
                    day = moment.astimezone(zone).date()
                    identity = next((normalized[name] for name in ("id", "runid", "jobid", "postid")
                                     if normalized.get(name) is not None), None)
                    key = (str(identity) if identity is not None else json.dumps(
                        {name: item for name, item in normalized.items()
                         if isinstance(item, (str, int, float, bool, type(None)))},
                        sort_keys=True, default=str))
                    if key not in seen:
                        seen.add(key)
                        records.append((day, number))
            except (OverflowError, OSError, TypeError, ValueError):
                pass
        for item in value.values():
            records.extend(_usage_records(item, zone, seen, depth + 1))
    elif isinstance(value, list):
        for item in value:
            records.extend(_usage_records(item, zone, seen, depth + 1))
    return records


def read_predis_data(db: Session, days: list[str], timezone: str) -> dict:
    result = {
        "remainingCredits": None, "balanceStatus": "not_connected", "balanceSource": None,
        "dailyAccountCredits": [0.0] * len(days), "accountCredits": 0.0,
        "accountCreditReports": 0, "historyStatus": "not_connected",
    }
    connection = db.get(ProviderOAuthConnection, PROVIDER)
    if connection is None:
        return result
    result["balanceStatus"] = "unavailable"
    try:
        credentials = _credentials(db, connection)
        with httpx.Client(timeout=12) as client:
            initialized, session_id = _rpc(
                client,
                credentials["access_token"],
                "initialize",
                1,
                {
                    "protocolVersion": PROTOCOL,
                    "capabilities": {},
                    "clientInfo": {"name": "BookLender Studio", "version": "1.0"},
                },
            )
            if not initialized:
                return result
            _rpc(
                client,
                credentials["access_token"],
                "notifications/initialized",
                None,
                session_id=session_id,
            )
            tools, session_id = _rpc(
                client, credentials["access_token"], "tools/list", 2, session_id=session_id
            )
            available = tools.get("tools", [])
            balance_tools = []
            history_tools = []
            for tool in available:
                name = str(tool.get("name") or "").casefold()
                description = str(tool.get("description") or "").casefold()
                schema = tool.get("inputSchema") or {}
                annotations = tool.get("annotations") or {}
                if annotations.get("readOnlyHint") is False:
                    continue
                if any(
                    word in name
                    for word in ("create", "generate", "charge", "deduct", "purchase", "update")
                ):
                    continue
                searchable = f"{name} {description}"
                compact_name = name.replace("_", "").replace("-", "")
                is_history_tool = compact_name in {"listruns", "getruns", "listgenerations"}
                if not is_history_tool and (compact_name in {"getaccount", "accountinfo", "getaccountinfo"} or any(
                    word in searchable for word in ("credit", "balance", "account usage")
                )):
                    balance_tools.append(tool)
                if name in {"list_runs", "listruns", "get_runs", "list_generations"} or any(
                    word in searchable for word in ("credit history", "usage history", "generation history")
                ):
                    history_tools.append(tool)

            # Predis exposes account information under get_account on some MCP clients;
            # that name does not contain "credit" or "balance", so include it explicitly.
            balance_calls = 0
            for tool in balance_tools:
                arguments = _safe_tool_arguments(tool, days)
                if arguments is None:
                    continue
                balance_calls += 1
                try:
                    output, session_id = _rpc(
                        client,
                        credentials["access_token"],
                        "tools/call",
                        3,
                        {"name": tool["name"], "arguments": arguments},
                        session_id,
                    )
                except (PredisConnectionError, httpx.HTTPError, ValueError, KeyError, TypeError):
                    continue
                if output.get("isError"):
                    continue
                balance = None
                for value in _tool_data(output):
                    balance = _extract_balance(value)
                    if balance is None and isinstance(value, str):
                        balance = _text_balance(value)
                    if balance is not None:
                        break
                if balance is not None:
                    result.update(remainingCredits=balance, balanceStatus="ok",
                                  balanceSource="Predis MCP account")
                    break
            if result["balanceStatus"] != "ok":
                result["balanceStatus"] = "balance_value_unrecognized" if balance_calls else "balance_tool_unavailable"

            if history_tools and days:
                zone = ZoneInfo(timezone)
                first_day = date.fromisoformat(days[0]) if days else date.today()
                totals = {day: 0.0 for day in days}
                seen = set()
                report_count = 0
                for tool in history_tools:
                    arguments = _safe_tool_arguments(tool, days)
                    if arguments is None:
                        continue
                    try:
                        output, session_id = _rpc(
                            client, credentials["access_token"], "tools/call", 4,
                            {"name": tool["name"], "arguments": arguments}, session_id,
                        )
                    except (PredisConnectionError, httpx.HTTPError, ValueError, KeyError, TypeError):
                        continue
                    if output.get("isError"):
                        continue
                    for value in _tool_data(output):
                        records = _usage_records(value, zone, seen)
                        for day, amount in records:
                            day_key = day.isoformat()
                            if day_key in totals and day >= first_day:
                                totals[day_key] += amount
                                report_count += 1
                result["dailyAccountCredits"] = [totals[day] for day in days]
                result["accountCredits"] = sum(totals.values())
                result["accountCreditReports"] = report_count
                result["historyStatus"] = "ok" if result["accountCreditReports"] else "no_reported_charges"
            else:
                result["historyStatus"] = "history_tool_unavailable"
    except PredisConnectionError:
        result["balanceStatus"] = "reconnect_required"
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        result["balanceStatus"] = "unavailable"
    return result


def read_predis_balance(db: Session) -> dict:
    """Backward-compatible balance reader for callers that do not need usage history."""
    report = read_predis_data(db, [], "UTC")
    return {key: report[key] for key in ("remainingCredits", "balanceStatus", "balanceSource")}
