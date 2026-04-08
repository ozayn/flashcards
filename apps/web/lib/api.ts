/**
 * Client-side: call same-origin Next.js API proxy. Server-side proxy uses
 * API_INTERNAL_URL (Railway private networking) when available.
 */
const API_BASE = "/api/proxy";

/** Parse FastAPI `detail` (string or validation list) for user-facing errors. */
export async function readApiErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown };
    const d = j?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0] && typeof (d[0] as { msg?: string }).msg === "string") {
      return String((d[0] as { msg: string }).msg);
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

/** For display only (e.g. error messages). Public URL, not used for requests. */
export const apiUrl =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/** Lightweight API availability check using GET /. */
export async function checkApiAvailability(timeoutMs = 8000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${API_BASE}/`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** Poll until the API responds or the time budget is exhausted (cold-start friendly). */
export async function waitForApiReadiness(options?: {
  budgetMs?: number;
  retryDelayMs?: number;
  timeoutPerAttemptMs?: number;
}): Promise<boolean> {
  const budgetMs = options?.budgetMs ?? 14_000;
  const retryDelayMs = options?.retryDelayMs ?? 1_500;
  const timeoutPerAttemptMs = options?.timeoutPerAttemptMs ?? 8000;
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    if (await checkApiAvailability(timeoutPerAttemptMs)) {
      return true;
    }
    const remaining = budgetMs - (Date.now() - start);
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(retryDelayMs, remaining)));
  }
  return false;
}

export type UserUsageLimits = {
  limited_tier: boolean;
  max_active_decks: number | null;
  max_cards_per_deck: number | null;
  active_deck_count: number;
};

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  created_at: string;
  picture_url?: string | null;
  usage?: UserUsageLimits | null;
};

/** Deduplicate overlapping fetches + absorb Strict Mode double-mount / effect churn (dev). */
const _USER_API_HYDRATION_TTL_MS = 2800;

type _TtlEntry<T> = { value: T; until: number };

let _usersListTtl: _TtlEntry<UserRow[]> | null = null;
const _userRowTtl = new Map<string, _TtlEntry<UserRow>>();

function _invalidateUsersListTtl() {
  _usersListTtl = null;
}

function _cloneUserRow(row: UserRow): UserRow {
  return { ...row, usage: row.usage ? { ...row.usage } : row.usage };
}

const _getUserInFlight = new Map<string, Promise<UserRow>>();

export async function getUser(userId: string): Promise<UserRow> {
  const t = _userRowTtl.get(userId);
  if (t && Date.now() < t.until) {
    return Promise.resolve(_cloneUserRow(t.value));
  }
  const existing = _getUserInFlight.get(userId);
  if (existing) return existing;
  const p = (async (): Promise<UserRow> => {
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = (await res.json()) as UserRow;
      _userRowTtl.set(userId, {
        value: data,
        until: Date.now() + _USER_API_HYDRATION_TTL_MS,
      });
      return data;
    } finally {
      _getUserInFlight.delete(userId);
    }
  })();
  _getUserInFlight.set(userId, p);
  return p;
}

export type UserActivityEntry = {
  id: string;
  event_type: string;
  created_at: string;
  meta: Record<string, unknown> | null;
};

/** Signed-in user's recent events (same user as session only). Returns [] if forbidden or empty. */
export async function getUserActivity(
  userId: string,
  limit = 10
): Promise<UserActivityEntry[]> {
  const res = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/activity?limit=${encodeURIComponent(String(limit))}`,
    { cache: "no-store" }
  );
  if (res.status === 403) return [];
  if (!res.ok) throw new Error("Failed to load activity");
  return res.json();
}

