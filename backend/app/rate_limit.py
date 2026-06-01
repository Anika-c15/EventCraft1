"""
Centralized rate-limiter using slowapi.

Usage in any router:
    from ..rate_limit import limiter

    @router.post("/some-route")
    @limiter.limit("10/minute")
    async def some_route(request: Request, ...):
        ...

The `Request` parameter is **required** by slowapi to extract the
client IP — add it to the function signature if it isn't already there.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
