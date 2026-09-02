const noticeService = require('../services/notice.service');

async function createNotice(req, res, next) {
  try {
    const notice = await noticeService.createNotice(req.body);
    req.app.get('io')?.to('participants').to('monitors').emit('notice:created', notice);
    res.status(201).json({ data: notice });
  } catch (error) {
    next(error);
  }
}

async function getNotices(req, res, next) {
  try {
    res.json({ data: await noticeService.getNotices() });
  } catch (error) {
    next(error);
  }
}

async function deleteNotice(req, res, next) {
  try {
    const notice = await noticeService.deleteNotice(req.params.id);
    req.app.get('io')?.to('participants').to('monitors').emit('notice:deleted', { id: notice.id });
    res.json({ data: { id: notice.id } });
  } catch (error) {
    next(error);
  }
}

module.exports = { createNotice, getNotices, deleteNotice };
