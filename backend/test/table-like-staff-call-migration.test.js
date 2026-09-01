const test = require('node:test');
const assert = require('node:assert/strict');

const migration = require('../src/migrations/202609010004-table-likes-staff-calls');

test('table likes and staff calls migration creates missing tables and indexes', async () => {
  const tables = [];
  const indexes = new Map();
  const calls = [];
  const queryInterface = {
    async showAllTables() { return tables; },
    async createTable(name, columns) {
      tables.push(name);
      calls.push({ type: 'table', name, columns });
    },
    async showIndex(name) { return indexes.get(name) || []; },
    async addIndex(name, fields, options) {
      indexes.set(name, [...(indexes.get(name) || []), { name: options.name }]);
      calls.push({ type: 'index', name, fields, options });
    },
  };

  await migration.up({ queryInterface, transaction: {} });

  assert.deepEqual(calls.filter((call) => call.type === 'table').map((call) => call.name), ['table_likes', 'staff_calls']);
  assert.equal(calls.find((call) => call.options?.name === 'table_likes_from_to_unique').options.unique, true);
  assert.ok(calls.find((call) => call.options?.name === 'staff_calls_session_status'));
});
