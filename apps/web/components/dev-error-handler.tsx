"use client";

import { useEffect } from "react";
import { unregisterStaleServiceWorkers } from "@/lib/unregister-stale-service-workers";

/**
 * Suppress "No elements found" errors that can block navigation.
 * Often caused by browser extensions modifying the DOM.
 */
export function DevErrorHandler() {
  useEffect(() => {
    unregisterStaleServiceWorkers().then((removed) => {
      if (process.env.NODE_ENV === "development" && removed > 0) {
        console.info(
          `[MemoNext] Unregistered ${removed} stale service worker(s); /sw.js should no longer be requested.`,
        );
      }
    });
    const handleRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message ?? String(e.reason ?? "");
      if (msg.includes("No elements found") || msg.includes("No elements")) {
        e.preventDefault();
        e.stopPropagation();
        return true;
      }
    };

    const handleError = (e: ErrorEvent) => {
      const msg = e.message ?? String(e.error ?? "");
      if (msg.includes("No elements found") || msg.includes("No elements")) {
        e.preventDefault();
        return true;
      }
    };

    window.addEventListener("unhandledrejection", handleRejection, true);
    window.addEventListener("error", handleError, true);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return null;
}
