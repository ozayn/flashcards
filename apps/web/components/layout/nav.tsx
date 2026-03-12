"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { UserSelector } from "@/components/user-selector";
import { UserSettings } from "@/components/user-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/decks", label: "Decks" },
  { href: "/study", label: "Study" },
  { href: "/create-deck", label: "Create Deck" },
  { href: "/about", label: "About" },
];

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  if (pathname?.startsWith("/study")) return null;

  return (
    <nav className="relative z-50 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-2xl mx-auto h-full flex items-center justify-between px-10 md:px-12">
        {/* Left: Logo */}
        <Link
          href="/"
          className="font-semibold text-lg text-foreground shrink-0"
        >
          Flashcard AI
        </Link>

        {/* Center: Desktop nav (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right: Theme + Settings + User (desktop) */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          <UserSettings />
          <UserSelector />
        </div>

        {/* Mobile: Hamburger + Theme + Settings */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <UserSettings />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu (slide down) */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="max-w-2xl mx-auto px-10 md:px-12 py-4">
            <div className="grid grid-cols-2 gap-2">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
            <div className="pt-2 mt-2 border-t border-border space-y-2">
              <UserSettings />
              <UserSelector />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
