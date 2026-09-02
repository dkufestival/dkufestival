const globalChatService = require('../services/globalChat.service');

async function list(req, res, next) {
  try {
    res.json({ data: await globalChatService.getMessages() });
  } catch (error) {
    next(error);
  }
}

async function send(req, res, next) {
  try {
    const message = req.user.role === 'ADMIN'
      ? await globalChatService.sendAsAdmin(req.body.content)
      : await globalChatService.sendAsParticipant(req.user.sessionId, req.user.participantId, req.body.content);
    req.app.get('io')?.to('participants').to('monitors').to('admins').emit('globalChat:message', message);
    res.status(201).json({ data: message });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, send };
