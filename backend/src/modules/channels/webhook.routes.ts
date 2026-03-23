import { Router, Request, Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { InstagramService } from './instagram.service';
import { FacebookService } from './facebook.service';
import { TelegramService } from './telegram.service';
import { pool } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { ChannelType, MessageDirection, AutomationTriggerType } from '../../types';
import { emitToTenant, emitToConversation } from '../../websocket';
import { ChatbotService } from '../chatbot/chatbot.service';
import { AutomationService } from '../automation/automation.service';

const router = Router();
const whatsappService = new WhatsAppService();
const instagramService = new InstagramService();
const facebookService = new FacebookService();
const telegramService = new TelegramService();
const chatbotService = new ChatbotService();
const automationService = new AutomationService();

// WhatsApp webhook verification
router.get('/whatsapp', (req: Request, res: Response) => {
  whatsappService.verifyWebhook(req, res);
});

// WhatsApp incoming messages
router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    if (!whatsappService.validateSignature(req)) {
      res.sendStatus(401);
      return;
    }

    const normalizedMessages = await whatsappService.handleIncomingWebhook(req.body);

    for (const msg of normalizedMessages) {
      await processInboundMessage(msg);
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('WhatsApp webhook error', error);
    res.sendStatus(200);
  }
});

// Webchat incoming messages
router.post('/webchat', async (req: Request, res: Response) => {
  try {
    const { channelId, visitorId, content, messageType = 'text' } = req.body;

    if (!channelId || !visitorId || !content) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const channelResult = await pool.query(
      'SELECT * FROM channels WHERE id = $1 AND type = $2 AND is_active = true',
      [channelId, ChannelType.WEBCHAT]
    );

    if (channelResult.rows.length === 0) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const channel = channelResult.rows[0];
    const tenantId = channel.tenant_id;

    // Find or create contact
    let contactResult = await pool.query(
      "SELECT * FROM contacts WHERE tenant_id = $1 AND channel_identifiers->>'webchat' = $2",
      [tenantId, visitorId]
    );

    if (contactResult.rows.length === 0) {
      contactResult = await pool.query(
        `INSERT INTO contacts (tenant_id, first_name, channel_identifiers)
         VALUES ($1, $2, $3) RETURNING *`,
        [tenantId, 'Visitor', JSON.stringify({ webchat: visitorId })]
      );
    }

    const contact = contactResult.rows[0];

    // Find or create conversation
    let convResult = await pool.query(
      "SELECT * FROM conversations WHERE contact_id = $1 AND channel_id = $2 AND status != 'closed'",
      [contact.id, channelId]
    );

    if (convResult.rows.length === 0) {
      convResult = await pool.query(
        `INSERT INTO conversations (tenant_id, contact_id, channel_id, channel_type, status, is_bot_active)
         VALUES ($1, $2, $3, $4, 'open', true) RETURNING *`,
        [tenantId, contact.id, channelId, ChannelType.WEBCHAT]
      );
    }

    const conversation = convResult.rows[0];

    // Save message
    const msgResult = await pool.query(
      `INSERT INTO messages (tenant_id, conversation_id, direction, message_type, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, conversation.id, MessageDirection.INBOUND, messageType, content, JSON.stringify({ visitorId })]
    );

    const preview = content.substring(0, 100);
    await pool.query(
      `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1 WHERE id = $2`,
      [preview, conversation.id]
    );

    // Emit real-time events
    emitToTenant(tenantId, 'conversation:updated', { conversationId: conversation.id });
    emitToConversation(conversation.id, 'message:new', msgResult.rows[0]);

    // Process chatbot
    const botResponse = await chatbotService.processIncomingMessage(tenantId, conversation.id, content);
    if (botResponse) {
      const botMsg = await pool.query(
        `INSERT INTO messages (tenant_id, conversation_id, direction, message_type, content, is_from_bot)
         VALUES ($1, $2, 'outbound', 'text', $3, true) RETURNING *`,
        [tenantId, conversation.id, botResponse]
      );

      await pool.query(
        `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1 WHERE id = $2`,
        [botResponse.substring(0, 100), conversation.id]
      );

      emitToConversation(conversation.id, 'message:new', botMsg.rows[0]);
      res.json({ message: msgResult.rows[0], botReply: botMsg.rows[0] });
      return;
    }

    // Trigger automation
    await automationService.executeWorkflows(tenantId, AutomationTriggerType.MESSAGE_RECEIVED, {
      conversationId: conversation.id,
      contactId: contact.id,
      messageContent: content,
      channelType: ChannelType.WEBCHAT,
    });

    res.json({ message: msgResult.rows[0] });
  } catch (error) {
    logger.error('Webchat webhook error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Instagram webhook verification ───
router.get('/instagram', (req: Request, res: Response) => {
  instagramService.verifyWebhook(req, res);
});

// ─── Instagram incoming messages ───
router.post('/instagram', async (req: Request, res: Response) => {
  try {
    if (!instagramService.validateSignature(req)) {
      res.sendStatus(401);
      return;
    }

    const normalizedMessages = await instagramService.handleIncomingWebhook(req.body);

    for (const msg of normalizedMessages) {
      await processChannelInboundMessage(msg, ChannelType.INSTAGRAM, 'instagram');
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('Instagram webhook error', error);
    res.sendStatus(200);
  }
});

// ─── Facebook webhook verification ───
router.get('/facebook', (req: Request, res: Response) => {
  facebookService.verifyWebhook(req, res);
});

// ─── Facebook incoming messages ───
router.post('/facebook', async (req: Request, res: Response) => {
  try {
    if (!facebookService.validateSignature(req)) {
      res.sendStatus(401);
      return;
    }

    const normalizedMessages = await facebookService.handleIncomingWebhook(req.body);

    for (const msg of normalizedMessages) {
      await processChannelInboundMessage(msg, ChannelType.FACEBOOK, 'facebook');
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('Facebook webhook error', error);
    res.sendStatus(200);
  }
});

// ─── Telegram incoming messages ───
router.post('/telegram', async (req: Request, res: Response) => {
  try {
    if (!telegramService.validateSecretToken(req, env.TELEGRAM_SECRET_TOKEN)) {
      res.sendStatus(401);
      return;
    }

    const normalizedMessages = await telegramService.handleIncomingWebhook(req.body);

    for (const msg of normalizedMessages) {
      await processChannelInboundMessage(msg, ChannelType.TELEGRAM, 'telegram');
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('Telegram webhook error', error);
    res.sendStatus(200);
  }
});

// ─── Generic channel inbound message processor ───
async function processChannelInboundMessage(msg: any, channelType: ChannelType, channelTypeName: string) {
  try {
    // Find the channel by type and sender metadata
    let channelQuery: string;
    let channelParams: any[];

    if (channelType === ChannelType.INSTAGRAM || channelType === ChannelType.FACEBOOK) {
      // Match by page ID stored in credentials
      channelQuery = "SELECT * FROM channels WHERE type = $1 AND is_active = true AND credentials->>'pageId' = $2";
      channelParams = [channelTypeName, msg.metadata?.pageId];
    } else if (channelType === ChannelType.TELEGRAM) {
      // Match by the bot token that received this update (stored in metadata)
      if (msg.metadata?.botToken) {
        channelQuery = "SELECT * FROM channels WHERE type = $1 AND is_active = true AND credentials->>'botToken' = $2";
        channelParams = [channelTypeName, msg.metadata.botToken];
      } else {
        // Fallback: first active telegram channel
        channelQuery = 'SELECT * FROM channels WHERE type = $1 AND is_active = true LIMIT 1';
        channelParams = [channelTypeName];
      }
    } else {
      return;
    }

    const channelResult = await pool.query(channelQuery, channelParams);
    if (channelResult.rows.length === 0) {
      logger.warn(`No ${channelTypeName} channel found`, msg.metadata);
      return;
    }

    const channel = channelResult.rows[0];
    const tenantId = channel.tenant_id;

    // Find or create contact
    let contactResult = await pool.query(
      `SELECT * FROM contacts WHERE tenant_id = $1 AND channel_identifiers->>$2 = $3`,
      [tenantId, channelTypeName, msg.senderIdentifier]
    );

    if (contactResult.rows.length === 0) {
      const contactName = msg.metadata?.senderFirstName || msg.metadata?.contactName || 'Unknown';
      contactResult = await pool.query(
        `INSERT INTO contacts (tenant_id, first_name, last_name, channel_identifiers)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [
          tenantId,
          contactName,
          msg.metadata?.senderLastName || '',
          JSON.stringify({ [channelTypeName]: msg.senderIdentifier }),
        ]
      );
    }

    const contact = contactResult.rows[0];

    // Find or create conversation
    let convResult = await pool.query(
      "SELECT * FROM conversations WHERE contact_id = $1 AND channel_id = $2 AND status != 'closed'",
      [contact.id, channel.id]
    );

    if (convResult.rows.length === 0) {
      convResult = await pool.query(
        `INSERT INTO conversations (tenant_id, contact_id, channel_id, channel_type, status, is_bot_active)
         VALUES ($1, $2, $3, $4, 'open', true) RETURNING *`,
        [tenantId, contact.id, channel.id, channelTypeName]
      );
    }

    const conversation = convResult.rows[0];

    // Save message
    const msgResult = await pool.query(
      `INSERT INTO messages (tenant_id, conversation_id, direction, message_type, content, media_url, channel_message_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        tenantId, conversation.id, MessageDirection.INBOUND, msg.messageType,
        msg.content, msg.mediaUrl, msg.channelMessageId, JSON.stringify(msg.metadata),
      ]
    );

    const preview = msg.content.substring(0, 100);
    await pool.query(
      `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1 WHERE id = $2`,
      [preview, conversation.id]
    );

    // Real-time events
    emitToTenant(tenantId, 'conversation:updated', { conversationId: conversation.id });
    emitToConversation(conversation.id, 'message:new', msgResult.rows[0]);

    // Process chatbot
    const botResponse = await chatbotService.processIncomingMessage(tenantId, conversation.id, msg.content);
    if (botResponse) {
      // Send bot reply back via the channel
      await sendBotReply(channel, channelType, msg, botResponse);

      const botMsg = await pool.query(
        `INSERT INTO messages (tenant_id, conversation_id, direction, message_type, content, is_from_bot)
         VALUES ($1, $2, 'outbound', 'text', $3, true) RETURNING *`,
        [tenantId, conversation.id, botResponse]
      );

      await pool.query(
        `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1 WHERE id = $2`,
        [botResponse.substring(0, 100), conversation.id]
      );

      emitToConversation(conversation.id, 'message:new', botMsg.rows[0]);
    }

    // Trigger automations
    await automationService.executeWorkflows(tenantId, AutomationTriggerType.MESSAGE_RECEIVED, {
      conversationId: conversation.id,
      contactId: contact.id,
      messageContent: msg.content,
      channelType,
    });
  } catch (error) {
    logger.error(`Error processing ${channelTypeName} inbound message`, error);
  }
}

// ─── Send bot reply back to the originating channel ───
async function sendBotReply(channel: any, channelType: ChannelType, originalMsg: any, botResponse: string) {
  try {
    const creds = channel.credentials || {};

    switch (channelType) {
      case ChannelType.INSTAGRAM: {
        const pageAccessToken = creds.pageAccessToken;
        if (pageAccessToken) {
          await instagramService.sendTextMessage(pageAccessToken, originalMsg.senderIdentifier, botResponse);
        }
        break;
      }
      case ChannelType.FACEBOOK: {
        const pageAccessToken = creds.pageAccessToken;
        if (pageAccessToken) {
          await facebookService.sendTextMessage(pageAccessToken, originalMsg.senderIdentifier, botResponse);
        }
        break;
      }
      case ChannelType.TELEGRAM: {
        const botToken = creds.botToken;
        const chatId = originalMsg.metadata?.telegramChatId;
        if (botToken && chatId) {
          await telegramService.sendTextMessage(botToken, chatId, botResponse);
        }
        break;
      }
    }
  } catch (error) {
    logger.error(`Failed to send bot reply via ${channelType}`, error);
  }
}

async function processInboundMessage(msg: any) {
  try {
    // Find the WhatsApp channel by phone number
    const channelResult = await pool.query(
      "SELECT * FROM channels WHERE type = 'whatsapp' AND is_active = true AND credentials->>'phoneNumberId' = $1",
      [msg.metadata?.phoneNumberId]
    );

    if (channelResult.rows.length === 0) {
      logger.warn('No WhatsApp channel found for phoneNumberId', msg.metadata?.phoneNumberId);
      return;
    }

    const channel = channelResult.rows[0];
    const tenantId = channel.tenant_id;

    // Find or create contact
    let contactResult = await pool.query(
      'SELECT * FROM contacts WHERE tenant_id = $1 AND phone = $2',
      [tenantId, msg.senderIdentifier]
    );

    if (contactResult.rows.length === 0) {
      contactResult = await pool.query(
        `INSERT INTO contacts (tenant_id, first_name, phone, channel_identifiers)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [tenantId, msg.metadata?.contactName || 'Unknown', msg.senderIdentifier,
         JSON.stringify({ whatsapp: msg.senderIdentifier })]
      );
    }

    const contact = contactResult.rows[0];

    // Find or create conversation
    let convResult = await pool.query(
      "SELECT * FROM conversations WHERE contact_id = $1 AND channel_id = $2 AND status != 'closed'",
      [contact.id, channel.id]
    );

    if (convResult.rows.length === 0) {
      convResult = await pool.query(
        `INSERT INTO conversations (tenant_id, contact_id, channel_id, channel_type, status, is_bot_active)
         VALUES ($1, $2, $3, 'whatsapp', 'open', true) RETURNING *`,
        [tenantId, contact.id, channel.id]
      );
    }

    const conversation = convResult.rows[0];

    // Save message
    const msgResult = await pool.query(
      `INSERT INTO messages (tenant_id, conversation_id, direction, message_type, content, media_url, channel_message_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [tenantId, conversation.id, MessageDirection.INBOUND, msg.messageType,
       msg.content, msg.mediaUrl, msg.channelMessageId, JSON.stringify(msg.metadata)]
    );

    const preview = msg.content.substring(0, 100);
    await pool.query(
      `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1 WHERE id = $2`,
      [preview, conversation.id]
    );

    // Real-time events
    emitToTenant(tenantId, 'conversation:updated', { conversationId: conversation.id });
    emitToConversation(conversation.id, 'message:new', msgResult.rows[0]);

    // Process chatbot
    const botResponse = await chatbotService.processIncomingMessage(tenantId, conversation.id, msg.content);
    if (botResponse) {
      const accessToken = channel.credentials?.accessToken;
      const phoneNumberId = channel.credentials?.phoneNumberId;

      if (accessToken && phoneNumberId) {
        await whatsappService.sendTextMessage(phoneNumberId, accessToken, msg.senderIdentifier, botResponse);
      }

      const botMsg = await pool.query(
        `INSERT INTO messages (tenant_id, conversation_id, direction, message_type, content, is_from_bot)
         VALUES ($1, $2, 'outbound', 'text', $3, true) RETURNING *`,
        [tenantId, conversation.id, botResponse]
      );

      await pool.query(
        `UPDATE conversations SET last_message_at = NOW(), last_message_preview = $1 WHERE id = $2`,
        [botResponse.substring(0, 100), conversation.id]
      );

      emitToConversation(conversation.id, 'message:new', botMsg.rows[0]);
    }

    // Trigger automations
    await automationService.executeWorkflows(tenantId, AutomationTriggerType.MESSAGE_RECEIVED, {
      conversationId: conversation.id,
      contactId: contact.id,
      messageContent: msg.content,
      channelType: ChannelType.WHATSAPP,
    });
  } catch (error) {
    logger.error('Error processing inbound message', error);
  }
}

export { router as webhookRoutes };
