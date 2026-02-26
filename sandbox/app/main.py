"""HTTP sandbox runtime service for executing agent code."""

from __future__ import annotations

import base64
import importlib.util
import mimetypes
import os
from pathlib import Path
import shutil
import subprocess
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

WORKSPACE_ROOT = Path(os.getenv("SANDBOX_WORKSPACE_ROOT", "/workspace")).resolve()
MAX_FILE_SIZE_BYTES = int(os.getenv("SANDBOX_MAX_FILE_SIZE_BYTES", str(50 * 1024 * 1024)))


class SandboxFilePayload(BaseModel):
    path: str
    content_b64: str


class ExecuteRequest(BaseModel):
    execution_id: str
    step_index: int = Field(ge=1)
    code: str
    timeout_seconds: int = Field(default=1800, ge=1, le=3600)
    input_dir: str
    output_dir: str
    input_files: list[SandboxFilePayload] = Field(default_factory=list)
    output_files: list[SandboxFilePayload] = Field(default_factory=list)


class CommandRequest(BaseModel):
    execution_id: str
    step_index: int = Field(ge=1)
    command: str
    timeout_seconds: int = Field(default=1800, ge=1, le=3600)
    input_dir: str
    output_dir: str
    cwd: str | None = None
    input_files: list[SandboxFilePayload] = Field(default_factory=list)
    output_files: list[SandboxFilePayload] = Field(default_factory=list)


class OutputFileResponse(BaseModel):
    path: str
    size: int
    content_type: str
    content_b64: str


class ExecuteResponse(BaseModel):
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    script_path: str
    output_files: list[OutputFileResponse]


class CommandResponse(BaseModel):
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    command_path: str
    output_files: list[OutputFileResponse]


app = FastAPI(title="WorkerBee Sandbox Service", version="0.1.0")


