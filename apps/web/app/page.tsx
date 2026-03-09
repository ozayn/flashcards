import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Flashcard AI
        </h1>
        <p className="text-muted-foreground">
          Learn smarter with AI-powered flashcards
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/decks"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/80 w-full sm:w-auto"
          >
            Browse Decks
          </Link>
          <Link
            href="/create-deck"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-medium hover:bg-muted w-full sm:w-auto"
          >
            Create Deck
          </Link>
        </div>
      </div>
    </main>
  );
}
