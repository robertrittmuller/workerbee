import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base
from app.models import File, SourceSet, SourceSetFile, User
from app.routers.files import (
    create_source_set,
    delete_source_set,
    list_source_sets,
    update_source_set,
)
from app.schemas import SourceSetCreate, SourceSetUpdate


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
        full_name="Source Set Tester",
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
async def test_create_and_list_source_set_preserve_deduplicated_order() -> None:
    engine, db = await make_session()
    try:
        user = make_user("sets@example.com")
        db.add(user)
        await db.flush()
        first = make_file(user, "first.txt")
        second = make_file(user, "second.txt")
        db.add_all([first, second])
        await db.flush()

        created = await create_source_set(
            SourceSetCreate(
                name="  Q3 renewal evidence  ",
                file_ids=[second.id, first.id, second.id],
            ),
            user,
            db,
        )

        assert created.name == "Q3 renewal evidence"
        assert created.file_ids == [second.id, first.id]
        assert created.file_count == 2
        listed = await list_source_sets(user, db)
        assert [source_set.name for source_set in listed] == ["Q3 renewal evidence"]
        assert listed[0].file_ids == [second.id, first.id]
        links = list(
            (
                await db.execute(
                    select(SourceSetFile).order_by(SourceSetFile.position)
                )
            ).scalars().all()
        )
        assert [(link.file_id, link.position) for link in links] == [
            (second.id, 0),
            (first.id, 1),
        ]
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_create_source_set_prevalidates_complete_owned_membership() -> None:
    engine, db = await make_session()
    try:
        user = make_user("owner@example.com")
        other_user = make_user("other@example.com")
        db.add_all([user, other_user])
        await db.flush()
        owned = make_file(user, "owned.txt")
        foreign = make_file(other_user, "foreign.txt")
        db.add_all([owned, foreign])
        await db.flush()

        with pytest.raises(HTTPException, match="File not found") as error:
            await create_source_set(
                SourceSetCreate(name="Unsafe partial", file_ids=[owned.id, foreign.id]),
                user,
                db,
            )

        assert error.value.status_code == 404
        assert (await db.execute(select(SourceSet))).scalar_one_or_none() is None
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_update_source_set_is_atomic_and_rejects_duplicate_names() -> None:
    engine, db = await make_session()
    try:
        user = make_user("update@example.com")
        other_user = make_user("update-other@example.com")
        db.add_all([user, other_user])
        await db.flush()
        first = make_file(user, "first.txt")
        second = make_file(user, "second.txt")
        foreign = make_file(other_user, "foreign.txt")
        db.add_all([first, second, foreign])
        await db.flush()
        primary = await create_source_set(
            SourceSetCreate(name="Weekly review", file_ids=[first.id, second.id]),
            user,
            db,
        )
        await create_source_set(
            SourceSetCreate(name="Quarterly review", file_ids=[first.id]),
            user,
            db,
        )

        with pytest.raises(HTTPException, match="File not found") as membership_error:
            await update_source_set(
                primary.id,
                SourceSetUpdate(file_ids=[second.id, foreign.id]),
                user,
                db,
            )
        assert membership_error.value.status_code == 404
        original_links = list(
            (
                await db.execute(
                    select(SourceSetFile)
                    .where(SourceSetFile.source_set_id == primary.id)
                    .order_by(SourceSetFile.position)
                )
            ).scalars().all()
        )
        assert [link.file_id for link in original_links] == [first.id, second.id]

        with pytest.raises(HTTPException, match="already exists") as name_error:
            await update_source_set(
                primary.id,
                SourceSetUpdate(name=" quarterly REVIEW "),
                user,
                db,
            )
        assert name_error.value.status_code == 400

        updated = await update_source_set(
            primary.id,
            SourceSetUpdate(name="Weekly decision review", file_ids=[second.id]),
            user,
            db,
        )
        assert updated.name == "Weekly decision review"
        assert updated.file_ids == [second.id]
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_delete_source_set_preserves_underlying_files() -> None:
    engine, db = await make_session()
    try:
        user = make_user("delete-set@example.com")
        db.add(user)
        await db.flush()
        source = make_file(user, "keep-me.txt")
        db.add(source)
        await db.flush()
        created = await create_source_set(
            SourceSetCreate(name="Temporary set", file_ids=[source.id]),
            user,
            db,
        )

        await delete_source_set(created.id, user, db)
        await db.flush()

        assert await db.get(SourceSet, created.id) is None
        assert await db.get(File, source.id) is not None
    finally:
        await db.close()
        await engine.dispose()
