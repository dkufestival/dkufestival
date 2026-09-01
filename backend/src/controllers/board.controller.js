const boardService = require('../services/board.service');

async function list(req, res, next) {
  try {
    res.json({ data: await boardService.getPosts() });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    const post = await boardService.createPost(req.user.sessionId, req.user.participantId, req.body);
    req.app.get('io')?.to('participants').to('admins').emit('board:created', post);
    res.status(201).json({ data: post });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const post = await boardService.deletePost(req.params.id, req.user);
    req.app.get('io')?.to('participants').to('admins').emit('board:deleted', { id: post.id });
    res.json({ data: { id: post.id } });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, create, remove };
