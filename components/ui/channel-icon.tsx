import { Mail, MessageCircle, Send, Camera, MessagesSquare, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Channel } from "@/lib/mock-data";

const CHANNEL_META: Record<
  Channel,
  { Icon: React.ComponentType<{ className?: string }>; label: string; bg: string; text: string }
> = {
  whatsapp: {
    Icon: MessageCircle,
    label: "WhatsApp",
    bg: "bg-[#25D366]",
    text: "text-white",
  },
  instagram: {
    Icon: Camera,
    label: "Instagram",
    bg: "bg-[linear-gradient(135deg,#833AB4_0%,#FD1D1D_50%,#FCB045_100%)]",
    text: "text-white",
  },
  telegram: {
    Icon: Send,
    label: "Telegram",
    bg: "bg-[#0088cc]",
    text: "text-white",
  },
  email: {
    Icon: Mail,
    label: "Email",
    bg: "bg-[#6b7280]",
    text: "text-white",
  },
  facebook: {
    Icon: MessagesSquare,
    label: "Messenger",
    bg: "bg-[#1877F2]",
    text: "text-white",
  },
  webchat: {
    Icon: Globe,
    label: "Web chat",
    bg: "bg-[linear-gradient(135deg,#9333EA_0%,#EC4899_100%)]",
    text: "text-white",
  },
};

const SIZE: Record<"sm" | "md", string> = {
  sm: "size-6",
  md: "size-8",
};
const ICON_SIZE: Record<"sm" | "md", string> = {
  sm: "size-3.5",
  md: "size-4",
};

export function ChannelIcon({
  channel,
  size = "md",
  className,
  withRing = true,
}: {
  channel: Channel;
  size?: "sm" | "md";
  className?: string;
  withRing?: boolean;
}) {
  const meta = CHANNEL_META[channel];
  const { Icon } = meta;
  return (
    <span
      role="img"
      aria-label={meta.label}
      title={meta.label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        SIZE[size],
        meta.bg,
        meta.text,
        withRing && "ring-1 ring-white/15",
        className,
      )}
    >
      <Icon className={ICON_SIZE[size]} aria-hidden />
    </span>
  );
}

export function channelLabel(channel: Channel): string {
  return CHANNEL_META[channel].label;
}
