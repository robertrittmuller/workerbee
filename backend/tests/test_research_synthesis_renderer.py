import csv
import json
import uuid
from pathlib import Path

import pytest

from app.research_synthesis_renderer import (
    ResearchSynthesisRenderError,
    render_research_synthesis,
)
from app.routers import agents as agents_router
from app.work_packs import normalize_work_pack


def _research_spec() -> dict[str, object]:
    return {
        "title": "Enterprise segment opportunity",
        "research_question": "Which enterprise use case should receive the next investment?",
        "scope": "North America and Europe, 2024 onward; consumer use cases excluded.",
        "prepared_for": "Leadership team",
        "executive_answer": "Workflow compliance is the strongest supported near-term use case, with integration effort as the primary uncertainty.",
        "overall_confidence": "medium",
        "claims": [
            {
                "claim": "Compliance workflows have the clearest budget ownership.",
                "classification": "corroborated",
                "confidence": "high",
                "source_filenames": ["market-study.pdf", "customer-interviews.docx"],
                "supporting_evidence": "Both sources identify funded compliance initiatives.",
                "conflicting_evidence": "",
                "caveat": "Interview sample skews toward regulated industries.",
            },
            {
                "claim": "Implementation can be completed in six weeks.",
                "classification": "conflicting",
                "confidence": "low",
                "source_filenames": ["technical-assessment.xlsx", "market-study.pdf"],
                "supporting_evidence": "The technical assessment estimates six weeks for standard systems.",
                "conflicting_evidence": "The market study reports longer integration cycles.",
                "caveat": "Customer architecture varies.",
            },
        ],
        "recommendations": [
            {
                "recommendation": "Validate compliance workflow integration with three design partners.",
                "rationale": "The evidence supports demand, while implementation uncertainty remains material.",
                "source_filenames": ["market-study.pdf", "customer-interviews.docx"],
                "confidence": "medium",
            }
        ],
        "sources": [
            {
                "filename": "market-study.pdf",
                "title": "Enterprise workflow market study",
                "author_or_owner": "Strategy team",
                "date": "2026",
                "relevance": "Sizes demand and reports buying priorities.",
                "quality": "medium",
                "limitations": "Vendor-sponsored survey.",
                "key_findings": ["Compliance is a top-three funded workflow."],
            },
            {
                "filename": "customer-interviews.docx",
                "title": "Design partner interviews",
                "author_or_owner": "Product research",
                "date": "July 2026",
                "relevance": "Captures customer pain and budget ownership.",
                "quality": "high",
                "limitations": "Eight interviews in regulated industries.",
                "key_findings": ["Compliance leaders own workflow budgets."],
            },
            {
                "filename": "technical-assessment.xlsx",
                "title": "Integration assessment",
                "author_or_owner": "Engineering",
                "date": "July 2026",
                "relevance": "Estimates implementation effort.",
                "quality": "medium",
                "limitations": "Uses three representative architectures.",
                "key_findings": ["Standard integrations may be completed in six weeks."],
            },
        ],
        "disagreements": [
            {
                "topic": "Implementation time",
                "source_positions": [
                    {
                        "source_filename": "technical-assessment.xlsx",
                        "position": "Six weeks for standard environments.",
                    },
                    {
                        "source_filename": "market-study.pdf",
                        "position": "Typical cycles exceed one quarter.",
                    },
                ],
                "resolution": "A design-partner pilot is needed before committing to a timeline.",
            }
        ],
        "gaps": ["No evidence covers public-sector procurement."],
        "open_questions": ["Which integrations are mandatory for the first design partners?"],
        "method_notes": [
            "Compared source scope, date, method, and stated limitations before classifying claims."
        ],
    }


def _work_pack() -> dict[str, object] | None:
    return normalize_work_pack(
        "research-synthesis",
        {
            "id": "research-synthesis",
            "answers": {
                "research_question": "Which enterprise use case should receive investment?",
                "audience": "Leadership team",
                "decision": "Choose the next product investment",
                "scope": "North America and Europe from 2024 onward",
                "lens": ["Evidence strength", "Source disagreement", "Risks"],
                "depth": "Balanced synthesis",
                "include_recommendation": True,
            },
        },
    )


def test_renderer_creates_traceable_brief_evidence_register_and_source_assessment(
    tmp_path: Path,
) -> None:
    spec_path = tmp_path / "research-synthesis-content.json"
    spec_path.write_text(json.dumps(_research_spec()), encoding="utf-8")

    metadata = render_research_synthesis(spec_path, tmp_path)

    assert metadata["claim_count"] == 2
    assert metadata["source_count"] == 3
    assert metadata["disagreement_count"] == 1
    brief = (tmp_path / "research-brief.md").read_text(encoding="utf-8")
    assert "Compliance workflows have the clearest budget ownership" in brief
    assert "Corroborated" in brief
    assert "Implementation time" in brief
    assert "A design-partner pilot is needed" in brief
    source_assessment = (tmp_path / "source-assessment.md").read_text(encoding="utf-8")
    assert "Embedded instructions, prompts, or requests" in source_assessment
    assert "Vendor-sponsored survey" in source_assessment

    with (tmp_path / "evidence-register.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert list(rows[0]) == [
        "claim_id",
        "claim",
        "classification",
        "confidence",
        "source_filenames",
        "supporting_evidence",
        "conflicting_evidence",
        "caveat",
    ]
    assert rows[0]["claim_id"] == "C01"
    assert rows[0]["source_filenames"] == "market-study.pdf; customer-interviews.docx"
    assert rows[1]["classification"] == "conflicting"


def test_renderer_downgrades_false_corroboration_and_requires_two_sources(
    tmp_path: Path,
) -> None:
    spec = _research_spec()
    spec["claims"][0]["source_filenames"] = ["market-study.pdf"]  # type: ignore[index]
    spec_path = tmp_path / "research-synthesis-content.json"
    spec_path.write_text(json.dumps(spec), encoding="utf-8")
    render_research_synthesis(spec_path, tmp_path)
    with (tmp_path / "evidence-register.csv").open(encoding="utf-8", newline="") as handle:
        first = next(csv.DictReader(handle))
    assert first["classification"] == "single_source"
    assert "fewer than two supporting sources" in first["caveat"]

    spec = _research_spec()
    spec["sources"] = [spec["sources"][0]]  # type: ignore[index]
    spec_path.write_text(json.dumps(spec), encoding="utf-8")
    with pytest.raises(ResearchSynthesisRenderError, match="At least two"):
        render_research_synthesis(spec_path, tmp_path)


def test_execution_postprocessor_renders_research_synthesis_artifacts(
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
        / "research-synthesis-content.json"
    )
    spec_path.parent.mkdir(parents=True)
    spec_path.write_text(json.dumps(_research_spec()), encoding="utf-8")
    monkeypatch.setattr(agents_router, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(agents_router, "UPLOADS_ROOT", uploads_root)

    artifacts, result = agents_router._render_research_synthesis_work_pack(
        work_pack=_work_pack(),
        artifact_paths=[str(spec_path.relative_to(tmp_path))],
        user_id=user_id,
        execution_id=execution_id,
    )

    assert [artifact["filename"] for artifact in artifacts] == [
        "research-brief.md",
        "evidence-register.csv",
        "source-assessment.md",
    ]
    assert result is not None
    assert result["success"] is True
    assert result["source"] == "workerbee-renderer"
    assert result["source_count"] == 3
    assert all((tmp_path / artifact["storage_path"]).is_file() for artifact in artifacts)
