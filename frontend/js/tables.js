import { api } from './api.js';

export const tablesApi = {
  list: () => api.get('/api/tables'),
  updateAccepting: (acceptingRequests) => api.patch('/api/tables/me/accepting', { acceptingRequests }, { auth: true }),
  likes: () => api.get('/api/tables/likes/mine', { auth: true }),
  toggleLike: (tableId) => api.post(`/api/tables/${tableId}/like`, {}, { auth: true }),
  staffCallStatus: () => api.get('/api/tables/me/staff-call', { auth: true }),
  callStaff: () => api.post('/api/tables/me/staff-call', {}, { auth: true }),
  cancelStaffCall: () => api.delete('/api/tables/me/staff-call', { auth: true }),
};
