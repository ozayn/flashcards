"""
Generation lifecycle lines with prefix [MEMO_GEN_LIFECYCLE].

- Normal / success-path: one line to stderr only (no duplicate uvicorn WARNING).
- Problems: single line via logging at WARNING or ERROR (uvicorn typically prints once).

Grep: MEMO_GEN_LIFECYCLE
"""
from __future__ import annotations

import logging
import sys
from typing import Literal

_MEMO_PREFIX = "[MEMO_GEN_LIFECYCLE]"

_Level = Literal["info", "warning", "error"]


def generation_lifecycle_audit(msg: str, *, level: _Level = "info") -> None:
    """Emit one visible line with MEMO prefix."""
    line = f"{_MEMO_PREFIX} {msg}"
    if level == "info":
        print(line, file=sys.stderr, flush=True)
        return
    log = logging.getLogger("uvicorn.error")
    if level == "warning":
        log.warning("%s", line)
    else:
        log.error("%s", line)
