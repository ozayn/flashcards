import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isDeckDragEnabled,
  isTouchPrimaryDevice,
  TOUCH_PRIMARY_MEDIA_QUERY,
} from "./deck-drag-enabled";

function withWindowMatchMedia(matches: boolean, run: () => void) {
  const listeners: Array<() => void> = [];
  const matchMedia = vi.fn((query: string) => {
    const isTouchQuery = query === TOUCH_PRIMARY_MEDIA_QUERY;
    return {
      matches: isTouchQuery ? matches : false,
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: () => void) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
      dispatchEvent: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    } as MediaQueryList;
  });
  const originalWindow = globalThis.window;
  // @ts-expect-error test shim
  globalThis.window = { matchMedia };
  try {
    run();
  } finally {
    globalThis.window = originalWindow;
  }
}

describe("deck drag capability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses touch-primary media query", () => {
    expect(TOUCH_PRIMARY_MEDIA_QUERY).toBe("(pointer: coarse) and (hover: none)");
  });

  it("detects touch-primary devices", () => {
    withWindowMatchMedia(true, () => {
      expect(isTouchPrimaryDevice()).toBe(true);
      expect(isDeckDragEnabled()).toBe(false);
    });
  });

  it("enables drag on desktop pointer interfaces", () => {
    withWindowMatchMedia(false, () => {
      expect(isTouchPrimaryDevice()).toBe(false);
      expect(isDeckDragEnabled()).toBe(true);
    });
  });

  it("returns false for touch-primary on server", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error simulate SSR
    delete globalThis.window;
    expect(isTouchPrimaryDevice()).toBe(false);
    expect(isDeckDragEnabled()).toBe(true);
    globalThis.window = originalWindow;
  });
});
