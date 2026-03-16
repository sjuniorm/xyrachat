import axios from 'axios';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { pool } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { ChannelType, MessageDirection, MessageType, NormalizedMessage } from '../../types';

export class WhatsAppService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = env.WHATSAPP_API_URL;
  }

  verifyWebhook(req: Request, res: Response): void {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
      logger.info('WhatsApp webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }

  validateSignature(req: Request): boolean {
    if (!env.WHATSAPP_APP_SECRET) return true;

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) return false;

    const body = JSON.stringify(req.body);
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', env.WHATSAPP_APP_SECRET)
      .update(body)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  async handleIncomingWebhook(body: any): Promise<NormalizedMessage[]> {
    const messages: NormalizedMessage[] = [];

    if (!body.entry) return messages;

    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        if (!value.messages) continue;

        for (const msg of value.messages) {
          const contact = value.contacts?.[0];
          const normalizedMsg: NormalizedMessage = {
            channelType: ChannelType.WHATSAPP,
            channelMessageId: msg.id,
            direction: MessageDirection.INBOUND,
            messageType: this.mapMessageType(msg.type),
            content: this.extractContent(msg),
            mediaUrl: await this.extractMediaUrl(msg, value.metadata?.phone_number_id),
            senderIdentifier: msg.from,
            timestamp: new Date(parseInt(msg.timestamp) * 1000),
            metadata: {
              waMessageId: msg.id,
              phoneNumberId: value.metadata?.phone_number_id,
              displayPhoneNumber: value.metadata?.display_phone_number,
              contactName: contact?.profile?.name,
              contactWaId: contact?.wa_id,
            },
          };
          messages.push(normalizedMsg);
        }
      }
    }

    return messages;
  }

  async sendTextMessage(phoneNumberId: string, accessToken: string, to: string, text: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('WhatsApp send message failed', error.response?.data || error.message);
      throw error;
    }
  }

  async sendMediaMessage(
    phoneNumberId: string, accessToken: string, to: string,
    mediaType: 'image' | 'video' | 'audio' | 'document', mediaUrl: string, caption?: string
  ): Promise<any> {
    try {
      const mediaPayload: any = { link: mediaUrl };
      if (caption && (mediaType === 'image' || mediaType === 'document')) {
        mediaPayload.caption = caption;
      }

      const response = await axios.post(
        `${this.apiUrl}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: mediaType,
          [mediaType]: mediaPayload,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('WhatsApp send media failed', error.response?.data || error.message);
      throw error;
    }
  }

  async markAsRead(phoneNumberId: string, accessToken: string, messageId: string): Promise<void> {
    try {
      await axios.post(
        `${this.apiUrl}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error: any) {
      logger.error('WhatsApp mark as read failed', error.response?.data || error.message);
    }
  }

  private mapMessageType(waType: string): MessageType {
    const map: Record<string, MessageType> = {
      text: MessageType.TEXT,
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      audio: MessageType.AUDIO,
      document: MessageType.DOCUMENT,
      location: MessageType.LOCATION,
    };
    return map[waType] || MessageType.TEXT;
  }

  private extractContent(msg: any): string {
    switch (msg.type) {
      case 'text': return msg.text?.body || '';
      case 'image': return msg.image?.caption || '[Image]';
      case 'video': return msg.video?.caption || '[Video]';
      case 'audio': return '[Audio message]';
      case 'document': return msg.document?.caption || msg.document?.filename || '[Document]';
      case 'location': return `Location: ${msg.location?.latitude}, ${msg.location?.longitude}`;
      default: return `[${msg.type}]`;
    }
  }

  private async extractMediaUrl(msg: any, phoneNumberId: string): Promise<string | undefined> {
    const mediaTypes = ['image', 'video', 'audio', 'document'];
    for (const type of mediaTypes) {
      if (msg[type]?.id) {
        return msg[type].id;
      }
    }
    return undefined;
  }
}
