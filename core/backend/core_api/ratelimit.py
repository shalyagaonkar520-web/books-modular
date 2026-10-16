"""In-memory failure counting per key (e.g. wrong client secrets per IP).

Per process. Behind several workers the effective limit is multiplied by the
worker count; the gateway's rate limit is the outer guard.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class FailureLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _trim(self, key: str, now: float) -> deque[float]:
        bucket = self._hits[key]
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        if not bucket:
            self._hits.pop(key, None)
        return bucket

    def blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._trim(key, time.monotonic())) >= self.limit

    def record(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._trim(key, now)
            self._hits[key].append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
