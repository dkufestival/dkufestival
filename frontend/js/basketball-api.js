import { api } from './api.js';

const participantOptions = { auth: true, role: 'PARTICIPANT' };

export const basketballApi = {
  leaderboard: () => api.get('/api/basketball/leaderboard', { toast: false }),
  state: () => api.get('/api/basketball/state', participantOptions),
  submitScore: (gameId, score) => api.post('/api/basketball/scores', { gameId, score }, participantOptions),
};
