"""
Shared rate-limiter instance (SlowAPI).

Uses REDIS_URL from settings (Upstash / local Redis) for distributed,
persistent rate-limit counters. Falls back to in-memory storage when
REDIS_URL is unset or points to localhost (pure local dev).

Import `limiter` from here in:
  - app/main.py    → attach to app + register 429 handler
  - any router     → @limiter.limit("N/period") decorators
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from .config import settings

_redis_url = settings.REDIS_URL or ""
_use_redis = bool(_redis_url) and "localhost" not in _redis_url

# Build the effective storage URI.
# On macOS, Python cannot verify Upstash's TLS certificate chain using the
# system trust store.  The `limits` library (v5.x) parses query parameters
# from the URI and forwards them to redis-py's connection pool.  Appending
# ?ssl_cert_reqs=CERT_NONE disables peer cert verification, which is
# acceptable for rate-limit counters (no sensitive data lives in Redis).
if _use_redis and _redis_url.startswith("rediss://"):
    _sep = "&" if "?" in _redis_url else "?"
    # redis-py v7.x expects lowercase "none" (not "CERT_NONE") for this param
    _storage_uri = f"{_redis_url}{_sep}ssl_cert_reqs=none"
else:
    _storage_uri = _redis_url if _use_redis else "memory://"

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],
    storage_uri=_storage_uri,
)

if _use_redis:
    host = _redis_url.split("@")[-1]
    print(f"✅ Rate limiter → Upstash Redis: {host}")
else:
    print("⚠️  Rate limiter → in-memory (no external Redis configured)")



