/**
 * Map fence info string (```python) to a Prism grammar name we register.
 * Only these get syntax highlighting; anything else stays plain monospace.
 */

const ALIASES: Record<string, "python" | "javascript" | "sql" | "bash"> = {
  python: "python",
  py: "python",
  python3: "python",
  javascript: "javascript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  sql: "sql",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
};

export type SupportedFencePrismLang = "python" | "javascript" | "sql" | "bash";

export function resolveFencePrismLanguage(
  info: string | undefined
): SupportedFencePrismLang | null {
  const raw = info?.trim().toLowerCase();
  if (!raw) return null;
  return ALIASES[raw] ?? null;
}
