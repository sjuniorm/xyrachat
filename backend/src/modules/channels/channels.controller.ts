import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { TelegramService } from './telegram.service';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

const telegramService = new TelegramService();

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
      const channel = result.rows[0];

      // Auto-register Telegram webhook when a Telegram channel is created
      if (type === 'telegram' && credentials?.botToken) {
        try {
          const apiBase = env.CORS_ORIGIN.includes('localhost')
            ? null // Can't register localhost webhooks with Telegram
            : `https://api.xyra.chat/api/v1`; // Use production URL

          if (apiBase) {
            const webhookUrl = `${apiBase}/webhooks/telegram`;
            await telegramService.setWebhook(
              credentials.botToken,
              webhookUrl,
              env.TELEGRAM_SECRET_TOKEN
            );
            logger.info(`Telegram webhook registered for channel ${channel.id}`);
          } else {
            logger.info('Skipping Telegram webhook registration in local dev — use ngrok or similar');
          }
        } catch (webhookError: any) {
          // Don't fail channel creation if webhook registration fails
          logger.error('Failed to register Telegram webhook', webhookError.message);
        }
      }

      res.status(201).json(channel);
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
