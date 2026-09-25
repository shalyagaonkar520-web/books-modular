"""Small in-memory sliding-window rate limiter for authentication endpoints.

Suitable for a single process. For multi-instance deployments put the limiter
at the reverse proxy (nginx `limit_req`) or use a shared store.
"""

from __future__ import annotations

import ipaddress
import threading
import time
from collections import defaultdict, deque
from functools import lru_cache
from typing import Deque, Dict, Tuple, Union

from fastapi import HTTPException, Request, status

from backend.config import get_settings

IPNetwork = Union[ipaddress.IPv4Network, ipaddress.IPv6Network]


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


class FailureCounter:
    """Counts failed attempts per key (e.g. wrong OTPs per email) in a sliding window.

    Unlike RateLimiter, successful attempts are not counted: callers record a
    failure only when a guess was wrong, and clear the key once it succeeds.
    """

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, bucket: Deque[float], now: float) -> None:
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()

    def is_blocked(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits.get(key)
            if not bucket:
                return False
            self._prune(bucket, now)
            return len(bucket) >= self.limit

    def record_failure(self, key: str) -> bool:
        """Record one failure; True when this failure reached the cap."""
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            self._prune(bucket, now)
            bucket.append(now)
            return len(bucket) >= self.limit

    def clear(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


@lru_cache(maxsize=8)
def _parse_networks(raw: str) -> Tuple[IPNetwork, ...]:
    networks = []
    for part in raw.split(","):
        part = part.strip()
        if part:
            networks.append(ipaddress.ip_network(part, strict=False))
    return tuple(networks)


def _is_trusted(address: str, networks: Tuple[IPNetwork, ...]) -> bool:
    try:
        ip = ipaddress.ip_address(address.strip())
    except ValueError:
        return False
    return any(ip in net for net in networks)


def client_ip(request: Request) -> str:
    """The address rate limits and session records are keyed on.

    X-Forwarded-For is client-controlled, so it is only honoured when the
    direct peer is one of settings.trusted_proxies (e.g. the nginx container).
    Each trusted proxy appends the address it received the request from, so
    the right-most hop that is not itself a trusted proxy is the real client;
    anything further left could have been forged by that client.
    """
    peer = request.client.host if request.client else "unknown"
    networks = _parse_networks(get_settings().trusted_proxies)
    if not networks or not _is_trusted(peer, networks):
        return peer
    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return peer
    for hop in reversed([h.strip() for h in forwarded.split(",") if h.strip()]):
        if not _is_trusted(hop, networks):
            return hop
    return peer
