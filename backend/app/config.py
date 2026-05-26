from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    GROQ_API_KEY: str = ""

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"

    # Email — SendGrid (preferred) or SMTP fallback
    SENDGRID_API_KEY: str = ""          # set this for real email via SendGrid
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "EventCraft <noreply@eventcraft.com>"
    EMAIL_FROM_NAME: str = "EventCraft"

    DATABASE_URL: str = "sqlite:///./eventcraft.db"
    FRONTEND_URL: str = "http://localhost:5173"

    ADMIN_EMAIL: str = "admin@eventcraft.com"
    ADMIN_PASSWORD: str = "admin123"

    ANOMALY_THRESHOLD: float = 2.5

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
