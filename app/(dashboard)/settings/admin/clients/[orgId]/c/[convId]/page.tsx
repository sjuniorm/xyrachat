import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { getClientConversationMessages } from "@/lib/support/view";
import { getActiveSupportGrant } from "@/lib/support/access";
import { SupportNoteForm } from "./support-note-form";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Support view of a single client conversation. Gated + audited inside
// getClientConversationMessages (operator + active grant). Read-only unless the
// client granted read_reply scope, in which case support can post internal notes.
export default async function SupportConversationPage({
  params,
}: {
  params: Promise<{ orgId: string; convId: string }>;
}) {
  const { orgId, convId } = await params;
  const [res, grant] = await Promise.all([
    getClientConversationMessages(orgId, convId),
    getActiveSupportGrant(orgId),
  ]);
  const canReply = grant?.scope === "read_reply";

  if (!res.ok) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <p className="text-sm text-white/60">{res.error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/settings/admin/clients/${orgId}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white"
        >
          <ArrowLeft className="size-3.5" /> Back to client
        </Link>

        <header className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight">
            {res.contactName ?? "Conversation"}
          </h1>
          <p className="mt-1 inline-flex items-center gap-2 text-xs text-white/50">
            <span className="capitalize">{res.channelType ?? "—"}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200">
              <ShieldAlert className="size-2.5" />
              {canReply ? "Support view · can post internal notes · logged" : "Support read-only view · logged"}
            </span>
          </p>
        </header>

        <div className="space-y-2">
          {res.messages.length === 0 && (
            <p className="text-sm text-white/40">No messages.</p>
          )}
          {res.messages.map((m) => {
            const out = m.direction === "outbound";
            return (
              <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                    m.is_internal_note
                      ? "bg-amber-400/15 text-amber-100 ring-1 ring-amber-400/30"
                      : out
                        ? "bg-[color:var(--xyra-purple)]/30 text-white"
                        : "bg-white/[0.07] text-white ring-1 ring-white/10",
                  )}
                >
                  {m.is_internal_note && (
                    <p className="mb-0.5 text-[10px] uppercase tracking-wide text-amber-300/80">
                      internal note
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p
                    className="mt-1 text-[10px] text-white/40"
                    suppressHydrationWarning
                  >
                    {m.sender_type ?? (out ? "agent" : "contact")} ·{" "}
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {canReply && <SupportNoteForm orgId={orgId} convId={convId} />}
      </div>
    </div>
  );
}
