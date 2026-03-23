# XyraChat - Complete Architecture & Operations Guide

## 🏗️ Project Overview

XyraChat is an omnichannel communication platform that consolidates messaging from Telegram, WhatsApp, Instagram, Facebook, and Web Chat into a single unified inbox. The platform enables businesses to manage customer conversations across multiple channels with real-time messaging, automation, and team collaboration.

### Key Features
- **Multi-channel messaging**: Telegram, WhatsApp, Instagram, Facebook, Web Chat
- **Real-time inbox**: WebSocket-powered live updates
- **Team collaboration**: Assignment, notes, internal tags
- **Automation**: Chatbot and workflow triggers
- **Analytics**: Conversation metrics and reporting

---

## 🏛️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   External APIs │
│   (Next.js)     │◄──►│   (Express.js)  │◄──►│  (Telegram,     │
│   Vercel Host   │    │   homeserver     │    │   WhatsApp,     │
│   xyra.chat     │    │   Port 4000     │    │   Meta APIs)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser       │    │   PostgreSQL    │    │   Redis         │
│   WebSocket     │    │   Database      │    │   Cache/Sessions│
│   Socket.io     │    │   Port 5432     │    │   Port 6379     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 🌐 Network Infrastructure

### Domains & DNS
- **Frontend**: `https://xyra.chat` (Vercel)
- **Backend API**: `https://api.xyra.chat` (homeserver via nginx)
- **WebSocket**: `wss://api.xyra.chat` (same domain as API)

