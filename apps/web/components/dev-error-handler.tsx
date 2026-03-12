"use client";

import { useEffect } from "react";

/**
 * Suppress "No elements found" errors that can block navigation.
 * Often caused by browser extensions modifying the DOM.
 */
export function DevErrorHandler() {
  useEffect(() => {
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
