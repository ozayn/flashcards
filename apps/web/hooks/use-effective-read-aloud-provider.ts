"use client";

import { useEffect, useMemo, useRef } from "react";
import { useClientIsAdmin } from "@/components/user-selector";
import { getStoredUserId } from "@/lib/stored-user-id";
import { updateUserSettings, type UserSettings } from "@/lib/api";
import type { ReadAloudProvider } from "@/lib/openai-tts-config";
import { resolveReadAloudProvider } from "@/lib/read-aloud-provider";

type Args = {
  userSettings: UserSettings | null | undefined;
  setUserSettings?: (s: UserSettings) => void;
  /** Server configured OpenAI TTS (from /speech/openai/status). Default true so missing status does not force browser for admins mid-load. */
  openaiConfigured?: boolean;
};

/**
 * Effective read-aloud provider for playback, with device-aware defaults and
 * automatic browser fallback when a non-admin has a stale `openai` setting.
 */
export function useEffectiveReadAloudProvider({
  userSettings,
  setUserSettings,
  openaiConfigured = true,
}: Args): ReadAloudProvider {
  const isAdmin = useClientIsAdmin();
  const userId = typeof window !== "undefined" ? getStoredUserId() : null;
  const resettingRef = useRef(false);

  const effective = useMemo(() => {
    return resolveReadAloudProvider({
      saved: userSettings?.read_aloud_provider,
      userId,
      isProductAdmin: isAdmin,
      openaiConfigured,
    });
  }, [userSettings?.read_aloud_provider, userId, isAdmin, openaiConfigured]);

  // Stale openai on non-admin (or when OpenAI is off): persist browser so UI/playback stay consistent.
  useEffect(() => {
    if (!userSettings || !userId || !setUserSettings) return;
    if (userSettings.read_aloud_provider !== "openai") return;
    if (isAdmin && openaiConfigured) return;
    if (resettingRef.current) return;
    resettingRef.current = true;
    void updateUserSettings(userId, { read_aloud_provider: "browser" })
      .then((updated) => {
        setUserSettings(updated);
        window.dispatchEvent(
          new CustomEvent("flashcard_settings_changed", {
            detail: { settings: updated },
          }),
        );
      })
      .catch(() => {
        /* ignore — effective provider already forces browser */
      })
      .finally(() => {
        resettingRef.current = false;
      });
  }, [
    userSettings,
    userId,
    isAdmin,
    openaiConfigured,
    setUserSettings,
  ]);

  return effective;
}
