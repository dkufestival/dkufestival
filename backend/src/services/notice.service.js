const { Notice } = require('../models');
const AppError = require('../errors/AppError');

function createNotice(data) {
  return Notice.create(data);
}

function getNotices() {
  return Notice.findAll({ order: [['createdAt', 'DESC']], limit: 100 });
}

async function deleteNotice(id) {
  const notice = await Notice.findByPk(id);
  if (!notice) throw new AppError(404, 'NOTICE_NOT_FOUND', 'Notice not found.');
  await notice.destroy();
  return notice;
}

module.exports = { createNotice, getNotices, deleteNotice };
