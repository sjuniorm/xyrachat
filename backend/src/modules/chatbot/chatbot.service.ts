import OpenAI from 'openai';
import { pool } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

export class ChatbotService {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      if (!env.OPENAI_API_KEY) throw new AppError('OpenAI API key not configured', 500);
      this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
    return this.openai;
  }

  async list(tenantId: string) {
    const result = await pool.query(
      'SELECT * FROM chatbot_configs WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    return result.rows;
  }

  async getById(tenantId: string, id: string) {
    const result = await pool.query(
      'SELECT * FROM chatbot_configs WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (result.rows.length === 0) throw new AppError('Chatbot not found', 404);
    return result.rows[0];
  }

  async create(tenantId: string, data: any) {
    const result = await pool.query(
      `INSERT INTO chatbot_configs (tenant_id, name, system_prompt, welcome_message, fallback_message, escalation_message, model, temperature, max_tokens, languages, rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        tenantId, data.name, data.systemPrompt, data.welcomeMessage,
        data.fallbackMessage || "I'm sorry, I don't have an answer for that. Let me connect you with a human agent.",
        data.escalationMessage || 'Connecting you with a human agent...',
        data.model || 'gpt-4', data.temperature || 7, data.maxTokens || 500,
        JSON.stringify(data.languages || ['en']), JSON.stringify(data.rules || []),
      ]
    );
    return result.rows[0];
  }

  async update(tenantId: string, id: string, data: any) {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const map: Record<string, string> = {
      name: 'name', systemPrompt: 'system_prompt', welcomeMessage: 'welcome_message',
      fallbackMessage: 'fallback_message', escalationMessage: 'escalation_message',
      model: 'model', temperature: 'temperature', maxTokens: 'max_tokens',
      isActive: 'is_active',
    };

    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        params.push(data[key]);
      }
    }
    if (data.languages) { fields.push(`languages = $${idx++}`); params.push(JSON.stringify(data.languages)); }
    if (data.rules) { fields.push(`rules = $${idx++}`); params.push(JSON.stringify(data.rules)); }

    if (fields.length === 0) throw new AppError('No fields to update', 400);

    params.push(id, tenantId);
    const result = await pool.query(
      `UPDATE chatbot_configs SET ${fields.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) throw new AppError('Chatbot not found', 404);
    return result.rows[0];
  }

  async delete(tenantId: string, id: string) {
    const result = await pool.query(
      'DELETE FROM chatbot_configs WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, tenantId]
    );
    if (result.rows.length === 0) throw new AppError('Chatbot not found', 404);
  }

  async addDocument(tenantId: string, chatbotId: string, data: any) {
    const result = await pool.query(
      `INSERT INTO knowledge_base_documents (tenant_id, chatbot_id, title, source_type, source_url, content)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, chatbotId, data.title, data.sourceType, data.sourceUrl, data.content]
    );
    // TODO: Trigger async embedding job via BullMQ
    return result.rows[0];
  }

  async getDocuments(tenantId: string, chatbotId: string) {
    const result = await pool.query(
      'SELECT * FROM knowledge_base_documents WHERE chatbot_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
      [chatbotId, tenantId]
    );
    return result.rows;
  }

  async removeDocument(tenantId: string, docId: string) {
    const result = await pool.query(
      'DELETE FROM knowledge_base_documents WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [docId, tenantId]
    );
    if (result.rows.length === 0) throw new AppError('Document not found', 404);
  }

  async processIncomingMessage(tenantId: string, conversationId: string, message: string): Promise<string | null> {
    const convResult = await pool.query(
      `SELECT c.*, ch.type as channel_type_name FROM conversations c
       JOIN channels ch ON ch.id = c.channel_id
       WHERE c.id = $1 AND c.tenant_id = $2 AND c.is_bot_active = true`,
      [conversationId, tenantId]
    );

    if (convResult.rows.length === 0) return null;

    const botConfigs = await pool.query(
      'SELECT * FROM chatbot_configs WHERE tenant_id = $1 AND is_active = true LIMIT 1',
      [tenantId]
    );

    if (botConfigs.rows.length === 0) return null;

    const config = botConfigs.rows[0];
    return this.generateResponse(config, tenantId, conversationId, message);
  }

  async generateResponse(config: any, tenantId: string, conversationId: string, userMessage: string): Promise<string> {
    try {
      const openai = this.getOpenAI();

      const historyResult = await pool.query(
        `SELECT content, direction, is_from_bot FROM messages
         WHERE conversation_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT 10`,
        [conversationId, tenantId]
      );

      const conversationHistory: OpenAI.Chat.ChatCompletionMessageParam[] = historyResult.rows.reverse().map((m: any) => ({
        role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
        content: m.content || '',
      }));

      // Retrieve relevant knowledge base chunks
      let contextChunks = '';
      const kbResult = await pool.query(
        `SELECT kc.content FROM knowledge_base_chunks kc
         JOIN knowledge_base_documents kd ON kd.id = kc.document_id
         WHERE kd.tenant_id = $1 AND (kd.chatbot_id = $2 OR kd.chatbot_id IS NULL)
         LIMIT 5`,
        [tenantId, config.id]
      );
      if (kbResult.rows.length > 0) {
        contextChunks = '\n\nRelevant knowledge base context:\n' + kbResult.rows.map((r: any) => r.content).join('\n---\n');
      }

      const systemPrompt = (config.system_prompt || 'You are a helpful customer support assistant.') + contextChunks;

      const rulesText = config.rules?.length
        ? '\n\nRules you must follow:\n' + config.rules.map((r: string) => `- ${r}`).join('\n')
        : '';

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt + rulesText },
        ...conversationHistory,
        { role: 'user', content: userMessage },
      ];

      const completion = await openai.chat.completions.create({
        model: config.model || 'gpt-4',
        messages,
        temperature: (config.temperature || 7) / 10,
        max_tokens: config.max_tokens || 500,
      });

      const response = completion.choices[0]?.message?.content || config.fallback_message || 'I apologize, I could not process your request.';

      // Check for escalation signals
      const escalationKeywords = ['human agent', 'speak to someone', 'real person', 'escalate'];
      const needsEscalation = escalationKeywords.some(kw => userMessage.toLowerCase().includes(kw));

      if (needsEscalation) {
        await pool.query(
          'UPDATE conversations SET is_bot_active = false, status = $1 WHERE id = $2',
          ['pending', conversationId]
        );
        return config.escalation_message || 'Connecting you with a human agent...';
      }

      return response;
    } catch (error) {
      logger.error('Chatbot response generation failed', error);
      return config.fallback_message || 'I apologize, something went wrong. Let me connect you with a human agent.';
    }
  }

  async testChatbot(tenantId: string, chatbotId: string, message: string) {
    const config = await this.getById(tenantId, chatbotId);
    const response = await this.generateResponse(config, tenantId, 'test', message);
    return { response };
  }
}
