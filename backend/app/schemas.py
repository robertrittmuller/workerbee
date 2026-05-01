"""Pydantic schemas for API request/response validation."""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field


# User schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: str = Field(min_length=1)
    password: str


class UserResponse(UserBase):
    id: uuid.UUID
    is_active: bool
    is_superuser: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    exp: datetime


# Workflow schemas
class WorkflowNodeBase(BaseModel):
    node_type: str
    reference_id: Optional[uuid.UUID] = None
    position: Optional[dict[str, float]] = None
    config: Optional[dict[str, Any]] = None


class WorkflowNodeCreate(WorkflowNodeBase):
    pass


class WorkflowNodeResponse(WorkflowNodeBase):
    id: uuid.UUID
    workflow_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class WorkflowEdgeBase(BaseModel):
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    edge_config: Optional[dict[str, Any]] = None


class WorkflowEdgeCreate(WorkflowEdgeBase):
    pass


class WorkflowEdgeResponse(WorkflowEdgeBase):
    id: uuid.UUID
    workflow_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class WorkflowBase(BaseModel):
    name: str
    description: Optional[str] = None
    canvas_state: Optional[dict[str, Any]] = None


class WorkflowCreate(WorkflowBase):
    nodes: Optional[list[WorkflowNodeCreate]] = None
    edges: Optional[list[WorkflowEdgeCreate]] = None


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    canvas_state: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class WorkflowResponse(WorkflowBase):
    id: uuid.UUID
    user_id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
    nodes: list[WorkflowNodeResponse] = []
    edges: list[WorkflowEdgeResponse] = []

    class Config:
        from_attributes = True


# File schemas
class FileBase(BaseModel):
    original_filename: str
    content_type: str
    file_size: int


class FileResponse(FileBase):
    id: uuid.UUID
    user_id: uuid.UUID
    filename: str
    storage_path: str
    file_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class ResourceGroupBase(BaseModel):
    name: str


class ResourceGroupCreate(ResourceGroupBase):
    pass


class ResourceGroupAssign(BaseModel):
    resource_group_id: Optional[uuid.UUID] = None


class ResourceGroupResponse(ResourceGroupBase):
    id: uuid.UUID
    user_id: uuid.UUID
    is_default: bool
    created_at: datetime
    file_count: int = 0

    class Config:
        from_attributes = True


# Agent schemas
class AgentTypeBase(BaseModel):
    name: str
    provider: str
    model_name: str
    description: Optional[str] = None
    default_config: Optional[dict[str, Any]] = None


class AgentTypeResponse(AgentTypeBase):
    id: uuid.UUID
    is_active: bool

    class Config:
        from_attributes = True


class AgentBase(BaseModel):
    name: str
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    llm_settings: Optional[dict[str, Any]] = None


class AgentCreate(AgentBase):
    agent_type_id: Optional[uuid.UUID] = None


class AgentTemplateResponse(BaseModel):
    id: str
    name: str
    description: str
    markdown_files: list[str]


class AgentCreateFromTemplate(BaseModel):
    template_id: str
    name: str
    description: Optional[str] = None
    agent_type_id: Optional[uuid.UUID] = None
    llm_settings: Optional[dict[str, Any]] = None
    resource_ids: list[uuid.UUID] = Field(default_factory=list)


class AgentResourceUpdate(BaseModel):
    resource_ids: list[uuid.UUID] = Field(default_factory=list)


class AgentRunRequest(BaseModel):
    task_id: Optional[uuid.UUID] = None
    task_prompt: Optional[str] = None
    resource_ids: Optional[list[uuid.UUID]] = None
    opencode_agent: str = Field(default="general", description="The OpenCode agent mode to use: build, explore, general, plan")


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    llm_settings: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class AgentResponse(AgentBase):
    id: uuid.UUID
    user_id: uuid.UUID
    agent_type_id: Optional[uuid.UUID]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Task schemas
class TaskBase(BaseModel):
    name: str
    description: Optional[str] = None
    prompt_template: str
    is_template: bool = False
    is_public: bool = False


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    prompt_template: Optional[str] = None
    is_template: Optional[bool] = None
    is_public: Optional[bool] = None


class TaskResponse(TaskBase):
    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    created_at: datetime

    class Config:
        from_attributes = True


# Output schemas
class OutputBase(BaseModel):
    name: str
    output_type: str
    config: Optional[dict[str, Any]] = None


class OutputCreate(OutputBase):
    pass


class OutputUpdate(BaseModel):
    name: Optional[str] = None
    output_type: Optional[str] = None
    config: Optional[dict[str, Any]] = None


class OutputResponse(OutputBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


# Execution schemas
class ExecutionBase(BaseModel):
    workflow_id: Optional[uuid.UUID] = None
    agent_id: Optional[uuid.UUID] = None
    task_id: Optional[uuid.UUID] = None


class ExecutionCreate(ExecutionBase):
    input_data: Optional[dict[str, Any]] = None


class ExecutionUpdate(BaseModel):
    status: Optional[str] = None
    result: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None


class ExecutionResponse(ExecutionBase):
    id: uuid.UUID
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    result: Optional[dict[str, Any]]
    error_message: Optional[str]

    class Config:
        from_attributes = True


class ExecutionLogResponse(BaseModel):
    id: uuid.UUID
    execution_id: uuid.UUID
    level: str
    message: str
    data: Optional[dict[str, Any]]
    created_at: datetime

    class Config:
        from_attributes = True


# Artifact schemas
class ArtifactResponse(BaseModel):
    id: uuid.UUID
    execution_id: uuid.UUID
    output_id: Optional[uuid.UUID]
    filename: str
    content_type: str
    file_size: int
    storage_path: str
    created_at: datetime

    class Config:
        from_attributes = True


class RecentOutputFileResponse(BaseModel):
    id: uuid.UUID
    execution_id: uuid.UUID
    output_id: Optional[uuid.UUID]
    filename: str
    content_type: str
    file_size: int
    storage_path: str
    created_at: datetime
    agent_id: Optional[uuid.UUID] = None
    agent_name: Optional[str] = None
    output_name: Optional[str] = None
    output_type: Optional[str] = None


# API Key schemas
class ApiKeyCreate(BaseModel):
    provider: str
    api_key: str


class ApiKeyResponse(BaseModel):
    id: uuid.UUID
    provider: str
    created_at: datetime

    class Config:
        from_attributes = True
