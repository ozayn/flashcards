"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

const GAP = 4;
const VIEWPORT_MARGIN = 8;
/** Above sticky nav (z-50) and deck chrome */
const MENU_Z = 200;

/** Focus first actionable menuitem (skip disabled / aria-disabled). */
function focusFirstMenuItem(menu: HTMLElement | null) {
  if (!menu) return;
  const nodes = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el.getAttribute("aria-disabled") === "true") continue;
    const tag = el.tagName.toLowerCase();
    if (tag === "button" && (el as HTMLButtonElement).disabled) continue;
    el.focus();
    return;
  }
}

function clampMenuPosition(
  anchor: DOMRect,
  menuWidth: number,
  menuHeight: number
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = VIEWPORT_MARGIN;
  const w = Math.min(menuWidth, vw - 2 * m);
  let left = anchor.right - w;
  left = Math.max(m, Math.min(left, vw - m - w));
  const h = Math.min(menuHeight, vh - 2 * m);
  let top = anchor.bottom + GAP;
  if (top + h > vh - m) {
    top = anchor.top - h - GAP;
  }
  if (top < m) top = m;
  if (top + h > vh - m) {
    top = Math.max(m, vh - m - h);
  }
  return { top, left };
}

type DeckActionsMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName?: string;
  children: ReactNode;
};

/**
 * Kebab trigger + actions menu rendered in a portal with viewport clamping.
 * Avoids clipping from overflow/transform ancestors (e.g. grouped deck sections, DnD).
 */
export function DeckActionsMenu({
  open,
  onOpenChange,
  triggerClassName,
  children,
}: DeckActionsMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const prevOpenRef = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onOpenChangeRef.current(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      if (prevOpenRef.current) {
        // Avoid scrolling the list when the open deck row repositions (e.g. category reorder).
        triggerRef.current?.focus({ preventScroll: true });
      }
      prevOpenRef.current = false;
      return;
    }
    if (!mounted) return;
    if (!prevOpenRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          focusFirstMenuItem(menuRef.current);
        });
      });
    }
    prevOpenRef.current = true;
  }, [open, mounted]);

  const updatePosition = useCallback(() => {
    const root = rootRef.current;
    const menu = menuRef.current;
    if (!open || !root || !menu) return;
    const ar = root.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    if (mw === 0 || mh === 0) return;
    setPos(clampMenuPosition(ar, mw, mh));
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const id = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(id);
  }, [open, updatePosition, children]);

  useLayoutEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      const el = menuRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      ro = new ResizeObserver(() => updatePosition());
      ro.observe(el);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      ro?.disconnect();
    };
  }, [open, updatePosition]);

  const menuPortal =
    mounted &&
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        id={menuId}
        ref={menuRef}
        role="menu"
        aria-orientation="vertical"
        className="fixed w-max min-w-[17rem] max-w-[min(17rem,calc(100vw-1rem))] max-h-[min(70vh,calc(100dvh-2rem))] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-background py-1 shadow-lg"
        style={{ top: pos.top, left: pos.left, zIndex: MENU_Z }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {children}
      </div>,
      document.body
    );

  return (
    <div ref={rootRef} className={triggerClassName}>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onOpenChange(!open);
        }}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Deck actions"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
      >
        <MoreVertical className="size-4" />
      </Button>
      {menuPortal}
    </div>
  );
}
