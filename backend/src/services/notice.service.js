const { Notice } = require('../models');

function createNotice(data) {
  return Notice.create(data);
}

function getNotices() {
  return Notice.findAll({ order: [['createdAt', 'DESC']], limit: 100 });
}

module.exports = { createNotice, getNotices };
