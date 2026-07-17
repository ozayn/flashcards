"""Lightweight in-process rate limiter for OpenAI TTS.

Not durable across workers/restarts — good enough for v1 accidental-repeat protection.
Replace with Redis/slowapi when MemoNext grows multi-instance.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

_lock = Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def check_sliding_window_rate_limit(
    key: str,
    *,
    max_hits: int,
    window_seconds: float = 60.0,
) -> bool:
    """
    Return True if the request is allowed; False if over the limit.
    Records the hit only when allowed.
    """
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        q = _hits[key]
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= max_hits:
            return False
        q.append(now)
        return True
