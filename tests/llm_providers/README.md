# LLM Provider Tests

Standalone scripts to verify API keys, connectivity, and response format for each LLM provider. These tests do **not** depend on the MemoNext backend.

## Environment Variables

All tests load from `apps/api/.env` if present.

| Variable | Provider | Required | Default |
|----------|----------|----------|---------|
| `GROQ_API_KEY` | Groq | Yes | - |
| `GROQ_MODEL` | Groq | No | `llama-3.1-8b-instant` |
| `OPENAI_API_KEY` | OpenAI | Yes | - |
| `OPENAI_MODEL` | OpenAI | No | `gpt-4o-mini` |
| `OPENROUTER_API_KEY` | OpenRouter | Yes | - |
| `OPENROUTER_MODEL` | OpenRouter | No | `openai/gpt-3.5-turbo` |
| `TOGETHER_API_KEY` | Together AI | Yes | - |
| `TOGETHER_MODEL` | Together AI | No | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` |
| `GEMINI_API_KEY` | Gemini | Yes | - |
| `GEMINI_MODEL` | Gemini | No | `gemini-2.5-flash` |
| `OLLAMA_BASE_URL` | Ollama | No | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama | No | `llama3.2` |
| `LLM_TEMPERATURE` | All | No | `0.3` |
| `LLM_MAX_TOKENS` | All (except Ollama) | No | - |

## Run Individual Tests

From the project root:

```bash
# Groq
GROQ_API_KEY=your_key python tests/llm_providers/test_groq.py

# OpenAI
OPENAI_API_KEY=your_key python tests/llm_providers/test_openai.py

# OpenRouter
OPENROUTER_API_KEY=your_key python tests/llm_providers/test_openrouter.py

# Together AI
TOGETHER_API_KEY=your_key python tests/llm_providers/test_together.py

# Gemini
GEMINI_API_KEY=your_key python tests/llm_providers/test_gemini.py

# Ollama (local - no key needed if running on localhost:11434)
python tests/llm_providers/test_ollama.py
```

Or set variables in `.env` and run:

```bash
cd apps/api && source .venv313/bin/activate  # or your venv
export $(grep -v '^#' .env | xargs)
python ../../tests/llm_providers/test_groq.py
```

## Run Full Test Suite

```bash
python tests/llm_providers/run_all_tests.py
```

## Run Benchmark

Compare latency and response length across all configured providers:

```bash
python tests/llm_providers/benchmark_models.py
```

Output includes per-provider results and a summary table. Providers without API keys are skipped.

The runner:
- Detects which API keys are set
- Runs only tests for available providers
- Skips providers without keys
- Prints a summary (OK / FAILED / SKIPPED)

Example output:

```
Provider tests
----------------------------------------
Groq ........ OK
OpenAI ...... OK
OpenRouter .. SKIPPED (no key)
Gemini ...... OK
Ollama ...... OK
```

## Dependencies

Install before running:

```bash
pip install groq openai requests
```

- **Groq**: `groq`
- **OpenAI**: `openai`
- **OpenRouter, Together, Ollama**: `requests`

## Test Prompt

All providers use the same prompt:

> Return a JSON object with one flashcard about Jupiter (Roman god).

Expected format: `{"question": "...", "answer": "..."}`

## Output Format

Each test prints:

```
Provider: <name>
Model: <model>
Latency: X.XX seconds

Response:
{ ... }
```

Tests also measure latency and safely handle empty responses (with a warning).

## Known Issues

- **Together AI (401 Unauthorized):** `test_together.py` may return 401 even with a valid-looking API key. Possible causes: expired/revoked key, account has no billing credits (read-only mode), or key format mismatch. If the response contains "read-only mode", the test prints a friendly message instead of failing. Verify the key at [api.together.xyz](https://api.together.xyz) and regenerate if needed.
