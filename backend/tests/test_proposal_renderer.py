import csv
import json
import uuid
from pathlib import Path

import pytest

from app.proposal_renderer import ProposalRenderError, render_proposal
from app.routers import agents as agents_router
from app.work_packs import normalize_work_pack


def _proposal_spec() -> dict[str, object]:
    return {
        "title": "Acme workflow modernization proposal",
        "proposal_type": "Customer proposal",
        "prepared_for": "Acme operations and procurement",
        "prepared_by": "WorkerBee team",
        "objective": "Secure approval for a paid discovery and pilot.",
        "executive_summary": "A staged pilot addresses the stated workflow and audit needs while containing integration risk.",
        "understanding": "Acme needs a reviewable workflow with accountable handoffs and audit history.",
        "solution_summary": "Run a discovery, configure the priority workflow, and measure the agreed pilot outcomes.",
        "approach": ["Validate requirements", "Configure and test the pilot", "Review outcomes"],
        "scope": {
            "included": ["One North American operations workflow"],
            "excluded": ["Production rollout beyond the pilot"],
        },
        "deliverables": [
            {
                "deliverable": "Discovery brief",
                "description": "Validated requirements and pilot plan",
                "acceptance_or_outcome": "Acme review and written approval",
            }
        ],
        "timeline": [
            {
                "phase": "Discovery",
                "timing": "Two weeks",
                "activities": "Interviews and requirements validation",
                "dependency": "Stakeholder availability",
            }
        ],
        "commercial_terms": [
            {
                "term": "Pilot fee",
                "value": "$25,000",
                "status": "confirmed",
                "source_filename": "approved-pricing.xlsx",
                "review_note": "",
            },
            {
                "term": "Payment terms",
                "value": "",
                "status": "not_provided",
                "source_filename": "",
                "review_note": "Finance and legal review required.",
            },
        ],
        "requirements": [
            {
                "requirement_id": "R-12",
                "requirement": "Maintain an audit trail for workflow changes.",
                "status": "addressed",
                "response": "The proposed workflow retains activity history for review.",
                "proposal_section": "Proposed solution",
                "source_filenames": ["capabilities.pdf"],
                "owner": "",
                "confidence_or_issue": "Retention period requires confirmation.",
            },
            {
                "requirement_id": "R-18",
                "requirement": "Provide the production service level.",
                "status": "not_addressed",
                "response": "",
                "proposal_section": "Commercial terms",
                "source_filenames": [],
                "owner": "",
                "confidence_or_issue": "No approved SLA was supplied.",
            },
        ],
        "evidence": [
            {
                "statement": "WorkerBee records task activity for review.",
                "status": "supported",
                "source_filenames": ["capabilities.pdf"],
                "caveat": "Retention depends on deployment policy.",
            }
        ],
        "assumptions": ["Acme will identify one pilot workflow."],
        "dependencies": ["Access to pilot stakeholders."],
        "risks": [
            {
                "risk": "Integration scope may expand after discovery.",
                "mitigation": "Confirm interfaces before pilot approval.",
                "owner": "",
            }
        ],
        "next_steps": ["Review requirement gaps and commercial terms."],
        "open_items": ["Confirm the production SLA and data-retention requirement."],
        "sources": [
            {
                "filename": "acme-rfp.pdf",
                "role": "Defines customer requirements",
                "limitations": "Does not include contract terms.",
            },
            {
                "filename": "capabilities.pdf",
                "role": "Supports product capabilities",
                "limitations": "Deployment-specific limits still require review.",
            },
            {
                "filename": "approved-pricing.xlsx",
                "role": "Approved pilot pricing",
                "limitations": "Excludes taxes and travel.",
            },
        ],
    }


