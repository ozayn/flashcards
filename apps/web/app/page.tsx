"use client";

import Link from "next/link";
import { FileText, Sparkles, BookOpen } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Flashcard } from "@/components/Flashcard";
import { GenerateInput } from "@/components/GenerateInput";
import { Button } from "@/components/ui/button";

const EXAMPLE_TOPICS = [
  "Roman mythology",
  "World War II",
  "Machine learning",
  "Spanish vocabulary",
  "Biology basics",
];

const DEMO_CARDS = [
  { front: "Who is the Roman god of the sea?", back: "Neptune" },
  { front: "Who is the Roman god of war?", back: "Mars" },
  { front: "Who is the king of the Roman gods?", back: "Jupiter" },
];

export default function LandingPage() {
  return (
    <div data-landing className="min-h-screen bg-background text-foreground">
      <main>
        {/* 2. Hero Section */}
        <section className="pt-20 pb-16 md:pt-28 md:pb-24 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground max-w-3xl mx-auto leading-tight">
            Learn anything instantly.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Turn information into memory with AI-generated flashcards.
          </p>
          <div className="mt-12">
            <GenerateInput
              placeholder="Paste text or enter a topic…"
              suggestions={[
                "Roman gods",
                "Quantum mechanics basics",
                "Spanish travel vocabulary",
                "The French Revolution",
              ]}
            />
          </div>
        </section>

        {/* 3. Demo Flashcards Preview */}
        <section className="py-20 md:py-28">
          <div className="flex flex-col items-center">
            <p className="text-sm font-medium text-muted-foreground mb-8">
              Preview
            </p>
            <div className="relative w-full max-w-sm">
              {DEMO_CARDS.map((card, i) => (
                <div
                  key={i}
                  className="absolute w-full"
                  style={{
                    top: `${i * 12}px`,
                    left: `${i * 8}px`,
                    zIndex: DEMO_CARDS.length - i,
                  }}
                >
                  <Flashcard
                    front={card.front}
                    back={card.back}
                    className="aspect-[3/4] min-h-[180px]"
                  />
                </div>
              ))}
              <div className="h-[240px]" />
            </div>
          </div>
        </section>

        {/* 4. How It Works */}
        <section className="py-20 md:py-28 border-t border-border">
          <h2 className="text-2xl font-semibold text-center mb-16">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl border border-border bg-muted/50">
                <FileText className="size-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium">Step 1</h3>
              <p className="text-muted-foreground text-sm">
                Paste text or enter a topic
              </p>
            </div>
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl border border-border bg-muted/50">
                <Sparkles className="size-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium">Step 2</h3>
              <p className="text-muted-foreground text-sm">
                AI generates flashcards
              </p>
            </div>
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl border border-border bg-muted/50">
                <BookOpen className="size-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium">Step 3</h3>
              <p className="text-muted-foreground text-sm">
                Study instantly
              </p>
            </div>
          </div>
        </section>

        {/* 5. Example Topics */}
        <section className="py-20 md:py-28 border-t border-border">
          <h2 className="text-2xl font-semibold text-center mb-8">
            Try a topic
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {EXAMPLE_TOPICS.map((topic) => (
              <Link
                key={topic}
                href={`/create-deck?topic=${encodeURIComponent(topic)}`}
                className="px-4 py-2 rounded-xl border border-border bg-background text-sm font-medium hover:bg-muted transition-colors"
              >
                {topic}
              </Link>
            ))}
          </div>
        </section>

        {/* 6. Value Proposition */}
        <section className="py-20 md:py-28 border-t border-border">
          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Learn faster</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Turn articles and notes into flashcards automatically.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Understand deeply</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Active recall helps you retain knowledge.
              </p>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Study anywhere</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Access your decks anytime.
              </p>
            </div>
          </div>
        </section>

        {/* 7. CTA */}
        <section className="py-20 md:py-28 border-t border-border text-center">
          <h2 className="text-3xl font-semibold mb-6">
            Start learning smarter.
          </h2>
          <Link href="/create-deck">
            <Button size="lg" className="rounded-xl px-8 font-medium">
              Create Flashcards
            </Button>
          </Link>
        </section>

        {/* 8. Footer */}
        <footer className="py-12 border-t border-border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-2">
              <Logo size="sm" />
              <span className="font-medium text-sm">MemoNext — Learn anything instantly.</span>
            </Link>
            <div className="flex items-center gap-8">
              <Link
                href="/about"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                About
              </Link>
              <Link
                href="/privacy"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
