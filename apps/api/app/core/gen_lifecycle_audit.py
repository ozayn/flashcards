"""
Always-visible generation lifecycle lines: stderr + uvicorn.error WARNING.

Used by app.api.generation and app.llm.router so routing and provider attempts
are not lost when app.* log levels are misconfigured.
"""
from __future__ import annotations

import logging
import sys

_MEMO_PREFIX = "[MEMO_GEN_LIFECYCLE]"


def generation_lifecycle_audit(msg: str) -> None:
    """Single line; grep MEMO_GEN_LIFECYCLE."""
    line = f"{_MEMO_PREFIX} {msg}"
    print(line, file=sys.stderr, flush=True)
    logging.getLogger("uvicorn.error").warning("%s", line)
