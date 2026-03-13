# Flashcard AI — LLM Cost Estimates & Multi-Provider Setup

This document records expected LLM costs and how to set up multiple API providers so the application can switch between them. Using several providers reduces cost, increases reliability, and allows us to benefit from free usage tiers.

---

## 1. Estimated Cost Per Generation

Typical flashcard generation request:

- Input tokens: ~200
- Output tokens: ~600
- Total tokens: ~800

### Token Cost Estimate (Open-source LLM hosting)

Approximate price used for estimates:

- $0.10 per 1,000,000 tokens

Cost per generation:

800 tokens = 0.0008M tokens

Cost:

0.0008 × $0.10 = $0.00008

So each generation costs roughly:

**$0.00008 (0.008 cents)**

---

## 2. Estimated Monthly Cost

### Per User

Assume user generates:

20 decks/day

Daily cost:

20 × $0.00008 = $0.0016

Monthly:

**$0.0016 × 30 ≈ $0.05 per user**

---

### If App Grows

| Users | Monthly Cost |
|------|--------------|
| 100 | ~$5 |
| 1,000 | ~$50 |
| 10,000 | ~$500 |

Flashcard generation is therefore a very cheap AI workload.

---

## 3. Abuse Risk (Worst Case)

Without limits a malicious user could script requests.

Example attack:

1000 generations / minute

Daily requests:

1000 × 60 × 24 ≈ 1.4M

Cost:

1.4M × $0.00008 ≈ **$112/day**

Mitigation:

Add rate limits:

- 5 generations / minute
- 30 generations / hour
- 200 generations / day

---

## 4. Multi-Provider Strategy

We use several providers so the system can switch automatically.

Benefits:

- free tiers last longer
- failover protection
- avoid rate limits
- lower cost

Recommended provider order:

1. Groq (primary)
2. Together AI
3. Google Gemini
4. Fireworks
5. DeepInfra

---

## 5. Groq Setup

**Website:** https://console.groq.com

Steps:

1. Create account
2. Create a project
3. Generate API key
4. Copy key

Add to environment file:

```env
# .env
GROQ_API_KEY=your_key_here
```

Example Python usage:

```python
from groq import Groq

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
```

---

## 6. Together AI Setup

**Website:** https://www.together.ai

Steps:

1. Create account
2. Go to API Keys
3. Generate key
4. Copy key

```env
TOGETHER_API_KEY=your_key_here
```

Python example:

```python
from together import Together

client = Together(api_key=os.getenv("TOGETHER_API_KEY"))
```

---

## 7. Google Gemini Setup

**Website:** https://ai.google.dev

Steps:

1. Create Google Cloud project
2. Enable Gemini API
3. Generate API key

```env
GEMINI_API_KEY=your_key_here
```

Python example:

```python
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
```

---

## 8. Fireworks AI Setup

**Website:** https://fireworks.ai

Steps:

1. Create account
2. Create API key
3. Copy key

```env
FIREWORKS_API_KEY=your_key_here
```

---

## 9. DeepInfra Setup

**Website:** https://deepinfra.com

Steps:

1. Create account
2. Generate API key
3. Copy key

```env
DEEPINFRA_API_KEY=your_key_here
```

---

## 10. LLM Router Strategy

The backend should attempt providers in order.

Example pseudocode:

```python
def generate_flashcards(prompt):
    providers = [
        groq_generate,
        together_generate,
        gemini_generate,
        fireworks_generate,
        deepinfra_generate
    ]

    for provider in providers:
        try:
            return provider(prompt)
        except Exception:
            continue

    raise Exception("All providers failed")
```

---

## 11. Environment Variables

All API keys must remain server-side only.

Store in:

```
apps/api/.env
```

Example:

```env
GROQ_API_KEY=
TOGETHER_API_KEY=
GEMINI_API_KEY=
FIREWORKS_API_KEY=
DEEPINFRA_API_KEY=
```

**Never expose keys in frontend code.**

---

## 12. Future Improvements

Later improvements may include:

- automatic load balancing across providers
- cost-based routing
- token monitoring per user
- caching generated flashcards
- daily token limits per user

These changes can reduce AI cost by 50–80% as usage grows.
