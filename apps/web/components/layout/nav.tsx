"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { UserSelector } from "@/components/user-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { MemoNextSupportFooterLink } from "@/components/memonext-support";
import { getMemoNextSupportUrl } from "@/lib/memonext-support";
import { Button } from "@/components/ui/button";

const supportPaymentUrl = getMemoNextSupportUrl();

type NavLink = {
  href: string;
  label: string;
  primary?: boolean;
  matchPrefixes?: string[];
  /** Active only when pathname equals href (avoids "/" matching every route). */
  exact?: boolean;
};

/** Signed-in or signed-out visitors on /about: informational routes only (no workflow-heavy app links). */
const aboutInformationalNavLinks: NavLink[] = [
  { href: "/", label: "Home", exact: true },
  { href: "/library", label: "Library", matchPrefixes: ["/library"] },
  { href: "/about", label: "About", matchPrefixes: ["/about"] },
];

const appNavLinks: NavLink[] = [
  { href: "/decks", label: "My Decks", matchPrefixes: ["/decks", "/categories"] },
  { href: "/study-ideas", label: "Ideas", matchPrefixes: ["/study-ideas"] },
  { href: "/library", label: "Library", matchPrefixes: ["/library"] },
  { href: "/create-deck", label: "Create Deck" },
  { href: "/study", label: "Practice", matchPrefixes: ["/study", "/explore"] },
];

function isNavActive(link: NavLink, pathname: string): boolean {
  if (link.exact) return pathname === link.href;
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
  const isAboutPage = pathname === "/about";
  const isStudyOrExplore = (pathname?.startsWith("/study/") || pathname?.startsWith("/explore/")) ?? false;
  /** Full workflow nav only when signed in. Signed-out users see public Library + About (or informational About nav). */
  const desktopCenterLinks = isAboutPage
    ? aboutInformationalNavLinks
    : authed
      ? appNavLinks
      : landingCenterLinks;
  const mobileNavLinks = isAboutPage
    ? authed
      ? aboutInformationalNavLinks
      : [...aboutInformationalNavLinks, ...landingRightLinks]
    : authed
      ? appNavLinks
      : landingNavLinks;

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
        <div className="hidden md:flex flex-1 justify-center items-center gap-5 lg:gap-6 min-w-0">
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
          {supportPaymentUrl ? (
            <MemoNextSupportFooterLink className="text-sm text-muted-foreground hover:text-foreground transition-colors" />
          ) : null}
        </div>

        {/* Right: ThemeToggle + optional Support (mobile bar) + CTAs / UserSelector + hamburger on small screens */}
        <div className="flex items-center gap-0.5 sm:gap-1 md:gap-3 shrink-0">
          <ThemeToggle />
          {supportPaymentUrl ? (
            <MemoNextSupportFooterLink className="md:hidden text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md shrink-0" />
          ) : null}
          {!authed ? (
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
                /* Signed out: Sign in is in the top bar on small screens */
                if (!authed && link.href === "/signin") {
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
