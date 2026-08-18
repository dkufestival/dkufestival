const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { JoinRequest, TableSession, ChatRoom } = require('../models');
const AppError = require('../errors/AppError');

async function requireActiveSession(sessionId, code = 'SESSION_NOT_FOUND') {
  const session = await TableSession.findOne({ where: { id: sessionId, status: 'ACTIVE' } });
  if (!session || new Date(session.expiresAt) <= new Date()) {
    throw new AppError(404, code, 'Active table session not found.');
  }
  return session;
}

async function createJoinRequest(fromSessionId, data) {
  const targetSessionId = Number(data.targetSessionId);
  if (Number(fromSessionId) === targetSessionId) {
    throw new AppError(400, 'INVALID_JOIN_TARGET', 'Cannot request join to the same table session.');
  }

  await Promise.all([
    requireActiveSession(fromSessionId),
    requireActiveSession(targetSessionId, 'TARGET_NOT_FOUND'),
  ]);

  return sequelize.transaction(async (transaction) => {
    const [joinRequest] = await JoinRequest.findOrCreate({
      where: { fromSessionId, targetSessionId, status: 'PENDING' },
      defaults: { message: data.message || null },
      transaction,
    });

    const [sessionAId, sessionBId] = [Number(fromSessionId), targetSessionId].sort((a, b) => a - b);
    const [chatRoom] = await ChatRoom.findOrCreate({
      where: { sessionAId, sessionBId },
      transaction,
    });

    return { joinRequest, chatRoom };
  });
}

async function getJoinRequests(sessionId) {
  return JoinRequest.findAll({
    where: { [Op.or]: [{ fromSessionId: sessionId }, { targetSessionId: sessionId }] },
    order: [['createdAt', 'DESC']],
  });
}

async function getOwnedRequest(requestId, sessionId, ownerField) {
  const request = await JoinRequest.findByPk(requestId);
  if (!request) throw new AppError(404, 'JOIN_REQUEST_NOT_FOUND', 'Join request not found.');
  if (request[ownerField] !== Number(sessionId)) {
    throw new AppError(403, 'JOIN_REQUEST_FORBIDDEN', 'No permission to change this request.');
  }
  if (request.status !== 'PENDING') throw new AppError(409, 'JOIN_REQUEST_CLOSED', 'Join request is already closed.');
  return request;
}

async function acceptJoinRequest(requestId, sessionId) {
  return (await getOwnedRequest(requestId, sessionId, 'targetSessionId')).update({ status: 'ACCEPTED' });
}

async function rejectJoinRequest(requestId, sessionId) {
  return (await getOwnedRequest(requestId, sessionId, 'targetSessionId')).update({ status: 'REJECTED' });
}

async function cancelJoinRequest(requestId, sessionId) {
  return (await getOwnedRequest(requestId, sessionId, 'fromSessionId')).update({ status: 'CANCELLED' });
}

module.exports = { createJoinRequest, getJoinRequests, acceptJoinRequest, rejectJoinRequest, cancelJoinRequest };
