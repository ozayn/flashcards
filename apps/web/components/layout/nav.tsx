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

type NavLink = { href: string; label: string; primary?: boolean; matchPrefixes?: string[] };

const appNavLinks: NavLink[] = [
  { href: "/decks", label: "Decks", matchPrefixes: ["/decks", "/categories"] },
  { href: "/study", label: "Study", matchPrefixes: ["/study", "/explore"] },
  { href: "/create-deck", label: "Create Deck" },
  { href: "/about", label: "About" },
];

function isNavActive(link: NavLink, pathname: string): boolean {
  const prefixes = link.matchPrefixes ?? [link.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const landingNavLinks: NavLink[] = [
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
      className={`sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${isDeckStudy ? "landscape-mobile:hidden" : ""} h-14 max-mobile:h-auto max-mobile:py-2.5 max-mobile:px-4`}
    >
      <div className="max-w-4xl mx-auto h-full flex items-center justify-between px-6 md:px-8 max-mobile:px-4">
        {/* Left: Logo + App Name (same location on all pages) */}
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 min-w-0"
        >
          <span className="shrink-0 inline-block max-mobile:scale-[0.625] max-mobile:origin-left">
            <Logo size="md" />
          </span>
          <span className="font-semibold text-lg text-foreground truncate max-mobile:text-[18px] max-mobile:font-semibold">
            MemoNext
          </span>
        </Link>

        {/* Center: Desktop nav (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            link.primary ? (
              <Link key={link.href} href={link.href}>
                <Button size="sm" className="rounded-lg">
                  {link.label}
                </Button>
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${
                  isNavActive(link, pathname)
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
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
          <ThemeToggle className="max-mobile:!size-11 max-mobile:!min-h-[44px] max-mobile:!min-w-[44px] [&_svg]:max-mobile:!size-5" />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 max-mobile:size-11 max-mobile:min-h-[44px] max-mobile:min-w-[44px]"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="size-4 max-mobile:size-5" /> : <Menu className="size-4 max-mobile:size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu (slide down) */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="max-w-4xl mx-auto px-6 md:px-8 py-4 max-mobile:px-4">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={link.primary ? "block" : ""}
                >
                  {link.primary ? (
                    <Button size="sm" className="rounded-lg w-full">
                      {link.label}
                    </Button>
                  ) : (
                    <span className={`block py-2 text-sm ${
                      isNavActive(link, pathname)
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}>
                      {link.label}
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
