"use client";

import { useEffect, useState } from "react";
import {
  isDeckDragEnabled,
  TOUCH_PRIMARY_MEDIA_QUERY,
} from "@/lib/deck-drag-enabled";

/**
 * Whether My Decks category drag-and-drop should be active (desktop mouse).
 * Disabled on touch-primary phones so scrolling does not reorder decks.
 */
export function useDeckDragEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => isDeckDragEnabled());

  useEffect(() => {
    const mq = window.matchMedia(TOUCH_PRIMARY_MEDIA_QUERY);
    const sync = () => setEnabled(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return enabled;
}
