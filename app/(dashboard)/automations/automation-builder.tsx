"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Trash2, Save, AlertCircle,
  MessageSquare, Tag, UserPlus2, Webhook,
  Camera, AtSign, MessageCircle, Mail, Shuffle, Clock, GitBranch, Reply, ListPlus,
  MousePointerClick, Plus, Zap, ChevronUp, ChevronDown, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createAutomation,
  updateAutomation,
  testAiBranch,
} from "@/lib/automations/actions";
import {
  allowedTriggersForChannel,
  type Action,
  type LeafAction,
  type AutomationCondition,
  type TriggerConfig,
  type TriggerType,
} from "@/lib/automations/types";
import { FlowCanvas } from "@/components/automations/flow-canvas";
import { Switch } from "@/components/ui/switch";
import { BusinessHoursEditor } from "@/components/bots/business-hours-editor";
import {
  DAY_KEYS,
  allDaysClosed,
  defaultBusinessHours,
  sanitizeBusinessHours,
  type BusinessHours,
} from "@/lib/bots/business-hours";

type Channel = { id: string; name: string; type: string };
type Member = { id: string; name: string };
type Sequence = { id: string; name: string };

const TRIGGER_OPTIONS: Array<{
  value: TriggerType;
  label: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  needsKeywords: boolean;
}> = [
  { value: "ig_dm_keyword", label: "IG DM keyword", blurb: "Fires when a DM contains your keywords.", icon: Camera, needsKeywords: true },
  { value: "ig_comment_keyword", label: "IG comment keyword", blurb: "Fires when someone comments your keywords on a post.", icon: Camera, needsKeywords: true },
  { value: "ig_story_mention", label: "IG story mention", blurb: "Fires when someone mentions your account in a story.", icon: AtSign, needsKeywords: false },
  { value: "ig_new_follower", label: "New IG follower", blurb: "Fires when someone follows your IG account.", icon: UserPlus2, needsKeywords: false },
  { value: "wa_keyword", label: "WhatsApp keyword", blurb: "Fires on inbound WA messages containing your keywords.", icon: MessageSquare, needsKeywords: true },
  { value: "tg_keyword", label: "Telegram keyword", blurb: "Fires on inbound Telegram messages containing your keywords.", icon: MessageSquare, needsKeywords: true },
  { value: "email_keyword", label: "Email keyword", blurb: "Fires on inbound emails — matches subject + body.", icon: Mail, needsKeywords: true },
  { value: "conversation_opened", label: "First message", blurb: "Fires once on the contact's first message in this channel.", icon: MessageCircle, needsKeywords: false },
  { value: "webhook", label: "External webhook", blurb: "Fires when an external system POSTs to this automation's trigger URL (shown after you save).", icon: Webhook, needsKeywords: false },
];

const ACTION_OPTIONS: Array<{
  type: Action["type"];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  available: boolean;
  // Instagram-only: quick-reply buttons are an IG messaging feature.
  igOnly?: boolean;
}> = [
  { type: "send_dm", label: "Send DM", icon: MessageSquare, available: true },
  { type: "send_buttons", label: "Send buttons (opt-in)", icon: MousePointerClick, available: true, igOnly: true },
  { type: "tag_contact", label: "Tag contact", icon: Tag, available: true },
  { type: "assign_agent", label: "Assign to agent", icon: UserPlus2, available: true },
  { type: "assign_smart", label: "Smart routing", icon: Shuffle, available: true },
  { type: "condition", label: "If / else", icon: GitBranch, available: true },
  { type: "ai_branch", label: "AI intent split", icon: Sparkles, available: true },
  { type: "wait", label: "Wait / delay", icon: Clock, available: true },
  { type: "wait_for_reply", label: "Wait for reply", icon: Reply, available: true },
  { type: "webhook", label: "Webhook (POST)", icon: Webhook, available: true },
  { type: "add_to_sequence", label: "Add to sequence", icon: ListPlus, available: true },
];

// Visual identity per action type — a readable label + icon + a colored icon
// badge. Kept consistent with the flow-canvas tones so List and Flow views feel
// like the same product.
const ACTION_META: Record<
  Action["type"],
  { label: string; icon: React.ComponentType<{ className?: string }>; badge: string }
> = {
  send_dm: { label: "Send message", icon: MessageSquare, badge: "bg-emerald-400/15 text-emerald-300" },
  send_buttons: { label: "Send buttons", icon: MousePointerClick, badge: "bg-[color:var(--xyra-purple)]/25 text-[color:var(--xyra-glow)]" },
  tag_contact: { label: "Tag contact", icon: Tag, badge: "bg-sky-400/15 text-sky-300" },
  assign_agent: { label: "Assign to agent", icon: UserPlus2, badge: "bg-amber-400/15 text-amber-300" },
  assign_smart: { label: "Smart routing", icon: Shuffle, badge: "bg-amber-400/15 text-amber-300" },
  condition: { label: "If / else", icon: GitBranch, badge: "bg-[color:var(--xyra-pink)]/20 text-[color:var(--xyra-pink)]" },
  ai_branch: { label: "AI intent split", icon: Sparkles, badge: "bg-cyan-400/15 text-cyan-300" },
  wait: { label: "Wait / delay", icon: Clock, badge: "bg-zinc-400/15 text-zinc-200" },
  wait_for_reply: { label: "Wait for reply", icon: Reply, badge: "bg-blue-400/15 text-blue-300" },
  webhook: { label: "Webhook (POST)", icon: Webhook, badge: "bg-fuchsia-400/15 text-fuchsia-300" },
  add_to_sequence: { label: "Add to sequence", icon: ListPlus, badge: "bg-indigo-400/15 text-indigo-300" },
};

// Leaf action types offered inside an if/else branch (no nesting).
const BRANCH_ACTION_OPTIONS: Array<{ type: LeafAction["type"]; label: string }> = [
  { type: "send_dm", label: "Send DM" },
  { type: "tag_contact", label: "Tag" },
  { type: "assign_agent", label: "Assign" },
  { type: "assign_smart", label: "Smart routing" },
  { type: "webhook", label: "Webhook" },
];

