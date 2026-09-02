const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const boardService = require('../src/services/board.service');
const { BoardProfile, BoardPost, BoardProfileView } = require('../src/models');

function withPatchedMethods(patches, run) {
  const originals = patches.map(([target, name]) => [target, name, target[name]]);
  patches.forEach(([target, name, value]) => {
    target[name] = value;
  });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      originals.forEach(([target, name, value]) => {
        target[name] = value;
      });
    });
}

function routeExists(method, routePath) {
  return app.router.stack.some((layer) => {
    if (layer.name !== 'router') return false;
    return layer.handle.stack.some((routeLayer) => (
      routeLayer.route?.path === routePath
      && routeLayer.route.methods[method]
    ));
  });
}

test('board REST contract is registered', () => {
  assert.equal(routeExists('get', '/profile'), true);
  assert.equal(routeExists('put', '/profile'), true);
  assert.equal(routeExists('get', '/'), true);
  assert.equal(routeExists('post', '/'), true);
  assert.equal(routeExists('get', '/:id'), true);
  assert.equal(routeExists('delete', '/:id'), true);
  assert.equal(routeExists('post', '/:id/reveal'), true);
  assert.equal(routeExists('get', '/profile-views'), true);
});

test('board models carry profile posts and profile view records', () => {
  assert.ok(BoardProfile.rawAttributes.participantId);
  assert.ok(BoardProfile.rawAttributes.gender);
  assert.ok(BoardProfile.rawAttributes.instagramId);
  assert.ok(BoardPost.rawAttributes.authorParticipantId);
  assert.ok(BoardPost.rawAttributes.title);
  assert.ok(BoardPost.rawAttributes.content);
  assert.ok(BoardProfileView.rawAttributes.viewerParticipantId);
  assert.ok(BoardProfileView.rawAttributes.viewedParticipantId);
  assert.ok(BoardProfileView.rawAttributes.sourcePostId);
});

test('board instagram id accepts @ input but stores normalized usernames', () => {
  assert.equal(boardService.assertInstagramId('@dku.festival_26'), 'dku.festival_26');
  assert.throws(
    () => boardService.assertInstagramId('bad user'),
    { name: 'AppError', code: 'INVALID_INSTAGRAM_ID' }
  );
});

test('board post list does not expose instagram ids', async () => {
  await withPatchedMethods([
    [BoardProfile, 'findOne', async () => ({ participantId: 1, gender: 'MALE' })],
    [BoardPost, 'findAll', async () => [{
      toJSON() {
        return {
          id: 10,
          authorParticipantId: 2,
          title: 'hello',
          content: 'hidden in list',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          author: {
            id: 2,
            nickname: 'writer',
            session: { table: { tableNumber: 5 } },
          },
          authorProfile: { gender: 'FEMALE', instagramId: 'secret_id' },
        };
      },
    }]],
  ], async () => {
    const posts = await boardService.getPosts({ participantId: 1, role: 'PARTICIPANT' });
    assert.equal(posts[0].author.instagramId, undefined);
    assert.equal(posts[0].content, undefined);
  });
});

test('board profile view history hides deleted source post titles', async () => {
  await withPatchedMethods([
    [BoardProfile, 'findOne', async () => ({ participantId: 1, gender: 'MALE' })],
    [BoardProfileView, 'findAll', async () => [{
      toJSON() {
        return {
          id: 20,
          viewerParticipantId: 2,
          viewedParticipantId: 1,
          sourcePostId: null,
          sourcePostTitle: 'old title',
          createdAt: '2026-09-01T00:00:00.000Z',
          viewer: {
            id: 2,
            nickname: 'viewer',
            session: { table: { tableNumber: 7 } },
            boardProfile: { gender: 'FEMALE', instagramId: 'viewer_id' },
          },
          sourcePost: null,
        };
      },
    }]],
  ], async () => {
    const views = await boardService.listProfileViews({ participantId: 1 });
    assert.equal(views[0].sourcePostTitle, '삭제된 게시글');
    assert.equal(views[0].viewer.instagramId, 'viewer_id');
  });
});
