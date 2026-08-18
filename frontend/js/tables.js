import { api } from './api.js';

export const tablesApi = {
  list: () => api.get('/api/tables'),
  updateMine: (body) => api.patch('/api/tables/me', body, { auth: true }),
};