export async function patchUserProfileName(
  userId: string,
  name: string
): Promise<UserRow> {
  const res = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/profile`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Failed to update name"
    );
  }
  const row = (await res.json()) as UserRow;
  _userRowTtl.set(userId, {
    value: row,
    until: Date.now() + _USER_API_HYDRATION_TTL_MS,
  });
  _invalidateUsersListTtl();
  return row;
}

let _getUsersInFlight: Promise<UserRow[]> | null = null;

export async function getUsers(): Promise<UserRow[]> {
  const listHit = _usersListTtl;
  if (listHit && Date.now() < listHit.until) {
    return Promise.resolve(listHit.value.map(_cloneUserRow));
  }
  if (_getUsersInFlight) return _getUsersInFlight;
  const p = (async (): Promise<UserRow[]> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${API_BASE}/users`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = (await res.json()) as UserRow[];
      _usersListTtl = {
        value: data,
        until: Date.now() + _USER_API_HYDRATION_TTL_MS,
      };
      return data;
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    } finally {
      _getUsersInFlight = null;
    }
  })();
  _getUsersInFlight = p;
  return p;
}

/** User row from admin list (includes activity aggregate); PATCH returns the same shape. */
export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  access_role: "owner" | "admin" | "user";
  created_at: string;
  picture_url?: string | null;
  last_active_at?: string | null;
};

/** Requires signed-in Google session; proxy sends acting-user headers; API checks ADMIN_EMAILS on backend user. */
export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const res = await fetch(`${API_BASE}/admin/users`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Failed to load users"
    );
  }
  return res.json();
}

/** Platform admin only: recent events for any user (same shape as profile activity). */
export async function getAdminUserActivity(
  userId: string,
  limit = 15
): Promise<UserActivityEntry[]> {
  const res = await fetch(
    `${API_BASE}/admin/users/${encodeURIComponent(userId)}/activity?limit=${encodeURIComponent(String(limit))}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Failed to load activity"));
  }
  return res.json();
}

export async function patchAdminUser(
  targetUserId: string,
  body: { name?: string; email?: string }
): Promise<AdminUserRow> {
  const res = await fetch(`${API_BASE}/admin/users/${targetUserId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Failed to update user"
    );
  }
  return res.json();
}

export type AdminUserDeletePreview = {
  id: string;
  name: string;
  email: string;
  deck_count: number;
};

export async function getAdminUserDeletePreview(
  userId: string
): Promise<AdminUserDeletePreview> {
  const res = await fetch(
    `${API_BASE}/admin/users/${userId}/delete-preview`,
    {
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Failed to load delete preview"
    );
  }
  return res.json();
}

export async function deleteAdminUser(userId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Failed to delete user"
    );
  }
}

/** Platform admin: move a legacy-owned deck into the signed-in admin account. */
export async function postAdminTransferDeckToMe(deckId: string): Promise<unknown> {
  const res = await fetch(
    `${API_BASE}/admin/decks/${encodeURIComponent(deckId)}/transfer-to-me`,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Could not transfer deck"
    );
  }
  return res.json();
}

export type LegacyBulkTransferPreview = {
  source_user_id: string;
  name: string;
  email: string;
  is_legacy_user: boolean;
  deck_count: number;
};

/** Platform admin: legacy status and deck count before bulk transfer. */
export async function getAdminLegacyBulkTransferPreview(
  userId: string
): Promise<LegacyBulkTransferPreview> {
  const res = await fetch(
    `${API_BASE}/admin/users/${encodeURIComponent(userId)}/legacy-bulk-transfer-preview`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Failed to load transfer preview"
    );
  }
  return res.json();
}

export type BulkLegacyTransferResult = {
  moved_count: number;
  deck_ids: string[];
};

/** Platform admin: move every deck owned by a legacy user into the signed-in admin account. */
export async function postAdminTransferAllLegacyDecksFromUser(
  userId: string
): Promise<BulkLegacyTransferResult> {
  const res = await fetch(
    `${API_BASE}/admin/users/${encodeURIComponent(userId)}/transfer-all-legacy-decks-to-me`,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    throw new Error(
      typeof detail === "string" ? detail : "Could not transfer decks"
    );
  }
  return res.json();
}

