from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, list_available_ai_providers, require_admin
from app.core.enums import AIProviderDriver, AIProviderKind
from app.db.session import get_db
from app.models.ai_provider import AIProvider
from app.models.user import User
from app.schemas.ai_provider import AIProviderCreate, AIProviderRead, AIProviderUpdate
from app.services.provider_urls import ProviderUrlValidationError, normalize_provider_base_url
from app.services.secrets import encrypt_secret, make_secret_hint

router = APIRouter(prefix="/ai-providers", tags=["ai_providers"])


def get_ai_provider_or_404(provider_id: int, db: Session) -> AIProvider:
    provider = db.get(AIProvider, provider_id)
    if not provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI provider not found.")
    return provider


def validate_provider(kind: AIProviderKind, driver: AIProviderDriver) -> None:
    if kind == AIProviderKind.ASR and driver != AIProviderDriver.LOCAL_BREEZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ASR currently supports only local Breeze providers.")
    if kind == AIProviderKind.LLM and driver != AIProviderDriver.GEMINI:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="LLM currently supports only Gemini providers.")


def validate_provider_base_url(kind: AIProviderKind, driver: AIProviderDriver, base_url: str | None) -> str | None:
    try:
        return normalize_provider_base_url(kind=kind, driver=driver, value=base_url)
    except ProviderUrlValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


def apply_api_key(provider: AIProvider, api_key: str | None, *, replace_only_if_present: bool) -> None:
    if api_key is None and replace_only_if_present:
        return
    cleaned = (api_key or "").strip()
    if not cleaned:
        provider.api_key_encrypted = None
        provider.api_key_hint = None
        return
    provider.api_key_encrypted = encrypt_secret(cleaned)
    provider.api_key_hint = make_secret_hint(cleaned)


@router.get("", response_model=list[AIProviderRead], dependencies=[Depends(get_current_user)])
def list_ai_providers(
    kind: AIProviderKind | None = Query(default=None),
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AIProvider]:
    if include_inactive and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")

    kinds = [kind] if kind else [AIProviderKind.ASR, AIProviderKind.LLM]
    items: list[AIProvider] = []
    for item_kind in kinds:
        items.extend(list_available_ai_providers(item_kind, current_user, db, include_inactive=include_inactive))
    return items


@router.post("", response_model=AIProviderRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_ai_provider(payload: AIProviderCreate, db: Session = Depends(get_db)) -> AIProvider:
    validate_provider(payload.kind, payload.driver)
    provider = AIProvider(
        name=payload.name,
        kind=payload.kind,
        driver=payload.driver,
        model_name=payload.model_name,
        base_url=validate_provider_base_url(payload.kind, payload.driver, payload.base_url),
        description=(payload.description or "").strip() or None,
        is_active=payload.is_active,
    )
    apply_api_key(provider, payload.api_key, replace_only_if_present=False)
    db.add(provider)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="AI provider already exists.") from exc
    db.refresh(provider)
    return provider


@router.put("/{provider_id}", response_model=AIProviderRead, dependencies=[Depends(require_admin)])
def update_ai_provider(provider_id: int, payload: AIProviderUpdate, db: Session = Depends(get_db)) -> AIProvider:
    provider = get_ai_provider_or_404(provider_id, db)
    changes = payload.model_dump(exclude_unset=True)
    next_kind = changes.get("kind", provider.kind)
    next_driver = changes.get("driver", provider.driver)
    validate_provider(next_kind, next_driver)

    for field in ("name", "kind", "driver", "model_name", "is_active"):
        if field in changes:
            setattr(provider, field, changes[field])
    if "base_url" in changes:
        provider.base_url = validate_provider_base_url(next_kind, next_driver, changes["base_url"])
    if "description" in changes:
        provider.description = (changes["description"] or "").strip() or None
    if "api_key" in changes and (changes["api_key"] or "").strip():
        apply_api_key(provider, changes["api_key"], replace_only_if_present=False)

    db.add(provider)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="AI provider already exists.") from exc
    db.refresh(provider)
    return provider


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_ai_provider(provider_id: int, db: Session = Depends(get_db)) -> None:
    provider = get_ai_provider_or_404(provider_id, db)
    db.delete(provider)
    db.commit()
