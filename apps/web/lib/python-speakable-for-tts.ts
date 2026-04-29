/**
 * Heuristic transforms for Python source so Web Speech reads it more naturally.
 * Used only for TTS — display rendering is unchanged (callers pass markdown through display paths).
 */

const SMALL_INT_WORDS: Record<number, string> = {
  0: "zero",
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
  11: "eleven",
  12: "twelve",
  13: "thirteen",
  14: "fourteen",
  15: "fifteen",
  16: "sixteen",
  17: "seventeen",
  18: "eighteen",
  19: "nineteen",
  20: "twenty",
};

function intToSpeech(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const neg = n < 0 ? "negative " : "";
  if (abs >= 0 && abs <= 20 && SMALL_INT_WORDS[abs]) return neg + SMALL_INT_WORDS[abs]!;
  if (abs > 20 && abs < 100) {
    const tens = Math.floor(abs / 10);
    const ones = abs % 10;
    const t =
      tens === 2
        ? "twenty"
        : tens === 3
          ? "thirty"
          : tens === 4
            ? "forty"
            : tens === 5
              ? "fifty"
              : tens === 6
                ? "sixty"
                : tens === 7
                  ? "seventy"
                  : tens === 8
                    ? "eighty"
                    : tens === 9
                      ? "ninety"
                      : "";
    if (!t) return neg + String(abs);
    const body = ones ? `${t} ${SMALL_INT_WORDS[ones]}` : t;
    return neg + body;
  }
  const digits = String(abs)
    .split("")
    .map((d) => (/\d/.test(d) ? SMALL_INT_WORDS[Number(d)] ?? d : d))
    .join(" ");
  return neg + digits;
}

function floatToSpeech(raw: string): string {
  const m = /^(-?)(\d+)\.(\d+)$/.exec(raw.trim());
  if (!m) return raw;
  const neg = m[1] ? "negative " : "";
  const intPart = Number(m[2]);
  const frac = m[3]!;
  const intSp =
    intPart >= 0 && intPart <= 20 && SMALL_INT_WORDS[intPart]
      ? SMALL_INT_WORDS[intPart]!
      : intToSpeech(intPart);
  const fracSp = frac
    .split("")
    .map((ch) => (/\d/.test(ch) ? SMALL_INT_WORDS[Number(ch)] ?? ch : ch))
    .join(" ");
  return `${neg}${intSp} point ${fracSp}`.trim();
}

