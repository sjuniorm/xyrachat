"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

// Owner-only "danger zone" — permanently deletes the whole workspace + all its
// data (GDPR erasure) via /api/gdpr/delete, which cascades through every
// org-scoped table and starts the 30-day retention purge, then hard-deletes the
// owner's auth account. Requires typing the workspace name to confirm.
export function DeleteWorkspace({ workspaceName }: { workspaceName: string }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const armed = confirm.trim() === workspaceName.trim() && workspaceName.trim().length > 0;

  async function onDelete() {
    if (!armed || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gdpr/delete", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Could not delete the workspace.");
        setBusy(false);
        return;
      }
      // Account is gone — sign out + leave.
      try {
        await createClient().auth.signOut();
      } catch {
        // ignore — the auth user is already deleted server-side
      }
      window.location.href = "/login?deleted=1";
    } catch {
      toast.error("Could not delete the workspace.");
      setBusy(false);
    }
  }

  return (
    <Card className="mt-8 border-red-500/30 bg-red-500/[0.03]">
      <CardHeader>
        <CardTitle className="text-base text-red-300">Delete workspace</CardTitle>
        <CardDescription>
          Permanently delete <strong>{workspaceName}</strong> and all its data —
          conversations, contacts, channels, bots, automations, broadcasts,
          billing, and team. This also deletes your account. Data is retained for
          30 days then permanently purged. This cannot be undone from here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="confirm-name" className="text-xs">
            Type <span className="font-mono text-red-300">{workspaceName}</span> to confirm
          </Label>
          <Input
            id="confirm-name"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={workspaceName}
            autoComplete="off"
            className="max-w-sm"
          />
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={!armed || busy}
          onClick={onDelete}
        >
          {busy ? "Deleting…" : "Delete this workspace permanently"}
        </Button>
      </CardContent>
    </Card>
  );
}
