import { api } from './api.js';

export const monitorApi = { list: () => api.get('/api/monitor/tables', { toast: false }) };
