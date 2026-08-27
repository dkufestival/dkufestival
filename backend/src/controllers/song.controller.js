const songService = require('../services/song.service');

async function create(req, res, next) {
  try {
    const request = await songService.create(req.user, req.body);
    const io = req.app.get('io');
    if (io) io.to('admins').to(`session:${req.user.sessionId}`).emit('song:requested', request);
    res.status(201).json({ data: request });
  } catch (error) {
    next(error);
  }
}

async function listMine(req, res, next) {
  try {
    res.json({ data: await songService.listMine(req.user) });
  } catch (error) {
    next(error);
  }
}

async function cancel(req, res, next) {
  try {
    const request = await songService.cancel(req.user, req.params.requestId);
    const io = req.app.get('io');
    if (io) io.to('admins').to(`session:${req.user.sessionId}`).emit('song:cancelled', request);
    res.json({ data: request });
  } catch (error) {
    next(error);
  }
}

async function listAdmin(req, res, next) {
  try {
    res.json({ data: await songService.listAdmin() });
  } catch (error) {
    next(error);
  }
}

async function complete(req, res, next) {
  try {
    const request = await songService.complete(req.params.requestId);
    const io = req.app.get('io');
    if (io) io.to('admins').to(`session:${request.tableSessionId}`).emit('song:completed', request);
    res.json({ data: request });
  } catch (error) {
    next(error);
  }
}

module.exports = { create, listMine, cancel, listAdmin, complete };
