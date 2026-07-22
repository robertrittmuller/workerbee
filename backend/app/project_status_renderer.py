"""Deterministic renderer for repeatable project-status work packs."""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any


class ProjectStatusRenderError(ValueError):
    """Raised when a project-status specification cannot be rendered safely."""


HEALTH_VALUES = {"on_track", "at_risk", "off_track", "not_assessed"}
TREND_VALUES = {"improving", "stable", "worsening", "not_assessed"}
ITEM_TYPES = {
    "milestone",
    "risk",
    "issue",
    "action",
    "decision",
    "dependency",
    "change",
}
ITEM_STATUSES = {
    "complete",
    "on_track",
    "at_risk",
    "blocked",
    "open",
    "in_progress",
    "pending",
    "closed",
    "not_assessed",
}


def _text(
    value: Any,
    *,
    maximum: int = 2_000,
    required: bool = False,
    field: str = "value",
) -> str:
    if not isinstance(value, str):
        if required:
            raise ProjectStatusRenderError(f"{field} must be text.")
        return ""
    normalized = " ".join(value.replace("\x00", "").split()).strip()
    if required and not normalized:
        raise ProjectStatusRenderError(f"{field} is required.")
    return normalized[:maximum]


def _objects(value: Any, *, maximum: int) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value[:maximum] if isinstance(item, dict)]


def _strings(value: Any, *, maximum: int, item_maximum: int = 1_000) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value[:maximum]:
        normalized = _text(item, maximum=item_maximum)
        if normalized and normalized not in result:
            result.append(normalized)
    return result


def _display(value: str) -> str:
    return value or "Not stated"


def _label(value: str) -> str:
    return value.replace("_", " ").title()


def _markdown_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def _normalize_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ProjectStatusRenderError(
            "project-status-content.json must contain an object."
        )

    sources: list[dict[str, str]] = []
    for item in _objects(payload.get("sources"), maximum=50):
        filename = Path(_text(item.get("filename"), maximum=300)).name
        if not filename or filename in {source["filename"] for source in sources}:
            continue
        sources.append(
            {
                "filename": filename,
                "role": _text(item.get("role"), maximum=1_000),
                "limitations": _text(item.get("limitations"), maximum=1_500),
            }
        )
    if not sources:
        raise ProjectStatusRenderError("At least one source assessment is required.")
    known_sources = {source["filename"] for source in sources}

    overall_health = _text(payload.get("overall_health"), maximum=40).lower()
    health_issue = _text(payload.get("health_confidence_or_issue"), maximum=500)
    if overall_health not in HEALTH_VALUES:
        overall_health = "not_assessed"
        health_issue = "; ".join(
            part for part in [health_issue, "overall health was not assessed"] if part
        )
    trend = _text(payload.get("trend"), maximum=40).lower()
    if trend not in TREND_VALUES:
        trend = "not_assessed"
        health_issue = "; ".join(
            part for part in [health_issue, "trend was not assessed"] if part
        )

    def normalize_source(value: Any) -> str:
        source = Path(_text(value, maximum=300)).name
        return source if source in known_sources else "unsupported"

    accomplishments: list[dict[str, str]] = []
    for item in _objects(payload.get("accomplishments"), maximum=30):
        statement = _text(
            item.get("statement"),
            maximum=1_500,
            required=True,
            field="accomplishment statement",
        )
        source = normalize_source(item.get("source_filename"))
        issue = _text(item.get("confidence_or_issue"), maximum=500)
        if source == "unsupported":
            issue = "; ".join(
                part for part in [issue, "supplied source filename not found"] if part
            )
        accomplishments.append(
            {"statement": statement, "source_filename": source, "confidence_or_issue": issue}
        )

    register_items: list[dict[str, str]] = []
    for index, item in enumerate(
        _objects(payload.get("register_items"), maximum=200), start=1
    ):
        item_type = _text(item.get("type"), maximum=40).lower()
        if item_type not in ITEM_TYPES:
            item_type = "change"
        status = _text(item.get("status"), maximum=40).lower()
        issue = _text(item.get("confidence_or_issue"), maximum=500)
        if status not in ITEM_STATUSES:
            status = "not_assessed"
            issue = "; ".join(
                part for part in [issue, "status was not assessed"] if part
            )
        source = normalize_source(item.get("source_filename"))
        if source == "unsupported":
            issue = "; ".join(
                part for part in [issue, "supplied source filename not found"] if part
            )
        owner = _text(item.get("owner"), maximum=200)
        due_date = _text(item.get("due_date"), maximum=100)
        if item_type in {"action", "milestone"}:
            missing = []
            if not owner:
                missing.append("owner not stated")
            if not due_date:
                missing.append("date not stated")
            if missing:
                issue = "; ".join([issue, *missing]).strip("; ")
        register_items.append(
            {
                "item_id": _text(item.get("item_id"), maximum=80) or f"P{index:03d}",
                "type": item_type,
                "summary": _text(
                    item.get("summary"),
                    maximum=1_500,
                    required=True,
                    field=f"register item {index} summary",
                ),
                "status": status,
                "owner": owner,
                "due_date": due_date,
                "impact_or_next_step": _text(
                    item.get("impact_or_next_step"), maximum=1_500
                ),
                "source_filename": source,
                "confidence_or_issue": issue,
            }
        )
    if not register_items:
        raise ProjectStatusRenderError("At least one project register item is required.")

    priorities: list[dict[str, str]] = []
    for item in _objects(payload.get("next_period_priorities"), maximum=30):
        priority = _text(
            item.get("priority"), maximum=1_500, required=True, field="priority"
        )
        source = normalize_source(item.get("source_filename"))
        issue = _text(item.get("confidence_or_issue"), maximum=500)
        if source == "unsupported":
            issue = "; ".join(
                part for part in [issue, "supplied source filename not found"] if part
            )
        priorities.append(
            {"priority": priority, "source_filename": source, "confidence_or_issue": issue}
        )

    return {
        "project_name": _text(
            payload.get("project_name"), maximum=300, required=True, field="project_name"
        ),
        "status_period": _text(
            payload.get("status_period"), maximum=160, required=True, field="status_period"
        ),
        "cadence": _text(payload.get("cadence"), maximum=100),
        "prepared_for": _text(payload.get("prepared_for"), maximum=300),
        "objective": _text(payload.get("objective"), maximum=2_000),
        "overall_health": overall_health,
        "trend": trend,
        "health_rationale": _text(payload.get("health_rationale"), maximum=2_000),
        "health_confidence_or_issue": health_issue,
        "executive_summary": _text(
            payload.get("executive_summary"),
            maximum=3_500,
            required=True,
            field="executive_summary",
        ),
        "accomplishments": accomplishments,
        "register_items": register_items,
        "next_period_priorities": priorities,
        "changes_since_last_update": _strings(
            payload.get("changes_since_last_update"), maximum=30
        ),
        "open_questions": _strings(payload.get("open_questions"), maximum=30),
        "data_quality": _strings(payload.get("data_quality"), maximum=30),
        "sources": sources,
    }


