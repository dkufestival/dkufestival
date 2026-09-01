import { api } from './api.js';

const participantOptions = { auth: true, role: 'PARTICIPANT' };

export const basketballApi = {
  leaderboard: () => api.get('/api/basketball/leaderboard', { toast: false }),
  state: () => api.get('/api/basketball/state', participantOptions),
  submitScore: (score) => api.post('/api/basketball/scores', { score }, participantOptions),
};
