import csv
import json
import uuid
from pathlib import Path

import pytest

from app.project_status_renderer import (
    ProjectStatusRenderError,
    render_project_status,
)
from app.routers import agents as agents_router
from app.work_packs import normalize_work_pack


def _status_spec() -> dict[str, object]:
    return {
        "project_name": "Atlas rollout",
        "status_period": "Week ending July 24, 2026",
        "cadence": "Weekly",
        "prepared_for": "Steering committee",
        "objective": "Launch the new operating workflow across three regions by September.",
        "overall_health": "at_risk",
        "trend": "stable",
        "health_rationale": "The pilot is progressing, but the identity integration milestone is blocked.",
        "health_confidence_or_issue": "The finance workstream did not provide an update.",
        "executive_summary": "Pilot configuration advanced this week while the identity dependency remains the critical path.",
        "accomplishments": [
            {
                "statement": "The operations workflow passed user acceptance testing.",
                "source_filename": "weekly-notes.docx",
                "confidence_or_issue": "",
            }
        ],
        "register_items": [
            {
                "item_id": "M-01",
                "type": "milestone",
                "summary": "Complete identity integration",
                "status": "blocked",
                "owner": "Platform team",
                "due_date": "July 29, 2026",
                "impact_or_next_step": "Escalate vendor configuration access.",
                "source_filename": "project-plan.xlsx",
                "confidence_or_issue": "",
            },
            {
                "item_id": "R-04",
                "type": "risk",
                "summary": "Integration delay may compress regional training.",
                "status": "at_risk",
                "owner": "",
                "due_date": "",
                "impact_or_next_step": "Evaluate a staged training start.",
                "source_filename": "weekly-notes.docx",
                "confidence_or_issue": "",
            },
            {
                "item_id": "A-03",
                "type": "action",
                "summary": "Confirm vendor access path.",
                "status": "open",
                "owner": "",
                "due_date": "",
                "impact_or_next_step": "Unblock identity integration.",
                "source_filename": "weekly-notes.docx",
                "confidence_or_issue": "Action was recorded without assignment.",
            },
            {
                "item_id": "D-02",
                "type": "decision",
                "summary": "Use staged regional training if integration slips past July 29.",
                "status": "pending",
                "owner": "Steering committee",
                "due_date": "July 28, 2026",
                "impact_or_next_step": "Decision needed before training invitations.",
                "source_filename": "decision-log.csv",
                "confidence_or_issue": "",
            },
        ],
        "next_period_priorities": [
            {
                "priority": "Unblock identity integration and confirm the training approach.",
                "source_filename": "weekly-notes.docx",
                "confidence_or_issue": "",
            }
        ],
        "changes_since_last_update": [
            "Identity integration moved from at risk to blocked."
        ],
        "open_questions": ["Will vendor access be available before July 29?"],
        "data_quality": ["No finance workstream update was supplied."],
        "sources": [
            {
                "filename": "weekly-notes.docx",
                "role": "Current-period team update",
                "limitations": "Finance workstream absent.",
            },
            {
                "filename": "project-plan.xlsx",
                "role": "Milestones and target dates",
                "limitations": "Updated two days before the period end.",
            },
            {
                "filename": "decision-log.csv",
                "role": "Open and completed decisions",
                "limitations": "Decision rationale is abbreviated.",
            },
        ],
    }


def _work_pack() -> dict[str, object] | None:
    return normalize_work_pack(
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


def test_renderer_creates_aligned_report_register_and_draft_message(
    tmp_path: Path,
) -> None:
    spec_path = tmp_path / "project-status-content.json"
    spec_path.write_text(json.dumps(_status_spec()), encoding="utf-8")

    metadata = render_project_status(spec_path, tmp_path)

    assert metadata["overall_health"] == "at_risk"
    assert metadata["register_item_count"] == 4
    assert metadata["risk_count"] == 1
    report = (tmp_path / "project-status-report.md").read_text(encoding="utf-8")
    assert "Week ending July 24, 2026" in report
    assert "At Risk" in report
    assert "Complete identity integration" in report
    assert "Review health, owners, dates" in report
    message = (tmp_path / "status-update-message.md").read_text(encoding="utf-8")
    assert "Draft — review recipients" in message
    assert "WorkerBee did not send this message" in message
    assert "identity dependency remains the critical path" in message
    assert "Integration delay may compress regional training" in message

    with (tmp_path / "project-register.csv").open(
        encoding="utf-8", newline=""
    ) as handle:
        rows = list(csv.DictReader(handle))
    assert list(rows[0]) == [
        "item_id",
        "type",
        "summary",
        "status",
        "owner",
        "due_date",
        "impact_or_next_step",
        "source_filename",
        "confidence_or_issue",
    ]
    assert rows[0]["item_id"] == "M-01"
    assert rows[2]["owner"] == ""
    assert "owner not stated" in rows[2]["confidence_or_issue"]
    assert "date not stated" in rows[2]["confidence_or_issue"]


def test_renderer_downgrades_invalid_status_and_unknown_sources(tmp_path: Path) -> None:
    spec = _status_spec()
    spec["overall_health"] = "green"
    spec["trend"] = "accelerating"
    spec["register_items"][0]["status"] = "almost done"  # type: ignore[index]
    spec["register_items"][0]["source_filename"] = "invented-plan.xlsx"  # type: ignore[index]
    spec_path = tmp_path / "project-status-content.json"
    spec_path.write_text(json.dumps(spec), encoding="utf-8")

    metadata = render_project_status(spec_path, tmp_path)

    assert metadata["overall_health"] == "not_assessed"
    with (tmp_path / "project-register.csv").open(
        encoding="utf-8", newline=""
    ) as handle:
        first = next(csv.DictReader(handle))
    assert first["status"] == "not_assessed"
    assert first["source_filename"] == "unsupported"
    assert "status was not assessed" in first["confidence_or_issue"]
    assert "supplied source filename not found" in first["confidence_or_issue"]

    spec = _status_spec()
    spec["sources"] = []
    spec_path.write_text(json.dumps(spec), encoding="utf-8")
    with pytest.raises(ProjectStatusRenderError, match="At least one source"):
        render_project_status(spec_path, tmp_path)


def test_execution_postprocessor_renders_project_status_artifacts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid.uuid4()
    execution_id = uuid.uuid4()
    uploads_root = tmp_path / "uploads"
    spec_path = (
        uploads_root
        / str(user_id)
        / "generated"
        / str(execution_id)
        / "project-status-content.json"
    )
    spec_path.parent.mkdir(parents=True)
    spec_path.write_text(json.dumps(_status_spec()), encoding="utf-8")
    monkeypatch.setattr(agents_router, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(agents_router, "UPLOADS_ROOT", uploads_root)

    artifacts, result = agents_router._render_project_status_work_pack(
        work_pack=_work_pack(),
        artifact_paths=[str(spec_path.relative_to(tmp_path))],
        user_id=user_id,
        execution_id=execution_id,
    )

    assert [artifact["filename"] for artifact in artifacts] == [
        "project-status-report.md",
        "project-register.csv",
        "status-update-message.md",
    ]
    assert result is not None
    assert result["success"] is True
    assert result["source"] == "workerbee-renderer"
    assert result["register_item_count"] == 4
    assert all((tmp_path / artifact["storage_path"]).is_file() for artifact in artifacts)
