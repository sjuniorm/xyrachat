import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

export class ChannelsController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const result = await pool.query(
        'SELECT * FROM channels WHERE tenant_id = $1 ORDER BY created_at DESC',
        [tenantId]
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const result = await pool.query(
        'SELECT * FROM channels WHERE id = $1 AND tenant_id = $2',
        [req.params.id, tenantId]
      );
      if (result.rows.length === 0) { res.status(404).json({ error: 'Channel not found' }); return; }
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const { type, name, credentials, config } = req.body;
      const result = await pool.query(
        `INSERT INTO channels (tenant_id, type, name, credentials, config) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [tenantId, type, name, credentials || {}, config || {}]
      );
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const { name, credentials, config, isActive } = req.body;
      const result = await pool.query(
        `UPDATE channels SET name = COALESCE($1, name), credentials = COALESCE($2, credentials), 
         config = COALESCE($3, config), is_active = COALESCE($4, is_active) 
         WHERE id = $5 AND tenant_id = $6 RETURNING *`,
        [name, credentials, config, isActive, req.params.id, tenantId]
      );
      if (result.rows.length === 0) { res.status(404).json({ error: 'Channel not found' }); return; }
      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const result = await pool.query(
        'DELETE FROM channels WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [req.params.id, tenantId]
      );
      if (result.rows.length === 0) { res.status(404).json({ error: 'Channel not found' }); return; }
      res.json({ message: 'Channel deleted' });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
}
