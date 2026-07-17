"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  clearFlashcardSpeechLastError,
  flashcardSpeechStore,
  getFlashcardSpeechLastError,
} from "@/lib/flashcard-speech";
import { getStoredUserId } from "@/components/user-selector";
import { updateUserSettings } from "@/lib/api";

/**
 * Subtle banner for OpenAI TTS failures. Offers switching to Browser voice so the
 * failure is never silent; does not auto-fallback without the user tapping.
 */
export function FlashcardSpeechErrorBanner() {
  const error = useSyncExternalStore(
    flashcardSpeechStore.subscribe,
    getFlashcardSpeechLastError,
    () => null,
  );
  const [switching, setSwitching] = useState(false);

  const switchToBrowser = useCallback(async () => {
    const userId = getStoredUserId();
    if (!userId || switching) return;
    setSwitching(true);
    try {
      const updated = await updateUserSettings(userId, {
        read_aloud_provider: "browser",
      });
      window.dispatchEvent(
        new CustomEvent("flashcard_settings_changed", {
          detail: { settings: updated },
        }),
      );
      clearFlashcardSpeechLastError();
    } catch {
      /* keep the error visible so the user can dismiss or retry */
    } finally {
      setSwitching(false);
    }
  }, [switching]);

  if (!error) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-lg border border-border bg-background/95 px-3 py-2 text-center text-xs text-muted-foreground shadow-md backdrop-blur"
    >
      <p className="leading-snug text-foreground">{error}</p>
      <p className="mt-1 leading-snug">You can retry, or switch to Browser voice.</p>
      <div className="mt-1.5 flex items-center justify-center gap-3">
        <button
          type="button"
          className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-60"
          disabled={switching}
          onClick={() => void switchToBrowser()}
        >
          {switching ? "Switching…" : "Use Browser voice"}
        </button>
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() => clearFlashcardSpeechLastError()}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
