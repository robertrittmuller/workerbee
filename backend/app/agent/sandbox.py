"""Sandbox runtime client utilities for agent code execution."""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
import time
from typing import Any
import uuid

import httpx

from app.config import settings

PROJECT_ROOT = Path.cwd().resolve()
_CAPABILITY_CACHE: dict[str, Any] | None = None
_CAPABILITY_CACHE_AT = 0.0
_EXECUTION_CONTEXTS: dict[str, dict[str, Any]] = {}


class SandboxRuntimeError(RuntimeError):
    """Raised when sandbox setup or execution fails."""


def _sandbox_url(path: str) -> str:
    base_url = settings.sandbox_api_base_url.rstrip("/")
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{base_url}{path}"


async def _request_json(
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    timeout: int | None = None,
) -> dict[str, Any]:
    """Perform an HTTP request against sandbox API and parse JSON response."""
    request_timeout = timeout or settings.sandbox_http_timeout
    url = _sandbox_url(path)
    try:
        async with httpx.AsyncClient(timeout=request_timeout) as client:
            response = await client.request(method, url, json=payload)
    except httpx.HTTPError as exc:
        raise SandboxRuntimeError(f"Sandbox request failed for {url}: {exc}") from exc

    if response.status_code >= 400:
        body_preview = response.text[:500]
        raise SandboxRuntimeError(
            f"Sandbox request returned {response.status_code} for {url}: {body_preview}"
        )

    if not response.text.strip():
        return {}

    try:
        data = response.json()
    except ValueError as exc:
        raise SandboxRuntimeError(f"Sandbox returned invalid JSON for {url}") from exc

    if not isinstance(data, dict):
        raise SandboxRuntimeError(f"Sandbox JSON payload for {url} is not an object")
    return data


def _resolve_project_file(path_value: str) -> Path:
    """Resolve a storage path into an absolute project path."""
    candidate = Path(path_value)
    return candidate.resolve() if candidate.is_absolute() else (PROJECT_ROOT / candidate).resolve()


def _relative_storage_path(path: Path) -> str:
    """Convert absolute path into project-relative storage path."""
    resolved = path.resolve()
    try:
        return resolved.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return resolved.as_posix()


def _encode_file_payload(content: bytes) -> str:
    return base64.b64encode(content).decode("ascii")


def _decode_file_payload(content_b64: str) -> bytes:
    return base64.b64decode(content_b64.encode("ascii"), validate=True)


def _relative_output_file_path(sandbox_path: str, output_dir: str) -> Path:
    """Build a safe relative path for a sandbox output file."""
    raw_path = Path(sandbox_path)
    output_root = Path(output_dir)

    if raw_path.is_absolute():
        try:
            relative = raw_path.relative_to(output_root)
        except ValueError:
            relative = Path(raw_path.name)
    else:
        relative = raw_path

    sanitized_parts = [part for part in relative.parts if part not in {"", ".", ".."}]
    if not sanitized_parts:
        fallback_name = raw_path.name or "output.bin"
        return Path(fallback_name)

    return Path(*sanitized_parts)


def _default_context(execution_id: uuid.UUID) -> dict[str, Any]:
    execution_token = str(execution_id)
    input_dir = f"{settings.sandbox_workspace_root}/input/{execution_token}"
    output_dir = f"{settings.sandbox_workspace_root}/output/{execution_token}"
    return {
        "execution_id": execution_token,
        "input_dir": input_dir,
        "output_dir": output_dir,
        "input_files": [],
        "output_files": {},
        "warnings": [],
    }


def _get_context(execution_id: uuid.UUID) -> dict[str, Any]:
    execution_token = str(execution_id)
    return _EXECUTION_CONTEXTS.setdefault(execution_token, _default_context(execution_id))


