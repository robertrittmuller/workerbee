"""Tasks router."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Task, User
from app.routers.auth import get_current_active_user
from app.schemas import TaskCreate, TaskResponse, TaskUpdate

router = APIRouter()


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
    templates_only: bool = False,
) -> list[Task]:
    """List all tasks for the current user and public templates."""
    query = select(Task).where(
        (Task.user_id == current_user.id) | (Task.is_public == True)
    )
    if templates_only:
        query = query.where(Task.is_template == True)
    result = await db.execute(query.offset(skip).limit(limit))
    return list(result.scalars().all())


@router.get("/templates", response_model=list[TaskResponse])
async def list_task_templates(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Task]:
    """List all public task templates."""
    result = await db.execute(
        select(Task).where(
            Task.is_template == True, Task.is_public == True
        )
    )
    return list(result.scalars().all())


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Task:
    """Create a new task."""
    task = Task(
        user_id=current_user.id if not task_data.is_template else None,
        name=task_data.name,
        description=task_data.description,
        prompt_template=task_data.prompt_template,
        is_template=task_data.is_template,
        is_public=task_data.is_public,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Task:
    """Get a task by ID."""
    result = await db.execute(
        select(Task).where(
            Task.id == task_id,
            (Task.user_id == current_user.id) | (Task.is_public == True),
        )
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    return task


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    task_data: TaskUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Task:
    """Update a task."""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    
    update_data = task_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
    
    await db.flush()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a task."""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    await db.delete(task)