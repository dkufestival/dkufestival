import { api } from './api.js';

const adminOptions = { auth: true, role: 'ADMIN' };

export const adminApi = {
  login: (body) => api.post('/api/admin/login', body),
  tables: () => api.get('/api/admin/tables', adminOptions),
  checkin: (tableId, body) => api.post(`/api/admin/tables/${tableId}/checkin`, body, adminOptions),
  extend: (tableId, body) => api.post(`/api/admin/tables/${tableId}/extend`, body, adminOptions),
  resetTime: (tableId) => api.post(`/api/admin/tables/${tableId}/reset-time`, {}, adminOptions),
  checkout: (tableId) => api.post(`/api/admin/tables/${tableId}/checkout`, {}, adminOptions),
  counts: (tableId, body) => api.patch(`/api/admin/tables/${tableId}/counts`, body, adminOptions),
  regenerateQr: (tableId) => api.post(`/api/admin/tables/${tableId}/qr/regenerate`, {}, adminOptions),
  enableQr: (tableId) => api.patch(`/api/admin/tables/${tableId}/qr/enable`, {}, adminOptions),
  disableQr: (tableId) => api.patch(`/api/admin/tables/${tableId}/qr/disable`, {}, adminOptions),
};
