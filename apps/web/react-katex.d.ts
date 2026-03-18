declare module "react-katex" {
  import type { ReactNode } from "react";

  interface KaTeXProps {
    math: string;
    errorColor?: string;
    renderError?: (error: Error) => ReactNode;
  }

  export function BlockMath(props: KaTeXProps): ReactNode;
  export function InlineMath(props: KaTeXProps): ReactNode;
}
