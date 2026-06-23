"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { postSupportNote, supportReplyToCustomer } from "@/lib/support/reply-actions";

// Shown only when the client granted read_reply scope. Two modes:
//  • Internal note — visible to the client's agents, NEVER sent to the customer.
//  • Reply to customer — sends AS THE BUSINESS over the channel (gated + audited).
// Both re-check gating server-side; this is just the UI.
export function SupportNoteForm({ orgId, convId }: { orgId: string; convId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"note" | "reply">("note");
  const [busy, start] = useTransition();

  function submit() {
    const v = text.trim();
    if (!v) return;
    start(async () => {
      const res =
        mode === "note"
          ? await postSupportNote(orgId, convId, v)
          : await supportReplyToCustomer(orgId, convId, v);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setText("");
      toast.success(mode === "note" ? "Internal note posted" : "Reply sent to the customer");
      router.refresh();
    });
  }

  const tab = (m: "note" | "reply", label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={cn(
        "rounded px-2.5 py-1 text-xs transition",
        mode === m ? "bg-white/15 text-white" : "text-white/50 hover:text-white",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3">
      <div className="mb-2 inline-flex gap-0.5 rounded-md border border-white/10 p-0.5">
        {tab("note", "Internal note")}
        {tab("reply", "Reply to customer")}
      </div>
      <p
        className={cn(
          "mb-1.5 text-xs",
          mode === "reply" ? "text-red-300" : "text-amber-200/80",
        )}
      >
        {mode === "note" ? (
          <>
            Visible to the client&apos;s agents in their inbox — <strong>never</strong> sent
            to the customer.
          </>
        ) : (
          <>
            ⚠️ This sends to the customer <strong>as the business</strong> over their channel.
            Use sparingly — the client&apos;s agents will see it as a support reply.
          </>
        )}
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={5000}
        placeholder={
          mode === "note"
            ? "e.g. I checked this — lower the bot's knowledge threshold to ~0.6."
            : "Reply the customer will receive…"
        }
        className="text-sm"
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={busy || !text.trim()}
          onClick={submit}
          className={cn(
            "border-0 text-white",
            mode === "reply" ? "bg-red-600 hover:bg-red-500" : "xyra-gradient",
          )}
        >
          {busy
            ? mode === "note"
              ? "Posting…"
              : "Sending…"
            : mode === "note"
              ? "Post internal note"
              : "Send reply to customer"}
        </Button>
      </div>
    </div>
  );
}
