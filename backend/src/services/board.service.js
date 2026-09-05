const sequelize = require('../config/db');
const { Op } = require('sequelize');
const { BoardProfile, BoardPost, BoardProfileView, Participant, TableSession, Table } = require('../models');
const AppError = require('../errors/AppError');

const INSTAGRAM_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

const FACE_TYPES = ['강아지상', '고양이상', '여우상', '토끼상', '곰상', '사슴상'];
const MBTI_TYPES = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ',
  'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP',
  'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
];
const DRINK_STYLES = ['안 마셔요', '소주 반병', '소주 한 병', '소주 두 병 이상', '술고래'];
const TENSION_TYPES = ['차분한 편', '중간', '하이텐션'];
const AGE_PREFS = ['연상', '동갑', '연하', '상관없음'];
const BALANCE_QUESTIONS = [
  { id: 'dogcat', question: '강아지상 vs 고양이상', optionA: '강아지상', optionB: '고양이상' },
  { id: 'season', question: '여름 vs 겨울', optionA: '여름', optionB: '겨울' },
  { id: 'homebody', question: '집순이 vs 인싸', optionA: '집순이', optionB: '인싸' },
  { id: 'daytype', question: '아침형 vs 밤형', optionA: '아침형', optionB: '밤형' },
  { id: 'sweet', question: '단짠단 vs 짠단짠', optionA: '단짠단', optionB: '짠단짠' },
];

function assertOneOf(value, list, field) {
  if (!list.includes(value)) throw new AppError(400, 'INVALID_POST', `${field} 값이 올바르지 않습니다.`);
  return value;
}

function assertSubsetOf(values, list, field) {
  const arr = Array.isArray(values) ? values : [];
  if (arr.length && arr.some((value) => !list.includes(value))) {
    throw new AppError(400, 'INVALID_POST', `${field} 값이 올바르지 않습니다.`);
  }
  return arr;
}

function assertIntInRange(value, min, max, field) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new AppError(400, 'INVALID_POST', `${field}는 ${min}~${max} 사이의 숫자여야 합니다.`);
  }
  return num;
}

function buildPostDetails(data) {
  const balanceQuestion = BALANCE_QUESTIONS.find((question) => question.id === data.balanceQuestionId);
  if (!balanceQuestion) throw new AppError(400, 'INVALID_POST', 'balanceQuestionId 값이 올바르지 않습니다.');
  const balanceChoice = assertOneOf(data.balanceChoice, ['A', 'B'], 'balanceChoice');
  const charmPoint = String(data.charmPoint || '').trim();
  if (!charmPoint || charmPoint.length > 40) throw new AppError(400, 'INVALID_POST', '매력포인트는 1~40자여야 합니다.');
  const idealCeleb = String(data.idealCeleb || '').trim().slice(0, 30);

  return {
    age: assertIntInRange(data.age, 18, 60, '나이'),
    height: assertIntInRange(data.height, 130, 210, '키'),
    faceType: assertOneOf(data.faceType, FACE_TYPES, '얼굴상'),
    mbti: assertOneOf(data.mbti, MBTI_TYPES, 'MBTI'),
    drinkStyle: assertOneOf(data.drinkStyle, DRINK_STYLES, '주량'),
    tension: assertOneOf(data.tension, TENSION_TYPES, '텐션'),
    balanceQuestionId: balanceQuestion.id,
    balanceChoice,
    balanceAnswer: balanceChoice === 'A' ? balanceQuestion.optionA : balanceQuestion.optionB,
    charmPoint,
    idealCeleb: idealCeleb || null,
    idealHeight: data.idealHeight ? assertIntInRange(data.idealHeight, 130, 210, '이상형 키') : null,
    idealFaceTypes: assertSubsetOf(data.idealFaceTypes, FACE_TYPES, '이상형 얼굴상'),
    idealMbti: assertSubsetOf(data.idealMbti, MBTI_TYPES, '이상형 MBTI'),
    idealAgePref: assertOneOf(data.idealAgePref, AGE_PREFS, '이상형 나이대'),
  };
}

