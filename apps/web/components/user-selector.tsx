"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

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

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch(`${apiUrl}/users`, { cache: "no-store" });
        const data = await res.json();
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
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const userId = e.target.value;
    setSelectedUserId(userId);
    localStorage.setItem(STORAGE_KEY, userId);
    window.dispatchEvent(
      new CustomEvent("flashcard_user_changed", { detail: { userId } })
    );
  };

  if (loading || users.length === 0) return null;

  return (
    <select
      value={selectedUserId ?? ""}
      onChange={handleChange}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name}
        </option>
      ))}
    </select>
  );
}

export function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}
