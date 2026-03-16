import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

interface ListFilters {
  search?: string;
  leadStatus?: string;
  page: number;
  limit: number;
}

export class ContactsService {
  async list(tenantId: string, filters: ListFilters) {
    const conditions = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters.search) {
      conditions.push(`(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }
    if (filters.leadStatus) {
      conditions.push(`lead_status = $${paramIndex++}`);
      params.push(filters.leadStatus);
    }

    const whereClause = conditions.join(' AND ');
    const offset = (filters.page - 1) * filters.limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM contacts WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT * FROM contacts WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, filters.limit, offset]
    );

    return {
      data: result.rows,
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  async getById(tenantId: string, id: string) {
    const result = await pool.query(
      `SELECT c.*, array_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) FILTER (WHERE t.id IS NOT NULL) as tags
       FROM contacts c
       LEFT JOIN contact_tags ct ON ct.contact_id = c.id
       LEFT JOIN tags t ON t.id = ct.tag_id
       WHERE c.id = $1 AND c.tenant_id = $2
       GROUP BY c.id`,
      [id, tenantId]
    );
    if (result.rows.length === 0) throw new AppError('Contact not found', 404);
    return result.rows[0];
  }

  async create(tenantId: string, data: any) {
    const result = await pool.query(
      `INSERT INTO contacts (tenant_id, first_name, last_name, email, phone, lead_status, notes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [tenantId, data.firstName, data.lastName, data.email, data.phone, data.leadStatus || 'new', data.notes, data.metadata || {}]
    );
    return result.rows[0];
  }

  async update(tenantId: string, id: string, data: any) {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const allowedFields: Record<string, string> = {
      firstName: 'first_name', lastName: 'last_name', email: 'email',
      phone: 'phone', leadStatus: 'lead_status', notes: 'notes', metadata: 'metadata',
    };

    for (const [key, column] of Object.entries(allowedFields)) {
      if (data[key] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) throw new AppError('No fields to update', 400);

    params.push(id, tenantId);
    const result = await pool.query(
      `UPDATE contacts SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex} RETURNING *`,
      params
    );
    if (result.rows.length === 0) throw new AppError('Contact not found', 404);
    return result.rows[0];
  }

  async delete(tenantId: string, id: string) {
    const result = await pool.query(
      'DELETE FROM contacts WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );
    if (result.rows.length === 0) throw new AppError('Contact not found', 404);
  }

  async getConversations(tenantId: string, contactId: string) {
    const result = await pool.query(
      `SELECT * FROM conversations WHERE contact_id = $1 AND tenant_id = $2 ORDER BY last_message_at DESC`,
      [contactId, tenantId]
    );
    return result.rows;
  }

  async addTag(contactId: string, tagId: string) {
    await pool.query(
      'INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [contactId, tagId]
    );
  }

  async removeTag(contactId: string, tagId: string) {
    await pool.query('DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2', [contactId, tagId]);
  }
}
