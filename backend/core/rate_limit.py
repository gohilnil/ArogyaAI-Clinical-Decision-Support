"""Per-caller rate limiting for the expensive authenticated endpoint.

Why in-process rather than Redis or another store: this service is a single
container with no external store, and adding one purely to count requests would
be infrastructure the project does not otherwise need. The trade-off is recorded
honestly in SECURITY.md — the counter lives in the process, so if the service is
ever scaled horizontally each instance enforces its own ceiling and the
effective limit multiplies by the instance count.

Why keyed on the caller's uid rather than the source IP: a clinic's staff
commonly share one NAT address, so an IP-keyed limit would let one busy user lock
out their colleagues. The uid is already verified before this runs.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict, Optional

from fastapi import Depends, HTTPException, status

from backend.core.config import RATE_LIMIT_PER_MINUTE
from backend.core.logging import logger
from backend.core.security import require_user

_WINDOW_SECONDS = 60.0

# Bound on tracked callers, so a flood of distinct accounts cannot grow the
# dictionary without limit. Oldest-idle buckets are dropped first.
_MAX_TRACKED_KEYS = 10_000

_lock = threading.Lock()
_hits: Dict[str, Deque[float]] = {}


def _prune(now: float, needed: int = 1) -> None:
    """Keep the caller map bounded before a new key is inserted.

    Expired buckets are removed first, since their contents can no longer affect
    any decision. That alone is not sufficient: many distinct callers arriving
    inside a single window are all still live, so the map would keep growing.
    The least-recently-used buckets are therefore evicted as well.

    Eviction does reset that caller's count, so a deliberate flood of distinct
    accounts can hand a caller back their budget. That is accepted deliberately:
    the alternative is unbounded memory growth, which is the worse failure for a
    public endpoint. The bound is 10k tracked callers, far above real traffic.
    """
    cutoff = now - _WINDOW_SECONDS
    for key in [k for k, b in _hits.items() if not b or b[-1] < cutoff]:
        del _hits[key]

    overflow = len(_hits) - _MAX_TRACKED_KEYS + needed
    if overflow > 0:
        oldest = sorted(
            _hits.items(), key=lambda kv: kv[1][-1] if kv[1] else 0.0
        )
        for key, _ in oldest[:overflow]:
            del _hits[key]


def allow_request(key: str, limit: int, now: Optional[float] = None) -> bool:
    """Record a hit for `key` and report whether it is within `limit` per minute.

    Sliding window: timestamps older than the window are discarded first, so a
    burst at the end of one window cannot combine with a burst at the start of
    the next, which a fixed-window counter would permit.
    """
    now = time.monotonic() if now is None else now
    cutoff = now - _WINDOW_SECONDS

    with _lock:
        bucket = _hits.get(key)
        if bucket is None:
            if len(_hits) >= _MAX_TRACKED_KEYS:
                _prune(now)
            bucket = _hits.setdefault(key, deque())

        while bucket and bucket[0] < cutoff:
            bucket.popleft()

        if len(bucket) >= limit:
            return False

        bucket.append(now)
        return True


def reset() -> None:
    """Forget every counter. Used by tests."""
    with _lock:
        _hits.clear()


def enforce_rate_limit(user: Dict = Depends(require_user)) -> None:
    """FastAPI dependency bounding how often one caller may run an analysis."""
    if RATE_LIMIT_PER_MINUTE <= 0:
        # Explicitly disabled; see AROGYA_RATE_LIMIT_PER_MINUTE.
        return

    key = str(user.get("uid") or "unknown")
    if not allow_request(key, RATE_LIMIT_PER_MINUTE):
        logger.warning("Rate limit exceeded for uid=%s", key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": {
                    "code": "RATE_LIMITED",
                    "message": (
                        "Too many analyses in a short period. "
                        "Please wait a moment and try again."
                    ),
                }
            },
            headers={"Retry-After": "60"},
        )
