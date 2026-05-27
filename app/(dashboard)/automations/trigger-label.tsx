import { Camera, MessageSquare, AtSign, UserPlus, Webhook, MessageCircle, Mail, Send } from "lucide-react";
import type { TriggerType } from "@/lib/automations/types";

const TRIGGER_META: Record<
  TriggerType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  ig_new_follower: { label: "New IG follower", icon: UserPlus },
  ig_comment_keyword: { label: "IG comment keyword", icon: Camera },
  ig_story_mention: { label: "IG story mention", icon: AtSign },
  ig_dm_keyword: { label: "IG DM keyword", icon: Camera },
  wa_keyword: { label: "WhatsApp keyword", icon: MessageSquare },
  tg_keyword: { label: "Telegram keyword", icon: Send },
  email_keyword: { label: "Email keyword", icon: Mail },
  conversation_opened: { label: "Conversation opened", icon: MessageCircle },
  webhook: { label: "External webhook", icon: Webhook },
};

export function TriggerLabel({ trigger }: { trigger: TriggerType }) {
  const meta = TRIGGER_META[trigger] ?? { label: trigger, icon: Webhook };
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <Icon className="size-3 text-white/60" />
      {meta.label}
    </span>
  );
}
