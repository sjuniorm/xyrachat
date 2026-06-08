"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { MessageCircleQuestion, X, Send, Mail, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "bot"; text: string };

// Floating "Help?" widget on every dashboard page. Asks Xyra's own support bot
// via /api/support/chat (dogfooding), with quick email + help-center links.
export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send() {
    const q = input.trim();
    if (!q || pending) return;
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setPending(true);
    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, history }),
      });
      const data = (await res.json().catch(() => null)) as { reply?: string } | null;
      setMsgs((m) => [
        ...m,
        {
          role: "bot",
          text:
            data?.reply ??
            "Something went wrong — email support@xyrachat.com and we'll help.",
        },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "bot", text: "Network error — email support@xyrachat.com." },
      ]);
    } finally {
      setPending(false);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--xyra-sidebar)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Help</p>
              <p className="text-[11px] text-white/50">Ask Xyra Helper, or reach our team</p>
            </div>
            <button
              type="button"
              aria-label="Close help"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-white/50 hover:bg-white/5 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {msgs.length === 0 && (
              <p className="px-1 py-2 text-xs leading-relaxed text-white/50">
                Hi! Ask me anything about Xyra Chat — connecting channels, bots,
                billing… For complex issues I&apos;ll point you to our team.
              </p>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-auto bg-[color:var(--xyra-purple)] text-white"
                    : "bg-white/5 text-white/85",
                )}
              >
                {m.text}
              </div>
            ))}
            {pending && (
              <div className="max-w-[85%] rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/40">
                …
              </div>
            )}
          </div>

          <div className="border-t border-white/10 p-2">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Ask a question…"
                className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-[color:var(--xyra-glow)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!input.trim() || pending}
                aria-label="Send"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg xyra-gradient text-white disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3 px-1 text-[11px] text-white/45">
              <a href="mailto:support@xyrachat.com" className="inline-flex items-center gap-1 hover:text-white">
                <Mail className="size-3" /> Email us
              </a>
              <Link href="/help" className="inline-flex items-center gap-1 hover:text-white">
                <BookOpen className="size-3" /> Help center
              </Link>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close help" : "Open help"}
        className="fixed bottom-4 right-4 z-50 inline-flex size-12 items-center justify-center rounded-full xyra-gradient text-white shadow-lg transition hover:opacity-90"
      >
        {open ? <X className="size-5" /> : <MessageCircleQuestion className="size-5" />}
      </button>
    </>
  );
}
