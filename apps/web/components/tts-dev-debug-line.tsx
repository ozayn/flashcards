"use client";

import { useSyncExternalStore } from "react";
import { ttsDebugStore, type TtsDebugSnapshot } from "@/lib/flashcard-speech";
import { cn } from "@/lib/utils";

const isDev = process.env.NODE_ENV === "development";

const emptySnap = null as TtsDebugSnapshot | null;

/**
 * Development-only: last TTS resolution for the current browser session (near speech controls).
 */
export function TtsDevDebugLine({ className }: { className?: string }) {
  const snap = useSyncExternalStore(
    ttsDebugStore.subscribe,
    ttsDebugStore.getSnapshot,
    () => emptySnap
  );

  if (!isDev || !snap) return null;

  return (
    <p
      className={cn(
        "max-w-[min(100%,20rem)] truncate text-[9px] leading-tight text-muted-foreground/90 font-mono",
        className
      )}
      title={`${snap.detectedTextLanguage} · ${snap.voiceName} · ${snap.resolution}`}
      aria-hidden
    >
      TTS: {snap.detectedTextLanguage} → {snap.voiceName} ({snap.voiceLang}) · {snap.resolution}
    </p>
  );
}
