# Railway Deployment

## Overview

MemoNext deploys as two Railway services:

| Service | Root Directory | Port | Description |
|---------|----------------|------|-------------|
| **API** | `apps/api` | 8080 | FastAPI backend |
| **Web** | `apps/web` | 3000 | Next.js frontend |

## Setup

### 1. Create Project

1. Go to [Railway](https://railway.app) and create a new project
2. Connect your GitHub repo

### 2. Add PostgreSQL

1. Click **+ New** → **Database** → **PostgreSQL**
2. Railway will provision Postgres and set `DATABASE_URL` automatically
3. Add the Postgres service to your API service (same project): **Variables** → **Add Reference** → select `DATABASE_URL` from Postgres

### 3. Deploy API

1. Click **+ New** → **GitHub Repo** → select your repo
2. Set **Root Directory** to `apps/api`
3. Railway will detect `apps/api/railway.json` and use the Dockerfile
4. Add PostgreSQL: **Variables** → **Add Reference** → `DATABASE_URL`
5. Optionally add `OPENAI_API_KEY` for future LLM features
6. Deploy. Note the public URL (e.g. `https://flashcard-api.up.railway.app`)

### 4. Deploy Web

1. Click **+ New** → **GitHub Repo** → select same repo
2. Set **Root Directory** to `apps/web`
3. Add variable: `NEXT_PUBLIC_API_URL` = your API URL (e.g. `https://flashcard-api.up.railway.app`)
4. **Optional (recommended)**: Add `API_INTERNAL_URL` = `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8080` on the **web** service. Use your **backend** service name (e.g. `api` or `memonext`), NOT the web service name. Must be `http` (not https).
5. **Important**: `NEXT_PUBLIC_*` is baked into the JS bundle at build time. Set before first deploy; redeploy after changing.
6. Deploy. Generate a public domain for the web service.

## Configuration Files

| File | Purpose |
|------|---------|
| `infra/railway.api.json` | API service config (canonical; `apps/api/railway.json` is the active copy) |
| `infra/railway.web.json` | Web service config (canonical; `apps/web/railway.json` is the active copy) |
| `infra/env.example` | Environment variable reference |

## Dockerfiles

- **apps/api/Dockerfile** – Python 3.12, FastAPI, uvicorn. Binds to `::` (IPv6) for Railway private networking.
- **apps/web/Dockerfile** – Node 20, Next.js standalone

## Health Check

The API exposes `GET /health`. Railway uses this for health checks when configured.

## Troubleshooting

- **"Unable to load decks" / API calls to localhost:8080 in production**: The web app was built without `NEXT_PUBLIC_API_URL` set. Fix: Add `NEXT_PUBLIC_API_URL` = your production API URL (e.g. `https://your-api.up.railway.app`) in the web service Variables, then **redeploy** (rebuild). The variable is baked in at build time.
- **API not connecting to DB**: Ensure `DATABASE_URL` is set and referenced from Postgres
- **Web shows 404 for API calls**: Verify `NEXT_PUBLIC_API_URL` matches your API's public URL
- **Build fails**: Run `npm run build` and `docker build` locally to reproduce
- **Private networking fails**: Hit `/api/debug-backend` for detailed diagnostics. Common causes: (1) `API_INTERNAL_URL` not set on web service, (2) wrong service name in `${{SERVICE.RAILWAY_PRIVATE_DOMAIN}}` (use backend name), (3) backend binding to `0.0.0.0` instead of `::` (Railway private net is IPv6)
