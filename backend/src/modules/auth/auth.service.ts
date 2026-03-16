import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { UserRole } from '../../types';

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantName: string;
  tenantSlug: string;
}

export class AuthService {
  async register(input: RegisterInput) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existingTenant = await client.query(
        'SELECT id FROM tenants WHERE slug = $1',
        [input.tenantSlug]
      );
      if (existingTenant.rows.length > 0) {
        throw new AppError('Tenant slug already exists', 409);
      }

      const tenantResult = await client.query(
        `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
        [input.tenantName, input.tenantSlug]
      );
      const tenantId = tenantResult.rows[0].id;

      const passwordHash = await bcrypt.hash(input.password, 12);
      const userResult = await client.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, first_name, last_name, role`,
        [tenantId, input.email, passwordHash, input.firstName, input.lastName, UserRole.ADMIN]
      );

      const user = userResult.rows[0];
      const tokens = await this.generateTokens(user.id, tenantId, UserRole.ADMIN, client);

      await client.query('COMMIT');

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          tenantId,
        },
        ...tokens,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async login(email: string, password: string, tenantSlug: string) {
    const result = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.role, u.tenant_id, u.is_active
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND t.slug = $2`,
      [email, tenantSlug]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invalid credentials', 401);
    }

    const user = result.rows[0];
    if (!user.is_active) {
      throw new AppError('Account is deactivated', 403);
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new AppError('Invalid credentials', 401);
    }

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const tokens = await this.generateTokens(user.id, user.tenant_id, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        tenantId: user.tenant_id,
      },
      ...tokens,
    };
  }

  async refreshAccessToken(refreshToken: string) {
    const result = await pool.query(
      `SELECT rt.user_id, u.tenant_id, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token = $1 AND rt.expires_at > NOW()`,
      [refreshToken]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const { user_id, tenant_id, role } = result.rows[0];

    const accessToken = this.signAccessToken(user_id, tenant_id, role);

    return { accessToken };
  }

  async revokeRefreshToken(token: string) {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
  }

  async getUserProfile(userId: string) {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, avatar, tenant_id, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      avatar: user.avatar,
      tenantId: user.tenant_id,
      createdAt: user.created_at,
    };
  }

  private async generateTokens(userId: string, tenantId: string, role: UserRole, client?: any) {
    const accessToken = this.signAccessToken(userId, tenantId, role);

    const refreshTokenValue = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const queryRunner = client || pool;
    await queryRunner.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [userId, refreshTokenValue, expiresAt]
    );

    return { accessToken, refreshToken: refreshTokenValue };
  }

  private signAccessToken(userId: string, tenantId: string, role: UserRole): string {
    return jwt.sign(
      { userId, tenantId, role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRY as any }
    );
  }
}
