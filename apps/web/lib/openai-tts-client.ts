/**
 * Client helpers for OpenAI TTS: fetch MP3 via the MemoNext proxy and play with HTMLAudioElement.
 *
 * Architecture mirrors Planlet's narration playback (buffered MP3 → blob URL → <audio>),
 * adapted to MemoNext's single-request card segments rather than plan/chunk sessions.
 */

/** Same-origin proxy base used by `lib/api.ts` — keep in sync. */
const API_BASE = "/api/proxy";

export type OpenAiSpeechFetchParams = {
  text: string;
  voice?: string;
  speed?: number;
  language?: string;
  signal?: AbortSignal;
};

export class OpenAiSpeechClientError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "OpenAiSpeechClientError";
    this.status = status;
  }
}

/**
 * POST /speech/openai through the same-origin proxy. Returns a Blob of audio/mpeg.
 * Never sends OPENAI_API_KEY — the API synthesizes server-side.
 */
export async function fetchOpenAiSpeechAudio(
  params: OpenAiSpeechFetchParams,
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/speech/openai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: params.text,
      voice: params.voice,
      speed: params.speed ?? 1.0,
      language: params.language,
    }),
    signal: params.signal,
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = "OpenAI voice failed.";
    try {
      const json = (await res.json()) as { detail?: string | { msg?: string }[] };
      if (typeof json.detail === "string") detail = json.detail;
      else if (Array.isArray(json.detail) && json.detail[0]?.msg) {
        detail = String(json.detail[0].msg);
      }
    } catch {
      /* keep default */
    }
    throw new OpenAiSpeechClientError(detail, res.status);
  }

  const blob = await res.blob();
  if (!blob || blob.size === 0) {
    throw new OpenAiSpeechClientError("OpenAI returned empty audio.", res.status);
  }
  // Some proxies strip Content-Type; force a playable MPEG type when missing.
  if (!blob.type || blob.type === "application/octet-stream") {
    return new Blob([blob], { type: "audio/mpeg" });
  }
  return blob;
}

export type OpenAiSpeechStatus = {
  available: boolean;
  reason: string | null;
  model: string;
  default_voice: string;
  voices: string[];
  max_input_chars: number;
  requires_sign_in: boolean;
  paid_plan_required: boolean;
};

export async function fetchOpenAiSpeechStatus(): Promise<OpenAiSpeechStatus> {
  const res = await fetch(`${API_BASE}/speech/openai/status`, { cache: "no-store" });
  if (!res.ok) {
    return {
      available: false,
      reason: "unavailable",
      model: "gpt-4o-mini-tts",
      default_voice: "fable",
      voices: [],
      max_input_chars: 3500,
      requires_sign_in: true,
      paid_plan_required: false,
    };
  }
  return res.json() as Promise<OpenAiSpeechStatus>;
}

/** Play a blob once; resolves on ended / error / abort. */
export function playAudioBlob(
  blob: Blob,
  signal?: AbortSignal,
): Promise<"ok" | "aborted"> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve("aborted");
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    let settled = false;

    const cleanup = () => {
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
    };

    const settle = (r: "ok" | "aborted") => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      cleanup();
      resolve(r);
    };

    const onAbort = () => settle("aborted");

    audio.onended = () => settle("ok");
    audio.onerror = () => settle("aborted");
    signal?.addEventListener("abort", onAbort, { once: true });

    void audio.play().catch(() => settle("aborted"));
  });
}
