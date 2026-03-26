"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { GenerateInput } from "@/components/GenerateInput";
import { Button } from "@/components/ui/button";

const EXAMPLE_TOPICS = [
  "Roman mythology",
  "World War II",
  "Machine learning",
  "Spanish vocabulary",
  "Biology basics",
];

export default function LandingPage() {
  return (
    <div data-landing className="min-h-screen bg-background text-foreground">
      <main className="max-w-3xl mx-auto px-6 md:px-8">
        <section className="pt-24 pb-16 md:pt-32 md:pb-20 text-center">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
            Learn anything instantly.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto">
            Turn any topic or text into flashcards with AI.
          </p>
          <div className="mt-10">
            <GenerateInput
              placeholder="Enter a topic or paste text…"
              suggestions={[
                "Roman gods",
                "Quantum mechanics basics",
                "Spanish travel vocabulary",
                "The French Revolution",
              ]}
            />
          </div>
        </section>

        <section className="py-12 md:py-16 border-t border-border/60">
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_TOPICS.map((topic) => (
              <Link
                key={topic}
                href={`/create-deck?topic=${encodeURIComponent(topic)}`}
                className="px-3.5 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
              >
                {topic}
              </Link>
            ))}
          </div>
        </section>

        <section className="py-16 md:py-20 border-t border-border/60 text-center">
          <h2 className="text-xl font-semibold mb-10">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8 text-sm">
            <div className="space-y-2">
              <p className="font-medium text-foreground">1. Add content</p>
              <p className="text-muted-foreground">Paste text or enter a topic.</p>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground">2. Generate cards</p>
              <p className="text-muted-foreground">AI creates question-answer pairs.</p>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground">3. Review & learn</p>
              <p className="text-muted-foreground">Study with spaced repetition.</p>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20 border-t border-border/60 text-center">
          <h2 className="text-2xl font-semibold mb-5">
            Start learning smarter.
          </h2>
          <Link href="/create-deck">
            <Button size="lg" className="rounded-xl px-8 font-medium">
              Create Flashcards
            </Button>
          </Link>
        </section>

        <footer className="py-10 border-t border-border/60">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <Link href="/" className="flex items-center gap-2">
              <Logo size="sm" />
              <span className="font-medium">MemoNext</span>
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
