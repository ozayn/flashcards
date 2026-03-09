import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function CreateDeckPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/decks"
            className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium hover:bg-muted"
          >
            ← Back
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Create Deck</CardTitle>
            <CardDescription>
              Create a new flashcard deck
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Deck Name
              </label>
              <Input id="name" placeholder="e.g. Spanish Vocabulary" />
            </div>
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description (optional)
              </label>
              <Input id="description" placeholder="Brief description of the deck" />
            </div>
            <Button>Create Deck</Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
