import json
from dataclasses import dataclass

import requests

from app.core.config import get_settings

settings = get_settings()


class MeetingAiError(RuntimeError):
    pass


@dataclass(slots=True)
class MeetingArtifacts:
    summary_text: str
    minutes_text: str
    action_items_text: str
    model_name: str


def build_meeting_prompt(transcript_text: str, title: str) -> str:
    return (
        "You are a precise meeting assistant.\n"
        f"Meeting title: {title}\n\n"
        "Read the transcript and return JSON with:\n"
        "- summary_text: 3 to 5 sentences\n"
        "- minutes_text: concise chronological minutes\n"
        "- action_items: array of clear next-step tasks\n\n"
        "If something is uncertain, keep it cautious and factual.\n\n"
        f"Transcript:\n{transcript_text}"
    )


def generate_meeting_artifacts(transcript_text: str, title: str) -> MeetingArtifacts:
    if not settings.gemini_api_key:
        raise MeetingAiError("GEMINI_API_KEY is not configured.")

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

    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": settings.gemini_api_key,
        },
        json={
            "contents": [
                {
                    "parts": [
                        {
                            "text": build_meeting_prompt(transcript_text, title),
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
        raise MeetingAiError(f"Gemini request failed: {response.text[:500]}")

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
        model_name=settings.gemini_model,
    )
