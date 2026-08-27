import { api } from './api.js';

export const songsApi = {
  create: (body) => api.post('/api/song-requests', body, { auth: true }),
  mine: () => api.get('/api/song-requests/me', { auth: true }),
  cancel: (requestId) => api.delete(`/api/song-requests/${requestId}`, { auth: true }),
  adminList: () => api.get('/api/admin/song-requests', { auth: true, role: 'ADMIN' }),
  complete: (requestId) => api.patch(`/api/admin/song-requests/${requestId}/complete`, {}, { auth: true, role: 'ADMIN' }),
};
