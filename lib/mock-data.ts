// Xyra Chat — Week 2 mock data for the inbox shell.
// Replace with real Supabase queries in Week 4 (conversations + messages tables).

export type Channel =
  | "whatsapp"
  | "instagram"
  | "telegram"
  | "email"
  | "facebook"
  | "webchat";

export type ConversationStatus = "open" | "closed" | "snoozed" | "bot";
export type MessageDirection = "inbound" | "outbound";
export type MessageDeliveryStatus = "sent" | "delivered" | "read" | "failed";
export type ConversationFilter = "all" | "mine" | "unassigned" | "bot" | "closed";

export type Agent = {
  id: string;
  name: string;
  avatar: string;
};

export type Contact = {
  id: string;
  name: string;
  avatar: string;
  phone?: string;
  email?: string;
  channel_handles: { channel: Channel; handle: string }[];
  tags: { label: string; color: "purple" | "pink" | "amber" | "emerald" | "sky" }[];
  notes: string;
};

export type MessageAttachment = {
  type: "image" | "video" | "audio" | "file" | "story_mention" | "share";
  url: string;
  name: string;
  size?: string;
};

// Small "what the AI/automation did" provenance chip shown under a bubble.
export type AiActivityKind = "bot" | "translate" | "automation" | "lead";
export type AiActivity = { kind: AiActivityKind; label: string };

export type Message = {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  body: string;
  attachments?: MessageAttachment[];
  replied_to_message_id?: string;
  created_at: string;
  delivery_status?: MessageDeliveryStatus; // outbound only
  is_internal_note?: boolean;
  ai_activity?: AiActivity[];
  // True when this outbound message is a genuine AI bot reply (not an
  // automation send) — gates the 👍/👎 quality-feedback control in the bubble.
  is_bot_reply?: boolean;
  // The current agent's rating on this bot reply, if any. Hydrated server-side
  // for the initial render; updated optimistically on click.
  bot_feedback?: "up" | "down" | null;
  // The current agent's free-text "what went wrong" note on a 👎, if any.
  bot_feedback_reason?: string | null;
  metadata?: {
    ai_assisted?: { action: string; model: string; language?: string };
    translation?: {
      source_lang: string;
      target_lang: string;
      translated_text: string;
    };
    ig_story?: { id: string; url: string | null };
    ig_reactions?: Array<{ from: string; emoji: string }>;
    transcription?: { text: string; model: string };
    email?: {
      subject?: string;
      from_address?: string;
      from_name?: string;
      to_addresses?: string[];
      cc_addresses?: string[];
      html_body?: string;
      in_reply_to?: string;
      references?: string[];
    };
  };
};

export type Conversation = {
  id: string;
  contact: Contact;
  channel: Channel;
  status: ConversationStatus;
  last_message_preview: string;
  last_message_at: string;
  created_at?: string;
  snooze_until?: string | null;
  unread_count: number;
  assigned_agent?: Agent;
  detected_language?: string; // BCP-47 like 'es-ES', 'en'
  messages: Message[];
};

