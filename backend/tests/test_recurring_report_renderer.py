import csv
import json
import uuid
from pathlib import Path

import pytest

from app.recurring_report_renderer import (
    RecurringReportRenderError,
    render_recurring_report,
)
from app.routers import agents as agents_router
from app.work_packs import normalize_work_pack


def _report_spec() -> dict[str, object]:
    return {
        "report_title": "Weekly operating review",
        "reporting_period": "Week ending July 21, 2026",
        "comparison_label": "Previous week",
        "prepared_for": "Leadership team",
        "executive_summary": "Revenue improved, but renewal coverage remains below target.",
        "metrics": [
            {
                "name": "Revenue",
                "current_value": "$1.2M",
                "comparison_value": "$1.1M",
                "change": "+9.1%",
                "target": "$1.25M",
                "status": "watch",
                "interpretation": "Growth improved but remains below plan.",
                "calculation": "Sum of net_revenue for the reporting week.",
                "source_filename": "weekly-results.xlsx",
                "confidence_or_issue": "",
            },
            {
                "name": "Renewal coverage",
                "current_value": "81%",
                "comparison_value": "84%",
                "change": "-3 pp",
                "target": "90%",
                "status": "off_track",
                "interpretation": "Coverage deteriorated in the enterprise segment.",
                "calculation": "Renewal value covered / renewal value due.",
                "source_filename": "weekly-results.xlsx",
                "confidence_or_issue": "Two accounts have incomplete owner data",
            },
        ],
        "highlights": [
            {
                "highlight": "Revenue increased from the prior week.",
                "source_filename": "weekly-results.xlsx",
            }
        ],
        "risks": [
            {
                "risk": "Enterprise renewal coverage is below target.",
                "source_filename": "weekly-results.xlsx",
            }
        ],
        "actions": [
            {
                "action": "Review uncovered enterprise renewals.",
                "owner": "",
                "due_date": "",
                "source_filename": "weekly-results.xlsx",
                "confidence_or_issue": "Action was discussed without assignment",
            }
        ],
        "data_quality": ["Two renewal records do not have an owner."],
        "runbook": {
            "cadence": "Weekly",
            "source_pattern": "One workbook with a Results sheet",
            "period_field": "week_ending",
            "filters": ["Exclude test accounts"],
            "comparison_method": "Compare with the prior complete week",
            "metric_definitions": [
                {
                    "metric": "Revenue",
                    "definition": "Recognized net revenue",
                    "calculation": "Sum net_revenue",
                    "source_fields": ["Results.net_revenue", "Results.week_ending"],
                },
                {
                    "metric": "Renewal coverage",
                    "definition": "Share of due renewal value with a confirmed plan",
                    "calculation": "covered_value / due_value",
                    "source_fields": ["Results.covered_value", "Results.due_value"],
                },
            ],
            "steps": [
                "Attach the complete weekly workbook.",
                "Confirm the reporting period and prior-period coverage.",
                "Review calculations, sources, and caveats.",
            ],
            "assumptions": ["Currency is USD."],
        },
    }


def _work_pack() -> dict[str, object] | None:
    return normalize_work_pack(
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
                "focus": ["Trend changes", "Missed targets", "Actions"],
                "include_actions": True,
            },
        },
    )


def test_renderer_creates_report_scorecard_and_repeat_runbook(tmp_path: Path) -> None:
    spec_path = tmp_path / "recurring-report-content.json"
    spec_path.write_text(json.dumps(_report_spec()), encoding="utf-8")

    metadata = render_recurring_report(spec_path, tmp_path)

    assert metadata["metric_count"] == 2
    assert metadata["action_count"] == 1
    report = (tmp_path / "performance-report.md").read_text(encoding="utf-8")
    assert "Week ending July 21, 2026" in report
    assert "Renewal coverage" in report
    assert "weekly-results.xlsx" in report
    assert "Not stated" in report
    assert "Review calculations" in report
    runbook = (tmp_path / "report-runbook.md").read_text(encoding="utf-8")
    assert "Results.net_revenue" in runbook
    assert "Compare with the prior complete week" in runbook
    assert "Keep this runbook with the report history" in runbook

    with (tmp_path / "kpi-scorecard.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert list(rows[0]) == [
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
    assert rows[0]["metric_id"] == "K01"
    assert rows[1]["status"] == "off_track"


def test_renderer_marks_missing_sources_and_rejects_incomplete_runbooks(tmp_path: Path) -> None:
    spec = _report_spec()
    spec["metrics"][0]["source_filename"] = ""  # type: ignore[index]
    spec["metrics"][0]["status"] = "green"  # type: ignore[index]
    spec_path = tmp_path / "recurring-report-content.json"
    spec_path.write_text(json.dumps(spec), encoding="utf-8")
    render_recurring_report(spec_path, tmp_path)
    with (tmp_path / "kpi-scorecard.csv").open(encoding="utf-8", newline="") as handle:
        first = next(csv.DictReader(handle))
    assert first["source_filename"] == "unsupported"
    assert first["status"] == "not_assessed"
    assert "source not stated" in first["confidence_or_issue"]
    assert "status not assessed" in first["confidence_or_issue"]

    spec = _report_spec()
    spec["runbook"] = {"source_pattern": "Workbook", "metric_definitions": []}
    spec_path.write_text(json.dumps(spec), encoding="utf-8")
    with pytest.raises(RecurringReportRenderError, match="metric_definitions"):
        render_recurring_report(spec_path, tmp_path)


def test_execution_postprocessor_renders_recurring_report_artifacts(
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
        / "recurring-report-content.json"
    )
    spec_path.parent.mkdir(parents=True)
    spec_path.write_text(json.dumps(_report_spec()), encoding="utf-8")
    monkeypatch.setattr(agents_router, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(agents_router, "UPLOADS_ROOT", uploads_root)

    artifacts, result = agents_router._render_recurring_report_work_pack(
        work_pack=_work_pack(),
        artifact_paths=[str(spec_path.relative_to(tmp_path))],
        user_id=user_id,
        execution_id=execution_id,
    )

    assert [artifact["filename"] for artifact in artifacts] == [
        "performance-report.md",
        "kpi-scorecard.csv",
        "report-runbook.md",
    ]
    assert result is not None
    assert result["success"] is True
    assert result["source"] == "workerbee-renderer"
    assert result["metric_count"] == 2
    assert all((tmp_path / artifact["storage_path"]).is_file() for artifact in artifacts)
