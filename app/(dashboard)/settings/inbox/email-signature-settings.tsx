"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateEmailSignature } from "@/lib/inbox/actions";

// Edit the org's outbound email-reply signature (HTML). Applied below every
// agent email reply. Sanitized server-side.
export function EmailSignatureSettings({ initial, canEdit }: { initial: string; canEdit: boolean }) {
  const router = useRouter();
  const [html, setHtml] = useState(initial);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateEmailSignature(html);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Email signature saved.");
      router.refresh();
    });
  }

  if (!canEdit) {
    return <p className="text-sm text-white/50">Only owners and admins can edit the email signature.</p>;
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        rows={5}
        placeholder={'e.g. <p>Best,<br>The Acme team</p><p><a href="https://acme.com">acme.com</a></p>'}
        className="font-mono text-xs"
      />
      <p className="text-[11px] text-white/45">
        Basic HTML allowed (links, bold, line breaks). Scripts/styles are stripped for
        safety on send. Leave empty for plain replies.
      </p>
      <Button onClick={save} disabled={pending} className="xyra-gradient text-white">
        {pending ? "Saving…" : "Save signature"}
      </Button>
    </div>
  );
}
