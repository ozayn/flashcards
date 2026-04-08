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
