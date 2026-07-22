import uuid
from io import BytesIO
from zipfile import ZipFile

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base
from app.models import File, ResourceGroup, ResourceGroupFile, User
from app.routers import files as files_router
from app.routers.files import (
    batch_assign_files_to_resource_group,
    batch_download_files,
    delete_resource_group,
    rename_resource_group,
)
from app.schemas import FileBatchDownloadRequest, ResourceGroupBatchAssign, ResourceGroupUpdate


async def make_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    return engine, session_factory()


def make_user(email: str) -> User:
    return User(
        email=email,
        password_hash="not-used-in-router-tests",
        full_name="Resource Group Tester",
    )


def make_file(user: User, name: str) -> File:
    return File(
        user_id=user.id,
        filename=f"{uuid.uuid4()}_{name}",
        original_filename=name,
        content_type="text/plain",
        file_size=12,
        storage_path=f"uploads/{user.id}/{name}",
        file_type="text",
    )


@pytest.mark.asyncio
async def test_rename_trims_name_and_preserves_file_count() -> None:
    engine, db = await make_session()
    try:
        user = make_user("rename@example.com")
        db.add(user)
        await db.flush()
        group = ResourceGroup(user_id=user.id, name="Old name", is_default=False)
        source = make_file(user, "brief.txt")
        db.add_all([group, source])
        await db.flush()
        db.add(ResourceGroupFile(resource_group_id=group.id, file_id=source.id))
        await db.flush()

        response = await rename_resource_group(
            group.id,
            ResourceGroupUpdate(name="  Quarterly planning  "),
            user,
            db,
        )

        assert response.name == "Quarterly planning"
        assert response.file_count == 1
        assert (await db.get(ResourceGroup, group.id)).name == "Quarterly planning"
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_rename_rejects_default_and_case_insensitive_duplicates() -> None:
    engine, db = await make_session()
    try:
        user = make_user("rename-rules@example.com")
        db.add(user)
        await db.flush()
        default = ResourceGroup(user_id=user.id, name="Default", is_default=True)
        first = ResourceGroup(user_id=user.id, name="Finance", is_default=False)
        second = ResourceGroup(user_id=user.id, name="Planning", is_default=False)
        db.add_all([default, first, second])
        await db.flush()

        with pytest.raises(HTTPException, match="cannot be renamed") as default_error:
            await rename_resource_group(
                default.id,
                ResourceGroupUpdate(name="Inbox"),
                user,
                db,
            )
        assert default_error.value.status_code == 400

        with pytest.raises(HTTPException, match="already exists") as duplicate_error:
            await rename_resource_group(
                second.id,
                ResourceGroupUpdate(name=" finance "),
                user,
                db,
            )
        assert duplicate_error.value.status_code == 400
        assert (await db.get(ResourceGroup, second.id)).name == "Planning"
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_batch_move_deduplicates_ids_and_moves_owned_files() -> None:
    engine, db = await make_session()
    try:
        user = make_user("batch@example.com")
        db.add(user)
        await db.flush()
        default = ResourceGroup(user_id=user.id, name="Default", is_default=True)
        target = ResourceGroup(user_id=user.id, name="Renewals", is_default=False)
        first = make_file(user, "first.txt")
        second = make_file(user, "second.txt")
        db.add_all([default, target, first, second])
        await db.flush()
        db.add_all(
            [
                ResourceGroupFile(resource_group_id=default.id, file_id=first.id),
                ResourceGroupFile(resource_group_id=default.id, file_id=second.id),
            ]
        )
        await db.flush()

        response = await batch_assign_files_to_resource_group(
            ResourceGroupBatchAssign(
                file_ids=[first.id, first.id, second.id],
                resource_group_id=target.id,
            ),
            user,
            db,
        )

        assert response.resource_group_id == target.id
        assert response.moved_count == 2
        links = list((await db.execute(select(ResourceGroupFile))).scalars().all())
        assert {link.resource_group_id for link in links} == {target.id}
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_batch_move_prevalidates_ownership_before_any_file_changes() -> None:
    engine, db = await make_session()
    try:
        user = make_user("owner@example.com")
        other_user = make_user("other@example.com")
        db.add_all([user, other_user])
        await db.flush()
        default = ResourceGroup(user_id=user.id, name="Default", is_default=True)
        target = ResourceGroup(user_id=user.id, name="Target", is_default=False)
        owned = make_file(user, "owned.txt")
        foreign = make_file(other_user, "foreign.txt")
        db.add_all([default, target, owned, foreign])
        await db.flush()
        db.add(ResourceGroupFile(resource_group_id=default.id, file_id=owned.id))
        await db.flush()

        with pytest.raises(HTTPException, match="File not found") as error:
            await batch_assign_files_to_resource_group(
                ResourceGroupBatchAssign(
                    file_ids=[owned.id, foreign.id],
                    resource_group_id=target.id,
                ),
                user,
                db,
            )

        assert error.value.status_code == 404
        link = (
            await db.execute(
                select(ResourceGroupFile).where(ResourceGroupFile.file_id == owned.id)
            )
        ).scalar_one()
        assert link.resource_group_id == default.id
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_batch_download_prevalidates_ownership_before_building_archive(
    monkeypatch,
) -> None:
    engine, db = await make_session()
    try:
        user = make_user("download-owner@example.com")
        other_user = make_user("download-other@example.com")
        db.add_all([user, other_user])
        await db.flush()
        owned = make_file(user, "owned.txt")
        foreign = make_file(other_user, "foreign.txt")
        db.add_all([owned, foreign])
        await db.flush()

        def fail_if_called(_items):
            raise AssertionError("archive builder must not run before ownership validation")

        monkeypatch.setattr(files_router, "build_source_archive", fail_if_called)
        with pytest.raises(HTTPException, match="File not found") as error:
            await batch_download_files(
                FileBatchDownloadRequest(file_ids=[owned.id, foreign.id]),
                user,
                db,
            )

        assert error.value.status_code == 404
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_batch_download_streams_exact_deduplicated_source_set(
    monkeypatch,
    tmp_path,
) -> None:
    engine, db = await make_session()
    try:
        monkeypatch.chdir(tmp_path)
        user = make_user("download-success@example.com")
        db.add(user)
        await db.flush()
        first = make_file(user, "brief.txt")
        second = make_file(user, "data.csv")
        first.file_size = len(b"exact brief")
        second.file_size = len(b"quarter,value\nQ3,42\n")
        db.add_all([first, second])
        await db.flush()
        upload_directory = tmp_path / "uploads" / str(user.id)
        upload_directory.mkdir(parents=True)
        (upload_directory / first.filename).write_bytes(b"exact brief")
        (upload_directory / second.filename).write_bytes(b"quarter,value\nQ3,42\n")

        response = await batch_download_files(
            FileBatchDownloadRequest(file_ids=[second.id, first.id, second.id]),
            user,
            db,
        )
        payload = b"".join([chunk async for chunk in response.body_iterator])

        assert response.media_type == "application/zip"
        assert response.headers["content-disposition"] == (
            'attachment; filename="workerbee-sources.zip"'
        )
        with ZipFile(BytesIO(payload)) as zip_file:
            assert zip_file.namelist() == ["data.csv", "brief.txt"]
            assert zip_file.read("data.csv") == b"quarter,value\nQ3,42\n"
            assert zip_file.read("brief.txt") == b"exact brief"
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_delete_rejects_nonempty_group_and_removes_empty_group() -> None:
    engine, db = await make_session()
    try:
        user = make_user("delete@example.com")
        db.add(user)
        await db.flush()
        nonempty = ResourceGroup(user_id=user.id, name="Has files", is_default=False)
        empty = ResourceGroup(user_id=user.id, name="Ready to delete", is_default=False)
        source = make_file(user, "source.txt")
        db.add_all([nonempty, empty, source])
        await db.flush()
        db.add(ResourceGroupFile(resource_group_id=nonempty.id, file_id=source.id))
        await db.flush()

        with pytest.raises(HTTPException, match="must be empty") as error:
            await delete_resource_group(nonempty.id, user, db)
        assert error.value.status_code == 400

        await delete_resource_group(empty.id, user, db)
        await db.flush()
        assert await db.get(ResourceGroup, nonempty.id) is not None
        assert await db.get(ResourceGroup, empty.id) is None
    finally:
        await db.close()
        await engine.dispose()
