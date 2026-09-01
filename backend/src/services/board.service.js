const { BoardPost, Participant, TableSession, Table } = require('../models');
const AppError = require('../errors/AppError');

const authorInclude = {
  model: Participant,
  as: 'author',
  attributes: ['id', 'nickname'],
  include: [{
    model: TableSession,
    as: 'session',
    attributes: ['id'],
    include: [{ model: Table, as: 'table', attributes: ['tableNumber'] }],
  }],
};

async function getPosts() {
  return BoardPost.findAll({
    include: [authorInclude],
    order: [['createdAt', 'DESC']],
  });
}

async function createPost(sessionId, participantId, { title, content }) {
  if (!title?.trim() || !content?.trim()) throw new AppError(400, 'INVALID_POST', 'Title and content are required.');
  const participant = await Participant.findOne({ where: { id: participantId, tableSessionId: sessionId } });
  if (!participant) throw new AppError(403, 'PARTICIPANT_FORBIDDEN', 'Participant not found for this session.');

  const post = await BoardPost.create({
    authorParticipantId: participantId,
    title: title.trim(),
    content: content.trim(),
  });
  return BoardPost.findByPk(post.id, { include: [authorInclude] });
}

async function deletePost(id, user) {
  const post = await BoardPost.findByPk(id);
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found.');
  if (user.role !== 'ADMIN' && post.authorParticipantId !== user.participantId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot delete this post.');
  }
  await post.destroy();
  return post;
}

module.exports = { getPosts, createPost, deletePost };
