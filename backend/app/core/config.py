import os
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Retail Pricing Management System"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = Field(
        default="postgresql+psycopg2://postgres:postgres@localhost:5433/retail_pricing"
    )
    
    # Redis / Celery
    REDIS_URL: str = Field(default="redis://localhost:6380/0")
    CELERY_BROKER_URL: str = Field(default="redis://localhost:6380/0")
    CELERY_RESULT_BACKEND: str = Field(default="redis://localhost:6380/0")
    
    # Storage
    UPLOAD_DIR: str = Field(default="./data/uploads")
    
    # Limits & Guardrails
    MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB
    MAX_DATA_ROWS: int = 50000
    MAX_COLUMNS: int = 50
    DB_BATCH_SIZE: int = 1000
    
    # CORS
    CORS_ORIGINS: str = "*"
    
    # Dev authentication stub
    DEV_ACTOR_ID: str = "dev-analyst-01"
    
    # Logging
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )

    @property
    def cors_origins_list(self) -> List[str]:
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