function summarizePost(details) {
  const balanceQuestion = BALANCE_QUESTIONS.find((question) => question.id === details.balanceQuestionId);
  const title = `${details.age}세 · ${details.height}cm · ${details.faceType}`;
  const content = [
    `MBTI ${details.mbti} · 주량 ${details.drinkStyle} · 텐션 ${details.tension}`,
    `매력포인트: ${details.charmPoint}`,
    details.idealCeleb ? `이상형 연예인: ${details.idealCeleb}` : null,
    balanceQuestion ? `밸런스 게임(${balanceQuestion.question}): ${details.balanceAnswer}` : null,
    `이상형: ${details.idealHeight ? `${details.idealHeight}cm 이상` : '키 상관없음'} · ${details.idealFaceTypes.length ? details.idealFaceTypes.join('/') : '얼굴상 상관없음'} · ${details.idealMbti.length ? details.idealMbti.join('/') : 'MBTI 상관없음'} · ${details.idealAgePref}`,
  ].filter(Boolean).join('\n');
  return { title, content };
}

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
    details: json.details || null,
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

async function createPost(sessionId, participantId, data) {
  await requireProfile(participantId);
  const participant = await Participant.findOne({ where: { id: participantId, tableSessionId: sessionId } });
  if (!participant) throw new AppError(403, 'PARTICIPANT_FORBIDDEN', 'Participant not found for this session.');

  const details = buildPostDetails(data || {});
  const { title, content } = summarizePost(details);

  const post = await BoardPost.create({
    authorParticipantId: participantId,
    title,
    content,
    details,
  });
  return getPost({ participantId }, post.id);
}

async function getPost(user, postId) {
  if (user.role === 'PARTICIPANT') await requireProfile(user.participantId);
  const post = await BoardPost.findByPk(postId, { include: postIncludes(['gender', 'instagramId']) });
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post not found.');
  const serialized = serializePost(post, user.participantId, { includeContent: true });
  if (!serialized.isMine && post.authorProfile) {
    const view = await BoardProfileView.findOne({
      where: { viewerParticipantId: user.participantId, viewedParticipantId: post.authorParticipantId },
    });
    if (view) serialized.revealedProfile = serializeRevealedProfile(post.authorProfile, post);
  }
  return serialized;
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

function serializeView(view, targetAlias = 'viewer') {
  const json = view.toJSON ? view.toJSON() : view;
  const target = json[targetAlias];
  const targetParticipantId = targetAlias === 'viewer' ? json.viewerParticipantId : json.viewedParticipantId;
  return {
    id: json.id,
    createdAt: json.createdAt,
    sourcePostId: json.sourcePostId,
    sourcePostTitle: json.sourcePostId && json.sourcePost
      ? (json.sourcePost.title || json.sourcePostTitle)
      : '삭제된 게시글',
    peer: {
      id: targetParticipantId,
      nickname: target?.nickname || null,
      tableNumber: target?.session?.table?.tableNumber || null,
      gender: target?.boardProfile?.gender || null,
      instagramId: target?.boardProfile?.instagramId || null,
    },
  };
}

async function listProfileViews(user, direction = 'received') {
  await requireProfile(user.participantId);
  const isGiven = direction === 'given';
  const targetAlias = isGiven ? 'viewed' : 'viewer';
  const views = await BoardProfileView.findAll({
    where: isGiven
      ? { viewerParticipantId: user.participantId }
      : { viewedParticipantId: user.participantId },
    include: [
      {
        model: Participant,
        as: targetAlias,
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
  return views.map((view) => serializeView(view, targetAlias));
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

async function clearAllBoardData(options = {}) {
  const transaction = options.transaction;
  const tables = options.tables || { profileViews: true, posts: true, profiles: true };
  if (tables.profileViews) await BoardProfileView.destroy({ where: {}, transaction });
  if (tables.posts) await BoardPost.destroy({ where: {}, transaction });
  if (tables.profiles) await BoardProfile.destroy({ where: {}, transaction });
}

function getPostOptions() {
  return {
    faceTypes: FACE_TYPES,
    mbtiTypes: MBTI_TYPES,
    drinkStyles: DRINK_STYLES,
    tensionTypes: TENSION_TYPES,
    agePrefs: AGE_PREFS,
    balanceQuestions: BALANCE_QUESTIONS,
  };
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
  getPostOptions,
  cleanupParticipantBoardData,
  cleanupSessionBoardData,
  clearAllBoardData,
};
