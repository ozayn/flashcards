"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function StudyContent() {
  const searchParams = useSearchParams();
  const deckId = searchParams.get("deck");

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href={deckId ? `/decks/${deckId}` : "/decks"}
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Study Session</CardTitle>
            <CardDescription>
              {deckId
                ? `Studying deck ${deckId}`
                : "Select a deck to start studying"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Study mode will be implemented here.
            </p>
            {!deckId && (
              <Link
                href="/decks"
                className="mt-4 inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
              >
                Choose a Deck
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-6 flex items-center justify-center">Loading...</div>}>
      <StudyContent />
    </Suspense>
  );
}
