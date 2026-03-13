"use client";

import { useEffect, useState, useRef } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { getUsers, createUser, checkApiAvailability, apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "flashcard_user_id";

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  created_at: string;
};

export function UserSelector() {
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

  async function loadUsers() {
    setApiError(false);
    try {
      const available = await checkApiAvailability();
      if (!available) {
        setApiError(true);
        setUsers([]);
        return;
      }

      const data = await getUsers();
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
      }
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
    setSelectedUserId(userId);
    localStorage.setItem(STORAGE_KEY, userId);
    setOpen(false);
    setShowAddForm(false);
    window.dispatchEvent(
      new CustomEvent("flashcard_user_changed", { detail: { userId } })
    );
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

  if (loading) return <span className="text-muted-foreground text-sm animate-pulse">Loading…</span>;

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
                type="email"
                placeholder="Email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                placeholder="Name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                required
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
                    type="email"
                    placeholder="Email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    required
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Name"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    required
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
