"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import {
  getUsers,
  getUser,
  waitForApiReadiness,
  apiUrl,
  getUserSettings,
  updateUserSettings,
  type UserSettings,
  type UserUsageLimits,
} from "@/lib/api";
import { userIsProductAdmin } from "@/lib/product-admin";
import { cn } from "@/lib/utils";
import { AccountAvatar } from "@/components/account-avatar";
import { FLASHCARD_USER_ID_STORAGE_KEY as STORAGE_KEY, getStoredUserId } from "@/lib/stored-user-id";
import type { Session } from "next-auth";

/** Caps menu height vs viewport so the panel stays on-screen (mobile-friendly with dvh). */
const ACCOUNT_MENU_MAX_H = "max-h-[min(28rem,calc(100dvh-4rem))]";

/** OAuth profile photo only when the navbar selection is the signed-in backend user. */
function navbarProfileImageUrl(
  session: Session | null | undefined,
  sessionStatus: "loading" | "authenticated" | "unauthenticated",
  selectedUserId: string | null | undefined
): string | undefined {
  if (sessionStatus !== "authenticated" || !session?.user?.image?.trim()) {
    return undefined;
  }
  const url = session.user.image.trim();
  if (!selectedUserId || !session.backendUserId) {
    return undefined;
  }
  if (session.backendUserId !== selectedUserId) {
    return undefined;
  }
  return url;
}

function accountMenuInitials(name?: string | null, email?: string | null): string {
  const n = (name ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0]![0] ?? "";
      const b = parts[parts.length - 1]![0] ?? "";
      return (a + b).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const em = (email ?? "").trim();
  if (em.length > 0) return em[0]!.toUpperCase();
  return "?";
}

const ROLE_STORAGE_KEY = "flashcard_user_role";
const NAME_STORAGE_KEY = "flashcard_user_name";
const EMAIL_STORAGE_KEY = "flashcard_user_email";

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  created_at: string;
};

