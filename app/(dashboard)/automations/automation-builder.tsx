"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Save, AlertCircle,
  MessageSquare, Tag, UserPlus2, Webhook,
  Camera, AtSign, MessageCircle, Mail, Shuffle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  createAutomation,
  updateAutomation,
} from "@/lib/automations/actions";
import {
  allowedTriggersForChannel,
  type Action,
  type TriggerConfig,
  type TriggerType,
} from "@/lib/automations/types";

type Channel = { id: string; name: string; type: string };
type Member = { id: string; name: string };

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
  { value: "webhook", label: "External webhook", blurb: "Fires when /api/automations/<id>/trigger is hit.", icon: Webhook, needsKeywords: false },
];

const ACTION_OPTIONS: Array<{
  type: Action["type"];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  available: boolean;
}> = [
  { type: "send_dm", label: "Send DM", icon: MessageSquare, available: true },
  { type: "tag_contact", label: "Tag contact", icon: Tag, available: true },
  { type: "assign_agent", label: "Assign to agent", icon: UserPlus2, available: true },
  { type: "assign_smart", label: "Smart routing", icon: Shuffle, available: true },
  { type: "webhook", label: "Webhook (POST)", icon: Webhook, available: true },
];

export function AutomationBuilder({
  mode,
  initial,
  channels,
  members,
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

  const [actions, setActions] = useState<Action[]>(
    initial?.actions ?? [
      { type: "send_dm", text: "Hi {{first_name}}, thanks for reaching out!" },
    ],
  );

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
    return cfg;
  }, [triggerMeta, keywordsInput, matchMode, triggerType, postId]);

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
      case "webhook":
        fresh = { type, url: "" };
        break;
      default:
        return;
    }
    setActions((cur) => [...cur, fresh]);
  }

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
                  className={`rounded-lg border p-3 text-left text-xs transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    active
                      ? "border-[color:var(--xyra-glow)]/60 bg-[color:var(--xyra-glow)]/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium text-white">
                    <Icon className="size-3.5" />
                    {t.label}
                    {disabled && (
                      <Badge variant="outline" className="ml-auto h-4 border-white/20 bg-white/5 px-1 text-[9px] text-white/60">
                        soon
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/60">{t.blurb}</div>
                </button>
              );
            })}
          </div>

          {triggerType === "ig_new_follower" && (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/5 p-2 text-[11px] text-amber-200/80">
              <AlertCircle className="mt-px size-3 shrink-0" />
              Meta's Camera Graph API doesn't push follower events in
              real time. This trigger needs a polling worker which lands
              with the cron infrastructure later.
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

      {/* Actions */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Actions</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {ACTION_OPTIONS.filter((o) => o.available).map((o) => {
              const Icon = o.icon;
              return (
                <Button
                  key={o.type}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addAction(o.type)}
                  className="h-7 gap-1.5 border-white/10 bg-white/5 px-2 text-[11px] hover:bg-white/10"
                >
                  <Icon className="size-3" />
                  {o.label}
                </Button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {actions.length === 0 && (
            <p className="text-xs text-white/50">No actions yet. Add one above.</p>
          )}
          {actions.map((a, i) => (
            <ActionRow
              key={i}
              index={i}
              action={a}
              members={members}
              onChange={(next) => {
                const arr = [...actions];
                arr[i] = next;
                setActions(arr);
              }}
              onRemove={() => setActions((cur) => cur.filter((_, j) => j !== i))}
              onMoveUp={
                i > 0
                  ? () => {
                      const arr = [...actions];
                      const t = arr[i - 1];
                      arr[i - 1] = arr[i];
                      arr[i] = t;
                      setActions(arr);
                    }
                  : undefined
              }
              onMoveDown={
                i < actions.length - 1
                  ? () => {
                      const arr = [...actions];
                      const t = arr[i + 1];
                      arr[i + 1] = arr[i];
                      arr[i] = t;
                      setActions(arr);
                    }
                  : undefined
              }
            />
          ))}
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
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  action: Action;
  members: Member[];
  onChange: (next: Action) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/10 text-[10px] text-white/80">
          {index + 1}
        </span>
        <span className="text-xs font-medium text-white capitalize">
          {action.type.replace("_", " ")}
        </span>
        <div className="ml-auto flex gap-0.5">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              className="text-[10px] text-white/50 hover:text-white"
              aria-label="Move up"
            >
              ↑
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              className="text-[10px] text-white/50 hover:text-white"
              aria-label="Move down"
            >
              ↓
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="ml-1 text-white/40 hover:text-red-300"
            aria-label="Remove"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

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
            Variables: <code>{"{{contact_name}}"}</code>, <code>{"{{first_name}}"}</code>, <code>{"{{contact_phone}}"}</code>, <code>{"{{contact_email}}"}</code>, <code>{"{{username}}"}</code>
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
          onChange={(e) =>
            onChange({ ...action, agent_id: e.target.value || null })
          }
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
              onChange={(e) =>
                onChange({ ...action, only_online: e.target.checked })
              }
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
    </div>
  );
}
