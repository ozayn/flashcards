"use client";

import { useEffect, useState, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { getUsers } from "@/lib/api";
import { apiUrl } from "@/lib/api";
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadUsers() {
      setApiError(false);
      try {
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
    loadUsers();
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (userId: string) => {
    setSelectedUserId(userId);
    localStorage.setItem(STORAGE_KEY, userId);
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("flashcard_user_changed", { detail: { userId } })
    );
  };

  if (loading) return <span className="text-muted-foreground text-sm">Loading...</span>;

  if (apiError) {
    return (
      <span className="text-amber-600 text-sm" title={`API at ${apiUrl}`}>
        API unavailable
      </span>
    );
  }

  if (users.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">No users</span>
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
        </div>
      )}
    </div>
  );
}

export function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}
