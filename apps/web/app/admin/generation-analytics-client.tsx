"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  getAdminGenerationMetricsRecent,
  getAdminGenerationMetricsStats,
  type AdminGenerationMetricRow,
  type AdminGenerationMetricsStats,
} from "@/lib/api";
import { RotateCw } from "lucide-react";

function fmtMs(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n)}`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Stacked bar segments (transcript + source fetch merged). */
const STACK_SEGMENTS: {
  key: string;
  label: string;
  color: string;
  pctOf: (b: AdminGenerationMetricsStats["by_source_type"][number]) => number;
}[] = [
  {
    key: "source",
    label: "Transcript / source fetch",
    color: "bg-slate-500",
    pctOf: (b) =>
      Math.max(0, (b.stack_pct_transcript ?? 0) + (b.stack_pct_source_fetch ?? 0)),
  },
  {
    key: "cards",
    label: "Card generation",
    color: "bg-blue-600",
    pctOf: (b) => Math.max(0, b.stack_pct_cards ?? 0),
  },
  {
    key: "grounding",
    label: "Grounding",
    color: "bg-violet-600",
    pctOf: (b) => Math.max(0, b.stack_pct_grounding ?? 0),
  },
  {
    key: "summary",
    label: "Summary",
    color: "bg-emerald-600",
    pctOf: (b) => Math.max(0, b.stack_pct_summary ?? 0),
  },
  {
    key: "other",
    label: "Other / overhead",
    color: "bg-zinc-400",
    pctOf: (b) => Math.max(0, b.stack_pct_other ?? 0),
  },
];

function StackedBarsBySource({ stats }: { stats: AdminGenerationMetricsStats }) {
  if (!stats.by_source_type.length) {
    return (
      <p className="text-sm text-muted-foreground">No breakdown yet (run some generations).</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Stacked bars show average <span className="font-medium text-foreground">% of job wall time</span>{" "}
        per phase (from persisted ms columns). Transcript/fetch are often 0 until instrumented outside
        generate-flashcards.
      </p>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {STACK_SEGMENTS.map((k) => (
          <span key={k.key} className="inline-flex items-center gap-1">
            <span className={`size-2.5 shrink-0 rounded-sm ${k.color}`} aria-hidden />
            {k.label}
          </span>
        ))}
      </div>
      {stats.by_source_type.map((b) => {
        const parts = STACK_SEGMENTS.map((k) => ({
          ...k,
          pct: k.pctOf(b),
        }));
        const sum = parts.reduce((a, p) => a + p.pct, 0) || 1;
        return (
          <div key={b.source_type}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="font-medium capitalize text-foreground">{b.source_type}</span>
              <span className="text-muted-foreground">
                n={b.count} · avg {fmtMs(b.avg_total_ms)} ms total
              </span>
            </div>
            <div className="flex h-8 w-full max-w-2xl overflow-hidden rounded-md border border-border/60 bg-muted/40 shadow-inner">
              {parts.map((p) => (
                <div
                  key={p.key}
                  className={`${p.color} min-w-0 transition-[width]`}
                  style={{ width: `${(p.pct / sum) * 100}%` }}
                  title={`${p.label}: ${((p.pct / sum) * 100).toFixed(1)}%`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AdminGenerationAnalyticsClient() {
  const { status } = useSession();
  const [stats, setStats] = useState<AdminGenerationMetricsStats | null>(null);
  const [recent, setRecent] = useState<AdminGenerationMetricRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        getAdminGenerationMetricsStats(2000),
        getAdminGenerationMetricsRecent(120),
      ]);
      setStats(s);
      setRecent(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Generation analytics</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Metrics from <code className="rounded bg-muted px-1 py-0.5 text-[10px]">generation_job_metrics</code>{" "}
            (each POST generate-flashcards). Use the Admin bar above to switch sections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh"
          >
            <RotateCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {stats && stats.sample_size === 0 ? (
        <p className="text-sm text-muted-foreground">
          No generation metrics yet. Complete a flashcard generation after deploy.
        </p>
      ) : null}

      {stats && stats.sample_size > 0 ? (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              KPIs (sample)
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: "Total jobs", value: String(stats.total_jobs) },
                {
                  label: "Success rate",
                  value: `${(stats.success_rate * 100).toFixed(1)}%`,
                },
                { label: "Avg total", value: `${fmtMs(stats.avg_total_ms)} ms` },
                { label: "p50 total", value: `${fmtMs(stats.p50_total_ms)} ms` },
                { label: "p90 total", value: `${fmtMs(stats.p90_total_ms)} ms` },
              ].map((k) => (
                <div
                  key={k.label}
                  className="rounded-lg border border-border/60 bg-card px-3 py-2.5 shadow-sm"
                >
                  <div className="text-[11px] text-muted-foreground">{k.label}</div>
                  <div className="text-lg font-semibold tabular-nums">{k.value}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Sample: last {stats.sample_size} completed jobs (most recent first).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Stacked bar: time mix by source type
            </h2>
            <div className="rounded-lg border border-border/60 bg-card p-4">
              <StackedBarsBySource stats={stats} />
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Averages by source type
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[720px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-2 py-2 text-left font-medium">Source</th>
                    <th className="px-2 py-2 text-right font-medium">n</th>
                    <th className="px-2 py-2 text-right font-medium">Avg total</th>
                    <th className="px-2 py-2 text-right font-medium">Transcript</th>
                    <th className="px-2 py-2 text-right font-medium">Fetch</th>
                    <th className="px-2 py-2 text-right font-medium">Cards</th>
                    <th className="px-2 py-2 text-right font-medium">Ground</th>
                    <th className="px-2 py-2 text-right font-medium">Summary</th>
                    <th className="px-2 py-2 text-right font-medium">Other</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.by_source_type.map((b) => (
                    <tr key={b.source_type} className="border-b border-border/50">
                      <td className="px-2 py-1.5 capitalize">{b.source_type}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{b.count}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmtMs(b.avg_total_ms)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {fmtMs(b.avg_transcript_ms ?? null)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {fmtMs(b.avg_source_fetch_ms ?? null)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmtMs(b.avg_card_generation_ms ?? null)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmtMs(b.avg_grounding_ms ?? null)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmtMs(b.avg_summary_ms ?? null)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {fmtMs(b.avg_other_ms ?? null)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recent jobs
        </h2>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Columns match persisted fields. <span className="font-medium">Cards</span> = created (requested).
          Failures show <span className="font-medium">No</span> (hover for failure tag when present).
        </p>
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-2 py-2 text-left font-medium">When</th>
                <th className="px-2 py-2 text-left font-medium">Source</th>
                <th className="px-2 py-2 text-right font-medium">Total ms</th>
                <th className="px-2 py-2 text-left font-medium">Provider</th>
                <th className="px-2 py-2 text-right font-medium">Cards</th>
                <th className="px-2 py-2 text-right font-medium">Grounding ms</th>
                <th className="px-2 py-2 text-right font-medium">Summary ms</th>
                <th className="px-2 py-2 text-center font-medium">OK</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No rows"}
                  </td>
                </tr>
              ) : (
                recent.map((r) => (
                  <tr key={r.id} className="border-b border-border/40">
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                      {fmtTime(r.completed_at)}
                    </td>
                    <td className="px-2 py-1.5 capitalize">{r.source_type}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {fmtMs(r.total_ms)}
                    </td>
                    <td className="max-w-[120px] truncate px-2 py-1.5 font-mono text-[10px]">
                      {r.cards_provider}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {r.cards_created}
                      <span className="text-muted-foreground">/{r.cards_requested}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtMs(r.grounding_ms)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtMs(r.summary_ms)}</td>
                    <td className="px-2 py-1.5 text-center">
                      {r.success ? (
                        <span className="text-emerald-700 dark:text-emerald-400">Yes</span>
                      ) : (
                        <span className="text-destructive" title={r.failure_tag ?? ""}>
                          No
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
