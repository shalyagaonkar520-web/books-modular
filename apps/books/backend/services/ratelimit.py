"""Small in-memory sliding-window rate limiter for authentication endpoints.

Suitable for a single process. For multi-instance deployments put the limiter
at the reverse proxy (nginx `limit_req`) or use a shared store.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit = limit
        self.window = window_seconds
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            while bucket and now - bucket[0] > self.window:
                bucket.popleft()
            if len(bucket) >= self.limit:
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Too many attempts. Please wait a minute and try again.",
                )
            bucket.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
