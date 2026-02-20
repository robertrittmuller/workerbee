"""WorkerBee FastAPI Application."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import close_db, init_db
from app.routers import auth, users, workflows, agents, tasks, files, outputs, executions


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup
    await init_db()
    yield
    # Shutdown
    await close_db()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI Agent Platform for Real Work",
    openapi_url=f"{settings.api_v1_prefix}/openapi.json",
    docs_url=f"{settings.api_v1_prefix}/docs",
    redoc_url=f"{settings.api_v1_prefix}/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix=f"{settings.api_v1_prefix}/auth", tags=["auth"])
app.include_router(users.router, prefix=f"{settings.api_v1_prefix}/users", tags=["users"])
app.include_router(workflows.router, prefix=f"{settings.api_v1_prefix}/workflows", tags=["workflows"])
app.include_router(agents.router, prefix=f"{settings.api_v1_prefix}/agents", tags=["agents"])
app.include_router(tasks.router, prefix=f"{settings.api_v1_prefix}/tasks", tags=["tasks"])
app.include_router(files.router, prefix=f"{settings.api_v1_prefix}/files", tags=["files"])
app.include_router(outputs.router, prefix=f"{settings.api_v1_prefix}/outputs", tags=["outputs"])
app.include_router(executions.router, prefix=f"{settings.api_v1_prefix}/executions", tags=["executions"])


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "healthy", "version": settings.app_version}
