import { api } from './api.js';

export const chatApi = {
  createRequest: (body) => api.post('/api/chat/requests', body, { auth: true }),
  requests: (query = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const suffix = params.toString() ? `?${params}` : '';
    return api.get(`/api/chat/requests${suffix}`, { auth: true });
  },
  accept: (roomId) => api.post(`/api/chat/requests/${roomId}/accept`, {}, { auth: true }),
  reject: (roomId) => api.post(`/api/chat/requests/${roomId}/reject`, {}, { auth: true }),
  cancel: (roomId) => api.delete(`/api/chat/requests/${roomId}`, { auth: true }),
  active: () => api.get('/api/chat/active', { auth: true }),
  messages: (roomId) => api.get(`/api/chat/rooms/${roomId}/messages`, { auth: true }),
  end: (roomId) => api.post(`/api/chat/rooms/${roomId}/end`, {}, { auth: true }),
};
