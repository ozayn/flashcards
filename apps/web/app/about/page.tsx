import Link from "next/link";
import PageContainer from "@/components/layout/page-container";
import { MemoNextSupportBlurb } from "@/components/memonext-support";

export default function AboutPage() {
  return (
    <PageContainer className="max-w-2xl mx-auto w-full" hideSupportFooter>
      <article className="pb-2">
        <nav
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mb-10"
          aria-label="Quick links"
        >
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <span className="text-border select-none" aria-hidden>
            /
          </span>
          <Link href="/library" className="hover:text-foreground transition-colors">
            Library
          </Link>
          <span className="text-border select-none" aria-hidden>
            /
          </span>
          <Link href="/decks" className="hover:text-foreground transition-colors">
            Decks
          </Link>
        </nav>

        <header className="border-b border-border/50 pb-10 mb-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/90 mb-3">
            MemoNext
          </p>
          <h1 className="text-3xl sm:text-[2rem] font-semibold tracking-tight text-foreground">
            About
          </h1>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-lg">
            The ideas behind how MemoNext schedules reviews and helps you remember.
          </p>
        </header>

        <div className="space-y-14">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Spaced repetition
            </h2>
            <p className="text-[0.9375rem] leading-[1.7] text-muted-foreground">
              Reviews are scheduled at increasing intervals based on how well you remember
              each card. This is rooted in research on the forgetting curve—you review just
              before you&apos;re about to forget, making each session more effective.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Active recall
            </h2>
            <p className="text-[0.9375rem] leading-[1.7] text-muted-foreground">
              Flashcards push you to retrieve information rather than passively re-read it.
              Each successful recall strengthens the memory trace, making it easier to remember
              next time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              AI-generated cards
            </h2>
            <p className="text-[0.9375rem] leading-[1.7] text-muted-foreground">
              Provide a topic or paste text, and the AI creates question-answer pairs for you.
              You can edit or add your own cards to customize your learning.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Adaptive learning
            </h2>
            <p className="text-[0.9375rem] leading-[1.7] text-muted-foreground">
              Cards you struggle with appear more often, while mastered cards appear less
              frequently. By rating cards as Again, Hard, Good, or Easy, you guide the
              algorithm to focus your time where it matters.
            </p>
          </section>
        </div>

        <MemoNextSupportBlurb />
      </article>
    </PageContainer>
  );
}
