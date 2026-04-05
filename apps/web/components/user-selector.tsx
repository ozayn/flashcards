"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { getUsers, createUser, waitForApiReadiness, apiUrl } from "@/lib/api";
import { userIsProductAdmin } from "@/lib/product-admin";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "flashcard_user_id";
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
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function applyUserList(data: unknown) {
    const userList = Array.isArray(data) ? data : [];
    setUsers(userList);

    const stored = localStorage.getItem(STORAGE_KEY);
    const validStored = userList.some((u: User) => u.id === stored);
    const userId = validStored && stored ? stored : userList[0]?.id ?? null;

    if (userId) {
      setSelectedUserId(userId);
      if (!validStored || !stored) {
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

  async function loadUsers() {
    setApiError(false);
    try {
      try {
        const data = await getUsers();
        applyUserList(data);
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
      applyUserList(data);
    } catch {
      setUsers([]);
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (!open && !(users.length === 0 && showAddForm)) return;
    function handleClickOutside(e: MouseEvent) {
      const el = containerRef.current;
      if (!el || !document.contains(el)) return;
      if (!el.contains(e.target as Node)) {
        setOpen(false);
        if (users.length === 0) setShowAddForm(false);
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
  }, [open, users.length, showAddForm]);

  const handleSelect = (userId: string) => {
    const changed = userId !== selectedUserId;
    setSelectedUserId(userId);
    localStorage.setItem(STORAGE_KEY, userId);
    const matchedUser = users.find((u) => u.id === userId);
    if (matchedUser) {
      localStorage.setItem(ROLE_STORAGE_KEY, matchedUser.role);
      localStorage.setItem(NAME_STORAGE_KEY, matchedUser.name);
      localStorage.setItem(EMAIL_STORAGE_KEY, matchedUser.email);
    }
    setOpen(false);
    setShowAddForm(false);
    window.dispatchEvent(
      new CustomEvent("flashcard_user_changed", { detail: { userId } })
    );
    if (changed) {
      router.push("/decks");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddLoading(true);
    try {
      const newUser = await createUser({ email: addEmail.trim(), name: addName.trim() });
      setUsers((prev) => [...prev, newUser]);
      handleSelect(newUser.id);
      setAddEmail("");
      setAddName("");
      setShowAddForm(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setAddLoading(false);
    }
  };

  if (loading) {
    return (
      <span className="text-muted-foreground text-sm animate-pulse" title="Checking API">
        Connecting…
      </span>
    );
  }

  if (apiError) {
    return (
      <span className="text-amber-600 text-sm" title={`API at ${apiUrl}`}>
        API unavailable
      </span>
    );
  }

  if (users.length === 0) {
    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex h-8 items-center gap-1 rounded-md border border-dashed border-input bg-background px-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <Plus className="size-4" />
          Add user
        </button>
        {showAddForm && (
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-popover p-3 shadow-lg">
            <form onSubmit={handleAddUser} className="space-y-2">
              <input
                id="add-user-email"
                name="email"
                type="email"
                placeholder="Email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
              <input
                id="add-user-name"
                name="name"
                type="text"
                placeholder="Name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                required
                autoComplete="name"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
              {addError && <p className="text-xs text-destructive">{addError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={addLoading}
                  className="rounded-md bg-primary px-2 py-1.5 text-sm text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
                >
                  {addLoading ? "Adding..." : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded-md border border-input px-2 py-1.5 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-sm text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-sm">{selectedUser?.name ?? "Select user"}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] rounded-md border border-border bg-popover py-1 shadow-lg"
          role="listbox"
        >
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              role="option"
              aria-selected={user.id === selectedUserId}
              onClick={() => handleSelect(user.id)}
              className={cn(
                "w-full px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground",
                user.id === selectedUserId && "bg-accent/50 font-medium"
              )}
            >
              {user.name}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            {showAddForm ? (
              <div className="p-2">
                <form onSubmit={handleAddUser} className="space-y-2">
                  <input
                    id="add-user-email-dropdown"
                    name="email"
                    type="email"
                    placeholder="Email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                  <input
                    id="add-user-name-dropdown"
                    name="name"
                    type="text"
                    placeholder="Name"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    required
                    autoComplete="name"
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                  {addError && <p className="text-xs text-destructive">{addError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={addLoading}
                      className="rounded-md bg-primary px-2 py-1.5 text-sm text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
                    >
                      {addLoading ? "Adding..." : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddForm(false); setAddError(null); }}
                      className="rounded-md border border-input px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Plus className="size-4" />
                Add user
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

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

export function getCardCountOptions(admin?: boolean): number[] {
  const isAdmin = admin ?? isStoredUserAdmin();
  const max = isAdmin ? MAX_CARDS_ADMIN : MAX_CARDS_USER;
  return [5, 10, 15, 20, 25, 30, 40, 50].filter((n) => n <= max);
}

/**
 * Card-count dropdown options for generation UIs. First paint matches SSR (non-admin list);
 * after mount, syncs from localStorage so admins see full range without hydration mismatch.
 */
export function useCardCountOptions(): number[] {
  const [opts, setOpts] = useState<number[]>(() => getCardCountOptions(false));
  useEffect(() => {
    function sync() {
      setOpts(getCardCountOptions());
    }
    sync();
    window.addEventListener("flashcard_user_changed", sync);
    return () => window.removeEventListener("flashcard_user_changed", sync);
  }, []);
  return opts;
}

/**
 * Whether the selected user has product admin access (from localStorage, synced from
 * the user list). Always false until mount so server HTML matches the client’s first paint.
 * Updates when the account selector finishes loading or the user switches accounts.
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
