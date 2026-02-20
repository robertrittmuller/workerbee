"""Files router."""

import uuid
from typing import Annotated

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import File as FileModel
from app.models import User
from app.routers.auth import get_current_active_user
from app.schemas import FileResponse

router = APIRouter()


def get_file_type(content_type: str) -> str:
    """Determine file type from content type."""
    type_map = {
        "application/pdf": "pdf",
        "application/msword": "word",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
        "application/vnd.ms-excel": "excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
        "application/vnd.ms-powerpoint": "powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "powerpoint",
        "text/csv": "csv",
        "text/plain": "text",
        "image/png": "image",
        "image/jpeg": "image",
        "image/gif": "image",
        "image/webp": "image",
    }
    return type_map.get(content_type, "unknown")


@router.get("", response_model=list[FileResponse])
async def list_files(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
) -> list[FileModel]:
    """List all files for the current user."""
    result = await db.execute(
        select(FileModel)
        .where(FileModel.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("/upload", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> FileModel:
    """Upload a file."""
    # Validate file size
    if file.size and file.size > settings.max_file_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum of {settings.max_file_size} bytes",
        )
    
    # Validate file type
    if file.content_type not in settings.allowed_file_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type {file.content_type} is not allowed",
        )
    
    # Generate unique filename
    file_id = uuid.uuid4()
    filename = f"{file_id}_{file.filename}"
    storage_path = f"uploads/{current_user.id}/{filename}"
    
    # Save file to storage (in production, this would go to MinIO)
    # For now, we'll save to local filesystem
    import os
    os.makedirs(f"uploads/{current_user.id}", exist_ok=True)
    
    async with aiofiles.open(f"uploads/{current_user.id}/{filename}", "wb") as out_file:
        content = await file.read()
        await out_file.write(content)
    
    # Create file record
    file_record = FileModel(
        user_id=current_user.id,
        filename=filename,
        original_filename=file.filename or "unknown",
        content_type=file.content_type or "application/octet-stream",
        file_size=file.size or len(content),
        storage_path=storage_path,
        file_type=get_file_type(file.content_type or ""),
    )
    db.add(file_record)
    await db.flush()
    await db.refresh(file_record)
    
    return file_record


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileModel:
    """Get file metadata."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id, FileModel.user_id == current_user.id
        )
    )
    file = result.scalar_one_or_none()
    if file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )
    return file


@router.get("/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Download a file."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id, FileModel.user_id == current_user.id
        )
    )
    file = result.scalar_one_or_none()
    if file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )
    
    # In production, this would stream from MinIO
    file_path = f"uploads/{current_user.id}/{file.filename}"
    
    async def file_generator():
        async with aiofiles.open(file_path, "rb") as f:
            while chunk := await f.read(8192):
                yield chunk
    
    return StreamingResponse(
        file_generator(),
        media_type=file.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{file.original_filename}"'
        },
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a file."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id, FileModel.user_id == current_user.id
        )
    )
    file = result.scalar_one_or_none()
    if file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )
    
    # Delete file from storage
    import os
    file_path = f"uploads/{current_user.id}/{file.filename}"
    if os.path.exists(file_path):
        os.remove(file_path)
    
    await db.delete(file)