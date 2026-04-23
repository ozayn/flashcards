"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Square, Volume2 } from "lucide-react";
import { getSpeechVoiceKey, isSpeechSynthesisAvailable } from "@/lib/flashcard-speech";
import { useSpeechSynthesisVoices } from "@/hooks/use-speech-synthesis-voices";
import { cn } from "@/lib/utils";
import {
  labelForPickerVoice,
  partitionPickerVoices,
  shortPreviewTextForVoice,
} from "@/lib/speech-voice-picker";
import { Button } from "@/components/ui/button";

type SpeechVoiceSelectProps = {
  /** Stored `getSpeechVoiceKey`; empty string = automatic selection. */
  value: string;
  onChange: (speechVoiceKey: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
};

function useFixedPanelPosition(
  open: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>
) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 300 });

  const update = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(280, r.width, Math.min(360, window.innerWidth - 16));
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
      width: w,
    });
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    const t = () => update();
    window.addEventListener("scroll", t, true);
    window.addEventListener("resize", t);
    return () => {
      window.removeEventListener("scroll", t, true);
      window.removeEventListener("resize", t);
    };
  }, [open, update]);

  return { pos, update } as const;
}

function useVoicePreview() {
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ok */
      }
    }
    setPreviewingKey(null);
  }, []);

  const togglePreview = useCallback(
    (voice: SpeechSynthesisVoice, voiceKey: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      if (previewingKey === voiceKey) {
        stop();
        return;
      }
      window.speechSynthesis.cancel();
      setPreviewingKey(voiceKey);
      const u = new SpeechSynthesisUtterance(shortPreviewTextForVoice(voice));
      u.voice = voice;
      u.lang = (voice.lang || "").trim() || "en";
      const done = () => {
        setPreviewingKey((k) => (k === voiceKey ? null : k));
      };
      u.onend = done;
      u.onerror = done;
      try {
        window.speechSynthesis.speak(u);
      } catch {
        setPreviewingKey(null);
      }
    },
    [previewingKey, stop]
  );

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* ok */
        }
      }
    },
    []
  );

  return { previewingKey, togglePreview, stopPreview: stop } as const;
}

type PickerVoiceRowProps = {
  voice: SpeechSynthesisVoice;
  voiceKey: string;
  optionId: string;
  label: string;
  isSelected: boolean;
  previewingKey: string | null;
  onSelect: (key: string) => void;
  onTogglePreview: (voice: SpeechSynthesisVoice, key: string) => void;
  disabled?: boolean;
};

