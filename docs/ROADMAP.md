# Xyra Omnichannel Platform — Development Roadmap

> Last updated: March 2026

---

## ✅ Completed (Current State)

### Backend
- [x] Multi-tenant architecture with JWT auth (access + refresh tokens)
- [x] PostgreSQL database with full schema (conversations, messages, contacts, channels, teams, chatbots, automations, analytics)
- [x] Redis for session/cache support
- [x] WebSocket (Socket.IO) for real-time messaging
- [x] **WhatsApp Cloud API** — inbound webhooks, outbound text/media, message status tracking, **template messages**, **list templates**
- [x] **Telegram Bot API** — inbound webhooks, outbound text, **auto-register webhook on channel create**, **re-register webhook endpoint**, multi-bot support (matched by bot token)
- [x] **Instagram Messenger API** — inbound/outbound, signature validation
- [x] **Facebook Messenger API** — inbound/outbound, signature validation
- [x] **Webchat** — embedded widget channel support
- [x] Conversations service — list, get, create, status update, assign, send message, notes, tags
- [x] Outbound message routing (sends to correct external channel based on conversation)
- [x] Message delivery status tracking (sent → delivered)
- [x] Contacts CRUD with channel identifiers
- [x] Teams management with member assignment
- [x] Chatbot service with OpenAI integration (GPT-4o), knowledge base documents
- [x] Automation workflows with triggers (message received, conversation opened/closed, contact created) and actions (send message, assign agent, add tag, send webhook, wait)
- [x] Analytics endpoints (overview, channels, timeline, agents, leads)
- [x] Role-based access control (admin, manager, agent, viewer)
- [x] Error handling middleware, request validation, structured logging

### Frontend
- [x] Next.js 14 App Router with TypeScript
- [x] Tailwind CSS design system with custom brand colors
- [x] Auth page (login/register) with JWT token management + auto-refresh
- [x] Dashboard layout with sidebar navigation
- [x] **Inbox** — real-time conversation list, message thread, optimistic UI, typing indicator, message status (sent/delivered/read), file attachment preview, **WhatsApp template send modal**
- [x] **Integrations** — channel configuration for WhatsApp (with businessAccountId), Telegram, Instagram, Facebook, Webchat; setup guides; webhook URL display; **Telegram re-register webhook button**
- [x] **Contacts** — list, create, edit, delete, lead status management
- [x] **Chatbot** — create/edit bots, knowledge base document management, test chat
- [x] **Automation** — workflow builder with trigger/action configuration
- [x] **Teams** — team management, member assignment
- [x] **Analytics** — overview stats, channel breakdown, conversation timeline, agent performance
- [x] **Settings** — account/profile settings page
- [x] Reusable UI components (Button, Badge, Modal, Input, DataTable, StatCard, Toast, Skeleton, EmptyState, FilterBar, PageHeader)
- [x] Socket.IO client hook for real-time updates
- [x] Zustand auth store

---

## 🚧 In Progress / Next Up

### Phase 1 — Polish & Stability (Short Term)

#### Backend
- [ ] **Message read receipts** — mark messages as read when agent opens conversation; send read receipt back to WhatsApp/Telegram
- [ ] **WhatsApp media download** — resolve media IDs to actual URLs via Graph API before storing
- [ ] **Conversation search** — full-text search across messages and contact names
- [ ] **Pagination cursor** — switch from offset to cursor-based pagination for conversations
- [ ] **Rate limiting** — per-tenant API rate limits to prevent abuse
- [ ] **Webhook retry queue** — retry failed outbound messages with exponential backoff (Bull/BullMQ)
- [ ] **File upload endpoint** — `/api/v1/uploads` for agent-sent media (S3/Cloudflare R2)
- [ ] **Email channel** — SMTP/IMAP integration (Nodemailer + IMAP)
- [ ] **Notification service** — in-app notifications for new conversations, assignments

#### Frontend
- [ ] **Conversation detail panel** — right sidebar with contact info, tags, notes, assignment controls
- [ ] **Assign conversation UI** — dropdown to assign to agent or team from inbox
- [ ] **Close/reopen conversation** — status change buttons in inbox header
- [ ] **Internal notes** — tab in conversation to add/view private agent notes
- [ ] **Contact detail page** — full contact profile with conversation history
- [ ] **Unread message count** — badge on sidebar inbox link
- [ ] **Notification bell** — real-time notification dropdown
- [ ] **Mobile responsive** — improve layout for tablet/mobile

---

