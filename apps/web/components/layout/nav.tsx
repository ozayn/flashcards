"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { UserSelector } from "@/components/user-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

type NavLink = { href: string; label: string; primary?: boolean; matchPrefixes?: string[] };

const appNavLinks: NavLink[] = [
  { href: "/decks", label: "My Decks", matchPrefixes: ["/decks", "/categories"] },
  { href: "/library", label: "Library", matchPrefixes: ["/library"] },
  { href: "/study", label: "Practice", matchPrefixes: ["/study", "/explore"] },
  { href: "/create-deck", label: "Create Deck" },
];

function isNavActive(link: NavLink, pathname: string): boolean {
  const prefixes = link.matchPrefixes ?? [link.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const landingCenterLinks: NavLink[] = [
  { href: "/library", label: "Library", matchPrefixes: ["/library"] },
  { href: "/about", label: "About" },
];

const landingRightLinks: NavLink[] = [
  { href: "/signin", label: "Sign In" },
  { href: "/create-deck", label: "Get Started", primary: true },
];

const landingNavLinks: NavLink[] = [...landingCenterLinks, ...landingRightLinks];

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { status } = useSession();
  const authed = status === "authenticated";
  const isLanding = pathname === "/";
  const isStudyOrExplore = (pathname?.startsWith("/study/") || pathname?.startsWith("/explore/")) ?? false;
  const navLinks = isLanding ? landingNavLinks : appNavLinks;

  return (
    <nav
      className={`sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${isStudyOrExplore ? "landscape-mobile:hidden" : ""} h-14`}
    >
      <div className="max-w-4xl mx-auto w-full h-full flex items-center justify-between px-4 sm:px-6 md:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 min-w-0"
        >
          <Logo size="md" />
          <span className="font-semibold text-base text-foreground truncate">
            MemoNext
          </span>
        </Link>

        {/* Center: Desktop nav (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-6">
          {(isLanding ? landingCenterLinks : navLinks).map((link) => (
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

        {/* Right: Theme + account (app or landing when signed in) or CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          {isLanding ? (
            authed ? (
              <>
                <UserSelector />
                <Link href="/create-deck">
                  <Button size="sm" className="rounded-lg">
                    Get Started
                  </Button>
                </Link>
              </>
            ) : (
              landingRightLinks.map((link) => (
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
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                )
              ))
            )
          ) : (
            <>
              {!authed && (
                <Link
                  href="/signin"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign in
                </Link>
              )}
              <UserSelector />
            </>
          )}
        </div>

        <div className="flex md:hidden items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {!authed && (
            <Link
              href="/signin"
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 -mr-0.5 rounded-md shrink-0"
            >
              Sign in
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border/80 bg-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => {
                /* Landing: Sign in is in the desktop right column or the mobile top bar */
                if (isLanding && link.href === "/signin") {
                  return null;
                }
                return (
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
                      <span
                        className={`block py-2 text-sm ${
                          isNavActive(link, pathname)
                            ? "text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {link.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            {(authed && isLanding) || !isLanding ? (
              <div className="pt-3 mt-3 border-t border-border/60">
                <UserSelector />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </nav>
  );
}
