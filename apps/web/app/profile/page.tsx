"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getStoredUserId } from "@/components/user-selector";
import {
  AccountAvatar,
  isSafeProfileImageUrl,
} from "@/components/account-avatar";
import {
  getUser,
  getUserActivity,
  getUserSettings,
  patchUserProfileName,
  updateUserSettings,
  type EnglishTtsPreference,
  type UserActivityEntry,
  type UserSettings,
  type VoiceStylePreference,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageContainer from "@/components/layout/page-container";

/** Short list for profile; keep in sync with getUserActivity default. */
const RECENT_ACTIVITY_LIMIT = 10;

/** Keep in sync with user-selector localStorage key for display name. */
const FLASHCARD_USER_NAME_KEY = "flashcard_user_name";

function profileInitials(name: string, email: string): string {
  const n = name.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (
        parts[0][0] + parts[parts.length - 1][0]
      ).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const e = email.trim();
  if (e.length >= 2) return e.slice(0, 2).toUpperCase();
  return "?";
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function activityRowPrimary(row: UserActivityEntry): ReactNode {
  switch (row.event_type) {
    case "signed_in":
      return "Signed in";
    case "deck_created": {
      const raw = row.meta?.deck_name;
      const name = typeof raw === "string" && raw.trim() ? raw.trim() : "Deck";
      const short =
        name.length > 36 ? `${name.slice(0, 33)}…` : name;
      const deckId =
        typeof row.meta?.deck_id === "string" && row.meta.deck_id.trim()
          ? row.meta.deck_id.trim()
          : null;
      const text = `Created deck · ${short}`;
      if (deckId) {
        return (
          <Link
            href={`/decks/${encodeURIComponent(deckId)}`}
            className="text-foreground underline-offset-2 hover:underline"
          >
            {text}
          </Link>
        );
      }
      return text;
    }
    default:
      return row.event_type.replace(/_/g, " ");
  }
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null
  );
  const [draftName, setDraftName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activity, setActivity] = useState<UserActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    const bid = session?.backendUserId;
    const stored = getStoredUserId();
    const id = bid || stored || null;
    setUserId(id);
    if (!id) {
      setLoading(false);
      setUser(null);
      setUserSettings(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const row = await getUser(id);
        if (cancelled) return;
        setUser({ name: row.name, email: row.email });
        setDraftName(row.name);
        setEditingName(false);
      } catch {
        if (!cancelled) {
          setUser(null);
          setLoadError("Could not load your profile. Check that the API is running.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.backendUserId, status]);

  useEffect(() => {
    if (status === "loading") return;
    const bid = session?.backendUserId;
    const stored = getStoredUserId();
    const id = bid || stored || null;
    if (!id) {
      setUserSettings(null);
      return;
    }
    let cancelled = false;
    getUserSettings(id)
      .then((s) => {
        if (!cancelled) setUserSettings(s);
      })
      .catch(() => {
        if (!cancelled) setUserSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.backendUserId, status]);

  useEffect(() => {
    const onSettings = (e: Event) => {
      const ce = e as CustomEvent<{ settings: UserSettings }>;
      if (!ce.detail?.settings) return;
      if (ce.detail.settings) setUserSettings(ce.detail.settings);
    };
    window.addEventListener("flashcard_settings_changed", onSettings);
    return () => window.removeEventListener("flashcard_settings_changed", onSettings);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !userId || !user) return;
    if (session?.backendUserId !== userId) {
      setActivity([]);
      return;
    }
    let cancelled = false;
    setActivityLoading(true);
    void (async () => {
      try {
        const rows = await getUserActivity(userId, RECENT_ACTIVITY_LIMIT);
        if (!cancelled) setActivity(rows);
      } catch {
        if (!cancelled) setActivity([]);
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, session?.backendUserId, userId, user]);

  const rawGoogleImage = (
    session?.backendUserId &&
    userId &&
    session.backendUserId === userId &&
    session.user?.image
      ? session.user.image.trim()
      : ""
  );
  const googleAvatarUrl =
    rawGoogleImage && isSafeProfileImageUrl(rawGoogleImage)
      ? rawGoogleImage
      : undefined;

  const dirty =
    user !== null && draftName.trim() !== user.name.trim();

  async function handleSave() {
    if (!userId || !draftName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const row = await patchUserProfileName(userId, draftName.trim());
      setUser({ name: row.name, email: row.email });
      setDraftName(row.name);
      setEditingName(false);
      if (typeof window !== "undefined" && getStoredUserId() === userId) {
        localStorage.setItem(FLASHCARD_USER_NAME_KEY, row.name);
        window.dispatchEvent(
          new CustomEvent("flashcard_user_changed", { detail: { userId } })
        );
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (user) setDraftName(user.name);
    setSaveError(null);
    setEditingName(false);
  }

  function startEditName() {
    if (user) setDraftName(user.name);
    setSaveError(null);
    setEditingName(true);
  }

  async function handleEnglishTtsChange(pref: EnglishTtsPreference) {
    if (!userId || !userSettings) return;
    try {
      const updated = await updateUserSettings(userId, { english_tts: pref });
      setUserSettings(updated);
      window.dispatchEvent(
        new CustomEvent("flashcard_settings_changed", {
          detail: { settings: updated },
        })
      );
    } catch {
      /* ignore */
    }
  }

  async function handleVoiceStyleChange(pref: VoiceStylePreference) {
    if (!userId || !userSettings) return;
    try {
      const updated = await updateUserSettings(userId, { voice_style: pref });
      setUserSettings(updated);
      window.dispatchEvent(
        new CustomEvent("flashcard_settings_changed", {
          detail: { settings: updated },
        })
      );
    } catch {
      /* ignore */
    }
  }

  if (status === "loading" || (loading && userId)) {
    return (
      <PageContainer className="mx-auto max-w-sm px-4 py-12 text-center text-sm text-muted-foreground">
        Loading…
      </PageContainer>
    );
  }

  if (!userId) {
    return (
      <PageContainer className="mx-auto max-w-sm space-y-3 px-4 py-10 text-center">
        <h1 className="text-lg font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Sign in or pick a user in the header to see your profile.
        </p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1 text-sm">
          <Link
            href="/signin"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
          <Link
            href="/decks"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Decks
          </Link>
        </div>
      </PageContainer>
    );
  }

  if (loadError || !user) {
    return (
      <PageContainer className="mx-auto max-w-sm space-y-3 px-4 py-10 text-center">
        <h1 className="text-lg font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-destructive">{loadError ?? "Unknown error."}</p>
        <Link
          href="/decks"
          className="inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to decks
        </Link>
      </PageContainer>
    );
  }

  const initials = profileInitials(user.name, user.email);
  const displayName = user.name.trim() || "No name";

  return (
    <PageContainer className="mx-auto w-full max-w-sm px-4 py-8 sm:py-10">
      <div className="mb-4">
        <Link
          href="/decks"
          className="inline-flex h-7 items-center rounded-md px-1 -ml-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ← Decks
        </Link>
      </div>
      <h1 className="mb-6 text-lg font-semibold tracking-tight">Profile</h1>

      <div className="flex flex-col items-center gap-5 text-center">
        <div
          className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border/50 sm:size-[4.5rem]"
          aria-hidden
        >
          <AccountAvatar
            initials={initials}
            imageUrl={googleAvatarUrl}
            sizePx={72}
            className="size-full"
            initialsClassName="text-sm text-muted-foreground sm:text-base"
          />
        </div>

        <div className="w-full space-y-1">
          {editingName ? (
            <div className="mx-auto w-full max-w-[18rem] space-y-2 text-left">
              <Input
                id="profile-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={255}
                autoComplete="name"
                aria-label="Name"
                className="h-9"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || !dirty || !draftName.trim()}
                  onClick={() => void handleSave()}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              </div>
              {saveError ? (
                <p className="text-xs text-destructive" role="alert">
                  {saveError}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <p className="text-base font-medium text-foreground">{displayName}</p>
              <button
                type="button"
                onClick={startEditName}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Edit name
              </button>
            </>
          )}
        </div>

        <div className="w-full border-t border-border/40 pt-4">
          <p className="break-all text-sm text-muted-foreground">{user.email}</p>
        </div>

        {userSettings ? (
          <div className="w-full border-t border-border/40 pt-4 text-left">
            <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Read aloud (English)
            </h2>
            <div className="flex flex-col gap-1.5 text-sm">
              {(
                [
                  { value: "default" as const, label: "Default" },
                  { value: "british" as const, label: "British" },
                  { value: "american" as const, label: "American" },
                ] as const
              ).map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-md py-0.5 ${
                    userSettings.english_tts === value
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="profile-english-tts"
                    className="rounded-full"
                    checked={userSettings.english_tts === value}
                    onChange={() => void handleEnglishTtsChange(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {userSettings ? (
          <div className="w-full border-t border-border/40 pt-4 text-left">
            <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Preferred voice style
            </h2>
            <div className="flex flex-col gap-1.5 text-sm">
              {(
                [
                  { value: "default" as const, label: "Default" },
                  { value: "female" as const, label: "Female" },
                  { value: "male" as const, label: "Male" },
                ] as const
              ).map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-md py-0.5 ${
                    userSettings.voice_style === value
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="profile-voice-style"
                    className="rounded-full"
                    checked={userSettings.voice_style === value}
                    onChange={() => void handleVoiceStyleChange(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {session?.backendUserId === userId ? (
          <div className="w-full border-t border-border/40 pt-4 text-left">
            <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Recent activity
            </h2>
            {activityLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : activity.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-1" aria-label="Recent activity">
                {activity.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-baseline justify-between gap-2 text-xs leading-snug"
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {activityRowPrimary(a)}
                    </span>
                    <time
                      className="shrink-0 tabular-nums text-muted-foreground"
                      dateTime={a.created_at}
                    >
                      {formatRelativeTime(a.created_at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
