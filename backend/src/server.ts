import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { checkDatabaseConnection } from './config/database';
import { connectRedis } from './config/redis';
import { initializeWebSocket } from './websocket';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// Route imports
import { authRoutes } from './modules/auth/auth.routes';
import { conversationRoutes } from './modules/conversations/conversations.routes';
import { contactRoutes } from './modules/contacts/contacts.routes';
import { channelRoutes } from './modules/channels/channels.routes';
import { chatbotRoutes } from './modules/chatbot/chatbot.routes';
import { automationRoutes } from './modules/automation/automation.routes';
import { webhookRoutes } from './modules/channels/webhook.routes';
import { teamRoutes } from './modules/teams/teams.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';

const app = express();
const server = http.createServer(app);

// Trust proxy (behind nginx)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN.split(','),
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook routes (before rate limiter — external services send many requests)
app.use(`${env.API_PREFIX}/webhooks`, webhookRoutes);

// Rate limiting (applied to all other API routes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(`${env.API_PREFIX}`, limiter);

// API routes
app.use(`${env.API_PREFIX}/auth`, authRoutes);
app.use(`${env.API_PREFIX}/conversations`, conversationRoutes);
app.use(`${env.API_PREFIX}/contacts`, contactRoutes);
app.use(`${env.API_PREFIX}/channels`, channelRoutes);
app.use(`${env.API_PREFIX}/chatbots`, chatbotRoutes);
app.use(`${env.API_PREFIX}/automations`, automationRoutes);
app.use(`${env.API_PREFIX}/teams`, teamRoutes);
app.use(`${env.API_PREFIX}/analytics`, analyticsRoutes);

// Error handler
app.use(errorHandler);

// Initialize WebSocket
initializeWebSocket(server);

// Start server
async function start() {
  try {
    await checkDatabaseConnection();
    await connectRedis();

    server.listen(env.PORT, () => {
      logger.info(`🚀 Server running on port ${env.PORT}`);
      logger.info(`📡 API: http://localhost:${env.PORT}${env.API_PREFIX}`);
      logger.info(`🔌 WebSocket: ws://localhost:${env.PORT}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
