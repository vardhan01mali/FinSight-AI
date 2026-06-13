import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

class Settings(BaseSettings):
    # JWT Auth
    JWT_SECRET: str = "supersecretjwtkeyforfinsightai1234567890"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Database
    DATABASE_URL: str = "sqlite:///./finsight.db"

    # AI Provider
    AI_PROVIDER: str = "groq"
    GROQ_API_KEY: str = ""
    DEFAULT_LLM_MODEL: str = "llama-3.1-8b-instant"
    OPTIONAL_LLM_MODEL: str = "llama-3.3-70b-versatile"

    # Vector Storage
    CHROMA_PATH: str = "./chroma_db"

    # File Storage
    UPLOAD_DIR: str = "./uploaded_documents"
    MAX_FILE_SIZE: int = 20971520  # 20MB in bytes
    MAX_IMAGE_SIZE: int = 10485760 # 10MB in bytes

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def parsed_origins(self) -> List[str]:
        if not self.ALLOWED_ORIGINS:
            return []
        # Strip any accidental single/double quotes around origins
        return [origin.strip().strip("'\"") for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

settings = Settings()
