import { getMemoNextSupportUrl } from "@/lib/memonext-support";

/** Short explanation + “Support this project” link. Renders nothing when the URL is unset. */
export function MemoNextSupportBlurb() {
  const url = getMemoNextSupportUrl();
  if (!url) return null;
  return (
    <div className="mt-6 pt-6 border-t border-border/25">
      <p className="text-xs text-muted-foreground/85 leading-relaxed max-w-md mx-auto text-center">
        MemoNext is an independent learning project built as a personal passion project.
        If you find it useful, you can support its continued development.
      </p>
      <p className="mt-3 text-center">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Support this project
        </a>
      </p>
    </div>
  );
}

type MemoNextSupportFooterLinkProps = {
  className?: string;
  /** e.g. close mobile menu when opening external support link */
  onClick?: () => void;
};

/** Single subtle link for nav menus / compact placements. */
export function MemoNextSupportFooterLink({
  className,
  onClick,
}: MemoNextSupportFooterLinkProps) {
  const url = getMemoNextSupportUrl();
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      Support
    </a>
  );
}
