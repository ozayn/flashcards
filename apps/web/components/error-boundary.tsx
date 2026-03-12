"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (
      error?.message?.includes("No elements found") ||
      error?.message?.includes("No elements")
    ) {
      console.warn("Caught extension-related error:", error.message);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[200px] flex flex-col items-center justify-center p-6 gap-4">
          <p className="text-muted-foreground text-sm text-center">
            Something went wrong. This can happen when a browser extension
            interferes with the page.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => this.setState({ hasError: false })}
            >
              Try again
            </Button>
            <Link
              href="/decks"
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              Back to decks
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
