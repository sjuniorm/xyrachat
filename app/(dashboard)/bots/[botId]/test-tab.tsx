"use client";

import { useState, useTransition } from "react";
import { Send, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { testBot } from "@/lib/bots/actions";

type TestMessage = {
  direction: "inbound" | "outbound";
  content: string;
  sourcesUsed?: string[];
  similarity?: number;
  handoff?: boolean;
};

export function TestTab({
  botId,
  botName,
  threshold,
}: {
  botId: string;
  botName: string;
  threshold: number;
}) {
  const [thread, setThread] = useState<TestMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [sourcesOpenFor, setSourcesOpenFor] = useState<number | null>(null);

  function send() {
    const text = draft.trim();
    if (!text || pending) return;
    const next: TestMessage[] = [...thread, { direction: "inbound", content: text }];
    setThread(next);
    setDraft("");
    startTransition(async () => {
      const r = await testBot(
        botId,
        thread.map((m) => ({ direction: m.direction, content: m.content })),
        text,
      );
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setThread([
        ...next,
        {
          direction: "outbound",
          content: r.data!.response,
          sourcesUsed: r.data!.sourcesUsed,
          similarity: r.data!.maxSimilarity,
          handoff: r.data!.shouldHandoff,
        },
      ]);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Test {botName}</CardTitle>
              <CardDescription>
                Ephemeral chat — nothing is written to the inbox or analytics. AI tokens DO count against your monthly budget.
              </CardDescription>
            </div>
            {thread.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setThread([])}
                className="text-white/60 hover:text-white"
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Reset
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {thread.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/50">
              Send a message below to see how the bot responds.
            </div>
          ) : (
            <ul className="space-y-3">
              {thread.map((m, i) => {
                const isOutbound = m.direction === "outbound";
                const showSources =
                  isOutbound && m.sourcesUsed && m.sourcesUsed.length > 0;
                const belowThreshold =
                  isOutbound && typeof m.similarity === "number" && m.similarity < threshold;
                return (
                  <li
                    key={i}
                    className={cn("flex", isOutbound ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                        isOutbound
                          ? "xyra-gradient text-white"
                          : "bg-white/5 text-white ring-1 ring-white/10",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      {isOutbound && (
                        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/70">
                          {typeof m.similarity === "number" && (
                            <span
                              className={cn(
                                "rounded-full px-1.5",
                                belowThreshold
                                  ? "bg-rose-500/30 text-rose-100"
                                  : "bg-white/15",
                              )}
                              title={`Max similarity. Threshold: ${threshold}`}
                            >
                              sim {m.similarity.toFixed(2)}
                            </span>
                          )}
                          {m.handoff && (
                            <span className="rounded-full bg-amber-400/30 px-1.5 text-amber-100">
                              handoff
                            </span>
                          )}
                          {showSources && (
                            <button
                              type="button"
                              onClick={() =>
                                setSourcesOpenFor(sourcesOpenFor === i ? null : i)
                              }
                              className="inline-flex items-center gap-0.5 underline hover:text-white"
                            >
                              {m.sourcesUsed!.length} source
                              {m.sourcesUsed!.length === 1 ? "" : "s"}
                              {sourcesOpenFor === i ? (
                                <ChevronUp className="size-3" />
                              ) : (
                                <ChevronDown className="size-3" />
                              )}
                            </button>
                          )}
                        </div>
                      )}
                      {showSources && sourcesOpenFor === i && (
                        <ul className="mt-2 space-y-0.5 border-t border-white/15 pt-1.5 text-[11px] text-white/70">
                          {m.sourcesUsed!.map((s, j) => (
                            <li key={j}>· {s}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
              {pending && (
                <li className="flex justify-start">
                  <div className="rounded-2xl bg-white/5 px-3.5 py-2.5 text-sm text-white/50 ring-1 ring-white/10">
                    <span className="inline-block animate-pulse">…</span>
                  </div>
                </li>
              )}
            </ul>
          )}

          <div className="flex items-end gap-2 border-t border-white/5 pt-3">
            <Textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message the bot…"
              className="resize-none"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button
              onClick={send}
              disabled={!draft.trim() || pending}
              className="xyra-gradient text-white border-0 hover:opacity-90"
            >
              <Send className="mr-1.5 size-3.5" />
              Send
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
