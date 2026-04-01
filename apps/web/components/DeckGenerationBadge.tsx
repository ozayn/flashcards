import { Loader2 } from "lucide-react";

/** Matches API GenerationStatus + legacy omitted (treated as completed). */
export function isDeckGeneratingLike(status?: string | null): boolean {
  return status === "generating" || status === "queued";
}

export function isDeckGenerationFailed(status?: string | null): boolean {
  return status === "failed";
}

export function DeckGenerationBadge({ status }: { status?: string | null }) {
  if (!status || status === "completed") return null;
  if (status === "generating" || status === "queued") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-blue-200/90 bg-blue-50/95 px-2 py-0.5 text-[11px] font-medium text-blue-900 dark:border-blue-800 dark:bg-blue-950/55 dark:text-blue-100 shrink-0"
        title={status === "queued" ? "Queued" : "Generating"}
      >
        <Loader2 className="size-3 animate-spin shrink-0 opacity-90" aria-hidden />
        {status === "queued" ? "Queued" : "Generating"}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-red-200/90 bg-red-50/95 px-2 py-0.5 text-[11px] font-medium text-red-900 dark:border-red-900 dark:bg-red-950/45 dark:text-red-100 shrink-0"
        title="Failed"
      >
        Failed
      </span>
    );
  }
  return null;
}
