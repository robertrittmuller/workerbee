"""Agents router."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Agent, AgentType, User
from app.routers.auth import get_current_active_user
from app.schemas import AgentCreate, AgentResponse, AgentTypeResponse, AgentUpdate

router = APIRouter()


@router.get("/types", response_model=list[AgentTypeResponse])
async def list_agent_types(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AgentType]:
    """List all available agent types."""
    result = await db.execute(select(AgentType).where(AgentType.is_active == True))
    return list(result.scalars().all())


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


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Agent:
    """Get an agent by ID."""
    result = await db.execute(
        select(Agent).where(
            Agent.id == agent_id, Agent.user_id == current_user.id
        )
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )
    return agent


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: uuid.UUID,
    agent_data: AgentUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Agent:
    """Update an agent."""
    result = await db.execute(
        select(Agent).where(
            Agent.id == agent_id, Agent.user_id == current_user.id
        )
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )
    
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
    result = await db.execute(
        select(Agent).where(
            Agent.id == agent_id, Agent.user_id == current_user.id
        )
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )
    await db.delete(agent)
