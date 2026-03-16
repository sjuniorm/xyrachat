import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../../middleware/auth';
import { pool } from '../../config/database';

const router = Router();
router.use(authenticate);

// Dashboard overview stats
router.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const { from, to } = req.query;

    const dateFilter = from && to
      ? `AND created_at BETWEEN '${from}' AND '${to}'`
      : '';

    const [conversations, contacts, openConvos, avgResponse] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total FROM conversations WHERE tenant_id = $1 ${dateFilter}`, [tenantId]),
      pool.query(`SELECT COUNT(*) as total FROM contacts WHERE tenant_id = $1 ${dateFilter}`, [tenantId]),
      pool.query(`SELECT COUNT(*) as total FROM conversations WHERE tenant_id = $1 AND status = 'open'`, [tenantId]),
      pool.query(`SELECT COUNT(*) as total FROM messages WHERE tenant_id = $1 AND is_from_bot = true ${dateFilter}`, [tenantId]),
    ]);

    res.json({
      totalConversations: parseInt(conversations.rows[0].total),
      totalContacts: parseInt(contacts.rows[0].total),
      openConversations: parseInt(openConvos.rows[0].total),
      botMessages: parseInt(avgResponse.rows[0].total),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Conversations by channel
router.get('/channels', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const result = await pool.query(
      `SELECT channel_type, COUNT(*) as count FROM conversations WHERE tenant_id = $1 GROUP BY channel_type ORDER BY count DESC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Conversations over time
router.get('/conversations-timeline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const { days = '30' } = req.query;
    const result = await pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM conversations WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${parseInt(days as string)} days'
       GROUP BY DATE(created_at) ORDER BY date`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Agent performance
router.get('/agents', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name,
        COUNT(c.id) as total_conversations,
        COUNT(CASE WHEN c.status = 'closed' THEN 1 END) as closed_conversations,
        COUNT(CASE WHEN c.status = 'open' THEN 1 END) as open_conversations
       FROM users u
       LEFT JOIN conversations c ON c.assigned_user_id = u.id
       WHERE u.tenant_id = $1 AND u.is_active = true AND u.role IN ('agent', 'manager', 'admin')
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY total_conversations DESC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Lead status distribution
router.get('/leads', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const result = await pool.query(
      `SELECT lead_status, COUNT(*) as count FROM contacts WHERE tenant_id = $1 GROUP BY lead_status`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export { router as analyticsRoutes };
