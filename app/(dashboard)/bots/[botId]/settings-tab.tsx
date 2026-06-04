"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { deleteBot, updateBot } from "@/lib/bots/actions";

type BotRow = {
  id: string;
  name: string;
  instructions: string | null;
  objective: string;
  tone: string;
  personality: { emoji_usage?: string; response_length?: string; signature?: string };
  greeting_message: string | null;
  off_hours_message: string | null;
  business_hours: { active?: boolean; timezone?: string };
  knowledge_threshold: number;
  language: string;
  behavior_rules: { never_say?: string[]; always_do?: string[]; handoff_message?: string };
  handoff_triggers: string[] | null;
  tools_config?: Record<string, { enabled?: boolean }> | null;
  active: boolean;
};

const TOOL_OPTIONS: Array<{ key: string; label: string; blurb: string }> = [
  {
    key: "capture_lead",
    label: "Capture leads",
    blurb: "Save a customer's name / email / phone to their profile as they share it.",
  },
  {
    key: "tag_contact",
    label: "Tag contacts",
    blurb: "Let the bot label customers (e.g. pricing, vip) for routing & segments.",
  },
  {
    key: "request_human_handoff",
    label: "Request human handoff",
    blurb: "Escalate to a teammate via a tool instead of a keyword — cleaner + more reliable.",
  },
  {
    key: "search_knowledge",
    label: "Search knowledge (agentic)",
    blurb: "Let the bot decide when to search its knowledge base mid-conversation.",
  },
];

