"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { getUsers, createDeck } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";

export default function CreateDeckPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let userId: string | null = getStoredUserId();
    if (!userId) {
      const users = await getUsers();
      if (Array.isArray(users) && users.length > 0) {
        userId = users[0].id;
      } else {
        alert("No user found. Please refresh the page.");
        return;
      }
    }
    if (!userId) return;

    setLoading(true);

    try {
      await createDeck({ user_id: userId, name, description });
      router.push("/decks");
    } catch {
      alert("Failed to create deck");
    } finally {
      setLoading(false);
    }
  };

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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Deck Name
                </label>
                <Input
                  id="name"
                  placeholder="e.g. Spanish Vocabulary"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  placeholder="Brief description of the deck"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {loading ? "Creating..." : "Create Deck"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
