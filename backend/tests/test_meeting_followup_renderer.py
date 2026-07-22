import csv
import json
import uuid
from pathlib import Path

import pytest

from app.meeting_followup_renderer import (
    MeetingFollowupRenderError,
    render_meeting_followup,
)
from app.routers import agents as agents_router
from app.work_packs import normalize_work_pack


def _followup_spec() -> dict[str, object]:
    return {
        "meeting": {
            "name": "Q3 operating review",
            "date": "July 21, 2026",
            "participants": ["COO", "Finance lead", "Regional owners"],
        },
        "executive_summary": "The team agreed to prioritize renewal recovery and review progress weekly.",
        "decisions": [
            {
                "decision": "Prioritize renewal recovery for the next 90 days.",
                "context": "Retention is the largest controllable gap.",
                "source_filename": "operating-review-notes.docx",
                "confidence_or_issue": "",
            }
        ],
        "actions": [
            {
                "action": "Publish the weekly renewal-risk list.",
                "owner": "Finance lead",
                "due_date": "July 25, 2026",
                "status": "Open",
                "source_filename": "operating-review-notes.docx",
                "confidence_or_issue": "",
            },
            {
                "action": "Confirm escalation owners for stalled renewals.",
                "owner": "",
                "due_date": "",
                "status": "Open",
                "source_filename": "meeting-transcript.txt",
                "confidence_or_issue": "Commitment was discussed but no owner was assigned",
            },
        ],
        "open_questions": [
            {
                "question": "Which threshold should trigger executive escalation?",
                "owner": "COO",
                "source_filename": "meeting-transcript.txt",
            }
        ],
        "follow_up_message": {
            "subject": "Q3 operating review — decisions and next steps",
            "greeting": "Team,",
            "body_paragraphs": [
                "Thank you for the focused discussion. We aligned on renewal recovery as the next 90-day priority.",
                "The attached action register captures the stated commitments and leaves unresolved ownership explicit.",
            ],
            "closing": "Please reply with corrections before Friday's review.",
        },
    }


def test_renderer_creates_consistent_summary_action_register_and_message(tmp_path: Path) -> None:
    spec_path = tmp_path / "follow-up-content.json"
    spec_path.write_text(json.dumps(_followup_spec()), encoding="utf-8")

    metadata = render_meeting_followup(spec_path, tmp_path)

    assert metadata["decision_count"] == 1
    assert metadata["action_count"] == 2
    assert metadata["open_question_count"] == 1
    summary = (tmp_path / "meeting-follow-up.md").read_text(encoding="utf-8")
    assert "Prioritize renewal recovery for the next 90 days" in summary
    assert "operating-review-notes.docx" in summary
    assert "Not stated" in summary
    message = (tmp_path / "follow-up-message.md").read_text(encoding="utf-8")
    assert "**Subject:** Q3 operating review — decisions and next steps" in message
    assert "Draft only" in message

    with (tmp_path / "action-items.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert list(rows[0]) == [
        "action_id",
        "action",
        "owner",
        "due_date",
        "status",
        "source_filename",
        "confidence_or_issue",
    ]
    assert rows[0]["action_id"] == "A01"
    assert rows[1]["owner"] == ""
    assert rows[1]["due_date"] == ""
    assert "owner not stated" in rows[1]["confidence_or_issue"]
    assert "due date not stated" in rows[1]["confidence_or_issue"]


def test_renderer_rejects_missing_message_or_invalid_actions(tmp_path: Path) -> None:
    spec = _followup_spec()
    spec.pop("follow_up_message")
    spec_path = tmp_path / "follow-up-content.json"
    spec_path.write_text(json.dumps(spec), encoding="utf-8")
    with pytest.raises(MeetingFollowupRenderError, match="follow_up_message"):
        render_meeting_followup(spec_path, tmp_path)

    spec = _followup_spec()
    spec["actions"] = [{"owner": "Someone"}]
    spec_path.write_text(json.dumps(spec), encoding="utf-8")
    with pytest.raises(MeetingFollowupRenderError, match="action 1"):
        render_meeting_followup(spec_path, tmp_path)


def test_execution_postprocessor_renders_followup_artifacts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid.uuid4()
    execution_id = uuid.uuid4()
    uploads_root = tmp_path / "uploads"
    spec_path = uploads_root / str(user_id) / "generated" / str(execution_id) / "follow-up-content.json"
    spec_path.parent.mkdir(parents=True)
    spec_path.write_text(json.dumps(_followup_spec()), encoding="utf-8")
    monkeypatch.setattr(agents_router, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(agents_router, "UPLOADS_ROOT", uploads_root)
    work_pack = normalize_work_pack(
        "meeting-follow-up",
        {
            "id": "meeting-follow-up",
            "answers": {
                "meeting_name": "Q3 operating review",
                "meeting_date": "July 21, 2026",
                "recipients": "Meeting attendees",
                "message_goal": "Confirm commitments",
                "focus": ["Decisions", "Action items", "Owners and dates"],
                "tone": "Crisp and direct",
                "include_unassigned_actions": True,
            },
        },
    )

    artifacts, result = agents_router._render_meeting_followup_work_pack(
        work_pack=work_pack,
        artifact_paths=[str(spec_path.relative_to(tmp_path))],
        user_id=user_id,
        execution_id=execution_id,
    )

    assert [artifact["filename"] for artifact in artifacts] == [
        "meeting-follow-up.md",
        "action-items.csv",
        "follow-up-message.md",
    ]
    assert result is not None
    assert result["success"] is True
    assert result["source"] == "workerbee-renderer"
    assert result["action_count"] == 2
    assert all((tmp_path / artifact["storage_path"]).is_file() for artifact in artifacts)
