"use client";

import { Headphones, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isSpeechSynthesisAvailable } from "@/lib/flashcard-speech";
import { type ReadAutoplayState } from "@/hooks/use-read-tab-autoplay";
import { useEffect, useState } from "react";

type ReadTabReadAllBarProps = {
  state: ReadAutoplayState;
  disabled: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  className?: string;
};

/**
 * Compact Read-tab controls for “read all aloud” slideshow: start, pause, resume, stop.
 */
export function ReadTabReadAllBar({
  state,
  disabled,
  onStart,
  onPause,
  onResume,
  onStop,
  className,
}: ReadTabReadAllBarProps) {
  const [apiOk, setApiOk] = useState(false);
  useEffect(() => {
    setApiOk(isSpeechSynthesisAvailable());
  }, []);

  if (!apiOk) return null;

  const running = state === "running";
  const paused = state === "paused";
  const anyActive = running || paused;

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 rounded-md border border-border/40 bg-muted/20 px-0.5 sm:px-1 py-0.5",
        running && "ring-1 ring-foreground/15",
        className
      )}
      role="group"
      aria-label="Read all cards aloud"
    >
      {state === "off" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 text-muted-foreground hover:text-foreground"
          disabled={disabled}
          onClick={onStart}
          aria-label="Start read all aloud"
          title="Read all cards aloud"
        >
          <Play className="size-3.5 sm:size-4" aria-hidden />
        </Button>
      ) : null}

      {anyActive ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={running ? onPause : onResume}
            disabled={!anyActive || disabled}
            aria-pressed={running}
            aria-label={running ? "Pause read all aloud" : "Resume read all aloud"}
            title={running ? "Pause" : "Resume"}
          >
            {running ? <Pause className="size-3.5 sm:size-4" aria-hidden /> : <Play className="size-3.5 sm:size-4" aria-hidden />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onStop}
            aria-label="Stop read all aloud"
            title="Stop"
          >
            <Square className="size-3 sm:size-3.5 fill-current" aria-hidden />
          </Button>
        </>
      ) : null}

      <Headphones
        className="ms-0.5 size-3.5 text-muted-foreground/70 shrink-0"
        aria-hidden
      />
      <span className="max-w-[4.5rem] truncate pr-0.5 text-[10px] sm:text-xs text-muted-foreground landscape-mobile:max-w-[3.25rem]">
        Read all
      </span>
    </div>
  );
}