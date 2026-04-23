"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithRef,
} from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  MoreVertical,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageContainer from "@/components/layout/page-container";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getStoredUserId } from "@/components/user-selector";
import {
  buildCreateDeckSearchParamsFromIdea,
  createStudyIdea,
  deleteStudyIdea,
  getStudyIdeas,
  updateStudyIdea,
  type StudyIdea,
  type StudyIdeaStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_FILTER: { value: "all" | StudyIdeaStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "idea", label: "Idea" },
  { value: "ready", label: "Ready" },
  { value: "archived", label: "Archived" },
];

const STATUS_SHORT: Record<StudyIdeaStatus, string> = {
  idea: "Idea",
  ready: "Ready",
  archived: "Archived",
};

/** Shown in tooltips (filters, card badge, status help in edit). */
const STATUS_HELP: Record<"all" | StudyIdeaStatus, string> = {
  all: "Show every study idea, any status.",
  idea: "A rough topic or note to revisit later.",
  ready:
    "Prepared enough to turn into a deck—use Create deck when you are ready to build one.",
  archived: "Hidden from your active list.",
};

const ALL_STATUSES_STATUS_HELP = (
  <div className="space-y-1.5 text-left">
    <p>
      <span className="font-medium text-foreground/95">Idea</span> — {STATUS_HELP.idea}
    </p>
    <p>
      <span className="font-medium text-foreground/95">Ready</span> — {STATUS_HELP.ready}
    </p>
    <p>
      <span className="font-medium text-foreground/95">Archived</span> — {STATUS_HELP.archived}
    </p>
  </div>
);

function useCloseOnEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function IdeaRowMenu({
  idea,
  busy,
  onEdit,
  onSetStatus,
  onDelete,
}: {
  idea: StudyIdea;
  busy: boolean;
  onEdit: () => void;
  onSetStatus: (s: StudyIdeaStatus) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const btnId = useId();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  useCloseOnEscape(open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        id={btnId}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/80 hover:text-foreground disabled:opacity-50 touch-manipulation"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="More"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical className="size-4" />
      </button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          aria-labelledby={btnId}
          className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-border/50 bg-background py-1 text-sm shadow-md"
        >
          {idea.status === "idea" && (
            <li>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/60"
                onClick={() => {
                  setOpen(false);
                  onSetStatus("ready");
                }}
              >
                <CheckCircle2 className="size-3.5 opacity-60" />
                Mark ready
              </button>
            </li>
          )}
          {idea.status !== "archived" && (
            <li>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/60"
                onClick={() => {
                  setOpen(false);
                  onSetStatus("archived");
                }}
              >
                <Archive className="size-3.5 opacity-60" />
                Archive
              </button>
            </li>
          )}
          {idea.status === "archived" && (
            <li>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/60"
                onClick={() => {
                  setOpen(false);
                  onSetStatus("idea");
                }}
              >
                <RotateCcw className="size-3.5 opacity-60" />
                Restore
              </button>
            </li>
          )}
          <li className="my-1 h-px bg-border/60" role="none" />
          <li>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/60"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              <Pencil className="size-3.5 opacity-60" />
              Edit
            </button>
          </li>
          <li>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-destructive hover:bg-destructive/10"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="size-3.5 opacity-70" />
              Delete
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function IdeaCard({
  idea,
  onChange,
  onEdit,
}: {
  idea: StudyIdea;
  onChange: () => void;
  onEdit: (idea: StudyIdea) => void;
}) {
  const [busy, setBusy] = useState(false);
  const userId = getStoredUserId();
  const deckHref = `/create-deck?${buildCreateDeckSearchParamsFromIdea(idea)}`;

  async function setStatus(s: StudyIdeaStatus) {
    if (!userId) return;
    setBusy(true);
    try {
      await updateStudyIdea(idea.id, userId, { status: s });
      onChange();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!userId) return;
    if (!window.confirm("Delete this idea? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteStudyIdea(idea.id, userId);
      onChange();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={cn(
        "rounded-xl border border-border/40 bg-card/30 p-3 transition-colors hover:border-border/60",
        "dark:bg-card/20",
        idea.status === "archived" && "opacity-75"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-medium leading-snug text-foreground [overflow-wrap:anywhere]">
              {idea.title}
            </h2>
            <Tooltip>
              <TooltipTrigger
                delay={400}
                render={(props: ComponentPropsWithRef<"span">) => {
                  const { className: tc, ...tr } = props;
                  return (
                    <span
                      {...tr}
                      className={cn(
                        "shrink-0 cursor-default text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90",
                        tc
                      )}
                    >
                      {STATUS_SHORT[idea.status]}
                    </span>
                  );
                }}
              />
              <TooltipContent
                variant="hint"
                side="left"
                sideOffset={6}
                className="max-w-[16rem] text-balance"
              >
                {STATUS_HELP[idea.status]}
              </TooltipContent>
            </Tooltip>
          </div>
          {idea.body?.trim() ? (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-3 whitespace-pre-wrap">
              {idea.body}
            </p>
          ) : null}
          {idea.url?.trim() ? (
            <a
              href={idea.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex max-w-full items-center gap-0.5 text-xs text-primary/80 hover:underline [overflow-wrap:anywhere]"
            >
              <ExternalLink className="size-3 shrink-0 opacity-70" />
              <span className="truncate">{idea.url.replace(/^https?:\/\//, "")}</span>
            </a>
          ) : null}
        </div>
        <IdeaRowMenu
          idea={idea}
          busy={busy}
          onEdit={() => onEdit(idea)}
          onSetStatus={setStatus}
          onDelete={handleDelete}
        />
      </div>
      <div className="mt-3 flex items-center gap-1">
        <Link
          href={deckHref}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
            "bg-foreground/90 text-background hover:bg-foreground dark:bg-foreground/85",
            busy && "pointer-events-none opacity-50"
          )}
        >
          <Sparkles className="size-3" />
          Create deck
        </Link>
        {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
      </div>
    </article>
  );
}

function EditIdeaFields({
  title,
  setTitle,
  body,
  setBody,
  url,
  setUrl,
  idPrefix,
}: {
  title: string;
  setTitle: (s: string) => void;
  body: string;
  setBody: (s: string) => void;
  url: string;
  setUrl: (s: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-2.5">
      <Input
        id={`${idPrefix}-title`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="h-9"
        maxLength={500}
      />
      <textarea
        id={`${idPrefix}-body`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder="Note (optional)"
      />
      <Input
        id={`${idPrefix}-url`}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        type="url"
        className="h-9"
        inputMode="url"
        autoComplete="url"
        placeholder="https://…"
      />
    </div>
  );
}

export default function StudyIdeasPage() {
  const { status: sessionStatus } = useSession();
  const [ideas, setIdeas] = useState<StudyIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | StudyIdeaStatus>("all");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [editing, setEditing] = useState<StudyIdea | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editStatus, setEditStatus] = useState<StudyIdeaStatus>("idea");

  const userId = getStoredUserId();
  const authed = sessionStatus === "authenticated";
  const showOptionalFields = detailsOpen;

  const load = useCallback(async () => {
    if (!userId) {
      setIdeas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getStudyIdeas(
        userId,
        filter === "all" ? undefined : { status: filter }
      );
      setIdeas(Array.isArray(data) ? data : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
      setIdeas([]);
    } finally {
      setLoading(false);
    }
  }, [userId, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetCapture() {
    setNewTitle("");
    setNewBody("");
    setNewUrl("");
    setDetailsOpen(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !newTitle.trim()) {
      setFormError("Add a short title first.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createStudyIdea({
        user_id: userId,
        title: newTitle.trim(),
        body: newBody.trim() || null,
        url: newUrl.trim() || null,
        status: "idea",
      });
      setFormError(null);
      resetCapture();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(idea: StudyIdea) {
    setFormError(null);
    setEditing(idea);
    setEditTitle(idea.title);
    setEditBody(idea.body || "");
    setEditUrl(idea.url || "");
    setEditStatus(idea.status);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !editing) return;
    if (!editTitle.trim()) {
      setFormError("Add a title.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await updateStudyIdea(editing.id, userId, {
        title: editTitle.trim(),
        body: editBody.trim() || null,
        url: editUrl.trim() || null,
        status: editStatus,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Study ideas</h1>
        <p className="mt-0.5 text-xs text-muted-foreground/90 sm:max-w-sm">
          Capture topics before you create a deck.
        </p>
      </div>

      {!authed && (
        <p className="text-sm text-muted-foreground mt-5 max-w-md">
          <Link href="/signin" className="text-foreground/90 underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          to keep ideas in your account.
        </p>
      )}

      {authed && !userId && (
        <p className="text-xs text-muted-foreground mt-4 max-w-sm">
          Select a profile in the <span className="whitespace-nowrap">top-right</span> menu to continue.
        </p>
      )}

      {authed && userId && (
        <>
          <div className="mt-5 max-w-3xl border-b border-border/40">
            <nav
              className="flex flex-wrap items-center gap-x-4 gap-y-0.5 -mb-px"
              aria-label="Filter by status"
            >
              {STATUS_FILTER.map((f) => (
                <Tooltip key={f.value}>
                  <TooltipTrigger
                    delay={400}
                    render={(props: ComponentPropsWithRef<"button">) => {
                      const { className: tc, ref, ...tr } = props;
                      return (
                        <button
                          ref={ref}
                          type="button"
                          {...tr}
                          onClick={(e) => {
                            tr.onClick?.(e);
                            setFilter(f.value);
                          }}
                          className={cn(
                            "border-b-2 py-1.5 text-xs transition-colors",
                            filter === f.value
                              ? "border-foreground/70 font-medium text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground/80",
                            tc
                          )}
                        >
                          {f.label}
                        </button>
                      );
                    }}
                  />
                  <TooltipContent
                    variant="hint"
                    side="bottom"
                    sideOffset={6}
                    className="z-50 max-w-[16rem] text-balance"
                  >
                    {STATUS_HELP[f.value]}
                  </TooltipContent>
                </Tooltip>
              ))}
            </nav>
          </div>

          <form onSubmit={handleCreate} className="mt-4 max-w-3xl" aria-label="Add study idea">
            <div className="rounded-lg border border-border/30 bg-background/40 dark:bg-background/20">
              <div className="flex items-stretch gap-0.5 p-1.5 pr-1">
                <Input
                  name="new-idea-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="h-9 min-h-0 flex-1 border-0 bg-transparent px-2 text-[15px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
                  maxLength={500}
                  autoComplete="off"
                  placeholder="What do you want to learn?"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 self-center px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setDetailsOpen((o) => !o)}
                  aria-expanded={showOptionalFields}
                >
                  {showOptionalFields ? "Hide" : "Details"}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 shrink-0 self-center px-3 text-xs"
                  disabled={saving || !newTitle.trim()}
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
                </Button>
              </div>
              {showOptionalFields && (
                <div className="space-y-1.5 border-t border-border/20 px-2.5 py-2">
                  <textarea
                    name="new-idea-body"
                    value={newBody}
                    onChange={(e) => setNewBody(e.target.value)}
                    rows={2}
                    className="w-full resize-y rounded-md border-0 bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none"
                    placeholder="Add a short note (optional)"
                  />
                  <Input
                    name="new-idea-url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                  />
                </div>
              )}
            </div>
            {formError && !editing ? (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
          </form>

          {loadError && (
            <p className="text-sm text-destructive mt-4" role="alert">
              {loadError}
            </p>
          )}

          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground/70">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : ideas.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground/80 py-14 max-w-sm mx-auto">
              {filter === "all" ? "Nothing here yet. Add a title above." : `No ideas in this view.`}
            </p>
          ) : (
            <ul className="mt-6 flex max-w-3xl list-none flex-col gap-2 p-0" role="list">
              {ideas.map((idea) => (
                <li key={idea.id}>
                  <IdeaCard idea={idea} onChange={load} onEdit={openEdit} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {editing && userId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-foreground/10 backdrop-blur-[2px]"
          role="dialog"
          aria-modal
          aria-labelledby="edit-idea-title"
          onClick={() => {
            if (!saving) {
              setEditing(null);
              setFormError(null);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border/50 bg-card p-5 shadow-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-idea-title" className="text-base font-semibold text-foreground">
              Edit
            </h2>
            <form onSubmit={saveEdit} className="mt-4 space-y-3">
              <EditIdeaFields
                idPrefix="edit"
                title={editTitle}
                setTitle={setEditTitle}
                body={editBody}
                setBody={setEditBody}
                url={editUrl}
                setUrl={setEditUrl}
              />
              <div>
                <div className="mb-1 flex items-center gap-0.5">
                  <label htmlFor="edit-status" className="text-xs text-muted-foreground">
                    Status
                  </label>
                  <Tooltip>
                    <TooltipTrigger
                      delay={300}
                      render={(props: ComponentPropsWithRef<"button">) => {
                        const { className: tc, ref, ...tr } = props;
                        return (
                          <button
                            ref={ref}
                            type="button"
                            {...tr}
                            className={cn(
                              "inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                              tc
                            )}
                            aria-label="What Idea, Ready, and Archived mean"
                          >
                            <HelpCircle className="size-3" strokeWidth={1.75} />
                          </button>
                        );
                      }}
                    />
                    <TooltipContent
                      variant="hint"
                      side="right"
                      align="start"
                      sideOffset={8}
                      className="z-[110] max-w-[17rem]"
                    >
                      {ALL_STATUSES_STATUS_HELP}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <select
                  id="edit-status"
                  className="h-8 w-full rounded-md border border-border/50 bg-background px-2 text-sm"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as StudyIdeaStatus)}
                >
                  {(["idea", "ready", "archived"] as const).map((s) => (
                    <option key={s} value={s} title={STATUS_HELP[s]}>
                      {STATUS_SHORT[s]}
                    </option>
                  ))}
                </select>
              </div>
              {formError && editing ? (
                <p className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving || !editTitle.trim()}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
