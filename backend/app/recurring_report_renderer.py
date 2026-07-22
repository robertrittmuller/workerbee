"""Deterministic deliverables for recurring KPI reporting work packs."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


class RecurringReportRenderError(ValueError):
    """Raised when a recurring report specification cannot be rendered safely."""


STATUSES = {"on_track", "watch", "off_track", "not_assessed"}


def _text(
    value: Any,
    *,
    maximum: int = 2_000,
    required: bool = False,
    field: str = "value",
) -> str:
    if not isinstance(value, str):
        if required:
            raise RecurringReportRenderError(f"{field} must be text.")
        return ""
    normalized = " ".join(value.replace("\x00", "").split()).strip()
    if required and not normalized:
        raise RecurringReportRenderError(f"{field} is required.")
    return normalized[:maximum]


def _items(value: Any, *, maximum: int) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value[:maximum] if isinstance(item, dict)]


def _strings(value: Any, *, maximum: int, item_maximum: int = 500) -> list[str]:
    if not isinstance(value, list):
        return []
    values = [_text(item, maximum=item_maximum) for item in value[:maximum]]
    return [item for item in values if item]


def _source(value: Any) -> str:
    raw = _text(value, maximum=255)
    if not raw:
        return ""
    if raw.lower() == "unsupported":
        return "unsupported"
    return Path(raw).name


def _display(value: str) -> str:
    return value or "Not stated"


def _markdown_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def _normalize_metric(item: dict[str, Any], index: int) -> dict[str, str]:
    name = _text(item.get("name"), maximum=180, required=True, field=f"metric {index} name")
    source = _source(item.get("source_filename", item.get("source")))
    issue = _text(item.get("confidence_or_issue"), maximum=300)
    if not source:
        source = "unsupported"
        issue = "; ".join(part for part in (issue, "source not stated") if part)
    status = _text(item.get("status"), maximum=40).lower().replace(" ", "_")
    if status not in STATUSES:
        status = "not_assessed"
        issue = "; ".join(part for part in (issue, "status not assessed") if part)
    return {
        "metric_id": f"K{index:02d}",
        "name": name,
        "current_value": _text(
            item.get("current_value"), maximum=120, required=True, field=f"metric {index} current_value"
        ),
        "comparison_value": _text(item.get("comparison_value"), maximum=120),
        "change": _text(item.get("change"), maximum=120),
        "target": _text(item.get("target"), maximum=120),
        "status": status,
        "interpretation": _text(item.get("interpretation"), maximum=700),
        "calculation": _text(item.get("calculation"), maximum=700),
        "source_filename": source,
        "confidence_or_issue": issue,
    }


def _normalize_sourced_items(
    value: Any,
    *,
    maximum: int,
    statement_field: str,
) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for item in _items(value, maximum=maximum):
        statement = _text(
            item.get(statement_field, item.get("statement")),
            maximum=700,
            required=True,
            field=statement_field,
        )
        source = _source(item.get("source_filename", item.get("source"))) or "unsupported"
        normalized.append({"statement": statement, "source": source})
    return normalized


def _normalize_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise RecurringReportRenderError("recurring-report-content.json must contain an object.")

    metrics = [
        _normalize_metric(item, index)
        for index, item in enumerate(_items(payload.get("metrics"), maximum=50), start=1)
    ]
    if not metrics:
        raise RecurringReportRenderError("At least one metric is required.")

    actions: list[dict[str, str]] = []
    for item in _items(payload.get("actions"), maximum=50):
        action = _text(item.get("action"), maximum=700, required=True, field="action")
        owner = _text(item.get("owner"), maximum=160)
        due_date = _text(item.get("due_date"), maximum=80)
        issue = _text(item.get("confidence_or_issue"), maximum=300)
        missing = []
        if not owner:
            missing.append("owner not stated")
        if not due_date:
            missing.append("due date not stated")
        if missing:
            issue = "; ".join([issue, *missing]).strip("; ")
        actions.append(
            {
                "action": action,
                "owner": owner,
                "due_date": due_date,
                "source": _source(item.get("source_filename", item.get("source")))
                or "unsupported",
                "confidence_or_issue": issue,
            }
        )

    runbook = payload.get("runbook")
    if not isinstance(runbook, dict):
        raise RecurringReportRenderError("runbook must contain an object.")
    definitions: list[dict[str, Any]] = []
    for item in _items(runbook.get("metric_definitions"), maximum=50):
        definitions.append(
            {
                "metric": _text(
                    item.get("metric"), maximum=180, required=True, field="runbook metric"
                ),
                "definition": _text(
                    item.get("definition"), maximum=700, required=True, field="metric definition"
                ),
                "calculation": _text(item.get("calculation"), maximum=700),
                "source_fields": _strings(
                    item.get("source_fields"), maximum=20, item_maximum=180
                ),
            }
        )
    if not definitions:
        raise RecurringReportRenderError("runbook.metric_definitions is required.")

    return {
        "report_title": _text(
            payload.get("report_title"), maximum=240, required=True, field="report_title"
        ),
        "reporting_period": _text(
            payload.get("reporting_period"),
            maximum=120,
            required=True,
            field="reporting_period",
        ),
        "comparison_label": _text(payload.get("comparison_label"), maximum=160),
        "prepared_for": _text(payload.get("prepared_for"), maximum=240),
        "executive_summary": _text(
            payload.get("executive_summary"),
            maximum=2_500,
            required=True,
            field="executive_summary",
        ),
        "metrics": metrics,
        "highlights": _normalize_sourced_items(
            payload.get("highlights"), maximum=20, statement_field="highlight"
        ),
        "risks": _normalize_sourced_items(
            payload.get("risks"), maximum=20, statement_field="risk"
        ),
        "actions": actions,
        "data_quality": _strings(payload.get("data_quality"), maximum=30),
        "runbook": {
            "cadence": _text(runbook.get("cadence"), maximum=80),
            "source_pattern": _text(
                runbook.get("source_pattern"),
                maximum=700,
                required=True,
                field="runbook source_pattern",
            ),
            "period_field": _text(runbook.get("period_field"), maximum=240),
            "filters": _strings(runbook.get("filters"), maximum=30),
            "comparison_method": _text(runbook.get("comparison_method"), maximum=700),
            "metric_definitions": definitions,
            "steps": _strings(runbook.get("steps"), maximum=20, item_maximum=700),
            "assumptions": _strings(runbook.get("assumptions"), maximum=30),
        },
    }


def _status_label(status: str) -> str:
    return status.replace("_", " ").title()


def _render_report(payload: dict[str, Any]) -> str:
    lines = [
        f"# {payload['report_title']}",
        "",
        f"- **Reporting period:** {payload['reporting_period']}",
        f"- **Comparison:** {_display(payload['comparison_label'])}",
        f"- **Prepared for:** {_display(payload['prepared_for'])}",
        "",
        "## Executive summary",
        "",
        payload["executive_summary"],
        "",
        "## KPI scorecard",
        "",
        "| KPI | Current | Comparison | Change | Target | Status | Source |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for metric in payload["metrics"]:
        values = [
            metric["name"],
            metric["current_value"],
            _display(metric["comparison_value"]),
            _display(metric["change"]),
            _display(metric["target"]),
            _status_label(metric["status"]),
            metric["source_filename"],
        ]
        lines.append("| " + " | ".join(_markdown_cell(value) for value in values) + " |")

    for heading, key, empty_message in (
        ("Highlights", "highlights", "No supported highlights were identified."),
        ("Risks and exceptions", "risks", "No supported risks or exceptions were identified."),
    ):
        lines.extend(["", f"## {heading}", ""])
        if payload[key]:
            for item in payload[key]:
                lines.append(f"- {item['statement']} _(Source: {item['source']})_")
        else:
            lines.append(empty_message)

    lines.extend(["", "## Actions", ""])
    if payload["actions"]:
        lines.extend(
            [
                "| Action | Owner | Due date | Source | Confidence or issue |",
                "| --- | --- | --- | --- | --- |",
            ]
        )
        for action in payload["actions"]:
            lines.append(
                "| "
                + " | ".join(
                    _markdown_cell(_display(action[key]))
                    for key in ("action", "owner", "due_date", "source", "confidence_or_issue")
                )
                + " |"
            )
    else:
        lines.append("No actions were supported by the supplied source data.")

    lines.extend(["", "## Data quality and caveats", ""])
    if payload["data_quality"]:
        lines.extend(f"- {item}" for item in payload["data_quality"])
    else:
        lines.append("No data-quality caveats were supplied; verify source completeness before sharing.")
    lines.extend(
        [
            "",
            "> Review calculations, definitions, source support, and period coverage before sharing this report.",
            "",
        ]
    )
    return "\n".join(lines)


def _render_runbook(payload: dict[str, Any]) -> str:
    runbook = payload["runbook"]
    lines = [
        f"# {payload['report_title']} — Repeat runbook",
        "",
        f"- **Cadence:** {_display(runbook['cadence'])}",
        f"- **Expected source:** {runbook['source_pattern']}",
        f"- **Period field:** {_display(runbook['period_field'])}",
        f"- **Comparison method:** {_display(runbook['comparison_method'])}",
        "",
        "## Metric definitions",
        "",
        "| Metric | Definition | Calculation | Source fields |",
        "| --- | --- | --- | --- |",
    ]
    for definition in runbook["metric_definitions"]:
        values = [
            definition["metric"],
            definition["definition"],
            _display(definition["calculation"]),
            ", ".join(definition["source_fields"]) or "Not stated",
        ]
        lines.append("| " + " | ".join(_markdown_cell(value) for value in values) + " |")

    lines.extend(["", "## Filters", ""])
    lines.extend(f"- {item}" for item in runbook["filters"] or ["No filters stated."])
    lines.extend(["", "## Repeat steps", ""])
    if runbook["steps"]:
        lines.extend(f"{index}. {item}" for index, item in enumerate(runbook["steps"], start=1))
    else:
        lines.extend(
            [
                "1. Attach the new period's source file or files.",
                "2. Confirm the reporting period and comparison basis.",
                "3. Run the saved report setup and review the three regenerated artifacts.",
            ]
        )
    lines.extend(["", "## Assumptions and manual checks", ""])
    lines.extend(
        f"- {item}"
        for item in runbook["assumptions"]
        or ["No assumptions were supplied; verify this before the next run."]
    )
    lines.extend(
        [
            "",
            "> Keep this runbook with the report history. Update definitions deliberately when the business logic changes.",
            "",
        ]
    )
    return "\n".join(lines)


def render_recurring_report(spec_path: Path, output_dir: Path) -> dict[str, Any]:
    """Render a structured recurring-report specification to Markdown and CSV."""
    try:
        raw_payload = json.loads(spec_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RecurringReportRenderError(
            f"Could not read recurring-report-content.json: {exc}"
        ) from exc
    payload = _normalize_payload(raw_payload)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "performance-report.md"
    scorecard_path = output_dir / "kpi-scorecard.csv"
    runbook_path = output_dir / "report-runbook.md"
    report_path.write_text(_render_report(payload), encoding="utf-8")
    runbook_path.write_text(_render_runbook(payload), encoding="utf-8")
    fieldnames = [
        "metric_id",
        "name",
        "current_value",
        "comparison_value",
        "change",
        "target",
        "status",
        "interpretation",
        "calculation",
        "source_filename",
        "confidence_or_issue",
    ]
    with scorecard_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(payload["metrics"])
    return {
        "report_title": payload["report_title"],
        "reporting_period": payload["reporting_period"],
        "metric_count": len(payload["metrics"]),
        "action_count": len(payload["actions"]),
        "files": [report_path, scorecard_path, runbook_path],
    }
