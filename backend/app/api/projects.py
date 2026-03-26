from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_project_or_404, require_auth
from app.core.enums import ProjectStatus
from app.db.session import get_db
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[ProjectRead])
def list_projects(
    status_filter: ProjectStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> list[Project]:
    stmt = select(Project).order_by(Project.target_date.asc().nulls_last(), Project.created_at.desc())
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    return list(db.scalars(stmt).all())


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)) -> Project:
    project = Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project: Project = Depends(get_project_or_404)) -> Project:
    return project


@router.put("/{project_id}", response_model=ProjectRead)
def update_project(
    payload: ProjectUpdate,
    project: Project = Depends(get_project_or_404),
    db: Session = Depends(get_db),
) -> Project:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project: Project = Depends(get_project_or_404), db: Session = Depends(get_db)) -> None:
    db.delete(project)
    db.commit()
