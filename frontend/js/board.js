import { api } from './api.js';

export const boardApi = {
  list: (role = 'PARTICIPANT') => api.get('/api/board', { auth: true, role }),
  create: (title, content) => api.post('/api/board', { title, content }, { auth: true }),
  remove: (id, role = 'PARTICIPANT') => api.delete(`/api/board/${id}`, { auth: true, role }),
};