function freshLeaf(type: LeafAction["type"], members: Member[]): LeafAction {
  switch (type) {
    case "send_dm":
      return { type, text: "" };
    case "tag_contact":
      return { type, tag: "" };
    case "assign_agent":
      return { type, agent_id: members[0]?.id ?? null };
    case "assign_smart":
      return { type, strategy: "round_robin", only_online: true };
    case "webhook":
      return { type, url: "" };
    default:
      return { type: "send_dm", text: "" };
  }
}

// Friendly value+unit <-> milliseconds for the wait action editor.
const WAIT_UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;
type WaitUnit = keyof typeof WAIT_UNIT_MS;
function msToWait(ms: number): { value: number; unit: WaitUnit } {
  if (ms > 0 && ms % WAIT_UNIT_MS.days === 0) return { value: ms / WAIT_UNIT_MS.days, unit: "days" };
  if (ms > 0 && ms % WAIT_UNIT_MS.hours === 0) return { value: ms / WAIT_UNIT_MS.hours, unit: "hours" };
  return { value: Math.max(1, Math.round((ms || 0) / WAIT_UNIT_MS.minutes)), unit: "minutes" };
}

// Small square icon button used for the reorder/remove controls on a step card.
function StepIconButton({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex size-7 items-center justify-center rounded-md text-white/45 transition hover:bg-white/10 ${
        danger ? "hover:text-red-300" : "hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

// Thin vertical connector drawn between flow steps so the List view reads as a
// sequence, not a stack of forms.
function StepConnector() {
  return (
    <div className="flex justify-center" aria-hidden>
      <div className="h-5 w-px bg-gradient-to-b from-white/25 to-white/5" />
    </div>
  );
}

// "+ Add step" palette. A clean popover grid of the available action types
// (filtered by channel) instead of a cramped row of chips.
function AddStepMenu({
  channelType,
  onAdd,
  children,
}: {
  channelType?: string;
  onAdd: (type: Action["type"]) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const opts = ACTION_OPTIONS.filter(
    (o) => o.available && (!o.igOnly || channelType === "instagram"),
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <p className="px-1.5 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
          Add a step
        </p>
        <div className="flex flex-col gap-0.5">
          {opts.map((o) => {
            const meta = ACTION_META[o.type];
            const Icon = meta.icon;
            return (
              <button
                key={o.type}
                type="button"
                onClick={() => {
                  onAdd(o.type);
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition hover:bg-white/5"
              >
                <span
                  className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md ${meta.badge}`}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="text-xs font-medium text-white">{o.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AutomationBuilder({
  mode,
  initial,
  channels,
  members,
  sequences = [],
}: {
  mode: "create" | "edit";
  initial?: {
    id: string;
    name: string;
    description: string | null;
    channelId: string;
    triggerType: TriggerType;
    triggerConfig: TriggerConfig;
    actions: Action[];
  };
  channels: Channel[];
  members: Member[];
  sequences?: Sequence[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [channelId, setChannelId] = useState(
    initial?.channelId ?? channels[0]?.id ?? "",
  );
  const channel = channels.find((c) => c.id === channelId);
  const availableTriggers = useMemo(
    () => allowedTriggersForChannel(channel?.type ?? "") as TriggerType[],
    [channel?.type],
  );
  const visibleTriggers = TRIGGER_OPTIONS.filter((t) => availableTriggers.includes(t.value));

  const [triggerType, setTriggerType] = useState<TriggerType>(
    initial?.triggerType ?? visibleTriggers[0]?.value ?? "ig_dm_keyword",
  );
  const triggerMeta = TRIGGER_OPTIONS.find((t) => t.value === triggerType);
  const [keywordsInput, setKeywordsInput] = useState(
    (initial?.triggerConfig?.keywords ?? []).join(", "),
  );
  const [postId, setPostId] = useState(initial?.triggerConfig?.post_id ?? "");
  const [matchMode, setMatchMode] = useState<"any" | "exact">(
    initial?.triggerConfig?.match ?? "any",
  );

  // Active-hours gate (optional). Reuses the bot's business-hours shape + editor.
  const [hoursActive, setHoursActive] = useState(
    Boolean(initial?.triggerConfig?.business_hours?.active),
  );
  const [hours, setHours] = useState<BusinessHours>(() => {
    const initialHours = sanitizeBusinessHours(initial?.triggerConfig?.business_hours);
    const hasWindow = DAY_KEYS.some((d) => (initialHours[d]?.length ?? 0) > 0);
    return hasWindow
      ? initialHours
      : { ...defaultBusinessHours(initialHours.timezone), active: initialHours.active };
  });

  const [actions, setActions] = useState<Action[]>(
    initial?.actions ?? [
      { type: "send_dm", text: "Hi {{first_name}}, thanks for reaching out!" },
    ],
  );
  // Builder view: the linear list, or the visual flow canvas (click a node to
  // edit that step). Both edit the same `actions` state + Save path.
  const [view, setView] = useState<"linear" | "flow">("linear");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const triggerConfig: TriggerConfig = useMemo(() => {
    const cfg: TriggerConfig = {};
    if (triggerMeta?.needsKeywords) {
      cfg.keywords = keywordsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      cfg.match = matchMode;
    }
    if (triggerType === "ig_comment_keyword" && postId.trim()) {
      cfg.post_id = postId.trim();
    }
    if (hoursActive) {
      cfg.business_hours = sanitizeBusinessHours({ ...hours, active: true });
    }
    return cfg;
  }, [triggerMeta, keywordsInput, matchMode, triggerType, postId, hoursActive, hours]);

  const flowTriggerLabel = useMemo(() => {
    const kw = triggerConfig.keywords ?? [];
    const base = triggerType.replace(/_/g, " ");
    return kw.length ? `${base}: ${kw.join(", ")}` : base;
  }, [triggerConfig, triggerType]);

  // Nicely-cased trigger summary for the flow anchor pill (uses the proper
  // option label rather than the snake_case type).
  const triggerSummary = useMemo(() => {
    const kw = triggerConfig.keywords ?? [];
    const base = triggerMeta?.label ?? triggerType.replace(/_/g, " ");
    return kw.length ? `${base} — ${kw.join(", ")}` : base;
  }, [triggerConfig, triggerMeta, triggerType]);

  const allowMessageCondition =
    (triggerMeta?.needsKeywords ?? false) ||
    actions.some((x) => x.type === "wait_for_reply");
  const allowReplyCondition = actions.some((x) => x.type === "wait_for_reply");

  // One ActionRow, reused by the linear list AND the flow view's edit panel.
  const renderActionRow = (a: Action, i: number) => (
    <ActionRow
      key={i}
      index={i}
      action={a}
      members={members}
      sequences={sequences}
      allowMessageCondition={allowMessageCondition}
      allowReplyCondition={allowReplyCondition}
      onChange={(next) => {
        const arr = [...actions];
        arr[i] = next;
        setActions(arr);
      }}
      onRemove={() => {
        setActions((cur) => cur.filter((_, j) => j !== i));
        setSelectedIdx(null);
      }}
      onMoveUp={
        i > 0
          ? () => {
              const arr = [...actions];
              [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
              setActions(arr);
            }
          : undefined
      }
      onMoveDown={
        i < actions.length - 1
          ? () => {
              const arr = [...actions];
              [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
              setActions(arr);
            }
          : undefined
      }
    />
  );

  function addAction(type: Action["type"]) {
    let fresh: Action;
    switch (type) {
      case "send_dm":
        fresh = { type, text: "" };
        break;
      case "tag_contact":
        fresh = { type, tag: "" };
        break;
      case "assign_agent":
        fresh = { type, agent_id: members[0]?.id ?? null };
        break;
      case "assign_smart":
        fresh = { type, strategy: "round_robin", only_online: true };
        break;
      case "wait":
        fresh = { type, ms: WAIT_UNIT_MS.hours }; // default: 1 hour
        break;
      case "wait_for_reply":
        fresh = { type, timeout_ms: WAIT_UNIT_MS.days }; // default: 24h timeout
        break;
      case "condition":
        fresh = {
          type,
          match: "all",
          conditions: [{ field: "tag", op: "has", value: "" }],
          then: [],
          else: [],
        };
        break;
      case "webhook":
        fresh = { type, url: "" };
        break;
      case "add_to_sequence":
        fresh = { type, sequence_id: sequences[0]?.id ?? "" };
        break;
      case "send_buttons":
        fresh = {
          type,
          text: "Tap below and I'll send it over 👇",
          buttons: [
            { id: crypto.randomUUID(), title: "Send me the link", then: [{ type: "send_dm", text: "" }] },
          ],
        };
        break;
      case "ai_branch":
        fresh = {
          type,
          intents: [
            { id: crypto.randomUUID(), label: "", description: "", then: [] },
            { id: crypto.randomUUID(), label: "", description: "", then: [] },
          ],
          else: [],
        };
        break;
      default:
        return;
    }
    setActions((cur) => [...cur, fresh]);
  }

  // Add a step and immediately select it (so the flow view opens its editor).
  const handleAdd = (type: Action["type"]) => {
    setSelectedIdx(actions.length);
    addAction(type);
  };

  // One-click "comment → DM opt-in" recipe — the standard, Meta-compliant flow
  // for IG comment triggers: reply with an opt-in button + a "follow first" gate,
  // then deliver the link only after the user taps. Editable after applying.
  const applyCommentRecipe = () => {
    const recipe: Action[] = [
      {
        type: "send_buttons",
        text: "Hey {{first_name}}! 🙌 Tap below and I'll send it straight to your DMs 👇",
        buttons: [
          {
            id: crypto.randomUUID(),
            title: "Send me the link",
            gate: {
              text: "One quick thing — follow us first, then tap below 🙌",
              button_title: "I followed!",
            },
            then: [{ type: "send_dm", text: "Here you go! 🔗 https://" }],
          },
        ],
      },
    ];
    // A single send_dm is the builder's seed step — replace it silently. Anything
    // more (a flow the user built) gets a confirm before we overwrite it.
    const isSeed = actions.length <= 1 && (actions[0]?.type ?? "send_dm") === "send_dm";
    if (
      !isSeed &&
      !window.confirm("Replace the current steps with the comment → DM opt-in recipe?")
    ) {
      return;
    }
    setActions(recipe);
    setSelectedIdx(0);
  };

  function submit() {
    if (!name.trim()) return toast.error("Add a name.");
    if (!channelId) return toast.error("Pick a channel.");
    if (triggerMeta?.needsKeywords && (triggerConfig.keywords ?? []).length === 0) {
      return toast.error("Add at least one keyword for this trigger.");
    }
    if (actions.length === 0) return toast.error("Add at least one action.");

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createAutomation({
              name,
              description: description || undefined,
              channelId,
              triggerType,
              triggerConfig,
              actions,
            })
          : await updateAutomation(initial!.id, {
              name,
              description: description || null,
              trigger_type: triggerType,
              trigger_config: triggerConfig,
              actions,
            });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(mode === "create" ? "Automation created" : "Saved");
      // createAutomation returns the new id; updateAutomation doesn't —
      // narrow the result so the route push is type-safe.
      if (mode === "create") {
        const created = res as { ok: true; data?: { automationId: string } };
        router.push(
          created.data?.automationId
            ? `/automations/${created.data.automationId}`
            : "/automations",
        );
      } else {
        router.push("/automations");
      }
      router.refresh();
    });
  }

  // Reset triggerType if the channel switch invalidates it.
  if (!visibleTriggers.some((t) => t.value === triggerType) && visibleTriggers[0]) {
    setTimeout(() => setTriggerType(visibleTriggers[0].value), 0);
  }

  return (
    <div className="space-y-6">
      {/* Setup */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-xs">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-reply: pricing"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="desc" className="text-xs">Description (optional)</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Who or what this is for"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Channel</Label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white"
              disabled={mode === "edit"}
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id} className="bg-zinc-900">
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
            {mode === "edit" && (
              <p className="mt-1 text-[10px] text-white/40">
                Channel can't be changed after creation. Make a new automation
                if you need to switch.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trigger */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Trigger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {visibleTriggers.map((t) => {
              const Icon = t.icon;
              const active = triggerType === t.value;
              const disabled = t.value === "ig_new_follower";
              return (
                <button
                  key={t.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setTriggerType(t.value)}
                  className={`flex gap-2.5 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span
                    className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition ${
                      active
                        ? "bg-[color:var(--xyra-glow)]/20 text-[color:var(--xyra-glow)]"
                        : "bg-white/10 text-white/70"
                    }`}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                      {t.label}
                      {disabled && (
                        <Badge variant="outline" className="h-4 border-white/20 bg-white/5 px-1 text-[9px] text-white/60">
                          soon
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-white/55">{t.blurb}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {triggerType === "ig_new_follower" && (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/5 p-2 text-[11px] text-amber-200/80">
              <AlertCircle className="mt-px size-3 shrink-0" />
              Instagram&apos;s API only exposes a follower <em>count</em>, never
              who follows you — so no tool can detect or message a specific new
              follower (anything claiming to is scraping, which risks your
              account). Use <strong>First message</strong> instead: it fires the
              moment a new person DMs you, which is when you can actually reach
              them.
            </p>
          )}

          {triggerMeta?.needsKeywords && (
            <>
              <div>
                <Label htmlFor="kw" className="text-xs">Keywords</Label>
                <Input
                  id="kw"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  placeholder="price, info, hello"
                  className="mt-1"
                />
                <p className="mt-1 text-[10px] text-white/50">
                  Comma-separated. Case-insensitive.
                </p>
              </div>
              <div>
                <Label className="text-xs">Match</Label>
                <div className="mt-1 flex gap-2">
                  {(["any", "exact"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMatchMode(m)}
                      className={`flex-1 rounded-md border p-2 text-xs ${
                        matchMode === m
                          ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/10 text-white"
                          : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {m === "any" ? "Anywhere in message" : "Whole message only"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {triggerType === "ig_comment_keyword" && (
            <div>
              <Label htmlFor="post_id" className="text-xs">Specific post (optional)</Label>
              <Input
                id="post_id"
                value={postId}
                onChange={(e) => setPostId(e.target.value)}
                placeholder="Camera media id (leave blank for any post)"
                className="mt-1"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active hours */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">When it can run</CardTitle>
          <label className="flex items-center gap-2 text-xs text-white/60">
            Only during set hours
            <Switch checked={hoursActive} onCheckedChange={setHoursActive} />
          </label>
        </CardHeader>
        {hoursActive && (
          <CardContent className="space-y-3">
            <p className="text-[11px] leading-snug text-white/50">
              Outside these hours the automation won&apos;t fire — incoming messages
              just won&apos;t get an automatic reply until you&apos;re open again.
            </p>
            {allDaysClosed(hours) && (
              <p className="rounded-md border border-amber-400/30 bg-amber-400/5 px-2.5 py-2 text-[11px] text-amber-200/80">
                These hours are closed every day — add at least one open window or
                the automation will never run.
              </p>
            )}
            <BusinessHoursEditor value={hours} onChange={setHours} />
          </CardContent>
        )}
      </Card>

      {/* Actions */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Steps</CardTitle>
            <div className="flex rounded-md border border-white/10 bg-white/5 p-0.5 text-[11px]">
              {(["linear", "flow"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded px-2 py-0.5 ${
                    view === v ? "bg-white/15 text-white" : "text-white/55 hover:text-white"
                  }`}
                >
                  {v === "linear" ? "List" : "Flow"}
                </button>
              ))}
            </div>
          </div>
          <AddStepMenu channelType={channel?.type} onAdd={handleAdd}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-white/10 bg-white/5 px-2.5 text-xs hover:bg-white/10"
            >
              <Plus className="size-3.5" />
              Add step
            </Button>
          </AddStepMenu>
        </CardHeader>
        <CardContent>
          {triggerType === "ig_comment_keyword" &&
            !actions.some((a) => a.type === "send_buttons") && (
              <button
                type="button"
                onClick={applyCommentRecipe}
                className="mb-4 flex w-full items-start gap-2.5 rounded-xl border border-[color:var(--xyra-glow)]/30 bg-[color:var(--xyra-purple)]/10 px-3 py-2.5 text-left transition hover:bg-[color:var(--xyra-purple)]/15"
              >
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--xyra-purple)]/25 text-[color:var(--xyra-glow)]">
                  <MousePointerClick className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white">
                    Use the comment → DM opt-in recipe
                  </span>
                  <span className="mt-0.5 block text-[11px] text-white/55">
                    Replies with an opt-in button (Meta&apos;s recommended flow) plus a
                    “follow first” step, then DMs the link only after they tap. One
                    click — edit the wording after.
                  </span>
                </span>
              </button>
            )}
          {view === "linear" ? (
            <div>
              {/* Trigger anchor — what kicks the flow off. */}
              <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--xyra-glow)]/30 bg-[color:var(--xyra-purple)]/10 px-3 py-2.5">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--xyra-purple)]/25 text-[color:var(--xyra-glow)]">
                  <Zap className="size-4" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-white/40">
                    When this happens
                  </p>
                  <p className="truncate text-sm font-medium text-white">{triggerSummary}</p>
                </div>
              </div>

              {actions.map((a, i) => (
                <div key={i}>
                  <StepConnector />
                  {renderActionRow(a, i)}
                </div>
              ))}

              <StepConnector />
              <AddStepMenu channelType={channel?.type} onAdd={handleAdd}>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-2.5 text-xs font-medium text-white/55 transition hover:border-[color:var(--xyra-glow)]/40 hover:bg-white/[0.04] hover:text-white"
                >
                  <Plus className="size-3.5" />
                  {actions.length === 0 ? "Add your first step" : "Add step"}
                </button>
              </AddStepMenu>
            </div>
          ) : (
            <div className="space-y-3">
              <FlowCanvas
                triggerLabel={flowTriggerLabel}
                actions={actions}
                onSelect={setSelectedIdx}
                selectedActionIndex={selectedIdx}
              />
              {selectedIdx != null && actions[selectedIdx] ? (
                <div>
                  <p className="mb-1.5 text-[11px] text-white/50">
                    Editing step {selectedIdx + 1}
                  </p>
                  {renderActionRow(actions[selectedIdx], selectedIdx)}
                </div>
              ) : (
                <p className="text-xs text-white/50">
                  Click a step in the flow to edit it, or add one above.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={busy}
          onClick={submit}
          className="xyra-gradient text-white border-0 hover:opacity-90"
        >
          <Save className="mr-1.5 size-4" />
          {busy ? "Saving…" : mode === "create" ? "Create automation" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function ActionRow({
  index,
  action,
  members,
  sequences = [],
  allowMessageCondition,
  allowReplyCondition,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  action: Action;
  members: Member[];
  sequences?: Sequence[];
  allowMessageCondition: boolean;
  allowReplyCondition: boolean;
  onChange: (next: Action) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const meta = ACTION_META[action.type];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 transition hover:border-white/20">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span
          className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.badge}`}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-white">{meta.label}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-white/35">
            Step {index + 1}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          {onMoveUp && (
            <StepIconButton onClick={onMoveUp} label="Move up">
              <ChevronUp className="size-3.5" />
            </StepIconButton>
          )}
          {onMoveDown && (
            <StepIconButton onClick={onMoveDown} label="Move down">
              <ChevronDown className="size-3.5" />
            </StepIconButton>
          )}
          <StepIconButton onClick={onRemove} label="Remove" danger>
            <Trash2 className="size-3.5" />
          </StepIconButton>
        </div>
      </div>

      {action.type !== "wait" &&
        action.type !== "wait_for_reply" &&
        action.type !== "condition" &&
        action.type !== "ai_branch" &&
        action.type !== "send_buttons" && (
          <LeafFields
            action={action}
            members={members}
            sequences={sequences}
            onChange={(next) => onChange(next)}
          />
        )}

      {action.type === "send_buttons" && (
        <ButtonsEditor action={action} onChange={onChange} />
      )}

      {action.type === "ai_branch" && (
        <AiBranchEditor action={action} members={members} onChange={onChange} />
      )}

      {action.type === "condition" && (
        <ConditionEditor
          action={action}
          members={members}
          allowMessageCondition={allowMessageCondition}
          allowReplyCondition={allowReplyCondition}
          onChange={onChange}
        />
      )}

      {action.type === "wait" && (() => {
        const { value, unit } = msToWait(action.ms);
        const setWait = (v: number, u: WaitUnit) =>
          onChange({ type: "wait", ms: Math.max(1, Math.floor(v || 1)) * WAIT_UNIT_MS[u] });
        return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={value}
                onChange={(e) => setWait(Number(e.target.value), unit)}
                className="h-8 w-24 text-xs"
              />
              <select
                value={unit}
                onChange={(e) => setWait(value, e.target.value as WaitUnit)}
                className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
              >
                <option value="minutes" className="bg-zinc-900">minutes</option>
                <option value="hours" className="bg-zinc-900">hours</option>
                <option value="days" className="bg-zinc-900">days</option>
              </select>
              <span className="text-[11px] text-white/50">before the next step</span>
            </div>
            <p className="text-[10px] text-white/40">
              Steps after this run later (max 30 days). Processed every minute.
            </p>
          </div>
        );
      })()}

      {action.type === "wait_for_reply" && (() => {
        const { value, unit } = msToWait(action.timeout_ms ?? WAIT_UNIT_MS.days);
        const setTimeout = (v: number, u: WaitUnit) =>
          onChange({
            type: "wait_for_reply",
            timeout_ms: Math.max(1, Math.floor(v || 1)) * WAIT_UNIT_MS[u],
          });
        return (
          <div className="space-y-1.5">
            <p className="text-[11px] text-white/70">
              Pause until the customer replies, then continue. Use an{" "}
              <span className="text-white/90">If / else</span> step next to branch
              on their answer (<code>message contains …</code> or{" "}
              <code>{"{{message_text}}"}</code>).
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-white/50">Timeout after</span>
              <Input
                type="number"
                min={1}
                value={value}
                onChange={(e) => setTimeout(Number(e.target.value), unit)}
                className="h-8 w-20 text-xs"
              />
              <select
                value={unit}
                onChange={(e) => setTimeout(value, e.target.value as WaitUnit)}
                className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
              >
                <option value="minutes" className="bg-zinc-900">minutes</option>
                <option value="hours" className="bg-zinc-900">hours</option>
                <option value="days" className="bg-zinc-900">days</option>
              </select>
            </div>
            <p className="text-[10px] text-white/40">
              No reply by the timeout → the flow continues on the no-reply path.
            </p>
          </div>
        );
      })()}
    </div>
  );
}

// Per-type field editors for a LEAF action — shared by the top-level ActionRow
// and if/else branches.
// Instagram opt-in buttons editor. Each button = a label + the message sent
// when the user TAPS it (modeled as a send_dm in the button's `then`). This is
// the Meta-compliant way to deliver a link: the tap opens the messaging window
// and confirms intent before the link is sent.
function ButtonsEditor({
  action,
  onChange,
}: {
  action: Extract<Action, { type: "send_buttons" }>;
  onChange: (next: Action) => void;
}) {
  // Derive the per-button reply text from its first send_dm leaf (v1 shape).
  const replyTextOf = (b: { then: LeafAction[] }) => {
    const leaf = b.then.find((l) => l.type === "send_dm") as
      | Extract<LeafAction, { type: "send_dm" }>
      | undefined;
    return leaf?.text ?? "";
  };
  const setButtons = (buttons: typeof action.buttons) => onChange({ ...action, buttons });
  const updateButton = (i: number, patch: { title?: string; reply?: string }) => {
    const next = action.buttons.map((b, j) => {
      if (j !== i) return b;
      const title = patch.title ?? b.title;
      const reply = patch.reply ?? replyTextOf(b);
      // Spread keeps the stable id + any gate; override label + reply only.
      return { ...b, title, then: [{ type: "send_dm" as const, text: reply }] };
    });
    setButtons(next);
  };
  // Add / edit / remove a button's optional follow-or-opt-in gate (an extra
  // confirm step shown before the link is delivered).
  const setGate = (
    i: number,
    gate: { text: string; button_title: string } | undefined,
  ) => {
    setButtons(
      action.buttons.map((b, j) => {
        if (j !== i) return b;
        if (gate === undefined) {
          // Drop the gate entirely (no empty {} left behind).
          const rest = { ...b };
          delete (rest as { gate?: unknown }).gate;
          return rest;
        }
        return { ...b, gate };
      }),
    );
  };
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-[11px] text-white/60">Message with the buttons</Label>
        <Textarea
          value={action.text}
          onChange={(e) => onChange({ ...action, text: e.target.value })}
          rows={2}
          placeholder="Tap below and I'll send it over 👇"
          className="mt-1 text-xs"
        />
        <p className="mt-1 text-[10px] text-white/40">
          Variables: <code>{"{{first_name}}"}</code>, <code>{"{{username}}"}</code>. On a comment trigger this is sent as a private reply so it reaches the commenter.
        </p>
      </div>
      <div className="space-y-2">
        {action.buttons.map((b, i) => {
          const gate = b.gate;
          return (
          <div key={i} className="rounded-md border border-white/10 bg-white/[0.03] p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <MousePointerClick className="size-3 shrink-0 text-white/40" />
              <Input
                value={b.title}
                maxLength={20}
                onChange={(e) => updateButton(i, { title: e.target.value })}
                placeholder="Button label (e.g. Send me the link)"
                className="h-7 text-xs"
              />
              {action.buttons.length > 1 && (
                <button
                  type="button"
                  onClick={() => setButtons(action.buttons.filter((_, j) => j !== i))}
                  className="text-white/40 hover:text-red-300"
                  aria-label="Remove button"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
            <Textarea
              value={replyTextOf(b)}
              onChange={(e) => updateButton(i, { reply: e.target.value })}
              rows={2}
              placeholder="Message sent when they tap — e.g. Here's the link: https://…"
              className="text-xs"
            />
            {gate ? (
              <div className="space-y-1.5 rounded-md border border-[color:var(--xyra-purple)]/25 bg-[color:var(--xyra-purple)]/[0.06] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium text-[color:var(--xyra-glow)]">
                    Follow / opt-in step (shown before the link)
                  </span>
                  <button
                    type="button"
                    onClick={() => setGate(i, undefined)}
                    className="text-white/40 hover:text-red-300"
                    aria-label="Remove follow step"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                <Textarea
                  value={gate.text}
                  onChange={(e) => setGate(i, { text: e.target.value, button_title: gate.button_title })}
                  rows={2}
                  placeholder="Follow @yourbrand first, then tap below to get the link 🙌"
                  className="text-xs"
                />
                <Input
                  value={gate.button_title}
                  maxLength={20}
                  onChange={(e) => setGate(i, { text: gate.text, button_title: e.target.value })}
                  placeholder="Confirm button (e.g. I followed!)"
                  className="h-7 text-xs"
                />
                <p className="text-[10px] text-white/40">
                  We can&apos;t verify a real follow — this is a trust prompt. The
                  message above is sent first; the link only goes out after they
                  tap this confirm button.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setGate(i, {
                    text: "Follow us first, then tap below to get the link 🙌",
                    button_title: "I followed!",
                  })
                }
                className="flex items-center gap-1.5 text-[11px] text-[color:var(--xyra-glow)] hover:underline"
              >
                <Plus className="size-3" /> Add a follow / opt-in step
              </button>
            )}
          </div>
          );
        })}
        {action.buttons.length < 3 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setButtons([
                ...action.buttons,
                { id: crypto.randomUUID(), title: "", then: [{ type: "send_dm", text: "" }] },
              ])
            }
            className="h-7 gap-1.5 border-white/10 bg-white/5 px-2 text-[11px] hover:bg-white/10"
          >
            <Plus className="size-3" /> Add button
          </Button>
        )}
      </div>
      <p className="text-[10px] text-white/40">
        Up to 3 buttons. The link is only sent after the user taps — Meta&apos;s
        recommended opt-in flow (and it opens the messaging window). This step
        ends the flow: put any follow-ups inside a button, not as later steps.
      </p>
    </div>
  );
}

// AI intent-split editor: optional business context + a list of intents (label
// + description + a leaf-action branch each) + a fallback branch. The classifier
// runs server-side in the executor; this is purely the authoring surface.
const MAX_AI_INTENTS_UI = 8;

function AiBranchEditor({
  action,
  members,
  onChange,
}: {
  action: Extract<Action, { type: "ai_branch" }>;
  members: Member[];
  onChange: (next: Action) => void;
}) {
  const setIntents = (intents: typeof action.intents) => onChange({ ...action, intents });
  const updateIntent = (
    i: number,
    patch: Partial<{ label: string; description: string; then: LeafAction[] }>,
  ) => setIntents(action.intents.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  // Live "try a message → see which branch it picks" preview. Classifies the
  // CURRENT (unsaved) intents server-side so descriptions can be tuned before
  // going live. Result is the matched intent label, or null for the fallback.
  const [testMsg, setTestMsg] = useState("");
  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<{ label: string | null } | null>(null);
  const runTest = () => {
    const msg = testMsg.trim();
    if (!msg) return;
    startTest(async () => {
      const res = await testAiBranch({
        instruction: action.instruction,
        intents: action.intents.map((it) => ({
          id: it.id,
          label: it.label,
          description: it.description,
        })),
        message: msg,
      });
      if (!res.ok) {
        toast.error(res.error);
        setTestResult(null);
        return;
      }
      setTestResult({ label: res.data?.matchedLabel ?? null });
    });
  };

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] leading-snug text-white/55">
        The AI reads the customer&apos;s message and runs the branch whose intent
        best matches — it branches on meaning, not exact keywords. Uses a little
        AI credit per message; if none match (or AI is unavailable) it runs the
        fallback at the bottom.
      </p>
      <div>
        <Label className="text-[11px] text-white/60">Business context (optional)</Label>
        <Textarea
          value={action.instruction ?? ""}
          onChange={(e) => onChange({ ...action, instruction: e.target.value })}
          rows={2}
          placeholder="e.g. We're a dental clinic — customers ask about booking, prices, or emergencies."
          className="mt-1 text-xs"
        />
      </div>
      {action.intents.map((it, i) => (
        <div
          key={it.id || i}
          className="space-y-2 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.03] p-2.5"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-[10px] font-medium text-cyan-300">
              {i + 1}
            </span>
            <Input
              value={it.label}
              onChange={(e) => updateIntent(i, { label: e.target.value })}
              placeholder="Intent name (e.g. Sales question)"
              className="h-8 text-xs"
            />
            {action.intents.length > 1 && (
              <button
                type="button"
                onClick={() => setIntents(action.intents.filter((_, j) => j !== i))}
                className="shrink-0 text-white/40 hover:text-red-300"
                aria-label="Remove intent"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
          <Input
            value={it.description ?? ""}
            onChange={(e) => updateIntent(i, { description: e.target.value })}
            placeholder="Describe it so the AI matches well (optional) — e.g. pricing, quotes, discounts"
            className="h-8 text-xs"
          />
          <BranchList
            label="Then run"
            actions={it.then}
            members={members}
            onChange={(next) => updateIntent(i, { then: next })}
          />
        </div>
      ))}
      {action.intents.length < MAX_AI_INTENTS_UI && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setIntents([
              ...action.intents,
              { id: crypto.randomUUID(), label: "", description: "", then: [] },
            ])
          }
          className="h-7 gap-1.5 border-white/10 bg-white/5 px-2 text-[11px] hover:bg-white/10"
        >
          <Plus className="size-3" /> Add intent
        </Button>
      )}
      <BranchList
        label="If none match"
        actions={action.else}
        members={members}
        onChange={(next) => onChange({ ...action, else: next })}
      />

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
        <Label className="text-[11px] text-white/60">Test it</Label>
        <p className="mt-0.5 text-[10px] text-white/40">
          Type a sample customer message and see which branch the AI picks. Tests
          your current intents (no need to save). Uses a little AI credit.
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runTest();
              }
            }}
            placeholder="e.g. how much does it cost?"
            className="h-8 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={testing || !testMsg.trim()}
            onClick={runTest}
            className="h-8 shrink-0 border-white/10 bg-white/5 px-3 text-xs hover:bg-white/10"
          >
            {testing ? "Testing…" : "Test"}
          </Button>
        </div>
        {testResult && (
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span className="text-white/50">Routed to:</span>
            {testResult.label ? (
              <span className="rounded-md bg-cyan-400/15 px-1.5 py-0.5 font-medium text-cyan-300">
                {testResult.label}
              </span>
            ) : (
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-medium text-white/70">
                If none match (fallback)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LeafFields({
  action,
  members,
  sequences = [],
  onChange,
}: {
  action: LeafAction;
  members: Member[];
  sequences?: Sequence[];
  onChange: (next: LeafAction) => void;
}) {
  return (
    <>
      {action.type === "send_dm" && (
        <>
          <Textarea
            value={action.text}
            onChange={(e) => onChange({ ...action, text: e.target.value })}
            rows={3}
            placeholder="Hi {{first_name}}, thanks for messaging us!"
            className="text-xs"
          />
          <p className="mt-1 text-[10px] text-white/40">
            Variables: <code>{"{{contact_name}}"}</code>, <code>{"{{first_name}}"}</code>, <code>{"{{contact_phone}}"}</code>, <code>{"{{contact_email}}"}</code>, <code>{"{{username}}"}</code>, <code>{"{{message_text}}"}</code>
          </p>
        </>
      )}

      {action.type === "tag_contact" && (
        <Input
          value={action.tag}
          onChange={(e) => onChange({ ...action, tag: e.target.value })}
          placeholder="e.g. lead, qualified, vip"
          className="text-xs"
        />
      )}

      {action.type === "assign_agent" && (
        <select
          value={action.agent_id ?? ""}
          onChange={(e) => onChange({ ...action, agent_id: e.target.value || null })}
          className="h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
        >
          <option value="" className="bg-zinc-900">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id} className="bg-zinc-900">
              {m.name}
            </option>
          ))}
        </select>
      )}

      {action.type === "assign_smart" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {(["round_robin", "least_busy"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...action, strategy: s })}
                className={`rounded-md border p-2 text-left text-[11px] ${
                  action.strategy === s
                    ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/10 text-white"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                <div className="font-medium text-white">
                  {s === "round_robin" ? "Round-robin" : "Least busy"}
                </div>
                <div className="mt-0.5 text-white/60">
                  {s === "round_robin"
                    ? "Rotate evenly through agents."
                    : "Pick the agent with fewest open chats."}
                </div>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-white/70">
            <input
              type="checkbox"
              checked={action.only_online ?? false}
              onChange={(e) => onChange({ ...action, only_online: e.target.checked })}
              className="accent-[color:var(--xyra-purple)]"
            />
            Only consider agents marked online (falls back to all when nobody is online)
          </label>
        </div>
      )}

      {action.type === "webhook" && (
        <div className="space-y-1.5">
          <Input
            value={action.url}
            onChange={(e) => onChange({ ...action, url: e.target.value })}
            placeholder="https://your-endpoint.com/hook"
            className="text-xs"
          />
          <Input
            value={action.secret ?? ""}
            onChange={(e) => onChange({ ...action, secret: e.target.value })}
            placeholder="Optional bearer secret"
            className="text-xs"
          />
        </div>
      )}

      {action.type === "add_to_sequence" && (
        <div className="space-y-1.5">
          {sequences.length === 0 ? (
            <p className="text-[11px] text-amber-200/80">
              No sequences yet —{" "}
              <Link href="/automations/sequences" className="underline">
                create one
              </Link>{" "}
              first, then pick it here.
            </p>
          ) : (
            <select
              value={action.sequence_id}
              onChange={(e) => onChange({ ...action, sequence_id: e.target.value })}
              className="h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
            >
              <option value="" className="bg-zinc-900">
                Select a sequence…
              </option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id} className="bg-zinc-900">
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </>
  );
}

// Compact editor for one if/else branch's leaf-action list.
function BranchList({
  label,
  actions,
  members,
  onChange,
}: {
  label: string;
  actions: LeafAction[];
  members: Member[];
  onChange: (next: LeafAction[]) => void;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-white/80">{label}</span>
        <div className="flex flex-wrap gap-1">
          {BRANCH_ACTION_OPTIONS.map((o) => (
            <button
              key={o.type}
              type="button"
              onClick={() => onChange([...actions, freshLeaf(o.type, members)])}
              className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
            >
              + {o.label}
            </button>
          ))}
        </div>
      </div>
      {actions.length === 0 ? (
        <p className="text-[10px] text-white/40">No actions — nothing happens on this branch.</p>
      ) : (
        <div className="space-y-1.5">
          {actions.map((a, j) => (
            <div key={j} className="rounded border border-white/10 bg-white/[0.03] p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-medium capitalize text-white/70">
                  {a.type.replace("_", " ")}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(actions.filter((_, k) => k !== j))}
                  className="text-white/40 hover:text-red-300"
                  aria-label="Remove"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <LeafFields
                action={a}
                members={members}
                onChange={(na) => {
                  const arr = [...actions];
                  arr[j] = na;
                  onChange(arr);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// If/else editor: conditions (match all/any) + a Then + Otherwise branch.
function ConditionEditor({
  action,
  members,
  allowMessageCondition,
  allowReplyCondition,
  onChange,
}: {
  action: Extract<Action, { type: "condition" }>;
  members: Member[];
  allowMessageCondition: boolean;
  allowReplyCondition: boolean;
  onChange: (next: Action) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-white/70">
        <span>Match</span>
        <select
          value={action.match}
          onChange={(e) => onChange({ ...action, match: e.target.value as "all" | "any" })}
          className="h-7 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] text-white"
        >
          <option value="all" className="bg-zinc-900">all</option>
          <option value="any" className="bg-zinc-900">any</option>
        </select>
        <span>of these conditions:</span>
      </div>

      {action.conditions.map((c, ci) => (
        <ConditionRow
          key={ci}
          condition={c}
          allowMessageCondition={allowMessageCondition}
          allowReplyCondition={allowReplyCondition}
          onChange={(nc) => {
            const arr = [...action.conditions];
            arr[ci] = nc;
            onChange({ ...action, conditions: arr });
          }}
          onRemove={() =>
            onChange({ ...action, conditions: action.conditions.filter((_, k) => k !== ci) })
          }
        />
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...action,
            conditions: [...action.conditions, { field: "tag", op: "has", value: "" }],
          })
        }
        className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
      >
        + condition
      </button>

      <BranchList
        label="Then"
        actions={action.then}
        members={members}
        onChange={(t) => onChange({ ...action, then: t })}
      />
      <BranchList
        label="Otherwise"
        actions={action.else}
        members={members}
        onChange={(e) => onChange({ ...action, else: e })}
      />
    </div>
  );
}

function ConditionRow({
  condition,
  allowMessageCondition,
  allowReplyCondition,
  onChange,
  onRemove,
}: {
  condition: AutomationCondition;
  allowMessageCondition: boolean;
  allowReplyCondition: boolean;
  onChange: (next: AutomationCondition) => void;
  onRemove: () => void;
}) {
  // Ops available per field.
  const ops =
    condition.field === "tag"
      ? ([
          { v: "has", label: "has tag" },
          { v: "not_has", label: "doesn't have tag" },
        ] as const)
      : condition.field === "reply"
        ? ([
            { v: "received", label: "customer replied" },
            { v: "timed_out", label: "no reply (timed out)" },
          ] as const)
        : ([
            { v: "contains", label: "message contains" },
            { v: "not_contains", label: "message doesn't contain" },
          ] as const);
  // Only offer Message on triggers that carry text (or a wait_for_reply flow);
  // only offer Reply when a wait_for_reply precedes it. Keep an existing
  // selection visible either way.
  const showMessage = allowMessageCondition || condition.field === "message";
  const showReply = allowReplyCondition || condition.field === "reply";
  const showValue = condition.field !== "reply"; // reply ops carry no value
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={condition.field}
        onChange={(e) => {
          const field = e.target.value as AutomationCondition["field"];
          // Reset op to the first valid one for the new field.
          onChange(
            field === "tag"
              ? { field: "tag", op: "has", value: condition.value ?? "" }
              : field === "reply"
                ? { field: "reply", op: "received" }
                : { field: "message", op: "contains", value: condition.value ?? "" },
          );
        }}
        className="h-7 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] text-white"
      >
        <option value="tag" className="bg-zinc-900">Tag</option>
        {showMessage && (
          <option value="message" className="bg-zinc-900">Message</option>
        )}
        {showReply && (
          <option value="reply" className="bg-zinc-900">Reply</option>
        )}
      </select>
      <select
        value={condition.op}
        onChange={(e) =>
          onChange({ ...condition, op: e.target.value } as AutomationCondition)
        }
        className="h-7 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] text-white"
      >
        {ops.map((o) => (
          <option key={o.v} value={o.v} className="bg-zinc-900">
            {o.label}
          </option>
        ))}
      </select>
      {showValue && (
        <Input
          value={condition.value ?? ""}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder={condition.field === "tag" ? "vip" : "price"}
          className="h-7 flex-1 text-[11px]"
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="text-white/40 hover:text-red-300"
        aria-label="Remove condition"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}
