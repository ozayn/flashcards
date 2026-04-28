import { getMemoNextSupportUrl } from "@/lib/memonext-support";

export default function PageContainer({
  children,
  className,
  hideSupportFooter,
}: {
  children: React.ReactNode;
  className?: string;
  /** When true, omit the bottom “Support this project” row (e.g. page supplies its own support block). */
  hideSupportFooter?: boolean;
}) {
  const supportUrl = getMemoNextSupportUrl();
  return (
    <main className={`space-y-6 ${className ?? ""}`.trim()}>
      {children}
      {!hideSupportFooter && supportUrl ? (
        <div className="pt-6 mt-2 border-t border-border/25 text-center">
          <a
            href={supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Support this project
          </a>
        </div>
      ) : null}
    </main>
  );
}
