const crypto = require('crypto');
const sequelize = require('../src/config/db');
const env = require('../src/config/env');
const { Table } = require('../src/models');

async function seedTables() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    for (let tableNumber = 1; tableNumber <= env.tableCount; tableNumber += 1) {
      const [, created] = await Table.findOrCreate({
        where: { tableNumber },
        defaults: { qrToken: crypto.randomBytes(24).toString('hex') },
      });
      console.log(`Table ${tableNumber}: ${created ? 'created' : 'already exists'}`);
    }

    const tables = await Table.findAll({ order: [['tableNumber', 'ASC']] });
    console.table(tables.map((table) => ({
      tableId: table.id,
      tableNumber: table.tableNumber,
      qrToken: table.qrToken,
    })));
  } finally {
    await sequelize.close();
  }
}

seedTables().catch((error) => {
  console.error('좌석 초기화에 실패했습니다.', error);
  process.exitCode = 1;
});
