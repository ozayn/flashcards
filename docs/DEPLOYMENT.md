# Deployment

## Docker build configuration

This monorepo has two Dockerfiles for the web app. **The build context must match the Dockerfile.**

### Option A: Build from repo root (recommended for Coolify, Metal, etc.)

- **Base Directory**: `.` or empty (repository root) — **do not use `apps/web`**
- **Dockerfile Path**: `Dockerfile`

The root `Dockerfile` copies `apps/web` into the image. This is the correct setup when the platform expects a single Dockerfile at the repo root.

### Option B: Build from apps/web

- **Base Directory**: `apps/web`
- **Dockerfile Path**: `Dockerfile` (must resolve to `apps/web/Dockerfile`, not the root one)

Use `apps/web/Dockerfile`, which expects the build context to be the web app directory.

### Common errors

- **`"/apps/web"` or `"/apps/web/package.json"` not found**: The platform is using the **root** Dockerfile with **apps/web** as the base directory. **Fix: Set Base Directory to the repository root (`.`), not `apps/web`.**
- If Base Directory must stay as `apps/web`, ensure the Dockerfile path explicitly points to `apps/web/Dockerfile` so the platform does not pick up the root `Dockerfile`.