def _render_items_table(items: list[dict[str, str]]) -> list[str]:
    if not items:
        return ["No source-supported items were identified."]
    lines = [
        "| Item | Status | Owner | Date | Impact or next step | Source | Confidence or issue |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for item in items:
        values = [
            item["summary"],
            _label(item["status"]),
            _display(item["owner"]),
            _display(item["due_date"]),
            _display(item["impact_or_next_step"]),
            item["source_filename"],
            _display(item["confidence_or_issue"]),
        ]
        lines.append("| " + " | ".join(_markdown_cell(value) for value in values) + " |")
    return lines


def _render_report(payload: dict[str, Any]) -> str:
    lines = [
        f"# {payload['project_name']} — Project status",
        "",
        f"- **Status period:** {payload['status_period']}",
        f"- **Cadence:** {_display(payload['cadence'])}",
        f"- **Prepared for:** {_display(payload['prepared_for'])}",
        f"- **Overall health:** {_label(payload['overall_health'])}",
        f"- **Trend:** {_label(payload['trend'])}",
        f"- **Objective:** {_display(payload['objective'])}",
        "",
        "## Executive update",
        "",
        payload["executive_summary"],
        "",
        "## Health rationale",
        "",
        payload["health_rationale"] or "No source-supported health rationale was supplied.",
    ]
    if payload["health_confidence_or_issue"]:
        lines.append(f"> Review note: {payload['health_confidence_or_issue']}")

    lines.extend(["", "## Accomplishments", ""])
    if payload["accomplishments"]:
        for item in payload["accomplishments"]:
            caveat = (
                f" — {item['confidence_or_issue']}" if item["confidence_or_issue"] else ""
            )
            lines.append(
                f"- {item['statement']} _(Source: {item['source_filename']})_{caveat}"
            )
    else:
        lines.append("No source-supported accomplishments were identified.")

    section_order = (
        ("Milestones", "milestone"),
        ("Risks", "risk"),
        ("Issues and blockers", "issue"),
        ("Actions", "action"),
        ("Decisions", "decision"),
        ("Dependencies", "dependency"),
        ("Changes", "change"),
    )
    for heading, item_type in section_order:
        lines.extend(["", f"## {heading}", ""])
        lines.extend(
            _render_items_table(
                [item for item in payload["register_items"] if item["type"] == item_type]
            )
        )

    lines.extend(["", "## Next-period priorities", ""])
    if payload["next_period_priorities"]:
        for item in payload["next_period_priorities"]:
            issue = f" — {item['confidence_or_issue']}" if item["confidence_or_issue"] else ""
            lines.append(
                f"- {item['priority']} _(Source: {item['source_filename']})_{issue}"
            )
    else:
        lines.append("No source-supported next-period priorities were supplied.")

    for heading, key, empty in (
        ("Changes since the last update", "changes_since_last_update", "No changes were stated."),
        ("Open questions", "open_questions", "No open questions were supplied."),
        ("Data quality and coverage", "data_quality", "No coverage note was supplied; verify source completeness before sharing."),
    ):
        lines.extend(["", f"## {heading}", ""])
        values = payload[key]
        lines.extend(f"- {value}" for value in values) if values else lines.append(empty)

    lines.extend(
        [
            "",
            "> Review health, owners, dates, status labels, source support, and period coverage before sharing.",
            "",
        ]
    )
    return "\n".join(lines)


def _render_message(payload: dict[str, Any]) -> str:
    by_type = {
        item_type: [
            item for item in payload["register_items"] if item["type"] == item_type
        ]
        for item_type in ITEM_TYPES
    }
    attention = [
        *[item for item in by_type["risk"] if item["status"] != "closed"],
        *[item for item in by_type["issue"] if item["status"] != "closed"],
        *[item for item in by_type["dependency"] if item["status"] in {"at_risk", "blocked", "open"}],
    ]
    lines = [
        "# Draft status update message",
        "",
        "> **Draft — review recipients, facts, commitments, owners, and dates before sending.** WorkerBee did not send this message.",
        "",
        f"- **To:** {_display(payload['prepared_for'])}",
        f"- **Subject:** {payload['project_name']} status — {payload['status_period']} — {_label(payload['overall_health'])}",
        "",
        "Hello,",
        "",
        payload["executive_summary"],
        "",
        f"Overall health is **{_label(payload['overall_health'])}** with a **{_label(payload['trend']).lower()}** trend.",
        "",
        "**Progress**",
    ]
    if payload["accomplishments"]:
        lines.extend(f"- {item['statement']}" for item in payload["accomplishments"])
    else:
        lines.append("- No source-supported accomplishments were identified for this period.")
    lines.extend(["", "**Needs attention**"])
    if attention:
        for item in attention:
            next_step = f" Next: {item['impact_or_next_step']}" if item["impact_or_next_step"] else ""
            lines.append(f"- {item['summary']} ({_label(item['status'])}).{next_step}")
    else:
        lines.append("- No open source-supported risks, issues, or blocked dependencies were identified.")
    lines.extend(["", "**Next period**"])
    if payload["next_period_priorities"]:
        lines.extend(
            f"- {item['priority']}" for item in payload["next_period_priorities"]
        )
    else:
        lines.append("- Priorities require review.")
    if payload["open_questions"]:
        lines.extend(["", "**Questions or decisions needed**"])
        lines.extend(f"- {item}" for item in payload["open_questions"])
    lines.extend(["", "Please review the linked status report and register for detail.", ""])
    return "\n".join(lines)


def render_project_status(spec_path: Path, output_dir: Path) -> dict[str, Any]:
    """Render one structured project update into coordinated review artifacts."""
    try:
        raw_payload = json.loads(spec_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ProjectStatusRenderError(
            f"Could not read project-status-content.json: {exc}"
        ) from exc
    payload = _normalize_payload(raw_payload)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "project-status-report.md"
    register_path = output_dir / "project-register.csv"
    message_path = output_dir / "status-update-message.md"
    report_path.write_text(_render_report(payload), encoding="utf-8")
    message_path.write_text(_render_message(payload), encoding="utf-8")

    fields = [
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
    with register_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(payload["register_items"])

    counts = Counter(item["type"] for item in payload["register_items"])
    return {
        "project_name": payload["project_name"],
        "status_period": payload["status_period"],
        "overall_health": payload["overall_health"],
        "register_item_count": len(payload["register_items"]),
        "risk_count": counts["risk"],
        "issue_count": counts["issue"],
        "action_count": counts["action"],
        "source_count": len(payload["sources"]),
        "files": [report_path, register_path, message_path],
    }
