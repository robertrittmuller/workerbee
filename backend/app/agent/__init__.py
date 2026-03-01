"""Agent execution module using LangGraph."""

from pathlib import Path
import json
import textwrap
import time
from typing import Any
import uuid

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from litellm import acompletion
import asyncio

from app.agent.sandbox import (
    SandboxRuntimeError,
    discover_sandbox_capabilities,
    execute_shell_command,
    execute_python_code,
    list_execution_input_files,
    list_execution_output_files,
    patch_execution_output_file,
    prepare_sandbox_workspace,
    read_execution_input_file,
    read_execution_output_file,
    write_execution_output_file,
)
from app.database import async_session_maker
from app.models import Execution, ExecutionLog
from app.config import settings

WORKSPACE_INPUT_DIR = "/workspace/input"
WORKSPACE_OUTPUT_DIR = "/workspace/output"


class AgentState(dict):
    """State for the agent graph."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.setdefault("messages", [])
        self.setdefault("input_files", [])
        self.setdefault("output_files", [])
        self.setdefault("code_blocks", [])
        self.setdefault("current_step", "init")
        self.setdefault("errors", [])
        self.setdefault("artifacts", [])
        self.setdefault("todo", [])


class AgentExecutor:
    """Executes agent tasks using LangGraph."""
    
    def __init__(
        self,
        execution_id: uuid.UUID,
        agent_config: dict,
        task_prompt: str,
        input_files: list[dict],
        output_config: dict,
    ):
        self.execution_id = execution_id
        self.agent_config = agent_config
        self.task_prompt = task_prompt
        self.input_files = input_files
        self.output_config = output_config
        self.sandbox_input_dir = f"{WORKSPACE_INPUT_DIR}/{execution_id}"
        self.sandbox_output_dir = f"{WORKSPACE_OUTPUT_DIR}/{execution_id}"
        self.sandbox_scripts_dir = f"/workspace/agent_runs/{execution_id}/scripts"
        self.sandbox_capabilities: dict[str, Any] = {}
        self.sandbox_stage_warnings: list[str] = []
        self.state = AgentState()
        self.graph = self._build_graph()
    
    def _build_graph(self) -> StateGraph:
        """Build the LangGraph execution graph."""
        workflow = StateGraph(AgentState)
        
        # Add nodes
        workflow.add_node("init", self._init_node)
        workflow.add_node("analyze", self._analyze_node)
        workflow.add_node("plan", self._plan_node)
        workflow.add_node("execute", self._execute_node)
        workflow.add_node("generate_output", self._generate_output_node)
        workflow.add_node("validate", self._validate_node)
        
        # Add edges
        workflow.set_entry_point("init")
        workflow.add_edge("init", "analyze")
        workflow.add_edge("analyze", "plan")
        workflow.add_edge("plan", "execute")
        workflow.add_edge("execute", "generate_output")
        workflow.add_edge("generate_output", "validate")
        workflow.add_edge("validate", END)
        
        return workflow.compile(checkpointer=MemorySaver())

    @staticmethod
    def _ensure_state_defaults(state: AgentState) -> AgentState:
        """Ensure expected state keys always exist before node execution."""
        state.setdefault("messages", [])
        state.setdefault("input_files", [])
        state.setdefault("output_files", [])
        state.setdefault("code_blocks", [])
        state.setdefault("current_step", "init")
        state.setdefault("errors", [])
        state.setdefault("artifacts", [])
        state.setdefault("todo", [])
        return state

    @staticmethod
    def _sanitize_log_payload(value: Any) -> Any:
        """Convert arbitrary values into JSON-safe payloads for ExecutionLog.data."""
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, dict):
            return {
                str(key): AgentExecutor._sanitize_log_payload(item)
                for key, item in value.items()
            }
        if isinstance(value, (list, tuple, set)):
            return [AgentExecutor._sanitize_log_payload(item) for item in value]
        return str(value)

    @staticmethod
    def _truncate_for_log(value: Any, *, limit: int = 220) -> str:
        """Render a compact single-line string for log messages."""
        text = str(value or "").replace("\n", " ").strip()
        if len(text) <= limit:
            return text
        return f"{text[: limit - 3]}..."

    def _summarize_action_for_log(self, action: dict[str, Any]) -> str:
        """Create a short human-readable summary for an action."""
        action_type = str(action.get("type", "unknown")).strip().lower() or "unknown"
        if action_type == "run":
            return f"run `{self._truncate_for_log(action.get('command', ''), limit=140)}`"
        if action_type in {"run_python"}:
            return f"{action_type} (python code)"
        if action_type in {
            "write_file",
            "read_file",
            "patch_file",
            "stat_file",
            "read_input_file",
        }:
            return f"{action_type} `{self._truncate_for_log(action.get('path', ''), limit=120)}`"
        if action_type in {"list_files", "list_input_files"}:
            path_value = action.get("path") or (
                self.sandbox_input_dir if action_type == "list_input_files" else self.sandbox_output_dir
            )
            return f"{action_type} `{self._truncate_for_log(path_value, limit=120)}`"
        return action_type

    async def _emit_progress_log(
        self,
        message: str,
        *,
        level: str = "info",
        data: dict[str, Any] | None = None,
    ) -> None:
        """Persist an execution log line for real-time activity streaming."""
        trimmed = message.strip()
        if not trimmed:
            return
        try:
            async with async_session_maker() as log_db:
                log_db.add(
                    ExecutionLog(
                        execution_id=self.execution_id,
                        level=level,
                        message=trimmed,
                        data=self._sanitize_log_payload(data)
                        if data is not None
                        else None,
                    )
                )
                await log_db.commit()
        except Exception:
            # Progress logging must never interrupt agent execution.
            return
    
    async def _init_node(self, state: AgentState) -> AgentState:
        """Initialize the agent execution."""
        state = self._ensure_state_defaults(state)
        state["current_step"] = "init"
        state["input_files"] = self.input_files
        state["messages"].append({
            "role": "system",
            "content": self._build_system_prompt(),
        })
        state["messages"].append({
            "role": "user",
            "content": self.task_prompt,
        })
        return state
    
    async def _analyze_node(self, state: AgentState) -> AgentState:
        """Analyze input files and requirements."""
        state = self._ensure_state_defaults(state)
        state["current_step"] = "analyze"
        
        # Build analysis prompt
        analysis_prompt = f"""
        Analyze the following task and input files:
        
        Task: {self.task_prompt}
        
        Input Files:
        {self._format_input_files()}
        
        Output Requirements:
        {self._format_output_requirements()}
        
        Provide a brief analysis of what needs to be done.
        """
        
        state["messages"].append({
            "role": "user",
            "content": analysis_prompt,
        })
        
        # Get LLM response
        response = await self._call_llm(state["messages"])
        state["messages"].append({
            "role": "assistant",
            "content": response,
        })
        
        return state
    
    async def _plan_node(self, state: AgentState) -> AgentState:
        """Plan the execution steps."""
        state = self._ensure_state_defaults(state)
        state["current_step"] = "plan"
        
        planning_prompt = """
        Based on the analysis, create a concise TODO checklist to complete the task.
        Include:
        1. The concrete task item
        2. The expected output artifact or validation check
        3. Any required tools/commands

        Format as a checklist with short items.
        """
        
        state["messages"].append({
            "role": "user",
            "content": planning_prompt,
        })
        
        response = await self._call_llm(state["messages"])
        state["messages"].append({
            "role": "assistant",
            "content": response,
        })
        
        return state
    
    async def _execute_node(self, state: AgentState) -> AgentState:
        """Execute the planned steps."""
        state = self._ensure_state_defaults(state)
        state["current_step"] = "execute"
        await self._emit_progress_log(
            "Entering execute stage.",
            data={"stage": "execute"},
        )
        budgets = self._resolve_execution_budgets()
        max_total_actions = budgets["max_total_actions"]
        max_actions_per_iteration = budgets["max_actions_per_iteration"]
        max_iterations = budgets["max_iterations"]
        max_stagnant_iterations = budgets["max_stagnant_iterations"]
        max_runtime_seconds = budgets["max_runtime_seconds"]

        execution_prompt = f"""
        Execute the task using tool actions with iterative recovery and a live TODO list.
        Available actions:
        - run: execute shell command in sandbox
          fields: type, command, cwd (optional), timeout_seconds (optional)
        - run_python: execute python code in sandbox
          fields: type, code, timeout_seconds (optional)
        - write_file: write text file under output directory
          fields: type, path, content, append (optional)
        - read_file: read file under output directory
          fields: type, path, max_bytes (optional)
        - list_files: list files under output directory
          fields: type, path (optional), recursive (optional)
        - stat_file: check if a file exists and get size
          fields: type, path
        - patch_file: patch text in a file under output directory
          fields: type, path, search, replace, replace_all (optional)
        - read_input_file: read staged input file under input directory
          fields: type, path, max_bytes (optional)
        - list_input_files: list staged input files under input directory
          fields: type, path (optional), recursive (optional)

        Constraints:
        1. Input files are read-only under {self.sandbox_input_dir}/.
        2. Outputs must be under {self.sandbox_output_dir}/.
        3. Prefer short, debuggable commands and react to stderr.
        4. Ensure at least one non-empty output file before declaring completion.
        5. Explicitly validate your work: check file exists, byte size > 0, and sanity-check content.
        6. Do not emit placeholder/failure reports unless explicitly asked.
        7. Maintain a TODO list and update statuses every iteration.
        8. Choose actions directly from open TODO items.
        9. Keep actions focused; avoid large batches.
        10. Filenames may include spaces or parentheses. In shell commands, quote paths safely.
        11. Prefer run_python with pathlib for file operations when path quoting is uncertain.

        Return ONLY JSON in this schema:
        {{
          "todo": [
            {{
              "id": "short-id",
              "task": "what to do",
              "status": "pending|in_progress|done|blocked",
              "notes": "optional short note"
            }}
          ],
          "actions": [{{"type": "...", "...": "..."}}],
          "goal_status": "in_progress|done|blocked"
        }}
        Note: for each action, put parameters at the top level (no nested `arguments` object).
        Do not include markdown or prose outside JSON.
        """

        state["messages"].append({
            "role": "user",
            "content": execution_prompt,
        })

        existing_todo = self._normalize_todo_items(state.get("todo"))
        if existing_todo:
            state["todo"] = existing_todo
            state["messages"].append(
                {
                    "role": "user",
                    "content": (
                        "Use this TODO list as the starting point and update it each iteration:\n"
                        f"{self._format_todo_for_prompt(existing_todo)}"
                    ),
                }
            )

        next_step_index = len(state["code_blocks"]) + 1
        total_actions_executed = 0
        iteration = 0
        stagnant_iterations = 0
        consecutive_no_action_iterations = 0
        auto_diagnostics_ran = False
        execution_start = time.monotonic()
        best_output_count = len(self._detected_nonempty_output_paths(state))
        best_done_todo_count = self._todo_counts(existing_todo).get("done", 0)
        previous_todo_signature = self._todo_signature(existing_todo)
        previous_round_failures: int | None = None

        while True:
            elapsed_seconds = int(time.monotonic() - execution_start)
            if elapsed_seconds >= max_runtime_seconds:
                state["errors"].append(
                    f"Execution exceeded runtime budget ({max_runtime_seconds}s)."
                )
                await self._emit_progress_log(
                    f"Execution stopped: runtime budget exceeded ({max_runtime_seconds}s).",
                    level="warning",
                    data={
                        "stage": "execute",
                        "iteration": iteration,
                        "elapsed_seconds": elapsed_seconds,
                    },
                )
                break
            if total_actions_executed >= max_total_actions:
                state["errors"].append(
                    f"Execution exhausted action budget ({max_total_actions} actions)."
                )
                await self._emit_progress_log(
                    f"Execution stopped: action budget exhausted ({max_total_actions}).",
                    level="warning",
                    data={
                        "stage": "execute",
                        "iteration": iteration,
                        "total_actions_executed": total_actions_executed,
                    },
                )
                break
            if iteration >= max_iterations:
                state["errors"].append(
                    f"Execution reached iteration budget ({max_iterations} iterations)."
                )
                await self._emit_progress_log(
                    f"Execution stopped: iteration budget reached ({max_iterations}).",
                    level="warning",
                    data={"stage": "execute", "iteration": iteration},
                )
                break
            if stagnant_iterations >= max_stagnant_iterations:
                state["errors"].append(
                    "Execution stopped due to repeated stalled iterations without measurable progress."
                )
                await self._emit_progress_log(
                    "Execution stopped after repeated stalled iterations.",
                    level="warning",
                    data={
                        "stage": "execute",
                        "iteration": iteration,
                        "stagnant_iterations": stagnant_iterations,
                    },
                )
                break

            iteration += 1
            await self._emit_progress_log(
                f"Planning execution iteration {iteration}.",
                level="debug",
                data={
                    "stage": "execute",
                    "iteration": iteration,
                    "remaining_action_budget": max_total_actions - total_actions_executed,
                },
            )
            response = await self._call_llm(state["messages"])
            state["messages"].append({
                "role": "assistant",
                "content": response,
            })

            planned_actions = self._extract_action_plan(response)
            if planned_actions is None:
                state["errors"].append(
                    f"Execution iteration {iteration} did not provide valid action JSON."
                )
                await self._emit_progress_log(
                    f"Iteration {iteration} returned invalid action JSON.",
                    level="warning",
                    data={"stage": "execute", "iteration": iteration},
                )
                stagnant_iterations += 1
                state["messages"].append(
                    {
                        "role": "user",
                        "content": (
                            "Return valid JSON only with `todo`, `actions`, and `goal_status`."
                        ),
                    }
                )
                continue

            goal_status = "in_progress"
            if isinstance(planned_actions, dict):
                goal_status = self._normalize_goal_status(
                    planned_actions.get("goal_status", "in_progress")
                )
                actions_raw = planned_actions.get("actions", [])
                todo_update = self._normalize_todo_items(planned_actions.get("todo"))
                if todo_update:
                    state["todo"] = todo_update
            else:
                actions_raw = planned_actions

            todo_items = self._normalize_todo_items(state.get("todo"))
            state["todo"] = todo_items
            todo_complete = self._todo_is_complete(todo_items)
            actions: list[dict[str, Any]] = []
            remaining_action_budget = max_total_actions - total_actions_executed
            max_actions_this_iteration = max(1, min(max_actions_per_iteration, remaining_action_budget))
            if isinstance(actions_raw, list):
                for item in actions_raw[:max_actions_this_iteration]:
                    normalized_action = self._normalize_action_item(item)
                    if normalized_action:
                        actions.append(normalized_action)

            if not actions:
                output_snapshot = list_execution_output_files(self.execution_id)
                state["output_files"] = output_snapshot
                detected_outputs = self._detected_nonempty_output_paths(state)
                if detected_outputs and goal_status == "done" and (todo_complete or not todo_items):
                    await self._emit_progress_log(
                        "No further actions required; non-empty outputs detected.",
                        data={
                            "stage": "execute",
                            "iteration": iteration,
                            "output_count": len(detected_outputs),
                        },
                    )
                    state["messages"].append(
                        {
                            "role": "user",
                            "content": "Non-empty output files detected. Stop actions and continue to final reporting.",
                        }
                    )
                    break
                consecutive_no_action_iterations += 1
                if (
                    not detected_outputs
                    and not auto_diagnostics_ran
                    and consecutive_no_action_iterations >= 2
                    and remaining_action_budget > 0
                ):
                    auto_diagnostics_ran = True
                    await self._emit_progress_log(
                        "No actions returned repeatedly; running automatic diagnostics.",
                        level="warning",
                        data={
                            "stage": "execute",
                            "iteration": iteration,
                            "consecutive_no_action_iterations": consecutive_no_action_iterations,
                        },
                    )
                    state["messages"].append(
                        {
                            "role": "user",
                            "content": (
                                "No actions were provided repeatedly. Running automatic diagnostics for staged input/output "
                                "file visibility; use those results to produce corrective actions that generate non-empty outputs."
                            ),
                        }
                    )
                    actions = [
                        {
                            "type": "list_input_files",
                            "path": self.sandbox_input_dir,
                            "recursive": True,
                        },
                        {
                            "type": "list_files",
                            "path": self.sandbox_output_dir,
                            "recursive": True,
                        },
                    ][:max_actions_this_iteration]
                else:
                    await self._emit_progress_log(
                        "No actions returned for this iteration.",
                        level="warning",
                        data={
                            "stage": "execute",
                            "iteration": iteration,
                            "goal_status": goal_status,
                            "todo_complete": todo_complete,
                        },
                    )
                    stagnant_iterations += 1
                    if goal_status == "done" and todo_complete and not detected_outputs:
                        no_action_message = (
                            "You marked the goal done but no non-empty output files were found. "
                            "Return at least one corrective action that creates and validates output files."
                        )
                    else:
                        no_action_message = (
                            "No actions were provided. Return actionable JSON with at least one action "
                            "unless outputs are complete, TODO items are done, and goal_status is done."
                        )
                    state["messages"].append(
                        {
                            "role": "user",
                            "content": no_action_message,
                        }
                    )
                    continue

            round_failures = 0
            consecutive_no_action_iterations = 0
            await self._emit_progress_log(
                f"Iteration {iteration}: executing {len(actions)} action(s).",
                data={
                    "stage": "execute",
                    "iteration": iteration,
                    "action_count": len(actions),
                },
            )
            for action in actions:
                step_index = next_step_index
                next_step_index += 1
                total_actions_executed += 1
                action_type = str(action.get("type", "unknown")).strip().lower() or "unknown"
                await self._emit_progress_log(
                    f"Running action {step_index}: {self._summarize_action_for_log(action)}",
                    data={
                        "stage": "execute",
                        "iteration": iteration,
                        "step_index": step_index,
                        "action_type": action_type,
                    },
                )
                result = await self._execute_agent_action(action, step_index=step_index)
                state["code_blocks"].append(
                    {
                        "action": action,
                        "result": result,
                        "tool_action": True,
                    }
                )
                state["messages"].append(
                    {
                        "role": "user",
                        "content": self._format_action_execution_result(step_index, action, result),
                    }
                )

                output_files_payload = result.get("output_files")
                if isinstance(output_files_payload, list):
                    state["output_files"] = output_files_payload

                if not bool(result.get("success")):
                    round_failures += 1
                    stderr_value = str(result.get("stderr", "")).strip()
                    if stderr_value:
                        state["errors"].append(stderr_value[:1000])
                    await self._emit_progress_log(
                        f"Action {step_index} failed: {self._truncate_for_log(stderr_value or 'unknown error')}",
                        level="warning",
                        data={
                            "stage": "execute",
                            "iteration": iteration,
                            "step_index": step_index,
                            "action_type": action_type,
                            "success": False,
                            "exit_code": result.get("exit_code"),
                        },
                    )
                else:
                    await self._emit_progress_log(
                        f"Action {step_index} succeeded.",
                        data={
                            "stage": "execute",
                            "iteration": iteration,
                            "step_index": step_index,
                            "action_type": action_type,
                            "success": True,
                            "exit_code": result.get("exit_code"),
                        },
                    )

                if total_actions_executed >= max_total_actions:
                    break

            output_snapshot = list_execution_output_files(self.execution_id)
            state["output_files"] = output_snapshot
            unique_round_outputs = self._detected_nonempty_output_paths(state)
            todo_items = self._normalize_todo_items(state.get("todo"))
            state["todo"] = todo_items
            todo_counts = self._todo_counts(todo_items)
            todo_complete = self._todo_is_complete(todo_items)
            todo_signature = self._todo_signature(todo_items)

            made_progress = False
            if len(unique_round_outputs) > best_output_count:
                best_output_count = len(unique_round_outputs)
                made_progress = True
            done_todo_count = todo_counts.get("done", 0)
            if done_todo_count > best_done_todo_count:
                best_done_todo_count = done_todo_count
                made_progress = True
            if previous_round_failures is not None and round_failures < previous_round_failures:
                made_progress = True
            if round_failures < len(actions):
                made_progress = True
            if todo_signature != previous_todo_signature:
                made_progress = True
                previous_todo_signature = todo_signature
            previous_round_failures = round_failures
            if made_progress:
                stagnant_iterations = 0
            else:
                stagnant_iterations += 1

            if unique_round_outputs and (goal_status == "done" or (todo_complete and round_failures == 0)):
                await self._emit_progress_log(
                    f"Execution produced {len(unique_round_outputs)} non-empty output file(s); leaving execute stage.",
                    data={
                        "stage": "execute",
                        "iteration": iteration,
                        "output_count": len(unique_round_outputs),
                    },
                )
                state["messages"].append(
                    {
                        "role": "user",
                        "content": (
                            "Execution succeeded and non-empty output files were detected:\n"
                            + "\n".join(f"- {path}" for path in unique_round_outputs[:20])
                            + "\nStop generating code and continue to final reporting."
                        ),
                    }
                )
                break

            output_hint = (
                "\n".join(f"- {path}" for path in unique_round_outputs[:20])
                if unique_round_outputs
                else "- none detected"
            )
            todo_hint = self._format_todo_for_prompt(todo_items)
            remaining_runtime = max(0, max_runtime_seconds - int(time.monotonic() - execution_start))
            remaining_actions = max(0, max_total_actions - total_actions_executed)
            state["messages"].append(
                {
                    "role": "user",
                    "content": (
                        f"Iteration {iteration} did not fully succeed.\n"
                        f"- failed_actions: {round_failures}\n"
                        f"- detected_nonempty_output_files:\n{output_hint}\n"
                        f"- todo_status:\n{todo_hint}\n"
                        f"- remaining_action_budget: {remaining_actions}\n"
                        f"- remaining_runtime_seconds: {remaining_runtime}\n"
                        "Diagnose the latest errors, update TODO statuses, and return corrected action JSON."
                    ),
                }
            )

        if not self._detected_nonempty_output_paths(state):
            fallback_step_index = next_step_index
            fallback_code = self._fallback_output_code(state)
            await self._emit_progress_log(
                "No non-empty outputs detected; running fallback output generation.",
                level="warning",
                data={"stage": "execute", "step_index": fallback_step_index},
            )
            fallback_result = await self._execute_fallback_output(
                state,
                code=fallback_code,
                step_index=fallback_step_index,
            )
            state["code_blocks"].append(
                {
                    "code": fallback_code,
                    "result": fallback_result,
                    "fallback_output": True,
                }
            )
            state["messages"].append(
                {
                    "role": "user",
                    "content": self._format_code_execution_result(
                        fallback_step_index,
                        fallback_result,
                    ),
                }
            )
            fallback_outputs = fallback_result.get("output_files")
            if isinstance(fallback_outputs, list) and fallback_outputs:
                state["output_files"] = fallback_outputs
                await self._emit_progress_log(
                    "Fallback output generation completed.",
                    level="warning",
                    data={
                        "stage": "execute",
                        "step_index": fallback_step_index,
                        "output_count": len(fallback_outputs),
                    },
                )
            else:
                state["errors"].append(
                    "No output files were detected in the sandbox output directory after execution."
                )
                await self._emit_progress_log(
                    "Fallback output generation did not produce detectable outputs.",
                    level="error",
                    data={"stage": "execute", "step_index": fallback_step_index},
                )

        return state
    
    async def _generate_output_node(self, state: AgentState) -> AgentState:
        """Generate the final output files."""
        state = self._ensure_state_defaults(state)
        state["current_step"] = "generate_output"
        detected_output_files = self._format_detected_output_files(state)

        output_prompt = f"""
        Generate the final output files based on the execution results.

        Output Requirements:
        {self._format_output_requirements()}

        Files currently detected in sandbox output:
        {detected_output_files}

        Create the necessary files under {self.sandbox_output_dir}/ and provide a summary
        of what was created with full output paths.
        Do not claim files exist unless they are present in the detected file list above.
        """

        state["messages"].append({
            "role": "user",
            "content": output_prompt,
        })

        response = await self._call_llm(state["messages"])
        state["messages"].append({
            "role": "assistant",
            "content": response,
        })

        return state
    
    async def _validate_node(self, state: AgentState) -> AgentState:
        """Validate the output and finalize."""
        state = self._ensure_state_defaults(state)
        state["current_step"] = "validate"
        detected_output_files = self._format_detected_output_files(state)

        validation_prompt = f"""
        Validate that the output files meet the requirements.
        Use only the detected file list below as source of truth.

        Detected output files:
        {detected_output_files}

        Provide a summary of:
        1. What was accomplished
        2. What files were created
        3. Any issues or limitations encountered
        4. Confirm that generated files are located in {self.sandbox_output_dir}/
        """

        state["messages"].append({
            "role": "user",
            "content": validation_prompt,
        })

        response = await self._call_llm(state["messages"])
        state["messages"].append({
            "role": "assistant",
            "content": response,
        })

        return state
    
    async def _call_llm(self, messages: list[dict]) -> str:
        """Call the LLM with the given messages."""
        normalized_messages: list[dict[str, str]] = []
        for message in messages:
            role = str(message.get("role", "user"))
            content = message.get("content")
            if content is None:
                normalized_content = ""
            elif isinstance(content, str):
                normalized_content = content
            else:
                normalized_content = str(content)
            normalized_messages.append(
                {
                    "role": role,
                    "content": normalized_content,
                }
            )

        def _is_configured(secret: str) -> bool:
            candidate = secret.strip()
            return bool(candidate) and not candidate.lower().startswith("your-")

        has_provider_keys = _is_configured(settings.openai_api_key) or _is_configured(
            settings.anthropic_api_key
        )
        if not settings.litellm_base_url and not has_provider_keys:
            raise ValueError(
                "No LLM endpoint is configured. Set LITELLM_BASE_URL (and optional "
                "LITELLM_API_KEY) or provider API keys."
            )

        available_models = settings.parsed_llm_available_models
        requested_model = self.agent_config.get("model")
        default_model = settings.llm_default_model

        model = requested_model or default_model
        if available_models and model not in available_models:
            model = default_model if default_model in available_models else available_models[0]

        completion_kwargs: dict[str, Any] = {
            "model": model,
            "messages": normalized_messages,
            "temperature": self.agent_config.get("temperature", 0.7),
            "max_tokens": self.agent_config.get("max_tokens", 4096),
            "timeout": self.agent_config.get("timeout", 45),
            "num_retries": self.agent_config.get("num_retries", 1),
        }

        if settings.litellm_base_url:
            completion_kwargs["api_base"] = settings.litellm_base_url

        litellm_api_key = settings.litellm_api_key or settings.litellm_master_key
        if litellm_api_key:
            completion_kwargs["api_key"] = litellm_api_key

        request_timeout = float(self.agent_config.get("timeout", 45))
        response = await asyncio.wait_for(
            acompletion(**completion_kwargs),
            timeout=request_timeout + 5,
        )

        message = response.choices[0].message
        content = getattr(message, "content", None)
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    text_value = item.get("text")
                    if isinstance(text_value, str):
                        parts.append(text_value)
            merged = "\n".join(part for part in parts if part.strip()).strip()
            if merged:
                return merged

        return ""
    
    async def _execute_code(
        self,
        code: str,
        *,
        step_index: int,
        timeout_override: int | None = None,
    ) -> dict:
        """Execute Python code in the sandbox."""
        normalized_code = self._normalize_code_block(code)
        if not normalized_code:
            return {
                "success": False,
                "exit_code": -1,
                "stdout": "",
                "stderr": "Empty python code block received from model.",
                "script_path": f"{self.sandbox_scripts_dir}/step_{step_index}.py",
                "output_files": [],
            }
        compile_error: str | None = None
        try:
            compile(normalized_code, f"<agent-step-{step_index}>", "exec")
        except SyntaxError as exc:
            compile_error = f"{exc.__class__.__name__}: {exc}"

        if compile_error is not None:
            repaired_script = await self._repair_script_syntax(normalized_code, compile_error)
            repaired_normalized = self._normalize_code_block(repaired_script)
            if repaired_normalized and repaired_normalized.strip() != normalized_code.strip():
                try:
                    compile(repaired_normalized, f"<agent-step-{step_index}>", "exec")
                    normalized_code = repaired_normalized
                    compile_error = None
                except SyntaxError as exc:
                    compile_error = f"{exc.__class__.__name__}: {exc}"
            if compile_error is not None:
                return {
                    "success": False,
                    "exit_code": -1,
                    "stdout": "",
                    "stderr": compile_error,
                    "script_path": f"{self.sandbox_scripts_dir}/step_{step_index}.py",
                    "output_files": [],
                }
        timeout = (
            timeout_override
            if timeout_override is not None
            else int(self.agent_config.get("code_timeout", settings.sandbox_timeout))
        )
        return await execute_python_code(
            self.execution_id,
            step_index=step_index,
            code=normalized_code,
            timeout=timeout,
        )

    async def _execute_script_attempt(self, script: str, *, step_index: int) -> dict:
        """Execute one full-script attempt in sandbox."""
        return await self._execute_code(script, step_index=step_index)

    def _is_compile_syntax_failure(self, result: dict[str, Any]) -> bool:
        """Return True when script failed during local syntax compilation."""
        if bool(result.get("success")):
            return False
        if int(result.get("exit_code", 0)) != -1:
            return False
        stderr_text = str(result.get("stderr", "")).strip()
        return stderr_text.startswith(("SyntaxError:", "IndentationError:", "TabError:"))

    async def _repair_script_syntax(self, script: str, compile_error: str) -> str:
        """Ask the model for a syntax-only repair of a script attempt."""
        current_script = script
        current_error = compile_error

        heuristic_candidate = self._apply_syntax_heuristics(current_script, current_error)
        if heuristic_candidate and self._syntax_error_message(heuristic_candidate) is None:
            return heuristic_candidate

        for _ in range(2):
            prompt = f"""
            Repair Python syntax only.
            Keep behavior the same and do not add prose.

            Compile error:
            {current_error}

            Original script:
            ```python
            {current_script}
            ```

            Return exactly one corrected ```python``` block.
            """
            response = await self._call_llm(
                [
                    {"role": "system", "content": self._build_system_prompt()},
                    {"role": "user", "content": prompt},
                ]
            )
            candidate = self._extract_script_attempt(response)
            if not candidate or candidate.strip() == current_script.strip():
                break
            syntax_error = self._syntax_error_message(candidate)
            if syntax_error is None:
                return candidate
            current_script = candidate
            current_error = syntax_error

        return current_script

    def _syntax_error_message(self, script: str) -> str | None:
        """Return syntax error message for a script, if any."""
        normalized = self._normalize_code_block(script)
        if not normalized:
            return "SyntaxError: empty script"
        try:
            compile(normalized, "<agent-syntax-check>", "exec")
            return None
        except SyntaxError as exc:
            return f"{exc.__class__.__name__}: {exc}"
        except Exception as exc:  # pragma: no cover - defensive
            return f"{exc.__class__.__name__}: {exc}"

    def _apply_syntax_heuristics(self, script: str, syntax_error: str) -> str | None:
        """Apply deterministic repairs for common malformed LLM scripts."""
        import re

        rewritten = script
        rewrite_patterns: list[tuple[str, str]] = [
            (r"\btry_sys\.", "sys."),
            (r"\btry_s\.", "sys."),
            (r"\bif\s+([A-Za-z_][A-Za-z0-9_]*)\s*\):", r"if \1:"),
        ]
        for pattern, replacement in rewrite_patterns:
            rewritten = re.sub(pattern, replacement, rewritten)
        rewritten_error = self._syntax_error_message(rewritten) if rewritten != script else None
        if rewritten != script and rewritten_error is None:
            return rewritten

        error_text = str(rewritten_error or syntax_error)
        if "expected an indented block" in error_text:
            lines = rewritten.splitlines()
            indented_lines: list[str] = []
            for idx, line in enumerate(lines):
                if idx > 0:
                    previous = lines[idx - 1].rstrip()
                    if (
                        previous.endswith(":")
                        and line.strip()
                        and not line.startswith((" ", "\t"))
                    ):
                        line = f"    {line}"
                indented_lines.append(line)
            indentation_candidate = "\n".join(indented_lines)
            if self._syntax_error_message(indentation_candidate) is None:
                return indentation_candidate

        if "invalid syntax" in error_text and "except" in rewritten and "try:" not in rewritten:
            lines = rewritten.splitlines()
            cleaned: list[str] = []
            skip_indent: int | None = None
            for line in lines:
                indent = len(line) - len(line.lstrip(" \t"))
                stripped = line.strip()
                if skip_indent is not None:
                    if stripped and indent > skip_indent:
                        continue
                    skip_indent = None
                if re.match(r"^\s*except\b.*:\s*$", line):
                    skip_indent = indent
                    continue
                cleaned.append(line)
            orphan_except_candidate = "\n".join(cleaned)
            if self._syntax_error_message(orphan_except_candidate) is None:
                return orphan_except_candidate

        if "expected 'except' or 'finally' block" in error_text and "try:" in script:
            lines = rewritten.splitlines()
            has_handler = any(re.match(r"^\s*(except\b|finally:)", line) for line in lines)
            if has_handler:
                return None

            try_lines = [line for line in lines if re.match(r"^\s*try:\s*$", line)]
            if not try_lines:
                return None
            match = re.match(r"^(\s*)try:\s*$", try_lines[-1])
            indent = match.group(1) if match else ""
            repaired = rewritten.rstrip() + f"\n{indent}except Exception as exc:\n{indent}    raise\n"
            return repaired

        return None

    async def _execute_fallback_output(
        self,
        state: AgentState,
        *,
        code: str | None = None,
        step_index: int,
    ) -> dict:
        """Write a deterministic failure report so runs always produce a concrete artifact."""
        fallback_code = code or self._fallback_output_code(state)
        timeout = int(self.agent_config.get("code_timeout", settings.sandbox_timeout))
        return await execute_python_code(
            self.execution_id,
            step_index=step_index,
            code=fallback_code,
            timeout=timeout,
        )
    
    def _extract_code_blocks(self, text: str) -> list[str]:
        """Extract Python code blocks from text."""
        import re
        patterns = [
            r"```(?:python|py)[^\n]*\n(.*?)```",
            r"```[ \t]*\n(.*?)```",
        ]
        for pattern in patterns:
            matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)
            if matches:
                return matches
        return []

    def _extract_script_attempt(self, text: str) -> str:
        """Extract one script attempt from model response."""
        blocks = self._extract_code_blocks(text)
        if blocks:
            return blocks[0]

        candidate = str(text or "").strip()
        if not candidate:
            return ""
        if "```" in candidate:
            return ""
        return candidate

    def _extract_action_plan(self, text: str) -> dict[str, Any] | None:
        """Extract action-plan JSON payload from model response."""
        import ast
        import re

        candidates: list[str] = []
        json_blocks = re.findall(r"```json\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
        candidates.extend(block.strip() for block in json_blocks if block.strip())
        stripped = str(text).strip()
        if stripped:
            candidates.append(stripped)
            first_json_object = self._extract_first_json_object(stripped)
            if first_json_object and first_json_object not in candidates:
                candidates.append(first_json_object)
            first_brace = stripped.find("{")
            last_brace = stripped.rfind("}")
            if first_brace != -1 and last_brace > first_brace:
                fragment = stripped[first_brace : last_brace + 1].strip()
                if fragment and fragment not in candidates:
                    candidates.append(fragment)

        for candidate in candidates:
            parsed: Any | None = None
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                # Recovery path for python-literal responses (single quotes, True/False, etc.).
                try:
                    parsed = ast.literal_eval(candidate)
                except (ValueError, SyntaxError):
                    parsed = None
            if parsed is None:
                continue

            if isinstance(parsed, list):
                return {"actions": parsed, "goal_status": "in_progress"}

            if isinstance(parsed, dict):
                if isinstance(parsed.get("actions"), list):
                    actions = parsed.get("actions", [])
                    if not actions:
                        fallback_actions = self._extract_named_actions(text)
                        if fallback_actions:
                            actions = fallback_actions
                    goal_status = str(parsed.get("goal_status", "in_progress"))
                    return {
                        "actions": actions,
                        "goal_status": goal_status,
                        "todo": parsed.get("todo", []),
                    }
                action_type = parsed.get("type")
                if isinstance(action_type, str) and action_type.strip():
                    return {
                        "actions": [parsed],
                        "goal_status": "in_progress",
                        "todo": parsed.get("todo", []),
                    }

        fallback_actions = self._extract_named_actions(text)
        if fallback_actions:
            return {"actions": fallback_actions, "goal_status": "in_progress", "todo": []}
        return None

    @staticmethod
    def _extract_first_json_object(text: str) -> str | None:
        """Extract the first balanced JSON object from text."""
        start = -1
        depth = 0
        in_string = False
        escaped = False
        for index, char in enumerate(text):
            if start == -1:
                if char == "{":
                    start = index
                    depth = 1
                    in_string = False
                    escaped = False
                continue

            if in_string:
                if escaped:
                    escaped = False
                    continue
                if char == "\\":
                    escaped = True
                    continue
                if char == '"':
                    in_string = False
                continue

            if char == '"':
                in_string = True
                continue
            if char == "{":
                depth += 1
                continue
            if char == "}":
                depth -= 1
                if depth == 0:
                    return text[start : index + 1]
        return None

    def _extract_named_actions(self, text: str) -> list[dict[str, Any]]:
        """Extract fallback actions from tool-style JSON objects in freeform text."""
        actions: list[dict[str, Any]] = []
        cursor = 0
        source = str(text or "")
        while True:
            marker = source.find('{"name"', cursor)
            if marker == -1:
                break
            fragment = self._extract_first_json_object(source[marker:])
            if not fragment:
                break
            cursor = marker + len(fragment)
            try:
                payload = json.loads(fragment)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            action_name = payload.get("name")
            action_args = payload.get("arguments", {})
            if not isinstance(action_name, str) or not isinstance(action_args, dict):
                continue
            mapped = self._map_named_action(action_name, action_args)
            if mapped:
                actions.append(mapped)
            if len(actions) >= 20:
                break
        return actions

    @staticmethod
    def _map_named_action(name: str, arguments: dict[str, Any]) -> dict[str, Any] | None:
        """Map tool-call style payload into structured action schema."""
        action_type = name.strip().lower()
        supported = {
            "run",
            "run_python",
            "write_file",
            "read_file",
            "list_files",
            "stat_file",
            "patch_file",
            "read_input_file",
            "list_input_files",
        }
        if action_type not in supported:
            return None
        action_payload: dict[str, Any] = {"type": action_type}
        for key, value in arguments.items():
            if isinstance(key, str) and key.strip():
                action_payload[key] = value
        return action_payload

    def _normalize_action_item(self, item: Any) -> dict[str, Any] | None:
        """Normalize action payload variants into flat {type, ...} schema."""
        if not isinstance(item, dict):
            return None

        payload = dict(item)
        nested_action = payload.get("action")
        if isinstance(nested_action, dict):
            payload = {**nested_action, **payload}

        action_type_raw = payload.get("type")
        if not isinstance(action_type_raw, str) or not action_type_raw.strip():
            name_value = payload.get("name")
            if isinstance(name_value, str) and name_value.strip():
                action_type_raw = name_value
        if not isinstance(action_type_raw, str) or not action_type_raw.strip():
            return None

        action_type = action_type_raw.strip().lower()
        normalized: dict[str, Any] = {"type": action_type}

        wrappers: list[dict[str, Any]] = []
        for wrapper_key in ("arguments", "params", "kwargs"):
            wrapper_value = payload.get(wrapper_key)
            if isinstance(wrapper_value, dict):
                wrappers.append(wrapper_value)

        for source in wrappers + [payload]:
            for key, value in source.items():
                if not isinstance(key, str):
                    continue
                key_name = key.strip()
                if not key_name:
                    continue
                key_lower = key_name.lower()
                if key_lower in {
                    "type",
                    "name",
                    "arguments",
                    "params",
                    "kwargs",
                    "status",
                    "notes",
                    "id",
                    "title",
                    "task",
                    "description",
                }:
                    continue
                if key_name not in normalized:
                    normalized[key_name] = value

        return normalized

    def _resolve_execution_budgets(self) -> dict[str, int]:
        """Resolve adaptive execution budgets with backward-compatible defaults."""
        legacy_rounds = self._coerce_int(
            self.agent_config.get("max_execution_rounds", 6),
            default=6,
            min_value=1,
            max_value=20,
        )
        legacy_actions_per_round = self._coerce_int(
            self.agent_config.get("max_actions_per_round", 4),
            default=4,
            min_value=1,
            max_value=12,
        )

        default_total_actions = max(8, legacy_rounds * legacy_actions_per_round * 2)
        max_total_actions = self._coerce_int(
            self.agent_config.get("max_total_actions", default_total_actions),
            default=default_total_actions,
            min_value=4,
            max_value=200,
        )
        max_actions_per_iteration = self._coerce_int(
            self.agent_config.get("max_actions_per_iteration", legacy_actions_per_round),
            default=legacy_actions_per_round,
            min_value=1,
            max_value=15,
        )
        default_iterations = max(12, legacy_rounds * 3)
        max_iterations = self._coerce_int(
            self.agent_config.get("max_iterations", default_iterations),
            default=default_iterations,
            min_value=6,
            max_value=200,
        )
        max_stagnant_iterations = self._coerce_int(
            self.agent_config.get("max_stagnant_iterations", max(5, legacy_rounds)),
            default=max(5, legacy_rounds),
            min_value=2,
            max_value=40,
        )
        max_runtime_seconds = self._coerce_int(
            self.agent_config.get("max_runtime_seconds", self.agent_config.get("max_execution_seconds", 900)),
            default=900,
            min_value=60,
            max_value=7200,
        )
        return {
            "max_total_actions": max_total_actions,
            "max_actions_per_iteration": max_actions_per_iteration,
            "max_iterations": max_iterations,
            "max_stagnant_iterations": max_stagnant_iterations,
            "max_runtime_seconds": max_runtime_seconds,
        }

    @staticmethod
    def _coerce_int(
        value: Any,
        default: int,
        *,
        min_value: int,
        max_value: int,
    ) -> int:
        """Parse integer with safe bounds and fallback default."""
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = default
        return max(min_value, min(parsed, max_value))

    @staticmethod
    def _normalize_goal_status(value: Any) -> str:
        """Normalize planner goal status."""
        status = str(value or "").strip().lower()
        if status in {"done", "complete", "completed", "success"}:
            return "done"
        if status in {"blocked", "failed", "error"}:
            return "blocked"
        return "in_progress"

    def _normalize_todo_items(self, payload: Any) -> list[dict[str, str]]:
        """Normalize and sanitize TODO items from model payload."""
        if not isinstance(payload, list):
            return []

        normalized: list[dict[str, str]] = []
        seen_keys: set[str] = set()
        for index, item in enumerate(payload, start=1):
            task = ""
            status_raw = "pending"
            item_id = ""
            notes = ""
            if isinstance(item, str):
                task = item.strip()
            elif isinstance(item, dict):
                task = str(
                    item.get("task")
                    or item.get("title")
                    or item.get("description")
                    or ""
                ).strip()
                status_raw = str(item.get("status", "pending")).strip().lower()
                item_id = str(item.get("id", "")).strip()
                notes = str(item.get("notes", "")).strip()
            if not task:
                continue
            if status_raw in {"doing", "active", "working"}:
                status = "in_progress"
            elif status_raw in {"done", "complete", "completed", "success"}:
                status = "done"
            elif status_raw in {"blocked", "error", "failed"}:
                status = "blocked"
            else:
                status = "pending"
            if not item_id:
                item_id = f"todo-{index}"
            key = f"{item_id.lower()}::{task.lower()}"
            if key in seen_keys:
                continue
            seen_keys.add(key)
            normalized.append(
                {
                    "id": item_id[:80],
                    "task": task[:500],
                    "status": status,
                    "notes": notes[:300],
                }
            )
            if len(normalized) >= 50:
                break
        return normalized

    @staticmethod
    def _todo_counts(todo_items: list[dict[str, str]]) -> dict[str, int]:
        """Count TODO statuses."""
        counts = {"pending": 0, "in_progress": 0, "done": 0, "blocked": 0}
        for item in todo_items:
            status = str(item.get("status", "pending")).strip().lower()
            if status not in counts:
                status = "pending"
            counts[status] += 1
        return counts

    @staticmethod
    def _todo_signature(todo_items: list[dict[str, str]]) -> tuple[tuple[str, str, str], ...]:
        """Create a compact TODO signature to detect status changes."""
        signature: list[tuple[str, str, str]] = []
        for item in todo_items:
            item_id = str(item.get("id", "")).strip() or "todo"
            task = str(item.get("task", "")).strip()
            status = str(item.get("status", "pending")).strip().lower()
            signature.append((item_id, task, status))
        return tuple(signature)

    def _todo_is_complete(self, todo_items: list[dict[str, str]]) -> bool:
        """Return True when TODO list is non-empty and all items are done."""
        if not todo_items:
            return False
        counts = self._todo_counts(todo_items)
        return counts["done"] == len(todo_items)

    def _format_todo_for_prompt(self, todo_items: list[dict[str, str]]) -> str:
        """Render TODO list for prompt feedback."""
        if not todo_items:
            return "- none provided"
        lines: list[str] = []
        for item in todo_items[:40]:
            status = str(item.get("status", "pending")).strip().lower()
            item_id = str(item.get("id", "")).strip() or "todo"
            task = str(item.get("task", "")).strip()
            notes = str(item.get("notes", "")).strip()
            base = f"- [{status}] {item_id}: {task}"
            if notes:
                base = f"{base} ({notes})"
            lines.append(base)
        return "\n".join(lines)

    async def _execute_agent_action(
        self,
        action: dict[str, Any],
        *,
        step_index: int,
    ) -> dict[str, Any]:
        """Execute one structured sandbox action."""
        normalized_action = self._normalize_action_item(action) or {}
        action_type = str(normalized_action.get("type", "")).strip().lower()
        if not action_type:
            return {
                "success": False,
                "exit_code": -1,
                "stdout": "",
                "stderr": "Action is missing required field `type`.",
                "script_path": "",
                "output_files": list_execution_output_files(self.execution_id),
            }

        if action_type == "run":
            command = normalized_action.get("command")
            if not isinstance(command, str) or not command.strip():
                return {
                    "success": False,
                    "exit_code": -1,
                    "stdout": "",
                    "stderr": "run action requires non-empty `command`.",
                    "script_path": "",
                    "output_files": list_execution_output_files(self.execution_id),
                }
            raw_timeout = normalized_action.get("timeout_seconds")
            timeout = None
            if isinstance(raw_timeout, int):
                timeout = max(1, min(raw_timeout, 3600))
            elif raw_timeout is not None:
                try:
                    timeout = max(1, min(int(raw_timeout), 3600))
                except (TypeError, ValueError):
                    timeout = None
            cwd = normalized_action.get("cwd")
            cwd_value = cwd.strip() if isinstance(cwd, str) and cwd.strip() else None
            return await execute_shell_command(
                self.execution_id,
                step_index=step_index,
                command=command,
                cwd=cwd_value,
                timeout=timeout,
            )

        if action_type == "run_python":
            code = normalized_action.get("code")
            if (not isinstance(code, str) or not code.strip()) and isinstance(normalized_action.get("command"), str):
                code = normalized_action.get("command")
            if (not isinstance(code, str) or not code.strip()) and isinstance(normalized_action.get("script"), str):
                code = normalized_action.get("script")
            if (not isinstance(code, str) or not code.strip()) and isinstance(normalized_action.get("source"), str):
                code = normalized_action.get("source")
            if not isinstance(code, str) or not code.strip():
                return {
                    "success": False,
                    "exit_code": -1,
                    "stdout": "",
                    "stderr": "run_python action requires non-empty `code` (or compatibility aliases `command`/`script`/`source`).",
                    "script_path": "",
                    "output_files": list_execution_output_files(self.execution_id),
                }
            raw_timeout = normalized_action.get("timeout_seconds")
            timeout = None
            if isinstance(raw_timeout, int):
                timeout = max(1, min(raw_timeout, 3600))
            elif raw_timeout is not None:
                try:
                    timeout = max(1, min(int(raw_timeout), 3600))
                except (TypeError, ValueError):
                    timeout = None
            return await self._execute_code(
                code,
                step_index=step_index,
                timeout_override=timeout,
            )

        if action_type == "write_file":
            path = normalized_action.get("path")
            content = normalized_action.get("content")
            append = bool(normalized_action.get("append", False))
            if not isinstance(path, str) or not path.strip():
                return {
                    "success": False,
                    "exit_code": -1,
                    "stdout": "",
                    "stderr": "write_file action requires non-empty `path`.",
                    "script_path": "",
                    "output_files": list_execution_output_files(self.execution_id),
                }
            if not isinstance(content, str):
                content = json.dumps(content, ensure_ascii=False)
            return write_execution_output_file(
                self.execution_id,
                path=path,
                content=content,
                append=append,
            )

        if action_type == "read_file":
            path = normalized_action.get("path")
            if not isinstance(path, str) or not path.strip():
                return {
                    "success": False,
                    "exit_code": -1,
                    "stdout": "",
                    "stderr": "read_file action requires non-empty `path`.",
                    "script_path": "",
                    "output_files": list_execution_output_files(self.execution_id),
                }
            raw_max_bytes = normalized_action.get("max_bytes", 200_000)
            try:
                max_bytes = max(1, min(int(raw_max_bytes), 2_000_000))
            except (TypeError, ValueError):
                max_bytes = 200_000

            path_value = path.strip()
            input_root = self.sandbox_input_dir.rstrip("/")
            if path_value == input_root or path_value.startswith(f"{input_root}/"):
                return read_execution_input_file(
                    self.execution_id,
                    path=path_value,
                    max_bytes=max_bytes,
                )
            return read_execution_output_file(
                self.execution_id,
                path=path_value,
                max_bytes=max_bytes,
            )

        if action_type == "list_files":
            path = normalized_action.get("path")
            path_value = path if isinstance(path, str) and path.strip() else None
            recursive = bool(normalized_action.get("recursive", True))
            input_root = self.sandbox_input_dir.rstrip("/")
            if isinstance(path_value, str):
                path_value = path_value.strip()
                if path_value == input_root or path_value.startswith(f"{input_root}/"):
                    input_files = list_execution_input_files(
                        self.execution_id,
                        path=path_value,
                        recursive=recursive,
                    )
                    return {
                        "success": True,
                        "exit_code": 0,
                        "stdout": json.dumps(input_files, ensure_ascii=False),
                        "stderr": "",
                        "script_path": self.sandbox_input_dir,
                        "output_files": list_execution_output_files(self.execution_id),
                    }
            files = list_execution_output_files(
                self.execution_id,
                path=path_value,
                recursive=recursive,
            )
            return {
                "success": True,
                "exit_code": 0,
                "stdout": json.dumps(files, ensure_ascii=False),
                "stderr": "",
                "script_path": self.sandbox_output_dir,
                "output_files": files,
            }

        if action_type == "stat_file":
            path = normalized_action.get("path")
            if not isinstance(path, str) or not path.strip():
                return {
                    "success": False,
                    "exit_code": -1,
                    "stdout": "",
                    "stderr": "stat_file action requires non-empty `path`.",
                    "script_path": "",
                    "output_files": list_execution_output_files(self.execution_id),
                }
            path_value = path.strip()
            input_root = self.sandbox_input_dir.rstrip("/")
            output_root = self.sandbox_output_dir.rstrip("/")

            if path_value == input_root or path_value.startswith(f"{input_root}/"):
                files = list_execution_input_files(self.execution_id, path=path_value, recursive=True)
                size_value = 0
                if files:
                    try:
                        size_value = int(files[0].get("size", 0))
                    except (TypeError, ValueError):
                        size_value = 0
                status_payload = {
                    "path": path_value,
                    "scope": "input",
                    "exists": bool(files),
                    "size": size_value,
                }
                return {
                    "success": True,
                    "exit_code": 0,
                    "stdout": json.dumps(status_payload, ensure_ascii=False),
                    "stderr": "",
                    "script_path": path_value,
                    "output_files": list_execution_output_files(self.execution_id),
                }

            if path_value == output_root or path_value.startswith(f"{output_root}/"):
                files = list_execution_output_files(self.execution_id, path=path_value, recursive=True)
                size_value = 0
                if files:
                    try:
                        size_value = int(files[0].get("size", 0))
                    except (TypeError, ValueError):
                        size_value = 0
                status_payload = {
                    "path": path_value,
                    "scope": "output",
                    "exists": bool(files),
                    "size": size_value,
                }
                return {
                    "success": True,
                    "exit_code": 0,
                    "stdout": json.dumps(status_payload, ensure_ascii=False),
                    "stderr": "",
                    "script_path": path_value,
                    "output_files": files,
                }
            return {
                "success": False,
                "exit_code": -1,
                "stdout": "",
                "stderr": (
                    f"stat_file path must be under {self.sandbox_input_dir}/ or {self.sandbox_output_dir}/"
                ),
                "script_path": "",
                "output_files": list_execution_output_files(self.execution_id),
            }

        if action_type == "read_input_file":
            path = normalized_action.get("path")
            if not isinstance(path, str) or not path.strip():
                return {
                    "success": False,
                    "exit_code": -1,
                    "stdout": "",
                    "stderr": "read_input_file action requires non-empty `path`.",
                    "script_path": "",
                    "output_files": list_execution_output_files(self.execution_id),
                }
            raw_max_bytes = normalized_action.get("max_bytes", 200_000)
            try:
                max_bytes = max(1, min(int(raw_max_bytes), 2_000_000))
            except (TypeError, ValueError):
                max_bytes = 200_000
            return read_execution_input_file(
                self.execution_id,
                path=path.strip(),
                max_bytes=max_bytes,
            )

        if action_type == "list_input_files":
            path = normalized_action.get("path")
            path_value = path.strip() if isinstance(path, str) and path.strip() else None
            recursive = bool(normalized_action.get("recursive", True))
            files = list_execution_input_files(
                self.execution_id,
                path=path_value,
                recursive=recursive,
            )
            return {
                "success": True,
                "exit_code": 0,
                "stdout": json.dumps(files, ensure_ascii=False),
                "stderr": "",
                "script_path": self.sandbox_input_dir,
                "output_files": list_execution_output_files(self.execution_id),
            }

        if action_type == "patch_file":
            path = normalized_action.get("path")
            search = normalized_action.get("search")
            replace = normalized_action.get("replace")
            replace_all = bool(normalized_action.get("replace_all", False))
            if not isinstance(path, str) or not path.strip():
                return {
                    "success": False,
                    "exit_code": -1,
                    "stdout": "",
                    "stderr": "patch_file action requires non-empty `path`.",
                    "script_path": "",
                    "output_files": list_execution_output_files(self.execution_id),
                }
            if not isinstance(search, str) or not search:
                return {
                    "success": False,
                    "exit_code": -1,
                    "stdout": "",
                    "stderr": "patch_file action requires non-empty `search`.",
                    "script_path": "",
                    "output_files": list_execution_output_files(self.execution_id),
                }
            if not isinstance(replace, str):
                replace = str(replace or "")
            return patch_execution_output_file(
                self.execution_id,
                path=path,
                search=search,
                replace=replace,
                replace_all=replace_all,
            )

        return {
            "success": False,
            "exit_code": -1,
            "stdout": "",
            "stderr": f"Unsupported action type: {action_type}",
            "script_path": "",
            "output_files": list_execution_output_files(self.execution_id),
        }

    def _format_action_execution_result(
        self,
        step_index: int,
        action: dict[str, Any],
        result: dict[str, Any],
    ) -> str:
        """Format action execution result for follow-up reasoning."""
        action_type = str(action.get("type", "unknown")).strip().lower() or "unknown"
        action_preview = ""
        if action_type == "run":
            command = action.get("command")
            if isinstance(command, str):
                action_preview = command[:200]
        elif action_type in {"write_file", "read_file", "read_input_file", "patch_file", "stat_file"}:
            path = action.get("path")
            if isinstance(path, str):
                action_preview = path
        elif action_type == "run_python":
            action_preview = "python code"
        elif action_type in {"list_files", "list_input_files"}:
            path = action.get("path")
            if isinstance(path, str) and path.strip():
                action_preview = path
            else:
                action_preview = (
                    self.sandbox_input_dir if action_type == "list_input_files" else self.sandbox_output_dir
                )

        base = self._format_code_execution_result(step_index, result)
        if action_preview:
            return f"Action: {action_type} ({action_preview})\n{base}"
        return f"Action: {action_type}\n{base}"

    def _normalize_code_block(self, code: str) -> str:
        """Normalize model code block content before sandbox execution."""
        normalized = str(code).replace("\r\n", "\n").expandtabs(4).strip()
        if not normalized:
            return ""

        # Defensive fence stripping if a model nests backticks inside extracted payload.
        if normalized.startswith("```"):
            normalized = normalized.strip("`").strip()
            if normalized.lower().startswith("python"):
                normalized = normalized[6:].lstrip()

        if "\\n" in normalized or "\\r\\n" in normalized or "\\t" in normalized:
            normalized = self._decode_structural_escapes(normalized)

        normalized = textwrap.dedent(normalized).strip()
        if not normalized:
            return ""
        return f"{normalized}\n"

    def _decode_structural_escapes(self, code: str) -> str:
        """Decode escaped layout sequences outside string literals."""
        out: list[str] = []
        i = 0
        n = len(code)
        in_single = False
        in_double = False
        in_triple_single = False
        in_triple_double = False

        while i < n:
            chunk3 = code[i : i + 3]
            ch = code[i]

            if not in_single and not in_double and not in_triple_single and not in_triple_double:
                if chunk3 == "'''":
                    in_triple_single = True
                    out.append(chunk3)
                    i += 3
                    continue
                if chunk3 == '"""':
                    in_triple_double = True
                    out.append(chunk3)
                    i += 3
                    continue
                if ch == "'":
                    in_single = True
                    out.append(ch)
                    i += 1
                    continue
                if ch == '"':
                    in_double = True
                    out.append(ch)
                    i += 1
                    continue
                if code.startswith("\\r\\n", i):
                    out.append("\n")
                    i += 4
                    continue
                if code.startswith("\\n", i):
                    out.append("\n")
                    i += 2
                    continue
                if code.startswith("\\t", i):
                    out.append("\t")
                    i += 2
                    continue
                out.append(ch)
                i += 1
                continue

            if in_triple_single:
                if chunk3 == "'''":
                    in_triple_single = False
                    out.append(chunk3)
                    i += 3
                    continue
                out.append(ch)
                i += 1
                continue

            if in_triple_double:
                if chunk3 == '"""':
                    in_triple_double = False
                    out.append(chunk3)
                    i += 3
                    continue
                out.append(ch)
                i += 1
                continue

            if in_single:
                out.append(ch)
                i += 1
                if ch == "\\" and i < n:
                    out.append(code[i])
                    i += 1
                    continue
                if ch == "'":
                    in_single = False
                continue

            if in_double:
                out.append(ch)
                i += 1
                if ch == "\\" and i < n:
                    out.append(code[i])
                    i += 1
                    continue
                if ch == '"':
                    in_double = False
                continue

        return "".join(out)

    def _fallback_output_code(self, state: AgentState) -> str:
        """Generate sandbox Python code that writes a best-effort failure report."""
        error_values = state.get("errors", [])
        recent_errors: list[str] = []
        if isinstance(error_values, list):
            for item in error_values:
                text = str(item).strip()
                if text:
                    recent_errors.append(text)

        report_lines = [
            "# Agent Run Failure Report",
            "",
            "The agent was unable to complete the requested task after retries.",
            "",
            "## Task Prompt",
            self.task_prompt or "No prompt provided.",
            "",
            "## Attempted Output Directory",
            self.sandbox_output_dir,
            "",
            "## Recent Errors",
        ]
        if recent_errors:
            report_lines.extend(f"- {error}" for error in recent_errors[-10:])
        else:
            report_lines.append("- No detailed error messages were captured.")

        report_lines.extend(
            [
                "",
                "## Next Steps",
                "- Verify the input file format is supported and not corrupted.",
                "- Retry with simpler extraction logic or alternate parsing libraries.",
                "- Ensure each Python block is fully self-contained.",
                "",
            ]
        )
        report_content = "\n".join(report_lines)
        fallback_filename = f"{self.execution_id}_failure_report.md"
        payload_literal = json.dumps(report_content, ensure_ascii=True)

        return textwrap.dedent(
            f"""
            import os

            output_dir = {self.sandbox_output_dir!r}
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, {fallback_filename!r})
            report_content = {payload_literal}
            with open(output_path, "w", encoding="utf-8") as handle:
                handle.write(report_content)
            print(f"Fallback output report written to: {{output_path}}")
            """
        ).strip() + "\n"

    def _detected_output_paths(self, state: AgentState) -> list[str]:
        """Read detected output file paths from state payload."""
        output_files = state.get("output_files", [])
        if not isinstance(output_files, list):
            return []

        paths: list[str] = []
        for item in output_files:
            if not isinstance(item, dict):
                continue
            raw_path = item.get("path")
            if isinstance(raw_path, str) and raw_path.strip():
                paths.append(raw_path.strip())
        return sorted(set(paths))

    def _nonempty_output_paths(self, output_files: list[dict[str, Any]]) -> list[str]:
        """Collect only non-empty output file paths from sandbox output payload."""
        paths: list[str] = []
        for item in output_files:
            if not isinstance(item, dict):
                continue
            raw_path = item.get("path")
            if not isinstance(raw_path, str) or not raw_path.strip():
                continue

            raw_size = item.get("size")
            size_value = -1
            if isinstance(raw_size, int):
                size_value = raw_size
            else:
                try:
                    size_value = int(raw_size)
                except (TypeError, ValueError):
                    size_value = -1
            if size_value <= 0:
                continue
            paths.append(raw_path.strip())
        return sorted(set(paths))

    def _detected_nonempty_output_paths(self, state: AgentState) -> list[str]:
        """Read detected non-empty output file paths from state payload."""
        output_files = state.get("output_files", [])
        if not isinstance(output_files, list):
            return []
        return self._nonempty_output_paths(output_files)

    def _format_detected_output_files(self, state: AgentState) -> str:
        """Render detected output files for prompt context."""
        paths = self._detected_nonempty_output_paths(state)
        if not paths:
            return "- none detected (or only zero-byte files were produced)"
        return "\n".join(f"- {path}" for path in paths[:50])

    def _execution_succeeded(self, state: AgentState) -> bool:
        """Determine success from concrete code execution and output artifacts."""
        code_blocks = state.get("code_blocks", [])
        if not isinstance(code_blocks, list) or not code_blocks:
            return True

        primary_attempts = [
            item
            for item in code_blocks
            if isinstance(item, dict) and not bool(item.get("fallback_output"))
        ]
        results = [
            item.get("result")
            for item in primary_attempts
            if isinstance(item.get("result"), dict)
        ]
        if not results:
            return False

        for result in results:
            if not bool(result.get("success")):
                continue
            output_files = result.get("output_files")
            if isinstance(output_files, list) and self._nonempty_output_paths(output_files):
                return True
        return False

    def _execution_failure_reason(self, state: AgentState) -> str:
        """Create a concise error reason for failed execution state."""
        code_blocks = state.get("code_blocks", [])
        if isinstance(code_blocks, list) and code_blocks:
            results = [
                item.get("result")
                for item in code_blocks
                if isinstance(item, dict) and isinstance(item.get("result"), dict)
            ]
            if results and not any(bool(result.get("success")) for result in results):
                return "All sandbox execution actions failed."
            if not self._detected_nonempty_output_paths(state):
                if self._detected_output_paths(state):
                    return "Only empty output files were created in sandbox output directory."
                return "No output files were created in sandbox output directory."

        errors = state.get("errors", [])
        if isinstance(errors, list):
            for item in reversed(errors):
                text = str(item).strip()
                if text:
                    return text[:500]
        return "Agent execution did not produce verifiable output files."
    
    def _build_system_prompt(self) -> str:
        """Build the system prompt for the agent."""
        stage_warnings = self._format_stage_warnings()
        return f"""
        You are a helpful AI agent that helps users complete real-world work tasks.
        You have access to Python code execution in a sandboxed environment.
        You can read and write files, process data, and generate output documents.

        File system contract (mandatory for every run):
        - Read provided inputs from {self.sandbox_input_dir}/ only.
        - Treat {self.sandbox_input_dir}/ as read-only.
        - Write all generated files to {self.sandbox_output_dir}/ only.
        - Do not write outputs to project root, temporary folders, or {self.sandbox_input_dir}/.
        - When listing created files, include their full path under {self.sandbox_output_dir}/.
        - Each run/run_python action runs in a fresh process; include imports and setup every time.
        - If a required dependency is missing, install it in code with `python -m pip install ...`.
        - Use list_input_files/read_input_file to inspect staged inputs.
        - Use write_file and patch_file actions to create and modify files under output directory.
        - After writing outputs, verify paths exist, size > 0, and content is plausible before claiming success.
        - During execution, maintain a TODO list and update it as work is completed.
        - Input filenames may include spaces and parentheses; quote shell paths safely or use run_python + pathlib.
        
        Available tools:
        {self._format_sandbox_capabilities()}
        
        Always explain what you're doing and why.
        Write clean, well-documented code.
        Handle errors gracefully.
        {stage_warnings}
        """
    
    def _format_input_files(self) -> str:
        """Format input files for the prompt."""
        if not self.input_files:
            return "No input files provided."
        
        lines = []
        for f in self.input_files:
            filename = Path(str(f.get("filename", "unknown"))).name
            content_type = str(f.get("content_type", "application/octet-stream"))
            lines.append(
                f"- {filename} ({content_type}) -> {self.sandbox_input_dir}/{filename}"
            )
        return "\n".join(lines)
    
    def _format_output_requirements(self) -> str:
        """Format output requirements for the prompt."""
        output_type = self.output_config.get("output_type", "unknown")
        config = self.output_config.get("config", {})
        
        return f"""
        Output Type: {output_type}
        Output Directory: {self.sandbox_output_dir}/
        Configuration: {config}
        """

    def _format_stage_warnings(self) -> str:
        """Describe staging warnings so the model understands missing inputs."""
        if not self.sandbox_stage_warnings:
            return ""
        warning_lines = "\n".join(f"- {warning}" for warning in self.sandbox_stage_warnings)
        return (
            "Input staging warnings (some files may be unavailable inside sandbox):\n"
            f"{warning_lines}"
        )

    def _format_sandbox_capabilities(self) -> str:
        """Render a capability summary from runtime discovery."""
        if not self.sandbox_capabilities:
            return (
                "- Python code execution in sandbox\n"
                "- Capability probe unavailable; use `python` and standard shell commands conservatively"
            )

        python_version = str(self.sandbox_capabilities.get("python_version", "unknown"))
        python_executable = str(self.sandbox_capabilities.get("python_executable", "python"))
        available_modules = self.sandbox_capabilities.get("available_modules", [])
        if not isinstance(available_modules, list):
            available_modules = []
        available_commands = self.sandbox_capabilities.get("available_commands", [])
        if not isinstance(available_commands, list):
            available_commands = []

        modules_display = ", ".join(str(item) for item in available_modules[:20]) or "none"
        commands_display = ", ".join(str(item) for item in available_commands[:20]) or "none"

        return (
            f"- Python ({python_version}) at {python_executable}\n"
            f"- Python modules detected: {modules_display}\n"
            f"- CLI commands detected: {commands_display}\n"
            f"- Filesystem access at {self.sandbox_input_dir}/ and {self.sandbox_output_dir}/"
        )

    def _format_code_execution_result(self, step_index: int, result: dict[str, Any]) -> str:
        """Format code execution result for follow-up reasoning."""
        stdout = str(result.get("stdout", "")).strip()
        stderr = str(result.get("stderr", "")).strip()
        stdout_preview = stdout[:4000] if stdout else "<empty>"
        stderr_preview = stderr[:2000] if stderr else "<empty>"
        output_files = result.get("output_files", [])
        output_paths: list[str] = []
        if isinstance(output_files, list):
            output_paths = self._nonempty_output_paths(output_files)
        detected_output_preview = (
            "\n".join(f"- {path}" for path in sorted(set(output_paths))[:20])
            if output_paths
            else "- <none>"
        )
        return (
            f"Code execution result for step {step_index}:\n"
            f"- success: {result.get('success')}\n"
            f"- exit_code: {result.get('exit_code')}\n"
            f"- script_path: {result.get('script_path')}\n"
            f"- detected_output_files:\n{detected_output_preview}\n"
            f"- stdout:\n{stdout_preview}\n"
            f"- stderr:\n{stderr_preview}"
        )
    
    async def run(self) -> dict:
        """Run the agent execution."""
        try:
            await self._emit_progress_log("Agent runtime initializing workspace.")
            prepared = await prepare_sandbox_workspace(self.execution_id, self.input_files)
            self.sandbox_input_dir = str(prepared.get("input_dir", self.sandbox_input_dir))
            self.sandbox_output_dir = str(prepared.get("output_dir", self.sandbox_output_dir))
            self.sandbox_scripts_dir = str(prepared.get("scripts_dir", self.sandbox_scripts_dir))
            warnings_payload = prepared.get("warnings", [])
            if isinstance(warnings_payload, list):
                self.sandbox_stage_warnings = [str(item) for item in warnings_payload if str(item)]

            try:
                self.sandbox_capabilities = await discover_sandbox_capabilities()
            except SandboxRuntimeError as exc:
                self.sandbox_stage_warnings.append(
                    f"Capability probe failed in sandbox: {exc}"
                )
            await self._emit_progress_log(
                "Sandbox workspace prepared.",
                data={
                    "stage": "init",
                    "input_dir": self.sandbox_input_dir,
                    "output_dir": self.sandbox_output_dir,
                    "warning_count": len(self.sandbox_stage_warnings),
                },
            )

            state = self._ensure_state_defaults(self.state)
            await self._emit_progress_log("Entering initialization stage.", data={"stage": "init"})
            state = await self._init_node(state)
            await self._emit_progress_log("Entering analysis stage.", data={"stage": "analyze"})
            state = await self._analyze_node(state)
            await self._emit_progress_log("Entering planning stage.", data={"stage": "plan"})
            state = await self._plan_node(state)
            await self._emit_progress_log("Entering execution stage.", data={"stage": "execute"})
            state = await self._execute_node(state)
            await self._emit_progress_log("Entering output generation stage.", data={"stage": "generate_output"})
            state = await self._generate_output_node(state)
            await self._emit_progress_log("Entering validation stage.", data={"stage": "validate"})
            final_state = await self._validate_node(state)
            execution_success = self._execution_succeeded(final_state)
            failure_reason = None if execution_success else self._execution_failure_reason(final_state)
            await self._emit_progress_log(
                "Agent runtime finished.",
                level="info" if execution_success else "error",
                data={
                    "stage": "complete",
                    "success": execution_success,
                    "error": failure_reason,
                    "output_count": len(self._detected_nonempty_output_paths(final_state)),
                },
            )
            return {
                "success": execution_success,
                "error": failure_reason,
                "state": dict(final_state),
                "messages": final_state.get("messages", []),
                "artifacts": final_state.get("artifacts", []),
                "sandbox_capabilities": self.sandbox_capabilities,
                "sandbox_warnings": self.sandbox_stage_warnings,
            }
        except SandboxRuntimeError as e:
            await self._emit_progress_log(
                f"Agent runtime failed with sandbox error: {self._truncate_for_log(e)}",
                level="error",
                data={"stage": "error", "error_type": "sandbox"},
            )
            return {
                "success": False,
                "error": f"Sandbox runtime error: {e}",
                "state": dict(self.state),
            }
        except Exception as e:
            await self._emit_progress_log(
                f"Agent runtime failed: {self._truncate_for_log(e)}",
                level="error",
                data={"stage": "error", "error_type": "runtime"},
            )
            return {
                "success": False,
                "error": str(e),
                "state": dict(self.state),
            }


async def execute_agent(
    execution_id: uuid.UUID,
    agent_config: dict,
    task_prompt: str,
    input_files: list[dict],
    output_config: dict,
) -> dict:
    """Execute an agent task."""
    executor = AgentExecutor(
        execution_id=execution_id,
        agent_config=agent_config,
        task_prompt=task_prompt,
        input_files=input_files,
        output_config=output_config,
    )
    return await executor.run()