### Server Setup (`homeserver`)
- **IP**: `100.64.71.47` (WAN) / `192.168.1.11` (LAN)
- **OS**: Ubuntu (managed via SSH)
- **Reverse Proxy**: nginx with SSL (Let's Encrypt)

### Port Forwarding & Proxy Configuration
```
External 443 (HTTPS) → nginx (443) → backend (4000)
External 80 (HTTP) → nginx (80) → backend (4000)
```

nginx config location: `/etc/nginx/sites-available/xyra.chat`

---

## 🗄️ Database & Storage

### PostgreSQL Database
- **Host**: `localhost:5432`
- **Database**: `xyrachat`
- **User**: `xyrachat`
- **Password**: `xyrachat123`
- **Connection**: Via `pg` npm package
- **Migrations**: Run via `npm run migrate` (SQL scripts in `backend/src/database/migrate.ts`)

### Key Tables
```sql
- tenants (multi-tenant architecture)
- users (authentication, roles)
- channels (Telegram, WhatsApp, etc. configurations)
- contacts (customer profiles with channel identifiers)
- conversations (thread between contact and tenant)
- messages (individual messages across all channels)
- internal_notes (team collaboration)
- conversation_tags (categorization)
```

### Redis Cache
- **Host**: `localhost:6379`
- **Purpose**: Session storage, WebSocket state, caching
- **Connection**: Via `ioredis` npm package

---

## 🔐 Authentication & Security

### JWT Token Flow
1. **Login**: Email/password → JWT access (15min) + refresh (7d) tokens
2. **Storage**: Tokens in localStorage (frontend)
3. **Refresh**: Automatic on 401 responses via axios interceptor
4. **WebSocket**: Auth via token in socket connection

### CORS Configuration
```javascript
Frontend origins: ['https://xyra.chat', 'https://www.xyra.chat']
Backend API: 'https://api.xyra.chat/api/v1'
```

### Rate Limiting
- **API Routes**: 100 requests/15min per user
- **Webhook Routes**: No rate limiting (exempt for external services)

---

## 📡 Channel Integrations

### Webhook Architecture
```
External Platform → Webhook URL → Backend → Database → WebSocket → Frontend
```

### Webhook URLs
- **Telegram**: `https://api.xyra.chat/api/v1/webhooks/telegram`
- **WhatsApp**: `https://api.xyra.chat/api/v1/webhooks/whatsapp`
- **Instagram**: `https://api.xyra.chat/api/v1/webhooks/instagram`
- **Facebook**: `https://api.xyra.chat/api/v1/webhooks/facebook`
- **Web Chat**: `https://api.xyra.chat/api/v1/webhooks/webchat`

### Channel Configuration Flow
1. **User adds channel** via frontend modal
2. **Credentials stored** encrypted in `channels.credentials` (JSONB)
3. **Webhook URL** provided to user for external platform setup
4. **Incoming messages** processed via webhook handlers
5. **Outbound messages** routed via channel services

### Channel Services
- `TelegramService`: Bot API calls, webhook validation
- `WhatsAppService`: Meta Cloud API, message templates
- `InstagramService`: Messenger API for Instagram
- `FacebookService`: Messenger API for Facebook

---

## 🔄 Real-time Communication

### WebSocket Events
```javascript
// Connection
socket.emit('join:conversation', conversationId)
socket.emit('leave:conversation', conversationId)

// Events
socket.on('message:new', callback)
socket.on('conversation:updated', callback)
socket.on('typing:start', callback)
socket.on('typing:stop', callback)
```

### Message Flow
1. **User sends message** → API call → Database
2. **Outbound routing** → Channel service → External API
3. **Status update** → Database → WebSocket event
4. **Real-time delivery** → All connected clients in conversation

---

## 🚀 Deployment Guide

### Frontend (Vercel)
```bash
# Repository: sjuniorm/xyrachat (main branch)
# Auto-deploys on every push to main
# Environment Variables (Vercel dashboard):
NEXT_PUBLIC_API_URL=https://api.xyra.chat/api/v1
NEXT_PUBLIC_WS_URL=https://api.xyra.chat
```

### Backend (homeserver) — managed with PM2
```bash
# Location: ~/xyrachat/backend
# Process Manager: PM2 (installed at ~/.local/bin/pm2)

# ── Start (first time only) ─────────────────────────────────────
cd ~/xyrachat/backend
~/.local/bin/pm2 start 'npx tsx src/server.ts' --name xyrachat-backend --log /tmp/xyrachat-backend.log
~/.local/bin/pm2 save

# ── Deploy update (pull + restart) ─────────────────────────────
cd ~/xyrachat && git pull origin main
~/.local/bin/pm2 restart xyrachat-backend

# ── Useful PM2 commands ─────────────────────────────────────────
~/.local/bin/pm2 status                    # check running status
~/.local/bin/pm2 logs xyrachat-backend     # live log stream
~/.local/bin/pm2 logs xyrachat-backend --lines 50  # last 50 lines
~/.local/bin/pm2 stop xyrachat-backend     # stop process
~/.local/bin/pm2 delete xyrachat-backend   # remove from PM2
~/.local/bin/pm2 save                      # persist process list across reboots
```

### Environment Variables (Backend `.env`)
```bash
# Core
NODE_ENV=production
PORT=4000
API_PREFIX=/api/v1

# Database
DATABASE_URL=postgresql://xyrachat:xyrachat123@localhost:5432/xyrachat

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=<your-secret>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# CORS
CORS_ORIGIN=https://xyra.chat,https://www.xyra.chat

# Channel APIs (optional, set per channel)
WHATSAPP_VERIFY_TOKEN=<custom-string>
TELEGRAM_SECRET_TOKEN=<optional>
```

---

## 🔧 Development Setup

### Prerequisites
```bash
# Node.js 18+
# PostgreSQL & Redis running locally
# Git access to repository
```

### Local Development
```bash
# Frontend
cd frontend
npm install
npm run dev  # http://localhost:3000

# Backend
cd backend
npm install
npm run dev  # http://localhost:4000

# Database
PGPASSWORD=xyrachat123 psql -U xyrachat -d xyrachat -h 127.0.0.1 -f src/database/migrate.sql
```

### Environment Files
```bash
# Frontend: .env.local
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_WS_URL=http://localhost:4000

# Backend: .env
DATABASE_URL=postgresql://xyrachat:xyrachat123@localhost:5432/xyrachat
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret
CORS_ORIGIN=http://localhost:3000
```

---

## 🛠️ Operations & Maintenance

### Daily Operations
1. **Monitor backend logs**: `ssh homeserver "~/.local/bin/pm2 logs xyrachat-backend --lines 50"`
2. **Check server status**: `curl https://api.xyra.chat/health`
3. **Database backups**: PostgreSQL pg_dump (automated via cron)
4. **SSL renewal**: Let's Encrypt auto-renews via certbot

### Common Issues & Solutions

#### Backend Not Responding
```bash
# Check PM2 status
ssh homeserver "~/.local/bin/pm2 status"

# Restart via PM2
ssh homeserver "~/.local/bin/pm2 restart xyrachat-backend"

# Check logs for errors
ssh homeserver "~/.local/bin/pm2 logs xyrachat-backend --lines 30"
```

#### Database Issues
```bash
# Test connection
PGPASSWORD=xyrachat123 psql -U xyrachat -d xyrachat -h 127.0.0.1 -c "SELECT 1;"

# Run migrations
cd ~/xyrachat/backend && npm run migrate
```

#### WebSocket Connection Issues
- Check CORS origins in backend `.env`
- Verify frontend WebSocket URL matches backend
- Check nginx proxy configuration for WebSocket upgrade

#### Channel Webhook Issues
- Verify webhook URLs are accessible: `curl -I https://api.xyra.chat/api/v1/webhooks/telegram`
- Check channel credentials in database: `SELECT type, credentials FROM channels;`
- Review channel-specific logs in backend

### Scaling Considerations
- **Database**: Consider read replicas for high load
- **Redis**: Cluster for session storage scaling
- **Backend**: Multiple instances behind load balancer
- **Frontend**: Vercel auto-scales, but consider CDN for media

---

## 📊 Monitoring & Analytics

### Key Metrics to Monitor
- API response times
- WebSocket connection count
- Database query performance
- Channel webhook success rates
- Error rates by service

### Log Locations
- **Backend (PM2)**: `~/.local/bin/pm2 logs xyrachat-backend` or `/tmp/xyrachat-backend.log`
- **nginx**: `/var/log/nginx/access.log` & `/var/log/nginx/error.log`
- **PostgreSQL**: `/var/log/postgresql/postgresql-*.log`

### Health Checks
```bash
# Backend API
curl https://api.xyra.chat/health

# Frontend
curl https://xyra.chat

# Database
PGPASSWORD=xyrachat123 psql -U xyrachat -d xyrachat -h 127.0.0.1 -c "SELECT 1;"
```

---

## 🚨 Emergency Procedures

### Complete Backend Recovery
```bash
# 1. SSH into homeserver
ssh homeserver

# 2. Check PM2 status
~/.local/bin/pm2 status

# 3. Pull latest code
cd ~/xyrachat && git pull origin main

# 4. Restart via PM2
~/.local/bin/pm2 restart xyrachat-backend

# 5. Verify
sleep 3 && curl https://api.xyra.chat/health

# If PM2 process doesn't exist yet (fresh server):
cd ~/xyrachat/backend
~/.local/bin/pm2 start 'npx tsx src/server.ts' --name xyrachat-backend --log /tmp/xyrachat-backend.log
~/.local/bin/pm2 save
```

### Database Recovery
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Restart if needed
sudo systemctl restart postgresql

# Check connectivity
PGPASSWORD=xyrachat123 psql -U xyrachat -d xyrachat -h 127.0.0.1 -c "SELECT 1;"
```

### Frontend Deployment Issues
- Check Vercel dashboard: https://vercel.com/sjuniorm/xyrachat
- Verify environment variables in Vercel project settings
- Re-deploy via git push or Vercel dashboard

---

## 👥 Team Handoff Guide

### Access Requirements
- **GitHub**: Repository access (sjuniorm/xyrachat)
- **Vercel**: Team member access for frontend
- **homeserver**: SSH keys configured in `~/.ssh/config`
- **Domain**: DNS management (if needed)

### Critical Contacts
- **Domain Registrar**: Where `xyra.chat` is registered
- **Vercel Account**: Owner email for billing/access
- **Server Provider**: homeserver hosting details

### Documentation Locations
- **This file**: `/XYRACHAT_ARCHITECTURE.md`
- **Code comments**: Throughout backend and frontend
- **Database schema**: `backend/src/database/schema.ts`
- **API routes**: `backend/src/modules/*/routes.ts`
- **Roadmap**: `docs/ROADMAP.md`

### First Week Checklist
- [ ] Access all systems (GitHub, Vercel, homeserver)
- [ ] Review codebase structure
- [ ] Test all channel integrations
- [ ] Verify monitoring setup
- [ ] Document any custom configurations
- [ ] Meet with current maintainer for knowledge transfer

---

## 🔮 Future Architecture Notes

### Planned Improvements
- **OAuth Flow**: Meta Embedded Signup for WhatsApp/Instagram/Facebook
- **Media Storage**: S3-compatible storage for images/files
- **Advanced Analytics**: Custom dashboard with metrics
- **AI Chatbot**: OpenAI integration for automated responses
- **Multi-tenant Enhancements**: Better isolation and scaling

### Scalability Path
1. **Phase 1**: Current single-server setup (PM2)
2. **Phase 2**: Database read replicas, Redis cluster
3. **Phase 3**: Multiple backend instances behind load balancer
4. **Phase 4**: Microservices architecture (channels, conversations, auth)

---

## 📞 Support & Troubleshooting

### Quick Debug Commands
```bash
# Backend status
curl -s https://api.xyra.chat/health | jq

# PM2 process status
ssh homeserver "~/.local/bin/pm2 status"

# Recent backend logs
ssh homeserver "~/.local/bin/pm2 logs xyrachat-backend --lines 20 --nostream"

# Database size
PGPASSWORD=xyrachat123 psql -U xyrachat -d xyrachat -h 127.0.0.1 -c "SELECT pg_size_pretty(pg_database_size('xyrachat'));"
```

### Common Error Messages
- **"WebSocket connection failed"**: Check CORS origins and WebSocket URL
- **"Network Error"**: Frontend API URL mismatch or backend down
- **"Rate limit exceeded"**: Too many API requests (check rate limiter)
- **"Invalid credentials"**: Channel API tokens expired/invalid

---

## 📝 Change Log

### Recent Major Changes
- **2026-03-23**: Switched backend process manager from nohup to PM2 (no more hanging SSH sessions)
- **2026-03-23**: Fixed Telegram outbound routing (chatId from inbound metadata), multi-bot support by botToken
- **2026-03-23**: Added WhatsApp template messages (list + send), businessAccountId credential field
- **2026-03-23**: Added Telegram webhook auto-registration on channel create + manual re-register button
- **2026-03-23**: Added WhatsApp template send modal in Inbox
- **2026-03-23**: Added outbound message routing, real-time fixes, delivery status
- **2026-03-23**: Complete frontend branding to XyraChat
- **2026-03-23**: Fixed CORS, authentication flow, Vercel deployment
- **2026-03-23**: Added Telegram, Instagram, Facebook webhook handlers

### Version History
- **v1.0**: Basic omnichannel platform with Telegram support
- **v1.1**: Added WhatsApp Cloud API integration
- **v1.2**: Real-time WebSocket implementation
- **v1.3**: Multi-tenant architecture and team features
- **v1.4**: Advanced automation and chatbot integration
- **v1.5**: WhatsApp templates, Telegram fixes, PM2 process management

---

*Last Updated: March 23, 2026*
*Maintainer: Current XyraChat development team*
*Contact: Via GitHub issues or project maintainers*
