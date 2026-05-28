// Hand-maintained OpenAPI 3.1 spec for the public REST API.
//
// Connectors (Make / Zapier / n8n) introspect this. The CLAUDE rule for
// this file: when you add or change a route in app/api/v1/**, update the
// spec here in the same commit. CI doesn't yet enforce parity — that
// lands during the debug-phase pre-launch sweep.

export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Xyra Chat REST API",
    version: "1.0.0",
    description:
      "Programmatic access to inboxes, contacts, messages, bots, broadcasts, automations and outbound event webhooks.",
    contact: { name: "Xyra Chat", url: "https://xyrachat.com" },
  },
  servers: [
    { url: "https://xyra-chat.vercel.app/api/v1", description: "Production" },
  ],
  components: {
    securitySchemes: {
      bearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "xyra_live_<token>",
        description:
          "API key. Send as `Authorization: Bearer xyra_live_<token>`.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["type", "code", "message"],
            properties: {
              type: {
                type: "string",
                enum: [
                  "invalid_request",
                  "unauthorized",
                  "forbidden",
                  "not_found",
                  "conflict",
                  "unprocessable",
                  "rate_limited",
                  "internal",
                ],
              },
              code: { type: "string" },
              message: { type: "string" },
              param: { type: "string", nullable: true },
            },
          },
        },
      },
      Contact: {
        type: "object",
        properties: {
          object: { type: "string", enum: ["contact"] },
          id: { type: "string" },
          name: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          instagram_id: { type: "string", nullable: true },
          telegram_id: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" } },
          notes: { type: "string", nullable: true },
          opted_out: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Conversation: {
        type: "object",
        properties: {
          object: { type: "string", enum: ["conversation"] },
          id: { type: "string" },
          channel_id: { type: "string" },
          contact_id: { type: "string" },
          assigned_to: { type: "string", nullable: true },
          status: { type: "string", enum: ["open", "closed", "snoozed", "bot"] },
          last_message_at: { type: "string", format: "date-time" },
          last_inbound_at: { type: "string", format: "date-time", nullable: true },
          snooze_until: { type: "string", format: "date-time", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Message: {
        type: "object",
        properties: {
          object: { type: "string", enum: ["message"] },
          id: { type: "string" },
          conversation_id: { type: "string" },
          direction: { type: "string", enum: ["inbound", "outbound"] },
          content: { type: "string", nullable: true },
          media_url: { type: "string", nullable: true },
          media_type: { type: "string", nullable: true },
          sender_type: { type: "string", nullable: true, enum: ["contact", "agent", "bot", null] },
          status: { type: "string", enum: ["sent", "delivered", "read", "failed"] },
          provider_message_id: { type: "string", nullable: true },
          is_internal_note: { type: "boolean" },
          metadata: { type: "object" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Channel: {
        type: "object",
        properties: {
          object: { type: "string", enum: ["channel"] },
          id: { type: "string" },
          type: { type: "string", enum: ["whatsapp", "instagram", "telegram", "email", "facebook"] },
          name: { type: "string" },
          active: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      List: {
        type: "object",
        properties: {
          object: { type: "string", enum: ["list"] },
          data: { type: "array", items: {} },
          has_more: { type: "boolean" },
          next_cursor: { type: "string", nullable: true },
        },
      },
    },
  },
  security: [{ bearer: [] }],
  paths: {
    "/me": {
      get: {
        summary: "Whoami",
        description: "Returns the API key context (org_id, name, scopes).",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    object: { type: "string", enum: ["api_key"] },
                    id: { type: "string" },
                    org_id: { type: "string" },
                    name: { type: "string" },
                    scopes: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/contacts": {
      get: {
        summary: "List contacts",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/List" } } } } },
      },
      post: {
        summary: "Create or upsert a contact",
        description:
          "Upserts on any matching identifier (phone, email, instagram_id, telegram_id). Honors `Idempotency-Key`.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  phone: { type: "string" },
                  email: { type: "string" },
                  instagram_id: { type: "string" },
                  telegram_id: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Contact" } } } },
          "200": { description: "Existing match — updated.", content: { "application/json": { schema: { $ref: "#/components/schemas/Contact" } } } },
        },
      },
    },
    "/contacts/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: { summary: "Get a contact", responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Contact" } } } } } },
      patch: { summary: "Update a contact" },
      delete: { summary: "Soft-delete a contact", responses: { "204": { description: "Deleted" } } },
    },
    "/contacts/{id}/tags": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        summary: "Add tags",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { tag: { type: "string" }, tags: { type: "array", items: { type: "string" } } } } } },
        },
      },
    },
    "/contacts/{id}/tags/{tag}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "tag", in: "path", required: true, schema: { type: "string" } },
      ],
      delete: { summary: "Remove a tag", responses: { "204": { description: "Removed" } } },
    },
    "/contacts/{id}/opt_out": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: { summary: "Mark contact as opted out" },
    },
    "/conversations": {
      get: {
        summary: "List conversations",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["open", "closed", "snoozed", "bot"] } },
          { name: "channel_id", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/List" } } } } },
      },
    },
    "/conversations/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: { summary: "Get a conversation" },
      patch: {
        summary: "Update status / assigned_to / snooze_until",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, assigned_to: { type: "string", nullable: true }, snooze_until: { type: "string", format: "date-time", nullable: true } } } } },
        },
      },
    },
    "/conversations/{id}/close": { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], post: { summary: "Close" } },
    "/conversations/{id}/assign": { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], post: { summary: "Assign to agent (or null to unassign)" } },
    "/conversations/{id}/transfer_to_bot": { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], post: { summary: "Hand the thread back to the bot" } },
    "/conversations/{id}/messages": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: { summary: "List messages in a conversation" },
    },
    "/messages": {
      post: {
        summary: "Send a message",
        description:
          "Sends via the conversation's channel. Honors the WhatsApp 24h customer-service window — returns 422 if the window is closed and `type=text` was requested.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["conversation_id"],
                properties: {
                  conversation_id: { type: "string" },
                  content: { type: "string" },
                  type: { type: "string", enum: ["text", "template", "image"], default: "text" },
                  template: { type: "object", properties: { name: { type: "string" }, language: { type: "string" }, components: { type: "array", items: {} } } },
                  media: { type: "object", properties: { url: { type: "string" } } },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Sent", content: { "application/json": { schema: { $ref: "#/components/schemas/Message" } } } } },
      },
    },
    "/channels": { get: { summary: "List channels" } },
    "/channels/{id}": { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], get: { summary: "Get a channel" } },
    "/templates": { get: { summary: "List approved WA templates" } },
    "/bots": { get: { summary: "List bots" } },
    "/bots/{id}/handoff": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        summary: "Trigger a bot handoff",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["conversation_id"], properties: { conversation_id: { type: "string" }, reason: { type: "string" } } } } },
        },
      },
    },
    "/broadcasts": {
      get: { summary: "List broadcasts" },
      post: {
        summary: "Create a broadcast draft",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name", "channel_id", "template_id"], properties: { name: { type: "string" }, channel_id: { type: "string" }, template_id: { type: "string" }, variable_mapping: { type: "object" }, audience_filter: { type: "object" }, scheduled_at: { type: "string", format: "date-time", nullable: true } } } } },
        },
      },
    },
    "/broadcasts/{id}/launch": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: { summary: "Launch a draft broadcast" },
    },
    "/automations/{id}/run": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        summary: "Manually run an automation against a contact",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["contact_id"], properties: { contact_id: { type: "string" }, trigger_data: { type: "object" } } } } },
        },
      },
    },
    "/outcomes": {
      get: {
        summary: "List bot outcomes (lead_captured, handoff, qualified, etc.)",
        parameters: [
          { name: "bot_id", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
      },
    },
    "/webhooks": { get: { summary: "List webhook endpoints" } },
    "/webhooks/subscribe": {
      post: {
        summary: "Create a webhook subscription",
        description:
          "Used by Make/Zapier/n8n connectors. Returns the signing `secret` ONCE.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["url", "events"], properties: { url: { type: "string" }, events: { type: "array", items: { type: "string" } }, filters: { type: "object" }, label: { type: "string" } } } } },
        },
      },
    },
    "/webhooks/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      delete: { summary: "Unsubscribe (soft-delete)" },
    },
    "/webhooks/{id}/deliveries": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: { summary: "List deliveries for an endpoint" },
    },
  },
} as const;
