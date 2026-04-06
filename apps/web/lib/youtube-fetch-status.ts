/**
 * UX-only status phases while awaiting POST /youtube/transcript (one long request).
 * Backend order is opaque; timers approximate typical metadata → caption work.
 */

const PHASE_TRANSCRIPT_MS = 4000;
const PHASE_PATIENCE_MS = 11000;

/**
 * Sets an initial message and advances copy on a timer. Call the returned cleanup
 * when the transcript response returns or the flow errors out.
 */
export function startYoutubeTranscriptPhaseTimers(
  setStatus: (message: string) => void
): () => void {
  setStatus("Fetching video metadata…");
  const t1 = window.setTimeout(() => {
    setStatus("Fetching transcript…");
  }, PHASE_TRANSCRIPT_MS);
  const t2 = window.setTimeout(() => {
    setStatus("Still fetching transcript — long videos can take 15–20 seconds…");
  }, PHASE_PATIENCE_MS);
  return () => {
    window.clearTimeout(t1);
    window.clearTimeout(t2);
  };
}
