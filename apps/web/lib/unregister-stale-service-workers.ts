/**
 * MemoNext does not ship a service worker (no offline cache). If the browser still
 * has an old registration for `/sw.js` (e.g. from another localhost app or a prior
 * experiment), the runtime will keep fetching `/sw.js` on every navigation until it
 * is unregistered.
 */
export async function unregisterStaleServiceWorkers(): Promise<number> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return 0;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  let removed = 0;
  for (const registration of registrations) {
    const ok = await registration.unregister();
    if (ok) removed += 1;
  }
  return removed;
}

/** Inline script for `beforeInteractive` — runs as early as possible on the client. */
export const UNREGISTER_STALE_SERVICE_WORKERS_SCRIPT = `
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        regs.forEach(function(r) { r.unregister(); });
      });
    }
  } catch (e) {}
`;
