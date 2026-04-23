"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  READ_SLIDESHOW_GAP_MS,
  cancelAllFlashcardSpeech,
  playReadCardOnceForAutoplay,
  type EnglishTtsPreference,
  type VoiceStylePreference,
} from "@/lib/flashcard-speech";

export type ReadAutoplayState = "off" | "running" | "paused";

export type ReadAutoplayCard = {
  id: string;
  question: string;
  /** Same as `buildAnswerSpeechText(...)` for the card. */
  answerSpeech: string;
};

type UseReadTabAutoplayArgs = {
  readView: boolean;
  sessionPrefix: string;
  cards: ReadAutoplayCard[];
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  englishTts: EnglishTtsPreference;
  voiceStyle: VoiceStylePreference;
};

/**
 * Read-tab slideshow: for each card, TTS (Q → pause → A), then gap, then next card
 * until the last card. Pause / stop / tab leave / single-card TTS cancels safely.
 */
export function useReadTabAutoplay({
  readView,
  sessionPrefix: _sessionPrefix,
  cards,
  currentIndex,
  setCurrentIndex,
  englishTts,
  voiceStyle,
}: UseReadTabAutoplayArgs) {
  const [state, setState] = useState<ReadAutoplayState>("off");
  const runIdRef = useRef(0);
  const cardsRef = useRef(cards);
  const pauseForResumeRef = useRef(false);
  const resumeWaiterRef = useRef<(() => void) | null>(null);
  const gapCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const clearGap = useCallback(() => {
    gapCancelRef.current?.();
    gapCancelRef.current = null;
  }, []);

  const waitResume = useCallback(() => {
    return new Promise<void>((res) => {
      resumeWaiterRef.current = () => {
        resumeWaiterRef.current = null;
        res();
      };
    });
  }, []);

  const sleepWithGap = useCallback((ms: number) => {
    return new Promise<boolean>((resolve) => {
      const tid = window.setTimeout(() => {
        gapCancelRef.current = null;
        resolve(true);
      }, ms);
      gapCancelRef.current = () => {
        window.clearTimeout(tid);
        gapCancelRef.current = null;
        resolve(false);
      };
    });
  }, []);

  const runLoop = useCallback(
    async (startIndex: number, myRun: number) => {
      const n = cardsRef.current.length;
      let i = startIndex;
      while (i < n) {
        if (runIdRef.current !== myRun) return;

        setCurrentIndex(i);
        const card = cardsRef.current[i];
        if (!card) {
          setState("off");
          return;
        }

        const r = await playReadCardOnceForAutoplay(
          card.question,
          card.answerSpeech,
          { englishTts, voiceStyle }
        );
        if (runIdRef.current !== myRun) return;

        if (r === "aborted") {
          if (pauseForResumeRef.current) {
            pauseForResumeRef.current = false;
            setState("paused");
            await waitResume();
            if (runIdRef.current !== myRun) return;
            continue;
          }
          setState("off");
          return;
        }

        if (i >= n - 1) {
          setState("off");
          return;
        }

        const gapOk = await sleepWithGap(READ_SLIDESHOW_GAP_MS);
        if (runIdRef.current !== myRun) return;

        if (!gapOk) {
          if (pauseForResumeRef.current) {
            pauseForResumeRef.current = false;
            setState("paused");
            await waitResume();
            if (runIdRef.current !== myRun) return;
            /* Gap was for after finishing card i; move on to the next. */
            i += 1;
            continue;
          }
          setState("off");
          return;
        }

        i += 1;
      }
      if (runIdRef.current === myRun) {
        setState("off");
      }
    },
    [englishTts, setCurrentIndex, sleepWithGap, voiceStyle, waitResume]
  );

  const stop = useCallback(() => {
    runIdRef.current += 1;
    pauseForResumeRef.current = false;
    clearGap();
    cancelAllFlashcardSpeech();
    setState("off");
  }, [clearGap]);

  const start = useCallback(() => {
    runIdRef.current += 1;
    const myRun = runIdRef.current;
    clearGap();
    cancelAllFlashcardSpeech();
    setState("running");
    void runLoop(currentIndex, myRun);
  }, [clearGap, currentIndex, runLoop]);

  const pause = useCallback(() => {
    if (state !== "running") return;
    pauseForResumeRef.current = true;
    clearGap();
    cancelAllFlashcardSpeech();
  }, [clearGap, state]);

  const resume = useCallback(() => {
    if (state !== "paused") return;
    setState("running");
    resumeWaiterRef.current?.();
  }, [state]);

  useEffect(() => {
    if (!readView) {
      stop();
    }
  }, [readView, stop]);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      gapCancelRef.current?.();
      gapCancelRef.current = null;
      cancelAllFlashcardSpeech();
    };
  }, []);

  return { state, start, stop, pause, resume };
}