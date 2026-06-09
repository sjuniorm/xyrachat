"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateContact } from "@/lib/contacts/actions";
import { generateConversationSummary } from "@/lib/inbox/actions";
import {
  ChevronDown,
  ChevronRight,
  Mail,
  PanelRight,
  Phone,
  Plus,
  Sparkles,
  Loader2,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChannelIcon, channelLabel } from "@/components/ui/channel-icon";
import type { Conversation, Contact } from "@/lib/mock-data";
import { CONVERSATIONS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const TAG_COLORS: Record<Contact["tags"][number]["color"], string> = {
  purple:
    "bg-[color:var(--xyra-purple)]/15 text-[color:var(--xyra-glow)] border-[color:var(--xyra-purple)]/30",
  pink: "bg-[color:var(--xyra-pink)]/15 text-pink-300 border-pink-500/30",
  amber: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  emerald: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
  sky: "bg-sky-400/15 text-sky-300 border-sky-400/30",
};

// Shared body — used both inline (desktop aside) and inside a Sheet (tablet).
function ContactPanelBody({ conversation }: { conversation: Conversation }) {
  const [name, setName] = useState(conversation.contact.name);
  const [editingName, setEditingName] = useState(false);
  const [notes, setNotes] = useState(conversation.contact.notes);
  const [prevOpen, setPrevOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(
    conversation.contact.tags.map((t) => t.label),
  );
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [, startSave] = useTransition();
  const contactId = conversation.contact.id;

  // AI summary (on-demand)
  const [summary, setSummary] = useState<string | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [summarizing, setSummarizing] = useState(false);

  async function onSummarize() {
    setSummarizing(true);
    try {
      const r = await generateConversationSummary(conversation.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSummary(r.summary);
      setSuggestedTags(r.tags.filter((t) => !tags.includes(t)));
    } finally {
      setSummarizing(false);
    }
  }

  function persist(patch: { name?: string; notes?: string; tags?: string[] }) {
    startSave(async () => {
      const r = await updateContact({ id: contactId, ...patch });
      if (!r.ok) toast.error(r.error);
    });
  }
  function saveName() {
    setEditingName(false);
    if (name.trim() && name !== conversation.contact.name) persist({ name });
  }
  function saveNotes() {
    if (notes !== conversation.contact.notes) persist({ notes });
  }
  function addTag(label: string) {
    const t = label.trim();
    setNewTag("");
    setAddingTag(false);
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    persist({ tags: next });
  }
  function removeTag(label: string) {
    const next = tags.filter((x) => x !== label);
    setTags(next);
    persist({ tags: next });
  }

  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const otherConversations = CONVERSATIONS.filter(
    (c) => c.contact.id === conversation.contact.id && c.id !== conversation.id,
  );

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{ background: "color-mix(in oklab, var(--xyra-sidebar) 95%, black)" }}
    >
      <div className="flex flex-col items-center gap-3 border-b border-white/5 p-5 text-center">
        <Avatar className="size-16 ring-2 ring-white/10">
          <AvatarImage src={conversation.contact.avatar} alt="" />
          <AvatarFallback className="bg-[color:var(--xyra-purple)] text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        {editingName ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setName(conversation.contact.name);
                setEditingName(false);
              }
            }}
            className="h-8 text-center border-white/10 bg-white/5"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="rounded px-2 py-0.5 text-base font-medium text-white hover:bg-white/5"
          >
            {name}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title="Details">
          {conversation.contact.phone && (
            <DetailRow icon={<Phone className="size-3.5" />} label="Phone">
              <span className="text-white/80">{conversation.contact.phone}</span>
            </DetailRow>
          )}
          {conversation.contact.email && (
            <DetailRow icon={<Mail className="size-3.5" />} label="Email">
              <span className="truncate text-white/80">
                {conversation.contact.email}
              </span>
            </DetailRow>
          )}
          {conversation.contact.channel_handles.map((h, i) => (
            <DetailRow
              key={i}
              icon={<ChannelIcon channel={h.channel} size="sm" withRing={false} />}
              label={channelLabel(h.channel)}
            >
              <span className="truncate text-white/80">{h.handle}</span>
            </DetailRow>
          ))}
        </Section>

        <Section title="Tags">
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
            {tags.length === 0 && !addingTag && (
              <p className="text-xs text-white/50">No tags yet.</p>
            )}
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className={cn("h-6 gap-1 px-2 text-[11px]", TAG_COLORS.purple)}
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => removeTag(tag)}
                  className="text-current/70 hover:text-current"
                >
                  <X className="size-2.5" />
                </button>
              </Badge>
            ))}
            {addingTag ? (
              <Input
                autoFocus
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onBlur={() => addTag(newTag)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(newTag);
                  }
                  if (e.key === "Escape") {
                    setNewTag("");
                    setAddingTag(false);
                  }
                }}
                placeholder="Tag name"
                className="h-6 w-28 border-white/10 bg-white/5 px-2 text-[11px]"
              />
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddingTag(true)}
                className="h-6 gap-1 px-2 text-[11px] border-white/10"
              >
                <Plus className="size-3" /> Add
              </Button>
            )}
          </div>
        </Section>

        <Section title="Assigned to">
          <div className="px-3 pb-3">
            {conversation.assigned_agent ? (
              <div className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarImage src={conversation.assigned_agent.avatar} alt="" />
                  <AvatarFallback className="text-[10px]">
                    {conversation.assigned_agent.name[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-white/80">
                  {conversation.assigned_agent.name}
                </span>
              </div>
            ) : (
              <p className="text-xs text-white/50">No one assigned.</p>
            )}
          </div>
        </Section>

        <Section title="Notes">
          <div className="px-3 pb-3">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Internal notes about this contact (only your team sees these)"
              className="min-h-20 resize-none border-white/10 bg-white/5 text-sm text-white/90 placeholder:text-white/40"
            />
          </div>
        </Section>

        <Section title="AI summary">
          <div className="space-y-2 px-3 pb-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSummarize}
              disabled={summarizing}
              className="w-full border-white/10 text-white/80"
            >
              {summarizing ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5 text-[color:var(--xyra-glow)]" />
              )}
              {summary ? "Re-summarize" : "Summarize conversation"}
            </Button>
            {summary && (
              <p className="rounded-md border border-white/10 bg-white/5 p-2.5 text-xs leading-relaxed text-white/80">
                {summary}
              </p>
            )}
            {suggestedTags.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wide text-white/40">
                  Suggested tags — tap to add
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        addTag(t);
                        setSuggestedTags((prev) => prev.filter((x) => x !== t));
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--xyra-purple)]/30 bg-[color:var(--xyra-purple)]/10 px-2 py-0.5 text-[11px] text-[color:var(--xyra-glow)] hover:bg-[color:var(--xyra-purple)]/20"
                    >
                      <Plus className="size-3" /> {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        <button
          type="button"
          onClick={() => setPrevOpen((v) => !v)}
          className="flex w-full items-center justify-between border-t border-white/5 px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-white/60 hover:bg-white/5"
        >
          <span>Previous conversations · {otherConversations.length}</span>
          {prevOpen ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        {prevOpen && (
          <div className="border-t border-white/5">
            {otherConversations.length === 0 ? (
              <p className="px-3 py-3 text-xs text-white/50">
                No other conversations with this contact.
              </p>
            ) : (
              otherConversations.map((c) => (
                <a
                  key={c.id}
                  href={`/inbox/${c.id}`}
                  className="flex items-start gap-2 border-b border-white/5 px-3 py-2 hover:bg-white/5"
                >
                  <ChannelIcon channel={c.channel} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-white/80">
                      {c.last_message_preview}
                    </p>
                    <p className="text-[10px] text-white/50">
                      {new Date(c.last_message_at).toLocaleDateString()}
                    </p>
                  </div>
                </a>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Desktop inline aside (lg+ only).
export function ContactPanel({ conversation }: { conversation: Conversation }) {
  return (
    <aside className="hidden h-full w-[300px] shrink-0 border-l border-white/5 lg:block">
      <ContactPanelBody conversation={conversation} />
    </aside>
  );
}

// Tablet trigger (md ≤ width < lg) — opens a right-side Sheet with the same body.
export function ContactSheetTrigger({
  conversation,
}: {
  conversation: Conversation;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hidden h-8 w-8 shrink-0 md:inline-flex lg:hidden"
          aria-label="Show contact details"
          title="Contact details"
        >
          <PanelRight className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[320px] border-white/5 p-0 sm:max-w-[320px]"
        style={{ background: "color-mix(in oklab, var(--xyra-sidebar) 95%, black)" }}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Contact details</SheetTitle>
          <SheetDescription>
            Edit contact name, tags, notes and view conversation history.
          </SheetDescription>
        </SheetHeader>
        <ContactPanelBody conversation={conversation} />
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="px-3 pt-3 pb-1.5 text-xs font-medium uppercase tracking-wide text-white/60">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 text-sm">
      <span className="text-white/50">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
