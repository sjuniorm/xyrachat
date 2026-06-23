"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Headphones,
  Megaphone,
  MousePointerClick,
  ShoppingCart,
  CalendarCheck,
  Filter,
  Sparkles,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createBot } from "@/lib/bots/actions";

const OBJECTIVES = [
  {
    id: "support",
    title: "Customer Support",
    blurb: "Answer questions, resolve issues, escalate when stuck.",
    icon: Headphones,
    defaults: {
      instructions:
        "You're a customer support assistant. Be helpful, accurate, and concise. If you can't resolve a question, hand off to a human teammate.",
      // Empty by default: a separate canned greeting + the AI reply reads as a
      // robotic two-message burst. Left blank, the bot greets AND answers in one
      // natural reply. Operators can still set a verbatim greeting if they want.
      greeting: "",
      triggers: ["speak to human", "agent", "complaint", "urgent", "refund"],
    },
  },
  {
    id: "lead_generation",
    title: "Lead Generation",
    blurb: "Collect contact info from interested visitors.",
    icon: Megaphone,
    defaults: {
      instructions:
        "You're the friendly first contact for our team. Understand what the visitor needs and naturally collect their contact details across the conversation.",
      greeting: "",
      triggers: ["speak to human", "sales", "pricing"],
    },
  },
  {
    id: "website_traffic",
    title: "Website Traffic",
    blurb: "Guide users to specific pages on your site.",
    icon: MousePointerClick,
    defaults: {
      instructions:
        "Help visitors find the right page on our site. Only share links when they genuinely help answer the question.",
      greeting: "",
      triggers: ["speak to human"],
    },
  },
  {
    id: "sales",
    title: "Sales",
    blurb: "Recommend products and drive toward checkout.",
    icon: ShoppingCart,
    defaults: {
      instructions:
        "You're a friendly sales assistant. Understand what the customer needs, recommend fitting products, and guide them to checkout. Never invent prices or stock — defer to the catalog or hand off.",
      greeting: "",
      triggers: ["speak to human", "complaint", "refund"],
    },
  },
  {
    id: "booking",
    title: "Booking",
    blurb: "Qualify intent, then book the meeting in chat (or share a link).",
    icon: CalendarCheck,
    defaults: {
      instructions:
        "Help visitors book a meeting. Qualify briefly, then — if a calendar is connected — offer real open times and book the meeting directly in the chat. Otherwise share the booking link.",
      greeting: "",
      triggers: ["speak to human"],
    },
  },
  {
    id: "qualification",
    title: "Lead Qualification",
    blurb: "Ask predefined questions, score, hand off if hot.",
    icon: Filter,
    defaults: {
      instructions:
        "Run new leads through our qualification questions in order. Score the answers. Hand off to sales when the score is high.",
      greeting: "",
      triggers: ["speak to human", "sales"],
    },
  },
  {
    id: "custom",
    title: "Custom",
    blurb: "Write your own goal in plain language.",
    icon: Sparkles,
    defaults: {
      instructions: "",
      greeting: "",
      triggers: ["speak to human"],
    },
  },
] as const;

const TONES = [
  { id: "friendly", label: "Friendly", example: "Hey! Happy to help 👋" },
  { id: "professional", label: "Professional", example: "Hello — I'd be glad to assist you." },
  { id: "formal", label: "Formal", example: "Good day. How may I be of assistance?" },
  { id: "casual", label: "Casual", example: "hey, what's up? 🙂" },
  { id: "playful", label: "Playful", example: "Ohhh good question! Let me dig in…" },
] as const;

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "ca", label: "Catalan" },
] as const;

type ObjectiveId = (typeof OBJECTIVES)[number]["id"];
type ToneId = (typeof TONES)[number]["id"];

