import { api } from './api.js';

export const chatApi = {
  createRequest: (body) => api.post('/api/chat/requests', body, { auth: true }),
  getBlock: (targetSessionId) => api.get(`/api/chat/blocks/${targetSessionId}`, { auth: true }),
  block: (targetSessionId) => api.put(`/api/chat/blocks/${targetSessionId}`, {}, { auth: true }),
  unblock: (targetSessionId) => api.delete(`/api/chat/blocks/${targetSessionId}`, { auth: true }),
  listRequests: (params) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return api.get(`/api/chat/requests${query}`, { auth: true });
  },
  accept: (roomId) => api.post(`/api/chat/requests/${roomId}/accept`, {}, { auth: true }),
  reject: (roomId) => api.post(`/api/chat/requests/${roomId}/reject`, {}, { auth: true }),
  cancel: (roomId) => api.delete(`/api/chat/requests/${roomId}`, { auth: true }),
  active: () => api.get('/api/chat/active', { auth: true }),
  messages: (roomId) => api.get(`/api/chat/rooms/${roomId}/messages`, { auth: true }),
  end: (roomId) => api.post(`/api/chat/rooms/${roomId}/end`, {}, { auth: true }),
};
