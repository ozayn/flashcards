import os

from . import groq_provider, local_provider, openai_provider

DEFAULT_PROVIDER = os.getenv("LLM_PROVIDER", "groq")


def generate_flashcards(prompt: str, provider: str | None = None) -> str:
    provider = provider or DEFAULT_PROVIDER

    if provider == "groq":
        return groq_provider.generate_flashcards(prompt)

    if provider == "openai":
        return openai_provider.generate_flashcards(prompt)

    if provider == "local":
        return local_provider.generate_flashcards(prompt)

    raise ValueError(f"Unknown LLM provider: {provider}")
