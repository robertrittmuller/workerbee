"""Workflows router."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Workflow, WorkflowNode, WorkflowEdge
from app.routers.auth import get_current_active_user
from app.schemas import (
    WorkflowCreate,
    WorkflowResponse,
    WorkflowUpdate,
    WorkflowNodeCreate,
    WorkflowEdgeCreate,
)

router = APIRouter()


@router.get("", response_model=list[WorkflowResponse])
async def list_workflows(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
) -> list[Workflow]:
    """List all workflows for the current user."""
    result = await db.execute(
        select(Workflow)
        .where(Workflow.user_id == current_user.id)
        .options(selectinload(Workflow.nodes), selectinload(Workflow.edges))
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    workflow_data: WorkflowCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Workflow:
    """Create a new workflow."""
    workflow = Workflow(
        user_id=current_user.id,
        name=workflow_data.name,
        description=workflow_data.description,
        canvas_state=workflow_data.canvas_state,
    )
    db.add(workflow)
    await db.flush()
    
    # Create nodes
    if workflow_data.nodes:
        for node_data in workflow_data.nodes:
            node = WorkflowNode(
                workflow_id=workflow.id,
                node_type=node_data.node_type,
                reference_id=node_data.reference_id,
                position=node_data.position,
                config=node_data.config,
            )
            db.add(node)
    
    # Create edges
    if workflow_data.edges:
        for edge_data in workflow_data.edges:
            edge = WorkflowEdge(
                workflow_id=workflow.id,
                source_node_id=edge_data.source_node_id,
                target_node_id=edge_data.target_node_id,
                edge_config=edge_data.edge_config,
            )
            db.add(edge)
    
    await db.flush()
    await db.refresh(workflow)
    
    # Reload with relationships
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow.id)
        .options(selectinload(Workflow.nodes), selectinload(Workflow.edges))
    )
    return result.scalar_one()


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Workflow:
    """Get a workflow by ID."""
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow_id, Workflow.user_id == current_user.id)
        .options(selectinload(Workflow.nodes), selectinload(Workflow.edges))
    )
    workflow = result.scalar_one_or_none()
    if workflow is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )
    return workflow


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: uuid.UUID,
    workflow_data: WorkflowUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Workflow:
    """Update a workflow."""
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow_id, Workflow.user_id == current_user.id)
    )
    workflow = result.scalar_one_or_none()
    if workflow is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )
    
    update_data = workflow_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(workflow, field, value)
    
    await db.flush()
    await db.refresh(workflow)
    
    # Reload with relationships
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow.id)
        .options(selectinload(Workflow.nodes), selectinload(Workflow.edges))
    )
    return result.scalar_one()


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a workflow."""
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow_id, Workflow.user_id == current_user.id)
    )
    workflow = result.scalar_one_or_none()
    if workflow is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )
    await db.delete(workflow)


@router.post("/{workflow_id}/nodes", response_model=WorkflowResponse)
async def add_node(
    workflow_id: uuid.UUID,
    node_data: WorkflowNodeCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Workflow:
    """Add a node to a workflow."""
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow_id, Workflow.user_id == current_user.id)
    )
    workflow = result.scalar_one_or_none()
    if workflow is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )
    
    node = WorkflowNode(
        workflow_id=workflow_id,
        node_type=node_data.node_type,
        reference_id=node_data.reference_id,
        position=node_data.position,
        config=node_data.config,
    )
    db.add(node)
    await db.flush()
    
    # Reload with relationships
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow_id)
        .options(selectinload(Workflow.nodes), selectinload(Workflow.edges))
    )
    return result.scalar_one()


@router.post("/{workflow_id}/edges", response_model=WorkflowResponse)
async def add_edge(
    workflow_id: uuid.UUID,
    edge_data: WorkflowEdgeCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Workflow:
    """Add an edge to a workflow."""
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow_id, Workflow.user_id == current_user.id)
    )
    workflow = result.scalar_one_or_none()
    if workflow is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )
    
    edge = WorkflowEdge(
        workflow_id=workflow_id,
        source_node_id=edge_data.source_node_id,
        target_node_id=edge_data.target_node_id,
        edge_config=edge_data.edge_config,
    )
    db.add(edge)
    await db.flush()
    
    # Reload with relationships
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow_id)
        .options(selectinload(Workflow.nodes), selectinload(Workflow.edges))
    )
    return result.scalar_one()
