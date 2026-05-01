"use client";

import { useCallback, useMemo, useState } from "react";
import { useSpeechSynthesisVoices } from "@/hooks/use-speech-synthesis-voices";
import { Button } from "@/components/ui/button";

type VoiceRow = {
  name: string;
  lang: string;
  voiceURI: string;
  default: boolean;
  localService: boolean;
};

function toRows(voices: ReadonlyArray<SpeechSynthesisVoice>): VoiceRow[] {
  return voices.map((v) => ({
    name: v.name,
    lang: (v.lang || "").trim(),
    voiceURI: v.voiceURI,
    default: v.default,
    localService: v.localService,
  }));
}

function rowsToTsv(rows: VoiceRow[]): string {
  const header = ["name", "lang", "voiceURI", "default", "localService"].join("\t");
  const lines = rows.map(
    (r) =>
      [r.name, r.lang, r.voiceURI, String(r.default), String(r.localService)]
        .map((c) => c.replace(/\t/g, " ").replace(/\r?\n/g, " "))
        .join("\t")
  );
  return [header, ...lines].join("\n");
}

/**
 * Dev-only: shows exactly what `speechSynthesis.getVoices()` returns (no picker filtering).
 * Collapsible fixed panel for comparing browsers/OS against app expectations.
 */
export function SpeechSynthesisRawVoicesDev() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const voices = useSpeechSynthesisVoices();
  const [open, setOpen] = useState(false);
  const [onlyGb, setOnlyGb] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const list = onlyGb ? voices.filter((v) => /^en-gb$/i.test((v.lang || "").trim()) || /^en-gb-/i.test((v.lang || "").trim())) : [...voices];
    list.sort((a, b) => {
      const la = (a.lang || "").toLowerCase();
      const lb = (b.lang || "").toLowerCase();
      if (la !== lb) return la.localeCompare(lb);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [voices, onlyGb]);

  const rows = useMemo(() => toRows(sorted), [sorted]);

  const copy = useCallback(async (kind: "tsv" | "json") => {
    const payload =
      kind === "tsv"
        ? rowsToTsv(rows)
        : JSON.stringify(
            {
              capturedAt: new Date().toISOString(),
              userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
              voiceCount: rows.length,
              voices: rows,
            },
            null,
            2
          );
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("err");
      window.setTimeout(() => setCopied(null), 2000);
    }
  }, [rows]);

  const gbCount = useMemo(
    () =>
      voices.filter((v) => /^en-gb$/i.test((v.lang || "").trim()) || /^en-gb-/i.test((v.lang || "").trim())).length,
    [voices]
  );

  return (
    <div className="fixed bottom-2 right-2 z-[300] max-w-[min(100vw-1rem,36rem)] text-left font-mono text-[11px] leading-snug">
      {!open ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="shadow-md border border-amber-600/40 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:bg-amber-950/90 dark:text-amber-50 dark:hover:bg-amber-900"
          onClick={() => setOpen(true)}
        >
          Raw Web Speech voices (dev) — {voices.length} total, {gbCount} en-GB
        </Button>
      ) : (
        <div className="flex max-h-[min(70dvh,28rem)] flex-col overflow-hidden rounded-md border border-amber-600/50 bg-background shadow-lg dark:border-amber-500/40">
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
            <span className="mr-1 font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              getVoices() raw
            </span>
            <label className="flex cursor-pointer items-center gap-1 font-sans text-[10px] text-foreground">
              <input type="checkbox" checked={onlyGb} onChange={(e) => setOnlyGb(e.target.checked)} className="size-3" />
              en-GB only
            </label>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => copy("tsv")}>
              {copied === "tsv" ? "Copied" : "Copy TSV"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => copy("json")}>
              {copied === "json" ? "Copied" : "Copy JSON"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 px-2 text-[10px]" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
          <p className="shrink-0 border-b border-border/60 px-2 py-1 font-sans text-[10px] text-muted-foreground break-all">
            Compare this list across Chrome / Safari / OS versions. If counts differ here, the limitation is outside the app picker.
          </p>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm">
                <tr>
                  <th className="border-b border-border px-1.5 py-1 font-normal">name</th>
                  <th className="border-b border-border px-1.5 py-1 font-normal">lang</th>
                  <th className="border-b border-border px-1.5 py-1 font-normal">default</th>
                  <th className="border-b border-border px-1.5 py-1 font-normal">local</th>
                  <th className="border-b border-border px-1.5 py-1 font-normal">voiceURI</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((v) => (
                  <tr key={`${v.voiceURI}|${v.name}|${v.lang}`} className="hover:bg-muted/30">
                    <td className="max-w-[8rem] border-b border-border/40 px-1.5 py-0.5 align-top break-words">{v.name}</td>
                    <td className="border-b border-border/40 px-1.5 py-0.5 align-top whitespace-nowrap">{v.lang || "—"}</td>
                    <td className="border-b border-border/40 px-1.5 py-0.5 align-top">{v.default ? "yes" : ""}</td>
                    <td className="border-b border-border/40 px-1.5 py-0.5 align-top">{v.localService ? "yes" : ""}</td>
                    <td className="max-w-[14rem] border-b border-border/40 px-1.5 py-0.5 align-top break-all text-[10px] text-muted-foreground">
                      {v.voiceURI}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