export function NewBotWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();

  const [objective, setObjective] = useState<ObjectiveId>("support");
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState<string>(
    OBJECTIVES[0].defaults.instructions,
  );
  const [greeting, setGreeting] = useState<string>(OBJECTIVES[0].defaults.greeting);
  const [triggers, setTriggers] = useState<string[]>([...OBJECTIVES[0].defaults.triggers]);
  const [tone, setTone] = useState<ToneId>("friendly");
  const [language, setLanguage] = useState("en");
  const [emojiUsage, setEmojiUsage] = useState<"none" | "subtle" | "frequent">("subtle");
  const [responseLength, setResponseLength] = useState<"short" | "balanced" | "detailed">("balanced");
  const [knowledgeThreshold, setKnowledgeThreshold] = useState(0.7);

  function pickObjective(id: ObjectiveId) {
    const o = OBJECTIVES.find((x) => x.id === id);
    if (!o) return;
    setObjective(id);
    // Auto-apply defaults ONLY if the user hasn't typed anything yet.
    // Keeps their work safe if they're hopping between cards.
    if (!instructions.trim()) setInstructions(o.defaults.instructions);
    if (!greeting.trim()) setGreeting(o.defaults.greeting);
    if (triggers.length === 0) setTriggers([...o.defaults.triggers]);
  }

  function onCreate() {
    if (!name.trim()) {
      toast.error("Give your bot a name.");
      return;
    }
    startTransition(async () => {
      const r = await createBot({
        name: name.trim(),
        objective,
        instructions: instructions.trim() || null,
        greeting_message: greeting.trim() || null,
        tone,
        language,
        personality: {
          emoji_usage: emojiUsage,
          response_length: responseLength,
        },
        knowledge_threshold: knowledgeThreshold,
        handoff_triggers: triggers,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Bot created.");
      router.push(`/bots/${r.data!.botId}`);
    });
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 1 ? (
        <Step1
          objective={objective}
          onPickObjective={pickObjective}
          name={name}
          setName={setName}
          onNext={() => setStep(2)}
        />
      ) : (
        <Step2
          instructions={instructions}
          setInstructions={setInstructions}
          greeting={greeting}
          setGreeting={setGreeting}
          tone={tone}
          setTone={setTone}
          language={language}
          setLanguage={setLanguage}
          emojiUsage={emojiUsage}
          setEmojiUsage={setEmojiUsage}
          responseLength={responseLength}
          setResponseLength={setResponseLength}
          knowledgeThreshold={knowledgeThreshold}
          setKnowledgeThreshold={setKnowledgeThreshold}
          triggers={triggers}
          setTriggers={setTriggers}
          pending={pending}
          onBack={() => setStep(1)}
          onSubmit={onCreate}
        />
      )}
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 text-xs">
      <StepDot n={1} active={step >= 1} label="Goal & name" />
      <span className="h-px w-8 bg-white/15" />
      <StepDot n={2} active={step >= 2} label="Voice & rules" />
    </ol>
  );
}

function StepDot({ n, active, label }: { n: number; active: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold",
          active
            ? "xyra-gradient text-white"
            : "bg-white/10 text-white/40",
        )}
      >
        {n}
      </span>
      <span className={cn(active ? "text-white" : "text-white/40")}>{label}</span>
    </li>
  );
}