def _decode_payload(content_b64: str) -> bytes:
    try:
        return base64.b64decode(content_b64.encode("ascii"), validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {exc}") from exc


def _encode_payload(content: bytes) -> str:
    return base64.b64encode(content).decode("ascii")


def _ensure_safe_workspace_path(path_value: str, root_dir: Path) -> Path:
    path = Path(path_value)
    if not path.is_absolute():
        raise HTTPException(status_code=400, detail=f"Path must be absolute: {path_value}")
    resolved = path.resolve()
    if root_dir not in resolved.parents and resolved != root_dir:
        raise HTTPException(status_code=400, detail=f"Path outside workspace root: {path_value}")
    return resolved


def _clear_directory(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for entry in directory.iterdir():
        if entry.is_dir():
            shutil.rmtree(entry, ignore_errors=True)
        else:
            entry.unlink(missing_ok=True)


def _write_files(files: list[SandboxFilePayload], expected_root: Path) -> None:
    for file_payload in files:
        target_path = _ensure_safe_workspace_path(file_payload.path, WORKSPACE_ROOT)
        if expected_root not in target_path.parents and target_path != expected_root:
            raise HTTPException(
                status_code=400,
                detail=f"File path {file_payload.path} is not under expected directory {expected_root}",
            )
        content = _decode_payload(file_payload.content_b64)
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Payload exceeds SANDBOX_MAX_FILE_SIZE_BYTES for {file_payload.path}",
            )
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(content)


def _collect_output_files(output_dir: Path) -> list[OutputFileResponse]:
    responses: list[OutputFileResponse] = []
    if not output_dir.exists() or not output_dir.is_dir():
        return responses

    for output_path in sorted(output_dir.rglob("*")):
        if not output_path.is_file():
            continue
        try:
            content = output_path.read_bytes()
        except OSError:
            continue
        if len(content) > MAX_FILE_SIZE_BYTES:
            continue

        content_type, _ = mimetypes.guess_type(output_path.name)
        responses.append(
            OutputFileResponse(
                path=output_path.as_posix(),
                size=len(content),
                content_type=content_type or "application/octet-stream",
                content_b64=_encode_payload(content),
            )
        )

    return responses


def _capabilities() -> dict[str, object]:
    python_modules = [
        "pandas",
        "numpy",
        "openpyxl",
        "docx",
        "pptx",
        "PyPDF2",
        "pdfplumber",
        "PIL",
        "requests",
        "httpx",
        "bs4",
        "lxml",
        "markdown",
        "jinja2",
        "matplotlib",
        "seaborn",
        "yaml",
        "tabulate",
        "reportlab",
        "sklearn",
        "scipy",
    ]
    cli_tools = [
        "python",
        "pip",
        "git",
        "curl",
        "jq",
        "zip",
        "unzip",
        "tar",
        "file",
    ]

    available_modules = [name for name in python_modules if importlib.util.find_spec(name)]
    available_commands = [name for name in cli_tools if shutil.which(name)]

    return {
        "python_version": ".".join(str(v) for v in os.sys.version_info[:3]),
        "python_executable": shutil.which("python"),
        "available_modules": available_modules,
        "available_commands": available_commands,
        "workspace_root": WORKSPACE_ROOT.as_posix(),
    }


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/capabilities")
def capabilities() -> dict[str, object]:
    return _capabilities()


@app.post("/v1/execute", response_model=ExecuteResponse)
def execute(request: ExecuteRequest) -> ExecuteResponse:
    input_dir = _ensure_safe_workspace_path(request.input_dir, WORKSPACE_ROOT)
    output_dir = _ensure_safe_workspace_path(request.output_dir, WORKSPACE_ROOT)
    scripts_dir = WORKSPACE_ROOT / "agent_runs" / request.execution_id / "scripts"
    scripts_dir = _ensure_safe_workspace_path(scripts_dir.as_posix(), WORKSPACE_ROOT)
    script_path = scripts_dir / f"step_{request.step_index}.py"

    _clear_directory(input_dir)
    _clear_directory(output_dir)
    scripts_dir.mkdir(parents=True, exist_ok=True)

    _write_files(request.input_files, input_dir)
    _write_files(request.output_files, output_dir)
    script_path.write_text(request.code, encoding="utf-8")

    env = os.environ.copy()
    env["WORKSPACE_INPUT_DIR"] = input_dir.as_posix()
    env["WORKSPACE_OUTPUT_DIR"] = output_dir.as_posix()

    try:
        process = subprocess.run(
            ["python", script_path.as_posix()],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=request.timeout_seconds,
            cwd=output_dir.as_posix(),
            env=env,
        )
        exit_code = process.returncode
        stdout = process.stdout
        stderr = process.stderr
    except subprocess.TimeoutExpired as exc:
        exit_code = -1
        stdout = exc.stdout or ""
        stderr = (exc.stderr or "") + f"\nExecution timed out after {request.timeout_seconds}s"

    output_files = _collect_output_files(output_dir)
    return ExecuteResponse(
        success=exit_code == 0,
        exit_code=exit_code,
        stdout=stdout,
        stderr=stderr,
        script_path=script_path.as_posix(),
        output_files=output_files,
    )


@app.post("/v1/command", response_model=CommandResponse)
def execute_command(request: CommandRequest) -> CommandResponse:
    input_dir = _ensure_safe_workspace_path(request.input_dir, WORKSPACE_ROOT)
    output_dir = _ensure_safe_workspace_path(request.output_dir, WORKSPACE_ROOT)
    commands_dir = WORKSPACE_ROOT / "agent_runs" / request.execution_id / "commands"
    commands_dir = _ensure_safe_workspace_path(commands_dir.as_posix(), WORKSPACE_ROOT)
    command_path = commands_dir / f"step_{request.step_index}.sh"

    _clear_directory(input_dir)
    _clear_directory(output_dir)
    commands_dir.mkdir(parents=True, exist_ok=True)

    _write_files(request.input_files, input_dir)
    _write_files(request.output_files, output_dir)
    command_path.write_text(request.command, encoding="utf-8")

    env = os.environ.copy()
    env["WORKSPACE_INPUT_DIR"] = input_dir.as_posix()
    env["WORKSPACE_OUTPUT_DIR"] = output_dir.as_posix()

    if request.cwd:
        requested_cwd = _ensure_safe_workspace_path(request.cwd, WORKSPACE_ROOT)
    else:
        requested_cwd = output_dir

    try:
        process = subprocess.run(
            ["sh", "-lc", request.command],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=request.timeout_seconds,
            cwd=requested_cwd.as_posix(),
            env=env,
        )
        exit_code = process.returncode
        stdout = process.stdout
        stderr = process.stderr
    except subprocess.TimeoutExpired as exc:
        exit_code = -1
        stdout = exc.stdout or ""
        stderr = (exc.stderr or "") + f"\nExecution timed out after {request.timeout_seconds}s"

    output_files = _collect_output_files(output_dir)
    return CommandResponse(
        success=exit_code == 0,
        exit_code=exit_code,
        stdout=stdout,
        stderr=stderr,
        command_path=command_path.as_posix(),
        output_files=output_files,
    )
