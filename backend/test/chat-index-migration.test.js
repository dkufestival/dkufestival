const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../src/migrations/202608260002-drop-chat-room-unique-index');

const uniquePair = (name = 'legacy_pair_index') => ({
  name,
  unique: true,
  fields: [{ attribute: 'sessionAId' }, { attribute: 'sessionBId' }],
});

test('chat pair index migration skips an already absent index', async () => {
  let removed = false;
  await migration.up({
    queryInterface: {
      showIndex: async () => [],
      removeIndex: async () => { removed = true; },
    },
    transaction: {},
  });
  assert.equal(removed, false);
});

test('chat pair index migration removes any legacy unique pair name', async () => {
  const removed = [];
  await migration.up({
    queryInterface: {
      showIndex: async () => [uniquePair('custom_legacy_name')],
      removeIndex: async (_table, name) => { removed.push(name); },
    },
    transaction: {},
  });
  assert.deepEqual(removed, ['custom_legacy_name']);
});
