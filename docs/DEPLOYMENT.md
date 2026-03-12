# Deployment

## Docker build configuration

This monorepo has two Dockerfiles for the web app. **The build context must match the Dockerfile.**

### Option A: Build from repo root (recommended)

- **Base Directory**: `.` or empty (repository root)
- **Dockerfile Path**: `Dockerfile`

The root `Dockerfile` copies `apps/web` into the image.

### Option B: Build from apps/web

- **Base Directory**: `apps/web`
- **Dockerfile Path**: `Dockerfile`

Use `apps/web/Dockerfile`, which expects the build context to be the web app directory.

### Common error

If you see `"/apps/web": not found` during build, the platform is using the **root** Dockerfile with **apps/web** as the base directory. Fix by either:

1. Set Base Directory to the repo root (`.`), or
2. Set Base Directory to `apps/web` and ensure the platform uses `apps/web/Dockerfile`
