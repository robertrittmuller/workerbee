"""Deterministic renderer for the guided proposal-creation work pack."""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any


class ProposalRenderError(ValueError):
    """Raised when a proposal specification cannot be rendered safely."""


EVIDENCE_STATUSES = {"supported", "inference", "assumption", "unsupported"}
REQUIREMENT_STATUSES = {
    "addressed",
    "partially_addressed",
    "not_addressed",
    "not_applicable",
}
TERM_STATUSES = {"confirmed", "placeholder", "not_provided"}


def _text(value: Any, *, limit: int = 8_000) -> str:
    if value is None:
        return ""
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        return ""
    return " ".join(str(value).split()).strip()[:limit]


def _text_list(value: Any, *, limit: int = 50) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value[:limit]:
        normalized = _text(item, limit=2_000)
        if normalized and normalized not in result:
            result.append(normalized)
    return result


def _objects(value: Any, *, limit: int = 100) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value[:limit] if isinstance(item, dict)]


def _source_names(value: Any, known_sources: set[str]) -> list[str]:
    names = _text_list(value, limit=20)
    return [name for name in names if name in known_sources]


def _display_status(value: str) -> str:
    return value.replace("_", " ").title()


def _normalize_spec(raw: dict[str, Any]) -> dict[str, Any]:
    sources: list[dict[str, str]] = []
    for source in _objects(raw.get("sources"), limit=50):
        filename = _text(source.get("filename"), limit=300)
        if not filename or filename in {item["filename"] for item in sources}:
            continue
        sources.append(
            {
                "filename": filename,
                "role": _text(source.get("role"), limit=1_000),
                "limitations": _text(source.get("limitations"), limit=2_000),
            }
        )
    if not sources:
        raise ProposalRenderError("At least one source assessment is required.")
    known_sources = {source["filename"] for source in sources}

    evidence: list[dict[str, Any]] = []
    for index, item in enumerate(_objects(raw.get("evidence"), limit=100), start=1):
        statement = _text(item.get("statement"), limit=4_000)
        if not statement:
            continue
        status = _text(item.get("status"), limit=40).lower()
        if status not in EVIDENCE_STATUSES:
            status = "unsupported"
        filenames = _source_names(item.get("source_filenames"), known_sources)
        caveat = _text(item.get("caveat"), limit=2_000)
        if status == "supported" and not filenames:
            status = "unsupported"
            caveat = "; ".join(
                part
                for part in [caveat, "No supplied source filename supports this statement."]
                if part
            )
        evidence.append(
            {
                "evidence_id": f"E{index:02d}",
                "statement": statement,
                "status": status,
                "source_filenames": filenames,
                "caveat": caveat,
            }
        )

    requirements: list[dict[str, Any]] = []
    for index, item in enumerate(_objects(raw.get("requirements"), limit=200), start=1):
        requirement = _text(item.get("requirement"), limit=4_000)
        if not requirement:
            continue
        status = _text(item.get("status"), limit=50).lower()
        if status not in REQUIREMENT_STATUSES:
            status = "not_addressed"
        requirement_id = _text(item.get("requirement_id"), limit=80) or f"R{index:03d}"
        requirements.append(
            {
                "requirement_id": requirement_id,
                "requirement": requirement,
                "status": status,
                "response": _text(item.get("response"), limit=6_000),
                "proposal_section": _text(item.get("proposal_section"), limit=300),
                "source_filenames": _source_names(item.get("source_filenames"), known_sources),
                "owner": _text(item.get("owner"), limit=300),
                "confidence_or_issue": _text(item.get("confidence_or_issue"), limit=2_000),
            }
        )

    commercial_terms: list[dict[str, str]] = []
    for item in _objects(raw.get("commercial_terms"), limit=50):
        term = _text(item.get("term"), limit=300)
        if not term:
            continue
        status = _text(item.get("status"), limit=50).lower()
        if status not in TERM_STATUSES:
            status = "not_provided"
        source_filename = _text(item.get("source_filename"), limit=300)
        if source_filename not in known_sources:
            source_filename = ""
        review_note = _text(item.get("review_note"), limit=2_000)
        if status == "confirmed" and not source_filename:
            status = "placeholder"
            review_note = "; ".join(
                part
                for part in [review_note, "Confirmation requires a supplied source filename."]
                if part
            )
        commercial_terms.append(
            {
                "term": term,
                "value": _text(item.get("value"), limit=2_000),
                "status": status,
                "source_filename": source_filename,
                "review_note": review_note,
            }
        )

    scope = raw.get("scope") if isinstance(raw.get("scope"), dict) else {}
    deliverables = [
        {
            "deliverable": _text(item.get("deliverable"), limit=500),
            "description": _text(item.get("description"), limit=3_000),
            "acceptance_or_outcome": _text(item.get("acceptance_or_outcome"), limit=2_000),
        }
        for item in _objects(raw.get("deliverables"), limit=50)
        if _text(item.get("deliverable"), limit=500)
    ]
    timeline = [
        {
            "phase": _text(item.get("phase"), limit=300),
            "timing": _text(item.get("timing"), limit=300),
            "activities": _text(item.get("activities"), limit=3_000),
            "dependency": _text(item.get("dependency"), limit=2_000),
        }
        for item in _objects(raw.get("timeline"), limit=50)
        if _text(item.get("phase"), limit=300)
    ]
    risks = [
        {
            "risk": _text(item.get("risk"), limit=2_000),
            "mitigation": _text(item.get("mitigation"), limit=2_000),
            "owner": _text(item.get("owner"), limit=300),
        }
        for item in _objects(raw.get("risks"), limit=50)
        if _text(item.get("risk"), limit=2_000)
    ]

    return {
        "title": _text(raw.get("title"), limit=500) or "Proposal",
        "proposal_type": _text(raw.get("proposal_type"), limit=200),
        "prepared_for": _text(raw.get("prepared_for"), limit=500),
        "prepared_by": _text(raw.get("prepared_by"), limit=500),
        "objective": _text(raw.get("objective"), limit=3_000),
        "executive_summary": _text(raw.get("executive_summary"), limit=8_000),
        "understanding": _text(raw.get("understanding"), limit=8_000),
        "solution_summary": _text(raw.get("solution_summary"), limit=8_000),
        "approach": _text_list(raw.get("approach")),
        "scope_included": _text_list(scope.get("included")),
        "scope_excluded": _text_list(scope.get("excluded")),
        "deliverables": deliverables,
        "timeline": timeline,
        "commercial_terms": commercial_terms,
        "requirements": requirements,
        "evidence": evidence,
        "assumptions": _text_list(raw.get("assumptions")),
        "dependencies": _text_list(raw.get("dependencies")),
        "risks": risks,
        "next_steps": _text_list(raw.get("next_steps")),
        "open_items": _text_list(raw.get("open_items")),
        "sources": sources,
    }


