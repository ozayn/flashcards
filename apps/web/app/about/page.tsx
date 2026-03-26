import Link from "next/link";
import PageContainer from "@/components/layout/page-container";

export default function AboutPage() {
  return (
    <PageContainer>
      <div className="flex items-center gap-4">
        <Link
          href="/decks"
          className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
        >
          ← Back
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">About</h1>
        <p className="text-muted-foreground text-sm mt-1">
          The learning techniques behind MemoNext.
        </p>
      </div>

      <div className="space-y-10">
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Spaced Repetition</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Reviews are scheduled at increasing intervals based on how well you
            remember each card. This is rooted in research on the forgetting
            curve — you review just before you&apos;re about to forget, making
            each session more effective.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Active Recall</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Flashcards force your brain to retrieve information rather than
            passively re-read it. Each successful recall strengthens the memory
            trace, making it easier to remember next time.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">AI-Generated Cards</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Provide a topic or paste text, and the AI creates question-answer
            pairs for you. You can edit or add your own cards to customize your
            learning.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Adaptive Learning</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Cards you struggle with appear more often, while mastered cards
            appear less frequently. By rating cards as Again, Hard, Good, or
            Easy, you guide the algorithm to focus your time where it matters.
          </p>
        </section>
      </div>
    </PageContainer>
  );
}
