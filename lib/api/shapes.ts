// Resource-shape helpers: take raw DB rows and return the canonical
// API representation. Keep these centralised so every endpoint that
// returns the same resource type emits the same JSON.

export function shapeContact(row: {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  instagram_id: string | null;
  telegram_id: string | null;
  tags: string[] | null;
  notes: string | null;
  opted_out: boolean;
  created_at: string;
}) {
  return {
    object: "contact" as const,
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    instagram_id: row.instagram_id,
    telegram_id: row.telegram_id,
    tags: row.tags ?? [],
    notes: row.notes,
    opted_out: row.opted_out,
    created_at: row.created_at,
  };
}

export function shapeConversation(c: {
  id: string;
  channel_id: string;
  contact_id: string;
  assigned_to: string | null;
  status: string;
  last_message_at: string;
  last_inbound_at: string | null;
  snooze_until: string | null;
  created_at: string;
}) {
  return {
    object: "conversation" as const,
    id: c.id,
    channel_id: c.channel_id,
    contact_id: c.contact_id,
    assigned_to: c.assigned_to,
    status: c.status,
    last_message_at: c.last_message_at,
    last_inbound_at: c.last_inbound_at,
    snooze_until: c.snooze_until,
    created_at: c.created_at,
  };
}

export function shapeMessage(m: {
  id: string;
  conversation_id: string;
  direction: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  sender_type: string | null;
  status: string;
  wa_message_id: string | null;
  ig_message_id: string | null;
  telegram_message_id: string | null;
  is_internal_note: boolean | null;
  metadata: unknown;
  created_at: string;
}) {
  return {
    object: "message" as const,
    id: m.id,
    conversation_id: m.conversation_id,
    direction: m.direction,
    content: m.content,
    media_url: m.media_url,
    media_type: m.media_type,
    sender_type: m.sender_type,
    status: m.status,
    provider_message_id:
      m.wa_message_id ?? m.ig_message_id ?? m.telegram_message_id ?? null,
    is_internal_note: m.is_internal_note ?? false,
    metadata: m.metadata,
    created_at: m.created_at,
  };
}

export function shapeChannel(ch: {
  id: string;
  type: string;
  name: string;
  active: boolean;
  created_at: string;
}) {
  return {
    object: "channel" as const,
    id: ch.id,
    type: ch.type,
    name: ch.name,
    active: ch.active,
    created_at: ch.created_at,
  };
}

export function shapeBot(b: {
  id: string;
  name: string;
  objective: string;
  active: boolean;
  knowledge_threshold: number;
  language: string;
  created_at: string;
}) {
  return {
    object: "bot" as const,
    id: b.id,
    name: b.name,
    objective: b.objective,
    active: b.active,
    knowledge_threshold: b.knowledge_threshold,
    language: b.language,
    created_at: b.created_at,
  };
}

export function shapeTemplate(t: {
  id: string;
  channel_id: string | null;
  name: string;
  language: string;
  category: string;
  meta_status: string;
  components: unknown;
  created_at: string;
}) {
  return {
    object: "template" as const,
    id: t.id,
    channel_id: t.channel_id,
    name: t.name,
    language: t.language,
    category: t.category,
    meta_status: t.meta_status,
    components: t.components,
    created_at: t.created_at,
  };
}

export function shapeBroadcast(b: {
  id: string;
  channel_id: string | null;
  template_id: string | null;
  name: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  total_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
}) {
  return {
    object: "broadcast" as const,
    id: b.id,
    channel_id: b.channel_id,
    template_id: b.template_id,
    name: b.name,
    status: b.status,
    scheduled_at: b.scheduled_at,
    started_at: b.started_at,
    finished_at: b.finished_at,
    total_count: b.total_count,
    sent_count: b.sent_count,
    failed_count: b.failed_count,
    created_at: b.created_at,
  };
}

export function shapeOutcome(o: {
  id: string;
  bot_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  type: string;
  payload: unknown;
  created_at: string;
}) {
  return {
    object: "outcome" as const,
    id: o.id,
    bot_id: o.bot_id,
    conversation_id: o.conversation_id,
    contact_id: o.contact_id,
    type: o.type,
    payload: o.payload,
    created_at: o.created_at,
  };
}

export function shapeWebhookEndpoint(e: {
  id: string;
  name: string | null;
  url: string;
  events: string[];
  active: boolean;
  source: string;
  consecutive_failures: number;
  last_success_at: string | null;
  created_at: string;
}) {
  return {
    object: "webhook_endpoint" as const,
    id: e.id,
    name: e.name,
    url: e.url,
    events: e.events,
    active: e.active,
    source: e.source,
    consecutive_failures: e.consecutive_failures,
    last_success_at: e.last_success_at,
    created_at: e.created_at,
  };
}

export function shapeDelivery(d: {
  id: string;
  webhook_endpoint_id: string;
  event_type: string;
  event_id: string;
  attempt: number;
  status: string;
  response_status: number | null;
  response_body_excerpt: string | null;
  next_retry_at: string | null;
  delivered_at: string | null;
  created_at: string;
}) {
  return {
    object: "webhook_delivery" as const,
    id: d.id,
    webhook_endpoint_id: d.webhook_endpoint_id,
    event_type: d.event_type,
    event_id: d.event_id,
    attempt: d.attempt,
    status: d.status,
    response_status: d.response_status,
    response_body_excerpt: d.response_body_excerpt,
    next_retry_at: d.next_retry_at,
    delivered_at: d.delivered_at,
    created_at: d.created_at,
  };
}
