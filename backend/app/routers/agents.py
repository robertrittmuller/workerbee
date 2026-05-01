"""Agents router."""

from datetime import datetime, timezone
import json
import mimetypes
from pathlib import Path
import shutil
import uuid
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent import execute_agent
from app.agent.sandbox import cleanup_execution_context, persist_execution_output_files
from app.config import settings
from app.database import async_session_maker, get_db
from app.models import (
    Agent,
    AgentType,
    Artifact,
    Execution,
    ExecutionLog,
    File as FileModel,
    Output,
    User,
)
from app.routers.auth import get_current_active_user
from app.schemas import (
    AgentCreate,
    AgentCreateFromTemplate,
    AgentResourceUpdate,
    AgentResponse,
    AgentRunRequest,
    AgentTemplateResponse,
    AgentTypeResponse,
    AgentUpdate,
    ExecutionResponse,
    FileResponse,
)

router = APIRouter()
TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "agent" / "templates"
TEMPLATE_CATALOG: list[dict[str, str]] = [
    {
        "id": "document-summarization",
        "name": "Document Summarization",
        "description": "Generates only a markdown summary report from one or more provided documents.",
        "default_markdown": """# Document Summarization Template

You summarize one or more user-provided documents into a single markdown report.

## Task
- Accept one or multiple input documents.
- Read only the provided materials.
- Produce exactly one markdown output report.

## Output Requirements
- Output format must be markdown only.
- Include: Executive Summary, Key Findings, Important Details, and Open Questions.
- Do not output CSV, JSON, HTML, code, or any non-markdown artifact unless explicitly requested by the user.

## Rules
- If multiple documents are provided, synthesize across them and note conflicts.
- Keep claims grounded in the provided documents.
- When information is missing or ambiguous, state it clearly.
""",
    },
    {
        "id": "html5-dashboard-generator",
        "name": "HTML5 Dashboard Generator",
        "description": "Builds interactive HTML5 dashboards from supported structured data files.",
        "default_markdown": """# HTML5 Dashboard Generator Template

You create interactive HTML5 dashboards from user-provided data files.

## Task
- Ingest provided data files (for example CSV, JSON, TSV, or spreadsheet exports).
- Build an interactive dashboard suitable for browser use.
- Output a self-contained HTML5 file by default unless dependencies are explicitly requested.

## Output Requirements
- Primary artifact: interactive `.html` dashboard.
- Include clear chart titles, legends, and axis labels.
- Add basic data-quality notes for missing values or parsing issues.

## Rules
- Match chart choices to data semantics (time series, categories, distributions).
- Prefer readable layouts and responsive behavior.
- If input data cannot be parsed, return a clear diagnostic summary and recommended fixes.
""",
    },
    {
        "id": "data-extractor-csv",
        "name": "Data Extractor (CSV)",
        "description": "Extracts structured fields from unstructured documents and produces a CSV output.",
        "default_markdown": """# Data Extractor CSV Template

You extract structured data from unstructured user-provided documents.

## Task
- Parse unstructured sources such as PDFs, text documents, notes, and reports.
- Identify repeatable records and fields.
- Produce a normalized CSV file.

## Output Requirements
- Primary artifact: `.csv` file with stable column names.
- Include a short markdown note describing extracted columns and assumptions.
- Preserve original units, dates, and currencies when present.

## Rules
- Do not invent missing values; leave blank when unavailable.
- Flag low-confidence extractions in a dedicated column when possible.
- Keep delimiter/quoting standards CSV-compatible.
""",
    },
    {
        "id": "blank-template",
        "name": "Blank Template",
        "description": "Open-ended template where the user specifies the task.",
        "default_markdown": """# Blank Template

You are a general-purpose agent. The user will define the task.

## Task
- Follow the user instructions exactly.
- Use provided files/resources as the primary source of truth.

## Rules
- Clarify missing requirements before making irreversible assumptions.
- Prefer concise, practical outputs aligned to the user request.
- If an output format is not specified, ask or choose a sensible default and state it.
""",
    },
]
TEMPLATE_CATALOG_BY_ID = {item["id"]: item for item in TEMPLATE_CATALOG}
UPLOADS_ROOT = Path("uploads").resolve()
PROJECT_ROOT = Path.cwd().resolve()


def _agent_config(agent: Agent) -> dict[str, Any]:
    """Return normalized agent config payload."""
    if isinstance(agent.config, dict):
        return dict(agent.config)
    return {}