/** Platform admin: recent flashcard generation timing rows (backend-persisted). */
export type AdminGenerationMetricRow = {
  id: string;
  gen_job_id: string;
  deck_id: string;
  user_id: string | null;
  source_type: string;
  success: boolean;
  failure_tag: string | null;
  cards_requested: number;
  cards_created: number;
  cards_provider: string;
  started_at: string;
  completed_at: string;
  total_ms: number;
  prepare_phase_ms: number | null;
  transcript_ms: number | null;
  source_fetch_ms: number | null;
  card_generation_ms: number | null;
  grounding_ms: number | null;
  summary_ms: number | null;
  other_ms: number | null;
};

export type AdminGenerationMetricsStats = {
  sample_size: number;
  total_jobs: number;
  success_count: number;
  success_rate: number;
  avg_total_ms: number;
  p50_total_ms: number;
  p90_total_ms: number;
  by_source_type: {
    source_type: string;
    count: number;
    avg_total_ms: number;
    avg_transcript_ms: number | null;
    avg_source_fetch_ms: number | null;
    avg_card_generation_ms: number | null;
    avg_grounding_ms: number | null;
    avg_summary_ms: number | null;
    avg_other_ms: number | null;
    stack_pct_transcript: number;
    stack_pct_source_fetch: number;
    stack_pct_cards: number;
    stack_pct_grounding: number;
    stack_pct_summary: number;
    stack_pct_other: number;
  }[];
};

export async function getAdminGenerationMetricsRecent(
  limit = 100
): Promise<AdminGenerationMetricRow[]> {
  const res = await fetch(
    `${API_BASE}/admin/generation-metrics/recent?limit=${encodeURIComponent(String(limit))}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Failed to load generation metrics"));
  }
  return res.json();
}

export async function getAdminGenerationMetricsStats(
  sampleLimit = 2000
): Promise<AdminGenerationMetricsStats> {
  const res = await fetch(
    `${API_BASE}/admin/generation-metrics/stats?sample_limit=${encodeURIComponent(String(sampleLimit))}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Failed to load generation stats"));
  }
  return res.json();
}

export async function createUser(data: {
  email: string;
  name: string;
  role?: string;
  plan?: string;
}) {
    const res = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: data.email,
      name: data.name,
      role: data.role ?? "user",
      plan: data.plan ?? "free",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to create user");
  }

  _invalidateUsersListTtl();
  return res.json();
}

export async function getDecks(userId: string, archived = false) {
  const res = await fetch(
    `${API_BASE}/decks?user_id=${userId}&archived=${archived}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch decks");
  return res.json();
}

export async function getLibraryDecks() {
  const res = await fetch(`${API_BASE}/decks/library`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch library decks");
  return res.json();
}

export async function duplicateDeck(deckId: string, userId: string) {
  const res = await fetch(`${API_BASE}/decks/${deckId}/duplicate?user_id=${userId}`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Failed to duplicate deck"));
  }
  return res.json();
}

export async function getDeck(deckId: string) {
  const res = await fetch(`${API_BASE}/decks/${deckId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch deck");
  return res.json();
}

export async function getRelatedDecks(deckId: string, limit = 4) {
  const res = await fetch(
    `${API_BASE}/decks/${deckId}/related?limit=${limit}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch related decks");
  return res.json();
}

/** Compact JSON for YouTube decks: duration_seconds, caption_language (stored in deck.source_metadata). */
export function buildYoutubeDeckSourceMetadata(transcript: {
  duration_seconds?: number | null;
  language?: string | null;
}): string | undefined {
  const o: Record<string, unknown> = {};
  if (
    transcript.duration_seconds != null &&
    Number.isFinite(transcript.duration_seconds) &&
    transcript.duration_seconds >= 0
  ) {
    o.duration_seconds = Math.floor(transcript.duration_seconds);
  }
  if (transcript.language?.trim()) o.caption_language = transcript.language.trim();
  return Object.keys(o).length ? JSON.stringify(o) : undefined;
}

export type YoutubeDeckSourceMetadata = {
  duration_seconds?: number;
  caption_language?: string;
};

export function parseYoutubeDeckSourceMetadata(
  raw: string | null | undefined
): YoutubeDeckSourceMetadata | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    return j as YoutubeDeckSourceMetadata;
  } catch {
    return null;
  }
}

export function formatYoutubeDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export async function createDeck(data: {
  user_id: string;
  name: string;
  description?: string;
  source_type?: string;
  source_url?: string | null;
  source_topic?: string | null;
  source_text?: string | null;
  source_segments?: string | null;
  source_metadata?: string | null;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const body: Record<string, unknown> = {
      ...data,
      source_type: data.source_type ?? "topic",
    };
    if (data.source_topic === undefined) delete body.source_topic;
    if (data.source_url === undefined) delete body.source_url;
    if (data.source_text === undefined) delete body.source_text;
    if (data.source_segments === undefined) delete body.source_segments;
    if (data.source_metadata === undefined) delete body.source_metadata;
    const res = await fetch(`${API_BASE}/decks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(await readApiErrorMessage(res, "Failed to create deck"));
    }
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Request timed out. Check if the API is running and reachable.");
    }
    throw e;
  }
}

