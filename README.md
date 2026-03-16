# Omnichannel Communication Platform

A scalable, multi-tenant SaaS platform for managing customer conversations across multiple channels — WhatsApp, web chat, email, SMS, and more — with AI-powered chatbots, workflow automation, and real-time messaging.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                │
│  React + Tailwind CSS + Zustand + Socket.io Client  │
└──────────────────────┬──────────────────────────────┘
                       │  REST API / WebSocket
┌──────────────────────▼──────────────────────────────┐
│                Backend (Express + TypeScript)        │
│  JWT Auth │ RBAC │ Rate Limiting │ Helmet           │
├─────────────────────────────────────────────────────┤
│  Modules:                                           │
│  ├── Auth (register, login, JWT)                    │
│  ├── Conversations (CRUD, messages, assignment)     │
│  ├── Contacts (CRUD, tags, lead status)             │
│  ├── Channels (WhatsApp, webchat, email, etc.)      │
│  ├── Teams (CRUD, member management)                │
│  ├── Analytics (overview, channels, agents, leads)  │
│  ├── Chatbot (OpenAI, knowledge docs, escalation)   │
│  └── Automation (triggers, conditions, actions)     │
├─────────────────────────────────────────────────────┤
│  WebSocket (Socket.io) — real-time messaging        │
│  Webhooks — WhatsApp / Webchat inbound              │
└──────────┬──────────────────┬───────────────────────┘
           │                  │
    ┌──────▼──────┐    ┌──────▼──────┐
    │ PostgreSQL  │    │    Redis    │
    │  (primary)  │    │   (cache)   │
    └─────────────┘    └─────────────┘
```

## Tech Stack

| Layer      | Technology                                          |
|------------|-----------------------------------------------------|
| Frontend   | Next.js 14, React 18, Tailwind CSS, Zustand, Axios  |
| Backend    | Node.js, Express, TypeScript                        |
| Database   | PostgreSQL (node-postgres), Drizzle ORM              |
| Cache      | Redis                                                |
| Real-time  | Socket.io                                            |
| AI         | OpenAI API (GPT-4o)                                  |
| Auth       | JWT (bcrypt + jsonwebtoken)                          |
| Logging    | Pino                                                 |

## Prerequisites

- **Node.js** >= 18.x
- **PostgreSQL** >= 14
- **Redis** >= 7
- **npm** or **yarn**

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd omnichannel-platform
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env   # edit with your credentials
npm install
npm run dev
```

#### Backend Environment Variables (`.env`)

```env
PORT=4000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/omnichannel
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=7d
CORS_ORIGINS=http://localhost:3000

# WhatsApp (Meta Business API)
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_API_TOKEN=your-whatsapp-token
WHATSAPP_VERIFY_TOKEN=your-webhook-verify-token
WHATSAPP_APP_SECRET=your-app-secret

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

### 3. Database Setup

Create the PostgreSQL database:

```bash
createdb omnichannel
```

Run the schema (the SQL migration is in `backend/src/database/schema.ts`):

```bash
npm run db:migrate   # or apply schema manually
```

### 4. Frontend Setup

```bash
cd frontend
cp .env.example .env.local   # edit if needed
npm install
npm run dev
```

The frontend runs at **http://localhost:3000** and proxies API requests to **http://localhost:4000**.

#### Frontend Environment Variables (`.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

## Project Structure

```
omnichannel-platform/
├── backend/
│   ├── src/
│   │   ├── config/          # env, database, redis
│   │   ├── database/        # schema (Drizzle ORM)
│   │   ├── middleware/       # auth, authorize, validate
│   │   ├── modules/
│   │   │   ├── auth/        # register, login
│   │   │   ├── conversations/
│   │   │   ├── contacts/
│   │   │   ├── channels/    # CRUD + WhatsApp service + webhooks
│   │   │   ├── teams/
│   │   │   ├── analytics/
│   │   │   ├── chatbot/     # OpenAI integration
│   │   │   └── automation/  # workflow engine
│   │   ├── utils/           # logger
│   │   ├── websocket/       # Socket.io server
│   │   └── server.ts        # entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── auth/        # login / register
│   │   │   └── (dashboard)/ # protected pages
│   │   │       ├── inbox/
│   │   │       ├── contacts/
│   │   │       ├── analytics/
│   │   │       ├── teams/
│   │   │       ├── chatbot/
│   │   │       ├── automation/
│   │   │       ├── integrations/
│   │   │       └── settings/
│   │   ├── components/layout/  # Sidebar
│   │   ├── hooks/              # useSocket
│   │   ├── lib/                # utils
│   │   ├── services/           # API client (axios)
│   │   ├── stores/             # Zustand (auth)
│   │   ├── styles/             # globals.css
│   │   └── types/              # TypeScript interfaces
│   ├── package.json
│   ├── tailwind.config.ts
│   └── next.config.js
└── README.md
```

## Features

### Multi-Channel Messaging
- WhatsApp Business API (send/receive, media, webhooks)
- Web Chat widget integration
- Email, SMS, Telegram, Facebook, Instagram, VoIP (channel framework ready)

### Real-Time Communication
- WebSocket-based instant message delivery
- Typing indicators and presence tracking
- Live conversation updates across agents

### AI Chatbot
- OpenAI GPT integration for automated responses
- Knowledge base document management
- Configurable escalation to human agents
- Multi-language support

### Automation Engine
- Trigger-based workflow execution (new message, new conversation, status change, etc.)
- Conditional branching (contains, equals, regex matching)
- Actions: auto-reply, assign agent, change status, add tags, send notifications

### Analytics Dashboard
- Conversation volume by channel
- Agent performance metrics
- Lead status distribution
- Real-time overview statistics

### Multi-Tenant & RBAC
- Tenant isolation via `tenantId` on every query
- Role-based access: **admin**, **manager**, **agent**, **viewer**
- Route-level authorization middleware

## API Endpoints

| Method | Endpoint                            | Description                |
|--------|-------------------------------------|----------------------------|
| POST   | /api/v1/auth/register               | Register new user          |
| POST   | /api/v1/auth/login                  | Login                      |
| GET    | /api/v1/conversations               | List conversations         |
| POST   | /api/v1/conversations               | Create conversation        |
| POST   | /api/v1/conversations/:id/messages  | Send message               |
| GET    | /api/v1/contacts                    | List contacts              |
| POST   | /api/v1/contacts                    | Create contact             |
| GET    | /api/v1/channels                    | List channels              |
| GET    | /api/v1/teams                       | List teams                 |
| GET    | /api/v1/analytics/overview          | Dashboard stats            |
| GET    | /api/v1/chatbots                    | List chatbot configs       |
| POST   | /api/v1/chatbots/:id/test           | Test chatbot response      |
| GET    | /api/v1/automations                 | List automation workflows  |

## Scripts

### Backend
```bash
npm run dev       # Start dev server with ts-node-dev
npm run build     # Compile TypeScript
npm start         # Run compiled JS
npm run db:migrate # Run database migrations
```

### Frontend
```bash
npm run dev       # Start Next.js dev server
npm run build     # Build for production
npm start         # Start production server
npm run lint      # ESLint
```

## License

MIT
