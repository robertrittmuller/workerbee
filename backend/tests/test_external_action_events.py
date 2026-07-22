import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.database import Base
from app.models import Agent, Artifact, Execution, ExecutionLog, User
from app.routers.executions import record_external_action_event
from app.schemas import ExternalActionEventRequest


@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


async def _execution_with_message(db_session, email: str):
    user = User(email=email, password_hash="not-used", full_name="Action Tester")
    db_session.add(user)
    await db_session.flush()
    agent = Agent(user_id=user.id, name="Status assistant", config={})
    db_session.add(agent)
    await db_session.flush()
    execution = Execution(agent_id=agent.id, status="completed")
    db_session.add(execution)
    await db_session.flush()
    artifact = Artifact(
        execution_id=execution.id,
        filename="status-update-message.md",
        content_type="text/markdown",
        file_size=120,
        storage_path="uploads/test/status-update-message.md",
    )
    db_session.add(artifact)
    await db_session.commit()
    return user, execution, artifact


def _event(artifact: Artifact, stage: str = "approved") -> ExternalActionEventRequest:
    return ExternalActionEventRequest(
        action_type="email_draft_handoff",
        stage=stage,
        artifact_id=artifact.id,
        artifact_filename=artifact.filename,
        destination_label="Default email app",
        recipients=["leadership@example.com"],
        subject="Weekly project update",
        content_sha256="a" * 64,
        user_confirmed=True,
    )


def _calendar_event(
    artifact: Artifact, stage: str = "approved"
) -> ExternalActionEventRequest:
    return ExternalActionEventRequest(
        action_type="calendar_draft_handoff",
        stage=stage,
        artifact_id=artifact.id,
        artifact_filename=artifact.filename,
        destination_label="Default calendar app",
        recipients=["owner@example.com"],
        subject="Renewal follow-up",
        scheduled_start="2026-07-27T10:30",
        timezone="America/New_York",
        duration_minutes=45,
        content_sha256="c" * 64,
        user_confirmed=True,
    )


async def test_external_action_event_is_bound_to_execution_and_omits_body(db_session):
    user, execution, artifact = await _execution_with_message(
        db_session, f"action-{uuid.uuid4()}@example.com"
    )

    response = await record_external_action_event(
        execution.id, _event(artifact), user, db_session
    )

    assert response["status"] == "approved"
    result = await db_session.execute(
        select(ExecutionLog).where(ExecutionLog.id == uuid.UUID(response["id"]))
    )
    log = result.scalar_one()
    assert log.execution_id == execution.id
    assert log.message == "Email draft handoff approved"
    assert log.data["artifact_id"] == str(artifact.id)
    assert log.data["recipients"] == ["leadership@example.com"]
    assert "body" not in log.data


async def test_external_action_event_rejects_foreign_artifact_and_execution(db_session):
    user, execution, artifact = await _execution_with_message(
        db_session, f"owner-{uuid.uuid4()}@example.com"
    )
    other_user, other_execution, other_artifact = await _execution_with_message(
        db_session, f"other-{uuid.uuid4()}@example.com"
    )

    with pytest.raises(HTTPException) as artifact_error:
        await record_external_action_event(
            execution.id, _event(other_artifact), user, db_session
        )
    assert artifact_error.value.status_code == 404

    with pytest.raises(HTTPException) as execution_error:
        await record_external_action_event(
            other_execution.id, _event(other_artifact), user, db_session
        )
    assert execution_error.value.status_code == 404
    assert other_user.id != user.id
    assert artifact.id != other_artifact.id


def test_external_action_event_requires_confirmation_and_valid_recipients():
    payload = {
        "action_type": "email_draft_handoff",
        "stage": "approved",
        "artifact_id": uuid.uuid4(),
        "artifact_filename": "follow-up-message.md",
        "destination_label": "Default email app",
        "recipients": ["not-an-email"],
        "subject": "Follow-up",
        "content_sha256": "b" * 64,
        "user_confirmed": False,
    }
    with pytest.raises(ValidationError):
        ExternalActionEventRequest(**payload)


async def test_calendar_draft_event_records_schedule_without_notes(db_session):
    user, execution, artifact = await _execution_with_message(
        db_session, f"calendar-{uuid.uuid4()}@example.com"
    )
    artifact.filename = "meeting-follow-up.md"
    await db_session.commit()

    response = await record_external_action_event(
        execution.id, _calendar_event(artifact, stage="opened"), user, db_session
    )

    result = await db_session.execute(
        select(ExecutionLog).where(ExecutionLog.id == uuid.UUID(response["id"]))
    )
    log = result.scalar_one()
    assert log.message == "Calendar draft handoff opened"
    assert log.data["scheduled_start"] == "2026-07-27T10:30"
    assert log.data["timezone"] == "America/New_York"
    assert log.data["duration_minutes"] == 45
    assert log.data["recipients"] == ["owner@example.com"]
    assert "notes" not in log.data


def test_calendar_draft_event_requires_real_schedule_and_allows_no_attendees():
    base = {
        "action_type": "calendar_draft_handoff",
        "stage": "downloaded",
        "artifact_id": uuid.uuid4(),
        "artifact_filename": "meeting-follow-up.md",
        "destination_label": "Calendar file (.ics)",
        "recipients": [],
        "subject": "Follow-up",
        "scheduled_start": "2026-07-27T10:30",
        "timezone": "America/New_York",
        "duration_minutes": 30,
        "content_sha256": "d" * 64,
        "user_confirmed": True,
    }
    event = ExternalActionEventRequest(**base)
    assert event.recipients == []

    with pytest.raises(ValidationError):
        ExternalActionEventRequest(**{**base, "scheduled_start": "2026-02-30T10:30"})
    with pytest.raises(ValidationError):
        ExternalActionEventRequest(**{**base, "timezone": "Not/A_Real_Timezone"})