const _YT_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/i,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/i,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/i,
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i,
  /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/i,
];

export function extractYouTubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  for (const pattern of _YT_ID_PATTERNS) {
    const m = pattern.exec(trimmed);
    if (m) return m[1];
  }
  return null;
}

export function normalizeYouTubeUrl(url: string): string {
  const id = extractYouTubeVideoId(url);
  if (id) return `https://www.youtube.com/watch?v=${id}`;
  return url.trim();
}

export function isYouTubePlaylistUrl(url: string): boolean {
  const t = url.trim();
  if (/youtube\.com\/playlist\b/i.test(t)) return true;
  if (/[?&]list=/i.test(t) && /youtube\.com|youtu\.be/i.test(t)) return true;
  return false;
}

export type TranscriptFetchErrorFields = {
  title?: string | null;
  videoId?: string | null;
  durationSeconds?: number | null;
  watchMetadataOk?: boolean;
  code?: string | null;
  transcriptOk?: boolean;
};

/** YouTube /transcript failures may include watch metadata even when captions fail. */
export class TranscriptFetchError extends Error {
  title: string | null;
  videoId: string | null;
  durationSeconds: number | null;
  watchMetadataOk: boolean;
  code: string | null;
  transcriptOk: boolean;

  constructor(message: string, fields: TranscriptFetchErrorFields = {}) {
    super(message);
    this.title = fields.title ?? null;
    this.videoId = fields.videoId ?? null;
    this.durationSeconds =
      typeof fields.durationSeconds === "number" ? fields.durationSeconds : null;
    this.watchMetadataOk = Boolean(fields.watchMetadataOk);
    this.code = fields.code ?? null;
    this.transcriptOk = Boolean(fields.transcriptOk);
  }
}

export async function fetchYouTubeTranscript(url: string): Promise<{
  video_id: string;
  title: string | null;
  transcript: string;
  segments: { text: string; start: number }[];
  language: string | null;
  duration_seconds: number | null;
  char_count: number;
}> {
  const res = await fetch(`${API_BASE}/youtube/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const d = detail as Record<string, unknown>;
      throw new TranscriptFetchError(
        typeof d.message === "string" ? d.message : "Failed to fetch transcript",
        {
          title: typeof d.title === "string" ? d.title : null,
          videoId: typeof d.video_id === "string" ? d.video_id : null,
          durationSeconds:
            typeof d.duration_seconds === "number" ? d.duration_seconds : null,
          watchMetadataOk: Boolean(d.watch_metadata_ok),
          code: typeof d.code === "string" ? d.code : null,
          transcriptOk: Boolean(d.transcript_ok),
        }
      );
    }
    throw new TranscriptFetchError(
      typeof detail === "string" ? detail : "Failed to fetch transcript",
      { watchMetadataOk: false }
    );
  }
  return res.json();
}

export async function fetchWebpageContent(url: string): Promise<{
  url: string;
  title: string | null;
  text: string;
  char_count: number;
  source_type: string;
}> {
  const res = await fetch(`${API_BASE}/webpage/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? "Failed to extract page content");
  }
  return res.json();
}

