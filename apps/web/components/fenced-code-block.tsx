"use client";

import { useEffect, useState } from "react";
import { Highlight, Prism, themes } from "prism-react-renderer";
import { cn } from "@/lib/utils";
import { resolveFencePrismLanguage } from "@/lib/fenced-code-prism-lang";
import { registerPrismBash } from "@/lib/prism-register-bash";

function useDocumentDarkClass(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

const preBox =
  "my-2 min-w-0 max-w-full overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 text-left text-sm leading-relaxed dark:bg-muted/30";

function PlainFencedBlock({ body }: { body: string }) {
  return (
    <pre className={preBox}>
      <code className="font-mono text-foreground">{body}</code>
    </pre>
  );
}

export function FencedCodeBlock({ body, info }: { body: string; info?: string }) {
  const dark = useDocumentDarkClass();
  const prismLang = resolveFencePrismLanguage(info);

  if (!prismLang) {
    return <PlainFencedBlock body={body} />;
  }

  if (prismLang === "bash") {
    registerPrismBash();
  }
  if (!Prism.languages[prismLang]) {
    return <PlainFencedBlock body={body} />;
  }

  const theme = dark ? themes.vsDark : themes.github;

  return (
    <Highlight theme={theme} code={body} language={prismLang}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={cn(preBox, className)}
          style={{
            ...style,
            margin: 0,
            backgroundColor: "transparent",
            backgroundImage: "none",
          }}
        >
          <code className="font-mono text-[13px] leading-relaxed">
            {tokens.map((line, lineIndex) => (
              <span
                key={lineIndex}
                {...getLineProps({ line })}
                className="block whitespace-pre"
              >
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} {...getTokenProps({ token })} />
                ))}
              </span>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
}
