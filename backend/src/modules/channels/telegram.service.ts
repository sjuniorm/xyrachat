import axios from 'axios';
import { Request, Response } from 'express';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { ChannelType, MessageDirection, MessageType, NormalizedMessage } from '../../types';

export class TelegramService {
  private getApiUrl(botToken: string): string {
    return `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * Set the webhook URL for a Telegram bot.
   * Call this once when configuring a new Telegram channel.
   */
  async setWebhook(botToken: string, webhookUrl: string, secretToken?: string): Promise<any> {
    try {
      const params: any = { url: webhookUrl };
      if (secretToken) params.secret_token = secretToken;

      const response = await axios.post(
        `${this.getApiUrl(botToken)}/setWebhook`,
        params
      );
      logger.info('Telegram webhook set', response.data);
      return response.data;
    } catch (error: any) {
      logger.error('Telegram setWebhook failed', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Validate the X-Telegram-Bot-Api-Secret-Token header
   */
  validateSecretToken(req: Request, expectedSecret?: string): boolean {
    if (!expectedSecret) return true;
    const header = req.headers['x-telegram-bot-api-secret-token'] as string;
    return header === expectedSecret;
  }

  async handleIncomingWebhook(body: any): Promise<NormalizedMessage[]> {
    const messages: NormalizedMessage[] = [];

    const update = body;

    // Handle regular messages
    const message = update.message || update.edited_message;
    if (message) {
      const normalizedMsg: NormalizedMessage = {
        channelType: ChannelType.TELEGRAM,
        channelMessageId: String(message.message_id),
        direction: MessageDirection.INBOUND,
        messageType: this.mapMessageType(message),
        content: this.extractContent(message),
        mediaUrl: await this.extractFileId(message),
        senderIdentifier: String(message.from.id),
        timestamp: new Date(message.date * 1000),
        metadata: {
          telegramUpdateId: update.update_id,
          telegramMessageId: message.message_id,
          telegramChatId: message.chat.id,
          chatType: message.chat.type,
          senderUsername: message.from.username,
          senderFirstName: message.from.first_name,
          senderLastName: message.from.last_name,
          isEdited: !!update.edited_message,
        },
      };
      messages.push(normalizedMsg);
    }

    // Handle callback queries (inline button presses)
    if (update.callback_query) {
      const cb = update.callback_query;
      const normalizedMsg: NormalizedMessage = {
        channelType: ChannelType.TELEGRAM,
        channelMessageId: `callback_${cb.id}`,
        direction: MessageDirection.INBOUND,
        messageType: MessageType.TEXT,
        content: cb.data || '[Button pressed]',
        senderIdentifier: String(cb.from.id),
        timestamp: new Date(),
        metadata: {
          telegramUpdateId: update.update_id,
          callbackQueryId: cb.id,
          telegramChatId: cb.message?.chat?.id,
          senderUsername: cb.from.username,
          senderFirstName: cb.from.first_name,
          senderLastName: cb.from.last_name,
          isCallbackQuery: true,
          callbackData: cb.data,
        },
      };
      messages.push(normalizedMsg);
    }

    return messages;
  }

  async sendTextMessage(botToken: string, chatId: number | string, text: string, parseMode?: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.getApiUrl(botToken)}/sendMessage`,
        {
          chat_id: chatId,
          text,
          parse_mode: parseMode || 'HTML',
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Telegram send message failed', error.response?.data || error.message);
      throw error;
    }
  }

  async sendPhoto(botToken: string, chatId: number | string, photoUrl: string, caption?: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.getApiUrl(botToken)}/sendPhoto`,
        {
          chat_id: chatId,
          photo: photoUrl,
          caption,
          parse_mode: 'HTML',
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Telegram send photo failed', error.response?.data || error.message);
      throw error;
    }
  }

  async sendDocument(botToken: string, chatId: number | string, documentUrl: string, caption?: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.getApiUrl(botToken)}/sendDocument`,
        {
          chat_id: chatId,
          document: documentUrl,
          caption,
          parse_mode: 'HTML',
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Telegram send document failed', error.response?.data || error.message);
      throw error;
    }
  }

  async answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.getApiUrl(botToken)}/answerCallbackQuery`,
        {
          callback_query_id: callbackQueryId,
          text,
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Telegram answer callback query failed', error.response?.data || error.message);
      throw error;
    }
  }

  async sendInlineKeyboard(
    botToken: string, chatId: number | string, text: string,
    buttons: Array<Array<{ text: string; callback_data?: string; url?: string }>>
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.getApiUrl(botToken)}/sendMessage`,
        {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        }
      );
      return response.data;
    } catch (error: any) {
      logger.error('Telegram send inline keyboard failed', error.response?.data || error.message);
      throw error;
    }
  }

  private mapMessageType(message: any): MessageType {
    if (message.photo) return MessageType.IMAGE;
    if (message.video || message.video_note) return MessageType.VIDEO;
    if (message.voice || message.audio) return MessageType.AUDIO;
    if (message.document) return MessageType.DOCUMENT;
    if (message.location) return MessageType.LOCATION;
    return MessageType.TEXT;
  }

  private extractContent(message: any): string {
    if (message.text) return message.text;
    if (message.caption) return message.caption;
    if (message.photo) return message.caption || '[Photo]';
    if (message.video) return message.caption || '[Video]';
    if (message.video_note) return '[Video note]';
    if (message.voice) return '[Voice message]';
    if (message.audio) return `[Audio: ${message.audio.title || 'Unknown'}]`;
    if (message.document) return `[Document: ${message.document.file_name || 'Unknown'}]`;
    if (message.location) return `Location: ${message.location.latitude}, ${message.location.longitude}`;
    if (message.sticker) return `[Sticker: ${message.sticker.emoji || ''}]`;
    if (message.contact) return `[Contact: ${message.contact.first_name} ${message.contact.phone_number}]`;
    return '[Message]';
  }

  private async extractFileId(message: any): Promise<string | undefined> {
    if (message.photo && message.photo.length > 0) {
      // Get the highest resolution photo
      return message.photo[message.photo.length - 1].file_id;
    }
    if (message.video) return message.video.file_id;
    if (message.voice) return message.voice.file_id;
    if (message.audio) return message.audio.file_id;
    if (message.document) return message.document.file_id;
    if (message.video_note) return message.video_note.file_id;
    return undefined;
  }
}
