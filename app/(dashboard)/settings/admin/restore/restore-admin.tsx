"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, MessageSquare, User, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  restoreOrg,
  restoreConversation,
  restoreContact,
} from "@/lib/support/restore-actions";

type ActionResult = { ok: true } | { ok: false; error: string };

export type DeletedOrg = {
  id: string;
  name: string;
  deletedAt: string;
  memberCount: number;
};
export type DeletedConversation = {
  id: string;
  orgName: string;
  contactName: string;
  channel: string;
  deletedAt: string;
};
export type DeletedContact = {
  id: string;
  orgName: string;
  name: string;
  identifier: string;
  deletedAt: string;
};

function fmt(ts: string): string {
  return new Date(ts).toLocaleString();
}

// Inline restore button with optimistic toast + refresh.
function RestoreButton({
  action,
  id,
  label = "Restore",
}: {
  action: (id: string) => Promise<ActionResult>;
  id: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await action(id);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success("Restored");
          router.refresh();
        })
      }
      className="h-7 shrink-0 gap-1.5 border-white/15 text-xs text-white/80 hover:bg-white/5"
    >
      <RotateCcw className="size-3" />
      {pending ? "Restoring…" : label}
    </Button>
  );
}

// Workspace restore is destructive-adjacent (brings back everything) so it
// goes behind a confirm dialog.
function RestoreOrgButton({ org }: { org: DeletedOrg }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="h-7 shrink-0 gap-1.5 xyra-gradient border-0 text-xs text-white hover:opacity-90"
        >
          <RotateCcw className="size-3" />
          Restore workspace
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10">
        <DialogHeader>
          <DialogTitle>Restore “{org.name}”?</DialogTitle>
          <DialogDescription>
            Reactivates the workspace and everything the deletion removed at{" "}
            {fmt(org.deletedAt)} — members, conversations, contacts, channels,
            bots, templates and more. Items deleted individually before that
            stay deleted. Billing is not restored; re-provision via Entitlements
            if this was a cancellation.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await restoreOrg(org.id);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(`Restored ${org.name}`);
                setOpen(false);
                router.refresh();
              })
            }
            className="xyra-gradient border-0 text-white hover:opacity-90"
          >
            {pending ? "Restoring…" : "Restore workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RestoreAdmin({
  orgs,
  conversations,
  contacts,
}: {
  orgs: DeletedOrg[];
  conversations: DeletedConversation[];
  contacts: DeletedContact[];
}) {
  return (
    <div className="space-y-6">
      {/* Deleted workspaces */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-white/60" />
            <CardTitle className="text-base">Deleted workspaces</CardTitle>
          </div>
          <CardDescription>
            Reactivate a soft-deleted org and its cascade. Use this for the
            whole-workspace case — individual conversation/contact restores are
            below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orgs.length === 0 ? (
            <p className="text-sm text-white/50">No deleted workspaces.</p>
          ) : (
            <ul className="space-y-2">
              {orgs.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {o.name}
                    </p>
                    <p className="text-[11px] text-white/50">
                      {o.memberCount} member{o.memberCount === 1 ? "" : "s"} ·
                      deleted {fmt(o.deletedAt)}
                    </p>
                  </div>
                  <RestoreOrgButton org={o} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Deleted conversations (active workspaces) */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-white/60" />
            <CardTitle className="text-base">Deleted conversations</CardTitle>
          </div>
          <CardDescription>
            Most recent 100 across active workspaces — typically an agent
            bulk-delete to undo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <p className="text-sm text-white/50">No deleted conversations.</p>
          ) : (
            <ul className="space-y-2">
              {conversations.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">
                      {c.contactName}{" "}
                      <span className="text-white/40">· {c.channel}</span>
                    </p>
                    <p className="text-[11px] text-white/50">
                      {c.orgName} · deleted {fmt(c.deletedAt)}
                    </p>
                  </div>
                  <RestoreButton action={restoreConversation} id={c.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Deleted contacts (active workspaces) */}
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="size-4 text-white/60" />
            <CardTitle className="text-base">Deleted contacts</CardTitle>
          </div>
          <CardDescription>Most recent 100 across active workspaces.</CardDescription>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-white/50">No deleted contacts.</p>
          ) : (
            <ul className="space-y-2">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{c.name}</p>
                    <p className="text-[11px] text-white/50">
                      {c.identifier ? `${c.identifier} · ` : ""}
                      {c.orgName} · deleted {fmt(c.deletedAt)}
                    </p>
                  </div>
                  <RestoreButton action={restoreContact} id={c.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
