"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  deleteAdminUser,
  getAdminUserDeletePreview,
  getAdminUsers,
  patchAdminUser,
  type AdminUserDeletePreview,
  type AdminUserRow,
} from "@/lib/api";
import { Pencil, Trash2 } from "lucide-react";

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
      setSaveError("Username and email are required.");
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
      <div className="max-w-md mx-auto px-4 py-16">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  if (!session?.backendUserId) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 space-y-4">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your session is not linked to an app account. Sign in with Google to
          use admin tools.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => signIn(undefined, { callbackUrl: "/admin" })}
          >
            Sign in with Google
          </Button>
          <Link
            href="/"
            className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-xl font-semibold">Users</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            Sign out
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="p-3 font-medium">Username</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium hidden sm:table-cell">
                  Created
                </th>
                <th className="p-3 font-medium w-[1%] whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const editing = editingId === u.id;
                return (
                  <tr key={u.id} className="border-b border-border/80">
                    <td className="p-3 align-top">
                      {editing ? (
                        <input
                          className="w-full min-w-[8rem] rounded border border-input bg-background px-2 py-1"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          aria-label="Username"
                        />
                      ) : (
                        <span className="break-all">{u.name}</span>
                      )}
                    </td>
                    <td className="p-3 align-top">
                      {editing ? (
                        <input
                          className="w-full min-w-[10rem] rounded border border-input bg-background px-2 py-1"
                          type="email"
                          value={draftEmail}
                          onChange={(e) => setDraftEmail(e.target.value)}
                          aria-label="Email"
                        />
                      ) : (
                        <span className="break-all">{u.email}</span>
                      )}
                    </td>
                    <td className="p-3 align-top text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                      {formatCreated(u.created_at)}
                    </td>
                    <td className="p-3 align-top">
                      {editing ? (
                        <div className="flex flex-col gap-2 items-stretch sm:items-end">
                          {saveError && (
                            <span className="text-xs text-destructive max-w-[12rem] sm:text-right">
                              {saveError}
                            </span>
                          )}
                          <div className="flex flex-wrap gap-2 justify-end">
                            <Button
                              type="button"
                              size="sm"
                              disabled={saving}
                              onClick={() => saveEdit(u.id)}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={saving}
                              onClick={cancelEdit}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="secondary"
                            onClick={() => startEdit(u)}
                            aria-label={`Edit user ${u.name}`}
                            title="Edit user"
                          >
                            <Pencil className="size-4 shrink-0" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                            onClick={() => openDeleteModal(u.id)}
                            aria-label={`Delete user ${u.name}`}
                            title="Delete user"
                          >
                            <Trash2 className="size-4 shrink-0" aria-hidden />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && !error && !loading && (
            <p className="p-4 text-sm text-muted-foreground">No users.</p>
          )}
        </div>
      )}

      {(deletePreviewLoading ||
        deletePreview !== null ||
        deleteModalError !== null) && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() =>
            !deletePreviewLoading &&
            !deleteExecuting &&
            closeDeleteModal()
          }
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-delete-title"
            className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admin-delete-title" className="text-lg font-semibold mb-3">
              Delete user
            </h2>

            {deletePreviewLoading && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Loading…</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeDeleteModal}
                >
                  Cancel
                </Button>
              </div>
            )}

            {!deletePreviewLoading && deleteModalError && !deletePreview && (
              <p className="text-sm text-destructive mb-4" role="alert">
                {deleteModalError}
              </p>
            )}

            {deletePreview && (
              <div className="space-y-3 text-sm">
                <div>
                  <p>
                    <span className="text-muted-foreground">Username:</span>{" "}
                    <span className="font-medium">{deletePreview.name}</span>
                  </p>
                  <p className="mt-1 break-all">
                    <span className="text-muted-foreground">Email:</span>{" "}
                    <span className="font-medium">{deletePreview.email}</span>
                  </p>
                  <p className="mt-2">
                    <span className="text-muted-foreground">Decks owned:</span>{" "}
                    <span className="font-medium">{deletePreview.deck_count}</span>
                  </p>
                </div>

                {deletePreview.deck_count > 0 ? (
                  <p className="text-muted-foreground leading-relaxed">
                    This user has {deletePreview.deck_count}{" "}
                    {deletePreview.deck_count === 1 ? "deck" : "decks"}.
                    Deleting this user will permanently remove those decks and
                    their flashcards (database cascade). Categories and study
                    reviews tied to this user are removed as well.
                  </p>
                ) : (
                  <p className="text-muted-foreground leading-relaxed">
                    This user has no decks. Deleting will permanently remove this
                    account and related profile data.
                  </p>
                )}

                {deleteModalError && (
                  <p className="text-destructive" role="alert">
                    {deleteModalError}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deleteExecuting}
                    onClick={() => confirmDeleteUser()}
                  >
                    {deleteExecuting ? "Deleting…" : "Delete permanently"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={deleteExecuting}
                    onClick={closeDeleteModal}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!deletePreviewLoading && deleteModalError && !deletePreview && (
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeDeleteModal}
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
