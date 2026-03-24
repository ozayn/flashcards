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
import PageContainer from "@/components/layout/page-container";

function StudyContent() {
  const searchParams = useSearchParams();
  const deckId = searchParams.get("deck");

  return (
    <PageContainer>
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
                className="mt-4 inline-flex h-8 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 px-2.5 text-sm font-medium max-mobile:min-h-[44px] max-mobile:rounded-[10px] max-mobile:font-semibold max-mobile:text-[15px]"
              >
                Choose a Deck
              </Link>
            )}
          </CardContent>
        </Card>
    </PageContainer>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={<PageContainer><div className="flex items-center justify-center">Loading...</div></PageContainer>}>
      <StudyContent />
    </Suspense>
  );
}
