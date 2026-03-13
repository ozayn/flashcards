"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { UserSelector } from "@/components/user-selector";
import { UserSettings } from "@/components/user-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const appNavLinks = [
  { href: "/decks", label: "Decks" },
  { href: "/study", label: "Study" },
  { href: "/create-deck", label: "Create Deck" },
  { href: "/about", label: "About" },
];

const landingNavLinks = [
  { href: "/about", label: "About" },
  { href: "/decks", label: "Sign In" },
  { href: "/create-deck", label: "Get Started", primary: true },
];

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const isDeckStudy = pathname?.startsWith("/study/") ?? false;
  const navLinks = isLanding ? landingNavLinks : appNavLinks;

  return (
    <nav
      className={`sticky top-0 z-50 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${isDeckStudy ? "landscape-mobile:hidden" : ""}`}
    >
      <div className="max-w-4xl mx-auto h-full flex items-center justify-between px-6 md:px-8">
        {/* Left: Logo + App Name (same location on all pages) */}
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 min-w-0"
        >
          <Logo size="md" className="shrink-0" />
          <span className="font-semibold text-lg text-foreground truncate">
            MemoNext
          </span>
        </Link>

        {/* Center: Desktop nav (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(({ href, label, primary }) => (
            primary ? (
              <Link key={href} href={href}>
                <Button size="sm" className="rounded-lg">
                  {label}
                </Button>
              </Link>
            ) : (
              <Link
                key={href}
                href={href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            )
          ))}
        </div>

        {/* Right: Theme + Settings + User (app only) or Theme (landing) */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          {!isLanding && (
            <>
              <UserSettings />
              <UserSelector />
            </>
          )}
        </div>

        {/* Mobile: Hamburger + Theme */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
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
          <div className="max-w-4xl mx-auto px-6 md:px-8 py-4">
            <div className="flex flex-col gap-2">
              {navLinks.map(({ href, label, primary }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={primary ? "block" : ""}
                >
                  {primary ? (
                    <Button size="sm" className="rounded-lg w-full">
                      {label}
                    </Button>
                  ) : (
                    <span className="block py-2 text-sm text-muted-foreground hover:text-foreground">
                      {label}
                    </span>
                  )}
                </Link>
              ))}
            </div>
            {!isLanding && (
              <div className="pt-2 mt-2 border-t border-border space-y-2">
                <UserSettings />
                <UserSelector />
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
