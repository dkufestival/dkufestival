// 테이블 비즈니스 로직
const { Table, TableSession } = require('../models');

async function getTables() {
  // TODO: 지도/목록 화면에 필요한 각 테이블의 현재 활성 TableSession을 포함한다.
  return Table.findAll({ include: [{ model: TableSession, as: 'sessions' }] });
}

async function getTable(tableId) {
  // TODO: 현재 ACTIVE 상태인 세션만 포함해 테이블 상세 정보를 반환한다.
  return Table.findByPk(tableId, { include: [{ model: TableSession, as: 'sessions' }] });
}

async function enterTable(tableId, data) {
  // TODO: QR 토큰을 검증하고 같은 테이블의 ACTIVE 세션 중복 생성을 막는다.
  return TableSession.create({
    tableId,
    nickname: data.nickname,
    memberCount: data.memberCount,
    genderType: data.genderType,
    status: 'ACTIVE',
    startedAt: new Date(),
  });
}

async function updateMyTable(sessionId, data) {
  // TODO: 수정 가능한 대표 정보 필드만 업데이트하도록 제한한다.
  const session = await TableSession.findByPk(sessionId);
  if (!session) {
    return null;
  }

  return session.update(data);
}

async function checkoutTable(tableId) {
  // TODO: 보호된 라우트에서 관리자만 호출할 수 있도록 권한을 검증한다.
  const session = await TableSession.findOne({
    where: { tableId, status: 'ACTIVE' },
    order: [['startedAt', 'DESC']],
  });

  if (!session) {
    return null;
  }

  return session.update({
    status: 'CLOSED',
    endedAt: new Date(),
  });
}

module.exports = {
  getTables,
  getTable,
  enterTable,
  updateMyTable,
  checkoutTable,
};
