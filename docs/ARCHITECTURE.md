# OmniChannel Platform — System Architecture

## Overview

A multi-tenant SaaS omnichannel communication platform with AI chatbot capabilities, automation workflows, CRM, VoIP, and team collaboration.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Web App  │  │ Mobile Apps  │  │ Webchat  │  │ External APIs  │  │
│  │ (Next.js)│  │(React Native)│  │ Widget   │  │ (WhatsApp etc) │  │
│  └────┬─────┘  └──────┬───────┘  └────┬─────┘  └───────┬────────┘  │
│       │               │               │                │            │
└───────┼───────────────┼───────────────┼────────────────┼────────────┘
        │               │               │                │
        ▼               ▼               ▼                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      API GATEWAY / LOAD BALANCER                     │
│                    (Nginx / AWS ALB / Cloudflare)                     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐  ┌────────────────────┐  ┌────────────────────────┐
│  REST API     │  │  WebSocket Server  │  │  Webhook Receiver      │
│  Service      │  │  (Socket.io)       │  │  (Channel Integrations)│
│  (Express.js) │  │                    │  │                        │
└───────┬───────┘  └────────┬───────────┘  └───────────┬────────────┘
        │                   │                          │
        ▼                   ▼                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER                                   │
│                                                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │ Auth Service │ │ Conversation │ │ AI Chatbot   │ │ Automation │  │
│  │              │ │ Service      │ │ Service      │ │ Engine     │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
│                                                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │ CRM Service  │ │ Channel      │ │ VoIP Service │ │ Notifica-  │  │
│  │              │ │ Router       │ │ (SIP/WebRTC) │ │ tion Svc   │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
│                                                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                  │
│  │ Team Service │ │ Analytics    │ │ Knowledge    │                  │
│  │              │ │ Service      │ │ Base Service │                  │
│  └──────────────┘ └──────────────┘ └──────────────┘                  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐  ┌────────────────────┐  ┌────────────────────────┐
│  PostgreSQL   │  │  Redis             │  │  Object Storage        │
│  (Primary DB) │  │  (Cache/PubSub/    │  │  (S3 / MinIO)          │
│               │  │   Queue/Sessions)  │  │  Files & Media         │
└───────────────┘  └────────────────────┘  └────────────────────────┘
                                │
                   ┌────────────┼────────────┐
                   ▼                         ▼
          ┌────────────────┐      ┌────────────────────┐
          │  Bull MQ       │      │  OpenAI API        │
          │  (Job Queue)   │      │  (LLM Provider)    │
          └────────────────┘      └────────────────────┘
```

---

## Multi-Tenant Data Isolation

Every database table includes a `tenant_id` column. Row-Level Security (RLS) policies in PostgreSQL enforce data isolation at the database level.

```
Tenant A ──► tenant_id = "uuid-a" ──► sees only their data
Tenant B ──► tenant_id = "uuid-b" ──► sees only their data
```

---

## Service Descriptions

### REST API Service
- Express.js with TypeScript
- Handles all CRUD operations
- JWT-based authentication
- Rate limiting, validation, error handling

### WebSocket Server
- Socket.io for real-time bidirectional communication
- Authenticated connections tied to tenant + user
- Rooms per conversation for live updates
- Typing indicators, presence, message delivery status

### Webhook Receiver
- Receives inbound messages from external channels (WhatsApp, Telegram, etc.)
- Validates signatures, normalizes payloads
- Routes to Channel Router service

### Auth Service
- JWT access + refresh tokens
- Role-based access control (Admin, Manager, Agent, Viewer)
- Tenant-scoped permissions
- OAuth2 support for future SSO

### Conversation Service
- Manages conversations lifecycle (open → pending → closed)
- Message storage with full history
- Assignment, tagging, internal notes
- Supports all channel types with normalized message format

### AI Chatbot Service
- OpenAI API integration (GPT-4)
- RAG pipeline: embeddings + vector search over knowledge base
- Company-specific system prompts and rules
- Language detection and multi-language support
- Human escalation logic

### Automation Engine
- Trigger → Condition → Action workflow execution
- Event-driven via Redis pub/sub
- Supports time-based, message-based, and status-based triggers
- Extensible action types (send message, assign, tag, webhook, etc.)

### CRM Service
- Auto-creates contact profiles from conversations
- Contact enrichment, tagging, lead status
- Linked conversation history
- Import/export capabilities

### Channel Router
- Normalizes inbound messages from any channel into a unified format
- Routes outbound messages to the correct channel API
- Manages channel credentials per tenant

### VoIP Service
- SIP integration via WebRTC
- Call recording stored in object storage
- Voicemail with transcription
- AI voice assistant capability

### Notification Service
- Push notifications (Firebase Cloud Messaging)
- Desktop notifications (Web Push API)
- Email alerts (SendGrid / AWS SES)
- Per-user notification preferences

### Knowledge Base Service
- Document ingestion (PDF, DOCX, TXT, URLs)
- Text extraction and chunking
- Embedding generation (OpenAI embeddings)
- Vector storage for RAG retrieval

### Analytics Service
- Conversation metrics (response time, resolution time)
- Agent performance
- Channel distribution
- AI chatbot accuracy metrics

---

## Security Architecture

1. **Authentication**: JWT with short-lived access tokens + refresh tokens
2. **Authorization**: RBAC with tenant-scoped roles
3. **Encryption**: TLS in transit, AES-256 at rest for sensitive fields
4. **API Security**: Rate limiting, CORS, CSRF protection, input validation
5. **Multi-tenancy**: PostgreSQL RLS policies, tenant_id on every query
6. **Secrets**: Environment variables, never committed to source control

---

## Scalability Strategy

- **Horizontal scaling**: Stateless API servers behind load balancer
- **WebSocket scaling**: Redis adapter for Socket.io across multiple nodes
- **Background jobs**: BullMQ with Redis for async processing
- **Database**: Connection pooling, read replicas, table partitioning
- **Caching**: Redis for sessions, frequent queries, rate limiting
- **CDN**: Static assets and media served via CDN

---

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│              Cloud Provider              │
│                                          │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │ CDN      │  │ Load Balancer        │ │
│  └──────────┘  └──────────┬───────────┘ │
│                           │              │
│  ┌──────────────────────────────────┐   │
│  │  Container Orchestration (K8s)   │   │
│  │                                  │   │
│  │  ┌────────┐ ┌────────┐ ┌──────┐│   │
│  │  │API x3  │ │WS x2   │ │Jobs  ││   │
│  │  └────────┘ └────────┘ └──────┘│   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │PostgreSQL│ │Redis │ │ S3 Storage │  │
│  │ (RDS)    │ │Cluster│ │            │  │
│  └──────────┘ └──────┘ └────────────┘  │
└─────────────────────────────────────────┘
```
