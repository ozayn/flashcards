# LLM Module

MemoNext's LLM integration: provider router with fallback, cost tracking, and response caching.

## Overview

| Module | Purpose |
|--------|---------|
| `router.py` | Single entry point for LLM calls. Tries providers in order (Groq → Gemini → OpenRouter → OpenAI) and falls back on failure. |
| `cost_tracker.py` | Logs token usage and estimated API costs per request. |
| `cache.py` | SQLite cache for LLM responses. Returns cached result when the same prompt is requested again. |

## Provider Router

**Fallback order:** Groq → Gemini → OpenRouter → OpenAI (when `OPENAI_ENABLED=1`)

- OpenAI is **disabled by default** (`OPENAI_ENABLED=0`). Set `OPENAI_ENABLED=1` to include it as final fallback.
- Set `LLM_PROVIDER` to try a specific provider first (e.g. `LLM_PROVIDER=gemini`).
- If a provider fails (missing key, API error), the router logs the error and tries the next provider.
- If all fail, raises `RuntimeError("All LLM providers failed")`.

**Usage:** Call `generate_completion(prompt)` from `app.llm.router`. Used by `generation.py` for flashcard creation.

## Cost Tracking

- Logs provider, model, input/output tokens, total tokens, and estimated cost after each LLM call.
- Disable with `LLM_COST_TRACKING=0` in `.env`.
- Cost rates are defined in `cost_tracker.MODEL_COSTS` (cost per token).

**Adding new models:** Add an entry to `MODEL_COSTS` in `cost_tracker.py`:

```python
"model-id": {
    "input": 0.15 / 1_000_000,   # per input token
    "output": 0.60 / 1_000_000,  # per output token
},
```

## Caching

- **Location:** `apps/api/data/llm_cache.db`
- **Key:** SHA256 hash of the prompt
- Identical prompts return the cached response without calling the LLM.

**Clearing the cache:**

```bash
rm apps/api/data/llm_cache.db
```

Or clear only the table:

```bash
sqlite3 apps/api/data/llm_cache.db "DELETE FROM llm_cache;"
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | Preferred provider (groq, gemini, openrouter, openai) | (default order) |
| `LLM_TEMPERATURE` | Sampling temperature | 0.2 |
| `LLM_MAX_TOKENS` | Max tokens per response | 2000 |
| `LLM_COST_TRACKING` | Enable cost logging (1/0) | 1 |
| `GROQ_API_KEY` | Groq API key | — |
| `GROQ_MODEL` | Groq model | llama-3.1-8b-instant |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `OPENAI_MODEL` | OpenAI model | gpt-4o-mini |
| `OPENAI_ENABLED` | Include OpenAI in fallback chain (1=yes, 0=no) | 0 |
| `OPENROUTER_API_KEY` | OpenRouter API key | — |
| `OPENROUTER_MODEL` | OpenRouter model | deepseek/deepseek-chat |
| `GEMINI_API_KEY` | Gemini API key | — |
| `GEMINI_MODEL` | Gemini model | gemini-2.5-flash |

## Safety

- Cache and cost tracking never break generation. All related calls are wrapped in try/except.
- Cache failures log a warning and continue.
- Cost tracking skips logging on error.
