import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { AutomationService } from './automation.service';

const service = new AutomationService();

export class AutomationController {
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
      const workflow = await service.getById(tenantId, req.params.id);
      res.json(workflow);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const workflow = await service.create(tenantId, req.body);
      res.status(201).json(workflow);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const workflow = await service.update(tenantId, req.params.id, req.body);
      res.json(workflow);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      await service.delete(tenantId, req.params.id);
      res.json({ message: 'Workflow deleted' });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  async getLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.tenantContext!;
      const logs = await service.getLogs(tenantId, req.params.id);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
