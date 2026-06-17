from pathlib import Path

from pydantic_settings import BaseSettings

# Always load backend/.env regardless of process working directory
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"

    # Email — SendGrid (preferred) or SMTP fallback
    SENDGRID_API_KEY: str = ""          # set this for real email via SendGrid
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_SKIP_TLS_VERIFY: bool = True
    EMAIL_FROM: str = "EventCraft <noreply@eventcraft.com>"
    EMAIL_FROM_NAME: str = "EventCraft"

    DATABASE_URL: str = "sqlite:///./eventcraft.db"
    FRONTEND_URL: str = "http://localhost:5173"

    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

    ANOMALY_THRESHOLD: float = 2.5

    # ── Social Scraping Settings ──
    SOCIAL_FREE_TIER_MODE: bool = True
    SOCIAL_POST_DELAY_SECONDS: int = 2
    SOCIAL_MIN_VOTE_THRESHOLD: int = 30
    SOCIAL_MOCK_MODE: bool = True

    # Twitter/X
    TWITTER_BEARER_TOKEN: str = ""
    TWITTER_API_KEY: str = ""
    TWITTER_API_SECRET: str = ""
    TWITTER_ACCESS_TOKEN: str = ""
    TWITTER_ACCESS_TOKEN_SECRET: str = ""

    # LinkedIn
    LINKEDIN_ACCESS_TOKEN: str = ""
    LINKEDIN_ORG_URN: str = ""
    LINKEDIN_PERSON_URN: str = ""
    LINKEDIN_TOKEN_EXPIRES_AT: str = ""

    # Instagram
    INSTAGRAM_ACCESS_TOKEN: str = ""
    INSTAGRAM_BUSINESS_ACCOUNT_ID: str = ""
    INSTAGRAM_TOKEN_EXPIRES_AT: str = ""

    # Supabase (for social scraper screenshot storage)
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "social-screenshots"

    class Config:
        env_file = str(BASE_DIR / ".env")
        extra = "ignore"


settings = Settings()
