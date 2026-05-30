"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { forceSubmitEvidence, saveDisputeNote } from "@/lib/billing/dispute-actions";

type Dispute = {
  id: string;
  stripe_dispute_id: string;
  org_name: string;
  amount_cents: number;
  currency: string;
  reason: string | null;
  status: string;
  evidence_due_by: string | null;
  evidence_submitted_at: string | null;
  admin_notes: string | null;
};

const STATUS_TONE: Record<string, string> = {
  won: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300",
  lost: "border-red-400/30 bg-red-400/15 text-red-300",
  needs_response: "border-amber-400/30 bg-amber-400/15 text-amber-300",
  warning_needs_response: "border-amber-400/30 bg-amber-400/15 text-amber-300",
  under_review: "border-sky-400/30 bg-sky-400/15 text-sky-300",
};

export function DisputesAdmin({ disputes }: { disputes: Dispute[] }) {
  const [busy, startTransition] = useTransition();

  if (disputes.length === 0) {
    return (
      <Card className="border-white/10 bg-card/60">
        <CardContent className="py-8 text-center text-sm text-white/50">
          No disputes. 🎉
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {disputes.map((d) => {
        const tone = STATUS_TONE[d.status] ?? "border-white/15 bg-white/5 text-white/70";
        const overdueSoon =
          d.evidence_due_by &&
          !d.evidence_submitted_at &&
          new Date(d.evidence_due_by).getTime() - Date.now() < 48 * 60 * 60 * 1000;
        return (
          <li key={d.id}>
            <Card className="border-white/10 bg-card/60">
              <CardContent className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-white">{d.org_name}</span>
                  <span className="font-mono text-white/80">
                    {(d.amount_cents / 100).toFixed(2)} {d.currency.toUpperCase()}
                  </span>
                  {d.reason && <span className="text-white/50">· {d.reason}</span>}
                  <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${tone}`}>
                    {d.status}
                  </Badge>
                  {d.evidence_submitted_at ? (
                    <Badge variant="outline" className="h-5 border-emerald-400/30 bg-emerald-400/15 px-1.5 text-[10px] text-emerald-300">
                      evidence submitted
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="h-5 border-red-400/30 bg-red-400/15 px-1.5 text-[10px] text-red-300">
                      no evidence yet
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {d.evidence_due_by && (
                      <span className={`text-[10px] ${overdueSoon ? "text-red-300" : "text-white/40"}`} suppressHydrationWarning>
                        {overdueSoon && <AlertTriangle className="mr-0.5 inline size-3" />}
                        due {new Date(d.evidence_due_by).toLocaleString()}
                      </span>
                    )}
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await forceSubmitEvidence(d.stripe_dispute_id);
                          if (!res.ok) toast.error(res.error);
                          else toast.success("Evidence submitted to Stripe");
                        })
                      }
                      className="h-7 xyra-gradient text-white border-0 text-[10px] hover:opacity-90"
                    >
                      <Send className="mr-1 size-3" />
                      Submit evidence
                    </Button>
                  </div>
                </div>
                <NoteRow dispute={d} busy={busy} startTransition={startTransition} />
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function NoteRow({
  dispute,
  busy,
  startTransition,
}: {
  dispute: Dispute;
  busy: boolean;
  startTransition: (cb: () => Promise<void>) => void;
}) {
  const [note, setNote] = useState(dispute.admin_notes ?? "");
  return (
    <div className="flex items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Internal note (added to customer_communication evidence)…"
        className="h-7 flex-1 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-white"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy || note === (dispute.admin_notes ?? "")}
        onClick={() =>
          startTransition(async () => {
            const res = await saveDisputeNote(dispute.id, note);
            if (!res.ok) toast.error(res.error);
            else toast.success("Note saved");
          })
        }
        className="h-7 border-white/10 bg-white/5 text-[10px] hover:bg-white/10"
      >
        Save note
      </Button>
    </div>
  );
}