export function UserSelector() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = useClientIsAdmin();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [open, setOpen] = useState(false);
  const [cardSettings, setCardSettings] = useState<UserSettings | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userId = getStoredUserId();
    if (userId) {
      getUserSettings(userId)
        .then(setCardSettings)
        .catch(() => setCardSettings(null));
    } else {
      setCardSettings(null);
    }
  }, []);

  useEffect(() => {
    const handleUserChanged = () => {
      const userId = getStoredUserId();
      if (userId) {
        getUserSettings(userId)
          .then(setCardSettings)
          .catch(() => setCardSettings(null));
      } else {
        setCardSettings(null);
      }
    };
    window.addEventListener("flashcard_user_changed", handleUserChanged);
    return () =>
      window.removeEventListener("flashcard_user_changed", handleUserChanged);
  }, []);

  useEffect(() => {
    const onSettings = (e: Event) => {
      const ce = e as CustomEvent<{ settings: UserSettings }>;
      if (ce.detail?.settings) setCardSettings(ce.detail.settings);
    };
    window.addEventListener("flashcard_settings_changed", onSettings);
    return () =>
      window.removeEventListener("flashcard_settings_changed", onSettings);
  }, []);

  function applyUserList(
    data: unknown,
    options?: { preferOauthUserId?: string | null }
  ) {
    const userList = Array.isArray(data) ? data : [];
    setUsers(userList);

    const stored = localStorage.getItem(STORAGE_KEY);
    const validStored = userList.some((u: User) => u.id === stored);
    const prefer = options?.preferOauthUserId;
    const oauthInList =
      prefer && userList.some((u: User) => u.id === prefer) ? prefer : null;

    const userId: string | null =
      oauthInList ??
      (validStored && stored ? stored : userList[0]?.id ?? null);

    if (userId) {
      setSelectedUserId(userId);
      if (!validStored || !stored || oauthInList) {
        localStorage.setItem(STORAGE_KEY, userId);
      }
      const matchedUser = userList.find((u: User) => u.id === userId);
      if (matchedUser) {
        localStorage.setItem(ROLE_STORAGE_KEY, matchedUser.role);
        localStorage.setItem(NAME_STORAGE_KEY, matchedUser.name);
        localStorage.setItem(EMAIL_STORAGE_KEY, matchedUser.email);
        window.dispatchEvent(
          new CustomEvent("flashcard_user_changed", { detail: { userId } })
        );
      }
    }
  }

  const preferOauthUserIdRef = useRef<string | null>(null);
  preferOauthUserIdRef.current =
    sessionStatus === "authenticated" && session?.backendUserId
      ? session.backendUserId
      : null;

  async function loadUsers() {
    setApiError(false);
    const preferOauth = preferOauthUserIdRef.current;
    try {
      try {
        const data = await getUsers();
        applyUserList(data, { preferOauthUserId: preferOauth });
        return;
      } catch {
        /* cold start or transient failure — retry after brief readiness poll */
      }

      const available = await waitForApiReadiness({
        budgetMs: 10_000,
        retryDelayMs: 800,
        timeoutPerAttemptMs: 4000,
      });
      if (!available) {
        setApiError(true);
        setUsers([]);
        return;
      }

      const data = await getUsers();
      applyUserList(data, { preferOauthUserId: preferOauth });
    } catch {
      setUsers([]);
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }

  const oauthLinkedUserRef = useRef<string | null>(null);

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial user list only
  }, []);

  useEffect(() => {
    const bid = session?.backendUserId;
    if (!bid || typeof window === "undefined") {
      oauthLinkedUserRef.current = null;
      return;
    }
    if (oauthLinkedUserRef.current === bid) return;
    oauthLinkedUserRef.current = bid;

    const cur = localStorage.getItem(STORAGE_KEY);
    if (cur !== bid) {
      localStorage.setItem(STORAGE_KEY, bid);
      const name = session.user?.name ?? "";
      const email = session.user?.email ?? "";
      if (name) localStorage.setItem(NAME_STORAGE_KEY, name);
      if (email) localStorage.setItem(EMAIL_STORAGE_KEY, email);
      window.dispatchEvent(
        new CustomEvent("flashcard_user_changed", { detail: { userId: bid } })
      );
    }
    setSelectedUserId(bid);
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when OAuth session first exposes backendUserId
  }, [session?.backendUserId, session?.user?.name, session?.user?.email]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const el = containerRef.current;
      if (!el || !document.contains(el)) return;
      if (!el.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleBlur() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("blur", handleBlur);
    };
  }, [open]);

  const handleCardStyleChange = async (
    style: "paper" | "minimal" | "modern" | "anki"
  ) => {
    const userId = getStoredUserId();
    if (!userId || !cardSettings) return;
    try {
      const updated = await updateUserSettings(userId, { card_style: style });
      setCardSettings(updated);
      window.dispatchEvent(
        new CustomEvent("flashcard_settings_changed", {
          detail: { settings: updated },
        })
      );
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div
        className="size-9 shrink-0 rounded-full bg-muted animate-pulse"
        aria-hidden
        title="Checking API"
      />
    );
  }

  if (apiError) {
    return (
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-muted text-xs font-semibold text-amber-700 dark:text-amber-400"
        title={`API at ${apiUrl}`}
      >
        !
      </span>
    );
  }

  const closeMenu = () => {
    setOpen(false);
  };

  const menuCardStyleSection =
    cardSettings ? (
      <div className="border-t border-border px-3 py-1.5">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Flashcard style</p>
        <div className="flex flex-col gap-0.5">
          {(["paper", "minimal", "modern", "anki"] as const).map((style) => (
            <label
              key={style}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-0.5 text-sm",
                cardSettings.card_style === style && "bg-accent"
              )}
            >
              <input
                type="radio"
                name="card-style-nav"
                checked={cardSettings.card_style === style}
                onChange={() => void handleCardStyleChange(style)}
                className="rounded-full"
              />
              {style.charAt(0).toUpperCase() + style.slice(1)}
            </label>
          ))}
        </div>
      </div>
    ) : null;

  const menuAccountLinks = (
    <div className="py-1">
      <Link
        href="/profile"
        title="Profile — includes read-aloud, voice, and other account settings"
        className="flex w-full px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground rounded-sm"
        onClick={closeMenu}
      >
        Profile
      </Link>
      {isAdmin && (
        <Link
          href="/admin"
          className="flex w-full px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground rounded-sm"
          onClick={closeMenu}
        >
          Admin
        </Link>
      )}
      {sessionStatus === "authenticated" && (
        <button
          type="button"
          className="flex w-full px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground rounded-sm"
          onClick={() => {
            closeMenu();
            void signOut({ callbackUrl: "/" });
          }}
        >
          Sign out
        </button>
      )}
    </div>
  );

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const initials = accountMenuInitials(
    selectedUser?.name ?? session?.user?.name,
    selectedUser?.email ?? session?.user?.email ?? undefined
  );
  const navImageUrl = navbarProfileImageUrl(
    session,
    sessionStatus,
    selectedUserId
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex size-9 shrink-0 overflow-hidden rounded-full bg-muted p-0 text-xs font-medium text-foreground ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          open && "ring-2 ring-ring ring-offset-2"
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <AccountAvatar
          initials={initials}
          imageUrl={navImageUrl}
          sizePx={36}
          className="size-full"
        />
      </button>
      {open && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-1 flex w-56 min-w-[11rem] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto overscroll-contain rounded-md border border-border bg-popover py-1 shadow-lg",
            ACCOUNT_MENU_MAX_H
          )}
          role="menu"
        >
          {(selectedUser?.name || selectedUser?.email || session?.user?.name || session?.user?.email) && (
            <div className="border-b border-border px-3 py-2">
              {(selectedUser?.name || session?.user?.name) ? (
                <p className="truncate text-sm font-medium">
                  {selectedUser?.name ?? session?.user?.name}
                </p>
              ) : null}
              {(selectedUser?.email || session?.user?.email) ? (
                <p className="truncate text-xs text-muted-foreground">
                  {selectedUser?.email ?? session?.user?.email}
                </p>
              ) : null}
            </div>
          )}
          {menuAccountLinks}
          {menuCardStyleSection}
        </div>
      )}
    </div>
  );
}

