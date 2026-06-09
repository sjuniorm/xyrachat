"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { StickyNote, Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createSavedReply,
  updateSavedReply,
  deleteSavedReply,
  recordSavedReplyUse,
} from "@/lib/saved-replies/actions";

type Reply = { id: string; title: string; body: string; category: string | null; usage_count: number };

// Replace {{key}} tokens with the conversation's variables; leave unknown
// tokens untouched so a typo doesn't blank out text.
function renderVars(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m,
  );
}

export function SavedRepliesPopover({
  onInsert,
  disabled,
  variables = {},
}: {
  onInsert: (body: string) => void;
  disabled?: boolean;
  variables?: Record<string, string>;
}) {
  const [supabase] = useState(() => createClient());
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [pending, startTransition] = useTransition();

  const resetForm = () => {
    setCreating(false);
    setEditingId(null);
    setTitle("");
    setBody("");
    setCategory("");
  };

  const startEdit = (r: Reply) => {
    setEditingId(r.id);
    setTitle(r.title);
    setBody(r.body);
    setCategory(r.category ?? "");
    setCreating(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from("saved_replies")
      .select("id, title, body, category, usage_count")
      .is("deleted_at", null)
      .order("category", { nullsFirst: false })
      .order("title");
    if (error) setLoadError(true);
    setReplies((data as Reply[] | null) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const onSave = () => {
    if (!title.trim() || !body.trim()) return;
    const fd = new FormData();
    fd.set("title", title);
    fd.set("body", body);
    fd.set("category", category);
    if (editingId) fd.set("id", editingId);
    startTransition(async () => {
      const r = editingId ? await updateSavedReply(fd) : await createSavedReply(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      resetForm();
      await load();
    });
  };

  const onDelete = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const r = await deleteSavedReply(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setReplies((prev) => prev.filter((x) => x.id !== id));
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1.5 px-2 text-xs text-white/70 hover:text-white"
        >
          <StickyNote className="size-3.5" />
          <span className="hidden sm:inline">Saved replies</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 border-white/10 bg-[#1F1033] p-2 text-white"
      >
        <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-white/40">
          Saved replies
        </p>
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <p className="px-2 py-4 text-center text-xs text-white/40">Loading…</p>
          ) : loadError ? (
            <button
              type="button"
              onClick={() => void load()}
              className="w-full px-2 py-4 text-center text-xs text-rose-300 hover:underline"
            >
              Couldn&apos;t load saved replies — tap to retry.
            </button>
          ) : replies.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-white/40">
              No saved replies yet.
            </p>
          ) : (
            replies.map((r) => (
              <div
                key={r.id}
                className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-white/5"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    onInsert(renderVars(r.body, variables));
                    void recordSavedReplyUse(r.id);
                    setOpen(false);
                  }}
                >
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {r.title}
                    {r.category && (
                      <span className="shrink-0 rounded bg-white/10 px-1 py-px text-[9px] uppercase tracking-wide text-white/50">
                        {r.category}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-white/50">{r.body}</p>
                </button>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    disabled={pending}
                    aria-label="Edit saved reply"
                  >
                    <Pencil className="size-3.5 text-white/40 hover:text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(r.id)}
                    disabled={pending}
                    aria-label="Delete saved reply"
                  >
                    <Trash2 className="size-3.5 text-white/40 hover:text-red-400" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-1 border-t border-white/10 pt-2">
          {creating ? (
            <div className="flex flex-col gap-2 p-1">
              <p className="px-0.5 text-xs font-medium text-white/60">
                {editingId ? "Edit saved reply" : "New saved reply"}
              </p>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (e.g. Opening hours)"
                maxLength={80}
              />
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category (optional, e.g. Billing)"
                maxLength={40}
              />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message… use {{contact_name}} or {{first_name}}"
                rows={3}
              />
              <p className="px-0.5 text-[10px] text-white/40">
                Variables: {"{{contact_name}}"}, {"{{first_name}}"} — filled in when inserted.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={onSave}
                  disabled={pending || !title.trim() || !body.trim()}
                  className="xyra-gradient flex-1 border-0 text-white"
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCreating(true)}
              className="w-full justify-start gap-2 text-white/70 hover:text-white"
            >
              <Plus className="size-3.5" /> New saved reply
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