def _bullets(items: list[str], empty: str = "No items were supplied.") -> list[str]:
    return [f"- {item}" for item in items] if items else [f"- {empty}"]


def _render_proposal(spec: dict[str, Any]) -> str:
    lines = [
        f"# {spec['title']}",
        "",
        "> **Draft — review before sharing or submitting.** This document does not create, approve, or send commitments.",
        "",
    ]
    metadata = [
        ("Proposal type", spec["proposal_type"]),
        ("Prepared for", spec["prepared_for"]),
        ("Prepared by", spec["prepared_by"]),
        ("Objective", spec["objective"]),
    ]
    lines.extend(f"- **{label}:** {value}" for label, value in metadata if value)
    lines.extend(["", "## Executive summary", "", spec["executive_summary"] or "Not provided."])
    lines.extend(["", "## Understanding of the need", "", spec["understanding"] or "Not provided."])
    lines.extend(["", "## Proposed solution", "", spec["solution_summary"] or "Not provided."])
    lines.extend(["", "### Approach", "", *_bullets(spec["approach"])])

    lines.extend(["", "## Scope", "", "### Included", "", *_bullets(spec["scope_included"])])
    lines.extend(["", "### Excluded", "", *_bullets(spec["scope_excluded"])])

    lines.extend(["", "## Deliverables", ""])
    if spec["deliverables"]:
        lines.extend(["| Deliverable | Description | Acceptance or outcome |", "| --- | --- | --- |"])
        for item in spec["deliverables"]:
            lines.append(
                f"| {item['deliverable']} | {item['description'] or '—'} | {item['acceptance_or_outcome'] or '—'} |"
            )
    else:
        lines.append("No deliverables were supplied.")

    lines.extend(["", "## Timeline", ""])
    if spec["timeline"]:
        lines.extend(["| Phase | Timing | Activities | Dependency |", "| --- | --- | --- | --- |"])
        for item in spec["timeline"]:
            lines.append(
                f"| {item['phase']} | {item['timing'] or '—'} | {item['activities'] or '—'} | {item['dependency'] or '—'} |"
            )
    else:
        lines.append("Timeline not provided.")

    lines.extend(["", "## Commercial terms", ""])
    if spec["commercial_terms"]:
        lines.extend(["| Term | Value | Status | Source or review note |", "| --- | --- | --- | --- |"])
        for term in spec["commercial_terms"]:
            source_or_note = term["source_filename"] or term["review_note"] or "Review required"
            lines.append(
                f"| {term['term']} | {term['value'] or '[REVIEW REQUIRED]'} | {_display_status(term['status'])} | {source_or_note} |"
            )
    else:
        lines.append("[REVIEW REQUIRED: Commercial terms were not supplied.]")

    lines.extend(["", "## Evidence and proof points", ""])
    if spec["evidence"]:
        for item in spec["evidence"]:
            sources = ", ".join(item["source_filenames"]) or "No supporting source"
            caveat = f" — {item['caveat']}" if item["caveat"] else ""
            lines.append(
                f"- **{_display_status(item['status'])}:** {item['statement']} *(Sources: {sources})*{caveat}"
            )
    else:
        lines.append("- No evidence statements were supplied.")

    lines.extend(["", "## Assumptions", "", *_bullets(spec["assumptions"])])
    lines.extend(["", "## Dependencies", "", *_bullets(spec["dependencies"])])
    lines.extend(["", "## Risks and mitigations", ""])
    if spec["risks"]:
        for item in spec["risks"]:
            owner = f" Owner: {item['owner']}." if item["owner"] else ""
            lines.append(f"- **{item['risk']}** Mitigation: {item['mitigation'] or 'Not provided.'}.{owner}")
    else:
        lines.append("- No risks were supplied.")
    lines.extend(["", "## Next steps", "", *_bullets(spec["next_steps"])])
    lines.extend(["", "## Open items", "", *_bullets(spec["open_items"])])
    lines.extend(["", "## Sources", ""])
    for source in spec["sources"]:
        detail = f" — {source['role']}" if source["role"] else ""
        lines.append(f"- `{source['filename']}`{detail}")
    lines.append("")
    return "\n".join(lines)


