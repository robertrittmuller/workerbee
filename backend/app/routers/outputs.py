"""Outputs router."""

import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Agent, Artifact, Execution, Output, User
from app.routers.auth import get_current_active_user
from app.schemas import (
    OutputCreate,
    OutputResponse,
    OutputUpdate,
    RecentOutputFileResponse,
)

router = APIRouter()
UPLOADS_ROOT = Path("uploads").resolve()


@router.get("", response_model=list[OutputResponse])
async def list_outputs(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
) -> list[Output]:
    """List all outputs for the current user."""
    result = await db.execute(
        select(Output)
        .where(Output.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("", response_model=OutputResponse, status_code=status.HTTP_201_CREATED)
async def create_output(
    output_data: OutputCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Output:
    """Create a new output."""
    output = Output(
        user_id=current_user.id,
        name=output_data.name,
        output_type=output_data.output_type,
        config=output_data.config or {},
    )
    db.add(output)
    await db.flush()
    await db.refresh(output)
    return output


@router.get("/types")
async def list_output_types() -> list[dict]:
    """List available output types."""
    return [
        {
            "id": "word",
            "name": "Word Document",
            "description": "Microsoft Word document (.docx)",
            "extension": ".docx",
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        {
            "id": "excel",
            "name": "Excel Spreadsheet",
            "description": "Microsoft Excel spreadsheet (.xlsx)",
            "extension": ".xlsx",
            "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        {
            "id": "csv",
            "name": "CSV File",
            "description": "Comma-separated values file (.csv)",
            "extension": ".csv",
            "mime_type": "text/csv",
        },
        {
            "id": "pdf",
            "name": "PDF Document",
            "description": "Portable Document Format (.pdf)",
            "extension": ".pdf",
            "mime_type": "application/pdf",
        },
        {
            "id": "powerpoint",
            "name": "PowerPoint Presentation",
            "description": "Microsoft PowerPoint presentation (.pptx)",
            "extension": ".pptx",
            "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        },
        {
            "id": "markdown",
            "name": "Markdown Document",
            "description": "Markdown text file (.md)",
            "extension": ".md",
            "mime_type": "text/markdown",
        },
        {
            "id": "json",
            "name": "JSON File",
            "description": "JSON data file (.json)",
            "extension": ".json",
            "mime_type": "application/json",
        },
        {
            "id": "text",
            "name": "Plain Text",
            "description": "Plain text file (.txt)",
            "extension": ".txt",
            "mime_type": "text/plain",
        },
    ]


@router.get("/recent-files", response_model=list[RecentOutputFileResponse])
async def list_recent_output_files(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 25,
    agent_id: uuid.UUID | None = None,
) -> list[RecentOutputFileResponse]:
    """List recent generated artifact files for the current user's agents."""
    query = (
        select(
            Artifact,
            Execution.agent_id,
            Agent.name,
            Output.name,
            Output.output_type,
        )
        .join(Execution, Artifact.execution_id == Execution.id)
        .join(Agent, Execution.agent_id == Agent.id)
        .outerjoin(Output, Artifact.output_id == Output.id)
        .where(
            Agent.user_id == current_user.id,
            Execution.agent_id.is_not(None),
        )
    )
    if agent_id is not None:
        query = query.where(Execution.agent_id == agent_id)

    result = await db.execute(
        query
        .order_by(Artifact.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    rows = result.all()
    return [
        RecentOutputFileResponse(
            id=artifact.id,
            execution_id=artifact.execution_id,
            output_id=artifact.output_id,
            filename=artifact.filename,
            content_type=artifact.content_type,
            file_size=artifact.file_size,
            storage_path=artifact.storage_path,
            created_at=artifact.created_at,
            agent_id=agent_id,
            agent_name=agent_name,
            output_name=output_name,
            output_type=output_type,
        )
        for artifact, agent_id, agent_name, output_name, output_type in rows
    ]


@router.get("/recent-files/{artifact_id}/download")
async def download_recent_output_file(
    artifact_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileResponse:
    """Download a recent output file artifact."""
    result = await db.execute(
        select(Artifact)
        .join(Execution, Artifact.execution_id == Execution.id)
        .join(Agent, Execution.agent_id == Agent.id)
        .where(
            Artifact.id == artifact_id,
            Agent.user_id == current_user.id,
            Execution.agent_id.is_not(None),
        )
    )
    artifact = result.scalar_one_or_none()
    if artifact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output file not found",
        )

    artifact_path = Path(artifact.storage_path).resolve()
    if UPLOADS_ROOT not in artifact_path.parents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid artifact path",
        )
    if not artifact_path.exists() or not artifact_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output file is unavailable",
        )

    return FileResponse(
        path=artifact_path,
        media_type=artifact.content_type,
        filename=artifact.filename,
    )


@router.get("/{output_id}", response_model=OutputResponse)
async def get_output(
    output_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Output:
    """Get an output by ID."""
    result = await db.execute(
        select(Output).where(
            Output.id == output_id, Output.user_id == current_user.id
        )
    )
    output = result.scalar_one_or_none()
    if output is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output not found",
        )
    return output


@router.put("/{output_id}", response_model=OutputResponse)
async def update_output(
    output_id: uuid.UUID,
    output_data: OutputUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Output:
    """Update an output."""
    result = await db.execute(
        select(Output).where(
            Output.id == output_id, Output.user_id == current_user.id
        )
    )
    output = result.scalar_one_or_none()
    if output is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output not found",
        )
    
    update_data = output_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(output, field, value)
    
    await db.flush()
    await db.refresh(output)
    return output


@router.delete("/{output_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_output(
    output_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete an output."""
    result = await db.execute(
        select(Output).where(
            Output.id == output_id, Output.user_id == current_user.id
        )
    )
    output = result.scalar_one_or_none()
    if output is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output not found",
        )
    await db.delete(output)
