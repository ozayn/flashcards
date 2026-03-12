import json
import logging
import re
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.llm.router import generate_flashcards as llm_generate_flashcards
from app.models import Deck, Flashcard
from app.schemas.flashcard import DIFFICULTY_TO_INT
from app.utils.topic_analysis import build_language_instruction

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/generate-flashcards", tags=["generation"])


class GenerateFlashcardsRequest(BaseModel):
    deck_id: UUID = Field(..., description="Deck ID")
    topic: str = Field(..., min_length=1, description="Topic for flashcard generation")
    num_cards: int = Field(default=10, ge=1, le=50, description="Number of cards to generate")
    language: Optional[str] = Field(default="en", description="Output language (ISO 639-1, e.g. en, de, fa)")


class GenerateFlashcardsResponse(BaseModel):
    created: int


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
    if not text:
        return {}
    data = json.loads(text)
    if isinstance(data, list):
        return {"flashcards": data}
    return data if isinstance(data, dict) else {}


def _extract_concepts(topic: str, language_hint: Optional[str] = None) -> list:
    """Stage 1: Extract key concepts from the topic using LLM."""
    lang_instruction = build_language_instruction(topic, language_hint)
    prompt = f"""You are identifying key learning concepts.

Topic:
{topic}

{lang_instruction}

Extract 5–10 important words, terms, or concepts related to the topic.

Return STRICT JSON:

{{
  "concepts": ["...", "...", "..."]
}}

Rules:
- Concepts must be specific terms
- Avoid general descriptions
- Concepts must be in the same language as the topic"""

    try:
        response_text = llm_generate_flashcards(prompt)
    except ValueError as e:
        logger.warning("Concept extraction failed, falling back to topic: %s", e)
        return []

    try:
        parsed = _extract_json(response_text)
        concepts = parsed.get("concepts", [])
        if isinstance(concepts, list) and all(isinstance(c, str) for c in concepts):
            return concepts[:10]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


def _generate_flashcards_from_concepts(concepts: list, topic: str, language_hint: Optional[str] = None) -> str:
    """Stage 2: Generate flashcards from concepts using LLM."""
    concept_list = "\n".join(f"- {c}" for c in concepts)
    lang_instruction = build_language_instruction(topic, language_hint)
    prompt = f"""You are generating flashcards.

Concepts:
{concept_list}

{lang_instruction}

Generate one flashcard per concept.

For each flashcard:
- Question: Ask for the meaning or explanation of the concept.
- Answer: Provide a clear definition.

Return STRICT JSON only.

{{
  "flashcards": [
    {{
      "question": "...",
      "answer_short": "...",
      "answer_detailed": "...",
      "difficulty": "easy"
    }}
  ]
}}

Rules:
- One flashcard per concept.
- Do not include explanations outside JSON.
- Ensure answers are correct and educational."""

    return llm_generate_flashcards(prompt)


@router.post("", response_model=GenerateFlashcardsResponse)
async def generate_flashcards(
    payload: GenerateFlashcardsRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate flashcards using configured LLM provider."""
    deck_id_str = str(payload.deck_id)
    result = await db.execute(select(Deck).where(Deck.id == deck_id_str))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    # Stage 1: Extract concepts from topic
    lang_hint = (payload.language or "").strip().lower()[:2] or None
    concepts = _extract_concepts(payload.topic, lang_hint)

    # Stage 2: Generate flashcards from concepts (or fallback to topic if extraction failed)
    if concepts:
        try:
            response_text = _generate_flashcards_from_concepts(concepts, payload.topic, lang_hint)
        except ValueError as e:
            raise HTTPException(status_code=503, detail=str(e))
    else:
        # Fallback: single-stage generation when concept extraction fails
        lang_instruction = build_language_instruction(payload.topic, lang_hint)
        fallback_prompt = f"""You are an expert educator creating high-quality flashcards.

Topic:
{payload.topic}

{lang_instruction}

Flashcard Rules:
- Each flashcard must focus on ONE concept.
- Questions should be clear and concise.
- Answers should be short and easy to memorize.
- Avoid vague or philosophical questions.

Vocabulary Topics:
If the topic appears to be vocabulary, slang, or terminology:
- Each flashcard should explain a specific word or phrase.
- The question should ask for the meaning of the word.
- The answer should define it clearly.

Output Format:
Return STRICT JSON only.

{{
  "flashcards": [
    {{
      "question": "...",
      "answer_short": "...",
      "answer_detailed": "...",
      "difficulty": "easy"
    }}
  ]
}}

Additional Rules:
- Generate between 5 and 10 flashcards.
- Do not include explanations outside JSON.
- Ensure answers are correct and educational."""

        try:
            response_text = llm_generate_flashcards(fallback_prompt)
        except ValueError as e:
            raise HTTPException(status_code=503, detail=str(e))

    try:
        parsed_json = _extract_json(response_text)
    except json.JSONDecodeError as e:
        logger.exception("Failed to parse LLM response as JSON: %s", e)
        raise HTTPException(
            status_code=502,
            detail="Failed to parse LLM response as JSON",
        )

    cards: list = parsed_json.get("flashcards", [])
    print("Generated cards:", cards)
    logger.info("Generated cards: %s", cards)

    created = 0
    for raw_card in cards:
        if not isinstance(raw_card, dict):
            logger.warning("Skipping invalid card (not a dict): %s", raw_card)
            continue

        # Read question, answer_short, answer_detailed, difficulty (fallback: front/back)
        question = raw_card.get("question") or raw_card.get("front")
        answer_short = raw_card.get("answer_short") or raw_card.get("back") or raw_card.get("answer")

        if not question or not answer_short:
            logger.warning(
                "Skipping card missing required fields (question/front, answer_short/back): %s",
                raw_card,
            )
            continue

        answer_detailed = raw_card.get("answer_detailed")
        difficulty_str = raw_card.get("difficulty", "medium")
        if difficulty_str not in DIFFICULTY_TO_INT:
            difficulty_str = "medium"
        difficulty = DIFFICULTY_TO_INT[difficulty_str]

        result = await db.execute(
            select(Flashcard).where(
                Flashcard.deck_id == deck_id_str,
                Flashcard.question == question,
            )
        )
        existing = result.scalar_one_or_none()
        if not existing:
            flashcard = Flashcard(
                deck_id=deck_id_str,
                question=str(question)[:10000],
                answer_short=str(answer_short)[:1000],
                answer_detailed=(str(answer_detailed)[:10000] if answer_detailed else None),
                difficulty=difficulty,
            )
            db.add(flashcard)
            created += 1

    await db.flush()

    return GenerateFlashcardsResponse(created=created)
