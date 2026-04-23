"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DECK_STUDY_STATUSES,
  DECK_STUDY_STATUS_LABELS,
  deckStudyStatusTriggerClass,
  type DeckStudyStatus,
} from "@/lib/deck-study-status";

function mergeButtonRefs(
  a: Ref<HTMLButtonElement | null>,
  b: Ref<HTMLButtonElement | null> | undefined
) {
  return (node: HTMLButtonElement | null) => {
    if (typeof a === "function") a(node);
    else (a as MutableRefObject<HTMLButtonElement | null>).current = node;
    if (!b) return;
    if (typeof b === "function") b(node);
    else (b as MutableRefObject<HTMLButtonElement | null>).current = node;
  };
}

const GAP = 4;
const VIEWPORT_MARGIN = 8;
const MENU_Z = 200;

function focusFirstMenuItem(menu: HTMLElement | null) {
  if (!menu) return;
  const nodes = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el.getAttribute("aria-disabled") === "true") continue;
    if (el.tagName === "BUTTON" && (el as HTMLButtonElement).disabled) continue;
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
  let left = anchor.left;
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

function moveMenuFocus(menu: HTMLElement | null, delta: number) {
  if (!menu) return;
  const nodes = Array.from(
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]')
  ).filter((el) => {
    if (el.getAttribute("aria-disabled") === "true") return false;
    if (el.tagName === "BUTTON" && (el as HTMLButtonElement).disabled) return false;
    return true;
  });
  if (nodes.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  let idx = nodes.indexOf(active!);
  if (idx < 0) idx = delta > 0 ? -1 : 0;
  let next = idx + delta;
  if (next < 0) next = nodes.length - 1;
  if (next >= nodes.length) next = 0;
  nodes[next]?.focus();
}

type DeckStudyStatusPillMenuProps = {
  studyStatus: DeckStudyStatus;
  /** Persist new status; throw or reject on failure to keep menu open. */
  onSelect: (next: DeckStudyStatus) => Promise<void>;
  /** Slightly larger trigger in list rows vs grid tiles. */
  density: "list" | "grid";
};

function StudyStatusIcon({
  status,
  className,
}: {
  status: DeckStudyStatus;
  className?: string;
}) {
  const iconClass = cn("shrink-0", className);
  switch (status) {
    case "in_progress":
      return <PlayCircle className={iconClass} strokeWidth={1.75} aria-hidden />;
    case "studied":
      return <CheckCircle2 className={iconClass} strokeWidth={1.75} aria-hidden />;
    default:
      return <Circle className={iconClass} strokeWidth={1.75} aria-hidden />;
  }
}

export function DeckStudyStatusPillMenu({
  studyStatus,
  onSelect,
  density,
}: DeckStudyStatusPillMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const prevOpenRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) {
      if (prevOpenRef.current) {
        triggerRef.current?.focus();
      }
      prevOpenRef.current = false;
      return;
    }
    if (!mounted) return;
    if (!prevOpenRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => focusFirstMenuItem(menuRef.current));
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
  }, [open, updatePosition, studyStatus]);

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

  async function pick(next: DeckStudyStatus) {
    if (saving || next === studyStatus) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await onSelectRef.current(next);
      setOpen(false);
    } catch (err) {
      console.error("Failed to update study status", err);
    } finally {
      setSaving(false);
    }
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveMenuFocus(menuRef.current, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveMenuFocus(menuRef.current, -1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusFirstMenuItem(menuRef.current);
    } else if (e.key === "End") {
      e.preventDefault();
      const menu = menuRef.current;
      if (!menu) return;
      const nodes = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
      const last = nodes[nodes.length - 1];
      if (last && !(last as HTMLButtonElement).disabled) last.focus();
    }
  }

  const label = DECK_STUDY_STATUS_LABELS[studyStatus];
  const isList = density === "list";
  const ariaTrigger = `Study status: ${label}. Open menu to change study status.`;

  const menuPortal =
    mounted &&
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        id={menuId}
        ref={menuRef}
        role="menu"
        aria-label="Set study status"
        aria-orientation="vertical"
        className="fixed min-w-[10.5rem] max-w-[min(14rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-md"
        style={{ top: pos.top, left: pos.left, zIndex: MENU_Z }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        onKeyDown={onMenuKeyDown}
      >
        {DECK_STUDY_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="menuitem"
            disabled={saving}
            aria-current={s === studyStatus ? "true" : undefined}
            className={cn(
              "flex w-full items-center px-3 py-2 text-left text-sm outline-none transition-colors",
              "hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              "max-mobile:min-h-[44px] max-mobile:py-3",
              s === studyStatus && "bg-muted/70 font-medium"
            )}
            onClick={() => void pick(s)}
          >
            {DECK_STUDY_STATUS_LABELS[s]}
          </button>
        ))}
      </div>,
      document.body
    );

  return (
    <div ref={rootRef} className="inline-flex shrink-0">
      <Tooltip>
        <TooltipTrigger
          delay={400}
          disabled={saving}
          closeOnClick
          render={(props: ComponentPropsWithRef<"button">) => {
            const { ref: tpRef, className: tpClassName, ...tpRest } = props;
            return (
              <button
                ref={mergeButtonRefs(triggerRef, tpRef)}
                type="button"
                disabled={saving}
                {...tpRest}
                className={cn(
                  tpClassName,
                  "inline-flex items-center justify-center rounded-md border touch-manipulation outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "disabled:pointer-events-none disabled:opacity-60",
                  deckStudyStatusTriggerClass(studyStatus),
                  isList
                    ? "h-11 w-11 sm:h-8 sm:w-8"
                    : "h-8 w-8 sm:h-7 sm:w-7"
                )}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  tpRest.onPointerDown?.(e);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  tpRest.onMouseDown?.(e);
                }}
                onClick={(e) => {
                  tpRest.onClick?.(e);
                  e.stopPropagation();
                  e.preventDefault();
                  setOpen((o) => !o);
                }}
                onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setOpen((o) => !o);
                  }
                  tpRest.onKeyDown?.(e);
                }}
                aria-label={ariaTrigger}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-controls={open ? menuId : undefined}
              >
                <StudyStatusIcon
                  status={studyStatus}
                  className={cn(isList ? "size-5 sm:size-4" : "size-4 sm:size-3.5")}
                />
              </button>
            );
          }}
        />
        <TooltipContent
          variant="hint"
          side="right"
          sideOffset={8}
          align="center"
          className="max-w-[14rem] text-balance"
        >
          {label}
        </TooltipContent>
      </Tooltip>
      {menuPortal}
    </div>
  );
}
