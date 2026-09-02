import { api } from './api.js';

export const boardApi = {
  list: (role = 'PARTICIPANT') => api.get('/api/board', { auth: true, role }),
  create: (title, content) => api.post('/api/board', { title, content }, { auth: true }),
  remove: (id, role = 'PARTICIPANT') => api.delete(`/api/board/${id}`, { auth: true, role }),
  profile: () => api.get('/api/board/profile', { auth: true }),
  saveProfile: (body) => api.put('/api/board/profile', body, { auth: true }),
  posts: (role = 'PARTICIPANT') => api.get('/api/board', { auth: true, role }),
  createPost: (body) => api.post('/api/board', body, { auth: true }),
  post: (id, role = 'PARTICIPANT') => api.get(`/api/board/${id}`, { auth: true, role }),
  removePost: (id) => api.delete(`/api/board/${id}`, { auth: true }),
  revealProfile: (id) => api.post(`/api/board/${id}/reveal`, {}, { auth: true }),
  profileViews: () => api.get('/api/board/profile-views', { auth: true }),
};
