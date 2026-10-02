"""Persistent media with byte validation and signed provider download URLs."""
import hashlib
import hmac
import ipaddress
import json
import socket
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from PIL import Image
from app.config import settings
from app.models import MediaAsset


def root() -> Path:
    path = Path(settings.media_root)
    path.mkdir(parents=True, exist_ok=True)
    return path


def validate_file(path: Path) -> tuple[str, str, dict]:
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("Upload a JPEG, PNG or WebP image.")
            return "image", Image.MIME[image.format], {"width": image.width, "height": image.height}
    except (OSError, Image.DecompressionBombError):
        pass
    try:
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
                               capture_output=True, timeout=15, check=True)
        data = json.loads(probe.stdout)
        video = next(stream for stream in data["streams"] if stream["codec_type"] == "video")
        if video["codec_name"] not in {"h264", "hevc", "vp8", "vp9"}:
            raise ValueError("Unsupported video codec. Upload an MP4 or WebM video.")
        name = data["format"]["format_name"]
        if not any(format_name in name for format_name in ("mp4", "mov", "webm")):
            raise ValueError("Upload an MP4, MOV or WebM video.")
        return "video", "video/webm" if "webm" in name else "video/mp4", {
            "width": video["width"], "height": video["height"], "duration": float(data["format"]["duration"])}
    except (FileNotFoundError, subprocess.SubprocessError, KeyError, StopIteration, ValueError) as exc:
        raise ValueError("Invalid media. Upload a valid JPEG/PNG/WebP image or MP4/WebM video.") from exc


def asset_from_file(db, post_id: int, path: Path) -> MediaAsset:
    kind, mime, metadata = validate_file(path)
    asset = MediaAsset(id=uuid4(), post_id=post_id, kind=kind, mime=mime, filename=path.name,
                       size=path.stat().st_size, metadata_json=metadata)
    db.add(asset)
    db.flush()
    return asset


def asset_dto(asset: MediaAsset):
    return {"id": str(asset.id), "type": asset.kind, "url": f"/api/studio/media/{asset.id}",
            "mime": asset.mime, "size": asset.size, **asset.metadata_json}


def public_url(asset: MediaAsset, scheduled_at: datetime):
    if not settings.public_app_url or not settings.media_signing_key:
        raise ValueError("Set PUBLIC_APP_URL and MEDIA_SIGNING_KEY before sending media to Zernio.")
    expires = int((max(datetime.now(UTC), scheduled_at) + timedelta(days=7)).timestamp())
    digest = hmac.new(settings.media_signing_key.encode(), f"{asset.id}:{expires}".encode(), hashlib.sha256).hexdigest()
    return f"{settings.public_app_url.rstrip('/')}{settings.api_prefix}/media/public/{asset.id}?expires={expires}&signature={digest}"


def verify_signature(asset_id: str, expires: int, signature: str):
    if not settings.media_signing_key or expires < datetime.now(UTC).timestamp():
        return False
    digest = hmac.new(settings.media_signing_key.encode(), f"{asset_id}:{expires}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


def download_asset(db, post_id: int, url: str):
    # Only provider outputs reach this function; reject private destinations and redirects.
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.port not in {None, 443}:
        raise ValueError("Provider returned an invalid HTTPS media URL.")
    addresses = socket.getaddrinfo(parsed.hostname, 443)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError("Provider returned a private media destination.")
    path = root() / f"{uuid4().hex}.asset"
    try:
        with httpx.stream("GET", url, timeout=90, follow_redirects=False) as response:
            response.raise_for_status()
            size = 0
            with path.open("wb") as target:
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > settings.media_max_upload_mb * 1024 * 1024:
                        raise ValueError("Generated file exceeds the media size limit.")
                    target.write(chunk)
        return asset_from_file(db, post_id, path)
    except Exception:
        path.unlink(missing_ok=True)
        raise
