import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from '../../middleware/auth';

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, firstName, lastName, tenantName, tenantSlug } = req.body;

      if (!email || !password || !firstName || !lastName || !tenantName || !tenantSlug) {
        res.status(400).json({ error: 'All fields are required' });
        return;
      }

      const result = await authService.register({
        email,
        password,
        firstName,
        lastName,
        tenantName,
        tenantSlug,
      });

      res.status(201).json(result);
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Registration failed' });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, tenantSlug } = req.body;

      if (!email || !password || !tenantSlug) {
        res.status(400).json({ error: 'Email, password, and tenant slug are required' });
        return;
      }

      const result = await authService.login(email, password, tenantSlug);
      res.json(result);
    } catch (error: any) {
      res.status(error.statusCode || 401).json({ error: error.message || 'Login failed' });
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res.status(400).json({ error: 'Refresh token is required' });
        return;
      }
      const result = await authService.refreshAccessToken(refreshToken);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message || 'Token refresh failed' });
    }
  }

  async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await authService.revokeRefreshToken(refreshToken);
      }
      res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Logout failed' });
    }
  }

  async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantContext) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const user = await authService.getUserProfile(req.tenantContext.userId);
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get profile' });
    }
  }
}
