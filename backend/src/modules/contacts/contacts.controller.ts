import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { ContactsService } from './contacts.service';

const service = new ContactsService();

export class ContactsController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const { search, leadStatus, page = '1', limit = '20' } = req.query;
      const result = await service.list(tenantId, {
        search: search as string,
        leadStatus: leadStatus as string,
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
      const contact = await service.getById(tenantId, req.params.id);
      res.json(contact);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const contact = await service.create(tenantId, req.body);
      res.status(201).json(contact);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const contact = await service.update(tenantId, req.params.id, req.body);
      res.json(contact);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      await service.delete(tenantId, req.params.id);
      res.json({ message: 'Contact deleted' });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async getConversations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const conversations = await service.getConversations(tenantId, req.params.id);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async addTag(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await service.addTag(req.params.id, req.body.tagId);
      res.json({ message: 'Tag added' });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async removeTag(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await service.removeTag(req.params.id, req.params.tagId);
      res.json({ message: 'Tag removed' });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
}
