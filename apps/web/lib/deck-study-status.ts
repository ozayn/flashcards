export type DeckStudyStatus = "not_started" | "in_progress" | "studied";

export const DECK_STUDY_STATUSES: DeckStudyStatus[] = [
  "not_started",
  "in_progress",
  "studied",
];

export const DECK_STUDY_STATUS_LABELS: Record<DeckStudyStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  studied: "Studied",
};

export function coerceDeckStudyStatus(
  value: string | null | undefined
): DeckStudyStatus {
  if (value === "in_progress" || value === "studied") return value;
  return "not_started";
}

/**
 * Subtle border/background/text for list/grid study-status triggers
 * (icon button or legacy pill; neutral / blue / green).
 */
export function deckStudyStatusTriggerClass(status: DeckStudyStatus): string {
  switch (status) {
    case "in_progress":
      return [
        "border-blue-200/70 bg-blue-50/90 text-blue-900/90",
        "dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100/90",
      ].join(" ");
    case "studied":
      return [
        "border-emerald-200/70 bg-emerald-50/90 text-emerald-900/85",
        "dark:border-emerald-900/45 dark:bg-emerald-950/35 dark:text-emerald-100/90",
      ].join(" ");
    default:
      return [
        "border-border/70 bg-muted/60 text-muted-foreground",
        "dark:bg-muted/30 dark:text-muted-foreground",
      ].join(" ");
  }
}
