"""Outputs router."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Output, User
from app.routers.auth import get_current_active_user
from app.schemas import OutputCreate, OutputResponse, OutputUpdate

router = APIRouter()


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