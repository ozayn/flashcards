/**
 * Parse deck.source_summary when the LLM stored JSON with summary + bullet_points.
 * Used at render time only; DB value is unchanged.
 */

export type SourceSummaryDisplay =
  | { kind: "structured"; summary: string; bulletPoints: string[] }
  | { kind: "plain"; text: string };

function normalizeBulletItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push(t);
    } else if (typeof item === "number" || typeof item === "boolean") {
      out.push(String(item));
    }
  }
  return out;
}

/** If raw looks like JSON with summary and/or bullet_points, return structured display; else plain text. */
export function parseSourceSummaryDisplay(raw: string): SourceSummaryDisplay {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { kind: "plain", text: "" };
  }
  if (trimmed[0] !== "{") {
    return { kind: "plain", text: trimmed };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { kind: "plain", text: trimmed };
    }
    const o = parsed as Record<string, unknown>;
    const summaryRaw = o.summary;
    const bulletsRaw = o.bullet_points ?? o.bulletPoints;

    const summary =
      typeof summaryRaw === "string" ? summaryRaw.trim() : "";
    const bulletPoints = normalizeBulletItems(bulletsRaw);

    if (!summary && bulletPoints.length === 0) {
      return { kind: "plain", text: trimmed };
    }

    return { kind: "structured", summary, bulletPoints };
  } catch {
    return { kind: "plain", text: trimmed };
  }
}
