from dataclasses import dataclass
from pathlib import Path

from app.models.ai_provider import AIProvider
from app.models.user import User
from app.services.gemini_client import GeminiClientError, delete_file, generate_json, upload_file


class NutritionAiError(RuntimeError):
    pass


@dataclass(slots=True)
class NutritionTranscriptResult:
    transcript_text: str
    language_code: str | None


def _profile_lines(user: User) -> list[str]:
    return [
        f"- Goal: {user.goal_type or 'unknown'}",
        f"- Region: {user.location_region or 'unknown'}",
        f"- Allergies: {', '.join(user.allergies or []) or 'none'}",
        f"- Dietary preferences: {', '.join(user.dietary_preferences or []) or 'none'}",
        f"- Disliked foods: {', '.join(user.disliked_foods or []) or 'none'}",
    ]


def transcribe_meal_audio(
    provider: AIProvider,
    *,
    audio_path: Path,
    mime_type: str,
) -> NutritionTranscriptResult:
    uploaded_audio = None
    response_schema = {
        "type": "object",
        "properties": {
            "transcript_text": {"type": "string"},
            "language_code": {"type": "string"},
        },
        "required": ["transcript_text"],
    }

    try:
        uploaded_audio = upload_file(
            provider,
            audio_path,
            mime_type=mime_type,
            display_name=audio_path.name,
        )
        payload = generate_json(
            provider,
            parts=[
                {
                    "text": (
                        "Transcribe this meal-description audio for a nutrition tracking app. "
                        "Return only the spoken transcript. Preserve food names, quantities, sugar levels, and modifiers like 去皮 or 加醬. "
                        "Do not summarize."
                    )
                },
                {
                    "file_data": {
                        "mime_type": uploaded_audio.mime_type,
                        "file_uri": uploaded_audio.uri,
                    }
                },
            ],
            response_schema=response_schema,
            temperature=0.1,
        )
    except GeminiClientError as exc:
        raise NutritionAiError(str(exc)) from exc
    finally:
        delete_file(provider, uploaded_audio)

    transcript_text = str(payload.get("transcript_text") or "").strip()
    language_code = str(payload.get("language_code") or "").strip() or None
    if not transcript_text:
        raise NutritionAiError("Gemini did not return a transcript.")

    return NutritionTranscriptResult(
        transcript_text=transcript_text,
        language_code=language_code,
    )


def analyze_meal_multimodal(
    provider: AIProvider,
    *,
    meal_type: str,
    transcript_text: str | None,
    extra_text: str | None,
    image_path: Path | None,
    image_mime_type: str | None,
    user: User,
) -> dict[str, object]:
    uploaded_image = None
    response_schema = {
        "type": "object",
        "properties": {
            "meal_type": {"type": "string"},
            "foods": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "portion_label": {"type": "string"},
                        "quantity": {"type": "number"},
                        "unit": {"type": "string"},
                        "confidence": {"type": "number"},
                        "uncertain": {"type": "boolean"},
                        "notes": {"type": "string"},
                    },
                    "required": ["name"],
                },
            },
            "beverages": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "portion_label": {"type": "string"},
                        "quantity": {"type": "number"},
                        "unit": {"type": "string"},
                        "confidence": {"type": "number"},
                        "uncertain": {"type": "boolean"},
                        "sweetness": {"type": "string"},
                        "notes": {"type": "string"},
                    },
                    "required": ["name"],
                },
            },
            "overall_notes": {"type": "string"},
        },
        "required": ["foods", "beverages", "overall_notes"],
    }

    transcript_block = transcript_text.strip() if transcript_text and transcript_text.strip() else "No transcript available."
    extra_text_block = extra_text.strip() if extra_text and extra_text.strip() else "No extra notes."

    parts: list[dict[str, object]] = [
        {
            "text": (
                "You are a nutrition logging extraction engine for a Taiwan-friendly food tracking app.\n"
                "Analyze this meal conservatively and return strict JSON only.\n"
                "Rules:\n"
                "1. Only include foods visible in the image or explicitly stated in the transcript or notes.\n"
                "2. If something is unclear, set uncertain=true instead of inventing details.\n"
                "3. Prefer Taiwan meal context and common lunchbox interpretations when relevant.\n"
                "4. Do not calculate nutrition values.\n"
                "5. Split beverages separately from foods.\n"
                f"Meal type: {meal_type}\n"
                "User profile:\n"
                + "\n".join(_profile_lines(user))
                + f"\nTranscript:\n{transcript_block}\nExtra notes:\n{extra_text_block}"
            )
        }
    ]

    try:
        if image_path is not None and image_mime_type:
            uploaded_image = upload_file(
                provider,
                image_path,
                mime_type=image_mime_type,
                display_name=image_path.name,
            )
            parts.append(
                {
                    "file_data": {
                        "mime_type": uploaded_image.mime_type,
                        "file_uri": uploaded_image.uri,
                    }
                }
            )

        payload = generate_json(
            provider,
            parts=parts,
            response_schema=response_schema,
            temperature=0.2,
        )
    except GeminiClientError as exc:
        raise NutritionAiError(str(exc)) from exc
    finally:
        delete_file(provider, uploaded_image)

    return payload
