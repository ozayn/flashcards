"use client";

import { Prism } from "prism-react-renderer";

let registered = false;

/** prism-react-renderer ships python/js/sql; attach bash from prismjs. */
export function registerPrismBash(): void {
  if (registered) return;
  if (Prism.languages.bash) {
    registered = true;
    return;
  }
  (globalThis as unknown as { Prism: typeof Prism }).Prism = Prism;
  // Side effect: extends Prism.languages (CommonJS component).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("prismjs/components/prism-bash.js");
  registered = true;
}
