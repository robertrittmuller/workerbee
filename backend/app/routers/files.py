"""Files router."""

import asyncio
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.file_preview import build_file_preview
from app.models import File as FileModel
from app.models import (
    ResourceGroup,
    ResourceGroupFile,
    SourceSet,
    SourceSetFile,
    User,
)
from app.routers.auth import get_current_active_user
from app.schemas import (
    FileBatchDownloadRequest,
    FilePreviewResponse,
    FileResponse,
    ResourceGroupAssign,
    ResourceGroupBatchAssign,
    ResourceGroupBatchAssignResponse,
    ResourceGroupCreate,
    ResourceGroupResponse,
    ResourceGroupUpdate,
    SourceSetCreate,
    SourceSetResponse,
    SourceSetUpdate,
)
from app.source_archive import (
    SourceArchiveFileMissingError,
    SourceArchiveItem,
    SourceArchiveTooLargeError,
    build_source_archive,
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


async def _get_owned_files_in_order(
    db: AsyncSession,
    user_id: uuid.UUID,
    requested_ids: list[uuid.UUID],
) -> list[FileModel]:
    """Return a deduplicated owned file set in request order or fail completely."""
    file_ids = list(dict.fromkeys(requested_ids))
    result = await db.execute(
        select(FileModel).where(
            FileModel.id.in_(file_ids),
            FileModel.user_id == user_id,
        )
    )
    files_by_id = {file.id: file for file in result.scalars().all()}
    if len(files_by_id) != len(file_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )
    return [files_by_id[file_id] for file_id in file_ids]


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


async def _get_user_source_set_or_404(
    db: AsyncSession,
    user_id: uuid.UUID,
    source_set_id: uuid.UUID,
) -> SourceSet:
    result = await db.execute(
        select(SourceSet).where(
            SourceSet.id == source_set_id,
            SourceSet.user_id == user_id,
        )
    )
    source_set = result.scalar_one_or_none()
    if source_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source set not found",
        )
    return source_set


async def _validated_source_set_name(
    db: AsyncSession,
    user_id: uuid.UUID,
    raw_name: str,
    *,
    exclude_source_set_id: uuid.UUID | None = None,
) -> str:
    name = raw_name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source set name is required",
        )
    conditions = [
        SourceSet.user_id == user_id,
        func.lower(SourceSet.name) == name.lower(),
    ]
    if exclude_source_set_id is not None:
        conditions.append(SourceSet.id != exclude_source_set_id)
    result = await db.execute(select(SourceSet).where(*conditions))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source set name already exists",
        )
    return name


def _source_set_response(
    source_set: SourceSet,
    file_ids: list[uuid.UUID],
) -> SourceSetResponse:
    return SourceSetResponse(
        id=source_set.id,
        user_id=source_set.user_id,
        name=source_set.name,
        file_ids=file_ids,
        file_count=len(file_ids),
        created_at=source_set.created_at,
        updated_at=source_set.updated_at,
    )


async def _validated_resource_group_name(
    db: AsyncSession,
    user_id: uuid.UUID,
    raw_name: str,
    *,
    exclude_group_id: uuid.UUID | None = None,
) -> str:
    group_name = raw_name.strip()
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

    conditions = [
        ResourceGroup.user_id == user_id,
        func.lower(ResourceGroup.name) == group_name.lower(),
    ]
    if exclude_group_id is not None:
        conditions.append(ResourceGroup.id != exclude_group_id)
    existing_result = await db.execute(select(ResourceGroup).where(*conditions))
    if existing_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resource group name already exists",
        )
    return group_name


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
) -> ResourceGroup:
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
    return resource_group


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


