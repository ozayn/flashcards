"""
Admin API key validation. Header: X-Admin-Api-Key, expected: ADMIN_API_KEY from env.
"""
import logging
import os

from fastapi import Header, HTTPException

ADMIN_HEADER = "x-admin-api-key"
_logger = logging.getLogger(__name__)


async def require_admin_key(
    x_admin_api_key: str | None = Header(None, alias="X-Admin-Api-Key")
) -> None:
    """Dependency: raises 401 if header missing or incorrect."""
    expected = os.environ.get("ADMIN_API_KEY")
    if not expected:
        _logger.warning("Auth rejected: ADMIN_API_KEY not configured")
        raise HTTPException(status_code=500, detail="Admin API key not configured")
    if not x_admin_api_key:
        _logger.warning("Auth rejected: missing header")
        raise HTTPException(status_code=401, detail="Unauthorized")
    if x_admin_api_key != expected:
        _logger.warning("Auth rejected: invalid key")
        raise HTTPException(status_code=401, detail="Unauthorized")
