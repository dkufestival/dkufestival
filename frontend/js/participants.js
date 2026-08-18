import { api } from './api.js';

export const participantsApi = {
  me: () => api.get('/api/participants/me', { auth: true }),
  updateMe: (body) => api.patch('/api/participants/me', body, { auth: true }),
  list: () => api.get('/api/participants', { auth: true }),
};
