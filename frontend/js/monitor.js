import { api } from './api.js';

export const monitorApi = {
  authenticate: (token) => api.post('/api/monitor/auth', { token }, { toast: false }),
  staffCallTest: () => api.post('/api/monitor/staff-call-test', {}, { auth: true, role: 'MONITOR' }),
};
