"""
Rate limiting placeholder for generation and other abuse-prone endpoints.

TODO: Implement full rate limiting:
- Limit generation requests per user/IP (e.g. 10/minute, 50/hour)
- Return 429 Too Many Requests when exceeded
- Integrate with FastAPI middleware or dependency injection
- Consider using slowapi or similar library

Example integration:
    from app.utils.rate_limit import check_rate_limit
    @router.post("")
    async def generate_flashcards(...):
        await check_rate_limit(request)  # raises 429 if exceeded
        ...
"""

# Placeholder - no-op for now
async def check_rate_limit(identifier: str) -> None:
    """Placeholder: no-op. Replace with actual rate limit check."""
    pass
