import { api } from './api.js';

export const globalChatApi = {
  list: (role = 'PARTICIPANT') => api.get('/api/global-chat', { auth: true, role }),
  send: (content, role = 'PARTICIPANT') => api.post('/api/global-chat', { content }, { auth: true, role }),
};
