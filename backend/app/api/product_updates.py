from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_auth
from app.core.enums import ProductUpdateType
from app.db.session import get_db
from app.models.product_update import ProductUpdate
from app.schemas.product_update import ProductUpdateRead

router = APIRouter(prefix="/product-updates", tags=["product_updates"])


def serialize_product_update(item: ProductUpdate) -> ProductUpdateRead:
    return ProductUpdateRead.model_validate(item)


@router.get("", response_model=list[ProductUpdateRead], dependencies=[Depends(require_auth)])
def list_product_updates(
    limit: int = Query(default=50, ge=1, le=200),
    area: str | None = Query(default=None),
    change_type: ProductUpdateType | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[ProductUpdateRead]:
    stmt = (
        select(ProductUpdate)
        .options(selectinload(ProductUpdate.author))
        .order_by(ProductUpdate.is_pinned.desc(), ProductUpdate.changed_at.desc(), ProductUpdate.id.desc())
        .limit(limit)
    )
    if area:
        stmt = stmt.where(ProductUpdate.area == area.strip().lower())
    if change_type:
        stmt = stmt.where(ProductUpdate.change_type == change_type)
    items = list(db.scalars(stmt).all())
    return [serialize_product_update(item) for item in items]
