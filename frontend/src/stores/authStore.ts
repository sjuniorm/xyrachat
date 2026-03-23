import { create } from 'zustand';
import { User, UserRole } from '@/types';
import { authAPI } from '@/services/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, tenantSlug: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  devLogin: () => void;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password, tenantSlug) => {
    const { data } = await authAPI.login({ email, password, tenantSlug });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true, isLoading: false });
  },

  register: async (formData) => {
    const { data } = await authAPI.register(formData);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true, isLoading: false });
  },

  devLogin: () => {
    const mockUser: User = {
      id: 'dev-user-001',
      email: 'dev@xyrachat.io',
      firstName: 'Dev',
      lastName: 'User',
      role: 'admin' as UserRole,
      tenantId: 'dev-tenant-001',
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem('accessToken', 'dev-token');
    set({ user: mockUser, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) authAPI.logout(refreshToken).catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false });
  },

  loadUser: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        set({ isLoading: false });
        return;
      }
      if (token === 'dev-token') {
        const mockUser: User = {
          id: 'dev-user-001',
          email: 'dev@xyrachat.io',
          firstName: 'Dev',
          lastName: 'User',
          role: 'admin' as UserRole,
          tenantId: 'dev-tenant-001',
          createdAt: new Date().toISOString(),
        };
        set({ user: mockUser, isAuthenticated: true, isLoading: false });
        return;
      }
      const { data } = await authAPI.me();
      set({ user: data, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
