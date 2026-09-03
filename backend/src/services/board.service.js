const sequelize = require('../config/db');
const { Op } = require('sequelize');
const { BoardProfile, BoardPost, BoardProfileView, Participant, TableSession, Table } = require('../models');
const AppError = require('../errors/AppError');

const INSTAGRAM_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

function normalizeInstagramId(value) {
  return String(value || '').trim().replace(/^@+/, '');
}

function assertInstagramId(value) {
  const instagramId = normalizeInstagramId(value);
  if (!INSTAGRAM_PATTERN.test(instagramId)) {
    throw new AppError(400, 'INVALID_INSTAGRAM_ID', '인스타그램 아이디 형식이 올바르지 않습니다.');
  }
  return instagramId;
}

async function requireProfile(participantId, options = {}) {
  const profile = await BoardProfile.findOne({
    where: { participantId },
    transaction: options.transaction,
    lock: options.lock,
  });
  if (!profile) throw new AppError(403, 'BOARD_PROFILE_REQUIRED', '게시판 프로필 등록이 필요합니다.');
  return profile;
}

const authorInclude = {
  model: Participant,
  as: 'author',
  attributes: ['id', 'nickname', 'tableSessionId'],
  include: [{
    model: TableSession,
    as: 'session',
    attributes: ['id'],
    include: [{ model: Table, as: 'table', attributes: ['tableNumber'] }],
  }],
};

function postIncludes(profileAttributes = ['gender']) {
  return [
    authorInclude,
    { model: BoardProfile, as: 'authorProfile', attributes: profileAttributes },
  ];
}

function serializePost(post, viewerParticipantId, options = {}) {
  const json = post.toJSON ? post.toJSON() : post;
  const tableNumber = json.author?.session?.table?.tableNumber || null;
  return {
    id: json.id,
    authorParticipantId: json.authorParticipantId,
    title: json.title,
    ...(options.includeContent ? { content: json.content } : {}),
    createdAt: json.createdAt,
    isMine: Number(json.authorParticipantId) === Number(viewerParticipantId),
    author: {
      id: json.authorParticipantId,
      nickname: json.author?.nickname || null,
      tableNumber,
      gender: json.authorProfile?.gender || null,
    },
  };
}

function serializeProfile(profile) {
  return {
    gender: profile.gender,
    instagramId: profile.instagramId,
  };
}

async function getParticipantIdentity(participantId, transaction) {
  const participant = await Participant.findByPk(participantId, {
    attributes: ['id', 'nickname', 'tableSessionId'],
    include: [{
      model: TableSession,
      as: 'session',
      attributes: ['id'],
      include: [{ model: Table, as: 'table', attributes: ['tableNumber'] }],
    }],
    transaction,
  });
  return {
    nickname: participant?.nickname || null,
    tableNumber: participant?.session?.table?.tableNumber || null,
  };
}

function serializeRevealedProfile(profile, post) {
  const json = post.toJSON ? post.toJSON() : post;
  return {
    ...serializeProfile(profile),
    nickname: json.author?.nickname || null,
    tableNumber: json.author?.session?.table?.tableNumber || null,
  };
}

async function getMyProfile(user) {
  const profile = await BoardProfile.findOne({ where: { participantId: user.participantId } });
  return profile ? serializeProfile(profile) : null;
}

async function saveMyProfile(user, data) {
  if (!['MALE', 'FEMALE'].includes(data.gender)) {
    throw new AppError(400, 'INVALID_GENDER', '성별을 선택해 주세요.');
  }
  const instagramId = assertInstagramId(data.instagramId);
  const [profile] = await BoardProfile.findOrCreate({
    where: { participantId: user.participantId },
    defaults: { participantId: user.participantId, gender: data.gender, instagramId },
  });
  if (profile.gender !== data.gender || profile.instagramId !== instagramId) {
    await profile.update({ gender: data.gender, instagramId });
  }
  return serializeProfile(profile);
}

async function getPosts(user = {}) {
  if (user.role === 'PARTICIPANT') await requireProfile(user.participantId);
  const posts = await BoardPost.findAll({
    include: postIncludes(),
    order: [['createdAt', 'DESC']],
  });
  return posts.map((post) => serializePost(post, user.participantId));
}

async function createPost(sessionId, participantId, { title, content }) {
  await requireProfile(participantId);
  if (!title?.trim() || !content?.trim()) throw new AppError(400, 'INVALID_POST', 'Title and content are required.');
  const participant = await Participant.findOne({ where: { id: participantId, tableSessionId: sessionId } });
  if (!participant) throw new AppError(403, 'PARTICIPANT_FORBIDDEN', 'Participant not found for this session.');

  const post = await BoardPost.create({
    authorParticipantId: participantId,
    title: title.trim(),
    content: content.trim(),
  });
  return getPost({ participantId }, post.id);
}

