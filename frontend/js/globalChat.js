import { api } from './api.js';

export const globalChatApi = {
  list: (role = 'PARTICIPANT', options = {}) => api.get('/api/global-chat', { auth: true, role, ...options }),
  send: (content, role = 'PARTICIPANT') => api.post('/api/global-chat', { content }, { auth: true, role }),
};
