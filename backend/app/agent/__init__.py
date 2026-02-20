"""Agent execution module using LangGraph."""

from typing import Any
import uuid

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from litellm import acompletion
import asyncio

from app.models import Execution, ExecutionLog
from app.config import settings


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
    
    async def _init_node(self, state: AgentState) -> AgentState:
        """Initialize the agent execution."""
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
        state["current_step"] = "plan"
        
        planning_prompt = """
        Based on the analysis, create a step-by-step plan to complete the task.
        For each step, specify:
        1. What needs to be done
        2. What Python code (if any) needs to be executed
        3. What files or data are needed
        
        Format your response as a numbered list of steps.
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
        state["current_step"] = "execute"
        
        execution_prompt = """
        Now execute the plan. For each step that requires Python code:
        1. Write the code in a ```python code block
        2. The code will be executed in a sandboxed environment
        3. Input files are available in /workspace/input/
        4. Output files should be written to /workspace/output/
        
        Execute one step at a time and show the results.
        """
        
        state["messages"].append({
            "role": "user",
            "content": execution_prompt,
        })
        
        response = await self._call_llm(state["messages"])
        state["messages"].append({
            "role": "assistant",
            "content": response,
        })
        
        # Extract and execute code blocks
        code_blocks = self._extract_code_blocks(response)
        for code in code_blocks:
            result = await self._execute_code(code)
            state["code_blocks"].append({
                "code": code,
                "result": result,
            })
        
        return state
    
    async def _generate_output_node(self, state: AgentState) -> AgentState:
        """Generate the final output files."""
        state["current_step"] = "generate_output"
        
        output_prompt = f"""
        Generate the final output files based on the execution results.
        
        Output Requirements:
        {self._format_output_requirements()}
        
        Create the necessary files and provide a summary of what was created.
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
        state["current_step"] = "validate"
        
        validation_prompt = """
        Validate that the output files meet the requirements.
        Provide a summary of:
        1. What was accomplished
        2. What files were created
        3. Any issues or limitations encountered
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
        model = self.agent_config.get("model", "gpt-4")
        
        response = await acompletion(
            model=model,
            messages=messages,
            temperature=self.agent_config.get("temperature", 0.7),
            max_tokens=self.agent_config.get("max_tokens", 4096),
        )
        
        return response.choices[0].message.content
    
    async def _execute_code(self, code: str) -> dict:
        """Execute Python code in the sandbox."""
        # In production, this would execute in the sandbox container
        # For now, we'll return a placeholder
        return {
            "success": True,
            "output": "Code execution simulated",
            "error": None,
        }
    
    def _extract_code_blocks(self, text: str) -> list[str]:
        """Extract Python code blocks from text."""
        import re
        pattern = r"```python\n(.*?)```"
        matches = re.findall(pattern, text, re.DOTALL)
        return matches
    
    def _build_system_prompt(self) -> str:
        """Build the system prompt for the agent."""
        return f"""
        You are a helpful AI agent that helps users complete real-world work tasks.
        You have access to Python code execution in a sandboxed environment.
        You can read and write files, process data, and generate output documents.
        
        Available tools:
        - Python code execution (with common libraries like pandas, numpy, openpyxl, etc.)
        - File reading and writing
        - Data processing and analysis
        
        Always explain what you're doing and why.
        Write clean, well-documented code.
        Handle errors gracefully.
        """
    
    def _format_input_files(self) -> str:
        """Format input files for the prompt."""
        if not self.input_files:
            return "No input files provided."
        
        lines = []
        for f in self.input_files:
            lines.append(f"- {f['filename']} ({f['content_type']})")
        return "\n".join(lines)
    
    def _format_output_requirements(self) -> str:
        """Format output requirements for the prompt."""
        output_type = self.output_config.get("output_type", "unknown")
        config = self.output_config.get("config", {})
        
        return f"""
        Output Type: {output_type}
        Configuration: {config}
        """
    
    async def run(self) -> dict:
        """Run the agent execution."""
        try:
            final_state = await self.graph.ainvoke(self.state)
            return {
                "success": True,
                "state": dict(final_state),
                "messages": final_state.get("messages", []),
                "artifacts": final_state.get("artifacts", []),
            }
        except Exception as e:
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