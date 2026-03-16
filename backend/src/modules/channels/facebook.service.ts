import axios from 'axios';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { ChannelType, MessageDirection, MessageType, NormalizedMessage } from '../../types';

export class FacebookService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = 'https://graph.facebook.com/v18.0';
  }

  verifyWebhook(req: Request, res: Response): void {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.FACEBOOK_VERIFY_TOKEN) {
      logger.info('Facebook webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }

  validateSignature(req: Request): boolean {
    if (!env.FACEBOOK_APP_SECRET) return true;

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) return false;

    const body = JSON.stringify(req.body);
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', env.FACEBOOK_APP_SECRET)
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
      for (const messaging of entry.messaging || []) {
        // Skip echo messages (sent by us)
        if (messaging.message?.is_echo) continue;

        // Handle postbacks (button clicks)
        if (messaging.postback) {
          const normalizedMsg: NormalizedMessage = {
            channelType: ChannelType.FACEBOOK,
            channelMessageId: `postback_${messaging.timestamp}`,
            direction: MessageDirection.INBOUND,
            messageType: MessageType.TEXT,
            content: messaging.postback.title || messaging.postback.payload,
            senderIdentifier: messaging.sender.id,
            timestamp: new Date(messaging.timestamp),
            metadata: {
              fbSenderId: messaging.sender.id,
              fbRecipientId: messaging.recipient.id,
              pageId: entry.id,
              isPostback: true,
              postbackPayload: messaging.postback.payload,
            },
          };
          messages.push(normalizedMsg);
          continue;
        }

        if (messaging.message) {
          const normalizedMsg: NormalizedMessage = {
            channelType: ChannelType.FACEBOOK,
            channelMessageId: messaging.message.mid,
            direction: MessageDirection.INBOUND,
            messageType: this.mapMessageType(messaging.message),
            content: this.extractContent(messaging.message),
            mediaUrl: this.extractMediaUrl(messaging.message),
            senderIdentifier: messaging.sender.id,
            timestamp: new Date(messaging.timestamp),
            metadata: {
              fbSenderId: messaging.sender.id,
              fbRecipientId: messaging.recipient.id,
              fbMessageId: messaging.message.mid,
              pageId: entry.id,
            },
          };
          messages.push(normalizedMsg);
        }
      }
    }

    return messages;
  }

  async sendTextMessage(pageAccessToken: string, recipientId: string, text: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/me/messages`,
        {
          recipient: { id: recipientId },
          message: { text },
          messaging_type: 'RESPONSE',
        },
        {
          headers: {
            Authorization: `Bearer ${pageAccessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Facebook send message failed', error.response?.data || error.message);
      throw error;
    }
  }

  async sendMediaMessage(
    pageAccessToken: string, recipientId: string,
    mediaType: 'image' | 'video' | 'audio' | 'file', mediaUrl: string
  ): Promise<any> {
    try {
      const attachmentType = mediaType === 'file' ? 'file' : mediaType;
      const response = await axios.post(
        `${this.apiUrl}/me/messages`,
        {
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: attachmentType,
              payload: { url: mediaUrl, is_reusable: true },
            },
          },
          messaging_type: 'RESPONSE',
        },
        {
          headers: {
            Authorization: `Bearer ${pageAccessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Facebook send media failed', error.response?.data || error.message);
      throw error;
    }
  }

  async sendButtonTemplate(
    pageAccessToken: string, recipientId: string,
    text: string, buttons: Array<{ type: string; title: string; payload?: string; url?: string }>
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/me/messages`,
        {
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'button',
                text,
                buttons,
              },
            },
          },
          messaging_type: 'RESPONSE',
        },
        {
          headers: {
            Authorization: `Bearer ${pageAccessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Facebook send button template failed', error.response?.data || error.message);
      throw error;
    }
  }

  async getUserProfile(pageAccessToken: string, userId: string): Promise<{ first_name?: string; last_name?: string; profile_pic?: string }> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/${userId}`,
        {
          params: { fields: 'first_name,last_name,profile_pic', access_token: pageAccessToken },
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Facebook get user profile failed', error.response?.data || error.message);
      return {};
    }
  }

  private mapMessageType(message: any): MessageType {
    if (message.attachments) {
      const type = message.attachments[0]?.type;
      const map: Record<string, MessageType> = {
        image: MessageType.IMAGE,
        video: MessageType.VIDEO,
        audio: MessageType.AUDIO,
        file: MessageType.DOCUMENT,
        location: MessageType.LOCATION,
      };
      return map[type] || MessageType.TEXT;
    }
    return MessageType.TEXT;
  }

  private extractContent(message: any): string {
    if (message.text) return message.text;
    if (message.attachments) {
      const attachment = message.attachments[0];
      if (attachment.type === 'location') {
        const coords = attachment.payload?.coordinates;
        return coords ? `Location: ${coords.lat}, ${coords.long}` : '[Location]';
      }
      return `[${attachment.type || 'Attachment'}]`;
    }
    return '[Message]';
  }

  private extractMediaUrl(message: any): string | undefined {
    if (message.attachments && message.attachments.length > 0) {
      const payload = message.attachments[0]?.payload;
      return payload?.url;
    }
    return undefined;
  }
}
