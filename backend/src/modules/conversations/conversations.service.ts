import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { ConversationStatus, MessageDirection, ChannelType } from '../../types';
import { WhatsAppService } from '../channels/whatsapp.service';
import { TelegramService } from '../channels/telegram.service';
import { InstagramService } from '../channels/instagram.service';
import { FacebookService } from '../channels/facebook.service';
import { emitToConversation } from '../../websocket';
import { logger } from '../../utils/logger';

const whatsappService = new WhatsAppService();
const telegramService = new TelegramService();
const instagramService = new InstagramService();
const facebookService = new FacebookService();

interface ListFilters {
  status?: string;
  assignedUserId?: string;
  channelType?: string;
  page: number;
  limit: number;
}

export class ConversationsService {
  async list(tenantId: string, filters: ListFilters) {
    const conditions = ['c.tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters.status) {
      conditions.push(`c.status = $${paramIndex++}`);
      params.push(filters.status);
    }
    if (filters.assignedUserId) {
      conditions.push(`c.assigned_user_id = $${paramIndex++}`);
      params.push(filters.assignedUserId);
    }
    if (filters.channelType) {
      conditions.push(`c.channel_type = $${paramIndex++}`);
      params.push(filters.channelType);
    }

    const whereClause = conditions.join(' AND ');
    const offset = (filters.page - 1) * filters.limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM conversations c WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT c.*, 
        ct.first_name as contact_first_name, ct.last_name as contact_last_name,
        ct.avatar_url as contact_avatar, ct.phone as contact_phone,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name
       FROM conversations c
       LEFT JOIN contacts ct ON ct.id = c.contact_id
       LEFT JOIN users u ON u.id = c.assigned_user_id
       WHERE ${whereClause}
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, filters.limit, offset]
    );

    return {
      data: result.rows,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  async getById(tenantId: string, id: string) {
    const result = await pool.query(
      `SELECT c.*, 
        ct.first_name as contact_first_name, ct.last_name as contact_last_name,
        ct.avatar_url as contact_avatar, ct.phone as contact_phone, ct.email as contact_email,
        u.first_name as assigned_first_name, u.last_name as assigned_last_name,
        ch.name as channel_name, ch.type as channel_type_name
       FROM conversations c
       LEFT JOIN contacts ct ON ct.id = c.contact_id
       LEFT JOIN users u ON u.id = c.assigned_user_id
       LEFT JOIN channels ch ON ch.id = c.channel_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Conversation not found', 404);
    }

    return result.rows[0];
  }

  async create(tenantId: string, userId: string, data: any) {
    const result = await pool.query(
      `INSERT INTO conversations (tenant_id, contact_id, channel_id, channel_type, status, assigned_user_id, subject)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [tenantId, data.contactId, data.channelId, data.channelType, ConversationStatus.OPEN, userId, data.subject]
    );
    return result.rows[0];
  }

  async updateStatus(tenantId: string, id: string, status: ConversationStatus) {
    const closedAt = status === ConversationStatus.CLOSED ? new Date() : null;
    const result = await pool.query(
      `UPDATE conversations SET status = $1, closed_at = $2 WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [status, closedAt, id, tenantId]
    );
    if (result.rows.length === 0) {
      throw new AppError('Conversation not found', 404);
    }
    return result.rows[0];
  }

  async assign(tenantId: string, id: string, userId?: string, teamId?: string) {
    const result = await pool.query(
      `UPDATE conversations SET assigned_user_id = $1, assigned_team_id = $2 WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [userId || null, teamId || null, id, tenantId]
    );
    if (result.rows.length === 0) {
      throw new AppError('Conversation not found', 404);
    }
    return result.rows[0];
  }

  async sendMessage(tenantId: string, userId: string, conversationId: string, data: any) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const msgResult = await client.query(
        `INSERT INTO messages (tenant_id, conversation_id, sender_id, direction, message_type, content, media_url, is_from_bot, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent') RETURNING *`,
        [tenantId, conversationId, userId, MessageDirection.OUTBOUND, data.messageType || 'text', data.content, data.mediaUrl, false]
      );

      const preview = data.content ? data.content.substring(0, 100) : '[Media]';
      await client.query(
        `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1, status = 'open' WHERE id = $2`,
        [preview, conversationId]
      );

      await client.query('COMMIT');

      const message = msgResult.rows[0];

      // Route message to external channel, then mark as delivered
      try {
        await this.routeOutboundMessage(tenantId, conversationId, data.content);
        // Mark as delivered after successful channel send
        await pool.query(
          `UPDATE messages SET status = 'delivered', delivered_at = NOW() WHERE id = $1`,
          [message.id]
        );
        message.status = 'delivered';
        message.delivered_at = new Date().toISOString();
      } catch (routeError) {
        logger.error('Failed to route outbound message to channel', routeError);
      }

      // Emit real-time event (after routing so status is up to date)
      emitToConversation(conversationId, 'message:new', message);

      return message;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async routeOutboundMessage(tenantId: string, conversationId: string, content: string) {
    // Look up conversation with channel and contact info
    const convResult = await pool.query(
      `SELECT c.*, ch.type as ch_type, ch.credentials as ch_credentials,
              ct.channel_identifiers, ct.phone as contact_phone
       FROM conversations c
       JOIN channels ch ON ch.id = c.channel_id
       JOIN contacts ct ON ct.id = c.contact_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [conversationId, tenantId]
    );

    if (convResult.rows.length === 0) return;

    const conv = convResult.rows[0];
    const channelType = conv.ch_type;
    const creds = conv.ch_credentials || {};
    const identifiers = conv.channel_identifiers || {};

    switch (channelType) {
      case ChannelType.TELEGRAM: {
        const botToken = creds.botToken;
        // Always resolve chatId from the last inbound message metadata (most reliable source)
        const lastMsg = await pool.query(
          `SELECT metadata FROM messages WHERE conversation_id = $1 AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1`,
          [conversationId]
        );
        const telegramChatId = lastMsg.rows[0]?.metadata?.telegramChatId
          ?? identifiers.telegram;

        if (!botToken) {
          logger.warn('Missing Telegram bot token for outbound message', { conversationId });
          break;
        }
        if (!telegramChatId) {
          logger.warn('Missing Telegram chat ID for outbound message', { conversationId });
          break;
        }
        await telegramService.sendTextMessage(botToken, String(telegramChatId), content);
        break;
      }
      case ChannelType.WHATSAPP: {
        const phoneNumberId = creds.phoneNumberId;
        const accessToken = creds.accessToken;
        const recipientPhone = identifiers.whatsapp || conv.contact_phone;
        if (phoneNumberId && accessToken && recipientPhone) {
          await whatsappService.sendTextMessage(phoneNumberId, accessToken, recipientPhone, content);
        } else {
          logger.warn('Missing WhatsApp credentials for outbound message');
        }
        break;
      }
      case ChannelType.INSTAGRAM: {
        const pageAccessToken = creds.pageAccessToken;
        const recipientId = identifiers.instagram;
        if (pageAccessToken && recipientId) {
          await instagramService.sendTextMessage(pageAccessToken, recipientId, content);
        } else {
          logger.warn('Missing Instagram credentials for outbound message');
        }
        break;
      }
      case ChannelType.FACEBOOK: {
        const pageAccessToken = creds.pageAccessToken;
        const recipientId = identifiers.facebook;
        if (pageAccessToken && recipientId) {
          await facebookService.sendTextMessage(pageAccessToken, recipientId, content);
        } else {
          logger.warn('Missing Facebook credentials for outbound message');
        }
        break;
      }
      default:
        logger.info(`No outbound routing for channel type: ${channelType}`);
    }
  }

  async getMessages(tenantId: string, conversationId: string, pagination: { page: number; limit: number }) {
    const offset = (pagination.page - 1) * pagination.limit;
    const result = await pool.query(
      `SELECT m.*, u.first_name as sender_first_name, u.last_name as sender_last_name
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 AND m.tenant_id = $2
       ORDER BY m.created_at ASC
       LIMIT $3 OFFSET $4`,
      [conversationId, tenantId, pagination.limit, offset]
    );
    return result.rows;
  }

  async addNote(tenantId: string, userId: string, conversationId: string, content: string) {
    const result = await pool.query(
      `INSERT INTO internal_notes (tenant_id, conversation_id, user_id, content)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, conversationId, userId, content]
    );
    return result.rows[0];
  }

  async getNotes(tenantId: string, conversationId: string) {
    const result = await pool.query(
      `SELECT n.*, u.first_name, u.last_name
       FROM internal_notes n
       LEFT JOIN users u ON u.id = n.user_id
       WHERE n.conversation_id = $1 AND n.tenant_id = $2
       ORDER BY n.created_at DESC`,
      [conversationId, tenantId]
    );
    return result.rows;
  }

  async addTag(tenantId: string, conversationId: string, tagId: string) {
    await pool.query(
      `INSERT INTO conversation_tags (conversation_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [conversationId, tagId]
    );
  }

  async removeTag(_tenantId: string, conversationId: string, tagId: string) {
    await pool.query(
      `DELETE FROM conversation_tags WHERE conversation_id = $1 AND tag_id = $2`,
      [conversationId, tagId]
    );
  }
}
