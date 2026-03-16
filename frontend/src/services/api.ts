import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        if (typeof window !== 'undefined') {
          window.location.href = '/auth';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authAPI = {
  register: (data: any) => api.post('/auth/register', data),
  login: (data: any) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
};

// Conversations
export const conversationsAPI = {
  list: (params?: any) => api.get('/conversations', { params }),
  getById: (id: string) => api.get(`/conversations/${id}`),
  create: (data: any) => api.post('/conversations', data),
  updateStatus: (id: string, status: string) => api.patch(`/conversations/${id}/status`, { status }),
  assign: (id: string, data: any) => api.patch(`/conversations/${id}/assign`, data),
  sendMessage: (id: string, data: any) => api.post(`/conversations/${id}/messages`, data),
  getMessages: (id: string, params?: any) => api.get(`/conversations/${id}/messages`, { params }),
  addNote: (id: string, content: string) => api.post(`/conversations/${id}/notes`, { content }),
  getNotes: (id: string) => api.get(`/conversations/${id}/notes`),
  addTag: (id: string, tagId: string) => api.post(`/conversations/${id}/tags`, { tagId }),
  removeTag: (id: string, tagId: string) => api.delete(`/conversations/${id}/tags/${tagId}`),
};

// Contacts
export const contactsAPI = {
  list: (params?: any) => api.get('/contacts', { params }),
  getById: (id: string) => api.get(`/contacts/${id}`),
  create: (data: any) => api.post('/contacts', data),
  update: (id: string, data: any) => api.put(`/contacts/${id}`, data),
  delete: (id: string) => api.delete(`/contacts/${id}`),
  getConversations: (id: string) => api.get(`/contacts/${id}/conversations`),
};

// Channels
export const channelsAPI = {
  list: () => api.get('/channels'),
  getById: (id: string) => api.get(`/channels/${id}`),
  create: (data: any) => api.post('/channels', data),
  update: (id: string, data: any) => api.put(`/channels/${id}`, data),
  delete: (id: string) => api.delete(`/channels/${id}`),
};

// Chatbots
export const chatbotsAPI = {
  list: () => api.get('/chatbots'),
  getById: (id: string) => api.get(`/chatbots/${id}`),
  create: (data: any) => api.post('/chatbots', data),
  update: (id: string, data: any) => api.put(`/chatbots/${id}`, data),
  delete: (id: string) => api.delete(`/chatbots/${id}`),
  addDocument: (id: string, data: any) => api.post(`/chatbots/${id}/documents`, data),
  getDocuments: (id: string) => api.get(`/chatbots/${id}/documents`),
  removeDocument: (id: string, docId: string) => api.delete(`/chatbots/${id}/documents/${docId}`),
  test: (id: string, message: string) => api.post(`/chatbots/${id}/test`, { message }),
};

// Automations
export const automationsAPI = {
  list: () => api.get('/automations'),
  getById: (id: string) => api.get(`/automations/${id}`),
  create: (data: any) => api.post('/automations', data),
  update: (id: string, data: any) => api.put(`/automations/${id}`, data),
  delete: (id: string) => api.delete(`/automations/${id}`),
  getLogs: (id: string) => api.get(`/automations/${id}/logs`),
};

// Teams
export const teamsAPI = {
  list: () => api.get('/teams'),
  getById: (id: string) => api.get(`/teams/${id}`),
  create: (data: any) => api.post('/teams', data),
  update: (id: string, data: any) => api.put(`/teams/${id}`, data),
  delete: (id: string) => api.delete(`/teams/${id}`),
  addMember: (id: string, userId: string) => api.post(`/teams/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) => api.delete(`/teams/${id}/members/${userId}`),
  listUsers: () => api.get('/teams/users/all'),
};

// Analytics
export const analyticsAPI = {
  overview: (params?: any) => api.get('/analytics/overview', { params }),
  channels: () => api.get('/analytics/channels'),
  timeline: (days?: number) => api.get('/analytics/conversations-timeline', { params: { days } }),
  agents: () => api.get('/analytics/agents'),
  leads: () => api.get('/analytics/leads'),
};
