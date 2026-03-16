import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { ChatbotService } from './chatbot.service';

const service = new ChatbotService();

export class ChatbotController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const result = await service.list(tenantId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const bot = await service.getById(tenantId, req.params.id);
      res.json(bot);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const bot = await service.create(tenantId, req.body);
      res.status(201).json(bot);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const bot = await service.update(tenantId, req.params.id, req.body);
      res.json(bot);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      await service.delete(tenantId, req.params.id);
      res.json({ message: 'Chatbot deleted' });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async addDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const doc = await service.addDocument(tenantId, req.params.id, req.body);
      res.status(201).json(doc);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async getDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const docs = await service.getDocuments(tenantId, req.params.id);
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async removeDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      await service.removeDocument(tenantId, req.params.docId);
      res.json({ message: 'Document removed' });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async testChatbot(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const response = await service.testChatbot(tenantId, req.params.id, req.body.message);
      res.json(response);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
}
