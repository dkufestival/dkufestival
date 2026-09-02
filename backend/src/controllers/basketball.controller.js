const basketballScoreService = require('../services/basketball-score.service');

async function leaderboard(req, res, next) {
  try {
    res.json({ data: await basketballScoreService.getLeaderboard() });
  } catch (error) {
    next(error);
  }
}

async function state(req, res, next) {
  try {
    res.json({ data: await basketballScoreService.getState(req.user.participantId) });
  } catch (error) {
    next(error);
  }
}

async function submitScore(req, res, next) {
  try {
    const result = await basketballScoreService.submitBestScore({
      participantId: req.user.participantId,
      tableSessionId: req.user.sessionId,
      score: req.body.score,
    });
    const leaderboard = await basketballScoreService.getLeaderboard();
    const io = req.app.get('io');
    if (io) io.to('participants').to('monitors').to('admins').emit('basketball:leaderboard', { leaderboard });
    res.json({
      data: {
        improved: result.improved,
        personalBest: result.personalBest,
        leaderboard,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { leaderboard, state, submitScore };
