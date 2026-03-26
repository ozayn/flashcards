"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { GenerateInput } from "@/components/GenerateInput";

export default function LandingPage() {
  return (
    <div data-landing className="min-h-screen bg-background text-foreground">
      <main className="max-w-3xl mx-auto px-6 md:px-8">
        <section className="pt-24 pb-12 md:pt-32 md:pb-16 text-center">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
            Turn any topic into flashcards.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-md mx-auto">
            Enter a topic, get a study deck instantly.
          </p>
          <div className="mt-10">
            <GenerateInput
              placeholder="e.g. Quantum mechanics, Spanish verbs, The French Revolution…"
              suggestions={[
                "Roman gods",
                "Quantum mechanics",
                "Spanish vocabulary",
                "The French Revolution",
              ]}
            />
          </div>
        </section>

        <section className="py-10 border-t border-border/40 text-center">
          <p className="text-sm text-muted-foreground">
            Or{" "}
            <Link href="/create-deck" className="text-foreground font-medium hover:underline">
              create a deck manually
            </Link>
            {" · "}
            <Link href="/decks" className="text-foreground font-medium hover:underline">
              browse your decks
            </Link>
          </p>
        </section>

        <footer className="py-10 border-t border-border/40">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <Link href="/" className="flex items-center gap-2">
              <Logo size="sm" />
              <span className="font-medium">MemoNext</span>
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