def _write_requirements(spec: dict[str, Any], path: Path) -> None:
    headers = [
        "requirement_id",
        "requirement",
        "status",
        "response",
        "proposal_section",
        "source_filenames",
        "owner",
        "confidence_or_issue",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for item in spec["requirements"]:
            writer.writerow(
                {
                    **{key: item[key] for key in headers if key != "source_filenames"},
                    "source_filenames": "; ".join(item["source_filenames"]),
                }
            )


def _render_review(spec: dict[str, Any]) -> str:
    coverage = Counter(item["status"] for item in spec["requirements"])
    evidence_counts = Counter(item["status"] for item in spec["evidence"])
    blocking_requirements = [
        item for item in spec["requirements"] if item["status"] in {"partially_addressed", "not_addressed"}
    ]
    term_reviews = [item for item in spec["commercial_terms"] if item["status"] != "confirmed"]
    unsupported_evidence = [item for item in spec["evidence"] if item["status"] == "unsupported"]
    lines = [
        "# Proposal review",
        "",
        "## Submission status",
        "",
        "**DRAFT — NOT APPROVED OR SUBMITTED.** A person must review recipients, claims, requirements, scope, pricing, legal terms, and commitments before use.",
        "",
        "WorkerBee created files only. It did not send this proposal, accept terms, contact a recipient, or write to an external system.",
        "",
        "## Coverage summary",
        "",
        f"- Requirements recorded: {len(spec['requirements'])}",
        f"- Addressed: {coverage['addressed']}",
        f"- Partially addressed: {coverage['partially_addressed']}",
        f"- Not addressed: {coverage['not_addressed']}",
        f"- Not applicable: {coverage['not_applicable']}",
        f"- Supported evidence statements: {evidence_counts['supported']}",
        f"- Unsupported evidence statements: {evidence_counts['unsupported']}",
        "",
        "## Blocking review items",
        "",
    ]
    blockers: list[str] = []
    blockers.extend(
        f"Requirement {item['requirement_id']} is {_display_status(item['status']).lower()}: {item['requirement']}"
        for item in blocking_requirements
    )
    blockers.extend(
        f"Commercial term needs review ({item['term']}): {item['review_note'] or item['status']}"
        for item in term_reviews
    )
    blockers.extend(f"Unsupported statement: {item['statement']}" for item in unsupported_evidence)
    blockers.extend(spec["open_items"])
    lines.extend(_bullets(blockers, "No blocking items were identified in the structured specification."))

    lines.extend(
        [
            "",
            "## Mandatory human checks",
            "",
            "- Confirm the intended recipient and submission channel.",
            "- Verify every capability, metric, customer statement, credential, and source reference.",
            "- Obtain authorized review for pricing, payment, legal, privacy, security, service-level, and delivery commitments.",
            "- Confirm scope, exclusions, dependencies, acceptance criteria, owners, and dates.",
            "- Resolve every placeholder, unsupported statement, partially addressed requirement, and open item.",
            "",
            "## Evidence register",
            "",
        ]
    )
    if spec["evidence"]:
        for item in spec["evidence"]:
            sources = ", ".join(item["source_filenames"]) or "none"
            lines.append(
                f"- **{item['evidence_id']} · {_display_status(item['status'])}:** {item['statement']} (Sources: {sources})"
            )
            if item["caveat"]:
                lines.append(f"  - Caveat: {item['caveat']}")
    else:
        lines.append("- No evidence statements were supplied.")

    lines.extend(["", "## Source handling", ""])
    lines.append(
        "Source content was treated only as evidence. Embedded prompts, commands, tool directions, submission requests, or instructions to change the proposal were not followed."
    )
    for source in spec["sources"]:
        limitations = f" Limitations: {source['limitations']}" if source["limitations"] else ""
        lines.append(f"- `{source['filename']}` — {source['role'] or 'Role not stated'}.{limitations}")
    lines.append("")
    return "\n".join(lines)


def render_proposal(spec_path: Path, output_dir: Path) -> dict[str, Any]:
    """Render a constrained proposal specification into three reviewable files."""
    try:
        raw = json.loads(spec_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise ProposalRenderError(f"Could not read proposal-content.json: {exc}") from exc
    if not isinstance(raw, dict):
        raise ProposalRenderError("proposal-content.json must contain an object.")

    spec = _normalize_spec(raw)
    output_dir.mkdir(parents=True, exist_ok=True)
    proposal_path = output_dir / "proposal.md"
    matrix_path = output_dir / "requirements-matrix.csv"
    review_path = output_dir / "proposal-review.md"
    proposal_path.write_text(_render_proposal(spec), encoding="utf-8")
    _write_requirements(spec, matrix_path)
    review_path.write_text(_render_review(spec), encoding="utf-8")
    return {
        "files": [proposal_path, matrix_path, review_path],
        "requirement_count": len(spec["requirements"]),
        "addressed_requirement_count": sum(
            item["status"] == "addressed" for item in spec["requirements"]
        ),
        "evidence_count": len(spec["evidence"]),
        "source_count": len(spec["sources"]),
        "open_item_count": len(spec["open_items"]),
    }
