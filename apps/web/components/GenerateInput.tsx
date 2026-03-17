"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface GenerateInputProps {
  placeholder?: string;
  suggestions?: string[];
  onTopicClick?: (topic: string) => void;
}

/**
 * Large centered input for topic/text with example suggestions.
 * ChatGPT / Perplexity style.
 */
export function GenerateInput({
  placeholder = "Paste text or enter a topic...",
  suggestions = [
    "Roman gods",
    "Quantum mechanics basics",
    "Spanish travel vocabulary",
    "The French Revolution",
  ],
  onTopicClick,
}: GenerateInputProps) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      const params = new URLSearchParams();
      params.set("topic", trimmed);
      router.push(`/create-deck?${params.toString()}`);
    } else {
      router.push("/create-deck");
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setValue(suggestion);
    onTopicClick?.(suggestion);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-4">
      <div className="relative">
        <textarea
          id="generate-topic"
          name="topic"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={3}
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-background px-5 py-4 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none max-mobile:rounded-[10px] max-mobile:px-3.5 max-mobile:py-3 max-mobile:text-base max-mobile:min-h-[120px]"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSuggestionClick(s)}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:border-foreground/30 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-center">
        <Button
          type="submit"
          size="lg"
          className="rounded-xl px-8 font-medium"
        >
          Generate Flashcards
        </Button>
      </div>
    </form>
  );
}
