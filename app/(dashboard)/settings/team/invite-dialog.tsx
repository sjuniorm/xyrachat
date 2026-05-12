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

export function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [pending, startTransition] = useTransition();

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
            They'll get an email from Supabase with a link to set their password
            and join {/*org name not loaded here yet — could be a future prop*/}
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
            <div className="grid grid-cols-2 gap-2">
              <RoleOption
                value="agent"
                label="Agent"
                description="Can reply to conversations assigned to them."
                checked={role === "agent"}
                onSelect={() => setRole("agent")}
              />
              <RoleOption
                value="admin"
                label="Admin"
                description="Can invite, assign, and manage channels."
                checked={role === "admin"}
                onSelect={() => setRole("admin")}
              />
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
      data-state={checked ? "checked" : ""}
      data-value={value}
      onClick={onSelect}
      className={
        checked
          ? "rounded-lg border border-[color:var(--xyra-glow)] bg-white/5 px-3 py-2 text-left text-sm"
          : "rounded-lg border border-white/10 px-3 py-2 text-left text-sm hover:border-white/20 hover:bg-white/5"
      }
    >
      <p className="font-medium text-white">{label}</p>
      <p className="mt-0.5 text-xs text-white/55">{description}</p>
    </button>
  );
}
