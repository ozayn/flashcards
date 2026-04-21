/**
 * Insert wrappers around the current selection in a controlled input/textarea.
 */

export function wrapFieldSelection(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  onChange: (next: string) => void,
  open: string,
  close: string
): void {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const selected = value.slice(start, end);
  const insertion = open + selected + close;
  const next = value.slice(0, start) + insertion + value.slice(end);
  onChange(next);
  const innerLen = selected.length;
  const selStart = start + open.length;
  const selEnd = selStart + innerLen;
  queueMicrotask(() => {
    el.focus();
    try {
      el.setSelectionRange(selStart, selEnd);
    } catch {
      /* ignore */
    }
  });
}

const FENCED_OPEN = "```\n";
const FENCED_CLOSE = "\n```";

/** Pure transform; exported for tests. */
export function buildFencedCodeBlockWrap(
  value: string,
  start: number,
  end: number
): { next: string; selStart: number; selEnd: number } {
  const selected = value.slice(start, end);
  const insertion = FENCED_OPEN + selected + FENCED_CLOSE;
  const next = value.slice(0, start) + insertion + value.slice(end);
  const selStart = start + FENCED_OPEN.length;
  const selEnd = selStart + selected.length;
  return {
    next,
    selStart,
    selEnd: selected.length === 0 ? selStart : selEnd,
  };
}

/**
 * Wrap the selection in a fenced code block (triple backticks on their own lines).
 * Empty selection inserts an empty block and leaves the caret between the fences.
 */
export function wrapFencedCodeBlockSelection(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  onChange: (next: string) => void
): void {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const { next, selStart, selEnd } = buildFencedCodeBlockWrap(value, start, end);
  onChange(next);
  queueMicrotask(() => {
    el.focus();
    try {
      el.setSelectionRange(selStart, selEnd);
    } catch {
      /* ignore */
    }
  });
}
