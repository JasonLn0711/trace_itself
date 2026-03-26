from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_admin, require_auth
from app.core.enums import ProductUpdateType
from app.db.session import get_db
from app.models.product_update import ProductUpdate
from app.models.user import User
from app.schemas.product_update import ProductUpdateCreate, ProductUpdateRead, ProductUpdateUpdate

router = APIRouter(prefix="/product-updates", tags=["product_updates"])


def get_product_update_or_404(product_update_id: int, db: Session) -> ProductUpdate:
    from fastapi import HTTPException

    product_update = db.scalar(
        select(ProductUpdate)
        .options(selectinload(ProductUpdate.author))
        .where(ProductUpdate.id == product_update_id)
    )
    if not product_update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product update not found.")
    return product_update


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


@router.post("", response_model=ProductUpdateRead, status_code=status.HTTP_201_CREATED)
def create_product_update(
    payload: ProductUpdateCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProductUpdateRead:
    item = ProductUpdate(
        **payload.model_dump(),
        area=payload.area.strip().lower(),
        author_user_id=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_product_update(item)


@router.put("/{product_update_id}", response_model=ProductUpdateRead)
def update_product_update(
    product_update_id: int,
    payload: ProductUpdateUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProductUpdateRead:
    item = get_product_update_or_404(product_update_id, db)
    changes = payload.model_dump(exclude_unset=True)
    if "area" in changes and changes["area"] is not None:
        changes["area"] = changes["area"].strip().lower()
    for field, value in changes.items():
        setattr(item, field, value)
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_product_update(item)


@router.delete("/{product_update_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product_update(
    product_update_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    item = get_product_update_or_404(product_update_id, db)
    db.delete(item)
    db.commit()
