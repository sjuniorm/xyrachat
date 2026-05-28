// Canonical event vocabulary. Keep stable — connectors + customer
// integrations bind to these strings. New events go at the bottom.

export const EVENT_TYPES = [
  "message.received",
  "message.sent",
  "conversation.opened",
  "conversation.closed",
  "conversation.assigned",
  "conversation.unassigned",
  "contact.created",
  "contact.updated",
  "contact.tagged",
  "contact.opted_out",
  "bot.handoff",
  "bot.lead_captured",
  "bot.link_clicked",
  "bot.qualified",
  "broadcast.completed",
  "channel.disconnected",
  "automation.fired",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
