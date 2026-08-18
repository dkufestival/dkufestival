const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const QRCode = require('qrcode');
const sequelize = require('../src/config/db');
const env = require('../src/config/env');
const { Table } = require('../src/models');

function createQrToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function writeQrPng(table) {
  const outputDir = path.resolve(process.cwd(), env.qrOutputDir);
  await fs.mkdir(outputDir, { recursive: true });
  const url = `${env.frontendUrl.replace(/\/$/, '')}/index.html?qr=${encodeURIComponent(table.qrToken)}`;
  const filePath = path.join(outputDir, `table-${table.tableNumber}.png`);
  await QRCode.toFile(filePath, url, { errorCorrectionLevel: 'M', width: 512 });
  return filePath;
}

async function seedTables() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    for (let tableNumber = 1; tableNumber <= env.tableCount; tableNumber += 1) {
      const [, created] = await Table.findOrCreate({
        where: { tableNumber },
        defaults: { qrToken: createQrToken(), qrEnabled: true, qrVersion: 1 },
      });
      console.log(`Table ${tableNumber}: ${created ? 'created' : 'already exists'}`);
    }

    const tables = await Table.findAll({ order: [['tableNumber', 'ASC']] });
    const rows = [];
    for (const table of tables) {
      rows.push({
        tableId: table.id,
        tableNumber: table.tableNumber,
        qrToken: table.qrToken,
        qrPng: await writeQrPng(table),
      });
    }
    console.table(rows);
  } finally {
    await sequelize.close();
  }
}

seedTables().catch((error) => {
  console.error('좌석 초기화에 실패했습니다.', error);
  process.exitCode = 1;
});
