# Deployment

## Railway (default)

Railway uses **Root Directory** per service. No build args needed.

- **Web**: Root Directory = `apps/web`, uses `apps/web/Dockerfile`
- **API**: Root Directory = `apps/api`, uses `apps/api/Dockerfile`

### OpenAI text-to-speech (optional)

Set these on the **API** Railway service (never on Web — the key must stay server-side):

- `OPENAI_API_KEY` — required for OpenAI voice
- `OPENAI_TTS_MODEL` — optional, default `gpt-4o-mini-tts`
- `OPENAI_TTS_DEFAULT_VOICE` — optional, default `fable`
- `OPENAI_TTS_ENABLED=0` — optional hard disable even when a key is present
- `FLASHCARD_TTS_CACHE_DIR` — optional MP3 cache directory (defaults under the API data dir)

Locally, set the same vars in `apps/api/.env` (see `apps/api/.env.example`).

## Other platforms (Coolify, Metal, etc.)

When Base Directory differs from the above, use the root `Dockerfile` with `BUILD_CONTEXT`:

**Web** (Base Directory = `apps/web`): Add build arg `BUILD_CONTEXT=.`  
**API** (Base Directory = repo root): Use `apps/api/Dockerfile` with Root Directory = `apps/api`
