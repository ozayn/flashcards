import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

        <h1 className="text-2xl font-semibold tracking-tight">About</h1>
        <p className="text-muted-foreground">
          Learn about the learning techniques used in the MemoNext app.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Spaced Repetition</CardTitle>
            <CardDescription>
              Review at optimal intervals to strengthen long-term memory
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              The system schedules reviews at increasing intervals based on how
              well you remember each card. When you rate a card as &quot;Easy&quot;,
              you&apos;ll see it again later than when you rate it &quot;Again&quot; or
              &quot;Hard&quot;.
            </p>
            <p>
              This approach is rooted in research by Hermann Ebbinghaus and his
              work on the forgetting curve—the observation that we forget
              information over time unless we actively reinforce it. Spaced
              repetition helps you review just before you&apos;re about to forget,
              making each review more effective.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Recall</CardTitle>
            <CardDescription>
              Strengthen memory by retrieving information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              Answering flashcards forces your brain to retrieve information
              rather than passively re-reading it. This act of retrieval
              strengthens memory—each time you successfully recall something,
              you make it easier to remember next time.
            </p>
            <p>
              Unlike passive re-reading or highlighting, active recall creates
              stronger and more durable memory traces. That&apos;s why flashcards
              are so effective: they turn learning into a practice of testing
              yourself.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Generated Flashcards</CardTitle>
            <CardDescription>
              Create cards from topics using large language models
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              The system can generate flashcards using LLMs to accelerate
              learning. Simply provide a topic or paste text, and the AI creates
              question-and-answer pairs for you.
            </p>
            <p>
              This lets you quickly build decks without manually writing every
              card. You can still add your own cards or edit the generated ones
              to customize your learning.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adaptive Learning</CardTitle>
            <CardDescription>
              Review frequency adjusts based on your performance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              The system adjusts review frequency based on your performance.
              Cards you struggle with appear more often, while cards you know
              well appear less frequently—so you spend time where it matters
              most.
            </p>
            <p>
              By rating cards as Again, Hard, Good, or Easy, you guide the
              algorithm to optimize your study schedule. Over time, the system
              learns which cards need more reinforcement and which you&apos;ve
              mastered.
            </p>
          </CardContent>
        </Card>
    </PageContainer>
  );
}