def _strip_nul_text(value: str) -> str:
    """Remove NUL characters that PostgreSQL text/jsonb cannot store."""
    return value.replace("\x00", "")


def _sanitize_for_db(value: Any) -> Any:
    """Recursively sanitize payloads before persisting to Postgres."""
    if isinstance(value, str):
        return _strip_nul_text(value)
    if isinstance(value, dict):
        sanitized: dict[Any, Any] = {}
        for key, item in value.items():
            sanitized_key = _strip_nul_text(key) if isinstance(key, str) else key
            sanitized[sanitized_key] = _sanitize_for_db(item)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_for_db(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_for_db(item) for item in value]
    return value


def _extract_resource_ids(agent: Agent) -> list[uuid.UUID]:
    """Extract valid resource IDs from agent config."""
    resource_ids = _agent_config(agent).get("resource_ids", [])
    valid_ids: list[uuid.UUID] = []
    for raw_id in resource_ids:
        try:
            valid_ids.append(uuid.UUID(str(raw_id)))
        except (TypeError, ValueError):
            continue
    return valid_ids


async def _resolve_user_files(
    db: AsyncSession,
    user_id: uuid.UUID,
    file_ids: list[uuid.UUID],
) -> list[FileModel]:
    """Resolve file IDs that belong to the user."""
    if not file_ids:
        return []
    result = await db.execute(
        select(FileModel).where(
            FileModel.user_id == user_id,
            FileModel.id.in_(file_ids),
        )
    )
    files = list(result.scalars().all())
    if len(files) != len(set(file_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more resources are invalid or inaccessible",
        )
    return files


def _relative_storage_path(path: Path) -> str:
    """Convert absolute file path into project-relative storage path."""
    resolved = path.resolve()
    try:
        return resolved.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return resolved.as_posix()


def _scan_generated_artifacts(
    user_id: uuid.UUID,
) -> dict[str, dict[str, Any]]:
    """Scan generated artifact directory and return metadata keyed by storage path."""
    generated_dir = Path(f"uploads/{user_id}/generated").resolve()
    if not generated_dir.exists() or not generated_dir.is_dir():
        return {}

    discovered: dict[str, dict[str, Any]] = {}
    for path in generated_dir.rglob("*"):
        if not path.is_file():
            continue
        resolved = path.resolve()
        if UPLOADS_ROOT not in resolved.parents:
            continue

        storage_path = _relative_storage_path(resolved)
        content_type, _ = mimetypes.guess_type(resolved.name)
        discovered[storage_path] = {
            "filename": resolved.name,
            "storage_path": storage_path,
            "content_type": content_type or "application/octet-stream",
            "file_size": resolved.stat().st_size,
        }
    return discovered


def _collect_generated_artifacts(
    result: dict[str, Any],
    user_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Collect and normalize generated artifact metadata from agent result payload."""
    candidate_items: list[Any] = []
    for key in ("artifacts", "output_files", "files"):
        value = result.get(key)
        if isinstance(value, list):
            candidate_items.extend(value)

    state_payload = result.get("state")
    if isinstance(state_payload, dict):
        for key in ("artifacts", "output_files", "files"):
            value = state_payload.get(key)
            if isinstance(value, list):
                candidate_items.extend(value)

    generated_dir = Path(f"uploads/{user_id}/generated").resolve()
    seen: set[tuple[str, str]] = set()
    normalized: list[dict[str, Any]] = []
    for item in candidate_items:
        raw_path: str | None = None
        if isinstance(item, str) and item.strip():
            raw_path = item.strip()
            item = {}
        elif not isinstance(item, dict):
            continue

        filename: str | None = None
        for key in ("filename", "file_name", "name"):
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                filename = value.strip()
                break

        if raw_path is None:
            for key in ("storage_path", "path", "file_path", "artifact_path"):
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    raw_path = value.strip()
                    break

        if filename is None and raw_path:
            filename = Path(raw_path).name
        if filename is None:
            continue

        absolute_path: Path | None = None
        if raw_path:
            candidate_path = Path(raw_path)
            candidate_locations: list[Path] = []
            if candidate_path.is_absolute():
                candidate_locations.append(candidate_path.resolve())
            else:
                candidate_locations.append((PROJECT_ROOT / candidate_path).resolve())
                candidate_locations.append((generated_dir / candidate_path).resolve())
                candidate_locations.append((generated_dir / candidate_path.name).resolve())

            for location in candidate_locations:
                if not location.exists() or not location.is_file():
                    continue
                absolute_path = location
                break
        else:
            absolute_path = (generated_dir / filename).resolve()

        if absolute_path is None:
            continue
        if UPLOADS_ROOT not in absolute_path.parents:
            continue
        if not absolute_path.exists() or not absolute_path.is_file():
            continue

        storage_path = _relative_storage_path(absolute_path)
        item_key = (storage_path, filename)
        if item_key in seen:
            continue
        seen.add(item_key)

        raw_content_type = item.get("content_type")
        if not isinstance(raw_content_type, str) or not raw_content_type.strip():
            guessed_content_type, _ = mimetypes.guess_type(filename)
            content_type = guessed_content_type or "application/octet-stream"
        else:
            content_type = raw_content_type.strip()

        raw_file_size = item.get("file_size", item.get("size"))
        if isinstance(raw_file_size, int) and raw_file_size >= 0:
            file_size = raw_file_size
        else:
            file_size = absolute_path.stat().st_size

        normalized.append(
            {
                "filename": filename,
                "storage_path": storage_path,
                "content_type": content_type,
                "file_size": file_size,
            }
        )

    return normalized


def _primary_output_artifact(
    execution_id: uuid.UUID,
    output_text: str,
) -> dict[str, str]:
    """Resolve filename/content type for the primary run output artifact."""
    normalized_text = output_text.strip()
    if normalized_text:
        try:
            parsed_json = json.loads(normalized_text)
        except json.JSONDecodeError:
            parsed_json = None
        if isinstance(parsed_json, (dict, list)):
            pretty_json = json.dumps(parsed_json, indent=2, ensure_ascii=False)
            return {
                "filename": f"{execution_id}_output.json",
                "content_type": "application/json",
                "output_type": "json",
                "content": f"{pretty_json}\n",
            }

    return {
        "filename": f"{execution_id}_output.md",
        "content_type": "text/markdown",
        "output_type": "markdown",
        "content": output_text,
    }


def _snapshot_workspace_output_files() -> dict[str, tuple[int, int]]:
    """Snapshot workspace output files keyed by absolute path with size/mtime metadata."""
    snapshots: dict[str, tuple[int, int]] = {}
    candidate_dirs = [
        Path(settings.opencode_workspace_root) / "output",
        Path("workspace/output").resolve(),
    ]
    visited_dirs: set[Path] = set()

    for directory in candidate_dirs:
        resolved_dir = directory.resolve()
        if resolved_dir in visited_dirs:
            continue
        visited_dirs.add(resolved_dir)

        if not resolved_dir.exists() or not resolved_dir.is_dir():
            continue

        for path in resolved_dir.rglob("*"):
            if not path.is_file():
                continue
            try:
                stats = path.stat()
            except OSError:
                continue
            snapshots[str(path.resolve())] = (stats.st_size, stats.st_mtime_ns)

    return snapshots


def _workspace_output_manifest_path(user_id: uuid.UUID) -> Path:
    """Return manifest path used to track imported workspace output files."""
    return Path(f"uploads/{user_id}/workspace_output_manifest.json").resolve()


def _load_workspace_output_manifest(
    user_id: uuid.UUID,
) -> dict[str, dict[str, Any]]:
    """Load persisted workspace-output import metadata."""
    manifest_path = _workspace_output_manifest_path(user_id)
    if not manifest_path.exists() or not manifest_path.is_file():
        return {}

    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}

    normalized: dict[str, dict[str, Any]] = {}
    for source_path, metadata in payload.items():
        if not isinstance(source_path, str) or not isinstance(metadata, dict):
            continue
        storage_path = metadata.get("storage_path")
        file_size = metadata.get("file_size")
        mtime_ns = metadata.get("mtime_ns")
        if (
            not isinstance(storage_path, str)
            or not storage_path.strip()
            or not isinstance(file_size, int)
            or file_size < 0
            or not isinstance(mtime_ns, int)
            or mtime_ns < 0
        ):
            continue
        normalized[source_path] = {
            "storage_path": storage_path,
            "file_size": file_size,
            "mtime_ns": mtime_ns,
        }

    return normalized


def _save_workspace_output_manifest(
    user_id: uuid.UUID,
    manifest: dict[str, dict[str, Any]],
) -> None:
    """Persist workspace-output import metadata."""
    manifest_path = _workspace_output_manifest_path(user_id)
    try:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    except OSError:
        return


def _import_workspace_output_files(
    user_id: uuid.UUID,
    execution_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Copy workspace output files into persisted generated storage and return imported artifacts."""
    manifest = _load_workspace_output_manifest(user_id)
    updated_manifest: dict[str, dict[str, Any]] = {}
    current_snapshot = _snapshot_workspace_output_files()
    if not current_snapshot:
        _save_workspace_output_manifest(user_id, updated_manifest)
        return []

    target_dir = Path(f"uploads/{user_id}/generated").resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    target_base_dir = target_dir / str(execution_id)
    workspace_output_roots = [
        Path("/workspace/output").resolve(),
        Path("workspace/output").resolve(),
    ]
    imported: list[dict[str, Any]] = []

    for source_path_str, metadata in current_snapshot.items():
        source_file_size, source_mtime_ns = metadata
        previous = manifest.get(source_path_str)
        if (
            isinstance(previous, dict)
            and previous.get("file_size") == source_file_size
            and previous.get("mtime_ns") == source_mtime_ns
        ):
            previous_storage_path = previous.get("storage_path")
            if isinstance(previous_storage_path, str) and previous_storage_path.strip():
                previous_target_path = (PROJECT_ROOT / previous_storage_path).resolve()
                if previous_target_path.exists() and previous_target_path.is_file():
                    updated_manifest[source_path_str] = {
                        "storage_path": previous_storage_path,
                        "file_size": source_file_size,
                        "mtime_ns": source_mtime_ns,
                    }
                    continue

        source_path = Path(source_path_str).resolve()
        if not source_path.exists() or not source_path.is_file():
            continue

        relative_source_path: Path | None = None
        for root_path in workspace_output_roots:
            try:
                relative_source_path = source_path.relative_to(root_path)
                break
            except ValueError:
                continue
        if relative_source_path is None or not relative_source_path.parts:
            relative_source_path = Path(source_path.name)

        target_path = target_base_dir / relative_source_path
        duplicate_counter = 1
        while target_path.exists():
            target_path = target_path.with_name(
                f"{relative_source_path.stem}_{duplicate_counter}{relative_source_path.suffix}"
            )
            duplicate_counter += 1

        try:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, target_path)
        except OSError:
            continue

        storage_path = _relative_storage_path(target_path)
        content_type, _ = mimetypes.guess_type(source_path.name)
        imported.append(
            {
                "filename": source_path.name,
                "storage_path": storage_path,
                "content_type": content_type or "application/octet-stream",
                "file_size": target_path.stat().st_size if target_path.exists() else source_file_size,
            }
        )
        updated_manifest[source_path_str] = {
            "storage_path": storage_path,
            "file_size": source_file_size,
            "mtime_ns": source_mtime_ns,
        }

    _save_workspace_output_manifest(user_id, updated_manifest)
    return imported


async def _process_agent_execution(
    execution_id: uuid.UUID,
    user_id: uuid.UUID,
    agent_name: str,
    agent_config: dict[str, Any],
    llm_settings: dict[str, Any] | None,
    task_prompt: str | None,
    input_files: list[dict[str, str]],
    opencode_agent: str = "general",
) -> None:
    """Execute a queued agent run and persist status/log transitions."""
    async with async_session_maker() as db:
        generated_before = _scan_generated_artifacts(user_id)
        execution = await db.get(Execution, execution_id)
        if execution is None:
            cleanup_execution_context(execution_id)
            return

        execution.status = "running"
        execution.started_at = execution.started_at or datetime.now(timezone.utc)
        db.add(
            ExecutionLog(
                execution_id=execution_id,
                level="info",
                message="Agent execution started",
            )
        )
        await db.commit()

        effective_agent_config: dict[str, Any] = dict(agent_config)
        if isinstance(llm_settings, dict):
            effective_agent_config.update(llm_settings)

        connectivity_error: str | None = None
        litellm_base_url = getattr(settings, "litellm_base_url", None)
        if litellm_base_url:
            models_url = f"{litellm_base_url.rstrip('/')}/models"
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    response = await client.get(models_url)
                    if response.status_code >= 500:
                        connectivity_error = (
                            f"liteLLM endpoint returned {response.status_code} at {models_url}"
                        )
            except Exception as exc:  # pragma: no cover - external connectivity variability
                connectivity_error = f"Unable to reach liteLLM endpoint {models_url}: {exc}"

        try:
            if connectivity_error:
                result = {
                    "success": False,
                    "error": connectivity_error,
                }
            else:
                result = await execute_agent(
                    execution_id=execution_id,
                    agent_config=effective_agent_config,
                    task_prompt=task_prompt or "Complete the assigned task.",
                    input_files=input_files,
                    output_config={},
                    opencode_agent=opencode_agent,
                )
        except Exception as exc:  # pragma: no cover - defensive failure path
            result = {
                "success": False,
                "error": str(exc),
            }
        result = _sanitize_for_db(result)

        execution = await db.get(Execution, execution_id)
        if execution is None:
            cleanup_execution_context(execution_id)
            return

        completed_at = datetime.now(timezone.utc)
        execution.completed_at = completed_at
        if execution.started_at:
            execution.duration_ms = int(
                (completed_at - execution.started_at).total_seconds() * 1000
            )

        existing_result = execution.result if isinstance(execution.result, dict) else {}
        execution.result = _sanitize_for_db(
            {
            **existing_result,
            "run_result": result,
            }
        )

        if result.get("success"):
            output_text = ""
            raw_messages = result.get("messages")
            if isinstance(raw_messages, list):
                for message in reversed(raw_messages):
                    if not isinstance(message, dict):
                        continue
                    if message.get("role") != "assistant":
                        continue
                    content = message.get("content")
                    if isinstance(content, str) and content.strip():
                        output_text = content
                        break
            if not output_text:
                output_text = "Execution completed with no textual output."
            output_text = _strip_nul_text(output_text)

            db.add(
                ExecutionLog(
                    execution_id=execution_id,
                    level="info",
                    message=f"Agent Output:\n\n{output_text}",
                )
            )
            await db.flush()

            primary_output = _primary_output_artifact(execution_id, output_text)
            filename = primary_output["filename"]
            output_content = primary_output["content"]
            output_content_type = primary_output["content_type"]
            output_record_type = primary_output["output_type"]
            storage_path = f"uploads/{user_id}/generated/{filename}"
            absolute_path = Path(storage_path)
            absolute_path.parent.mkdir(parents=True, exist_ok=True)
            absolute_path.write_text(output_content, encoding="utf-8")

            output_record = Output(
                user_id=user_id,
                name=f"{agent_name} Output",
                output_type=output_record_type,
                config={
                    "execution_id": str(execution_id),
                    "generated_by": "agent-run",
                },
            )
            db.add(output_record)
            await db.flush()

            db.add(
                Artifact(
                    execution_id=execution_id,
                    output_id=output_record.id,
                    filename=filename,
                    content_type=output_content_type,
                    file_size=len(output_content.encode("utf-8")),
                    storage_path=storage_path,
                )
            )

            artifact_paths = [storage_path]
            artifact_path_set = {storage_path}
            extra_artifacts = _collect_generated_artifacts(result, user_id)
            for artifact in extra_artifacts:
                if artifact["storage_path"] in artifact_path_set:
                    continue
                db.add(
                    Artifact(
                        execution_id=execution_id,
                        output_id=None,
                        filename=artifact["filename"],
                        content_type=artifact["content_type"],
                        file_size=artifact["file_size"],
                        storage_path=artifact["storage_path"],
                    )
                )
                artifact_paths.append(artifact["storage_path"])
                artifact_path_set.add(artifact["storage_path"])

            sandbox_artifacts = persist_execution_output_files(
                user_id=user_id,
                execution_id=execution_id,
            )
            for artifact in sandbox_artifacts:
                if artifact["storage_path"] in artifact_path_set:
                    continue
                db.add(
                    Artifact(
                        execution_id=execution_id,
                        output_id=None,
                        filename=artifact["filename"],
                        content_type=artifact["content_type"],
                        file_size=artifact["file_size"],
                        storage_path=artifact["storage_path"],
                    )
                )
                artifact_paths.append(artifact["storage_path"])
                artifact_path_set.add(artifact["storage_path"])

            imported_workspace_artifacts = _import_workspace_output_files(
                user_id=user_id,
                execution_id=execution_id,
            )
            for artifact in imported_workspace_artifacts:
                if artifact["storage_path"] in artifact_path_set:
                    continue
                db.add(
                    Artifact(
                        execution_id=execution_id,
                        output_id=None,
                        filename=artifact["filename"],
                        content_type=artifact["content_type"],
                        file_size=artifact["file_size"],
                        storage_path=artifact["storage_path"],
                    )
                )
                artifact_paths.append(artifact["storage_path"])
                artifact_path_set.add(artifact["storage_path"])

            generated_after = _scan_generated_artifacts(user_id)
            for storage_key, artifact in generated_after.items():
                if storage_key in generated_before:
                    continue
                if storage_key in artifact_path_set:
                    continue
                db.add(
                    Artifact(
                        execution_id=execution_id,
                        output_id=None,
                        filename=artifact["filename"],
                        content_type=artifact["content_type"],
                        file_size=artifact["file_size"],
                        storage_path=artifact["storage_path"],
                    )
                )
                artifact_paths.append(artifact["storage_path"])
                artifact_path_set.add(artifact["storage_path"])

            execution.status = "completed"
            db.add(
                ExecutionLog(
                    execution_id=execution_id,
                    level="info",
                    message="Agent execution completed",
                    data=_sanitize_for_db({
                        "artifact_path": storage_path,
                        "artifact_paths": artifact_paths,
                        "artifact_count": len(artifact_paths),
                    }),
                )
            )
        else:
            sandbox_artifacts = persist_execution_output_files(
                user_id=user_id,
                execution_id=execution_id,
            )
            artifact_paths: list[str] = []
            artifact_path_set: set[str] = set()
            for artifact in sandbox_artifacts:
                if artifact["storage_path"] in artifact_path_set:
                    continue
                db.add(
                    Artifact(
                        execution_id=execution_id,
                        output_id=None,
                        filename=artifact["filename"],
                        content_type=artifact["content_type"],
                        file_size=artifact["file_size"],
                        storage_path=artifact["storage_path"],
                    )
                )
                artifact_paths.append(artifact["storage_path"])
                artifact_path_set.add(artifact["storage_path"])

            imported_workspace_artifacts = _import_workspace_output_files(
                user_id=user_id,
                execution_id=execution_id,
            )
            for artifact in imported_workspace_artifacts:
                if artifact["storage_path"] in artifact_path_set:
                    continue
                db.add(
                    Artifact(
                        execution_id=execution_id,
                        output_id=None,
                        filename=artifact["filename"],
                        content_type=artifact["content_type"],
                        file_size=artifact["file_size"],
                        storage_path=artifact["storage_path"],
                    )
                )
                artifact_paths.append(artifact["storage_path"])
                artifact_path_set.add(artifact["storage_path"])

            execution.status = "failed"
            execution.error_message = _strip_nul_text(str(result.get("error", "Agent execution failed")))
            db.add(
                ExecutionLog(
                    execution_id=execution_id,
                    level="error",
                    message="Agent execution failed",
                    data=_sanitize_for_db({
                        "error": execution.error_message,
                        "run_result": json.dumps(result, default=str)[:2000],
                        "artifact_paths": artifact_paths,
                        "artifact_count": len(artifact_paths),
                    }),
                )
            )

        await db.commit()
        cleanup_execution_context(execution_id)


def _template_markdown_files(template_path: Path) -> list[Path]:
    """Return all markdown files under a template."""
    return sorted(template_path.rglob("*.md"))


def _template_description(markdown_files: list[Path]) -> str:
    """Build a one-line template description."""
    if not markdown_files:
        return "Agent template"
    content = markdown_files[0].read_text(encoding="utf-8")
    for line in content.splitlines():
        cleaned = line.strip().lstrip("#").strip()
        if cleaned:
            return cleaned
    return "Agent template"


def _serialize_template(template_path: Path) -> AgentTemplateResponse:
    """Serialize template metadata for API responses."""
    markdown_files = _template_markdown_files(template_path)
    if not markdown_files:
        raise ValueError(f"Template {template_path.name} has no markdown files")

    catalog_entry = TEMPLATE_CATALOG_BY_ID.get(template_path.name, {})
    template_name = catalog_entry.get("name") or template_path.name.replace("-", " ").replace("_", " ").title()
    template_description = catalog_entry.get("description") or _template_description(markdown_files)

    return AgentTemplateResponse(
        id=template_path.name,
        name=template_name,
        description=template_description,
        markdown_files=[
            str(path.relative_to(template_path).as_posix()) for path in markdown_files
        ],
    )


def _default_template(template_id: str) -> tuple[AgentTemplateResponse, list[dict[str, str]]]:
    """Return a built-in fallback template from the catalog."""
    catalog_entry = TEMPLATE_CATALOG_BY_ID.get(template_id)
    if not catalog_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    template = AgentTemplateResponse(
        id=template_id,
        name=catalog_entry["name"],
        description=catalog_entry["description"],
        markdown_files=["system.md"],
    )
    markdown_payload = [{"path": "system.md", "content": catalog_entry["default_markdown"]}]
    return template, markdown_payload


def _load_template(template_id: str) -> tuple[AgentTemplateResponse, list[dict[str, str]]]:
    """Load template metadata and markdown file contents."""
    root_path = TEMPLATES_DIR.resolve()
    template_path = (TEMPLATES_DIR / template_id).resolve()
    if root_path not in template_path.parents:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    if template_path.exists() and template_path.is_dir():
        template = _serialize_template(template_path)
        markdown_payload = []
        for relative_path in template.markdown_files:
            absolute_path = template_path / relative_path
            markdown_payload.append(
                {
                    "path": relative_path,
                    "content": absolute_path.read_text(encoding="utf-8"),
                }
            )
        return template, markdown_payload

    if template_id in TEMPLATE_CATALOG_BY_ID:
        return _default_template(template_id)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Template not found",
    )