async function getPost(user, postId) {
  if (user.role === 'PARTICIPANT') await requireProfile(user.participantId);
  const post = await BoardPost.findByPk(postId, { include: postIncludes() });
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found.');
  return serializePost(post, user.participantId, { includeContent: true });
}

async function deletePost(id, user) {
  if (user.role === 'PARTICIPANT') await requireProfile(user.participantId);
  const post = await BoardPost.findByPk(id);
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found.');
  if (user.role !== 'ADMIN' && post.authorParticipantId !== user.participantId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot delete this post.');
  }
  await post.destroy();
  return post;
}

async function revealProfile(user, postId) {
  await requireProfile(user.participantId);
  return sequelize.transaction(async (transaction) => {
    const post = await BoardPost.findByPk(postId, {
      include: postIncludes(['gender', 'instagramId']),
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found.');
    if (Number(post.authorParticipantId) === Number(user.participantId)) {
      throw new AppError(400, 'INVALID_PROFILE_VIEW_TARGET', '본인 정보는 열람할 수 없습니다.');
    }
    if (!post.authorProfile) throw new AppError(404, 'BOARD_PROFILE_NOT_FOUND', '게시판 프로필을 찾을 수 없습니다.');

    const [view, created] = await BoardProfileView.findOrCreate({
      where: { viewerParticipantId: user.participantId, viewedParticipantId: post.authorParticipantId },
      defaults: {
        viewerParticipantId: user.participantId,
        viewedParticipantId: post.authorParticipantId,
        sourcePostId: post.id,
        sourcePostTitle: post.title,
      },
      transaction,
    });
    const viewer = await getParticipantIdentity(user.participantId, transaction);
    return {
      view,
      created,
      viewer,
      profile: serializeRevealedProfile(post.authorProfile, post),
      post: serializePost(post, user.participantId, { includeContent: true }),
    };
  });
}

function serializeView(view) {
  const json = view.toJSON ? view.toJSON() : view;
  return {
    id: json.id,
    createdAt: json.createdAt,
    sourcePostId: json.sourcePostId,
    sourcePostTitle: json.sourcePostId && json.sourcePost
      ? (json.sourcePost.title || json.sourcePostTitle)
      : '삭제된 게시글',
    viewer: {
      id: json.viewerParticipantId,
      nickname: json.viewer?.nickname || null,
      tableNumber: json.viewer?.session?.table?.tableNumber || null,
      gender: json.viewer?.boardProfile?.gender || null,
      instagramId: json.viewer?.boardProfile?.instagramId || null,
    },
  };
}

async function listProfileViews(user) {
  await requireProfile(user.participantId);
  const views = await BoardProfileView.findAll({
    where: { viewedParticipantId: user.participantId },
    include: [
      {
        model: Participant,
        as: 'viewer',
        attributes: ['id', 'nickname', 'tableSessionId'],
        include: [
          { model: BoardProfile, as: 'boardProfile', attributes: ['gender', 'instagramId'] },
          {
            model: TableSession,
            as: 'session',
            attributes: ['id'],
            include: [{ model: Table, as: 'table', attributes: ['tableNumber'] }],
          },
        ],
      },
      { model: BoardPost, as: 'sourcePost', attributes: ['id', 'title'] },
    ],
    order: [['createdAt', 'DESC']],
  });
  return views.map(serializeView);
}

async function cleanupParticipantBoardData(participantIds, options = {}) {
  const ids = [...new Set((participantIds || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return { deletedPostIds: [] };
  const transaction = options.transaction;
  const posts = await BoardPost.findAll({
    where: { authorParticipantId: { [Op.in]: ids } },
    attributes: ['id'],
    transaction,
  });
  const deletedPostIds = posts.map((post) => Number(post.id));
  await BoardProfileView.destroy({
    where: {
      [Op.or]: [
        { viewerParticipantId: { [Op.in]: ids } },
        { viewedParticipantId: { [Op.in]: ids } },
        ...(deletedPostIds.length ? [{ sourcePostId: { [Op.in]: deletedPostIds } }] : []),
      ],
    },
    transaction,
  });
  await BoardPost.destroy({ where: { authorParticipantId: { [Op.in]: ids } }, transaction });
  await BoardProfile.destroy({ where: { participantId: { [Op.in]: ids } }, transaction });
  return { deletedPostIds };
}

async function cleanupSessionBoardData(sessionId, options = {}) {
  const participants = await Participant.findAll({
    where: { tableSessionId: Number(sessionId) },
    attributes: ['id'],
    transaction: options.transaction,
  });
  return cleanupParticipantBoardData(participants.map((participant) => participant.id), options);
}

module.exports = {
  normalizeInstagramId,
  assertInstagramId,
  getMyProfile,
  saveMyProfile,
  getPosts,
  createPost,
  getPost,
  deletePost,
  revealProfile,
  listProfileViews,
  cleanupParticipantBoardData,
  cleanupSessionBoardData,
};
