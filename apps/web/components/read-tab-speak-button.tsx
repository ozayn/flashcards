"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  flashcardSpeechStore,
  isSpeechSynthesisAvailable,
  type EnglishTtsPreference,
  type VoiceStylePreference,
  speakOrToggleReadCard,
} from "@/lib/flashcard-speech";

type ReadTabSpeakButtonProps = {
  /** Unique per card+context (e.g. study read tab). Toggling this key while playing stops. */
  utteranceKey: string;
  question: string;
  /** Full answer speech (short + example + optional detailed), same as separate answer control used. */
  answer: string;
  className?: string;
  englishTts?: EnglishTtsPreference;
  voiceStyle?: VoiceStylePreference;
};

/**
 * One speaker control for the Read tab: question, brief pause, then answer (in sequence).
 */
export function ReadTabSpeakButton({
  utteranceKey,
  question,
  answer,
  className,
  englishTts = "default",
  voiceStyle = "default",
}: ReadTabSpeakButtonProps) {
  const [apiOk, setApiOk] = useState(false);
  const playingKey = useSyncExternalStore(
    flashcardSpeechStore.subscribe,
    flashcardSpeechStore.getSnapshot,
    flashcardSpeechStore.getServerSnapshot
  );
  const isPlaying = playingKey === utteranceKey;

  useEffect(() => {
    setApiOk(isSpeechSynthesisAvailable());
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      speakOrToggleReadCard(utteranceKey, question, answer, { englishTts, voiceStyle });
    },
    [answer, englishTts, question, utteranceKey, voiceStyle]
  );

  if (!apiOk) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/70",
        isPlaying && "text-foreground ring-1 ring-foreground/15 bg-muted/50",
        className
      )}
      aria-label="Read card aloud"
      aria-pressed={isPlaying}
      onClick={onClick}
    >
      <Volume2
        className={cn("size-3.5", isPlaying ? "text-foreground" : "opacity-80")}
        aria-hidden
      />
    </Button>
  );
}