async def _get_agent_or_404(
    db: AsyncSession,
    user_id: uuid.UUID,
    agent_id: uuid.UUID,
) -> Agent:
    """Fetch an agent and enforce ownership."""
    result = await db.execute(
        select(Agent).where(
            Agent.id == agent_id,
            Agent.user_id == user_id,
        )
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )
    return agent


@router.get("/types", response_model=list[AgentTypeResponse])
async def list_agent_types(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AgentType]:
    """List all available agent types."""
    result = await db.execute(select(AgentType).where(AgentType.is_active.is_(True)))
    return list(result.scalars().all())


@router.get("/templates", response_model=list[AgentTemplateResponse])
async def list_agent_templates() -> list[AgentTemplateResponse]:
    """List markdown-based agent templates."""
    templates_by_id: dict[str, AgentTemplateResponse] = {}

    if TEMPLATES_DIR.exists():
        for path in sorted(TEMPLATES_DIR.iterdir()):
            if not path.is_dir():
                continue
            markdown_files = _template_markdown_files(path)
            if not markdown_files:
                continue
            template = _serialize_template(path)
            templates_by_id[template.id] = template

    for catalog_entry in TEMPLATE_CATALOG:
        template_id = catalog_entry["id"]
        if template_id not in templates_by_id:
            fallback_template, _ = _default_template(template_id)
            templates_by_id[template_id] = fallback_template

    ordered_templates: list[AgentTemplateResponse] = []
    for catalog_entry in TEMPLATE_CATALOG:
        template = templates_by_id.pop(catalog_entry["id"], None)
        if template is not None:
            ordered_templates.append(template)

    ordered_templates.extend(
        sorted(templates_by_id.values(), key=lambda template: template.name.lower())
    )
    return ordered_templates


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
) -> list[Agent]:
    """List all agents for the current user."""
    result = await db.execute(
        select(Agent)
        .where(Agent.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post(
    "/from-template",
    response_model=AgentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_agent_from_template(
    agent_data: AgentCreateFromTemplate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Agent:
    """Create a new agent from a markdown template."""
    template, markdown_payload = _load_template(agent_data.template_id)
    await _resolve_user_files(db, current_user.id, agent_data.resource_ids)

    config: dict[str, Any] = {
        "template": {
            "id": template.id,
            "name": template.name,
            "description": template.description,
            "markdown_files": markdown_payload,
        },
        "resource_ids": [str(file_id) for file_id in agent_data.resource_ids],
        "deployment": {
            "target": "sandbox",
            "status": "ready",
        },
    }

    agent = Agent(
        user_id=current_user.id,
        agent_type_id=agent_data.agent_type_id,
        name=agent_data.name,
        description=agent_data.description or template.description,
        config=config,
        llm_settings=agent_data.llm_settings,
    )
    db.add(agent)
    await db.flush()
    await db.refresh(agent)
    return agent


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    agent_data: AgentCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Agent:
    """Create a new agent."""
    agent = Agent(
        user_id=current_user.id,
        agent_type_id=agent_data.agent_type_id,
        name=agent_data.name,
        description=agent_data.description,
        config=agent_data.config,
        llm_settings=agent_data.llm_settings,
    )
    db.add(agent)
    await db.flush()
    await db.refresh(agent)
    return agent


@router.post("/{agent_id}/run", response_model=ExecutionResponse)
async def run_agent(
    agent_id: uuid.UUID,
    run_data: AgentRunRequest,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Execution:
    """Start an execution for an agent."""
    agent = await _get_agent_or_404(db, current_user.id, agent_id)

    stored_resource_ids = _extract_resource_ids(agent)
    resolved_resource_ids = (
        stored_resource_ids if run_data.resource_ids is None else run_data.resource_ids
    )
    resolved_files = await _resolve_user_files(db, current_user.id, resolved_resource_ids)

    execution = Execution(
        agent_id=agent.id,
        task_id=run_data.task_id,
        status="pending",
        started_at=datetime.now(timezone.utc),
        result=_sanitize_for_db({
            "queued": True,
            "task_prompt": run_data.task_prompt,
            "resource_ids": [str(resource_id) for resource_id in resolved_resource_ids],
        }),
    )
    db.add(execution)
    await db.flush()

    db.add(
        ExecutionLog(
            execution_id=execution.id,
            level="info",
            message="Agent execution queued",
            data=_sanitize_for_db({
                "agent_id": str(agent.id),
                "resource_count": len(resolved_resource_ids),
            }),
        )
    )
    await db.flush()
    await db.commit()
    await db.refresh(execution)

    background_tasks.add_task(
        _process_agent_execution,
        execution.id,
        current_user.id,
        agent.name,
        _agent_config(agent),
        agent.llm_settings if isinstance(agent.llm_settings, dict) else None,
        run_data.task_prompt,
        [
            {
                "filename": file.original_filename,
                "content_type": file.content_type,
                "storage_path": file.storage_path,
                "file_size": file.file_size,
            }
            for file in resolved_files
        ],
        run_data.opencode_agent,
    )
    return execution


@router.get("/{agent_id}/resources", response_model=list[FileResponse])
async def list_agent_resources(
    agent_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FileModel]:
    """List all resources attached to an agent."""
    agent = await _get_agent_or_404(db, current_user.id, agent_id)
    resource_ids = _extract_resource_ids(agent)
    if not resource_ids:
        return []

    result = await db.execute(
        select(FileModel).where(
            FileModel.user_id == current_user.id,
            FileModel.id.in_(resource_ids),
        )
    )
    files = list(result.scalars().all())
    files_by_id = {file.id: file for file in files}
    return [files_by_id[file_id] for file_id in resource_ids if file_id in files_by_id]


@router.put("/{agent_id}/resources", response_model=AgentResponse)
async def update_agent_resources(
    agent_id: uuid.UUID,
    resource_data: AgentResourceUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Agent:
    """Replace resources attached to an agent."""
    agent = await _get_agent_or_404(db, current_user.id, agent_id)
    await _resolve_user_files(db, current_user.id, resource_data.resource_ids)

    config = _agent_config(agent)
    config["resource_ids"] = [str(file_id) for file_id in resource_data.resource_ids]
    agent.config = config

    await db.flush()
    await db.refresh(agent)
    return agent


@router.delete("/{agent_id}/resources/{file_id}", response_model=AgentResponse)
async def remove_agent_resource(
    agent_id: uuid.UUID,
    file_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Agent:
    """Detach a single resource from an agent."""
    agent = await _get_agent_or_404(db, current_user.id, agent_id)
    existing_ids = _extract_resource_ids(agent)
    remaining_ids = [resource_id for resource_id in existing_ids if resource_id != file_id]

    config = _agent_config(agent)
    config["resource_ids"] = [str(resource_id) for resource_id in remaining_ids]
    agent.config = config

    await db.flush()
    await db.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Agent:
    """Get an agent by ID."""
    return await _get_agent_or_404(db, current_user.id, agent_id)


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: uuid.UUID,
    agent_data: AgentUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Agent:
    """Update an agent."""
    agent = await _get_agent_or_404(db, current_user.id, agent_id)
    
    update_data = agent_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(agent, field, value)
    
    await db.flush()
    await db.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete an agent."""
    agent = await _get_agent_or_404(db, current_user.id, agent_id)
    await db.delete(agent)
