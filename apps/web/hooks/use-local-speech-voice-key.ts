"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getStoredUserId } from "@/lib/stored-user-id";
import {
  getLocalSpeechVoiceKey,
  subscribeLocalSpeechVoiceKey,
} from "@/lib/local-speech-voice";

/**
 * Current user’s device-local speaking-voice key (or "" for automatic).
 * Updates on user switch, localStorage, or other tabs.
 */
export function useLocalSpeechVoiceKey(): string {
  const subscribe = useCallback((onChange: () => void) => {
    const unSubLocal = subscribeLocalSpeechVoiceKey(onChange);
    const onUser = () => onChange();
    window.addEventListener("flashcard_user_changed", onUser);
    return () => {
      unSubLocal();
      window.removeEventListener("flashcard_user_changed", onUser);
    };
  }, []);

  const getSnapshot = useCallback(
    () => getLocalSpeechVoiceKey(getStoredUserId()),
    []
  );

  const getServerSnapshot = useCallback(() => "", []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