def _build_existing_output_payload(context: dict[str, Any]) -> list[dict[str, str]]:
    """Encode current context output files for sandbox API payloads."""
    payload: list[dict[str, str]] = []
    output_files = context.get("output_files", {})
    if not isinstance(output_files, dict):
        return payload

    for file_path, content in output_files.items():
        if not isinstance(file_path, str) or not isinstance(content, bytes):
            continue
        payload.append(
            {
                "path": file_path,
                "content_b64": _encode_file_payload(content),
            }
        )
    return payload


def _context_output_file_details(context: dict[str, Any]) -> list[dict[str, Any]]:
    """Build output-file metadata list from context payload."""
    details: list[dict[str, Any]] = []
    output_files = context.get("output_files", {})
    if not isinstance(output_files, dict):
        return details

    for path_value, content in sorted(output_files.items()):
        if not isinstance(path_value, str) or not isinstance(content, bytes):
            continue
        content_type, _ = mimetypes.guess_type(Path(path_value).name)
        details.append(
            {
                "path": path_value,
                "size": len(content),
                "content_type": content_type or "application/octet-stream",
            }
        )
    return details


def _update_context_output_files_from_response(
    context: dict[str, Any],
    response: dict[str, Any],
) -> list[dict[str, Any]]:
    """Update context output files from sandbox response and return metadata."""
    updated_outputs: dict[str, bytes] = {}
    output_file_details: list[dict[str, Any]] = []
    response_files = response.get("output_files", [])
    if isinstance(response_files, list):
        for item in response_files:
            if not isinstance(item, dict):
                continue
            path_value = item.get("path")
            content_b64 = item.get("content_b64")
            if not isinstance(path_value, str) or not isinstance(content_b64, str):
                continue
            try:
                updated_outputs[path_value] = _decode_file_payload(content_b64)
            except Exception:
                continue

            raw_size = item.get("size")
            if isinstance(raw_size, int):
                file_size = raw_size
            else:
                try:
                    file_size = int(raw_size)
                except (TypeError, ValueError):
                    file_size = len(updated_outputs[path_value])
            output_file_details.append(
                {
                    "path": path_value,
                    "size": file_size,
                    "content_type": str(
                        item.get("content_type", "application/octet-stream")
                    ),
                }
            )

    context["output_files"] = updated_outputs
    return output_file_details


def _normalize_output_file_path(
    context: dict[str, Any],
    path_value: str,
) -> str | None:
    """Normalize a target output path and enforce output-dir containment."""
    raw_path = Path(path_value)
    output_root = Path(str(context.get("output_dir", settings.sandbox_workspace_root))).resolve()

    if raw_path.is_absolute():
        candidate = raw_path.resolve()
    else:
        candidate = (output_root / raw_path).resolve()

    try:
        relative = candidate.relative_to(output_root)
    except ValueError:
        return None

    sanitized_parts = [part for part in relative.parts if part not in {"", ".", ".."}]
    if not sanitized_parts:
        return None

    return (output_root / Path(*sanitized_parts)).as_posix()


def _normalize_input_file_path(
    context: dict[str, Any],
    path_value: str,
) -> str | None:
    """Normalize a target input path and enforce input-dir containment."""
    raw_path = Path(path_value)
    input_root = Path(str(context.get("input_dir", settings.sandbox_workspace_root))).resolve()

    if raw_path.is_absolute():
        candidate = raw_path.resolve()
    else:
        candidate = (input_root / raw_path).resolve()

    try:
        relative = candidate.relative_to(input_root)
    except ValueError:
        return None

    sanitized_parts = [part for part in relative.parts if part not in {"", ".", ".."}]
    if not sanitized_parts:
        return None

    return (input_root / Path(*sanitized_parts)).as_posix()


