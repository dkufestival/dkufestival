const { Op } = require('sequelize');
const { JoinRequest, TableSession } = require('../models');
const AppError = require('../errors/AppError');

async function createJoinRequest(fromSessionId, data) {
  const targetSessionId = Number(data.targetSessionId);
  if (Number(fromSessionId) === targetSessionId) {
    throw new AppError(400, 'INVALID_JOIN_TARGET', '자기 좌석에는 요청할 수 없습니다.');
  }

  const target = await TableSession.findOne({ where: { id: targetSessionId, status: 'ACTIVE' } });
  if (!target) throw new AppError(404, 'TARGET_NOT_FOUND', '대상 좌석 세션을 찾을 수 없습니다.');

  const [request] = await JoinRequest.findOrCreate({
    where: { fromSessionId, targetSessionId, status: 'PENDING' },
    defaults: { message: data.message || null },
  });
  return request;
}

async function getJoinRequests(sessionId) {
  return JoinRequest.findAll({
    where: { [Op.or]: [{ fromSessionId: sessionId }, { targetSessionId: sessionId }] },
    order: [['createdAt', 'DESC']],
  });
}

async function getOwnedRequest(requestId, sessionId, ownerField) {
  const request = await JoinRequest.findByPk(requestId);
  if (!request) throw new AppError(404, 'JOIN_REQUEST_NOT_FOUND', '합석 요청을 찾을 수 없습니다.');
  if (request[ownerField] !== Number(sessionId)) {
    throw new AppError(403, 'JOIN_REQUEST_FORBIDDEN', '해당 요청을 변경할 권한이 없습니다.');
  }
  if (request.status !== 'PENDING') throw new AppError(409, 'JOIN_REQUEST_CLOSED', '이미 처리된 요청입니다.');
  return request;
}

async function acceptJoinRequest(requestId, sessionId) {
  return (await getOwnedRequest(requestId, sessionId, 'targetSessionId')).update({ status: 'ACCEPTED' });
}

async function rejectJoinRequest(requestId, sessionId) {
  return (await getOwnedRequest(requestId, sessionId, 'targetSessionId')).update({ status: 'REJECTED' });
}

async function cancelJoinRequest(requestId, sessionId) {
  await (await getOwnedRequest(requestId, sessionId, 'fromSessionId')).destroy();
}

module.exports = { createJoinRequest, getJoinRequests, acceptJoinRequest, rejectJoinRequest, cancelJoinRequest };
