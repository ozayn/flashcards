"use client";

import { useEffect } from "react";
import { getStoredUserId } from "@/lib/stored-user-id";
import { migrateAccountSpeechVoiceToLocal } from "@/lib/local-speech-voice";
import type { UserSettings } from "@/lib/api";

/**
 * If the account still has a legacy `speech_voice` and this browser has none, copy once to localStorage.
 */
export function useMigrateAccountSpeechFromSettings(settings: UserSettings | null) {
  useEffect(() => {
    const id = getStoredUserId();
    if (!id || !settings) return;
    migrateAccountSpeechVoiceToLocal(id, settings.speech_voice);
  }, [settings]);
}
