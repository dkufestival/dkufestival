// 합석 요청 비즈니스 로직
const { JoinRequest } = require('../models');

async function createJoinRequest(fromSessionId, data) {
  // TODO: 대상 세션 상태와 중복 PENDING 요청 여부를 검증한다.
  return JoinRequest.create({
    fromSessionId,
    targetSessionId: data.targetSessionId,
    message: data.message,
    status: 'PENDING',
  });
}

async function getJoinRequests(sessionId) {
  // TODO: 클라이언트 화면 요구에 따라 보낸/받은 요청을 분리한다.
  return JoinRequest.findAll({
    where: {
      targetSessionId: sessionId,
    },
  });
}

async function acceptJoinRequest(requestId, sessionId) {
  // TODO: sessionId가 요청 대상 세션인지 검증한다.
  const request = await JoinRequest.findByPk(requestId);
  return request ? request.update({ status: 'ACCEPTED' }) : null;
}

async function rejectJoinRequest(requestId, sessionId) {
  // TODO: sessionId가 요청 대상 세션인지 검증한다.
  const request = await JoinRequest.findByPk(requestId);
  return request ? request.update({ status: 'REJECTED' }) : null;
}

async function cancelJoinRequest(requestId, sessionId) {
  // TODO: sessionId가 요청을 보낸 세션인지 검증한다.
  const request = await JoinRequest.findByPk(requestId);
  if (request) {
    await request.destroy();
  }
}

module.exports = {
  createJoinRequest,
  getJoinRequests,
  acceptJoinRequest,
  rejectJoinRequest,
  cancelJoinRequest,
};
