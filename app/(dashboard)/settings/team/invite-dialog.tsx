"use client";

import { useState, useTransition } from "react";
import { Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteTeamMember } from "@/lib/team/actions";
import type { ProfileRole } from "@/lib/db-types";
import { cn } from "@/lib/utils";

type InviteRole = "owner" | "admin" | "supervisor" | "agent";

const ROLE_DESCRIPTIONS: Record<InviteRole, string> = {
  owner: "Full control — same rights as you. Multiple owners allowed.",
  admin: "Invite and remove agents/supervisors, manage channels.",
  supervisor: "Sees every conversation, can assign and close any chat. No member or channel management.",
  agent: "Replies to conversations assigned to them.",
};

const ROLE_LABEL: Record<InviteRole, string> = {
  owner: "Owner",
  admin: "Admin",
  supervisor: "Supervisor",
  agent: "Agent",
};

export function InviteDialog({ myRole }: { myRole: ProfileRole }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("agent");
  const [pending, startTransition] = useTransition();

  // Owners can invite anyone. Admins can invite supervisor + agent only.
  const allowedRoles: InviteRole[] =
    myRole === "owner"
      ? ["owner", "admin", "supervisor", "agent"]
      : ["supervisor", "agent"];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await inviteTeamMember(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Invite sent to ${email}`);
      setEmail("");
      setRole("agent");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="xyra-gradient text-white border-0 hover:opacity-90">
          <Plus className="mr-1.5 size-4" /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10">
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They'll get an email with a link to set their password and join
            your workspace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {allowedRoles.map((r) => (
                <RoleOption
                  key={r}
                  value={r}
                  label={ROLE_LABEL[r]}
                  description={ROLE_DESCRIPTIONS[r]}
                  checked={role === r}
                  onSelect={() => setRole(r)}
                />
              ))}
            </div>
            <input type="hidden" name="role" value={role} />
          </div>
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
              type="submit"
              disabled={pending || !email.trim()}
              className="xyra-gradient text-white border-0 hover:opacity-90"
            >
              <Send className="mr-1.5 size-3.5" />
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleOption({
  value,
  label,
  description,
  checked,
  onSelect,
}: {
  value: string;
  label: string;
  description: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-value={value}
      onClick={onSelect}
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-sm transition",
        checked
          ? "border-[color:var(--xyra-glow)] bg-white/5"
          : "border-white/10 hover:border-white/20 hover:bg-white/5",
      )}
    >
      <p className="font-medium text-white">{label}</p>
      <p className="mt-0.5 text-xs text-white/55">{description}</p>
    </button>
  );
}
