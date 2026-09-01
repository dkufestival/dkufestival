import { api } from './api.js';

export const noticesApi = {
  list: (role = 'PARTICIPANT') => api.get('/api/notices', { auth: true, role }),
  create: (body) => api.post('/api/notices', body, { auth: true, role: 'ADMIN' }),
  remove: (id) => api.delete(`/api/notices/${id}`, { auth: true, role: 'ADMIN' }),
};
