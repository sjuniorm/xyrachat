import { Router } from 'express';
import { ChannelsController } from './channels.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '../../types';
import { TelegramService } from './telegram.service';
import { WhatsAppService } from './whatsapp.service';
import { pool } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { AuthenticatedRequest } from '../../middleware/auth';
import { Response } from 'express';

const router = Router();
const controller = new ChannelsController();
const telegramService = new TelegramService();
const whatsappService = new WhatsAppService();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', authorize(UserRole.ADMIN, UserRole.MANAGER), controller.create);
router.put('/:id', authorize(UserRole.ADMIN, UserRole.MANAGER), controller.update);
router.delete('/:id', authorize(UserRole.ADMIN), controller.delete);

// ─── Register / refresh webhook for a channel ───────────────────────────────
// Useful in dev (ngrok) or when the webhook URL changes
router.post('/:id/register-webhook', authorize(UserRole.ADMIN, UserRole.MANAGER), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const { webhookUrl } = req.body; // caller provides the public URL

    const result = await pool.query(
      'SELECT * FROM channels WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const channel = result.rows[0];
    const creds = channel.credentials || {};

    if (channel.type === 'telegram') {
      if (!creds.botToken) {
        res.status(400).json({ error: 'Bot token not configured for this channel' });
        return;
      }
      const url = webhookUrl || `https://api.xyra.chat/api/v1/webhooks/telegram`;
      const data = await telegramService.setWebhook(creds.botToken, url, env.TELEGRAM_SECRET_TOKEN);
      res.json({ success: true, telegram: data });
    } else {
      res.status(400).json({ error: `Webhook registration not supported for channel type: ${channel.type}` });
    }
  } catch (error: any) {
    logger.error('Register webhook error', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── WhatsApp Templates ──────────────────────────────────────────────────────

// List templates for a WhatsApp channel
router.get('/:id/whatsapp/templates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const result = await pool.query(
      'SELECT * FROM channels WHERE id = $1 AND tenant_id = $2 AND type = $3',
      [req.params.id, tenantId, 'whatsapp']
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'WhatsApp channel not found' });
      return;
    }

    const channel = result.rows[0];
    const creds = channel.credentials || {};

    if (!creds.accessToken || !creds.businessAccountId) {
      res.status(400).json({ error: 'Missing accessToken or businessAccountId in channel credentials' });
      return;
    }

    const templates = await whatsappService.listTemplates(creds.businessAccountId, creds.accessToken);
    res.json(templates);
  } catch (error: any) {
    logger.error('List WhatsApp templates error', error);
    res.status(500).json({ error: error.message });
  }
});

// Send a template message to start / re-open a WhatsApp conversation
router.post('/:id/whatsapp/send-template', authorize(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId, userId } = req.tenantContext!;
    const { to, templateName, languageCode = 'en_US', components = [], contactId } = req.body;

    if (!to || !templateName) {
      res.status(400).json({ error: 'to and templateName are required' });
      return;
    }

    const channelResult = await pool.query(
      'SELECT * FROM channels WHERE id = $1 AND tenant_id = $2 AND type = $3',
      [req.params.id, tenantId, 'whatsapp']
    );
    if (channelResult.rows.length === 0) {
      res.status(404).json({ error: 'WhatsApp channel not found' });
      return;
    }

    const channel = channelResult.rows[0];
    const creds = channel.credentials || {};

    if (!creds.accessToken || !creds.phoneNumberId) {
      res.status(400).json({ error: 'Missing accessToken or phoneNumberId in channel credentials' });
      return;
    }

    // Send the template via WhatsApp API
    const waResponse = await whatsappService.sendTemplateMessage(
      creds.phoneNumberId,
      creds.accessToken,
      to,
      templateName,
      languageCode,
      components
    );

    // Find or create contact
    let resolvedContactId = contactId;
    if (!resolvedContactId) {
      let contactResult = await pool.query(
        'SELECT id FROM contacts WHERE tenant_id = $1 AND phone = $2',
        [tenantId, to]
      );
      if (contactResult.rows.length === 0) {
        contactResult = await pool.query(
          `INSERT INTO contacts (tenant_id, phone, channel_identifiers)
           VALUES ($1, $2, $3) RETURNING id`,
          [tenantId, to, JSON.stringify({ whatsapp: to })]
        );
      }
      resolvedContactId = contactResult.rows[0].id;
    }

    // Find or create conversation
    let convResult = await pool.query(
      "SELECT id FROM conversations WHERE contact_id = $1 AND channel_id = $2 AND status != 'closed'",
      [resolvedContactId, channel.id]
    );
    if (convResult.rows.length === 0) {
      convResult = await pool.query(
        `INSERT INTO conversations (tenant_id, contact_id, channel_id, channel_type, status, assigned_user_id)
         VALUES ($1, $2, $3, 'whatsapp', 'open', $4) RETURNING id`,
        [tenantId, resolvedContactId, channel.id, userId]
      );
    }
    const conversationId = convResult.rows[0].id;

    // Save the template message
    const templatePreview = `[Template: ${templateName}]`;
    await pool.query(
      `INSERT INTO messages (tenant_id, conversation_id, sender_id, direction, message_type, content, metadata, status)
       VALUES ($1, $2, $3, 'outbound', 'text', $4, $5, 'delivered')`,
      [
        tenantId, conversationId, userId, templatePreview,
        JSON.stringify({ templateName, languageCode, components, waMessageId: waResponse?.messages?.[0]?.id }),
      ]
    );

    await pool.query(
      `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1 WHERE id = $2`,
      [templatePreview, conversationId]
    );

    res.json({ success: true, conversationId, waResponse });
  } catch (error: any) {
    logger.error('Send WhatsApp template error', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as channelRoutes };
