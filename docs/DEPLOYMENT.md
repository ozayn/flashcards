# Deployment

## Railway (default)

Railway uses **Root Directory** per service. No build args needed.

- **Web**: Root Directory = `apps/web`, uses `apps/web/Dockerfile`
- **API**: Root Directory = `apps/api`, uses `apps/api/Dockerfile`

### OpenAI text-to-speech (optional, product-admin only)

Set these on the **API** Railway service (never on Web — the key must stay server-side):

- `OPENAI_API_KEY` — required for OpenAI voice
- `OPENAI_TTS_MODEL` — optional, default `gpt-4o-mini-tts`
- `OPENAI_TTS_DEFAULT_VOICE` / `OPENAI_TTS_VOICE` — optional, default `cedar`
- `OPENAI_TTS_INSTRUCTIONS` — optional delivery style for gpt-4o-mini-tts
- `OPENAI_TTS_ENABLED=0` — optional hard disable even when a key is present
- `FLASHCARD_TTS_CACHE_DIR` — optional MP3 cache directory
- `PRODUCT_ADMIN_EMAILS` — who may use OpenAI TTS (plus role=admin / name Azin)

On **Web**, set `NEXT_PUBLIC_PRODUCT_ADMIN_EMAILS` to the same emails so Profile can show the OpenAI option.

Locally, set the same vars in `apps/api/.env` / `apps/web/.env.local` (see `.env.example` files).
Restart the API after changing keys.

## Other platforms (Coolify, Metal, etc.)

When Base Directory differs from the above, use the root `Dockerfile` with `BUILD_CONTEXT`:

**Web** (Base Directory = `apps/web`): Add build arg `BUILD_CONTEXT=.`  
**API** (Base Directory = repo root): Use `apps/api/Dockerfile` with Root Directory = `apps/api`
