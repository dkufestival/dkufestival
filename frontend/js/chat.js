import { api } from './api.js';

export const chatApi = {
  createRoom: (body) => api.post('/api/chat/rooms', body, { auth: true }),
  rooms: () => api.get('/api/chat/rooms', { auth: true }),
  messages: (roomId) => api.get(`/api/chat/rooms/${roomId}/messages`, { auth: true }),
};
