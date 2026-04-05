"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  deleteAdminUser,
  getAdminUserActivity,
  getAdminUserDeletePreview,
  getAdminUsers,
  patchAdminUser,
  type AdminUserDeletePreview,
  type AdminUserRow,
  type UserActivityEntry,
} from "@/lib/api";
import { History, Pencil, RotateCw, Trash2 } from "lucide-react";

const ADMIN_ACTIVITY_LIMIT = 15;

function formatRelativeTimeAdmin(iso: string): string {
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

function adminActivitySummary(row: UserActivityEntry): string {
  switch (row.event_type) {
    case "signed_in":
      return "Signed in";
    case "deck_created": {
      const raw = row.meta?.deck_name;
      const name = typeof raw === "string" && raw.trim() ? raw.trim() : "Deck";
      const short = name.length > 56 ? `${name.slice(0, 53)}…` : name;
      return `Created deck · ${short}`;
    }
    default:
      return row.event_type.replace(/_/g, " ");
  }
}

function adminActivityDetailTitle(row: UserActivityEntry): string | undefined {
  if (row.event_type !== "deck_created") return undefined;
  const id = row.meta?.deck_id;
  return typeof id === "string" && id.trim() ? `deck_id: ${id.trim()}` : undefined;
}

function formatCreated(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function AdminUsersClient() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deletePreview, setDeletePreview] = useState<AdminUserDeletePreview | null>(
    null
  );
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);
  const [deleteExecuting, setDeleteExecuting] = useState(false);

  const [activityUserId, setActivityUserId] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<UserActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await getAdminUsers();
      setUsers(data);
    } catch (e) {
      setUsers([]);
      const msg = e instanceof Error ? e.message : "Failed to load users";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.backendUserId) return;
    void load();
  }, [status, session?.backendUserId, load]);

  function closeDeleteModal() {
    setDeletePreview(null);
    setDeleteModalError(null);
    setDeletePreviewLoading(false);
    setDeleteExecuting(false);
  }

  async function toggleUserActivity(userId: string) {
    if (activityUserId === userId) {
      setActivityUserId(null);
      setActivityItems([]);
      setActivityError(null);
      return;
    }
    setActivityUserId(userId);
    setActivityItems([]);
    setActivityError(null);
    setActivityLoading(true);
    try {
      const rows = await getAdminUserActivity(userId, ADMIN_ACTIVITY_LIMIT);
      setActivityItems(rows);
    } catch (e) {
      setActivityError(
        e instanceof Error ? e.message : "Failed to load activity"
      );
      setActivityItems([]);
    } finally {
      setActivityLoading(false);
    }
  }

  async function openDeleteModal(userId: string) {
    setDeletePreview(null);
    setDeleteModalError(null);
    setDeletePreviewLoading(true);
    try {
      const preview = await getAdminUserDeletePreview(userId);
      setDeletePreview(preview);
    } catch (e) {
      setDeleteModalError(
        e instanceof Error ? e.message : "Could not load delete preview"
      );
    } finally {
      setDeletePreviewLoading(false);
    }
  }

  async function confirmDeleteUser() {
    if (!deletePreview) return;
    setDeleteExecuting(true);
    setDeleteModalError(null);
    try {
      await deleteAdminUser(deletePreview.id);
      setUsers((prev) => prev.filter((u) => u.id !== deletePreview.id));
      closeDeleteModal();
    } catch (e) {
      setDeleteModalError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteExecuting(false);
    }
  }

  function startEdit(u: AdminUserRow) {
    setEditingId(u.id);
    setDraftName(u.name);
    setDraftEmail(u.email);
    setSaveError(null);
    if (activityUserId === u.id) {
      setActivityUserId(null);
      setActivityItems([]);
      setActivityError(null);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveError(null);
  }

  async function saveEdit(targetId: string) {
    const original = users.find((u) => u.id === targetId);
    if (!original) return;

    const name = draftName.trim();
    const email = draftEmail.trim();
    if (!name || !email) {
      setSaveError("Name and email required.");
      return;
    }

    const body: { name?: string; email?: string } = {};
    if (name !== original.name) body.name = name;
    if (email !== original.email) body.email = email;
    if (Object.keys(body).length === 0) {
      setEditingId(null);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await patchAdminUser(targetId, body);
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u))
      );
      setEditingId(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  if (!session?.backendUserId) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-10">
        <h1 className="text-base font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Session not linked to an app user. Sign in with Google.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => signIn(undefined, { callbackUrl: "/admin" })}
          >
            Sign in
          </Button>
          <Link
            href="/"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-muted"
          >
            Home
          </Link>
        </div>
      </div>
    );
  }

  const deleteDialogOpen =
    deletePreviewLoading ||
    deletePreview !== null ||
    deleteModalError !== null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold tracking-tight">Users</h1>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh list"
          >
            <RotateCw
              className={`size-4 shrink-0 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            Sign out
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading && users.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto border border-border/60">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                  Email
                </th>
                <th className="hidden px-2 py-2 text-left text-xs font-medium text-muted-foreground sm:table-cell">
                  Created
                </th>
                <th className="w-0 px-2 py-2 text-right text-xs font-medium text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const editing = editingId === u.id;
                return (
                  <Fragment key={u.id}>
                  <tr className="border-b border-border/60 last:border-0">
                    <td className="max-w-[10rem] px-2 py-1.5 align-middle sm:max-w-none">
                      {editing ? (
                        <input
                          className="h-8 w-full min-w-[6rem] rounded border border-input bg-background px-2 text-sm"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          aria-label="Name"
                        />
                      ) : (
                        <span className="break-words">{u.name}</span>
                      )}
                    </td>
                    <td className="max-w-[12rem] px-2 py-1.5 align-middle sm:max-w-none">
                      {editing ? (
                        <input
                          className="h-8 w-full min-w-[8rem] rounded border border-input bg-background px-2 text-sm"
                          type="email"
                          value={draftEmail}
                          onChange={(e) => setDraftEmail(e.target.value)}
                          aria-label="Email"
                        />
                      ) : (
                        <span className="break-all text-muted-foreground">{u.email}</span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-1.5 align-middle text-xs text-muted-foreground sm:table-cell">
                      {formatCreated(u.created_at)}
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      {editing ? (
                        <div className="flex flex-col items-end gap-1">
                          {saveError ? (
                            <span className="max-w-[14rem] text-right text-xs text-destructive">
                              {saveError}
                            </span>
                          ) : null}
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              className="h-8"
                              disabled={saving}
                              onClick={() => saveEdit(u.id)}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8"
                              disabled={saving}
                              onClick={cancelEdit}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          role="group"
                          aria-label={`Actions for ${u.name}`}
                          className="inline-flex items-center gap-0 rounded-md border border-border/50 bg-muted/15 p-0.5"
                        >
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={editing}
                            className={
                              activityUserId === u.id
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }
                            onClick={() => void toggleUserActivity(u.id)}
                            aria-label={`View activity for ${u.name}`}
                            title="Recent activity"
                          >
                            <History className="size-3.5 shrink-0" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => startEdit(u)}
                            aria-label={`Edit ${u.name}`}
                          >
                            <Pencil className="size-3.5 shrink-0" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => openDeleteModal(u.id)}
                            aria-label={`Delete ${u.name}`}
                          >
                            <Trash2 className="size-3.5 shrink-0" aria-hidden />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {activityUserId === u.id ? (
                    <tr className="border-b border-border/60 bg-muted/20 last:border-0">
                      <td colSpan={4} className="px-3 py-2.5">
                        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Recent activity
                        </p>
                        {activityLoading ? (
                          <p className="text-xs text-muted-foreground">Loading…</p>
                        ) : null}
                        {activityError ? (
                          <p className="text-xs text-destructive" role="alert">
                            {activityError}
                          </p>
                        ) : null}
                        {!activityLoading &&
                        !activityError &&
                        activityItems.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No logged activity.
                          </p>
                        ) : null}
                        {!activityLoading && !activityError && activityItems.length > 0 ? (
                          <ul className="max-w-2xl space-y-1" aria-label="Activity log">
                            {activityItems.map((row) => (
                              <li
                                key={row.id}
                                className="flex items-baseline justify-between gap-3 text-xs leading-snug"
                                title={adminActivityDetailTitle(row)}
                              >
                                <span className="min-w-0 text-foreground">
                                  {adminActivitySummary(row)}
                                </span>
                                <time
                                  className="shrink-0 tabular-nums text-muted-foreground"
                                  dateTime={row.created_at}
                                >
                                  {formatRelativeTimeAdmin(row.created_at)}
                                </time>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && !error && !loading ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No users.</p>
          ) : null}
        </div>
      )}

      {deleteDialogOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() =>
            !deletePreviewLoading && !deleteExecuting && closeDeleteModal()
          }
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-delete-title"
            className="w-full max-w-sm border border-border bg-background p-4 shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admin-delete-title" className="mb-3 text-base font-semibold">
              Delete user
            </h2>

            {deletePreviewLoading ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Loading…</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={closeDeleteModal}
                >
                  Cancel
                </Button>
              </div>
            ) : null}

            {!deletePreviewLoading && deleteModalError && !deletePreview ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive" role="alert">
                  {deleteModalError}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={closeDeleteModal}
                >
                  Close
                </Button>
              </div>
            ) : null}

            {deletePreview ? (
              <div className="space-y-3 text-sm">
                <p className="break-words">
                  <span className="font-medium">{deletePreview.name}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="break-all">{deletePreview.email}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {deletePreview.deck_count > 0
                    ? `Removes account and ${deletePreview.deck_count} owned deck${deletePreview.deck_count === 1 ? "" : "s"} (and their cards).`
                    : "Removes this account."}
                </p>

                {deleteModalError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {deleteModalError}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={deleteExecuting}
                    onClick={closeDeleteModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    disabled={deleteExecuting}
                    onClick={() => confirmDeleteUser()}
                  >
                    {deleteExecuting ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
