"""WorkerBee Backend Application Configuration."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "WorkerBee"
    app_version: str = "0.1.0"
    debug: bool = False
    environment: Literal["development", "staging", "production"] = "development"

    # API
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Database
    database_url: str = "postgresql+asyncpg://workerbee:workerbee@localhost:5432/workerbee"
    database_pool_size: int = 5
    database_max_overflow: int = 10

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # MinIO (Object Storage)
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "workerbee"
    minio_secure: bool = False

    # Authentication
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # LLM Configuration
    litellm_base_url: str = ""
    litellm_api_key: str = ""
    litellm_master_key: str = ""
    llm_available_models: str = "gpt-4o-mini,gpt-4o,claude-3-5-sonnet-20241022"
    llm_default_model: str = "gpt-4o-mini"
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # Sandbox Configuration
    sandbox_image: str = "workerbee-sandbox:latest"
    sandbox_api_base_url: str = "http://sandbox:9000"
    sandbox_workspace_root: str = "/workspace"
    sandbox_timeout: int = 1800  # 30 minutes
    sandbox_http_timeout: int = 120
    sandbox_max_memory: str = "4g"
    sandbox_max_cpu: str = "2"
    sandbox_max_disk: str = "10g"
    sandbox_capability_cache_seconds: int = 300

    # File Upload
    max_file_size: int = 100 * 1024 * 1024  # 100MB
    allowed_file_types: list[str] = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/csv",
        "text/plain",
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
    ]

    # Execution
    max_concurrent_executions: int = 3
    execution_timeout: int = 1800  # 30 minutes

    @property
    def parsed_llm_available_models(self) -> list[str]:
        """Return configured available LLM models from CSV env input."""
        return [model.strip() for model in self.llm_available_models.split(",") if model.strip()]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
