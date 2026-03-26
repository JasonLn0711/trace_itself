from app.core.enums import AIProviderKind, AppFeature, UserRole
from app.models.ai_provider import AIProvider
from app.models.user import User


def user_has_feature(user: User, feature: AppFeature) -> bool:
    if user.role == UserRole.ADMIN:
        return True

    group = user.access_group
    if group is None:
        return False

    if feature == AppFeature.PROJECT_TRACER:
        return bool(group.can_use_project_tracer)
    if feature == AppFeature.ASR:
        return bool(group.can_use_asr)
    if feature == AppFeature.LLM:
        return bool(group.can_use_llm)
    return False


def user_can_access_provider(user: User, provider: AIProvider) -> bool:
    if provider.kind == AIProviderKind.ASR:
        return user_has_feature(user, AppFeature.ASR)
    if provider.kind == AIProviderKind.LLM:
        return user_has_feature(user, AppFeature.LLM)
    return False
