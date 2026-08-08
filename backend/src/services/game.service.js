// 게임 비즈니스 로직
const { GameSession } = require('../models');

async function createInvite(fromSessionId, data) {
  // TODO: 게임 세부 기획이 확정되면 1:1 게임 초대를 저장한다.
  return { fromSessionId, ...data };
}

async function acceptInvite(sessionId, data) {
  // TODO: 초대 수락 후 GameSession을 생성한다.
  return { sessionId, ...data };
}

async function handleAction(sessionId, data) {
  // TODO: 게임 액션을 검증하고 현재 게임 상태에 반영한다.
  return { sessionId, ...data };
}

async function startGlobalGame(data) {
  // TODO: 관리자 전용 전체 참여 게임 생명주기를 구현한다.
  return GameSession.create({
    type: data.type || 'GLOBAL',
    status: 'PENDING',
    state: data.state || null,
    startedAt: null,
    endedAt: null,
  });
}

module.exports = {
  createInvite,
  acceptInvite,
  handleAction,
  startGlobalGame,
};
