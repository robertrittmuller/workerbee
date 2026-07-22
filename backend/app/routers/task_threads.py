"""Durable task thread and artifact-version history APIs."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Execution, TaskThread, TaskThreadAttempt, User
from app.routers.auth import get_current_active_user
from app.schemas import (
    ArtifactResponse,
    ExecutionResponse,
    TaskThreadAttemptResponse,
    TaskThreadDetailResponse,
    TaskThreadSummaryResponse,
)

router = APIRouter()


def _thread_query():
    """Load a thread with the immutable attempts and artifacts needed by review UI."""
    return select(TaskThread).options(
        selectinload(TaskThread.attempts)
        .selectinload(TaskThreadAttempt.execution)
        .selectinload(Execution.artifacts)
    )


def _serialize_thread(
    thread: TaskThread,
    *,
    include_attempts: bool,
) -> TaskThreadSummaryResponse | TaskThreadDetailResponse:
    attempts = sorted(thread.attempts, key=lambda item: item.attempt_number)
    latest = attempts[-1] if attempts else None
    payload = {
        "id": thread.id,
        "title": thread.title,
        "original_prompt": thread.original_prompt,
        "agent_id": thread.agent_id,
        "status": thread.status,
        "work_pack": thread.work_pack,
        "resource_ids": thread.resource_ids or [],
        "created_at": thread.created_at,
        "updated_at": thread.updated_at,
        "latest_execution_id": latest.execution_id if latest else None,
        "latest_attempt_number": latest.attempt_number if latest else 0,
        "attempt_count": len(attempts),
        "artifact_count": sum(len(item.execution.artifacts) for item in attempts),
    }
    if not include_attempts:
        return TaskThreadSummaryResponse(**payload)

    return TaskThreadDetailResponse(
        **payload,
        attempts=[
            TaskThreadAttemptResponse(
                id=attempt.id,
                attempt_number=attempt.attempt_number,
                execution=ExecutionResponse.model_validate(attempt.execution),
                artifacts=[
                    ArtifactResponse.model_validate(artifact)
                    for artifact in sorted(
                        attempt.execution.artifacts,
                        key=lambda item: item.created_at,
                    )
                ],
            )
            for attempt in reversed(attempts)
        ],
    )


async def _get_thread_or_404(
    db: AsyncSession,
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
) -> TaskThread:
    result = await db.execute(
        _thread_query().where(
            TaskThread.id == thread_id,
            TaskThread.user_id == user_id,
        )
    )
    thread = result.scalar_one_or_none()
    if thread is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    return thread


@router.get("", response_model=list[TaskThreadSummaryResponse])
async def list_task_threads(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 25,
) -> list[TaskThreadSummaryResponse]:
    """List durable tasks, newest activity first."""
    result = await db.execute(
        _thread_query()
        .where(TaskThread.user_id == current_user.id)
        .order_by(TaskThread.updated_at.desc())
        .offset(skip)
        .limit(min(max(limit, 1), 100))
    )
    return [
        _serialize_thread(thread, include_attempts=False)
        for thread in result.scalars().unique().all()
    ]


@router.get(
    "/by-execution/{execution_id}",
    response_model=TaskThreadDetailResponse,
)
async def get_task_thread_by_execution(
    execution_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskThreadDetailResponse:
    """Resolve the durable task that owns an execution attempt."""
    result = await db.execute(
        select(TaskThreadAttempt.thread_id).where(
            TaskThreadAttempt.execution_id == execution_id
        )
    )
    thread_id = result.scalar_one_or_none()
    if thread_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This execution predates durable task history",
        )
    thread = await _get_thread_or_404(db, current_user.id, thread_id)
    return _serialize_thread(thread, include_attempts=True)


@router.get("/{thread_id}", response_model=TaskThreadDetailResponse)
async def get_task_thread(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskThreadDetailResponse:
    """Return every attempt and artifact version for one business task."""
    thread = await _get_thread_or_404(db, current_user.id, thread_id)
    return _serialize_thread(thread, include_attempts=True)
