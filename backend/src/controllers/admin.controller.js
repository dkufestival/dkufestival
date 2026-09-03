//관리자 컨트롤러
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../errors/AppError');
const tableService = require('../services/table.service');
const lifecycleService = require('../services/lifecycle.service');
const { emitPublicTableUpdate } = require('../socket/table-updates');
const { Op } = require('sequelize');
const { GameSession, GlobalChatMessage, BasketballScore, TableSession, Participant, Table } = require('../models');
const sequelize = require('../config/db');
const globalChatService = require('../services/globalChat.service');
const boardService = require('../services/board.service');
const chatService = require('../services/chat.service');

async function login(req, res, next) {
  try {
    if (!env.admin.password) {
      throw new AppError(503, 'ADMIN_NOT_CONFIGURED', 'ADMIN_PASSWORD 환경변수를 먼저 설정해야 합니다.');
    }
    if (req.body.id !== env.admin.id || req.body.password !== env.admin.password) {
      throw new AppError(401, 'INVALID_ADMIN_CREDENTIALS', '관리자 로그인 정보가 올바르지 않습니다.');
    }

    const token = jwt.sign({ role: 'ADMIN' }, env.jwtSecret, {
      expiresIn: '1d',
    });

    res.json({ data: { token } });
  } catch (error) {
    next(error);
  }
}

async function getTables(req, res, next) {
  try {
    const tables = await tableService.getTables({ includeQrToken: true });
    res.json({ data: tables });
  } catch (error) {
    next(error);
  }
}

async function getParticipants(req, res, next) {
  try {
    const participants = await Participant.findAll({
      include: [{
        model: TableSession,
        as: 'session',
        required: true,
        include: [{ model: Table, as: 'table', attributes: ['id', 'tableNumber'] }],
      }],
      order: [['kickedAt', 'ASC'], ['createdAt', 'DESC']],
    });
    res.json({ data: participants });
  } catch (error) { next(error); }
}