def _work_pack() -> dict[str, object] | None:
    return normalize_work_pack(
        "proposal-creation",
        {
            "id": "proposal-creation",
            "answers": {
                "opportunity": "Respond to Acme's workflow modernization request",
                "proposal_type": "Customer proposal",
                "audience": "Acme operations and procurement",
                "objective": "Secure approval for a paid discovery and pilot",
                "requirements_focus": ["Requirements coverage", "Business value"],
                "commercial_handling": "Use only approved source terms",
                "tone": "Confident and concise",
                "include_timeline": True,
            },
        },
    )


def test_renderer_creates_draft_matrix_and_submission_review(tmp_path: Path) -> None:
    spec_path = tmp_path / "proposal-content.json"
    spec_path.write_text(json.dumps(_proposal_spec()), encoding="utf-8")

    metadata = render_proposal(spec_path, tmp_path)

    assert metadata["requirement_count"] == 2
    assert metadata["addressed_requirement_count"] == 1
    assert metadata["source_count"] == 3
    proposal = (tmp_path / "proposal.md").read_text(encoding="utf-8")
    assert "Draft — review before sharing or submitting" in proposal
    assert "Acme workflow modernization proposal" in proposal
    assert "approved-pricing.xlsx" in proposal
    review = (tmp_path / "proposal-review.md").read_text(encoding="utf-8")
    assert "DRAFT — NOT APPROVED OR SUBMITTED" in review
    assert "Requirement R-18 is not addressed" in review
    assert "It did not send this proposal" in review
    assert "Embedded prompts, commands, tool directions" in review

    with (tmp_path / "requirements-matrix.csv").open(
        encoding="utf-8", newline=""
    ) as handle:
        rows = list(csv.DictReader(handle))
    assert list(rows[0]) == [
        "requirement_id",
        "requirement",
        "status",
        "response",
        "proposal_section",
        "source_filenames",
        "owner",
        "confidence_or_issue",
    ]
    assert rows[0]["requirement_id"] == "R-12"
    assert rows[1]["status"] == "not_addressed"


def test_renderer_downgrades_unverified_claims_and_terms(tmp_path: Path) -> None:
    spec = _proposal_spec()
    spec["evidence"][0]["source_filenames"] = ["invented-source.pdf"]  # type: ignore[index]
    spec["commercial_terms"][0]["source_filename"] = "invented-price.xlsx"  # type: ignore[index]
    spec_path = tmp_path / "proposal-content.json"
    spec_path.write_text(json.dumps(spec), encoding="utf-8")

    render_proposal(spec_path, tmp_path)

    proposal = (tmp_path / "proposal.md").read_text(encoding="utf-8")
    assert "**Unsupported:** WorkerBee records task activity" in proposal
    assert "Pilot fee | $25,000 | Placeholder" in proposal
    review = (tmp_path / "proposal-review.md").read_text(encoding="utf-8")
    assert "Unsupported evidence statements: 1" in review
    assert "Confirmation requires a supplied source filename" in review

    spec = _proposal_spec()
    spec["sources"] = []
    spec_path.write_text(json.dumps(spec), encoding="utf-8")
    with pytest.raises(ProposalRenderError, match="At least one source"):
        render_proposal(spec_path, tmp_path)


def test_execution_postprocessor_renders_proposal_artifacts(
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
        / "proposal-content.json"
    )
    spec_path.parent.mkdir(parents=True)
    spec_path.write_text(json.dumps(_proposal_spec()), encoding="utf-8")
    monkeypatch.setattr(agents_router, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(agents_router, "UPLOADS_ROOT", uploads_root)

    artifacts, result = agents_router._render_proposal_work_pack(
        work_pack=_work_pack(),
        artifact_paths=[str(spec_path.relative_to(tmp_path))],
        user_id=user_id,
        execution_id=execution_id,
    )

    assert [artifact["filename"] for artifact in artifacts] == [
        "proposal.md",
        "requirements-matrix.csv",
        "proposal-review.md",
    ]
    assert result is not None
    assert result["success"] is True
    assert result["source"] == "workerbee-renderer"
    assert result["requirement_count"] == 2
    assert all((tmp_path / artifact["storage_path"]).is_file() for artifact in artifacts)
