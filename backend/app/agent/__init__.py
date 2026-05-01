import asyncio
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.config import settings
from app.models import Execution, ExecutionLog, Artifact, File as FileModel
from app.opencode_client import opencode_client

logger = logging.getLogger(__name__)

async def execute_agent(
    execution_id: Any,
    agent_config: dict[str, Any],
    task_prompt: str,
    input_files: list[dict[str, str]],
    output_config: dict[str, Any],
    opencode_agent: str = "general",
) -> dict[str, Any]:
    from app.database import async_session_maker
    async with async_session_maker() as db:
        res = await run_agent(str(execution_id), db, task_prompt=task_prompt, opencode_agent=opencode_agent, input_files=input_files)
    
    if not res:
        return {"success": False, "error": "Agent failed to return a valid response."}
    return res

async def run_agent(
    execution_id: str,
    db: AsyncSession,
    task_prompt: str = "Do your task.",
    opencode_agent: str = "general",
    input_files: list[dict[str, str]] | None = None
):
    # Retrieve execution
    stmt = select(Execution).options(joinedload(Execution.agent)).where(Execution.id == execution_id)
    result = await db.execute(stmt)
    execution = result.scalar_one_or_none()
    
    if not execution:
        logger.error(f"Execution {execution_id} not found")
        return
        
    try:
        execution.status = "running"
        await db.commit()

        # Step 1: Create OpenCode session
        session_data = await opencode_client.create_session(title=f"WorkerBee {execution_id}")
        session_id = session_data["id"]
        
        execution.opencode_session_id = session_id
        await db.commit()
        
        await log_msg(db, execution_id, "System", "OpenCode session created.")

        # Step 2: Prepare workspace
        workspace_dir = Path(settings.opencode_workspace_root) / f"executions/{execution_id}"
        workspace_dir.mkdir(parents=True, exist_ok=True)
        
        if input_files:
            for file_info in input_files:
                src_path = Path("/app") / file_info["storage_path"] # Assuming the app runs in /app and storage_path is relative to it
                if src_path.exists():
                    dest_path = workspace_dir / file_info["filename"]
                    shutil.copy2(src_path, dest_path)
                    await log_msg(db, execution_id, "System", f"Copied input file: {file_info['filename']}")
                else:
                    await log_msg(db, execution_id, "System", f"Warning: Input file not found at {src_path}")
        
        # Step 3: Send prompt
        agent_config = execution.agent.config
        template_id = agent_config.get("template", {}).get("id", "unknown")
        
        prompt = (
            f"Executing task: {task_prompt}\n\n"
            f"IMPORTANT: Your workspace for this task is located at the absolute path: {workspace_dir}\n"
            f"Any input files provided are located inside that directory. You MUST `cd {workspace_dir}` "
            f"or use absolute paths to access them."
        )
        
        # Send to OpenCode using a supported built-in agent (OpenCode only has: build, explore, general, plan)
        await log_msg(db, execution_id, "System", f"Starting '{opencode_agent}' agent execution (Template: {template_id}) ...")
        
        # This will block until the model finishes its task
        result = await opencode_client.send_prompt(session_id, prompt, agent_name=opencode_agent)
        
        # Step 4: Harvest artifacts from workspace_dir
        # Assuming artifacts would be discovered and registered here...
        
        await db.commit()
        await log_msg(db, execution_id, "System", "Execution completed successfully.")
        
        # Extract response text
        content = "No output text provided by agent."
        if isinstance(result, dict):
            # Check for API error inside result
            if result.get("info", {}).get("error"):
                e_msg = result["info"]["error"].get("data", {}).get("message", str(result["info"]["error"]))
                content = f"OpenCode API Error: {e_msg}"
            else:
                # Check OpenCode return format for text
                parts = result.get("parts", [])
                for part in reversed(parts):
                    if part.get("type") == "text":
                        content = part.get("text", content)
                        break
        
        return {
            "success": True,
            "messages": [{"role": "assistant", "content": content}],
            "opencode_result": result
        }
        
    except Exception as e:
        logger.error(f"Execution {execution_id} failed: {e}", exc_info=True)
        await log_msg(db, execution_id, "System", f"Execution failed: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

async def log_msg(db: AsyncSession, exec_id: str, role: str, msg: str):
    import uuid
    logger.info(f"[{exec_id}] {role}: {msg}")
    db.add(ExecutionLog(
        execution_id=uuid.UUID(exec_id),
        level="info",
        message=f"{role}: {msg}"
    ))
    await db.commit()
    
