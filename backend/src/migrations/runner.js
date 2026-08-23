const fs = require('fs');
const path = require('path');
const { DataTypes, QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

const migrationsDir = __dirname;
const metaTable = 'schema_migrations';

async function ensureMetaTable(queryInterface) {
  const tables = await queryInterface.showAllTables();
  const names = tables.map((table) => typeof table === 'string' ? table : table.tableName);
  if (names.includes(metaTable)) return;
  await queryInterface.createTable(metaTable, {
    name: { type: DataTypes.STRING(255), primaryKey: true, allowNull: false },
    appliedAt: { type: DataTypes.DATE, allowNull: false },
  });
}

function listMigrationFiles() {
  return fs.readdirSync(migrationsDir)
    .filter((file) => /^\d+-.+\.js$/.test(file))
    .sort();
}

async function appliedNames() {
  const rows = await sequelize.query(`SELECT name FROM ${metaTable}`, {
    type: QueryTypes.SELECT,
  });
  return new Set(rows.map((row) => row.name));
}

async function runMigrations() {
  const queryInterface = sequelize.getQueryInterface();
  await ensureMetaTable(queryInterface);
  const applied = await appliedNames();
  const files = listMigrationFiles().filter((file) => !applied.has(file));

  for (const file of files) {
    const migration = require(path.join(migrationsDir, file));
    await sequelize.transaction(async (transaction) => {
      await migration.up({ queryInterface, sequelize, transaction });
      await sequelize.query(
        `INSERT INTO ${metaTable} (name, appliedAt) VALUES (?, ?)`,
        { replacements: [file, new Date()], transaction }
      );
    });
    console.log(`Applied migration ${file}`);
  }
}

async function rollbackLastMigration() {
  const queryInterface = sequelize.getQueryInterface();
  await ensureMetaTable(queryInterface);
  const rows = await sequelize.query(`SELECT name FROM ${metaTable} ORDER BY name DESC LIMIT 1`, {
    type: QueryTypes.SELECT,
  });
  if (!rows.length) {
    console.log('No migrations to roll back.');
    return;
  }

  const file = rows[0].name;
  const migration = require(path.join(migrationsDir, file));
  await sequelize.transaction(async (transaction) => {
    await migration.down({ queryInterface, sequelize, transaction });
    await sequelize.query(`DELETE FROM ${metaTable} WHERE name = ?`, {
      replacements: [file],
      transaction,
    });
  });
  console.log(`Rolled back migration ${file}`);
}

module.exports = { runMigrations, rollbackLastMigration };
