"use client";

import { ListOrdered, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StudyCardOrder } from "@/lib/study-card-order";

type StudyCardOrderControlProps = {
  value: StudyCardOrder;
  onChange: (order: StudyCardOrder) => void;
  className?: string;
};

const ORDER_OPTIONS: {
  id: StudyCardOrder;
  label: string;
  Icon: typeof ListOrdered;
}[] = [
  { id: "original", label: "Original order", Icon: ListOrdered },
  { id: "shuffle", label: "Shuffle", Icon: Shuffle },
];

/**
 * Compact icon control for study card sequence: canonical deck order vs shuffled.
 */
export function StudyCardOrderControl({
  value,
  onChange,
  className,
}: StudyCardOrderControlProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border/50 bg-muted/20 p-0.5",
        className,
      )}
      role="group"
      aria-label="Card order"
    >
      {ORDER_OPTIONS.map(({ id, label, Icon }) => (
        <Button
          key={id}
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-6 w-6 shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 landscape-mobile:h-5 landscape-mobile:w-5",
            value === id
              ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => {
            if (id !== value) onChange(id);
          }}
          aria-label={label}
          aria-pressed={value === id}
          title={label}
        >
          <Icon className="size-3.5 landscape-mobile:size-3" aria-hidden />
        </Button>
      ))}
    </div>
  );
}
