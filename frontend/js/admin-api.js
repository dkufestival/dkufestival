import { api } from './api.js';

const adminOptions = { auth: true, role: 'ADMIN' };

export const adminApi = {
  login: (body) => api.post('/api/admin/login', body),
  tables: () => api.get('/api/admin/tables', adminOptions),
  participants: () => api.get('/api/admin/participants', adminOptions),
  kickParticipant: (participantId, body = {}) => api.post(`/api/admin/participants/${participantId}/kick`, body, adminOptions),
  restoreParticipant: (participantId) => api.post(`/api/admin/participants/${participantId}/restore`, {}, adminOptions),
  checkin: (tableId, body) => api.post(`/api/admin/tables/${tableId}/checkin`, body, adminOptions),
  extend: (tableId, body) => api.post(`/api/admin/tables/${tableId}/extend`, body, adminOptions),
  resetTime: (tableId) => api.post(`/api/admin/tables/${tableId}/reset-time`, {}, adminOptions),
  checkout: (tableId) => api.post(`/api/admin/tables/${tableId}/checkout`, {}, adminOptions),
  counts: (tableId, body) => api.patch(`/api/admin/tables/${tableId}/counts`, body, adminOptions),
  regenerateQr: (tableId) => api.post(`/api/admin/tables/${tableId}/qr/regenerate`, {}, adminOptions),
  enableQr: (tableId) => api.patch(`/api/admin/tables/${tableId}/qr/enable`, {}, adminOptions),
  disableQr: (tableId) => api.patch(`/api/admin/tables/${tableId}/qr/disable`, {}, adminOptions),
  clearGlobalChat: () => api.delete('/api/admin/global-chat', adminOptions),
  resetAllData: () => api.post('/api/admin/data/reset', {}, adminOptions),
  chatRooms: (status = 'ACTIVE') => api.get(`/api/admin/chat/rooms?status=${encodeURIComponent(status)}`, adminOptions),
  endChatRoom: (roomId) => api.post(`/api/admin/chat/rooms/${roomId}/end`, {}, adminOptions),
  staffCalls: () => api.get('/api/admin/staff-calls', adminOptions),
  resolveStaffCall: (id) => api.post(`/api/admin/staff-calls/${id}/resolve`, {}, adminOptions),
};
