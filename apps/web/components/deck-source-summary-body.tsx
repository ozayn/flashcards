"use client";

import { parseSourceSummaryDisplay } from "@/lib/parse-source-summary";

export function DeckSourceSummaryBody({ raw }: { raw: string }) {
  const display = parseSourceSummaryDisplay(raw);

  if (display.kind === "plain") {
    return (
      <div className="whitespace-pre-wrap text-[11px] sm:text-xs text-muted-foreground/80 leading-relaxed">
        {display.text}
      </div>
    );
  }

  return (
    <div className="text-[11px] sm:text-xs text-muted-foreground/80 leading-relaxed space-y-2">
      {display.summary ? (
        <p className="m-0 leading-relaxed">{display.summary}</p>
      ) : null}
      {display.bulletPoints.length > 0 ? (
        <ul className="m-0 list-disc pl-4 space-y-1">
          {display.bulletPoints.map((line, i) => (
            <li key={i} className="leading-relaxed">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
