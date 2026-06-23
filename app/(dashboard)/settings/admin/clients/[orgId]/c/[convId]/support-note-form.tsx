"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postSupportNote } from "@/lib/support/reply-actions";

// Shown only when the client granted read_reply scope. Posts an INTERNAL note
// (visible to the client's agents, never sent to the customer). Gating is
// re-checked server-side in postSupportNote — this is just the UI.
export function SupportNoteForm({ orgId, convId }: { orgId: string; convId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, start] = useTransition();

  function submit() {
    const v = text.trim();
    if (!v) return;
    start(async () => {
      const res = await postSupportNote(orgId, convId, v);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setText("");
      toast.success("Internal note posted to the client's inbox");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3">
      <p className="mb-1.5 text-xs text-amber-200/80">
        Post an <strong>internal note</strong> — visible to the client&apos;s agents in their
        inbox, never sent to the customer.
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={5000}
        placeholder="e.g. I checked this — the bot's knowledge threshold looks too high; try lowering it to ~0.6."
        className="text-sm"
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={busy || !text.trim()}
          onClick={submit}
          className="xyra-gradient border-0 text-white"
        >
          {busy ? "Posting…" : "Post internal note"}
        </Button>
      </div>
    </div>
  );
}
