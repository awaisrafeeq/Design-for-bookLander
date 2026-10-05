"""Official provider APIs. Only this module knows their request/response shapes."""
import json
import httpx
from app.config import settings


class ProviderError(Exception):
    def __init__(self, provider: str, status: int = 0, *, ambiguous: bool = False):
        self.provider, self.status, self.ambiguous = provider, status, ambiguous
        super().__init__(f"{provider}: " + (f"HTTP {status}" if status else "connection interrupted"))

    @property
    def fix(self):
        if self.ambiguous:
            return "Check the provider dashboard before retrying: this request may already have been accepted."
        return {401: "Check the server API credentials.", 403: "Check API entitlement and account permissions.",
                429: "Provider rate limit reached. Wait before retrying.",
                400: "Check the selected account, media requirements and provider credits.",
                409: "Check the existing provider post; do not create a duplicate."}.get(
                    self.status, "Check provider availability and configuration, then retry.")


def call(provider: str, method: str, url: str, **kwargs) -> dict:
    try:
        with httpx.Client(timeout=90, follow_redirects=False) as client:
            response = client.request(method, url, **kwargs)
    except httpx.RequestError as exc:
        raise ProviderError(provider, ambiguous=method == "POST") from exc
    if not response.is_success:
        raise ProviderError(provider, response.status_code, ambiguous=method == "POST" and response.status_code >= 500)
    if response.status_code == 204 or (method == "DELETE" and not response.content):
        return {}
    try:
        data = response.json()
    except ValueError as exc:
        raise ProviderError(provider, ambiguous=method == "POST") from exc
    if not isinstance(data, dict):
        raise ProviderError(provider)
    return data


class Zernio:
    base = "https://zernio.com/api/v1"

    def request(self, method: str, path: str, *, key: str | None = None, **kwargs):
        if not settings.zernio_api_key:
            raise ValueError("Set ZERNIO_API_KEY on the server first.")
        headers = {"Authorization": f"Bearer {settings.zernio_api_key}"}
        if key:
            headers["Idempotency-Key"] = key
        return call("Zernio", method, self.base + path, headers=headers, **kwargs)

    def accounts(self):
        params = {"profileId": settings.zernio_profile_id} if settings.zernio_profile_id else {}
        return self.request("GET", "/accounts", params=params).get("accounts", [])

    def schedule(self, body: dict, key: str):
        return self.request("POST", "/posts", key=key, json=body)

    def post(self, post_id: str):
        return self.request("GET", f"/posts/{post_id}")

    def cancel(self, post_id: str):
        try:
            return self.request("DELETE", f"/posts/{post_id}")
        except ProviderError as exc:
            if exc.status == 404:
                return {}
            raise

    def reschedule(self, post_id: str, body: dict):
        return self.request("PUT", f"/posts/{post_id}", json=body)

    def retry(self, post_id: str):
        return self.request("POST", f"/posts/{post_id}/retry", json={})


def text_completion(prompt: str, instruction: str):
    if not settings.openrouter_api_key or not settings.openrouter_model:
        raise ValueError("Set OPENROUTER_API_KEY and OPENROUTER_MODEL on the server first.")
    response = call("OpenRouter", "POST", "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
        json={"model": settings.openrouter_model, "max_tokens": 1600,
              "response_format": {"type": "json_object"},
              "messages": [{"role": "system", "content": instruction}, {"role": "user", "content": prompt}]})
    # Keep the charged usage even if output validation fails downstream.
    content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
    return content, response.get("usage", {}), response.get("id")


def predis_create(brief: str, format_name: str):
    if not settings.predis_api_key or not settings.predis_brand_id:
        raise ValueError("Set PREDIS_API_KEY and PREDIS_BRAND_ID first.")
    fields = {"brand_id": settings.predis_brand_id, "text": brief,
              "media_type": "carousel" if format_name == "carousel" else "single_image", "model_version": "4", "n_posts": "1"}
    response = call("Predis", "POST", "https://brain.predis.ai/predis_api/v1/create_content/",
                    headers={"Authorization": settings.predis_api_key}, files={k: (None, v) for k, v in fields.items()})
    if response.get("errors") or not response.get("post_ids"):
        raise ProviderError("Predis", 400)
    return response["post_ids"][0]


def predis_result(post_id: str, format_name: str):
    media_type = "carousel" if format_name == "carousel" else "single_image"
    for page in range(1, 51):
        response = call("Predis", "GET", "https://brain.predis.ai/predis_api/v1/get_posts/",
            headers={"Authorization": settings.predis_api_key},
            params={"brand_id": settings.predis_brand_id, "media_type": media_type,
                    "page_n": page, "items_n": 20})
        if response.get("errors"):
            raise ProviderError("Predis", 400)
        for post in response.get("posts", []):
            if post.get("post_id") == post_id:
                return post
        if page >= response.get("total_pages", 1):
            break
    return None


def creatify_tts_create(script: str):
    if not all((settings.creatify_api_id, settings.creatify_api_key)):
        raise ValueError("Set CREATIFY_API_ID and CREATIFY_API_KEY first.")
    return call("Creatify", "POST", "https://api.creatify.ai/api/text_to_speech/",
        headers={"X-API-ID": settings.creatify_api_id, "X-API-KEY": settings.creatify_api_key},
        json={"script": script})


def creatify_tts_result(job_id: str):
    return call("Creatify", "GET", f"https://api.creatify.ai/api/text_to_speech/{job_id}/",
        headers={"X-API-ID": settings.creatify_api_id, "X-API-KEY": settings.creatify_api_key})


def creatify_create(prompt: str, audio_url: str, duration: int = 15):
    if not all((settings.creatify_api_id, settings.creatify_api_key)):
        raise ValueError("Set CREATIFY_API_ID and CREATIFY_API_KEY first.")
    return call("Creatify", "POST", "https://api.creatify.ai/api/boreal/",
        headers={"X-API-ID": settings.creatify_api_id, "X-API-KEY": settings.creatify_api_key},
        json={"prompt": prompt, "audio_url": audio_url, "resolution": "720p",
              "aspect_ratio": "9:16", "duration": max(10, min(60, int(duration))),
              "negative_prompt": "Any visible text or typography, subtitles, captions, title cards, labels, signs, letters, words, numbers, logos, watermarks, gibberish text, misspelled words"})


def creatify_result(job_id: str):
    return call("Creatify", "GET", f"https://api.creatify.ai/api/boreal/{job_id}/",
        headers={"X-API-ID": settings.creatify_api_id, "X-API-KEY": settings.creatify_api_key})
