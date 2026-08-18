import { api } from './api.js';

export const joinApi = {
  create: (body) => api.post('/api/join-requests', body, { auth: true }),
  list: () => api.get('/api/join-requests', { auth: true }),
  accept: (requestId) => api.patch(`/api/join-requests/${requestId}/accept`, {}, { auth: true }),
  reject: (requestId) => api.patch(`/api/join-requests/${requestId}/reject`, {}, { auth: true }),
  cancel: (requestId) => api.delete(`/api/join-requests/${requestId}`, { auth: true }),
};