function PickerVoiceRow({
  voice,
  voiceKey,
  optionId,
  label,
  isSelected,
  previewingKey,
  onSelect,
  onTogglePreview,
  disabled,
}: PickerVoiceRowProps) {
  const isPlaying = previewingKey === voiceKey;
  return (
    <li role="none" className="p-0.5">
      <div
        className={cn(
          "flex min-h-[2.75rem] items-stretch gap-0.5 rounded-sm border border-transparent",
          isSelected && "bg-muted/80"
        )}
      >
        <button
          type="button"
          role="option"
          id={optionId}
          aria-selected={isSelected}
          className="min-h-11 min-w-0 flex-1 rounded-l-sm px-2 text-left text-[13px] leading-tight hover:bg-muted/50 max-mobile:py-2.5"
          onClick={() => onSelect(voiceKey)}
        >
          <span className="line-clamp-2 break-words">{label}</span>
        </button>
        <div className="grid shrink-0 place-items-center border-s border-border/30 px-0.5">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-8 w-8"
            title={isPlaying ? "Stop sample" : "Play sample"}
            aria-label={
              isPlaying
                ? `Stop preview for ${voice.name}`
                : `Play preview: ${voice.name} (${voice.lang || "unknown language"})`
            }
            aria-pressed={isPlaying}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTogglePreview(voice, voiceKey);
            }}
            disabled={disabled}
          >
            {isPlaying ? <Square className="size-3.5 fill-current" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * Local browser / OS voices: prioritized list, preview, portal dropdown (avoids menu overflow).
 */
export function SpeechVoiceSelect({ value, onChange, className, id, disabled }: SpeechVoiceSelectProps) {
  const list = useSpeechSynthesisVoices();
  const { recommended, other } = useMemo(() => partitionPickerVoices(list), [list]);
  const allOrdered = useMemo(() => [...recommended, ...other], [recommended, other]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { pos, update } = useFixedPanelPosition(open, triggerRef);
  const { previewingKey, togglePreview, stopPreview } = useVoicePreview();
  const listId = useId();
  const labelId = useId();
  const optionIdPrefix = useId();
  const [apiOk, setApiOk] = useState(false);

  useEffect(() => {
    setApiOk(isSpeechSynthesisAvailable());
  }, []);

  const voiceByKey = useMemo(() => new Map(allOrdered.map((v) => [getSpeechVoiceKey(v), v] as const)), [allOrdered]);
  const hasSavedOnDevice = useMemo(() => {
    if (!value.trim()) return true;
    return allOrdered.some((v) => getSpeechVoiceKey(v) === value);
  }, [value, allOrdered]);

  const currentLabel = useMemo(() => {
    if (!value?.trim()) {
      return "Auto (use accent and language preferences)";
    }
    const v = voiceByKey.get(value);
    if (v) return labelForPickerVoice(v);
    return "Saved voice not available on this device";
  }, [value, voiceByKey]);

  const autoSelected = !value?.trim() || !hasSavedOnDevice;
  const normalizedValue = (value || "").trim();

  const close = useCallback(() => {
    setOpen(false);
    stopPreview();
  }, [stopPreview]);

  const select = useCallback(
    (k: string) => {
      onChange(k);
      close();
    },
    [onChange, close]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    },
    [open, close]
  );

  // Click outside + avoid closing when focus moves into panel
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: Event) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    update();
  }, [open, allOrdered.length, update]);

  if (!apiOk) {
    return (
      <p className="text-xs text-muted-foreground" id={id}>
        Speech is not available in this browser, so a speaking voice cannot be selected.
      </p>
    );
  }

  const showRecommended = recommended.length > 0;
  const showOther = other.length > 0;
  const panel = open ? (
    <div
      ref={panelRef}
      className="fixed z-[200] max-h-[min(22rem,calc(100dvh-5rem))] flex flex-col overflow-hidden rounded-md border border-border bg-background shadow-md"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <ul
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-0.5 text-sm"
      >
        <li role="none" className="p-0.5">
          <button
            type="button"
            role="option"
            id={`${id ?? listId}-auto`}
            aria-selected={autoSelected}
            className={cn(
              "hover:bg-muted/60 flex w-full min-h-[2.5rem] items-center rounded-sm px-2 text-left",
              autoSelected && "bg-muted/80"
            )}
            onClick={() => select("")}
            onKeyDown={handleKeyDown}
          >
            <span className="text-[13px]">Auto (use accent and language preferences)</span>
          </button>
        </li>
        {showRecommended ? (
          <li className="bg-muted/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground" role="presentation">
            Recommended
          </li>
        ) : null}
        {recommended.map((v, i) => {
          const k = getSpeechVoiceKey(v);
          const isSel = hasSavedOnDevice && k === normalizedValue;
          return (
            <PickerVoiceRow
              key={k}
              voice={v}
              voiceKey={k}
              optionId={`${optionIdPrefix}-r${i}`}
              label={labelForPickerVoice(v)}
              isSelected={isSel}
              previewingKey={previewingKey}
              onSelect={select}
              onTogglePreview={togglePreview}
              disabled={disabled}
            />
          );
        })}
        {showOther ? (
          <li className="mt-0.5 bg-muted/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground" role="presentation">
            Other voices
          </li>
        ) : null}
        {other.map((v, i) => {
          const k = getSpeechVoiceKey(v);
          const isSel = hasSavedOnDevice && k === normalizedValue;
          return (
            <PickerVoiceRow
              key={k}
              voice={v}
              voiceKey={k}
              optionId={`${optionIdPrefix}-o${i}`}
              label={labelForPickerVoice(v)}
              isSelected={isSel}
              previewingKey={previewingKey}
              onSelect={select}
              onTogglePreview={togglePreview}
              disabled={disabled}
            />
          );
        })}
      </ul>
    </div>
  ) : null;

  return (
    <div className={cn("space-y-1", className)} onKeyDown={handleKeyDown}>
      <span className="sr-only" id={labelId}>
        Speaking voice for read aloud. Choose a voice, or use automatic selection.
      </span>
      <div className="relative w-full max-w-full">
        <Button
          type="button"
          ref={triggerRef}
          id={id}
          variant="outline"
          disabled={disabled}
          className="h-auto w-full min-h-10 max-w-full justify-between gap-2 border-input bg-background py-1.5 pr-2 text-left text-sm font-normal"
          onClick={() => (open ? close() : (stopPreview(), setOpen(true), update()))}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={labelId}
        >
          <span className="line-clamp-2 min-w-0 flex-1 pl-0.5">{currentLabel}</span>
          <ChevronDown className={cn("shrink-0 size-4 opacity-60", open && "rotate-180")} aria-hidden />
        </Button>
      </div>
      {typeof document !== "undefined" && open ? createPortal(panel, document.body) : null}
      {value && !hasSavedOnDevice ? (
        <p className="text-[11px] leading-snug text-amber-700/90 dark:text-amber-400/90">
          Your saved voice is not available in this browser. Automatic selection is used until you pick a
          voice above.
        </p>
      ) : null}
    </div>
  );
}
