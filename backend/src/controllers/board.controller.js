const boardService = require('../services/board.service');

async function list(req, res, next) {
  try {
    res.json({ data: await boardService.getPosts(req.user) });
  } catch (error) {
    next(error);
  }
}

async function getProfile(req, res, next) {
  try {
    res.json({ data: await boardService.getMyProfile(req.user) });
  } catch (error) {
    next(error);
  }
}

async function saveProfile(req, res, next) {
  try {
    res.json({ data: await boardService.saveMyProfile(req.user, req.body) });
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

async function get(req, res, next) {
  try {
    res.json({ data: await boardService.getPost(req.user, req.params.id) });
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

async function revealProfile(req, res, next) {
  try {
    const result = await boardService.revealProfile(req.user, req.params.id);
    if (result.created) {
      req.app.get('io')?.to(`participant:${result.view.viewedParticipantId}`).emit('board:profile-viewed', {
        id: result.view.id,
        viewerParticipantId: result.view.viewerParticipantId,
        viewedParticipantId: result.view.viewedParticipantId,
        sourcePostId: result.view.sourcePostId,
        sourcePostTitle: result.view.sourcePostTitle,
        createdAt: result.view.createdAt,
        viewer: result.viewer,
      });
    }
    res.json({ data: { profile: result.profile, post: result.post } });
  } catch (error) {
    next(error);
  }
}

async function profileViews(req, res, next) {
  try {
    res.json({ data: await boardService.listProfileViews(req.user) });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, getProfile, saveProfile, create, get, remove, revealProfile, profileViews };
