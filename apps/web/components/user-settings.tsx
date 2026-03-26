"use client";

import { useEffect, useState, useRef } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUserSettings, updateUserSettings, type UserSettings } from "@/lib/api";
import { getStoredUserId } from "@/components/user-selector";
import { cn } from "@/lib/utils";

export function UserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userId = getStoredUserId();
    if (userId) {
      getUserSettings(userId)
        .then(setSettings)
        .catch(() => setSettings(null));
    } else {
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    const handleUserChanged = () => {
      const userId = getStoredUserId();
      if (userId) {
        getUserSettings(userId).then(setSettings).catch(() => setSettings(null));
      } else {
        setSettings(null);
      }
    };
    window.addEventListener("flashcard_user_changed", handleUserChanged);
    return () => window.removeEventListener("flashcard_user_changed", handleUserChanged);
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

  const handleStyleChange = async (style: "paper" | "minimal" | "modern" | "anki") => {
    const userId = getStoredUserId();
    if (!userId || !settings) return;
    try {
      const updated = await updateUserSettings(userId, { card_style: style });
      setSettings(updated);
      window.dispatchEvent(new CustomEvent("flashcard_settings_changed", { detail: { settings: updated } }));
    } catch {
      // ignore
    }
  };

  if (!settings) return null;

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="size-8 text-muted-foreground hover:text-foreground"
        aria-label="Settings"
        aria-expanded={open}
      >
        <Settings className="size-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-popover p-3 shadow-lg">
          <p className="text-sm font-medium mb-2">Flashcard Style</p>
          <div className="flex flex-col gap-1">
            {(["paper", "minimal", "modern", "anki"] as const).map((style) => (
              <label
                key={style}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm",
                  settings.card_style === style && "bg-accent"
                )}
              >
                <input
                  type="radio"
                  name="card-style"
                  checked={settings.card_style === style}
                  onChange={() => handleStyleChange(style)}
                  className="rounded-full"
                />
                {style.charAt(0).toUpperCase() + style.slice(1)}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
