import Link from "next/link";

/**
 * Persistent admin area navigation so Generation analytics is not buried.
 */
export function AdminSubnav({
  active,
}: {
  active: "users" | "generation";
}) {
  const item = (key: typeof active, href: string, label: string) => {
    const on = active === key;
    return (
      <Link
        href={href}
        className={
          on
            ? "rounded-md bg-muted px-3 py-1.5 text-sm font-semibold text-foreground"
            : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        }
        aria-current={on ? "page" : undefined}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-border/70 bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-3 sm:px-6">
        <span className="mr-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Admin
        </span>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Admin sections">
          {item("users", "/admin", "Users")}
          {item("generation", "/admin/generation-analytics", "Generation analytics")}
        </nav>
      </div>
    </header>
  );
}
