import Link from "next/link";

export function Nav() {
  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="font-semibold text-lg">
            Flashcard AI
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/decks"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Decks
            </Link>
            <Link
              href="/study"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Study
            </Link>
            <Link
              href="/create-deck"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Create
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
