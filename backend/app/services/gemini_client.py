import json
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import requests

from app.core.enums import AIProviderDriver
from app.models.ai_provider import AIProvider
from app.services.provider_urls import ProviderUrlValidationError, resolve_provider_base_url
from app.services.secrets import decrypt_secret


class GeminiClientError(RuntimeError):
    pass


@dataclass(slots=True)
class GeminiUploadedFile:
    name: str
    uri: str
    mime_type: str


def resolve_provider_config(provider: AIProvider) -> tuple[str, str]:
    if provider.driver != AIProviderDriver.GEMINI:
        raise GeminiClientError("Selected provider is not a Gemini provider.")

    api_key = decrypt_secret(provider.api_key_encrypted)
    if not api_key:
        raise GeminiClientError("Gemini provider does not have a valid API key.")

    try:
        base_url = resolve_provider_base_url(kind=provider.kind, driver=provider.driver, value=provider.base_url)
    except ProviderUrlValidationError as exc:
        raise GeminiClientError(str(exc)) from exc

    if not base_url:
        raise GeminiClientError("Gemini provider does not have a valid base URL.")

    return base_url.rstrip("/"), api_key


def assert_provider_ready(provider: AIProvider) -> None:
    resolve_provider_config(provider)


def _upload_base_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    return urlunparse((parsed.scheme, parsed.netloc, f"/upload{parsed.path.rstrip('/')}", "", "", ""))


def upload_file(provider: AIProvider, file_path: Path, *, mime_type: str, display_name: str) -> GeminiUploadedFile:
    base_url, api_key = resolve_provider_config(provider)
    upload_base = _upload_base_url(base_url)
    file_size = file_path.stat().st_size

    start_response = requests.post(
        f"{upload_base}/files",
        headers={
            "x-goog-api-key": api_key,
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(file_size),
            "X-Goog-Upload-Header-Content-Type": mime_type,
            "Content-Type": "application/json",
        },
        json={"file": {"display_name": display_name[:120]}},
        timeout=60,
    )
    if not start_response.ok:
        raise GeminiClientError("Gemini file upload could not be initialized.")

    upload_url = start_response.headers.get("x-goog-upload-url")
    if not upload_url:
        raise GeminiClientError("Gemini file upload URL was not returned.")

    with file_path.open("rb") as handle:
        upload_response = requests.post(
            upload_url,
            headers={
                "Content-Length": str(file_size),
                "X-Goog-Upload-Offset": "0",
                "X-Goog-Upload-Command": "upload, finalize",
            },
            data=handle,
            timeout=180,
        )
    if not upload_response.ok:
        raise GeminiClientError("Gemini file upload failed.")

    payload = upload_response.json()
    file_info = payload.get("file") or {}
    name = str(file_info.get("name") or "").strip()
    uri = str(file_info.get("uri") or "").strip()
    uploaded_mime_type = str(file_info.get("mimeType") or mime_type).strip()
    if not name or not uri:
        raise GeminiClientError("Gemini upload response was incomplete.")

    return GeminiUploadedFile(name=name, uri=uri, mime_type=uploaded_mime_type)


def delete_file(provider: AIProvider, uploaded: GeminiUploadedFile | None) -> None:
    if uploaded is None:
        return

    try:
        base_url, api_key = resolve_provider_config(provider)
    except GeminiClientError:
        return

    requests.delete(
        f"{base_url}/{uploaded.name}",
        headers={"x-goog-api-key": api_key},
        timeout=30,
    )


def generate_json(
    provider: AIProvider,
    *,
    parts: list[dict[str, object]],
    response_schema: dict[str, object],
    temperature: float = 0.2,
) -> dict[str, object]:
    base_url, api_key = resolve_provider_config(provider)

    response = requests.post(
        f"{base_url}/models/{provider.model_name}:generateContent",
        headers={
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        },
        json={
            "contents": [
                {
                    "role": "user",
                    "parts": parts,
                }
            ],
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
                "responseJsonSchema": response_schema,
            },
        },
        timeout=180,
    )
    if not response.ok:
        detail = (response.text or "").strip()
        raise GeminiClientError(detail or "Gemini generateContent request failed.")

    payload = response.json()
    try:
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise GeminiClientError("Gemini returned an unreadable JSON payload.") from exc

    if not isinstance(data, dict):
        raise GeminiClientError("Gemini returned an unexpected response shape.")
    return data
