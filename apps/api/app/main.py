from pathlib import Path

# Load .env first (before other imports that may read env).
# Load ALL existing candidates in order; later files override earlier keys (e.g. app/.env over api/.env).
LOADED_ENV_FILES: list[str] = []
_env_candidates = [
    Path(__file__).resolve().parent.parent / ".env",  # apps/api/.env
    Path(__file__).resolve().parent / ".env",  # apps/api/app/.env
]
try:
    from dotenv import load_dotenv

    for env_path in _env_candidates:
        if env_path.exists():
            load_dotenv(env_path, override=True)
            LOADED_ENV_FILES.append(str(env_path.resolve()))
except ImportError:
    pass

# Allowlist is LRU-cached; ensure first read sees env loaded above (fresh workers clear cache anyway).
try:
    from app.core.login_email_allowlist import clear_login_email_allowlist_cache

    clear_login_email_allowlist_cache()
except Exception:
    pass

import hashlib
import hmac
import os

from fastapi import Depends, Form, Request, FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    admin,
    generation,
    health,
    decks,
    users,
    flashcards,
    reviews,
    categories,
    youtube,
    webpage,
    flashcard_images,
    study_ideas,
)
from app.core.database import engine, Base
from app.core.init_db import init_db
from app.core.auth import require_admin_key
from app.core.dev_logging import attach_dev_access_log_filter
from app.llm.direct_outbound import log_llm_outbound_isolation_once
from app.models import (  # noqa: F401 - register models
    User,
    Deck,
    Flashcard,
    Review,
    FlashcardBookmark,
    StudyIdea,
)

_is_production = os.environ.get("ENVIRONMENT", "development").lower() == "production"


def _configure_application_loggers() -> None:
    """Ensure app.* loggers emit at INFO (or LOG_LEVEL) so lifecycle logs are visible.

    Uvicorn configures its own loggers; without an explicit level, the root logger
    can remain WARNING and drop app.api.generation INFO lines.
    """
    import logging

    raw = (os.environ.get("LOG_LEVEL") or "INFO").strip().upper()
    level = getattr(logging, raw, None)
    if not isinstance(level, int):
        level = logging.INFO
    logging.getLogger("app").setLevel(level)
    # LLM router is under app.llm
    logging.getLogger("app.llm").setLevel(level)

# If no .env file was loaded, treat process env as "configured" when any of these are set
# (typical for Railway/Fly/Docker). Used only for startup logging — not validation.
_ENV_CONFIG_SIGNAL_KEYS = (
    "DATABASE_URL",
    "GROQ_API_KEY",
    "GEMINI_API_KEY",
    "YOUTUBE_PROXY_URL",
    "YOUTUBE_PROXY_URLS",
    "OPENAI_API_KEY",
    "WEBSHARE_PROXY_USER",
    "WEBSHARE_PROXY_PW",
    "MEMO_OAUTH_SYNC_SECRET",
    "ADMIN_API_KEY",
)


def _process_env_has_config_signals() -> bool:
    return any((os.environ.get(k) or "").strip() for k in _ENV_CONFIG_SIGNAL_KEYS)


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
app.include_router(study_ideas.router)
app.include_router(decks.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(flashcards.router)
app.include_router(flashcard_images.router)
app.include_router(generation.router)
app.include_router(reviews.router)
app.include_router(youtube.router)
app.include_router(webpage.router)


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
    import logging

    _configure_application_loggers()
    attach_dev_access_log_filter()

    log = logging.getLogger("uvicorn.error")
    if LOADED_ENV_FILES:
        log.info("Env files loaded (later overrides earlier): %s", LOADED_ENV_FILES)
    elif _process_env_has_config_signals():
        log.info(
            "No local .env file found under apps/api/.env or apps/api/app/.env; "
            "using process environment (normal for containers and hosted deployments)."
        )
    else:
        log.warning(
            "No .env file on disk and no recognized config in process environment "
            "(expected at least one of: DATABASE_URL, LLM keys, YOUTUBE/WEBSHARE proxy, "
            "MEMO_OAUTH_SYNC_SECRET, ADMIN_API_KEY). "
            "Set variables in the platform environment or create apps/api/.env."
        )

    try:
        await init_db()
    except Exception as e:
        log.warning(f"Database setup skipped (connect to PostgreSQL to enable): {e}")

    try:
        log_llm_outbound_isolation_once()
        youtube.reload_proxy_config_from_env()
        webpage.log_webpage_proxy_status()
        youtube.schedule_proxy_egress_verification_after_startup()
    except Exception:
        log.exception("YouTube proxy setup or egress verification crashed during startup")
