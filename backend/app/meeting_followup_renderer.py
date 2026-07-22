"""Deterministic deliverables for WorkerBee meeting follow-up work packs."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


class MeetingFollowupRenderError(ValueError):
    """Raised when meeting follow-up content cannot be rendered safely."""


def _text(value: Any, *, maximum: int = 2_000, required: bool = False, field: str = "value") -> str:
    if not isinstance(value, str):
        if required:
            raise MeetingFollowupRenderError(f"{field} must be text.")
        return ""
    normalized = " ".join(value.replace("\x00", "").split()).strip()
    if required and not normalized:
        raise MeetingFollowupRenderError(f"{field} is required.")
    return normalized[:maximum]


def _items(value: Any, *, maximum: int) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value[:maximum] if isinstance(item, dict)]


def _source(value: Any) -> str:
    raw = _text(value, maximum=255)
    return Path(raw).name if raw else ""


def _markdown_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def _display(value: str) -> str:
    return value or "Not stated"


def _normalize_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise MeetingFollowupRenderError("follow-up-content.json must contain an object.")
    meeting = payload.get("meeting")
    if not isinstance(meeting, dict):
        raise MeetingFollowupRenderError("meeting must contain an object.")
    participants = payload.get("participants", meeting.get("participants"))
    normalized_participants = [
        _text(participant, maximum=120)
        for participant in (participants if isinstance(participants, list) else [])[:50]
    ]
    normalized_participants = [participant for participant in normalized_participants if participant]

    decisions: list[dict[str, str]] = []
    for item in _items(payload.get("decisions"), maximum=30):
        decision = _text(item.get("decision"), maximum=700, required=True, field="decision")
        decisions.append(
            {
                "decision": decision,
                "context": _text(item.get("context"), maximum=700),
                "source": _source(item.get("source_filename", item.get("source"))),
                "confidence_or_issue": _text(item.get("confidence_or_issue"), maximum=240),
            }
        )

    actions: list[dict[str, str]] = []
    for index, item in enumerate(_items(payload.get("actions"), maximum=100), start=1):
        action = _text(item.get("action"), maximum=700, required=True, field=f"action {index}")
        owner = _text(item.get("owner"), maximum=160)
        due_date = _text(item.get("due_date"), maximum=80)
        issue = _text(item.get("confidence_or_issue"), maximum=240)
        missing = []
        if not owner:
            missing.append("owner not stated")
        if not due_date:
            missing.append("due date not stated")
        if missing:
            issue = "; ".join([issue, *missing]).strip("; ")
        actions.append(
            {
                "action_id": f"A{index:02d}",
                "action": action,
                "owner": owner,
                "due_date": due_date,
                "status": _text(item.get("status"), maximum=80) or "Open",
                "source_filename": _source(item.get("source_filename", item.get("source"))),
                "confidence_or_issue": issue,
            }
        )

    questions: list[dict[str, str]] = []
    for item in _items(payload.get("open_questions"), maximum=40):
        question = _text(item.get("question"), maximum=700, required=True, field="open question")
        questions.append(
            {
                "question": question,
                "owner": _text(item.get("owner"), maximum=160),
                "source": _source(item.get("source_filename", item.get("source"))),
            }
        )

    raw_message = payload.get("follow_up_message")
    if not isinstance(raw_message, dict):
        raise MeetingFollowupRenderError("follow_up_message must contain an object.")
    raw_paragraphs = raw_message.get("body_paragraphs")
    body_paragraphs = [
        _text(paragraph, maximum=1_500)
        for paragraph in (raw_paragraphs if isinstance(raw_paragraphs, list) else [])[:12]
    ]
    body_paragraphs = [paragraph for paragraph in body_paragraphs if paragraph]
    if not body_paragraphs:
        raise MeetingFollowupRenderError("follow_up_message.body_paragraphs is required.")

    return {
        "meeting": {
            "name": _text(meeting.get("name"), maximum=240, required=True, field="meeting name"),
            "date": _text(meeting.get("date"), maximum=80),
            "participants": normalized_participants,
        },
        "executive_summary": _text(
            payload.get("executive_summary"),
            maximum=2_000,
            required=True,
            field="executive_summary",
        ),
        "decisions": decisions,
        "actions": actions,
        "open_questions": questions,
        "follow_up_message": {
            "subject": _text(raw_message.get("subject"), maximum=240, required=True, field="message subject"),
            "greeting": _text(raw_message.get("greeting"), maximum=160),
            "body_paragraphs": body_paragraphs,
            "closing": _text(raw_message.get("closing"), maximum=240),
        },
    }


def _render_summary(payload: dict[str, Any]) -> str:
    meeting = payload["meeting"]
    lines = [
        f"# {meeting['name']} — Follow-up",
        "",
        f"- **Date:** {_display(meeting['date'])}",
        f"- **Participants:** {', '.join(meeting['participants']) or 'Not stated'}",
        "",
        "## Executive summary",
        "",
        payload["executive_summary"],
        "",
        "## Decisions",
        "",
    ]
    if payload["decisions"]:
        lines.extend(
            [
                "| Decision | Context | Source | Confidence or issue |",
                "| --- | --- | --- | --- |",
            ]
        )
        for item in payload["decisions"]:
            lines.append(
                "| "
                + " | ".join(
                    _markdown_cell(_display(item[key]))
                    for key in ("decision", "context", "source", "confidence_or_issue")
                )
                + " |"
            )
    else:
        lines.append("No decisions were explicitly recorded in the supplied sources.")

    lines.extend(
        [
            "",
            "## Action items",
            "",
            "| ID | Action | Owner | Due date | Status | Source | Confidence or issue |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    if payload["actions"]:
        for item in payload["actions"]:
            lines.append(
                "| "
                + " | ".join(
                    _markdown_cell(_display(item[key]))
                    for key in (
                        "action_id",
                        "action",
                        "owner",
                        "due_date",
                        "status",
                        "source_filename",
                        "confidence_or_issue",
                    )
                )
                + " |"
            )
    else:
        lines.append("| — | No action items were explicitly recorded. | — | — | — | — | — |")

    lines.extend(["", "## Open questions", ""])
    if payload["open_questions"]:
        for item in payload["open_questions"]:
            details = [
                detail
                for detail in (
                    f"Owner: {item['owner']}" if item["owner"] else "",
                    f"Source: {item['source']}" if item["source"] else "",
                )
                if detail
            ]
            suffix = f" ({'; '.join(details)})" if details else ""
            lines.append(f"- {item['question']}{suffix}")
    else:
        lines.append("No open questions were explicitly recorded in the supplied sources.")
    lines.extend(
        [
            "",
            "> Review this follow-up against the source notes before sharing. Missing owners and due dates are intentionally left unstated.",
            "",
        ]
    )
    return "\n".join(lines)


def _render_message(payload: dict[str, Any]) -> str:
    message = payload["follow_up_message"]
    lines = ["# Draft follow-up message", "", f"**Subject:** {message['subject']}", ""]
    if message["greeting"]:
        lines.extend([message["greeting"], ""])
    for paragraph in message["body_paragraphs"]:
        lines.extend([paragraph, ""])
    if message["closing"]:
        lines.extend([message["closing"], ""])
    lines.extend(
        [
            "---",
            "Draft only — review recipients, commitments, owners, dates, and source support before sending.",
            "",
        ]
    )
    return "\n".join(lines)


def render_meeting_followup(spec_path: Path, output_dir: Path) -> dict[str, Any]:
    """Render a structured follow-up specification to Markdown and CSV artifacts."""
    try:
        raw_payload = json.loads(spec_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MeetingFollowupRenderError(f"Could not read follow-up-content.json: {exc}") from exc
    payload = _normalize_payload(raw_payload)
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = output_dir / "meeting-follow-up.md"
    actions_path = output_dir / "action-items.csv"
    message_path = output_dir / "follow-up-message.md"
    summary_path.write_text(_render_summary(payload), encoding="utf-8")
    message_path.write_text(_render_message(payload), encoding="utf-8")
    fieldnames = [
        "action_id",
        "action",
        "owner",
        "due_date",
        "status",
        "source_filename",
        "confidence_or_issue",
    ]
    with actions_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(payload["actions"])
    return {
        "meeting_name": payload["meeting"]["name"],
        "decision_count": len(payload["decisions"]),
        "action_count": len(payload["actions"]),
        "open_question_count": len(payload["open_questions"]),
        "files": [summary_path, actions_path, message_path],
    }
