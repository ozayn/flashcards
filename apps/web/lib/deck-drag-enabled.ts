/**
 * Touch-primary devices (phones): coarse pointer and no hover capability.
 * Touchscreen laptops typically report fine pointer and hover, so drag stays enabled.
 */
export const TOUCH_PRIMARY_MEDIA_QUERY = "(pointer: coarse) and (hover: none)";

export function isTouchPrimaryDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(TOUCH_PRIMARY_MEDIA_QUERY).matches;
}

/** Deck list drag-and-drop is enabled only on non-touch-primary interfaces. */
export function isDeckDragEnabled(): boolean {
  return !isTouchPrimaryDevice();
}
