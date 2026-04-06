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
  { href: "/create-deck", label: "Create Deck" },
  { href: "/study", label: "Practice", matchPrefixes: ["/study", "/explore"] },
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
  /** Signed-in users on the landing page use the same primary nav as the rest of the app. */
  const useAppPrimaryNav = !isLanding || authed;
  const desktopCenterLinks = useAppPrimaryNav ? appNavLinks : landingCenterLinks;
  const mobileNavLinks = useAppPrimaryNav ? appNavLinks : landingNavLinks;

  return (
    <nav
      className={`sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${isStudyOrExplore ? "landscape-mobile:hidden" : ""} h-14`}
    >
      <div className="max-w-4xl mx-auto w-full h-full flex items-center justify-between px-4 sm:px-6 md:px-8 gap-2 sm:gap-4">
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
        <div className="hidden md:flex flex-1 justify-center items-center gap-6 min-w-0">
          {desktopCenterLinks.map((link) => (
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

        {/* Right: one ThemeToggle + UserSelector (authed) / CTAs or Sign in; hamburger on small screens only */}
        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 shrink-0">
          <ThemeToggle />
          {isLanding && !authed ? (
            <>
              <div className="hidden md:flex items-center gap-3 sm:gap-4">
                {landingRightLinks.map((link) =>
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
                )}
              </div>
              <Link
                href="/signin"
                className="md:hidden text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md shrink-0"
              >
                Sign in
              </Link>
            </>
          ) : !authed ? (
            <Link
              href="/signin"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-1 font-medium md:font-normal py-1.5 md:py-0 rounded-md md:rounded-none shrink-0"
            >
              Sign in
            </Link>
          ) : (
            <UserSelector />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 md:hidden"
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
              {mobileNavLinks.map((link) => {
                /* Landing signed out: Sign in is in the top bar */
                if (isLanding && !authed && link.href === "/signin") {
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
          </div>
        </div>
      )}
    </nav>
  );
}
