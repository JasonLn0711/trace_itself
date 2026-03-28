import json
from dataclasses import dataclass

import requests

from app.core.enums import AIProviderDriver
from app.models.ai_provider import AIProvider
from app.services.provider_urls import ProviderUrlValidationError, resolve_provider_base_url
from app.services.secrets import decrypt_secret


class MeetingAiError(RuntimeError):
    pass


@dataclass(slots=True)
class MeetingArtifacts:
    summary_text: str
    minutes_text: str
    action_items_text: str
    model_name: str


def build_meeting_prompt(transcript_text: str, title: str, structured_transcript_text: str | None = None) -> str:
    transcript_label = "Speaker-attributed transcript" if structured_transcript_text else "Transcript"
    transcript_body = structured_transcript_text or transcript_text
    return (
        "You are a precise meeting assistant.\n"
        f"Meeting title: {title}\n\n"
        "Read the transcript and return JSON with:\n"
        "- summary_text: 3 to 5 sentences\n"
        "- minutes_text: concise chronological minutes\n"
        "- action_items: array of clear next-step tasks\n\n"
        "If speaker labels are present, preserve who said what when it matters.\n"
        "If something is uncertain, keep it cautious and factual.\n\n"
        f"{transcript_label}:\n{transcript_body}"
    )


def generate_meeting_artifacts(
    transcript_text: str,
    title: str,
    provider: AIProvider,
    *,
    structured_transcript_text: str | None = None,
) -> MeetingArtifacts:
    if provider.driver != AIProviderDriver.GEMINI:
        raise MeetingAiError("Selected LLM provider is not supported yet.")

    api_key = decrypt_secret(provider.api_key_encrypted)
    if not api_key:
        raise MeetingAiError("Selected LLM provider does not have a valid API key.")

    response_schema = {
        "type": "object",
        "properties": {
            "summary_text": {"type": "string"},
            "minutes_text": {"type": "string"},
            "action_items": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": ["summary_text", "minutes_text", "action_items"],
    }

    try:
        base_url = resolve_provider_base_url(kind=provider.kind, driver=provider.driver, value=provider.base_url)
    except ProviderUrlValidationError as exc:
        raise MeetingAiError(str(exc)) from exc
    if not base_url:
        raise MeetingAiError("Selected LLM provider does not have a valid base URL.")
    response = requests.post(
        f"{base_url}/models/{provider.model_name}:generateContent",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        json={
            "contents": [
                {
                    "parts": [
                        {
                            "text": build_meeting_prompt(
                                transcript_text,
                                title,
                                structured_transcript_text=structured_transcript_text,
                            ),
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
                "responseJsonSchema": response_schema,
            },
        },
        timeout=120,
    )
    if not response.ok:
        raise MeetingAiError("The selected LLM provider request failed.")

    payload = response.json()
    try:
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise MeetingAiError("Gemini returned an unreadable meeting summary payload.") from exc

    action_items = [item.strip() for item in data.get("action_items", []) if isinstance(item, str) and item.strip()]
    summary_text = (data.get("summary_text") or "").strip()
    minutes_text = (data.get("minutes_text") or "").strip()
    if not summary_text or not minutes_text:
        raise MeetingAiError("Gemini returned an incomplete meeting summary.")

    return MeetingArtifacts(
        summary_text=summary_text,
        minutes_text=minutes_text,
        action_items_text="\n".join(f"- {item}" for item in action_items),
        model_name=provider.model_name,
    )