### Phase 2 — Advanced Features (Medium Term)

#### Channels
- [ ] **VoIP / Click-to-call** — Twilio Voice or Vonage integration
- [ ] **SMS channel** — Twilio SMS inbound/outbound
- [ ] **Email channel UI** — compose, reply, thread view
- [ ] **WhatsApp interactive messages** — buttons, list messages, quick replies
- [ ] **Telegram inline keyboards** — button support in bot replies

#### Chatbot & AI
- [ ] **Visual flow builder** — drag-and-drop chatbot flow editor (React Flow)
- [ ] **Intent detection** — classify user intent before routing to bot/agent
- [ ] **Sentiment analysis** — flag negative sentiment conversations for priority
- [ ] **AI suggested replies** — GPT-powered reply suggestions for agents
- [ ] **Auto-summarize** — summarize long conversations for agent handoff
- [ ] **Multi-language support** — auto-detect and respond in contact's language

#### Automation
- [ ] **SLA rules** — auto-escalate conversations that breach response time SLA
- [ ] **Business hours** — auto-reply outside business hours
- [ ] **Round-robin assignment** — auto-assign conversations to available agents
- [ ] **Canned responses** — pre-written reply templates for agents

#### Analytics
- [ ] **Custom date range** — filter analytics by custom date range
- [ ] **Export reports** — CSV/PDF export of analytics data
- [ ] **CSAT surveys** — post-conversation satisfaction surveys
- [ ] **Heatmap** — conversation volume by hour/day

---

### Phase 3 — Enterprise & Scale (Long Term)

- [ ] **Multi-language UI** — i18n support (English, Spanish, Portuguese, Arabic)
- [ ] **White-label** — custom branding per tenant (logo, colors, domain)
- [ ] **SSO / SAML** — enterprise single sign-on
- [ ] **Audit logs** — full audit trail of agent actions
- [ ] **Data retention policies** — configurable message retention per tenant
- [ ] **Webhooks (outbound)** — tenant-configurable webhooks for external integrations
- [ ] **Public API** — documented REST API for third-party integrations
- [ ] **Mobile app** — React Native agent app (iOS + Android)
- [ ] **Kubernetes deployment** — Helm charts for scalable cloud deployment
- [ ] **Multi-region** — data residency options (EU, US, LATAM)

---

## 🐛 Known Issues / Tech Debt

| Issue | Priority | Notes |
|-------|----------|-------|
| WhatsApp media IDs not resolved to URLs | High | Need to call Graph API `/media/{id}` to get download URL |
| Telegram webhook can't auto-register in local dev | Medium | Use `POST /channels/:id/register-webhook` with ngrok URL |
| No message deduplication on webhook retry | Medium | Add `channel_message_id` unique constraint check |
| Analytics queries not indexed | Medium | Add DB indexes on `created_at`, `tenant_id`, `status` |
| No CSRF protection on webhook endpoints | Low | Webhooks use signature validation instead |
| Frontend has no error boundary | Low | Add React error boundaries to prevent full-page crashes |
| `Image` component not used (using `<img>`) | Low | Replace with Next.js `<Image>` for optimization |

---

## 🏗️ Architecture Notes

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Zustand, Socket.IO client |
| Backend | Node.js, Express, TypeScript, Socket.IO |
| Database | PostgreSQL (via `pg` pool) |
| Cache | Redis |
| AI | OpenAI GPT-4o |
| Channels | WhatsApp Cloud API, Telegram Bot API, Meta Graph API |
| Auth | JWT (access 15min + refresh 7d) |
| Deployment | PM2 / Docker (production) |

### Key Design Decisions
- **Multi-tenancy**: All tables have `tenant_id` — complete data isolation per organization
- **Channel abstraction**: `NormalizedMessage` interface normalizes all channel messages to a common format before processing
- **Outbound routing**: `ConversationsService.routeOutboundMessage()` dispatches to the correct channel service based on `channel_type`
- **Bot-first**: New conversations start with `is_bot_active = true`; bot handles until a human agent takes over
- **Optimistic UI**: Messages appear instantly in the inbox before server confirmation

---

## 📋 Immediate Next Steps (This Sprint)

1. **Message read receipts** — mark as read on conversation open, send back to WhatsApp
2. **Conversation detail sidebar** — contact info, assign, close/reopen, tags, notes
3. **WhatsApp media URL resolution** — download media from Graph API
4. **Unread count badge** — show unread message count on inbox sidebar link
5. **File upload endpoint** — allow agents to send images/documents