def _context_input_file_map(context: dict[str, Any]) -> dict[str, bytes]:
    """Decode staged input files into a path->bytes mapping."""
    mapped: dict[str, bytes] = {}
    input_files = context.get("input_files", [])
    if not isinstance(input_files, list):
        return mapped

    for item in input_files:
        if not isinstance(item, dict):
            continue
        path_value = item.get("path")
        content_b64 = item.get("content_b64")
        if not isinstance(path_value, str) or not isinstance(content_b64, str):
            continue
        try:
            mapped[path_value] = _decode_file_payload(content_b64)
        except Exception:
            continue
    return mapped


def _context_input_file_details(context: dict[str, Any]) -> list[dict[str, Any]]:
    """Build input-file metadata list from staged context payload."""
    details: list[dict[str, Any]] = []
    input_map = _context_input_file_map(context)
    for path_value, content in sorted(input_map.items()):
        content_type, _ = mimetypes.guess_type(Path(path_value).name)
        details.append(
            {
                "path": path_value,
                "size": len(content),
                "content_type": content_type or "application/octet-stream",
            }
        )
    return details


async def ensure_sandbox_ready() -> None:
    """Ensure sandbox service is reachable."""
    payload = await _request_json("GET", "/healthz", timeout=10)
    status_value = str(payload.get("status", "")).lower()
    if status_value != "ok":
        raise SandboxRuntimeError("Sandbox health check returned unexpected status")


async def prepare_sandbox_workspace(
    execution_id: uuid.UUID,
    input_files: list[dict[str, Any]],
) -> dict[str, Any]:
    """Prepare per-execution workspace metadata and stage input files in memory."""
    await ensure_sandbox_ready()

    context = _default_context(execution_id)
    staged_files: list[dict[str, str]] = []
    warnings: list[str] = []
    payload_files: list[dict[str, str]] = []

    for file_info in input_files:
        raw_storage_path = file_info.get("storage_path")
        if not isinstance(raw_storage_path, str) or not raw_storage_path.strip():
            continue

        source_path = _resolve_project_file(raw_storage_path)
        if not source_path.exists() or not source_path.is_file():
            warnings.append(f"Missing input file at {source_path}")
            continue

        filename = Path(str(file_info.get("filename", source_path.name))).name
        sandbox_path = f"{context['input_dir']}/{filename}"

        try:
            content = source_path.read_bytes()
        except OSError as exc:
            warnings.append(f"Failed to read input file {filename}: {exc}")
            continue

        payload_files.append(
            {
                "path": sandbox_path,
                "content_b64": _encode_file_payload(content),
            }
        )
        staged_files.append(
            {
                "filename": filename,
                "sandbox_path": sandbox_path,
            }
        )

    context["input_files"] = payload_files
    context["warnings"] = warnings
    _EXECUTION_CONTEXTS[str(execution_id)] = context

    return {
        "input_dir": context["input_dir"],
        "output_dir": context["output_dir"],
        "scripts_dir": f"{settings.sandbox_workspace_root}/agent_runs/{execution_id}/scripts",
        "staged_files": staged_files,
        "warnings": warnings,
    }


async def discover_sandbox_capabilities(*, force_refresh: bool = False) -> dict[str, Any]:
    """Discover python/CLI capabilities available in sandbox service."""
    global _CAPABILITY_CACHE
    global _CAPABILITY_CACHE_AT

    now = time.time()
    if (
        not force_refresh
        and _CAPABILITY_CACHE is not None
        and now - _CAPABILITY_CACHE_AT < settings.sandbox_capability_cache_seconds
    ):
        return dict(_CAPABILITY_CACHE)

    await ensure_sandbox_ready()
    payload = await _request_json("GET", "/v1/capabilities", timeout=20)
    payload["sandbox_api_base_url"] = settings.sandbox_api_base_url
    payload["workspace_root"] = settings.sandbox_workspace_root

    _CAPABILITY_CACHE = dict(payload)
    _CAPABILITY_CACHE_AT = now
    return payload


