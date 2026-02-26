"""Files router."""

import uuid
from typing import Annotated

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import File as FileModel
from app.models import ResourceGroup, ResourceGroupFile, User
from app.routers.auth import get_current_active_user
from app.schemas import (
    FileResponse,
    ResourceGroupAssign,
    ResourceGroupCreate,
    ResourceGroupResponse,
)

router = APIRouter()
DEFAULT_RESOURCE_GROUP_NAME = "Default"


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


def _resolve_upload_content_type(file: UploadFile) -> str:
    """Resolve upload MIME type, with extension fallback for generic octet-stream uploads."""
    raw_content_type = (file.content_type or "").strip().lower()
    if raw_content_type in settings.allowed_file_types:
        return raw_content_type

    if raw_content_type not in {"", "application/octet-stream", "binary/octet-stream"}:
        return raw_content_type or "application/octet-stream"

    filename = (file.filename or "").strip().lower()
    extension_map = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".ppt": "application/vnd.ms-powerpoint",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".csv": "text/csv",
        ".txt": "text/plain",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    for extension, mime_type in extension_map.items():
        if filename.endswith(extension):
            return mime_type

    return raw_content_type or "application/octet-stream"


async def _get_user_file_or_404(
    db: AsyncSession,
    user_id: uuid.UUID,
    file_id: uuid.UUID,
) -> FileModel:
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == user_id,
        )
    )
    file = result.scalar_one_or_none()
    if file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )
    return file


async def _get_user_resource_group_or_404(
    db: AsyncSession,
    user_id: uuid.UUID,
    resource_group_id: uuid.UUID,
) -> ResourceGroup:
    result = await db.execute(
        select(ResourceGroup).where(
            ResourceGroup.id == resource_group_id,
            ResourceGroup.user_id == user_id,
        )
    )
    resource_group = result.scalar_one_or_none()
    if resource_group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource group not found",
        )
    return resource_group


