const { DataTypes, QueryTypes } = require('sequelize');

const columns = [
  ['requesterSessionId', { type: DataTypes.INTEGER, allowNull: true }],
  ['targetSessionId', { type: DataTypes.INTEGER, allowNull: true }],
  ['requestedByParticipantId', { type: DataTypes.INTEGER, allowNull: true }],
  ['requestMessage', { type: DataTypes.STRING(500), allowNull: true }],
  ['status', { type: DataTypes.ENUM('PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED', 'EXPIRED', 'CLOSED'), allowNull: false, defaultValue: 'ACTIVE' }],
  ['requestExpiresAt', { type: DataTypes.DATE, allowNull: true }],
  ['acceptedAt', { type: DataTypes.DATE, allowNull: true }],
  ['rejectedAt', { type: DataTypes.DATE, allowNull: true }],
  ['cancelledAt', { type: DataTypes.DATE, allowNull: true }],
  ['endedAt', { type: DataTypes.DATE, allowNull: true }],
  ['endedByParticipantId', { type: DataTypes.INTEGER, allowNull: true }],
  ['endReason', { type: DataTypes.ENUM('USER_ENDED', 'ADMIN_ENDED', 'SESSION_CHECKED_OUT', 'SESSION_EXPIRED'), allowNull: true }],
];

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.map((table) => typeof table === 'string' ? table : table.tableName).includes(tableName);
}

async function hasColumn(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table[columnName]);
}

module.exports = {
  async up({ queryInterface, sequelize, transaction }) {
    if (!await hasTable(queryInterface, 'chat_rooms')) {
      throw new Error('chat_rooms table is required before applying chat room state migration.');
    }

    for (const [name, definition] of columns) {
      if (!await hasColumn(queryInterface, 'chat_rooms', name)) {
        await queryInterface.addColumn('chat_rooms', name, definition, { transaction });
      }
    }

    await sequelize.query(`
      UPDATE chat_rooms
      SET
        requesterSessionId = COALESCE(requesterSessionId, sessionAId),
        targetSessionId = COALESCE(targetSessionId, sessionBId),
        status = COALESCE(status, 'ACTIVE'),
        acceptedAt = CASE WHEN COALESCE(status, 'ACTIVE') = 'ACTIVE' THEN COALESCE(acceptedAt, createdAt) ELSE acceptedAt END
      WHERE requesterSessionId IS NULL OR targetSessionId IS NULL OR status IS NULL
    `, { transaction });

    const missing = await sequelize.query(
      'SELECT COUNT(*) AS count FROM chat_rooms WHERE requesterSessionId IS NULL OR targetSessionId IS NULL',
      { type: QueryTypes.SELECT, transaction }
    );
    if (Number(missing[0].count) > 0) {
      throw new Error('chat_rooms has rows that cannot be backfilled with requester/target sessions.');
    }

    const indexes = await queryInterface.showIndex('chat_rooms');
    for (const index of indexes) {
      const fields = index.fields.map((field) => field.attribute).join(',');
      if (index.unique && fields === 'sessionAId,sessionBId') {
        await queryInterface.removeIndex('chat_rooms', index.name, { transaction });
      }
    }

    await queryInterface.changeColumn('chat_rooms', 'requesterSessionId', { type: DataTypes.INTEGER, allowNull: false }, { transaction });
    await queryInterface.changeColumn('chat_rooms', 'targetSessionId', { type: DataTypes.INTEGER, allowNull: false }, { transaction });
    await queryInterface.addIndex('chat_rooms', ['status', 'requestExpiresAt'], { name: 'chat_rooms_status_request_expires_at', transaction }).catch(() => {});
    await queryInterface.addIndex('chat_rooms', ['requesterSessionId', 'status'], { name: 'chat_rooms_requester_status', transaction }).catch(() => {});
    await queryInterface.addIndex('chat_rooms', ['targetSessionId', 'status'], { name: 'chat_rooms_target_status', transaction }).catch(() => {});
  },

  async down({ queryInterface, transaction }) {
    await queryInterface.addIndex('chat_rooms', ['sessionAId', 'sessionBId'], { unique: true, name: 'chat_rooms_session_a_id_session_b_id_unique', transaction }).catch(() => {});
    for (const [name] of columns.slice().reverse()) {
      if (await hasColumn(queryInterface, 'chat_rooms', name)) {
        await queryInterface.removeColumn('chat_rooms', name, { transaction });
      }
    }
  },
};