@router.post("/batch-download")
async def batch_download_files(
    request: FileBatchDownloadRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Download an exact, bounded set of owned source files as one ZIP."""
    files = await _get_owned_files_in_order(db, current_user.id, request.file_ids)

    upload_root = (Path("uploads") / str(current_user.id)).resolve()
    archive_items: list[SourceArchiveItem] = []
    for file in files:
        source_path = (upload_root / file.filename).resolve()
        if not source_path.is_relative_to(upload_root):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found",
            )
        archive_items.append(
            SourceArchiveItem(
                path=source_path,
                original_filename=file.original_filename,
                declared_size=file.file_size,
            )
        )

    try:
        archive = await asyncio.to_thread(build_source_archive, archive_items)
    except SourceArchiveTooLargeError as error:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Selected files exceed the 250 MB archive limit",
        ) from error
    except SourceArchiveFileMissingError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more selected files are no longer available",
        ) from error

    async def archive_generator():
        try:
            while chunk := await asyncio.to_thread(archive.read, 64 * 1024):
                yield chunk
        finally:
            await asyncio.to_thread(archive.close)

    return StreamingResponse(
        archive_generator(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="workerbee-sources.zip"',
        },
    )


@router.get("/source-sets", response_model=list[SourceSetResponse])
async def list_source_sets(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SourceSetResponse]:
    """List reusable source sets with stable ordered membership."""
    sets_result = await db.execute(
        select(SourceSet)
        .where(SourceSet.user_id == current_user.id)
        .order_by(SourceSet.updated_at.desc(), SourceSet.name)
    )
    source_sets = list(sets_result.scalars().all())
    if not source_sets:
        return []

    links_result = await db.execute(
        select(SourceSetFile)
        .where(SourceSetFile.source_set_id.in_([source_set.id for source_set in source_sets]))
        .order_by(SourceSetFile.source_set_id, SourceSetFile.position)
    )
    file_ids_by_set: dict[uuid.UUID, list[uuid.UUID]] = {
        source_set.id: [] for source_set in source_sets
    }
    for link in links_result.scalars().all():
        file_ids_by_set[link.source_set_id].append(link.file_id)
    return [
        _source_set_response(source_set, file_ids_by_set[source_set.id])
        for source_set in source_sets
    ]


@router.post(
    "/source-sets",
    response_model=SourceSetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_source_set(
    source_set_data: SourceSetCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SourceSetResponse:
    """Save an exact owned source selection for repeat work."""
    name = await _validated_source_set_name(db, current_user.id, source_set_data.name)
    files = await _get_owned_files_in_order(db, current_user.id, source_set_data.file_ids)
    source_set = SourceSet(user_id=current_user.id, name=name)
    db.add(source_set)
    await db.flush()
    db.add_all(
        [
            SourceSetFile(source_set_id=source_set.id, file_id=file.id, position=position)
            for position, file in enumerate(files)
        ]
    )
    await db.flush()
    await db.refresh(source_set)
    return _source_set_response(source_set, [file.id for file in files])


@router.patch("/source-sets/{source_set_id}", response_model=SourceSetResponse)
async def update_source_set(
    source_set_id: uuid.UUID,
    source_set_data: SourceSetUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SourceSetResponse:
    """Rename a source set or atomically replace its complete membership."""
    if source_set_data.name is None and source_set_data.file_ids is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name or file IDs are required",
        )
    source_set = await _get_user_source_set_or_404(db, current_user.id, source_set_id)

    if source_set_data.name is not None:
        source_set.name = await _validated_source_set_name(
            db,
            current_user.id,
            source_set_data.name,
            exclude_source_set_id=source_set.id,
        )

    if source_set_data.file_ids is None:
        links_result = await db.execute(
            select(SourceSetFile)
            .where(SourceSetFile.source_set_id == source_set.id)
            .order_by(SourceSetFile.position)
        )
        file_ids = [link.file_id for link in links_result.scalars().all()]
    else:
        files = await _get_owned_files_in_order(
            db,
            current_user.id,
            source_set_data.file_ids,
        )
        file_ids = [file.id for file in files]
        await db.execute(
            delete(SourceSetFile).where(SourceSetFile.source_set_id == source_set.id)
        )
        db.add_all(
            [
                SourceSetFile(source_set_id=source_set.id, file_id=file_id, position=position)
                for position, file_id in enumerate(file_ids)
            ]
        )

    source_set.updated_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(source_set)
    return _source_set_response(source_set, file_ids)


@router.delete("/source-sets/{source_set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source_set(
    source_set_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a reusable set without deleting any underlying source files."""
    source_set = await _get_user_source_set_or_404(db, current_user.id, source_set_id)
    await db.delete(source_set)


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
    group_name = await _validated_resource_group_name(
        db,
        current_user.id,
        group_data.name,
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


@router.patch(
    "/resource-groups/{resource_group_id}",
    response_model=ResourceGroupResponse,
)
async def rename_resource_group(
    resource_group_id: uuid.UUID,
    group_data: ResourceGroupUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResourceGroupResponse:
    """Rename a user-created resource group without changing its files."""
    group = await _get_user_resource_group_or_404(db, current_user.id, resource_group_id)
    if group.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default resource group cannot be renamed",
        )

    group.name = await _validated_resource_group_name(
        db,
        current_user.id,
        group_data.name,
        exclude_group_id=group.id,
    )
    count_result = await db.execute(
        select(func.count(ResourceGroupFile.id)).where(
            ResourceGroupFile.resource_group_id == group.id
        )
    )
    await db.flush()
    await db.refresh(group)
    return ResourceGroupResponse(
        id=group.id,
        user_id=group.user_id,
        name=group.name,
        is_default=group.is_default,
        created_at=group.created_at,
        file_count=count_result.scalar_one() or 0,
    )


@router.put(
    "/resource-groups/batch-assign",
    response_model=ResourceGroupBatchAssignResponse,
)
async def batch_assign_files_to_resource_group(
    assignment: ResourceGroupBatchAssign,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResourceGroupBatchAssignResponse:
    """Move a bounded, owned source set to one owned resource group atomically."""
    file_ids = list(dict.fromkeys(assignment.file_ids))
    if assignment.resource_group_id is None:
        target_group = await _get_or_create_default_resource_group(db, current_user.id)
    else:
        target_group = await _get_user_resource_group_or_404(
            db,
            current_user.id,
            assignment.resource_group_id,
        )

    # Validate the complete set before changing any link so a bad ID cannot create
    # a partial move even if the caller handles the exception inside a transaction.
    for file_id in file_ids:
        await _get_user_file_or_404(db, current_user.id, file_id)
    for file_id in file_ids:
        await _assign_file_to_group(db, current_user.id, file_id, target_group.id)
    await db.flush()

    return ResourceGroupBatchAssignResponse(
        resource_group_id=target_group.id,
        moved_count=len(file_ids),
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


@router.get("/{file_id}/preview", response_model=FilePreviewResponse)
async def preview_file(
    file_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FilePreviewResponse:
    """Return a bounded, read-only preview for a source file owned by the user."""
    file = await _get_user_file_or_404(db, current_user.id, file_id)
    file_path = Path("uploads") / str(current_user.id) / file.filename
    return build_file_preview(
        file_path,
        filename=file.original_filename,
        content_type=file.content_type,
        file_size=file.file_size,
    )


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
