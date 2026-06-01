import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isExpoPushToken,
  sendExpoPush,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from "@/lib/push/expo";

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  telegram: "Telegram",
  email: "Email",
  facebook: "Messenger",
};

type NotifyInboundArgs = {
  conversationId: string;
  channelType: string;
  preview: string | null;
};

/**
 * Push the agent ASSIGNED to a conversation when a new inbound message lands.
 * Fire-and-forget — call as `void notifyNewInbound(...)` from a webhook; it
 * never throws and never blocks the 200 response.
 *
 * Unassigned conversations are a no-op: there's no single device to wake, and
 * the team already sees them in the web inbox. (A future enhancement could fan
 * out to all online agents in the org.)
 *
 * Dead tokens (DeviceNotRegistered) are soft-deleted so we stop pushing to
 * uninstalled / signed-out apps.
 */
export async function notifyNewInbound(args: NotifyInboundArgs): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: conv } = await admin
      .from("conversations")
      .select(
        "id, assigned_to, contact:contacts!conversations_contact_id_fkey(name)",
      )
      .eq("id", args.conversationId)
      .maybeSingle();

    const assignedTo = (conv as { assigned_to: string | null } | null)
      ?.assigned_to;
    if (!assignedTo) return;

    const { data: tokenRows } = await admin
      .from("push_tokens")
      .select("token")
      .eq("user_id", assignedTo)
      .is("deleted_at", null);

    const tokens = ((tokenRows as { token: string }[] | null) ?? [])
      .map((t) => t.token)
      .filter(isExpoPushToken);
    if (tokens.length === 0) return;

    const contactName =
      (conv as { contact?: { name: string | null } | null } | null)?.contact
        ?.name ?? "New message";
    const label = CHANNEL_LABEL[args.channelType] ?? args.channelType;
    const body = args.preview?.trim()
      ? args.preview.trim().slice(0, 140)
      : "Sent an attachment";

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      title: `${contactName} · ${label}`,
      body,
      sound: "default",
      data: { conversationId: args.conversationId, type: "message.received" },
    }));

    const tickets = await sendExpoPush(messages);

    const dead = tickets
      .map((t: ExpoPushTicket, i) =>
        t.status === "error" && t.details?.error === "DeviceNotRegistered"
          ? tokens[i]
          : null,
      )
      .filter((t): t is string => Boolean(t));

    if (dead.length > 0) {
      await admin
        .from("push_tokens")
        .update({ deleted_at: new Date().toISOString() })
        .in("token", dead);
    }
  } catch (err) {
    console.warn("[push] notifyNewInbound failed", err);
  }
}
