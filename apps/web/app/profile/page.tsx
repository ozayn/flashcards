"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getStoredUserId } from "@/components/user-selector";
import { getUser, patchUserProfileName } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Keep in sync with user-selector localStorage key for display name. */
const FLASHCARD_USER_NAME_KEY = "flashcard_user_name";

function isHttpsImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

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

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null
  );
  const [draftName, setDraftName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    const bid = session?.backendUserId;
    const stored = getStoredUserId();
    const id = bid || stored || null;
    setUserId(id);
    if (!id) {
      setLoading(false);
      setUser(null);
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

  const rawGoogleImage = (
    session?.backendUserId &&
    userId &&
    session.backendUserId === userId &&
    session.user?.image
      ? session.user.image.trim()
      : ""
  );
  const googleAvatarUrl =
    rawGoogleImage && isHttpsImageUrl(rawGoogleImage)
      ? rawGoogleImage
      : undefined;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [googleAvatarUrl]);

  const showGooglePhoto = Boolean(googleAvatarUrl) && !avatarLoadFailed;

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
  }

  if (status === "loading" || (loading && userId)) {
    return (
      <div className="max-w-md mx-auto py-16 text-center text-sm text-muted-foreground px-4">
        Loading profile…
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4 px-4">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Sign in with Google or choose a user in the header to view and edit
          your display name here.
        </p>
        <div className="flex flex-wrap justify-center gap-4 pt-2">
          <Link
            href="/signin"
            className="text-sm text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
          <Link
            href="/decks"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            My decks
          </Link>
        </div>
      </div>
    );
  }

  if (loadError || !user) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4 px-4">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-destructive">{loadError ?? "Unknown error."}</p>
        <Link
          href="/decks"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline inline-block"
        >
          Back to decks
        </Link>
      </div>
    );
  }

  const initials = profileInitials(user.name, user.email);

  return (
    <div className="max-w-md mx-auto w-full px-4 sm:px-6 md:px-0 py-8 sm:py-10">
      <h1 className="text-xl font-semibold tracking-tight mb-6">Profile</h1>

      <div className="rounded-xl border border-border/80 bg-card/40 p-6 sm:p-8 space-y-8 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div
            className="flex size-[4.5rem] sm:size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted"
            aria-hidden
          >
            {showGooglePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- Google URLs need referrerPolicy + reliable onError; next/image sizing was clipping/breaking loads
              <img
                src={googleAvatarUrl}
                alt=""
                width={80}
                height={80}
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover object-center"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <span className="text-base sm:text-lg font-medium text-muted-foreground">
                {initials}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground">
            {draftName.trim() || user.name}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-name" className="text-sm font-medium">
            Display name
          </label>
          <Input
            id="profile-name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={255}
            autoComplete="name"
            className="h-10"
          />
          <div className="flex flex-wrap gap-2 pt-2">
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
              disabled={!dirty || saving}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Email
          </p>
          <p className="text-sm text-foreground break-all">{user.email}</p>
          <p className="text-xs text-muted-foreground">
            Email is read-only for now.
          </p>
        </div>

        {saveError && (
          <p className="text-sm text-destructive" role="alert">
            {saveError}
          </p>
        )}
      </div>
    </div>
  );
}
