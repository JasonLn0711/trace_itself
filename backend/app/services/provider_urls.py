from urllib.parse import urlparse, urlunparse

from app.core.enums import AIProviderDriver, AIProviderKind

DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
ALLOWED_GEMINI_HOSTS = {"generativelanguage.googleapis.com"}


class ProviderUrlValidationError(ValueError):
    pass


def normalize_provider_base_url(
    *,
    kind: AIProviderKind,
    driver: AIProviderDriver,
    value: str | None,
) -> str | None:
    cleaned = (value or "").strip()
    if not cleaned:
        return None

    if driver == AIProviderDriver.LOCAL_BREEZE:
        raise ProviderUrlValidationError("Local Breeze providers do not accept a custom base URL.")

    parsed = urlparse(cleaned)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ProviderUrlValidationError("Provider base URL must use HTTPS and include a host.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ProviderUrlValidationError("Provider base URL cannot include credentials, query parameters, or fragments.")

    host = (parsed.hostname or "").lower()
    if driver == AIProviderDriver.GEMINI and host not in ALLOWED_GEMINI_HOSTS:
        raise ProviderUrlValidationError("Gemini providers must use the official Google Generative Language API host.")

    path = (parsed.path or "").rstrip("/") or "/v1beta"
    if driver == AIProviderDriver.GEMINI and not path.startswith("/v1"):
        raise ProviderUrlValidationError("Gemini providers must use an official Google API version path such as /v1beta.")

    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def resolve_provider_base_url(
    *,
    kind: AIProviderKind,
    driver: AIProviderDriver,
    value: str | None,
) -> str | None:
    normalized = normalize_provider_base_url(kind=kind, driver=driver, value=value)
    if normalized:
        return normalized.rstrip("/")
    if driver == AIProviderDriver.GEMINI:
        return DEFAULT_GEMINI_BASE_URL
    return None
