import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { UserRole } from '../types';

interface SocketUser {
  userId: string;
  tenantId: string;
  role: UserRole;
}

let io: Server;

export function initializeWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token as string, env.JWT_SECRET) as any;
      (socket as any).user = {
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: payload.role,
      } as SocketUser;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as SocketUser;
    logger.info(`WebSocket connected: user=${user.userId} tenant=${user.tenantId}`);

    // Join tenant room
    socket.join(`tenant:${user.tenantId}`);
    // Join personal room
    socket.join(`user:${user.userId}`);

    // Join conversation room
    socket.on('join:conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
      logger.debug(`User ${user.userId} joined conversation ${conversationId}`);
    });

    // Leave conversation room
    socket.on('leave:conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Typing indicator
    socket.on('typing:start', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
        userId: user.userId,
        conversationId: data.conversationId,
      });
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
        userId: user.userId,
        conversationId: data.conversationId,
      });
    });

    // Presence
    socket.on('presence:online', () => {
      io.to(`tenant:${user.tenantId}`).emit('presence:update', {
        userId: user.userId,
        status: 'online',
      });
    });

    socket.on('disconnect', () => {
      io.to(`tenant:${user.tenantId}`).emit('presence:update', {
        userId: user.userId,
        status: 'offline',
      });
      logger.info(`WebSocket disconnected: user=${user.userId}`);
    });
  });

  logger.info('✅ WebSocket server initialized');
  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('WebSocket server not initialized');
  return io;
}

// Emit helpers
export function emitToTenant(tenantId: string, event: string, data: any) {
  if (io) io.to(`tenant:${tenantId}`).emit(event, data);
}

export function emitToUser(userId: string, event: string, data: any) {
  if (io) io.to(`user:${userId}`).emit(event, data);
}

export function emitToConversation(conversationId: string, event: string, data: any) {
  if (io) io.to(`conversation:${conversationId}`).emit(event, data);
}
