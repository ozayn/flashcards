"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  flashcardSpeechStore,
  isFlashcardSpeechAvailable,
  type EnglishTtsPreference,
  type VoiceStylePreference,
  speakOrToggle,
} from "@/lib/flashcard-speech";
import type { ReadAloudProvider } from "@/lib/openai-tts-config";

export function FlashcardSpeakButton({
  utteranceKey,
  text,
  className,
  "aria-label": ariaLabel,
  englishTts = "default",
  voiceStyle = "default",
  speechVoiceKey,
  provider = "browser",
  openaiVoice,
  openaiSpeed,
}: {
  utteranceKey: string;
  text: string;
  "aria-label": string;
  className?: string;
  /** User setting: English read-aloud accent. Other languages ignore this. */
  englishTts?: EnglishTtsPreference;
  /** Best-effort voice gender hint from voice names; other languages use when possible. */
  voiceStyle?: VoiceStylePreference;
  /** If set, overrides heuristics when the voice is available on this device. */
  speechVoiceKey?: string;
  provider?: ReadAloudProvider;
  openaiVoice?: string;
  openaiSpeed?: number;
}) {
  const [apiOk, setApiOk] = useState(false);
  const playingKey = useSyncExternalStore(
    flashcardSpeechStore.subscribe,
    flashcardSpeechStore.getSnapshot,
    flashcardSpeechStore.getServerSnapshot
  );
  const isPlaying = playingKey === utteranceKey;

  useEffect(() => {
    setApiOk(isFlashcardSpeechAvailable(provider));
  }, [provider]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      speakOrToggle(utteranceKey, text, {
        englishTts,
        voiceStyle,
        speechVoiceKey: speechVoiceKey?.trim() || undefined,
        provider,
        openaiVoice,
        openaiSpeed,
      });
    },
    [englishTts, voiceStyle, speechVoiceKey, utteranceKey, text, provider, openaiVoice, openaiSpeed]
  );

  if (!apiOk) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/70",
        isPlaying && "text-foreground",
        className
      )}
      aria-label={ariaLabel}
      aria-pressed={isPlaying}
      onClick={onClick}
    >
      <Volume2 className={cn("size-3.5", isPlaying && "opacity-100", !isPlaying && "opacity-80")} />
    </Button>
  );
}
