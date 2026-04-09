/**
 * Infer ltr vs rtl from card text (first strong directional character).
 * Matches typical browser dir=auto behavior for question/answer bodies; used where
 * English UI labels would skew dir=auto on a wrapper.
 */

const _STRONG_LTR = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

/** Hebrew, Arabic, Syriac, Thaana, NKo, Arabic presentation forms, etc. */
const _STRONG_RTL = /[\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function inferTextDirection(
  ...parts: (string | null | undefined)[]
): "ltr" | "rtl" {
  const s = parts.filter((p): p is string => Boolean(p && p.trim())).join("\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (_STRONG_RTL.test(ch)) return "rtl";
    if (_STRONG_LTR.test(ch)) return "ltr";
  }
  return "ltr";
}