function escapeRegExpLiteral(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Curated token → spoken phrase for DS/ML-style Python (TTS only).
 * Longest tokens first so `iloc` wins over `loc`, `train_test_split` stays one phrase, etc.
 */
const PYTHON_TOKEN_SPEECH: readonly [string, string][] = [
  ["RandomForestClassifier", "random forest classifier"],
  ["classification_report", "classification report"],
  ["LogisticRegression", "logistic regression"],
  ["confusion_matrix", "confusion matrix"],
  ["train_test_split", "train test split"],
  ["cross_val_score", "cross val score"],
  ["StandardScaler", "standard scaler"],
  ["predict_proba", "predict probability"],
  ["fillna", "fill N A"],
  ["dropna", "drop N A"],
  ["groupby", "group by"],
  ["iloc", "eye lock"],
  ["sklearn", "scikit learn"],
  ["kwargs", "keyword args"],
  ["__init__", "dunder init"],
  ["__name__", "dunder name"],
  ["len", "length"],
  ["loc", "lock"],
].sort((a, b) => b[0].length - a[0].length);

/** Must run before `**` / `*` operator rules. */
const PYTHON_PRONUNCIATION_PREFIX: readonly [RegExp, string][] = [
  [/\*\*kwargs\b/g, " keyword args "],
  [/\*args\b/g, " positional args "],
  /** Conventional aliases: spell letters so we do not say “pandas” twice after “import pandas”. */
  [/\bas\s+pd\b/gi, " as P D "],
  [/\bas\s+np\b/gi, " as N P "],
  [/\bas\s+plt\b/gi, " as P L T "],
  [/\bas\s+df\b/gi, " as D F "],
  [/\bpd(?=\.)/g, "pandas"],
  [/\bnp(?=\.)/g, "numpy"],
  [/\bplt(?=\.)/g, "pyplot"],
  [/\bdf(?=\.)/g, "data frame"],
];

/**
 * Replace common Python / DS / ML identifiers with friendlier spoken phrases.
 * Applied only on the Python TTS preprocessing path.
 */
export function applyPythonPronunciationDictionary(s: string): string {
  let out = s;
  for (const [rx, rep] of PYTHON_PRONUNCIATION_PREFIX) {
    out = out.replace(rx, rep);
  }
  for (const [token, spoken] of PYTHON_TOKEN_SPEECH) {
    const rx = new RegExp(`\\b${escapeRegExpLiteral(token)}\\b`, "g");
    out = out.replace(rx, ` ${spoken} `);
  }
  return out;
}

/**
 * Replace ```python / ```py fenced regions with speakable prose (no backticks).
 * Unknown fence languages are left unchanged for existing stripping behavior.
 */
export function replacePythonFencedBlocksForSpeech(markdown: string): string {
  const re = /```\s*(?:python|py)\b\s*\r?\n([\s\S]*?)```/gi;
  return markdown.replace(re, (_full, body: string) => {
    const spoken = pythonSourceToSpeakableText(String(body));
    return spoken.trim() ? `\n${spoken.trim()}\n` : "\n";
  });
}

function looksLikeInlinePythonSnippet(t: string): boolean {
  const s = t.trim();
  if (s.length < 2 || s.length > 120) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  if (/_/.test(s)) return true;
  if (/===|==|!=|<=|>=|:=|->|\*\*/.test(s)) return true;
  if (/\d+\.\d+/.test(s)) return true;
  if (/\b(import|from|def|class|return|lambda)\b/.test(s)) return true;
  return false;
}

/**
 * Single-line `...` spans that look like Python snippets get the same heuristics as fenced bodies.
 * Prose in backticks (no code-like signals) is left unchanged so later stripping keeps normal words.
 */
export function replaceInlinePythonBackticksForSpeech(markdown: string): string {
  return markdown.replace(/`([^`\n]+)`/g, (full, inner: string) => {
    if (!looksLikeInlinePythonSnippet(inner)) return full;
    return pythonSourceToSpeakableText(String(inner));
  });
}

function expandAttributeDots(s: string): string {
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/(\w)\.(\w)/g, "$1 dot $2");
    s = s.replace(/(\w)\s*\.\s*(\w)/g, "$1 dot $2");
  }
  return s;
}

/**
 * Turn a Python code fragment into friendlier speakable English.
 * Conservative heuristics only — not a parser.
 */
export function pythonSourceToSpeakableText(code: string): string {
  let s = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/^\s*#.*$/gm, " ");
  s = s.replace(/\/\/[^\n]*/g, " ");
  s = s.replace(/\n+/g, " ");

  s = applyPythonPronunciationDictionary(s);

  s = s.replace(/\b-?\d+\.\d+\b/g, (m) => floatToSpeech(m));

  s = s.replace(/\b0x[0-9a-fA-F]+\b/g, (m) => `${m.slice(2)} hexadecimal`);

  s = s.replace(/\b(?:True|False|None)\b/g, (w) => w.toLowerCase());

  s = s.replace(/\b-?\d+\b/g, (m) => intToSpeech(Number(m)));

  const opReplacements: [RegExp, string][] = [
    [/\*\*/g, " to the power "],
    [/\/\//g, " integer divide "],
    [/==/g, " is equal to "],
    [/!=/g, " not equal to "],
    [/<=/g, " at most "],
    [/>=/g, " at least "],
    [/&&/g, " and "],
    [/\|\|/g, " or "],
    [/->/g, " returns "],
    [/\+=/g, " plus equals "],
    [/\-=/g, " minus equals "],
    [/\*=/g, " times equals "],
    [/\/=/g, " divide equals "],
    [/%=/g, " mod equals "],
    [/:=/g, " walrus "],
    [/@/g, " at "],
    [/%/g, " mod "],
    [/\//g, " divided by "],
    [/\*/g, " times "],
    [/\+/g, " plus "],
    [/=(?!=)/g, " equals "],
    [/<(?![=])/g, " less than "],
    [/(?<![=<])>(?!=)/g, " greater than "],
  ];
  for (const [rx, rep] of opReplacements) {
    s = s.replace(rx, rep);
  }

  s = s.replace(/\s-\s/g, " minus ");
  s = s.replace(/\(\s*-/g, "( negative ");

  s = s.replace(/[,;]/g, " ");
  s = s.replace(/[\(\)\{\}\[\]]/g, " ");

  s = s.replace(/_+/g, " ");

  s = expandAttributeDots(s);

  s = s.replace(
    /\b(def|class|import|from|return|if|else|elif|for|while|in|not|and|or|as|with|try|except|finally|raise|pass|break|continue|lambda|yield|async|await)\b/gi,
    (_, kw: string) => ` ${kw.toLowerCase()} `
  );

  s = s.replace(/\s+/g, " ").trim();
  return s;
}
