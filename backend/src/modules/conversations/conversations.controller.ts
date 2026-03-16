import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { ConversationsService } from './conversations.service';

const service = new ConversationsService();

export class ConversationsController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const { status, assignedUserId, channelType, page = '1', limit = '20' } = req.query;
      const result = await service.list(tenantId, {
        status: status as string,
        assignedUserId: assignedUserId as string,
        channelType: channelType as string,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const conversation = await service.getById(tenantId, req.params.id);
      res.json(conversation);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId, userId } = req.tenantContext!;
      const conversation = await service.create(tenantId, userId, req.body);
      res.status(201).json(conversation);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async updateStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const { status } = req.body;
      const conversation = await service.updateStatus(tenantId, req.params.id, status);
      res.json(conversation);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async assign(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const { userId, teamId } = req.body;
      const conversation = await service.assign(tenantId, req.params.id, userId, teamId);
      res.json(conversation);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async sendMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId, userId } = req.tenantContext!;
      const message = await service.sendMessage(tenantId, userId, req.params.id, req.body);
      res.status(201).json(message);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async getMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const { page = '1', limit = '50' } = req.query;
      const messages = await service.getMessages(tenantId, req.params.id, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      });
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async addNote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId, userId } = req.tenantContext!;
      const note = await service.addNote(tenantId, userId, req.params.id, req.body.content);
      res.status(201).json(note);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async getNotes(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const notes = await service.getNotes(tenantId, req.params.id);
      res.json(notes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async addTag(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      await service.addTag(tenantId, req.params.id, req.body.tagId);
      res.json({ message: 'Tag added' });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async removeTag(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      await service.removeTag(tenantId, req.params.id, req.params.tagId);
      res.json({ message: 'Tag removed' });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
}
