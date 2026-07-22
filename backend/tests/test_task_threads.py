import uuid

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.database import Base
from app.models import Agent, Artifact, File, TaskThread, TaskThreadAttempt, User
from app.routers.agents import run_agent
from app.routers.task_threads import get_task_thread
from app.schemas import AgentRunRequest
from app.work_packs import normalize_work_pack


@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture
async def user_and_agent(db_session):
    user = User(
        email=f"thread-{uuid.uuid4()}@example.com",
        password_hash="not-used",
        full_name="Thread Tester",
    )
    db_session.add(user)
    await db_session.flush()
    agent = Agent(
        user_id=user.id,
        name="Renewal summary",
        description="Summarize renewals",
        config={"resource_ids": [], "work_pack": {"id": "document-summarization"}},
    )
    db_session.add(agent)
    await db_session.commit()
    return user, agent


async def test_new_runs_create_a_thread_and_retries_add_versions(
    db_session,
    user_and_agent,
):
    user, agent = user_and_agent
    first = await run_agent(
        agent.id,
        AgentRunRequest(
            task_prompt="Summarize the renewal position.",
            thread_title="Renewal decision brief",
        ),
        BackgroundTasks(),
        user,
        db_session,
    )

    thread_result = await db_session.execute(
        select(TaskThread)
        .options(selectinload(TaskThread.attempts))
        .where(TaskThread.user_id == user.id)
    )
    thread = thread_result.scalar_one()
    assert thread.title == "Renewal decision brief"
    assert thread.original_prompt == "Summarize the renewal position."
    assert thread.status == "pending"
    assert len(thread.attempts) == 1
    assert first.result["thread_id"] == str(thread.id)
    assert first.result["attempt_number"] == 1

    first.status = "completed"
    thread.status = "completed"
    db_session.add(
        Artifact(
            execution_id=first.id,
            filename="executive-brief.md",
            content_type="text/markdown",
            file_size=12,
            storage_path="uploads/test/executive-brief.md",
        )
    )
    await db_session.commit()

    second_background = BackgroundTasks()
    second = await run_agent(
        agent.id,
        AgentRunRequest(
            thread_id=thread.id,
            revision_note="Make the risk section more specific.",
            base_execution_id=first.id,
        ),
        second_background,
        user,
        db_session,
    )
    assert second.result["thread_id"] == str(thread.id)
    assert second.result["attempt_number"] == 2
    assert second.result["revision_note"] == "Make the risk section more specific."
    assert second.result["task_prompt"] == (
        f"{thread.original_prompt}\n\n"
        "Revision request:\nUse the attached prior deliverable as the base version. "
        "Make the risk section more specific."
    )
    assert second.result["base_execution_id"] == str(first.id)
    revision_inputs = second_background.tasks[0].args[6]
    assert [item["filename"] for item in revision_inputs] == ["executive-brief.md"]

    second.status = "completed"
    thread.status = "completed"
    db_session.add(
        Artifact(
            execution_id=second.id,
            filename="executive-brief.md",
            content_type="text/markdown",
            file_size=18,
            storage_path="uploads/test/executive-brief-v2.md",
        )
    )
    await db_session.commit()

    db_session.expire(thread, ["attempts"])
    detail = await get_task_thread(thread.id, user, db_session)
    assert detail.attempt_count == 2
    assert detail.latest_execution_id == second.id
    assert detail.latest_attempt_number == 2
    assert detail.artifact_count == 2
    assert [attempt.attempt_number for attempt in detail.attempts] == [2, 1]
    assert detail.attempts[0].artifacts[0].file_size == 18


async def test_thread_rejects_parallel_attempts(db_session, user_and_agent):
    user, agent = user_and_agent
    first = await run_agent(
        agent.id,
        AgentRunRequest(task_prompt="Prepare a brief."),
        BackgroundTasks(),
        user,
        db_session,
    )
    attempt_result = await db_session.execute(
        select(TaskThreadAttempt).where(
            TaskThreadAttempt.execution_id == first.id
        )
    )
    thread_id = attempt_result.scalar_one().thread_id

    with pytest.raises(HTTPException) as error:
        await run_agent(
            agent.id,
            AgentRunRequest(thread_id=thread_id),
            BackgroundTasks(),
            user,
            db_session,
        )
    assert error.value.status_code == 409