async function changeParticipantAccess(req, res, next, { block }) {
  const transaction = await sequelize.transaction();
  let autoCheckoutResult = null;
  try {
    const participant = await Participant.findByPk(req.params.participantId, {
      include: [{ model: TableSession, as: 'session' }], transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!participant) throw new AppError(404, 'PARTICIPANT_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    const now = new Date();
    const wasActive = !participant.kickedAt && !participant.blockedAt;
    const wasHost = participant.isHost;
    await participant.update({
      kickedAt: now,
      kickedReason: req.body.reason?.trim() || (block ? '관리자 강제 퇴장' : '관리자 이용 종료'),
      ...(block ? { blockedAt: now, blockedReason: req.body.reason?.trim() || '관리자 강제 퇴장' } : {}),
      isHost: false,
    }, { transaction });
    if (wasActive && participant.gender) {
      await participant.session.increment(participant.gender === 'MALE' ? { maleCount: -1 } : { femaleCount: -1 }, { transaction });
    }
    if (wasHost) {
      const nextHost = await Participant.findOne({
        where: { tableSessionId: participant.tableSessionId, id: { [Op.ne]: participant.id }, kickedAt: null, blockedAt: null },
        order: [['createdAt', 'ASC']], transaction, lock: transaction.LOCK.UPDATE,
      });
      if (nextHost) await nextHost.update({ isHost: true }, { transaction });
    }
    const boardCleanup = await boardService.cleanupParticipantBoardData([participant.id], { transaction });
    const deletedRequests = await chatService.deletePendingRequestsFromSession(participant.tableSessionId, { transaction });
    await transaction.commit();
    const io = req.app.get('io');
    const latestSession = await TableSession.findByPk(participant.tableSessionId);
    if (latestSession?.status === 'ACTIVE' && Number(latestSession.maleCount) + Number(latestSession.femaleCount) === 0) {
      autoCheckoutResult = await tableService.checkoutTable(latestSession.tableId);
    }
    io?.to(`participant:${participant.id}`).emit('participant:kicked', {
      participantId: participant.id,
      blocked: block,
      message: block ? '관리자에 의해 강제 퇴장되었습니다.' : '관리자에 의해 이용이 종료되었습니다.',
    });
    io?.to('admins').emit('admin:participants-updated');
    for (const id of boardCleanup.deletedPostIds) {
      io?.to('participants').to('monitors').to('admins').emit('board:deleted', { id });
    }
    for (const room of deletedRequests) {
      io?.to(`session:${room.requesterSessionId}`).to(`session:${room.targetSessionId}`).emit('chat:request-cancelled', room);
    }
    emitPublicTableUpdate(io, { tableIds: [participant.session?.tableId], reason: block ? 'participant:blocked' : 'participant:ended' });
    if (autoCheckoutResult) lifecycleService.emitLifecycle(io, autoCheckoutResult);
    res.json({ data: participant });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
}

async function endParticipantAccess(req, res, next) {
  return changeParticipantAccess(req, res, next, { block: false });
}

async function kickParticipant(req, res, next) {
  return changeParticipantAccess(req, res, next, { block: true });
}

async function restoreParticipant(req, res, next) {
  try {
    const participant = await Participant.findByPk(req.params.participantId, {
      include: [{ model: TableSession, as: 'session' }],
    });
    if (!participant) throw new AppError(404, 'PARTICIPANT_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    await participant.update({ kickedAt: null, kickedReason: null, blockedAt: null, blockedReason: null });
    const io = req.app.get('io');
    io?.to('admins').emit('admin:participants-updated');
    emitPublicTableUpdate(io, { tableIds: [participant.session?.tableId], reason: 'participant:restored' });
    res.json({ data: participant });
  } catch (error) { next(error); }
}

async function checkoutTable(req, res, next) {
  try {
    const result = await tableService.checkoutTable(req.params.tableId);
    const io = req.app.get('io');
    if (io && result) lifecycleService.emitLifecycle(io, result);
    res.json({ data: result?.session || null });
  } catch (error) {
    next(error);
  }
}

async function checkin(req, res, next) {
  try {
    const session = await tableService.adminCheckin(req.params.tableId, req.body);
    const io = req.app.get('io');
    emitPublicTableUpdate(io, { tableIds: [session.tableId], reason: 'admin:checkin' });
    res.status(201).json({ data: session });
  } catch (error) {
    next(error);
  }
}

async function extend(req, res, next) {
  try {
    const session = await tableService.extendTable(req.params.tableId, req.body.minutes);
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${session.id}`).emit('table:extended', { session, paymentReference: req.body.paymentReference || null });
      emitPublicTableUpdate(io, { tableIds: [session.tableId], reason: 'admin:extended' });
    }
    res.json({ data: session });
  } catch (error) {
    next(error);
  }
}

async function resetTime(req, res, next) {
  try {
    const session = await tableService.resetTime(req.params.tableId);
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${session.id}`).emit('table:extended', { session });
      emitPublicTableUpdate(io, { tableIds: [session.tableId], reason: 'admin:time-reset' });
    }
    res.json({ data: session });
  } catch (error) {
    next(error);
  }
}

async function counts(req, res, next) {
  try {
    const session = await tableService.updateCounts(req.params.tableId, req.body);
    const io = req.app.get('io');
    emitPublicTableUpdate(io, { tableIds: [session.tableId], reason: 'admin:counts-updated' });
    res.json({ data: session });
  } catch (error) {
    next(error);
  }
}

async function regenerateQr(req, res, next) {
  try {
    const table = await tableService.regenerateQr(req.params.tableId, crypto.randomBytes(32).toString('base64url'));
    res.json({ data: table });
  } catch (error) {
    next(error);
  }
}

async function enableQr(req, res, next) {
  try {
    res.json({ data: await tableService.setQrEnabled(req.params.tableId, true) });
  } catch (error) {
    next(error);
  }
}

async function disableQr(req, res, next) {
  try {
    res.json({ data: await tableService.setQrEnabled(req.params.tableId, false) });
  } catch (error) {
    next(error);
  }
}

async function clearGlobalChat(req, res, next) {
  try {
    const deleted = await globalChatService.clearMessages();
    req.app.get('io')?.to('participants').to('monitors').to('admins').emit('globalChat:cleared');
    res.json({ data: { deleted } });
  } catch (error) { next(error); }
}

async function resetAllData(req, res, next) {
  const transaction = await sequelize.transaction();
  try {
    const tables = (await sequelize.getQueryInterface().showAllTables()).map(String).map((name) => name.toLowerCase());
    const has = (name) => tables.includes(name.toLowerCase());
    if (has('global_chat_messages')) await GlobalChatMessage.destroy({ where: {}, transaction });
    if (has('game_sessions')) await GameSession.destroy({ where: {}, transaction });
    if (has('board_profile_views') || has('board_posts') || has('board_profiles')) {
      await boardService.clearAllBoardData({
        transaction,
        tables: {
          profileViews: has('board_profile_views'),
          posts: has('board_posts'),
          profiles: has('board_profiles'),
        },
      });
    }
    // 구버전 DB에서 선택 기능 테이블/컬럼이 아직 없더라도 전체 리셋은 계속 수행한다.
    try { if (has('basketball_scores')) await BasketballScore.destroy({ where: {}, transaction }); } catch (error) {
      if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.original?.code)) throw error;
    }
    try { if (has('table_sessions')) await TableSession.update({ score: 0 }, { where: {}, transaction }); } catch (error) {
      if (error.original?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    }
    await transaction.commit();
    req.app.get('io')?.to('participants').to('monitors').to('admins').emit('admin:data-reset');
    res.json({ data: { ok: true } });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

module.exports = {
  login,
  getTables,
  getParticipants,
  endParticipantAccess,
  kickParticipant,
  restoreParticipant,
  checkoutTable,
  checkin,
  extend,
  resetTime,
  counts,
  regenerateQr,
  enableQr,
  disableQr,
  clearGlobalChat,
  resetAllData,
};
