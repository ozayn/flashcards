import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Blur the focused control before optimistic list reorder so the browser does not
 * auto-scroll the viewport to follow the control into its new layout position.
 */
export function blurActiveElementToAvoidScrollOnReorder(): void {
  if (typeof document === "undefined") return
  const el = document.activeElement
  if (el instanceof HTMLElement) el.blur()
}