async def _get_or_create_default_resource_group(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> ResourceGroup:
    result = await db.execute(
        select(ResourceGroup).where(
            ResourceGroup.user_id == user_id,
            ResourceGroup.is_default.is_(True),
        )
    )
    default_group = result.scalar_one_or_none()
    if default_group is not None:
        return default_group

    default_group = ResourceGroup(
        user_id=user_id,
        name=DEFAULT_RESOURCE_GROUP_NAME,
        is_default=True,
    )
    db.add(default_group)
    await db.flush()
    await db.refresh(default_group)
    return default_group


async def _assign_file_to_group(
    db: AsyncSession,
    user_id: uuid.UUID,
    file_id: uuid.UUID,
    resource_group_id: uuid.UUID | None,
) -> None:
    await _get_user_file_or_404(db, user_id, file_id)

    if resource_group_id is None:
        resource_group = await _get_or_create_default_resource_group(db, user_id)
    else:
        resource_group = await _get_user_resource_group_or_404(
            db,
            user_id,
            resource_group_id,
        )

    result = await db.execute(
        select(ResourceGroupFile).where(ResourceGroupFile.file_id == file_id)
    )
    link = result.scalar_one_or_none()

    if link is None:
        db.add(
            ResourceGroupFile(
                resource_group_id=resource_group.id,
                file_id=file_id,
            )
        )
    else:
        link.resource_group_id = resource_group.id


async def _backfill_ungrouped_files(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> None:
    default_group = await _get_or_create_default_resource_group(db, user_id)

    result = await db.execute(
        select(FileModel.id)
        .outerjoin(ResourceGroupFile, ResourceGroupFile.file_id == FileModel.id)
        .where(
            FileModel.user_id == user_id,
            ResourceGroupFile.id.is_(None),
        )
    )
    ungrouped_file_ids = list(result.scalars().all())

    for file_id in ungrouped_file_ids:
        db.add(
            ResourceGroupFile(
                resource_group_id=default_group.id,
                file_id=file_id,
            )
        )


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


@router.get("/resource-groups", response_model=list[ResourceGroupResponse])
async def list_resource_groups(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ResourceGroupResponse]:
    """List resource groups for the current user."""
    await _backfill_ungrouped_files(db, current_user.id)

    groups_result = await db.execute(
        select(ResourceGroup).where(ResourceGroup.user_id == current_user.id)
    )
    groups = list(groups_result.scalars().all())

    counts_result = await db.execute(
        select(
            ResourceGroupFile.resource_group_id,
            func.count(ResourceGroupFile.id),
        )
        .join(ResourceGroup, ResourceGroup.id == ResourceGroupFile.resource_group_id)
        .where(ResourceGroup.user_id == current_user.id)
        .group_by(ResourceGroupFile.resource_group_id)
    )
    counts = {group_id: count for group_id, count in counts_result.all()}

    groups.sort(key=lambda group: (0 if group.is_default else 1, group.name.lower()))
    return [
        ResourceGroupResponse(
            id=group.id,
            user_id=group.user_id,
            name=group.name,
            is_default=group.is_default,
            created_at=group.created_at,
            file_count=counts.get(group.id, 0),
        )
        for group in groups
    ]


@router.post(
    "/resource-groups",
    response_model=ResourceGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_resource_group(
    group_data: ResourceGroupCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResourceGroupResponse:
    """Create a new resource group for the current user."""
    group_name = group_data.name.strip()
    if not group_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group name is required",
        )
    if group_name.lower() == DEFAULT_RESOURCE_GROUP_NAME.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'"{DEFAULT_RESOURCE_GROUP_NAME}" is reserved as the default group name',
        )

    existing_result = await db.execute(
        select(ResourceGroup).where(
            ResourceGroup.user_id == current_user.id,
            func.lower(ResourceGroup.name) == group_name.lower(),
        )
    )
    if existing_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resource group name already exists",
        )

    group = ResourceGroup(
        user_id=current_user.id,
        name=group_name,
        is_default=False,
    )
    db.add(group)
    await db.flush()
    await db.refresh(group)

    return ResourceGroupResponse(
        id=group.id,
        user_id=group.user_id,
        name=group.name,
        is_default=group.is_default,
        created_at=group.created_at,
        file_count=0,
    )


@router.get("/resource-groups/{resource_group_id}/files", response_model=list[FileResponse])
async def list_files_by_resource_group(
    resource_group_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FileModel]:
    """List files in a specific resource group."""
    await _backfill_ungrouped_files(db, current_user.id)
    await _get_user_resource_group_or_404(db, current_user.id, resource_group_id)

    result = await db.execute(
        select(FileModel)
        .join(ResourceGroupFile, ResourceGroupFile.file_id == FileModel.id)
        .where(
            FileModel.user_id == current_user.id,
            ResourceGroupFile.resource_group_id == resource_group_id,
        )
        .order_by(FileModel.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/resource-groups/{resource_group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource_group(
    resource_group_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a user-created resource group once it has no files."""
    group = await _get_user_resource_group_or_404(db, current_user.id, resource_group_id)

    if group.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default resource group cannot be deleted",
        )

    count_result = await db.execute(
        select(func.count(ResourceGroupFile.id)).where(
            ResourceGroupFile.resource_group_id == resource_group_id
        )
    )
    if (count_result.scalar_one() or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resource group must be empty before deletion",
        )

    await db.delete(group)


@router.post("/upload", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    resource_group_id: uuid.UUID | None = Form(default=None),
) -> FileModel:
    """Upload a file."""
    if file.size and file.size > settings.max_file_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum of {settings.max_file_size} bytes",
        )

    resolved_content_type = _resolve_upload_content_type(file)
    if resolved_content_type not in settings.allowed_file_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type {file.content_type} is not allowed",
        )

    file_id = uuid.uuid4()
    filename = f"{file_id}_{file.filename}"
    storage_path = f"uploads/{current_user.id}/{filename}"

    import os

    os.makedirs(f"uploads/{current_user.id}", exist_ok=True)

    async with aiofiles.open(f"uploads/{current_user.id}/{filename}", "wb") as out_file:
        content = await file.read()
        await out_file.write(content)

    file_record = FileModel(
        user_id=current_user.id,
        filename=filename,
        original_filename=file.filename or "unknown",
        content_type=resolved_content_type,
        file_size=file.size or len(content),
        storage_path=storage_path,
        file_type=get_file_type(resolved_content_type),
    )
    db.add(file_record)
    await db.flush()

    await _assign_file_to_group(
        db,
        current_user.id,
        file_record.id,
        resource_group_id,
    )

    await db.flush()
    await db.refresh(file_record)

    return file_record


@router.put("/{file_id}/resource-group", response_model=FileResponse)
async def assign_file_to_resource_group(
    file_id: uuid.UUID,
    assignment: ResourceGroupAssign,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileModel:
    """Assign an existing file to a resource group."""
    file_record = await _get_user_file_or_404(db, current_user.id, file_id)

    await _assign_file_to_group(
        db,
        current_user.id,
        file_id,
        assignment.resource_group_id,
    )
    await db.flush()

    return file_record


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FileModel:
    """Get file metadata."""
    return await _get_user_file_or_404(db, current_user.id, file_id)


@router.get("/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Download a file."""
    file = await _get_user_file_or_404(db, current_user.id, file_id)

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
    file = await _get_user_file_or_404(db, current_user.id, file_id)

    import os

    file_path = f"uploads/{current_user.id}/{file.filename}"
    if os.path.exists(file_path):
        os.remove(file_path)

    await db.delete(file)