async def execute_python_code(
    execution_id: uuid.UUID,
    *,
    step_index: int,
    code: str,
    timeout: int | None = None,
) -> dict[str, Any]:
    """Execute python code via sandbox API and return structured result."""
    await ensure_sandbox_ready()

    context = _get_context(execution_id)
    timeout_seconds = timeout or settings.sandbox_timeout

    existing_outputs = _build_existing_output_payload(context)

    payload = {
        "execution_id": str(execution_id),
        "step_index": step_index,
        "code": code,
        "timeout_seconds": timeout_seconds,
        "input_dir": context["input_dir"],
        "output_dir": context["output_dir"],
        "input_files": context.get("input_files", []),
        "output_files": existing_outputs,
    }

    try:
        response = await _request_json(
            "POST",
            "/v1/execute",
            payload=payload,
            timeout=timeout_seconds + 10,
        )
    except SandboxRuntimeError as exc:
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": str(exc),
            "script_path": f"{settings.sandbox_workspace_root}/agent_runs/{execution_id}/step_{step_index}.py",
            "output_files": _context_output_file_details(context),
        }

    output_file_details = _update_context_output_files_from_response(context, response)

    return {
        "success": bool(response.get("success", False)),
        "exit_code": int(response.get("exit_code", -1)),
        "stdout": str(response.get("stdout", "")),
        "stderr": str(response.get("stderr", "")),
        "script_path": str(
            response.get(
                "script_path",
                f"{settings.sandbox_workspace_root}/agent_runs/{execution_id}/step_{step_index}.py",
            )
        ),
        "output_files": output_file_details,
    }


async def execute_shell_command(
    execution_id: uuid.UUID,
    *,
    step_index: int,
    command: str,
    cwd: str | None = None,
    timeout: int | None = None,
) -> dict[str, Any]:
    """Execute a shell command via sandbox API and return structured result."""
    await ensure_sandbox_ready()

    context = _get_context(execution_id)
    timeout_seconds = timeout or settings.sandbox_timeout
    existing_outputs = _build_existing_output_payload(context)

    payload = {
        "execution_id": str(execution_id),
        "step_index": step_index,
        "command": command,
        "cwd": cwd,
        "timeout_seconds": timeout_seconds,
        "input_dir": context["input_dir"],
        "output_dir": context["output_dir"],
        "input_files": context.get("input_files", []),
        "output_files": existing_outputs,
    }

    try:
        response = await _request_json(
            "POST",
            "/v1/command",
            payload=payload,
            timeout=timeout_seconds + 10,
        )
    except SandboxRuntimeError as exc:
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": str(exc),
            "script_path": f"{settings.sandbox_workspace_root}/agent_runs/{execution_id}/commands/step_{step_index}.sh",
            "output_files": _context_output_file_details(context),
        }

    output_file_details = _update_context_output_files_from_response(context, response)
    return {
        "success": bool(response.get("success", False)),
        "exit_code": int(response.get("exit_code", -1)),
        "stdout": str(response.get("stdout", "")),
        "stderr": str(response.get("stderr", "")),
        "script_path": str(
            response.get(
                "command_path",
                f"{settings.sandbox_workspace_root}/agent_runs/{execution_id}/commands/step_{step_index}.sh",
            )
        ),
        "output_files": output_file_details,
    }


def list_execution_output_files(
    execution_id: uuid.UUID,
    *,
    path: str | None = None,
    recursive: bool = True,
) -> list[dict[str, Any]]:
    """List files currently tracked in execution output context."""
    context = _get_context(execution_id)
    details = _context_output_file_details(context)
    if path is None or not path.strip():
        return details

    output_root = str(context.get("output_dir", "")).rstrip("/")
    path_value = path.strip().rstrip("/")
    if output_root and path_value == output_root:
        return details

    normalized_path = _normalize_output_file_path(context, path)
    if normalized_path is None:
        return []

    target = Path(normalized_path).as_posix().rstrip("/")
    filtered: list[dict[str, Any]] = []
    for item in details:
        raw_path = item.get("path")
        if not isinstance(raw_path, str):
            continue
        candidate = raw_path.rstrip("/")
        if recursive:
            if candidate == target or candidate.startswith(f"{target}/"):
                filtered.append(item)
        else:
            candidate_parent = Path(candidate).parent.as_posix().rstrip("/")
            if candidate_parent == target:
                filtered.append(item)
    return filtered