export function SettingsTab({ bot }: { bot: BotRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState(bot.active);
  const [name, setName] = useState(bot.name);
  const [instructions, setInstructions] = useState(bot.instructions ?? "");
  const [greeting, setGreeting] = useState(bot.greeting_message ?? "");
  const [tone, setTone] = useState(bot.tone);
  const [language, setLanguage] = useState(bot.language);
  const [emoji, setEmoji] = useState((bot.personality?.emoji_usage as string) ?? "subtle");
  const [length, setLength] = useState((bot.personality?.response_length as string) ?? "balanced");
  const [signature, setSignature] = useState((bot.personality?.signature as string) ?? "");
  const [threshold, setThreshold] = useState(bot.knowledge_threshold);
  const [neverSay, setNeverSay] = useState((bot.behavior_rules?.never_say ?? []).join("\n"));
  const [alwaysDo, setAlwaysDo] = useState((bot.behavior_rules?.always_do ?? []).join("\n"));
  const [handoffMessage, setHandoffMessage] = useState(
    (bot.behavior_rules?.handoff_message as string) ?? "",
  );
  const [triggers, setTriggers] = useState((bot.handoff_triggers ?? []).join(", "));
  const [hoursActive, setHoursActive] = useState(Boolean(bot.business_hours?.active));
  const [offHours, setOffHours] = useState(bot.off_hours_message ?? "");
  const [toolsOn, setToolsOn] = useState<Record<string, boolean>>(() => {
    const cfg = bot.tools_config ?? {};
    return Object.fromEntries(
      TOOL_OPTIONS.map((t) => [t.key, Boolean(cfg[t.key]?.enabled)]),
    );
  });

  function onSave() {
    startTransition(async () => {
      const r = await updateBot(bot.id, {
        name: name.trim(),
        instructions: instructions.trim() || null,
        greeting_message: greeting.trim() || null,
        tone,
        language,
        personality: {
          emoji_usage: emoji,
          response_length: length,
          signature: signature.trim() || undefined,
        },
        knowledge_threshold: threshold,
        behavior_rules: {
          never_say: neverSay.split("\n").map((s) => s.trim()).filter(Boolean),
          always_do: alwaysDo.split("\n").map((s) => s.trim()).filter(Boolean),
          handoff_message: handoffMessage.trim() || undefined,
        },
        handoff_triggers: triggers
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        business_hours: {
          ...(bot.business_hours ?? {}),
          active: hoursActive,
        },
        off_hours_message: offHours.trim() || null,
        tools_config: Object.fromEntries(
          TOOL_OPTIONS.map((t) => [t.key, { enabled: !!toolsOn[t.key] }]),
        ),
        active,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${bot.name}"? This stops it from responding immediately and removes all knowledge sources.`)) return;
    startTransition(async () => {
      const r = await deleteBot(bot.id);
      // deleteBot redirects on success
      if (r && !r.ok) toast.error(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
          <CardDescription>
            Pause the bot to stop it from replying without losing config or knowledge.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <Label htmlFor="active-toggle" className="text-sm">
            Bot is {active ? "active" : "paused"}
          </Label>
          <Switch
            id="active-toggle"
            checked={active}
            onCheckedChange={setActive}
            disabled={pending}
          />
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bot-name">Name</Label>
            <Input id="bot-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="greeting">Greeting (first message to a new contact)</Label>
            <Textarea
              id="greeting"
              rows={2}
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Voice & strictness</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tone">Tone</Label>
            <select
              id="tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white"
            >
              {["friendly", "professional", "formal", "casual", "playful"].map((t) => (
                <option key={t} value={t} className="bg-card">{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="language">Language</Label>
            <Input
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="ISO code (e.g. en)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emoji">Emoji usage</Label>
            <select
              id="emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white"
            >
              <option value="none" className="bg-card">none</option>
              <option value="subtle" className="bg-card">subtle</option>
              <option value="frequent" className="bg-card">frequent</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="length">Response length</Label>
            <select
              id="length"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white"
            >
              <option value="short" className="bg-card">short</option>
              <option value="balanced" className="bg-card">balanced</option>
              <option value="detailed" className="bg-card">detailed</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signature">Signature (optional)</Label>
            <Input
              id="signature"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="— Xyra Bot"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="threshold-edit">
              Knowledge strictness ({threshold.toFixed(2)})
            </Label>
            <input
              id="threshold-edit"
              type="range"
              min={0.5}
              max={0.9}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-[color:var(--xyra-glow)]"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Behavior rules</CardTitle>
          <CardDescription>One rule per line.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="never-say">Never say</Label>
            <Textarea
              id="never-say"
              rows={3}
              value={neverSay}
              onChange={(e) => setNeverSay(e.target.value)}
              placeholder={"competitor names\nprice promises\nguarantees we can't keep"}
              className="resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="always-do">Always do</Label>
            <Textarea
              id="always-do"
              rows={3}
              value={alwaysDo}
              onChange={(e) => setAlwaysDo(e.target.value)}
              placeholder={"End with: Is there anything else I can help you with?"}
              className="resize-y"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Actions (tools)</CardTitle>
          <CardDescription>
            Let the bot DO things mid-conversation, not just chat. Each runs
            scoped to this workspace only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {TOOL_OPTIONS.map((t) => (
            <div
              key={t.key}
              className="flex items-start justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5"
            >
              <div className="min-w-0">
                <Label htmlFor={`tool-${t.key}`} className="text-sm text-white">
                  {t.label}
                </Label>
                <p className="mt-0.5 text-[11px] text-white/55">{t.blurb}</p>
              </div>
              <Switch
                id={`tool-${t.key}`}
                checked={!!toolsOn[t.key]}
                onCheckedChange={(v) =>
                  setToolsOn((prev) => ({ ...prev, [t.key]: v }))
                }
                disabled={pending}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Handoff</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="triggers">Trigger keywords (comma-separated)</Label>
            <Input
              id="triggers"
              value={triggers}
              onChange={(e) => setTriggers(e.target.value)}
              placeholder="speak to human, agent, complaint, urgent"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="handoff-message">Handoff message</Label>
            <Textarea
              id="handoff-message"
              rows={2}
              value={handoffMessage}
              onChange={(e) => setHandoffMessage(e.target.value)}
              placeholder="Let me get a teammate to help — one moment."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Business hours</CardTitle>
          <CardDescription>
            Limit when the bot replies. Per-day windows can be edited via SQL
            for now — UI editor lands in a follow-up. The active toggle works.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="hours-active" className="text-sm">
              Respect business hours
            </Label>
            <Switch
              id="hours-active"
              checked={hoursActive}
              onCheckedChange={setHoursActive}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="off-hours">Off-hours message</Label>
            <Textarea
              id="off-hours"
              rows={2}
              value={offHours}
              onChange={(e) => setOffHours(e.target.value)}
              placeholder="We're closed right now — we'll get back to you tomorrow."
            />
            <p className="text-[11px] text-white/50">
              Leave blank to stay silent outside business hours.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
        <Button
          variant="ghost"
          onClick={onDelete}
          disabled={pending}
          className="text-rose-300 hover:bg-rose-500/10"
        >
          <Trash2 className="mr-1.5 size-3.5" />
          Delete bot
        </Button>
        <Button
          onClick={onSave}
          disabled={pending}
          className="xyra-gradient text-white border-0 hover:opacity-90"
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
