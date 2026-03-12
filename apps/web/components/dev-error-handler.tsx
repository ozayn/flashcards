"use client";

import { useEffect } from "react";

/**
 * Suppress "No elements found" errors during Fast Refresh.
 * These come from Radix/Base UI when the DOM is replaced mid-interaction.
 */
export function DevErrorHandler() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const handleRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message ?? String(e.reason ?? "");
      if (msg.includes("No elements found") || msg.includes("No elements")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("unhandledrejection", handleRejection, true);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  return null;
}
