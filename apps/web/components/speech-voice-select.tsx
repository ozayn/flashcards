"use client";

import { useMemo } from "react";
import { getSpeechVoiceKey } from "@/lib/flashcard-speech";
import { useSpeechSynthesisVoices } from "@/hooks/use-speech-synthesis-voices";
import { cn } from "@/lib/utils";

type SpeechVoiceSelectProps = {
  /** Stored `getSpeechVoiceKey`; empty string = automatic selection. */
  value: string;
  onChange: (speechVoiceKey: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
};

/**
 * Local browser / OS voices for Web Speech API (device-specific list).
 */
export function SpeechVoiceSelect({ value, onChange, className, id, disabled }: SpeechVoiceSelectProps) {
  const list = useSpeechSynthesisVoices();
  const sorted = useMemo(
    () => [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [list]
  );

  const hasSavedOnDevice = useMemo(() => {
    if (!value.trim()) return true;
    return sorted.some((v) => getSpeechVoiceKey(v) === value);
  }, [value, sorted]);

  const displayValue = hasSavedOnDevice ? (value || "") : "";

  return (
    <div className="space-y-1">
      <select
        id={id}
        className={cn(
          "w-full max-w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm",
          className
        )}
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Speaking voice for read aloud"
      >
        <option value="">Auto (use accent and language preferences)</option>
        {sorted.map((v) => {
          const k = getSpeechVoiceKey(v);
          const lab = v.lang && v.lang.trim() ? `${v.name} (${v.lang})` : v.name;
          return (
            <option key={k} value={k}>
              {lab}
            </option>
          );
        })}
      </select>
      {value && !hasSavedOnDevice ? (
        <p className="text-[11px] leading-snug text-amber-700/90 dark:text-amber-400/90">
          Your saved voice is not available in this browser. Automatic selection is used until you pick a
          voice above.
        </p>
      ) : null}
    </div>
  );
}
