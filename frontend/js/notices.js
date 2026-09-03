import { api } from './api.js';

export const noticesApi = {
  list: (role = 'PARTICIPANT', options = {}) => api.get('/api/notices', { auth: true, role, ...options }),
  create: (body) => api.post('/api/notices', body, { auth: true, role: 'ADMIN' }),
  remove: (id) => api.delete(`/api/notices/${id}`, { auth: true, role: 'ADMIN' }),
};
