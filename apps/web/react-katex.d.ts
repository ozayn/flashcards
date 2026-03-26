declare module "react-katex" {
  import type { ReactNode } from "react";

  interface KaTeXProps {
    math: string;
    errorColor?: string;
    strict?: boolean | string | ((...args: unknown[]) => unknown);
    settings?: Record<string, unknown>;
    renderError?: (error: Error) => ReactNode;
  }

  export function BlockMath(props: KaTeXProps): ReactNode;
  export function InlineMath(props: KaTeXProps): ReactNode;
}
