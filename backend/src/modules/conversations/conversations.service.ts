import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { ConversationStatus, MessageDirection } from '../../types';

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
        `INSERT INTO messages (tenant_id, conversation_id, sender_id, direction, message_type, content, media_url, is_from_bot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [tenantId, conversationId, userId, MessageDirection.OUTBOUND, data.messageType || 'text', data.content, data.mediaUrl, false]
      );

      const preview = data.content ? data.content.substring(0, 100) : '[Media]';
      await client.query(
        `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1, status = 'open' WHERE id = $2`,
        [preview, conversationId]
      );

      await client.query('COMMIT');
      return msgResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
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