export { getStoredUserId } from "@/lib/stored-user-id";

export function isStoredUserAdmin(): boolean {
  if (typeof window === "undefined") return false;
  return userIsProductAdmin({
    role: localStorage.getItem(ROLE_STORAGE_KEY) ?? "",
    name: localStorage.getItem(NAME_STORAGE_KEY) ?? "",
    email: localStorage.getItem(EMAIL_STORAGE_KEY) ?? "",
  });
}

export const MAX_CARDS_ADMIN = 50;
export const MAX_CARDS_USER = 25;

export function getCardCountOptions(
  admin?: boolean,
  maxCardsPerDeck?: number | null
): number[] {
  const isAdmin = admin ?? isStoredUserAdmin();
  let max = isAdmin ? MAX_CARDS_ADMIN : MAX_CARDS_USER;
  if (maxCardsPerDeck != null && maxCardsPerDeck > 0) {
    max = Math.min(max, maxCardsPerDeck);
  }
  return [5, 10, 15, 20, 25, 30, 40, 50].filter((n) => n <= max);
}

/**
 * Free-tier caps and card-count choices for generation UIs (from GET /users/:id when acting as self).
 */
export function useTierLimits(): {
  cardCountOptions: number[];
  usage: UserUsageLimits | null;
} {
  const [cardCountOptions, setCardCountOptions] = useState<number[]>(() =>
    getCardCountOptions(false)
  );
  const [usage, setUsage] = useState<UserUsageLimits | null>(null);

  useEffect(() => {
    function sync() {
      const uid = getStoredUserId();
      if (!uid) {
        setCardCountOptions(getCardCountOptions(false));
        setUsage(null);
        return;
      }
      getUser(uid)
        .then((u) => {
          const uu = u.usage ?? null;
          setUsage(uu);
          const cap =
            uu?.limited_tier === true && uu.max_cards_per_deck != null
              ? uu.max_cards_per_deck
              : null;
          setCardCountOptions(getCardCountOptions(undefined, cap));
        })
        .catch(() => {
          setUsage(null);
          setCardCountOptions(getCardCountOptions(false));
        });
    }
    sync();
    window.addEventListener("flashcard_user_changed", sync);
    return () => window.removeEventListener("flashcard_user_changed", sync);
  }, []);

  return { cardCountOptions, usage };
}

/**
 * Whether the current user has product admin access (from localStorage, synced from
 * the user list). Always false until mount so server HTML matches the client’s first paint.
 * Updates when the user list / stored role changes.
 */
export function useClientIsAdmin(): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    function sync() {
      setAdmin(isStoredUserAdmin());
    }
    sync();
    window.addEventListener("flashcard_user_changed", sync);
    return () => window.removeEventListener("flashcard_user_changed", sync);
  }, []);
  return admin;
}
