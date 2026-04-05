"""Parse YOUTUBE_PROXY_URL + YOUTUBE_PROXY_URLS for shared media fetch (YouTube transcripts, webpage fallback)."""

from __future__ import annotations

import os
import re

_SPLIT_RE = re.compile(r"[\n|,]+")


def parse_generic_proxy_url_list() -> list[str]:
    """
    Ordered list of generic proxy URLs: YOUTUBE_PROXY_URL first, then entries from
    YOUTUBE_PROXY_URLS (comma, pipe, or newline separated). De-duplicated, order preserved.
    """
    seen: set[str] = set()
    out: list[str] = []
    single = os.environ.get("YOUTUBE_PROXY_URL", "").strip()
    if single:
        seen.add(single)
        out.append(single)
    raw_multi = os.environ.get("YOUTUBE_PROXY_URLS", "").strip()
    if raw_multi:
        for part in _SPLIT_RE.split(raw_multi):
            u = part.strip()
            if not u or u in seen:
                continue
            seen.add(u)
            out.append(u)
    return out
