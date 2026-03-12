# Deployment

## Railway (default)

Railway uses **Root Directory** per service. No build args needed.

- **Web**: Root Directory = `apps/web`, uses `apps/web/Dockerfile`
- **API**: Root Directory = `apps/api`, uses `apps/api/Dockerfile`

## Other platforms (Coolify, Metal, etc.)

When Base Directory differs from the above, use the root `Dockerfile` with `BUILD_CONTEXT`:

**Web** (Base Directory = `apps/web`): Add build arg `BUILD_CONTEXT=.`  
**API** (Base Directory = repo root): Use `apps/api/Dockerfile` with Root Directory = `apps/api`
