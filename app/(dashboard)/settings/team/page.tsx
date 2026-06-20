import { redirect } from "next/navigation";
import { Mail, UserMinus, UserX } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getTeamSnapshot } from "@/lib/team/server";
import {
  cancelInvite,
  removeTeamMember,
} from "@/lib/team/actions";
import { getActiveSupportGrant } from "@/lib/support/access";
import { getAgentPermissions } from "@/lib/team/permissions";
import { cn } from "@/lib/utils";
import { InviteDialog } from "./invite-dialog";
import { ConfirmAction } from "./confirm-action";
import { ChangeRoleMenu } from "./change-role-menu";
import { SupportAccessCard } from "./support-access-card";
import { DeleteWorkspace } from "./delete-workspace";
import { AgentPermissionsCard } from "./agent-permissions-card";

const ROLE_BADGE: Record<string, string> = {
  owner:
    "border-[color:var(--xyra-purple)]/40 bg-[color:var(--xyra-purple)]/15 text-[color:var(--xyra-glow)]",
  admin: "border-amber-400/40 bg-amber-400/15 text-amber-200",
  supervisor: "border-sky-400/40 bg-sky-400/15 text-sky-200",
  agent: "border-white/15 bg-white/5 text-white/70",
};

const AVAILABILITY_DOT: Record<string, string> = {
  online: "bg-emerald-400",
  away: "bg-amber-400",
  offline: "bg-zinc-500",
};

export default async function TeamPage() {
  const { me, orgId, members, pendingInvites } = await getTeamSnapshot();
  if (!me) redirect("/login");
  if (!orgId) redirect("/onboarding");

  const canManage = me.role === "owner" || me.role === "admin";
  const supportGrant = canManage ? await getActiveSupportGrant(orgId) : null;
  const agentPerms = canManage ? await getAgentPermissions(orgId) : null;

  // Owner-only danger zone needs the workspace name for the type-to-confirm.
  let workspaceName = "this workspace";
  if (me.role === "owner") {
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    if (org?.name) workspaceName = org.name;
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Invite teammates, assign roles, and remove members who leave.
            </p>
          </div>
          {canManage && <InviteDialog myRole={me.role} />}
        </header>

        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Members</CardTitle>
            <CardDescription>
              {members.length} active {members.length === 1 ? "member" : "members"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 p-0">
            <ul className="divide-y divide-white/5">
              {members.map((m) => {
                const initials = (m.full_name ?? m.email ?? "?")
                  .split(/\s+/)
                  .map((s) => s[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                const isMe = m.id === me.id;
                const canChangeRole =
                  canManage && !isMe &&
                  !(me.role === "admin" && m.role === "admin");
                const canRemove =
                  canManage && !isMe &&
                  !(me.role === "admin" && (m.role === "admin" || m.role === "owner")) &&
                  !(me.role === "admin" && m.role === "owner");
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div className="relative">
                      <Avatar className="size-10">
                        {m.avatar_url && (
                          <AvatarImage src={m.avatar_url} alt="" />
                        )}
                        <AvatarFallback className="bg-[color:var(--xyra-purple)] text-xs text-white">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        aria-label={`availability: ${m.availability}`}
                        className={cn(
                          "absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-card",
                          AVAILABILITY_DOT[m.availability],
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-white">
                          {m.full_name ?? "Unnamed user"}
                          {isMe && (
                            <span className="ml-2 text-xs text-white/40">
                              (you)
                            </span>
                          )}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 px-1.5 text-[10px] capitalize",
                            ROLE_BADGE[m.role],
                          )}
                        >
                          {m.role}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-white/50">
                        {m.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {canChangeRole && (
                        <ChangeRoleMenu
                          userId={m.id}
                          currentRole={m.role}
                          myRole={me.role}
                        />
                      )}
                      {canRemove && (
                        <ConfirmAction
                          action={removeTeamMember}
                          hidden={[{ name: "user_id", value: m.id }]}
                          buttonLabel={
                            <>
                              <UserMinus className="mr-1.5 size-3.5" />
                              Remove
                            </>
                          }
                          title={`Remove ${m.full_name ?? m.email}?`}
                          description="They lose access to this organization immediately. Any conversations assigned to them will become unassigned. Their auth account stays."
                          confirmLabel="Remove"
                          confirmingLabel="Removing…"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {pendingInvites.length > 0 && (
          <Card className="mt-6 border-white/10 bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">Pending invites</CardTitle>
              <CardDescription>
                {pendingInvites.length} invited, waiting for acceptance.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-white/5">
                {pendingInvites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-white/5">
                      <Mail className="size-4 text-white/50" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-white">
                          {inv.email}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 px-1.5 text-[10px] capitalize",
                            ROLE_BADGE[inv.role],
                          )}
                        >
                          {inv.role}
                        </Badge>
                      </div>
                      <p
                        suppressHydrationWarning
                        className="text-xs text-white/50"
                      >
                        Invited {new Date(inv.invited_at).toLocaleDateString()}
                      </p>
                    </div>
                    {canManage && (
                      <ConfirmAction
                        action={cancelInvite}
                        hidden={[{ name: "user_id", value: inv.id }]}
                        buttonLabel={
                          <>
                            <UserX className="mr-1.5 size-3.5" />
                            Cancel
                          </>
                        }
                        title={`Cancel invite to ${inv.email}?`}
                        description="The invite link will stop working. You can re-invite them later."
                        confirmLabel="Cancel invite"
                        confirmingLabel="Cancelling…"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {canManage && agentPerms && <AgentPermissionsCard initial={agentPerms} />}
        {canManage && <SupportAccessCard grant={supportGrant} />}
        {me.role === "owner" && <DeleteWorkspace workspaceName={workspaceName} />}
      </div>
    </div>
  );
}
