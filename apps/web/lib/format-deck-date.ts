/** Calendar date for deck metadata (local timezone, no time). */
export function formatDeckCreatedCalendarDate(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** e.g. "Created Apr 1, 2026" for deck detail. */
export function formatDeckCreatedLabel(iso: string | undefined | null): string | null {
  const cal = formatDeckCreatedCalendarDate(iso);
  return cal ? `Created ${cal}` : null;
}
