import { api } from './api.js';

export const entryApi = {
  context: (qrToken) => api.get(`/api/entry/context?qr=${encodeURIComponent(qrToken)}`),
  enter: (body) => api.post('/api/entry', body),
};
