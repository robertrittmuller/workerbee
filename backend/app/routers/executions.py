"""Executions router."""

import asyncio
import json
import uuid
from datetime import datetime
from typing import Annotated, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Execution, ExecutionLog, Workflow, Agent, Task, User
from app.routers.auth import get_current_active_user
from app.schemas import ExecutionCreate, ExecutionResponse, ExecutionUpdate

router = APIRouter()


@router.get("", response_model=list[ExecutionResponse])
async def list_executions(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
    workflow_id: uuid.UUID | None = None,
) -> list[Execution]:
    """List all executions for the current user."""
    query = select(Execution).options(selectinload(Execution.logs))
    
    # Join with workflow to filter by user
    query = query.join(Workflow).where(Workflow.user_id == current_user.id)
    
    if workflow_id:
        query = query.where(Execution.workflow_id == workflow_id)
    
    result = await db.execute(query.offset(skip).limit(limit))
    return list(result.scalars().all())


@router.post("", response_model=ExecutionResponse, status_code=status.HTTP_201_CREATED)
async def create_execution(
    execution_data: ExecutionCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Execution:
    """Create and start a new execution."""
    # Verify workflow exists and belongs to user
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
    
    # Create execution
    execution = Execution(
        workflow_id=execution_data.workflow_id,
        status="pending",
        input_data=execution_data.input_data or {},
    )
    db.add(execution)
    await db.flush()
    await db.refresh(execution)
    
    # Start execution in background (in production, this would be a Celery task)
    # For now, we'll just create the execution record
    # The actual execution will be handled by the agent system
    
    return execution


@router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(
    execution_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Execution:
    """Get an execution by ID."""
    result = await db.execute(
        select(Execution)
        .options(selectinload(Execution.logs))
        .join(Workflow)
        .where(
            Execution.id == execution_id,
            Workflow.user_id == current_user.id,
        )
    )
    execution = result.scalar_one_or_none()
    if execution is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )
    return execution


@router.put("/{execution_id}", response_model=ExecutionResponse)
async def update_execution(
    execution_id: uuid.UUID,
    execution_data: ExecutionUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Execution:
    """Update an execution (e.g., cancel it)."""
    result = await db.execute(
        select(Execution)
        .join(Workflow)
        .where(
            Execution.id == execution_id,
            Workflow.user_id == current_user.id,
        )
    )
    execution = result.scalar_one_or_none()
    if execution is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )
    
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
    result = await db.execute(
        select(Execution)
        .join(Workflow)
        .where(
            Execution.id == execution_id,
            Workflow.user_id == current_user.id,
        )
    )
    execution = result.scalar_one_or_none()
    if execution is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )
    
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
    # Verify execution exists and belongs to user
    result = await db.execute(
        select(Execution)
        .join(Workflow)
        .where(
            Execution.id == execution_id,
            Workflow.user_id == current_user.id,
        )
    )
    execution = result.scalar_one_or_none()
    if execution is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )
    
    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events for execution updates."""
        last_log_id = 0
        
        while True:
            # Get current execution state
            result = await db.execute(
                select(Execution)
                .options(selectinload(Execution.logs))
                .where(Execution.id == execution_id)
            )
            current_execution = result.scalar_one()
            
            # Send new logs
            for log in current_execution.logs:
                if log.id > last_log_id:
                    event_data = {
                        "type": "log",
                        "id": str(log.id),
                        "timestamp": log.created_at.isoformat(),
                        "level": log.level,
                        "message": log.message,
                        "data": log.data,
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
                    last_log_id = log.id
            
            # Check if execution is complete
            if current_execution.status in ["completed", "failed", "cancelled"]:
                event_data = {
                    "type": "complete",
                    "status": current_execution.status,
                    "result": current_execution.result,
                    "error": current_execution.error,
                }
                yield f"data: {json.dumps(event_data)}\n\n"
                break
            
            # Wait before next check
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
    result = await db.execute(
        select(Execution)
        .options(selectinload(Execution.logs))
        .join(Workflow)
        .where(
            Execution.id == execution_id,
            Workflow.user_id == current_user.id,
        )
    )
    execution = result.scalar_one_or_none()
    if execution is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )
    
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