def read_execution_output_file(
    execution_id: uuid.UUID,
    *,
    path: str,
    max_bytes: int = 200_000,
) -> dict[str, Any]:
    """Read text content for a tracked output file."""
    context = _get_context(execution_id)
    normalized_path = _normalize_output_file_path(context, path)
    if normalized_path is None:
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Invalid output file path: {path}",
            "script_path": normalized_path or "",
            "output_files": _context_output_file_details(context),
        }

    output_files = context.get("output_files", {})
    if not isinstance(output_files, dict):
        output_files = {}
    raw_content = output_files.get(normalized_path)
    if not isinstance(raw_content, bytes):
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Output file not found: {normalized_path}",
            "script_path": normalized_path,
            "output_files": _context_output_file_details(context),
        }

    clipped = raw_content[:max_bytes]
    text_value = clipped.decode("utf-8", errors="replace")
    if len(raw_content) > max_bytes:
        text_value += f"\n\n[truncated at {max_bytes} bytes]"
    return {
        "success": True,
        "exit_code": 0,
        "stdout": text_value,
        "stderr": "",
        "script_path": normalized_path,
        "output_files": _context_output_file_details(context),
    }


def list_execution_input_files(
    execution_id: uuid.UUID,
    *,
    path: str | None = None,
    recursive: bool = True,
) -> list[dict[str, Any]]:
    """List staged input files available to the execution context."""
    context = _get_context(execution_id)
    details = _context_input_file_details(context)
    if path is None or not path.strip():
        return details

    input_root = str(context.get("input_dir", "")).rstrip("/")
    path_value = path.strip().rstrip("/")
    if input_root and path_value == input_root:
        return details

    normalized_path = _normalize_input_file_path(context, path)
    if normalized_path is None:
        return []

    target = Path(normalized_path).as_posix().rstrip("/")
    filtered: list[dict[str, Any]] = []
    for item in details:
        raw_path = item.get("path")
        if not isinstance(raw_path, str):
            continue
        candidate = raw_path.rstrip("/")
        if recursive:
            if candidate == target or candidate.startswith(f"{target}/"):
                filtered.append(item)
        else:
            candidate_parent = Path(candidate).parent.as_posix().rstrip("/")
            if candidate_parent == target:
                filtered.append(item)
    return filtered


def read_execution_input_file(
    execution_id: uuid.UUID,
    *,
    path: str,
    max_bytes: int = 200_000,
) -> dict[str, Any]:
    """Read text content from a staged input file."""
    context = _get_context(execution_id)
    normalized_path = _normalize_input_file_path(context, path)
    if normalized_path is None:
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Invalid input file path: {path}",
            "script_path": "",
            "output_files": _context_output_file_details(context),
        }

    input_map = _context_input_file_map(context)
    raw_content = input_map.get(normalized_path)
    if not isinstance(raw_content, bytes):
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Input file not found: {normalized_path}",
            "script_path": normalized_path,
            "output_files": _context_output_file_details(context),
        }

    clipped = raw_content[:max_bytes]
    text_value = clipped.decode("utf-8", errors="replace")
    if len(raw_content) > max_bytes:
        text_value += f"\n\n[truncated at {max_bytes} bytes]"
    return {
        "success": True,
        "exit_code": 0,
        "stdout": text_value,
        "stderr": "",
        "script_path": normalized_path,
        "output_files": _context_output_file_details(context),
    }


