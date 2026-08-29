const { SongRequest, Participant, TableSession, Table } = require('../models');
const AppError = require('../errors/AppError');

async function create(user, data) {
  if (!data.songTitle?.trim()) throw new AppError(400, 'INVALID_SONG_TITLE', 'songTitle is required.');
  return SongRequest.create({
    tableSessionId: user.sessionId,
    participantId: user.participantId,
    songTitle: data.songTitle.trim(),
    artist: data.artist?.trim() || null,
  });
}

async function listMine(user) {
  return SongRequest.findAll({
    where: { tableSessionId: user.sessionId, participantId: user.participantId },
    order: [['createdAt', 'DESC']],
  });
}

async function cancel(user, requestId) {
  const request = await SongRequest.findOne({
    where: { id: requestId, participantId: user.participantId, tableSessionId: user.sessionId },
  });
  if (!request) throw new AppError(404, 'SONG_REQUEST_NOT_FOUND', 'Song request not found.');
  return request.update({ status: 'CANCELLED' });
}

async function listAdmin() {
  return SongRequest.findAll({
    include: [
      { model: Participant, as: 'participant', attributes: ['id', 'nickname'] },
      {
        model: TableSession,
        as: 'session',
        attributes: ['id'],
        include: [{ model: Table, as: 'table', attributes: ['tableNumber'] }],
      },
    ],
    order: [['createdAt', 'DESC']],
  });
}

async function complete(requestId) {
  const request = await SongRequest.findByPk(requestId);
  if (!request) throw new AppError(404, 'SONG_REQUEST_NOT_FOUND', 'Song request not found.');
  return request.update({ status: 'COMPLETED' });
}

module.exports = { create, listMine, cancel, listAdmin, complete };
