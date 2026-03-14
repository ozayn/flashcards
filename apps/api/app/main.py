from pathlib import Path

# Load .env first (before other imports that may read env)
for env_path in [
    Path(__file__).resolve().parent.parent / ".env",  # apps/api/.env
    Path(__file__).resolve().parent / ".env",          # apps/api/app/.env
]:
    if env_path.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path)
        except ImportError:
            pass
        break

import hashlib
import hmac
import os

from fastapi import Depends, Form, Request, FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api import generation, health, decks, users, flashcards, reviews, categories
from app.core.database import engine, Base
from app.core.init_db import init_db
from app.core.auth import require_admin_key
from app.models import User, Deck, Flashcard, Review  # noqa: F401 - register models

_is_production = os.environ.get("ENVIRONMENT", "development").lower() == "production"

app = FastAPI(
    title="MemoNext API",
    description="MemoNext — Turn information into memory. AI Flashcard Learning Platform API",
    version="0.1.0",
)

# Protect docs in production: require X-Admin-Api-Key (header) or docs_token (cookie). No query param (leaks via URL).
def _is_docs_path(path: str) -> bool:
    return path == "/openapi.json" or path.startswith("/docs") or path.startswith("/redoc")


def _docs_token(expected: str) -> str:
    return hmac.new(expected.encode(), b"docs_access", hashlib.sha256).hexdigest()


def _verify_docs_auth(request, expected: str) -> bool:
    """Return True if request has valid admin auth (header or cookie)."""
    key = request.headers.get("x-admin-api-key") or request.headers.get("X-Admin-Api-Key")
    if key and hmac.compare_digest(key, expected):
        return True
    cookie = request.cookies.get("docs_token")
    if cookie and hmac.compare_digest(cookie, _docs_token(expected)):
        return True
    return False


def _set_docs_cookie(response, expected: str) -> None:
    token = _docs_token(expected)
    response.set_cookie(
        key="docs_token",
        value=token,
        httponly=True,
        secure=_is_production,
        samesite="lax",
        max_age=3600,
    )


async def _docs_protection_middleware(request, call_next):
    if not _is_production:
        return await call_next(request)
    if not _is_docs_path(request.url.path):
        return await call_next(request)
    expected = os.environ.get("ADMIN_API_KEY")
    if not expected:
        return JSONResponse(status_code=500, content={"detail": "Admin API key not configured"})
    if not _verify_docs_auth(request, expected):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    response = await call_next(request)
    # Set cookie when auth via header so Swagger UI's fetch of /openapi.json succeeds
    key = request.headers.get("x-admin-api-key") or request.headers.get("X-Admin-Api-Key")
    if key and hmac.compare_digest(key, expected):
        _set_docs_cookie(response, expected)
    return response


from starlette.middleware.base import BaseHTTPMiddleware

# Add docs protection first (innermost), then CORS (outermost so 401 responses get CORS headers)
app.add_middleware(BaseHTTPMiddleware, dispatch=_docs_protection_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(categories.router)
app.include_router(decks.router)
app.include_router(users.router)
app.include_router(flashcards.router)
app.include_router(generation.router)
app.include_router(reviews.router)


@app.get("/")
async def root():
    return {"message": "Flashcard API is running"}


_DOCS_AUTH_FORM = """
<!DOCTYPE html>
<html><head><title>API Docs Login</title></head>
<body>
  <h1>API Documentation</h1>
  <p>Enter admin key to access docs:</p>
  <form method="post" action="/docs-auth">
    <input type="password" name="admin_key" placeholder="Admin API Key" autofocus />
    <button type="submit">Continue to Docs</button>
  </form>
</body></html>
"""


@app.get("/docs-auth", response_class=HTMLResponse)
async def docs_auth_get(request: Request):
    """Bootstrap route for browser docs: header auth or show login form."""
    if not _is_production:
        return RedirectResponse(url="/docs", status_code=302)
    expected = os.environ.get("ADMIN_API_KEY")
    if not expected:
        return JSONResponse(status_code=500, content={"detail": "Admin API key not configured"})
    key = request.headers.get("x-admin-api-key") or request.headers.get("X-Admin-Api-Key")
    if key and hmac.compare_digest(key, expected):
        response = RedirectResponse(url="/docs", status_code=302)
        _set_docs_cookie(response, expected)
        return response
    return HTMLResponse(content=_DOCS_AUTH_FORM)


@app.post("/docs-auth")
async def docs_auth_post(admin_key: str = Form(..., alias="admin_key")):
    """Bootstrap route: POST with admin_key in form body, sets cookie, redirects to /docs."""
    if not _is_production:
        return RedirectResponse(url="/docs", status_code=302)
    expected = os.environ.get("ADMIN_API_KEY")
    if not expected:
        return JSONResponse(status_code=500, content={"detail": "Admin API key not configured"})
    if hmac.compare_digest(admin_key, expected):
        response = RedirectResponse(url="/docs", status_code=302)
        _set_docs_cookie(response, expected)
        return response
    return JSONResponse(status_code=401, content={"detail": "Unauthorized"})


@app.get("/protected-ping", dependencies=[Depends(require_admin_key)])
async def protected_ping():
    """Test route: requires X-Admin-Api-Key header. Returns 200 if valid."""
    return {"message": "pong", "protected": True}


@app.on_event("startup")
async def startup():
    try:
        await init_db()
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").warning(
            f"Database setup skipped (connect to PostgreSQL to enable): {e}"
        )