const av = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=9333EA&color=fff&bold=true&size=128`;

const AGENTS: Record<string, Agent> = {
  junior: { id: "ag_1", name: "Junior Mylle", avatar: av("Junior Mylle") },
  ana: { id: "ag_2", name: "Ana García", avatar: av("Ana García") },
  marco: { id: "ag_3", name: "Marco Bianchi", avatar: av("Marco Bianchi") },
};

export const CURRENT_USER_AGENT_ID = AGENTS.junior.id;

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);
const daysAgo = (d: number) => hoursAgo(d * 24);

function buildThread(
  conversationId: string,
  start: number,
  pairs: Array<[MessageDirection, string, Partial<Message>?]>,
): Message[] {
  const out: Message[] = [];
  let t = start;
  for (let i = 0; i < pairs.length; i++) {
    const [direction, body, extras] = pairs[i];
    out.push({
      id: `${conversationId}_m${i + 1}`,
      conversation_id: conversationId,
      direction,
      body,
      created_at: minutesAgo(t),
      delivery_status: direction === "outbound" ? "read" : undefined,
      ...extras,
    });
    // Decrement so messages get newer toward the end of the array.
    t -= Math.max(1, Math.floor(Math.random() * 6));
  }
  return out;
}

export const CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    channel: "whatsapp",
    status: "open",
    contact: {
      id: "p1",
      name: "Lucía Fernández",
      avatar: av("Lucía Fernández"),
      phone: "+34 612 345 678",
      email: "lucia.fernandez@example.com",
      channel_handles: [{ channel: "whatsapp", handle: "+34 612 345 678" }],
      tags: [
        { label: "VIP", color: "purple" },
        { label: "Madrid", color: "sky" },
      ],
      notes: "Prefers Spanish. Repeat customer since 2024.",
    },
    detected_language: "es-ES",
    last_message_preview: "Hola, ¿podéis confirmar el envío?",
    last_message_at: minutesAgo(2),
    unread_count: 3,
    assigned_agent: AGENTS.junior,
    messages: buildThread("c1", 60, [
      ["outbound", "Hola Lucía 👋 ¿en qué te puedo ayudar?"],
      ["inbound", "Hola, hice un pedido la semana pasada y aún no llega"],
      ["outbound", "Lo siento mucho, dame un segundo y lo reviso"],
      ["inbound", "Gracias 🙏"],
      ["outbound", "Tu pedido salió ayer del almacén. Llega mañana antes de las 14:00."],
      ["inbound", "Ah perfecto, gracias!"],
      ["inbound", "Una pregunta más, ¿puedo cambiar la dirección de entrega?"],
      ["outbound", "Sí, sin problema. ¿A qué dirección lo enviamos?"],
      ["inbound", "Calle Mayor 23, 4ºB"],
      ["inbound", "Madrid, 28013"],
      ["inbound", "Hola, ¿podéis confirmar el envío?"],
    ]),
  },
  {
    id: "c2",
    channel: "instagram",
    status: "open",
    contact: {
      id: "p2",
      name: "James O'Connor",
      avatar: av("James OConnor"),
      email: "james.oconnor@example.com",
      channel_handles: [{ channel: "instagram", handle: "@joconnor" }],
      tags: [{ label: "New lead", color: "emerald" }],
      notes: "",
    },
    detected_language: "en",
    last_message_preview: "Do you ship to Ireland?",
    last_message_at: minutesAgo(14),
    unread_count: 1,
    assigned_agent: AGENTS.ana,
    messages: buildThread("c2", 35, [
      ["inbound", "Hi! I love the new collection 😍"],
      ["outbound", "Thank you so much James! Anything specific catching your eye?"],
      ["inbound", "The cream wool coat — is it still in stock?"],
      ["outbound", "Yes, sizes M and L are available."],
      ["inbound", "Great. Do you ship to Ireland?"],
    ]),
  },
  {
    id: "c3",
    channel: "telegram",
    status: "bot",
    contact: {
      id: "p3",
      name: "Alex Petrov",
      avatar: av("Alex Petrov"),
      channel_handles: [{ channel: "telegram", handle: "@apetrov" }],
      tags: [{ label: "Trial", color: "amber" }],
      notes: "Asking about pricing on the Pro plan.",
    },
    detected_language: "en",
    last_message_preview: "Tell me more about the Pro plan.",
    last_message_at: minutesAgo(38),
    unread_count: 0,
    messages: buildThread("c3", 90, [
      ["inbound", "Hi"],
      ["outbound", "Hi Alex! I'm Xyra's assistant — ask me anything about pricing, features or onboarding 🤖"],
      ["inbound", "Tell me more about the Pro plan."],
    ]),
  },
  {
    id: "c4",
    channel: "email",
    status: "open",
    contact: {
      id: "p4",
      name: "Charlotte Dubois",
      avatar: av("Charlotte Dubois"),
      email: "charlotte.dubois@example.com",
      channel_handles: [{ channel: "email", handle: "charlotte.dubois@example.com" }],
      tags: [
        { label: "Wholesale", color: "purple" },
        { label: "France", color: "sky" },
      ],
      notes: "Wholesale inquiry for boutique in Lyon.",
    },
    detected_language: "fr",
    last_message_preview:
      "Bonjour, je gère une boutique à Lyon et j'aimerais discuter de tarifs en gros…",
    last_message_at: hoursAgo(1),
    unread_count: 2,
    assigned_agent: AGENTS.marco,
    messages: buildThread("c4", 120, [
      [
        "inbound",
        "Bonjour, je gère une boutique à Lyon et j'aimerais discuter de tarifs en gros pour votre nouvelle collection.",
      ],
      ["outbound", "Bonjour Charlotte, merci de votre intérêt ! Je vous envoie notre catalogue B2B."],
      ["inbound", "Parfait, j'attends ça avec impatience."],
    ]),
  },
  {
    id: "c5",
    channel: "whatsapp",
    status: "open",
    contact: {
      id: "p5",
      name: "Kenji Tanaka",
      avatar: av("Kenji Tanaka"),
      phone: "+81 80 1234 5678",
      channel_handles: [{ channel: "whatsapp", handle: "+81 80 1234 5678" }],
      tags: [{ label: "Returns", color: "pink" }],
      notes: "Return request for order #18429.",
    },
    detected_language: "ja",
    last_message_preview: "ありがとうございます。返品の手続きをお願いします。",
    last_message_at: hoursAgo(3),
    unread_count: 1,
    assigned_agent: AGENTS.junior,
    messages: buildThread("c5", 240, [
      ["inbound", "こんにちは。注文した商品にダメージがありました。"],
      ["outbound", "Tanaka-san, sorry for the trouble. Could you send a photo of the damage?"],
      [
        "inbound",
        "もちろん",
        {
          attachments: [
            {
              type: "image",
              url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=60",
              name: "damage-photo.jpg",
            },
          ],
        },
      ],
      ["outbound", "Thank you. We'll send a replacement and a return label today."],
      ["inbound", "ありがとうございます。返品の手続きをお願いします。"],
    ]),
  },
  {
    id: "c6",
    channel: "facebook",
    status: "snoozed",
    contact: {
      id: "p6",
      name: "Maria Silva",
      avatar: av("Maria Silva"),
      channel_handles: [{ channel: "facebook", handle: "Maria Silva" }],
      tags: [],
      notes: "",
    },
    detected_language: "pt",
    last_message_preview: "Vou verificar e te respondo!",
    last_message_at: hoursAgo(8),
    unread_count: 0,
    assigned_agent: AGENTS.ana,
    messages: buildThread("c6", 480, [
      ["inbound", "Olá! Vocês fazem entrega no Porto?"],
      ["outbound", "Olá Maria! Sim, fazemos entrega em todo Portugal."],
      ["inbound", "Quanto tempo demora?"],
      ["outbound", "2-3 dias úteis. Vou verificar e te respondo!"],
    ]),
  },
  {
    id: "c7",
    channel: "instagram",
    status: "closed",
    contact: {
      id: "p7",
      name: "Sven Eriksen",
      avatar: av("Sven Eriksen"),
      channel_handles: [{ channel: "instagram", handle: "@svenerik" }],
      tags: [{ label: "Resolved", color: "emerald" }],
      notes: "Asked for size guide.",
    },
    detected_language: "en",
    last_message_preview: "Perfect, thanks!",
    last_message_at: daysAgo(1),
    unread_count: 0,
    assigned_agent: AGENTS.junior,
    messages: buildThread("c7", 1500, [
      ["inbound", "Do you have a size guide?"],
      ["outbound", "Yes! Here you go: https://xyrachat.com/size-guide"],
      ["inbound", "Perfect, thanks!"],
    ]),
  },
  {
    id: "c8",
    channel: "whatsapp",
    status: "open",
    contact: {
      id: "p8",
      name: "Aïsha Khalil",
      avatar: av("Aisha Khalil"),
      phone: "+971 50 555 0119",
      channel_handles: [{ channel: "whatsapp", handle: "+971 50 555 0119" }],
      tags: [{ label: "Press", color: "pink" }],
      notes: "Journalist from Vogue Arabia.",
    },
    detected_language: "en",
    last_message_preview: "Could we set up a call this week?",
    last_message_at: hoursAgo(5),
    unread_count: 4,
    assigned_agent: AGENTS.marco,
    messages: buildThread("c8", 320, [
      ["inbound", "Hi, I'm writing a piece about emerging brands."],
      ["outbound", "Hi Aïsha! Thank you for reaching out — happy to help."],
      ["inbound", "Could you share some product samples?"],
      ["outbound", "Of course. What's your shipping address?"],
      ["inbound", "Could we set up a call this week?"],
    ]),
  },
  {
    id: "c9",
    channel: "email",
    status: "closed",
    contact: {
      id: "p9",
      name: "Daniel Müller",
      avatar: av("Daniel Müller"),
      email: "daniel.mueller@example.com",
      channel_handles: [{ channel: "email", handle: "daniel.mueller@example.com" }],
      tags: [{ label: "Refund", color: "amber" }],
      notes: "Refund processed 2026-04-22.",
    },
    detected_language: "de",
    last_message_preview: "Vielen Dank für die schnelle Bearbeitung!",
    last_message_at: daysAgo(3),
    unread_count: 0,
    assigned_agent: AGENTS.ana,
    messages: buildThread("c9", 5000, [
      ["inbound", "Ich habe noch keine Rückerstattung erhalten."],
      ["outbound", "Sorry für die Verzögerung — wir bearbeiten das heute noch."],
      ["inbound", "Vielen Dank für die schnelle Bearbeitung!"],
    ]),
  },
  {
    id: "c10",
    channel: "telegram",
    status: "open",
    contact: {
      id: "p10",
      name: "Priya Sharma",
      avatar: av("Priya Sharma"),
      channel_handles: [{ channel: "telegram", handle: "@priyas" }],
      tags: [{ label: "Influencer", color: "purple" }],
      notes: "1.2M followers on Instagram.",
    },
    detected_language: "en",
    last_message_preview: "Sent the affiliate link, all good!",
    last_message_at: minutesAgo(48),
    unread_count: 0,
    assigned_agent: AGENTS.junior,
    messages: buildThread("c10", 200, [
      ["inbound", "Hey, ready for the launch on Saturday 🚀"],
      ["outbound", "Amazing! Did the products arrive?"],
      ["inbound", "Yes, photos look stunning."],
      ["outbound", "Great! I'll send the affiliate code today."],
      ["inbound", "Sent the affiliate link, all good!"],
    ]),
  },
];

export function getConversation(id: string): Conversation | undefined {
  return CONVERSATIONS.find((c) => c.id === id);
}

export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const m = Math.round(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(iso).toLocaleDateString();
}