export async function moveDeckToCategory(deckId: string, categoryId: string | null) {
  const res = await fetch(`${API_BASE}/decks/${deckId}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category_id: categoryId }),
  });
  if (!res.ok) throw new Error("Failed to move deck");
  return res.json();
}

export async function updateDeck(
  deckId: string,
  data: { name?: string; description?: string; archived?: boolean; is_public?: boolean; category_id?: string | null }
) {
  const res = await fetch(`${API_BASE}/decks/${deckId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to update deck");

  return res.json();
}

export async function deleteDeck(deckId: string) {
  const res = await fetch(`${API_BASE}/decks/${deckId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete deck");
}

export async function deleteDeckReviews(deckId: string, userId: string) {
  const url = `${API_BASE}/decks/${deckId}/reviews?user_id=${encodeURIComponent(userId)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to reset deck progress");
  return res.json();
}

export async function getCategories(userId: string) {
  const res = await fetch(`${API_BASE}/categories?user_id=${userId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

export async function createCategory(data: { name: string; user_id: string }) {
  const res = await fetch(`${API_BASE}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to create category");
  }
  return res.json();
}

export async function updateCategory(
  id: string,
  data: { name: string },
  userId: string
) {
  const res = await fetch(`${API_BASE}/categories/${id}?user_id=${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to update category");
  }
  return res.json();
}

export async function getCategoryDecks(categoryId: string, userId: string) {
  const res = await fetch(
    `${API_BASE}/categories/${categoryId}/decks?user_id=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch category decks");
  return res.json();
}

export async function deleteCategory(id: string, userId: string) {
  const res = await fetch(`${API_BASE}/categories/${id}?user_id=${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete category");
}

export async function getFlashcards(
  deckId: string,
  options?: { dueOnly?: boolean; userId?: string; bookmarkedOnly?: boolean }
) {
  const dueOnly = options?.dueOnly ?? false;
  const userId = options?.userId;
  const bookmarkedOnly = options?.bookmarkedOnly ?? false;
  const params = new URLSearchParams();
  params.set("due_only", String(dueOnly));
  if (dueOnly && userId) {
    params.set("user_id", userId);
  }
  if (bookmarkedOnly) {
    params.set("bookmarked_only", "true");
  }
  const res = await fetch(
    `${API_BASE}/decks/${encodeURIComponent(deckId)}/flashcards?${params}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    if (res.status === 401 && bookmarkedOnly) {
      throw new Error("BOOKMARK_AUTH");
    }
    throw new Error("Failed to fetch flashcards");
  }
  return res.json();
}

export async function setFlashcardBookmark(
  flashcardId: string,
  bookmarked: boolean
): Promise<{
  id: string;
  deck_id: string;
  question: string;
  answer_short: string;
  answer_example?: string | null;
  answer_detailed?: string | null;
  difficulty: string;
  created_at: string;
  bookmarked: boolean;
}> {
  const res = await fetch(
    `${API_BASE}/flashcards/${encodeURIComponent(flashcardId)}/bookmark`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarked }),
    }
  );
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Failed to update bookmark"));
  }
  return res.json();
}

export async function createFlashcard(data: {
  deck_id: string;
  question: string;
  answer_short: string;
  answer_example?: string;
  answer_detailed?: string;
  difficulty?: string;
}) {
  const res = await fetch(`${API_BASE}/flashcards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Failed to create flashcard"));
  }

  return res.json();
}

export async function importFlashcards(data: {
  deck_id: string;
  cards: {
    question: string;
    answer_short: string;
    answer_example?: string;
    answer_detailed?: string;
  }[];
}): Promise<{ created: number; skipped: number }> {
  const res = await fetch(`${API_BASE}/flashcards/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Failed to import flashcards"));
  }
  return res.json();
}

export { parseQAPairs } from "./parse-qa-pairs";

export async function getFlashcard(flashcardId: string) {
  const res = await fetch(`${API_BASE}/flashcards/${flashcardId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch flashcard");
  return res.json();
}

export async function updateFlashcard(
  flashcardId: string,
  data: {
    question?: string;
    answer_short?: string;
    answer_example?: string | null;
    answer_detailed?: string;
    difficulty?: string;
  }
) {
  const res = await fetch(`${API_BASE}/flashcards/${flashcardId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Failed to update flashcard");

  return res.json();
}

export async function deleteFlashcard(flashcardId: string) {
  const res = await fetch(`${API_BASE}/flashcards/${flashcardId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete flashcard");
}

export async function generateFlashcards(data: {
  deck_id: string;
  topic?: string;
  text?: string;
  num_cards?: number;
  /** ISO 639-1; omit for server-side inference from source. */
  language?: string;
  /** YouTube deck + text: API log label for Gemini-first routing (optional). */
  youtube_route_reason?: "youtube_transcript" | "youtube_text";
}) {
  const { num_cards = 10, language, ...rest } = data;
  const body: Record<string, unknown> = { ...rest, num_cards };
  if (language != null && language !== "") {
    body.language = language;
  }
  const res = await fetch(`${API_BASE}/generate-flashcards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Failed to generate flashcards"));
  }

  return res.json();
}

export async function generateFlashcardsBackground(data: {
  deck_id: string;
  topic?: string;
  text?: string;
  num_cards?: number;
  /** ISO 639-1; omit for server-side inference from source. */
  language?: string;
  /** YouTube deck + text: API log label for Gemini-first routing (optional). */
  youtube_route_reason?: "youtube_transcript" | "youtube_text";
}) {
  const { num_cards = 10, language, ...rest } = data;
  const body: Record<string, unknown> = { ...rest, num_cards };
  if (language != null && language !== "") {
    body.language = language;
  }
  const res = await fetch(`${API_BASE}/generate-flashcards/background`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Failed to start generation"));
  }
  return res.json() as Promise<{ deck_id: string; status: string }>;
}

export async function submitReview(
  flashcardId: string,
  rating: "again" | "hard" | "good" | "easy",
  userId: string
) {
  const res = await fetch(`${API_BASE}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      flashcard_id: flashcardId,
      rating,
      user_id: userId,
    }),
  });

  if (!res.ok) throw new Error("Failed to submit review");

  return res.json();
}

export interface UserSettings {
  think_delay_enabled: boolean;
  think_delay_ms: number;
  card_style: "paper" | "minimal" | "modern" | "anki";
}

const _userSettingsTtl = new Map<string, _TtlEntry<UserSettings>>();

function _cloneUserSettings(s: UserSettings): UserSettings {
  return { ...s };
}

const _getUserSettingsInFlight = new Map<string, Promise<UserSettings>>();

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const t = _userSettingsTtl.get(userId);
  if (t && Date.now() < t.until) {
    return Promise.resolve(_cloneUserSettings(t.value));
  }
  const existing = _getUserSettingsInFlight.get(userId);
  if (existing) return existing;
  const p = (async (): Promise<UserSettings> => {
    try {
      const res = await fetch(`${API_BASE}/users/${userId}/settings`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch user settings");
      const data = (await res.json()) as UserSettings;
      _userSettingsTtl.set(userId, {
        value: data,
        until: Date.now() + _USER_API_HYDRATION_TTL_MS,
      });
      return data;
    } finally {
      _getUserSettingsInFlight.delete(userId);
    }
  })();
  _getUserSettingsInFlight.set(userId, p);
  return p;
}

export async function updateUserSettings(
  userId: string,
  data: Partial<UserSettings>
): Promise<UserSettings> {
  const res = await fetch(`${API_BASE}/users/${userId}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update user settings");
  const updated = (await res.json()) as UserSettings;
  _userSettingsTtl.set(userId, {
    value: updated,
    until: Date.now() + _USER_API_HYDRATION_TTL_MS,
  });
  return updated;
}
