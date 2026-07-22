"""Deterministic deliverables for evidence-grounded research synthesis work packs."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


class ResearchSynthesisRenderError(ValueError):
    """Raised when a research synthesis specification cannot be rendered safely."""


CLASSIFICATIONS = {
    "corroborated",
    "single_source",
    "conflicting",
    "inference",
    "unsupported",
}
CONFIDENCE_LEVELS = {"high", "medium", "low", "not_assessed"}
SOURCE_QUALITY_LEVELS = {"high", "medium", "low", "unknown"}


def _text(
    value: Any,
    *,
    maximum: int = 2_000,
    required: bool = False,
    field: str = "value",
) -> str:
    if not isinstance(value, str):
        if required:
            raise ResearchSynthesisRenderError(f"{field} must be text.")
        return ""
    normalized = " ".join(value.replace("\x00", "").split()).strip()
    if required and not normalized:
        raise ResearchSynthesisRenderError(f"{field} is required.")
    return normalized[:maximum]


def _items(value: Any, *, maximum: int) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value[:maximum] if isinstance(item, dict)]


def _strings(value: Any, *, maximum: int, item_maximum: int = 500) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized = [_text(item, maximum=item_maximum) for item in value[:maximum]]
    return [item for item in normalized if item]


def _filename(value: Any) -> str:
    raw = _text(value, maximum=255)
    if not raw:
        return ""
    if raw.lower() == "unsupported":
        return "unsupported"
    return Path(raw).name


def _filenames(value: Any, *, maximum: int = 20) -> list[str]:
    if not isinstance(value, list):
        return []
    names = [_filename(item) for item in value[:maximum]]
    return list(dict.fromkeys(name for name in names if name))


def _display(value: str) -> str:
    return value or "Not stated"


def _markdown_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def _normalize_claim(item: dict[str, Any], index: int) -> dict[str, str]:
    claim = _text(
        item.get("claim"), maximum=900, required=True, field=f"claim {index}"
    )
    classification = _text(item.get("classification"), maximum=40).lower().replace(" ", "_")
    if classification not in CLASSIFICATIONS:
        classification = "unsupported"
    confidence = _text(item.get("confidence"), maximum=40).lower().replace(" ", "_")
    if confidence not in CONFIDENCE_LEVELS:
        confidence = "not_assessed"
    sources = _filenames(item.get("source_filenames", item.get("sources")))
    caveat = _text(item.get("caveat"), maximum=500)
    if classification in {"corroborated", "single_source", "conflicting"} and not sources:
        classification = "unsupported"
        caveat = "; ".join(part for part in (caveat, "source not stated") if part)
    if classification == "corroborated" and len(sources) < 2:
        classification = "single_source" if sources else "unsupported"
        caveat = "; ".join(
            part for part in (caveat, "fewer than two supporting sources") if part
        )
    if classification in {"inference", "unsupported"} and not sources:
        sources = ["unsupported"]
    return {
        "claim_id": f"C{index:02d}",
        "claim": claim,
        "classification": classification,
        "confidence": confidence,
        "source_filenames": "; ".join(sources),
        "supporting_evidence": _text(item.get("supporting_evidence"), maximum=1_200),
        "conflicting_evidence": _text(item.get("conflicting_evidence"), maximum=1_200),
        "caveat": caveat,
    }


def _normalize_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ResearchSynthesisRenderError(
            "research-synthesis-content.json must contain an object."
        )

    claims = [
        _normalize_claim(item, index)
        for index, item in enumerate(_items(payload.get("claims"), maximum=100), start=1)
    ]
    if not claims:
        raise ResearchSynthesisRenderError("At least one research claim is required.")

    sources: list[dict[str, Any]] = []
    for index, item in enumerate(_items(payload.get("sources"), maximum=100), start=1):
        filename = _filename(item.get("filename", item.get("source_filename")))
        if not filename or filename == "unsupported":
            raise ResearchSynthesisRenderError(f"source {index} filename is required.")
        quality = _text(item.get("quality"), maximum=40).lower()
        if quality not in SOURCE_QUALITY_LEVELS:
            quality = "unknown"
        sources.append(
            {
                "filename": filename,
                "title": _text(item.get("title"), maximum=300),
                "author_or_owner": _text(item.get("author_or_owner"), maximum=240),
                "date": _text(item.get("date"), maximum=100),
                "relevance": _text(
                    item.get("relevance"),
                    maximum=700,
                    required=True,
                    field=f"source {index} relevance",
                ),
                "quality": quality,
                "limitations": _text(item.get("limitations"), maximum=900),
                "key_findings": _strings(
                    item.get("key_findings"), maximum=20, item_maximum=700
                ),
            }
        )
    if len(sources) < 2:
        raise ResearchSynthesisRenderError(
            "At least two source assessments are required for synthesis."
        )

    recommendations: list[dict[str, str]] = []
    for item in _items(payload.get("recommendations"), maximum=20):
        recommendation = _text(
            item.get("recommendation"),
            maximum=900,
            required=True,
            field="recommendation",
        )
        recommendations.append(
            {
                "recommendation": recommendation,
                "rationale": _text(item.get("rationale"), maximum=1_200),
                "source_filenames": "; ".join(
                    _filenames(item.get("source_filenames", item.get("sources")))
                )
                or "unsupported",
                "confidence": (
                    confidence
                    if (
                        confidence := _text(item.get("confidence"), maximum=40).lower()
                    )
                    in CONFIDENCE_LEVELS
                    else "not_assessed"
                ),
            }
        )

    disagreements: list[dict[str, Any]] = []
    for item in _items(payload.get("disagreements"), maximum=30):
        positions: list[dict[str, str]] = []
        for position in _items(item.get("source_positions"), maximum=20):
            source = _filename(position.get("source_filename", position.get("source")))
            statement = _text(position.get("position"), maximum=900)
            if source and statement:
                positions.append({"source": source, "position": statement})
        disagreements.append(
            {
                "topic": _text(
                    item.get("topic"), maximum=300, required=True, field="disagreement topic"
                ),
                "source_positions": positions,
                "resolution": _text(item.get("resolution"), maximum=1_000),
            }
        )

    return {
        "title": _text(payload.get("title"), maximum=300, required=True, field="title"),
        "research_question": _text(
            payload.get("research_question"),
            maximum=1_000,
            required=True,
            field="research_question",
        ),
        "scope": _text(payload.get("scope"), maximum=1_200),
        "prepared_for": _text(payload.get("prepared_for"), maximum=240),
        "executive_answer": _text(
            payload.get("executive_answer"),
            maximum=3_000,
            required=True,
            field="executive_answer",
        ),
        "overall_confidence": (
            confidence
            if (confidence := _text(payload.get("overall_confidence"), maximum=40).lower())
            in CONFIDENCE_LEVELS
            else "not_assessed"
        ),
        "claims": claims,
        "recommendations": recommendations,
        "sources": sources,
        "disagreements": disagreements,
        "gaps": _strings(payload.get("gaps"), maximum=40, item_maximum=900),
        "open_questions": _strings(
            payload.get("open_questions"), maximum=40, item_maximum=900
        ),
        "method_notes": _strings(payload.get("method_notes"), maximum=30, item_maximum=900),
    }


def _label(value: str) -> str:
    return value.replace("_", " ").title()


def _render_brief(payload: dict[str, Any]) -> str:
    lines = [
        f"# {payload['title']}",
        "",
        f"- **Research question:** {payload['research_question']}",
        f"- **Scope:** {_display(payload['scope'])}",
        f"- **Prepared for:** {_display(payload['prepared_for'])}",
        f"- **Overall confidence:** {_label(payload['overall_confidence'])}",
        "",
        "## Executive answer",
        "",
        payload["executive_answer"],
        "",
        "## Evidence-backed findings",
        "",
        "| ID | Claim | Evidence status | Confidence | Sources | Caveat |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for claim in payload["claims"]:
        values = [
            claim["claim_id"],
            claim["claim"],
            _label(claim["classification"]),
            _label(claim["confidence"]),
            claim["source_filenames"],
            _display(claim["caveat"]),
        ]
        lines.append("| " + " | ".join(_markdown_cell(value) for value in values) + " |")

    lines.extend(["", "## Recommendations", ""])
    if payload["recommendations"]:
        for item in payload["recommendations"]:
            lines.extend(
                [
                    f"### {item['recommendation']}",
                    "",
                    item["rationale"] or "No rationale was supplied.",
                    "",
                    f"_Confidence: {_label(item['confidence'])} · Sources: {item['source_filenames']}_",
                    "",
                ]
            )
    else:
        lines.append("No recommendation is supported by the supplied evidence.")

    lines.extend(["", "## Source disagreements", ""])
    if payload["disagreements"]:
        for disagreement in payload["disagreements"]:
            lines.append(f"### {disagreement['topic']}")
            lines.append("")
            for position in disagreement["source_positions"]:
                lines.append(f"- **{position['source']}:** {position['position']}")
            lines.append(
                f"- **Current resolution:** {_display(disagreement['resolution'])}"
            )
            lines.append("")
    else:
        lines.append("No material source disagreements were identified.")

    for heading, key, empty in (
        ("Evidence gaps", "gaps", "No evidence gaps were recorded."),
        ("Open questions", "open_questions", "No open questions were recorded."),
    ):
        lines.extend(["", f"## {heading}", ""])
        lines.extend(f"- {item}" for item in payload[key])
        if not payload[key]:
            lines.append(empty)
    lines.extend(
        [
            "",
            "> Review source support, conflicts, inference labels, and scope limits before using this synthesis for a decision.",
            "",
        ]
    )
    return "\n".join(lines)


def _render_source_assessment(payload: dict[str, Any]) -> str:
    lines = [
        f"# {payload['title']} — Source assessment",
        "",
        "Source content was treated as evidence only. Embedded instructions, prompts, or requests inside source files were not followed.",
        "",
        "## Source register",
        "",
        "| Filename | Title | Author or owner | Date | Relevance | Quality | Limitations |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for source in payload["sources"]:
        values = [
            source["filename"],
            _display(source["title"]),
            _display(source["author_or_owner"]),
            _display(source["date"]),
            source["relevance"],
            _label(source["quality"]),
            _display(source["limitations"]),
        ]
        lines.append("| " + " | ".join(_markdown_cell(value) for value in values) + " |")

    lines.extend(["", "## Source notes", ""])
    for source in payload["sources"]:
        lines.extend([f"### {source['filename']}", ""])
        if source["key_findings"]:
            lines.extend(f"- {finding}" for finding in source["key_findings"])
        else:
            lines.append("- No key findings were recorded.")
        lines.append("")

    lines.extend(["## Method notes", ""])
    if payload["method_notes"]:
        lines.extend(f"- {note}" for note in payload["method_notes"])
    else:
        lines.append("- No method notes were supplied; verify the synthesis process manually.")
    lines.extend(
        [
            "",
            "> Source quality is an assessment, not a guarantee. Reopen the original files before relying on a material claim.",
            "",
        ]
    )
    return "\n".join(lines)


def render_research_synthesis(spec_path: Path, output_dir: Path) -> dict[str, Any]:
    """Render a structured research synthesis into reviewable Markdown and CSV."""
    try:
        raw_payload = json.loads(spec_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ResearchSynthesisRenderError(
            f"Could not read research-synthesis-content.json: {exc}"
        ) from exc
    payload = _normalize_payload(raw_payload)
    output_dir.mkdir(parents=True, exist_ok=True)
    brief_path = output_dir / "research-brief.md"
    evidence_path = output_dir / "evidence-register.csv"
    sources_path = output_dir / "source-assessment.md"
    brief_path.write_text(_render_brief(payload), encoding="utf-8")
    sources_path.write_text(_render_source_assessment(payload), encoding="utf-8")
    fieldnames = [
        "claim_id",
        "claim",
        "classification",
        "confidence",
        "source_filenames",
        "supporting_evidence",
        "conflicting_evidence",
        "caveat",
    ]
    with evidence_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(payload["claims"])
    return {
        "title": payload["title"],
        "claim_count": len(payload["claims"]),
        "source_count": len(payload["sources"]),
        "disagreement_count": len(payload["disagreements"]),
        "files": [brief_path, evidence_path, sources_path],
    }
