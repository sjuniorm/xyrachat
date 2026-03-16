import { Router, Response } from 'express';
import { authenticate, authorize, AuthenticatedRequest } from '../../middleware/auth';
import { UserRole } from '../../types';
import { pool } from '../../config/database';

const router = Router();
router.use(authenticate);

// List teams
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const result = await pool.query(
      `SELECT t.*, 
        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
       FROM teams t WHERE t.tenant_id = $1 ORDER BY t.name`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get team by ID with members
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const teamResult = await pool.query(
      'SELECT * FROM teams WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    if (teamResult.rows.length === 0) { res.status(404).json({ error: 'Team not found' }); return; }

    const membersResult = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.avatar
       FROM team_members tm JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1`,
      [req.params.id]
    );

    res.json({ ...teamResult.rows[0], members: membersResult.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create team
router.post('/', authorize(UserRole.ADMIN, UserRole.MANAGER), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO teams (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [tenantId, name, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update team
router.put('/:id', authorize(UserRole.ADMIN, UserRole.MANAGER), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const { name, description } = req.body;
    const result = await pool.query(
      'UPDATE teams SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 AND tenant_id = $4 RETURNING *',
      [name, description, req.params.id, tenantId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Team not found' }); return; }
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete team
router.delete('/:id', authorize(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const result = await pool.query(
      'DELETE FROM teams WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, tenantId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Team not found' }); return; }
    res.json({ message: 'Team deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add member
router.post('/:id/members', authorize(UserRole.ADMIN, UserRole.MANAGER), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.body;
    await pool.query(
      'INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, userId]
    );
    res.json({ message: 'Member added' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Remove member
router.delete('/:id/members/:userId', authorize(UserRole.ADMIN, UserRole.MANAGER), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await pool.query(
      'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.json({ message: 'Member removed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List users for the tenant (for assignment dropdowns)
router.get('/users/all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.tenantContext!;
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, role, avatar FROM users WHERE tenant_id = $1 AND is_active = true ORDER BY first_name',
      [tenantId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export { router as teamRoutes };