def write_execution_output_file(
    execution_id: uuid.UUID,
    *,
    path: str,
    content: str,
    append: bool = False,
) -> dict[str, Any]:
    """Write text content to a tracked output file path."""
    context = _get_context(execution_id)
    normalized_path = _normalize_output_file_path(context, path)
    if normalized_path is None:
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Invalid output file path: {path}",
            "script_path": "",
            "output_files": _context_output_file_details(context),
        }

    output_files = context.get("output_files", {})
    if not isinstance(output_files, dict):
        output_files = {}

    payload = content.encode("utf-8")
    if append and isinstance(output_files.get(normalized_path), bytes):
        payload = output_files[normalized_path] + payload
    output_files[normalized_path] = payload
    context["output_files"] = output_files
    return {
        "success": True,
        "exit_code": 0,
        "stdout": f"Wrote {len(payload)} bytes to {normalized_path}",
        "stderr": "",
        "script_path": normalized_path,
        "output_files": _context_output_file_details(context),
    }


def patch_execution_output_file(
    execution_id: uuid.UUID,
    *,
    path: str,
    search: str,
    replace: str,
    replace_all: bool = False,
) -> dict[str, Any]:
    """Patch text content in a tracked output file path."""
    context = _get_context(execution_id)
    normalized_path = _normalize_output_file_path(context, path)
    if normalized_path is None:
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Invalid output file path: {path}",
            "script_path": "",
            "output_files": _context_output_file_details(context),
        }

    output_files = context.get("output_files", {})
    if not isinstance(output_files, dict):
        output_files = {}

    original_bytes = output_files.get(normalized_path)
    if not isinstance(original_bytes, bytes):
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Output file not found: {normalized_path}",
            "script_path": normalized_path,
            "output_files": _context_output_file_details(context),
        }

    original_text = original_bytes.decode("utf-8", errors="replace")
    if search not in original_text:
        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": "Search pattern not found in file",
            "script_path": normalized_path,
            "output_files": _context_output_file_details(context),
        }

    if replace_all:
        patched_text = original_text.replace(search, replace)
    else:
        patched_text = original_text.replace(search, replace, 1)
    output_files[normalized_path] = patched_text.encode("utf-8")
    context["output_files"] = output_files
    return {
        "success": True,
        "exit_code": 0,
        "stdout": f"Patched file {normalized_path}",
        "stderr": "",
        "script_path": normalized_path,
        "output_files": _context_output_file_details(context),
    }


def persist_execution_output_files(
    user_id: uuid.UUID,
    execution_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Persist captured sandbox output files into uploads and return artifact metadata."""
    context = _EXECUTION_CONTEXTS.get(str(execution_id))
    if not context:
        return []

    output_files = context.get("output_files", {})
    if not isinstance(output_files, dict) or not output_files:
        return []

    target_dir = Path(f"uploads/{user_id}/generated").resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    output_dir = str(context.get("output_dir", ""))
    target_base_dir = target_dir / str(execution_id)
    artifacts: list[dict[str, Any]] = []
    for sandbox_path, content in output_files.items():
        if not isinstance(sandbox_path, str) or not isinstance(content, bytes):
            continue

        relative_path = _relative_output_file_path(sandbox_path, output_dir)
        filename = relative_path.name
        target_path = target_base_dir / relative_path
        duplicate_counter = 1
        while target_path.exists():
            target_path = target_path.with_name(
                f"{relative_path.stem}_{duplicate_counter}{relative_path.suffix}"
            )
            duplicate_counter += 1

        try:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(content)
        except OSError:
            continue

        content_type, _ = mimetypes.guess_type(filename)
        artifacts.append(
            {
                "filename": filename,
                "storage_path": _relative_storage_path(target_path),
                "content_type": content_type or "application/octet-stream",
                "file_size": len(content),
            }
        )

    return artifacts


def cleanup_execution_context(execution_id: uuid.UUID) -> None:
    """Release cached execution context for sandbox file state."""
    _EXECUTION_CONTEXTS.pop(str(execution_id), None)