async def test_recurring_report_can_replace_period_answers_for_a_new_attempt(
    db_session,
    user_and_agent,
):
    user, _ = user_and_agent
    work_pack = normalize_work_pack(
        "recurring-reporting",
        {
            "id": "recurring-reporting",
            "answers": {
                "report_name": "Weekly operating review",
                "audience": "Leadership team",
                "reporting_period": "Week ending July 21, 2026",
                "cadence": "Weekly",
                "metrics": "Revenue, renewal coverage",
                "comparison": "Previous period",
                "focus": ["Trend changes", "Missed targets"],
                "include_actions": True,
            },
        },
    )
    agent = Agent(
        user_id=user.id,
        name="Weekly operating review",
        description="Repeatable KPI report",
        config={"resource_ids": [], "work_pack": work_pack},
    )
    db_session.add(agent)
    source = File(
        user_id=user.id,
        filename="weekly-results.csv",
        original_filename="weekly-results.csv",
        content_type="text/csv",
        file_size=42,
        storage_path="uploads/test/weekly-results.csv",
        file_type="csv",
    )
    db_session.add(source)
    await db_session.commit()

    first = await run_agent(
        agent.id,
        AgentRunRequest(task_prompt="Create the weekly report."),
        BackgroundTasks(),
        user,
        db_session,
    )
    thread_result = await db_session.execute(
        select(TaskThread)
        .options(selectinload(TaskThread.attempts))
        .where(TaskThread.agent_id == agent.id)
    )
    thread = thread_result.scalar_one()
    first.status = "completed"
    thread.status = "completed"
    await db_session.commit()

    with pytest.raises(HTTPException) as missing_source_error:
        await run_agent(
            agent.id,
            AgentRunRequest(
                thread_id=thread.id,
                work_pack_answers={"reporting_period": "Week ending July 28, 2026"},
            ),
            BackgroundTasks(),
            user,
            db_session,
        )
    assert missing_source_error.value.status_code == 400
    assert "source file" in str(missing_source_error.value.detail)

    background = BackgroundTasks()
    second = await run_agent(
        agent.id,
        AgentRunRequest(
            thread_id=thread.id,
            task_prompt="Run the saved report for the next period.",
            resource_ids=[source.id],
            work_pack_answers={"reporting_period": "Week ending July 28, 2026"},
        ),
        background,
        user,
        db_session,
    )

    assert second.result["attempt_number"] == 2
    assert second.result["work_pack"]["answers"]["reporting_period"] == (
        "Week ending July 28, 2026"
    )
    assert thread.work_pack["answers"]["reporting_period"] == "Week ending July 28, 2026"
    execution_config = background.tasks[0].args[3]
    assert execution_config["work_pack"]["answers"]["reporting_period"] == (
        "Week ending July 28, 2026"
    )


async def test_project_status_can_replace_period_and_sources_for_next_update(
    db_session,
    user_and_agent,
):
    user, _ = user_and_agent
    work_pack = normalize_work_pack(
        "project-status-reporting",
        {
            "id": "project-status-reporting",
            "answers": {
                "project_name": "Atlas rollout",
                "audience": "Steering committee",
                "status_period": "Week ending July 24, 2026",
                "cadence": "Weekly",
                "objective": "Launch the new workflow by September",
                "focus": ["Overall health", "Milestones", "Risks and issues"],
                "health_method": "Assess from source-supported signals",
                "message_tone": "Concise and direct",
            },
        },
    )
    agent = Agent(
        user_id=user.id,
        name="Atlas project status",
        description="Repeatable project update",
        config={"resource_ids": [], "work_pack": work_pack},
    )
    db_session.add(agent)
    source = File(
        user_id=user.id,
        filename="atlas-weekly-notes.docx",
        original_filename="atlas-weekly-notes.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        file_size=42,
        storage_path="uploads/test/atlas-weekly-notes.docx",
        file_type="document",
    )
    db_session.add(source)
    await db_session.commit()

    first = await run_agent(
        agent.id,
        AgentRunRequest(task_prompt="Create the Atlas project update."),
        BackgroundTasks(),
        user,
        db_session,
    )
    thread_result = await db_session.execute(
        select(TaskThread)
        .options(selectinload(TaskThread.attempts))
        .where(TaskThread.agent_id == agent.id)
    )
    thread = thread_result.scalar_one()
    first.status = "completed"
    thread.status = "completed"
    await db_session.commit()

    background = BackgroundTasks()
    second = await run_agent(
        agent.id,
        AgentRunRequest(
            thread_id=thread.id,
            task_prompt="Create the next project status update from current sources.",
            resource_ids=[source.id],
            work_pack_answers={"status_period": "Week ending July 31, 2026"},
        ),
        background,
        user,
        db_session,
    )

    assert second.result["attempt_number"] == 2
    assert second.result["work_pack"]["answers"]["status_period"] == (
        "Week ending July 31, 2026"
    )
    assert thread.work_pack["answers"]["status_period"] == "Week ending July 31, 2026"
    assert thread.resource_ids == [str(source.id)]
    execution_config = background.tasks[0].args[3]
    assert execution_config["work_pack"]["answers"]["status_period"] == (
        "Week ending July 31, 2026"
    )
