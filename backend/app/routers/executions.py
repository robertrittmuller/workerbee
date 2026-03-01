"""Executions router."""

import asyncio
import json
import uuid
from datetime import datetime
from typing import Annotated, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session_maker, get_db
from app.models import Agent, Execution, ExecutionLog, User, Workflow
from app.routers.auth import get_current_active_user
from app.schemas import ExecutionCreate, ExecutionResponse, ExecutionUpdate

router = APIRouter()


def _execution_visibility_query(user_id: uuid.UUID):
    """Return a query scoped to executions owned by the current user."""
    return (
        select(Execution)
        .options(selectinload(Execution.logs))
        .outerjoin(Workflow, Execution.workflow_id == Workflow.id)
        .outerjoin(Agent, Execution.agent_id == Agent.id)
        .where(
            or_(
                Workflow.user_id == user_id,
                Agent.user_id == user_id,
            )
        )
    )


async def _get_execution_or_404(
    db: AsyncSession,
    user_id: uuid.UUID,
    execution_id: uuid.UUID,
) -> Execution:
    """Fetch an execution and enforce ownership."""
    result = await db.execute(
        _execution_visibility_query(user_id).where(Execution.id == execution_id)
    )
    execution = result.scalar_one_or_none()
    if execution is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )
    return execution


@router.get("", response_model=list[ExecutionResponse])
async def list_executions(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
    workflow_id: uuid.UUID | None = None,
    agent_id: uuid.UUID | None = None,
) -> list[Execution]:
    """List all executions for the current user."""
    query = _execution_visibility_query(current_user.id)

    if workflow_id:
        query = query.where(Execution.workflow_id == workflow_id)
    if agent_id:
        query = query.where(Execution.agent_id == agent_id)

    result = await db.execute(query.offset(skip).limit(limit))
    return list(result.scalars().all())


@router.post("", response_model=ExecutionResponse, status_code=status.HTTP_201_CREATED)
async def create_execution(
    execution_data: ExecutionCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Execution:
    """Create and start a new execution."""
    if not execution_data.workflow_id and not execution_data.agent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="workflow_id or agent_id is required",
        )

    if execution_data.workflow_id:
        result = await db.execute(
            select(Workflow).where(
                Workflow.id == execution_data.workflow_id,
                Workflow.user_id == current_user.id,
            )
        )
        workflow = result.scalar_one_or_none()
        if workflow is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow not found",
            )

    if execution_data.agent_id:
        result = await db.execute(
            select(Agent).where(
                Agent.id == execution_data.agent_id,
                Agent.user_id == current_user.id,
            )
        )
        agent = result.scalar_one_or_none()
        if agent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent not found",
            )

    execution_result = (
        {"input_data": execution_data.input_data} if execution_data.input_data else None
    )

    execution = Execution(
        workflow_id=execution_data.workflow_id,
        agent_id=execution_data.agent_id,
        task_id=execution_data.task_id,
        status="pending",
        started_at=datetime.utcnow(),
        result=execution_result,
    )
    db.add(execution)
    await db.flush()

    db.add(
        ExecutionLog(
            execution_id=execution.id,
            level="info",
            message="Execution created",
            data={
                "workflow_id": str(execution.workflow_id) if execution.workflow_id else None,
                "agent_id": str(execution.agent_id) if execution.agent_id else None,
            },
        )
    )
    await db.flush()
    await db.refresh(execution)

    return execution


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(
    execution_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Execution:
    """Get an execution by ID."""
    return await _get_execution_or_404(db, current_user.id, execution_id)


@router.put("/{execution_id}", response_model=ExecutionResponse)
async def update_execution(
    execution_id: uuid.UUID,
    execution_data: ExecutionUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Execution:
    """Update an execution (e.g., cancel it)."""
    execution = await _get_execution_or_404(db, current_user.id, execution_id)

    update_data = execution_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(execution, field, value)

    await db.flush()
    await db.refresh(execution)
    return execution


@router.post("/{execution_id}/cancel", response_model=ExecutionResponse)
async def cancel_execution(
    execution_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Execution:
    """Cancel a running execution."""
    execution = await _get_execution_or_404(db, current_user.id, execution_id)

    if execution.status not in ["pending", "running"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only cancel pending or running executions",
        )

    execution.status = "cancelled"
    execution.completed_at = datetime.utcnow()
    await db.flush()
    await db.refresh(execution)

    return execution


@router.get("/{execution_id}/stream")
async def stream_execution(
    execution_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Stream execution logs via Server-Sent Events."""
    await _get_execution_or_404(db, current_user.id, execution_id)

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events for execution updates."""
        seen_log_ids: set[str] = set()

        while True:
            # Use a fresh session each poll so long-lived identity maps do not cache
            # log collections and hide newly committed rows from active executions.
            async with async_session_maker() as stream_db:
                result = await stream_db.execute(
                    select(Execution)
                    .options(selectinload(Execution.logs))
                    .where(Execution.id == execution_id)
                )
                current_execution = result.scalar_one()

            for log in current_execution.logs:
                log_id = str(log.id)
                if log_id not in seen_log_ids:
                    event_data = {
                        "type": "log",
                        "id": log_id,
                        "timestamp": log.created_at.isoformat(),
                        "level": log.level,
                        "message": log.message,
                        "data": log.data,
                    }
                    yield f"data: {json.dumps(event_data)}\\n\\n"
                    seen_log_ids.add(log_id)

            if current_execution.status in ["completed", "failed", "cancelled"]:
                event_data = {
                    "type": "complete",
                    "status": current_execution.status,
                    "result": current_execution.result,
                    "error": current_execution.error_message,
                }
                yield f"data: {json.dumps(event_data)}\\n\\n"
                break

            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/{execution_id}/logs")
async def get_execution_logs(
    execution_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    """Get all logs for an execution."""
    execution = await _get_execution_or_404(db, current_user.id, execution_id)

    return [
        {
            "id": str(log.id),
            "timestamp": log.created_at.isoformat(),
            "level": log.level,
            "message": log.message,
            "data": log.data,
        }
        for log in execution.logs
    ]