function Step1({
  objective,
  onPickObjective,
  name,
  setName,
  onNext,
}: {
  objective: ObjectiveId;
  onPickObjective: (id: ObjectiveId) => void;
  name: string;
  setName: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <Card className="border-white/10 bg-card/60">
      <CardContent className="space-y-6 py-6">
        <div>
          <Label className="text-sm">What's this bot for?</Label>
          <p className="mt-0.5 text-xs text-white/50">
            Pick the closest goal — we&apos;ll seed defaults you can tweak.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {OBJECTIVES.map((o) => {
              const Icon = o.icon;
              const active = objective === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onPickObjective(o.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition",
                    active
                      ? "border-[color:var(--xyra-glow)]/50 bg-[color:var(--xyra-glow)]/10"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-8 shrink-0 items-center justify-center rounded-md",
                      active ? "xyra-gradient" : "bg-white/10",
                    )}
                  >
                    <Icon className="size-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{o.title}</p>
                    <p className="mt-0.5 text-xs text-white/60">{o.blurb}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bot-name">Bot name</Label>
          <Input
            id="bot-name"
            placeholder="e.g. Xyra Support"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <p className="text-[11px] text-white/50">
            What you&apos;ll call it internally. Customers won&apos;t see this name unless you mention it in the bot&apos;s instructions.
          </p>
        </div>

        <div className="flex justify-end border-t border-white/5 pt-4">
          <Button
            onClick={onNext}
            disabled={!name.trim()}
            className="xyra-gradient text-white border-0 hover:opacity-90"
          >
            Continue
            <ChevronRight className="ml-1 size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Step2(props: {
  instructions: string;
  setInstructions: (v: string) => void;
  greeting: string;
  setGreeting: (v: string) => void;
  tone: ToneId;
  setTone: (v: ToneId) => void;
  language: string;
  setLanguage: (v: string) => void;
  emojiUsage: "none" | "subtle" | "frequent";
  setEmojiUsage: (v: "none" | "subtle" | "frequent") => void;
  responseLength: "short" | "balanced" | "detailed";
  setResponseLength: (v: "short" | "balanced" | "detailed") => void;
  knowledgeThreshold: number;
  setKnowledgeThreshold: (v: number) => void;
  triggers: string[];
  setTriggers: (v: string[]) => void;
  pending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const {
    instructions, setInstructions, greeting, setGreeting,
    tone, setTone, language, setLanguage,
    emojiUsage, setEmojiUsage, responseLength, setResponseLength,
    knowledgeThreshold, setKnowledgeThreshold, triggers, setTriggers,
    pending, onBack, onSubmit,
  } = props;
  const [newTrigger, setNewTrigger] = useState("");

  return (
    <Card className="border-white/10 bg-card/60">
      <CardContent className="space-y-6 py-6">
        <div className="space-y-1.5">
          <Label htmlFor="instructions">Instructions</Label>
          <Textarea
            id="instructions"
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Describe what this bot should do, in your own words."
            className="resize-y"
          />
          <p className="text-[11px] text-white/50">
            These get prepended to the system prompt on every call. Be specific about what to do AND what not to do.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="greeting">Greeting (optional)</Label>
          <Textarea
            id="greeting"
            rows={2}
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Leave blank (recommended) and the bot greets naturally inside its first reply. Set a value only if you want an exact greeting sent as a separate message."
          />
          <p className="text-xs text-muted-foreground">
            Recommended: leave blank so the bot greets and answers in one natural
            message instead of sending a canned line first.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Tone</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTone(t.id)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left text-sm transition",
                  tone === t.id
                    ? "border-[color:var(--xyra-glow)]/50 bg-[color:var(--xyra-glow)]/10"
                    : "border-white/10 bg-white/5 hover:border-white/20",
                )}
              >
                <p className="font-medium text-white">{t.label}</p>
                <p className="mt-0.5 text-xs text-white/60">&ldquo;{t.example}&rdquo;</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="language">Language</Label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-card">
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emoji">Emoji usage</Label>
            <select
              id="emoji"
              value={emojiUsage}
              onChange={(e) => setEmojiUsage(e.target.value as typeof emojiUsage)}
              className="h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white"
            >
              <option value="none" className="bg-card">None</option>
              <option value="subtle" className="bg-card">Subtle</option>
              <option value="frequent" className="bg-card">Frequent</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="length">Response length</Label>
            <select
              id="length"
              value={responseLength}
              onChange={(e) => setResponseLength(e.target.value as typeof responseLength)}
              className="h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white"
            >
              <option value="short" className="bg-card">Short &amp; punchy</option>
              <option value="balanced" className="bg-card">Balanced</option>
              <option value="detailed" className="bg-card">Detailed</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="threshold">Knowledge strictness</Label>
            <input
              id="threshold"
              type="range"
              min={0.5}
              max={0.9}
              step={0.05}
              value={knowledgeThreshold}
              onChange={(e) => setKnowledgeThreshold(Number(e.target.value))}
              className="w-full accent-[color:var(--xyra-glow)]"
            />
            <p className="text-[11px] text-white/50">
              {knowledgeThreshold <= 0.6
                ? "Chatty — answers most things, more hallucination risk."
                : knowledgeThreshold >= 0.8
                  ? "Strict — only answers when very sure."
                  : "Balanced — default."}
              {" "}({knowledgeThreshold.toFixed(2)})
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Handoff triggers</Label>
          <p className="text-[11px] text-white/50">
            If an incoming message contains any of these phrases, the bot hands off to a human.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {triggers.map((t, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs"
              >
                {t}
                <button
                  type="button"
                  onClick={() => setTriggers(triggers.filter((_, j) => j !== i))}
                  className="text-white/50 hover:text-white"
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="Add a phrase…"
              value={newTrigger}
              onChange={(e) => setNewTrigger(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTrigger.trim()) {
                  e.preventDefault();
                  if (!triggers.includes(newTrigger.trim())) {
                    setTriggers([...triggers, newTrigger.trim()]);
                  }
                  setNewTrigger("");
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const v = newTrigger.trim();
                if (!v) return;
                if (!triggers.includes(v)) setTriggers([...triggers, v]);
                setNewTrigger("");
              }}
              className="border-white/10"
            >
              Add
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={pending}
          >
            <ChevronLeft className="mr-1 size-3.5" />
            Back
          </Button>
          <Button
            onClick={onSubmit}
            disabled={pending}
            className="xyra-gradient text-white border-0 hover:opacity-90"
          >
            {pending ? "Creating…" : "Create bot"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
