"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { GenerateInput } from "@/components/GenerateInput";

export default function LandingPage() {
  return (
    <div data-landing className="min-h-screen bg-background text-foreground">
      <main className="max-w-3xl mx-auto px-6 md:px-8">
        <section className="pt-24 pb-10 md:pt-32 md:pb-14 text-center">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
            Turn anything into flashcards.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-md mx-auto">
            Enter a topic, or paste a YouTube or Wikipedia link.
          </p>
          <div className="mt-8">
            <GenerateInput
              placeholder="Topic, YouTube link, Wikipedia URL…"
              suggestions={[
                "Roman gods",
                "Quantum mechanics",
                "The French Revolution",
              ]}
            />
          </div>
          <p className="mt-6 text-xs text-muted-foreground/70">
            <Link href="/create-deck" className="hover:text-muted-foreground transition-colors">
              Create manually
            </Link>
            {" · "}
            <Link href="/decks" className="hover:text-muted-foreground transition-colors">
              My decks
            </Link>
          </p>
        </section>

        <footer className="py-8 border-t border-border/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground/60">
            <Link href="/" className="flex items-center gap-1.5 hover:text-muted-foreground transition-colors">
              <Logo size="sm" />
              <span className="font-medium">MemoNext</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-muted-foreground transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-muted-foreground transition-colors">Privacy</Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
