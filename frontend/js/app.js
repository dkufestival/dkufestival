import { setToastHandler } from './api.js';
import { clearParticipantAuth, getClientId, getParticipantAuth, saveMonitorAuth, saveParticipantAuth } from './auth.js';
import { connectSocket, getSocket } from './socket.js';
import { $, button, clear, formatDateTime, formatRemaining, text } from './dom.js';
import { entryApi } from './entry.js';
import { tablesApi } from './tables.js?v=4';
import { participantsApi } from './participants.js';
import { chatApi } from './chat.js';
import { globalChatApi } from './globalChat.js';
import { boardApi } from './board.js';
import { noticesApi } from './notices.js?v=2';
import { STORAGE_KEYS } from './config.js';
import { initMapZoom } from './mapzoom.js?v=3';
import { basketballApi } from './basketball-api.js';
import { monitorApi } from './monitor.js';

const state = {
  qrToken: new URLSearchParams(location.search).get('qr'),
  monitorToken: new URLSearchParams(location.search).get('monitor'),
  isMonitor: false,
  token: null,
  table: null,
  session: null,
  participant: null,
  participants: [],
  tables: [],
  chatRoom: null,
  messages: new Map(),
  notices: [],
  globalChatMessages: [],
  globalChatLoaded: false,
  globalChatSending: false,
  seatViewMode: 'map',
  activeMenu: 'map',
  boardPosts: [],
  boardLoaded: false,
  activeBoardPost: null,
  activeRoomId: null,
  activeGame: null,
  entryContext: null,
  counts: { male: 0, female: 0 },
  timer: null,
  liveContentTimer: null,
  liveContentRefreshPending: false,
  liveContentReady: false,
  pendingTargetTable: null,
  timeMatch: { phase: 'ready', startedAt: 0, elapsedMs: 0, frame: null },
  gameAnswer: null,
  gameAnswerKey: null,
  submittedGameAnswers: new Map(),
  rouletteTimer: null,
  rouletteRotation: 0,
  revealSequenceKey: null,
  participationDecisions: new Map(),
  pendingParticipationGame: null,
  hasConnectedOnce: false,
  initialSyncDone: false,
  syncPromise: null,
  tableRefreshPromise: null,
  tableRefreshTimer: null,
  tableRefreshPending: false,
  requestBlock: { targetSessionId: null, blocked: false, loading: false, requestId: 0 },
  basketballLeaderboard: [],
  givenLikes: new Set(),
  receivedLikes: [],
  receivedRequestsLog: [],
  pendingRequestPeers: new Map(),
  staffCallPending: false,
  unreadNoticeCount: 0,
  unreadGlobalChatCount: 0,
  board: { profile: null, posts: [], currentPost: null, revealedProfile: null, views: [] },
};

const gameNames = { OX_QUIZ: 'OX 퀴즈', RPS: '가위바위보', WORD_GUESS: '제시어 게임', IMAGE_GAME: '이미지 게임', TIME_MATCH: '스톱워치', PINBALL: '핀볼', BASKETBALL: '농구', ROULETTE: '룰렛' };
const HEART_SVG_PATH = 'M12 21s-6.7-4.35-9.33-8.2C.86 10.1 1.1 6.9 3.6 5.1c2.02-1.45 4.6-.98 6.1.86L12 8.5l2.3-2.54c1.5-1.84 4.08-2.31 6.1-.86 2.5 1.8 2.74 5 .93 7.7C18.7 16.65 12 21 12 21z';

function createLikeButton(table) {
  const sessionId = Number(table.activeSession?.id);
  const liked = state.givenLikes.has(sessionId);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `table-like-btn${liked ? ' liked' : ''}`;
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${HEART_SVG_PATH}"></path></svg>`;
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleTableLike(table);
  });
  return btn;
}

function isParticipating(gameId) {
  return state.participationDecisions.get(Number(gameId)) === true;
}

function requestGameParticipation(game) {
  if (!game || state.participationDecisions.has(Number(game.id))) return;
  if (state.isMonitor) {
    state.participationDecisions.set(Number(game.id), true);
    if (game.type === 'PINBALL') showPinballScreen(game);
    else if (game.type !== 'BASKETBALL') showGlobalGameScreen();
    return;
  }
  if (game.type === 'PINBALL') {
    state.participationDecisions.set(Number(game.id), true);
    showToast('핀볼 게임이 시작되었습니다.');
    showPinballScreen(game);
    return;
  }
  if (game.type === 'TIME_MATCH') {
    showToast('스톱워치 게임이 시작되었습니다. 게임 메뉴에서 입장할 수 있습니다.');
    return;
  }
  if (game.type === 'BASKETBALL') {
    state.participationDecisions.set(Number(game.id), true);
    showToast('농구게임이 시작되었습니다. 게임 메뉴에서 입장할 수 있습니다.');
    return;
  }
  state.participationDecisions.set(Number(game.id), true);
  showGlobalGameScreen();
}

function showGameAnnouncement(game) {
  $('game-participation-title').textContent = `${gameNames[game.type] || game.type} 게임이 곧 시작됩니다.`;
  $('game-participation-message').textContent = '관리자가 게임을 시작할 때까지 잠시 기다려주세요.';
  openModal('modal-game-participation');
}

function showFinalScores(game) {
  const titleNode = $('modal-game-results').querySelector('.modal-title');
  if (game?.type === 'ROULETTE') {
    const list = $('game-final-score-list');
    list.replaceChildren();
    list.textContent = `당첨: ${game.state?.rouletteSpin?.result || game.state?.rounds?.[Number(game.state?.currentRound || 0)]?.answer || '-'}`;
    titleNode.textContent = '룰렛 결과';
    openModal('modal-game-results');
    return;
  }
  const list = $('game-final-score-list');
  titleNode.textContent = '팀별 최종 점수';
  list.replaceChildren();
  const scores = [...(game.state?.finalScoreboard || game.state?.scoreboard || [])]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  if (!scores.length) list.textContent = '점수가 집계되지 않는 게임입니다.';
  scores.forEach((team, index) => {
    const row = document.createElement('div');
    row.textContent = `${index + 1}위 · TABLE ${team.tableNumber ?? '-'} · ${Number(team.score || 0)}점`;
    list.appendChild(row);
  });
  openModal('modal-game-results');
}

function decideGameParticipation(joined) {
  const game = state.pendingParticipationGame;
  if (!game) return;
  state.participationDecisions.set(Number(game.id), joined);
  state.pendingParticipationGame = null;
  closeModal('modal-game-participation');
  getSocket()?.emit('game:action', { gameId: game.id, action: 'PARTICIPATION', state: { joined } });
  if (!joined) {
    showToast('이번 게임에 참가하지 않습니다.');
    return;
  }
  if (game.type === 'PINBALL') showPinballScreen(game);
  else if (game.type === 'BASKETBALL') window.location.href = '/basketball/';
  else if (game.type !== 'TIME_MATCH') showGlobalGameScreen();
  else showToast('게임 화면의 스톱워치 입장 버튼을 눌러주세요.');
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

setToastHandler(showToast);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  $(id).classList.add('active');
}

function openModal(id) {
  $(id)?.classList.add('active');
}

function closeModal(id) {
  $(id)?.classList.remove('active');
}

// 화면/게임 전환 시 이전 화면에 종속된 일시적 모달을 일괄 정리한다.
function closeAllTransientModals() {
  document.querySelectorAll('.modal-backdrop.active').forEach((modal) => modal.classList.remove('active'));
}

function setMainContent(type) {
  const panels = { map: 'map-view', chat: 'global-chat-panel', notice: 'notice-panel', board: 'board-panel', game: 'game-panel-host' };
  Object.entries(panels).forEach(([key, id]) => { const node = $(id); if (node) node.hidden = key !== type; });
  state.activeMenu = type;
  state.seatViewMode = type;
  const viewport = $('map-viewport');
  viewport?.classList.toggle('map-mode', type === 'map');
  viewport?.classList.toggle('global-chat-mode', type === 'chat');
  mapZoom?.setEnabled(type === 'map');
  renderBottomMenuState();
  if (type === 'chat') {
    state.unreadGlobalChatCount = 0;
    updateGlobalChatBadge();
    renderGlobalChat({ forceBottom: true });
  }
  if (type === 'notice') {
    state.unreadNoticeCount = 0;
    updateNoticeBadge();
    renderNotices();
  }
  if (type === 'game') renderGame();
}

function setCounts(male, female) {
  state.counts = { male: Number(male || 0), female: Number(female || 0) };
  document.querySelectorAll('[data-count="male"]').forEach((node) => { node.textContent = state.counts.male; });
  document.querySelectorAll('[data-count="female"]').forEach((node) => { node.textContent = state.counts.female; });
}

function setLandingStatus(message) {
  $('entry-status').textContent = message;
}

async function initEntry() {
  const clientId = getClientId();
  $('client-id-label').textContent = clientId.slice(0, 8);

  if (!state.qrToken) {
    setLandingStatus('QR 정보가 없습니다. 테이블 QR을 스캔해 주세요.');
    $('join-btn').disabled = true;
    return;
  }

  setLandingStatus('QR 확인 중...');
  try {
    state.entryContext = await entryApi.context(state.qrToken);
    state.table = { id: state.entryContext.tableId, tableNumber: state.entryContext.tableNumber };
    $('table-label').textContent = `TABLE ${state.entryContext.tableNumber}`;
    $('occupied-notice').classList.toggle('show', state.entryContext.hasActiveSession);
    $('join-btn').textContent = state.entryContext.requiresTeamSetup ? '입장하기' : '합류하기';
    setLandingStatus(state.entryContext.hasActiveSession ? '사용 중인 테이블입니다. 성별을 선택하고 합류해 주세요.' : '성별을 선택하고 입장해 주세요.');

    const auth = getParticipantAuth();
    if (auth?.token && auth.tableId === state.table.id) {
      $('nickname-input').value = auth.participant?.nickname || '';
      const savedGender = auth.participant?.gender;
      if (savedGender) {
        const genderInput = document.querySelector(`input[name="entry-gender"][value="${savedGender}"]`);
        if (genderInput) genderInput.checked = true;
      }
      setLandingStatus('저장된 참가자 정보를 복구하는 중입니다.');
      await restoreFromToken();
    }
  } catch (error) {
    $('join-btn').disabled = true;
    setLandingStatus(error.code === 'INVALID_QR' ? '잘못되었거나 비활성화된 QR입니다.' : error.message);
  }
}

async function enter() {
  const nickname = $('nickname-input').value.trim();
  if (!nickname) return showToast('닉네임을 입력해 주세요.');
  const gender = document.querySelector('input[name="entry-gender"]:checked')?.value;
  if (!gender) return showToast('성별을 선택해 주세요.');

  const body = {
    qrToken: state.qrToken,
    clientId: getClientId(),
    nickname,
    gender,
  };

  const data = await entryApi.enter(body);
  saveParticipantAuth(data);
  state.token = data.token;
  state.table = data.table;
  state.session = data.session;
  state.participant = data.participant;
  setCounts(data.session.maleCount, data.session.femaleCount);
  await afterAuthenticated();
}

async function afterAuthenticated() {
  showScreen('screen-seats');
  initTableMap();
  bindSocket();
  await syncParticipantState({ render: false });
  state.initialSyncDone = true;
  renderAll();
  startTimer();
  if (state.chatRoom?.status === 'ACTIVE') openChat(state.chatRoom.roomId);
  showOnboardingIfNeeded();
}

const ONBOARDING_SLIDES = [
  {
    eyebrow: 'TABLE MAP', title: '테이블을 눌러 대화를 시작해요',
    body: '지도에서 다른 테이블을 누르면 채팅 요청을 보낼 수 있어요. 원하지 않는 테이블의 요청은 테이블별로 차단할 수도 있어요.',
    image: 'assets/onboarding/02-chat-request.png', alt: '다른 테이블 채팅 요청 화면', badge: '채팅 요청 · 테이블별 차단'
  },
  {
    eyebrow: 'PRIVATE CHAT', title: '수락하면 둘만의 채팅방이 열려요',
    body: '상대가 요청을 수락하면 바로 채팅할 수 있고, 언제든 채팅방 나가기로 대화를 종료할 수 있어요.',
    image: 'assets/onboarding/01-table-map.png', alt: '테이블 채팅 화면 예시', badge: '요청 수락 · 채팅 · 나가기'
  },
  {
    eyebrow: 'LIKE', title: '대화 중인 테이블에는 좋아요를 남겨요',
    body: '상대가 다른 채팅 중이라 요청할 수 없다면 좋아요로 관심을 표현해 보세요. 내 테이블을 누르면 누가 좋아요를 보냈는지 확인할 수 있어요.',
    image: 'assets/onboarding/03-likes.png', alt: '받은 좋아요 목록 화면', badge: '간접 관심 표현 · 받은 좋아요 확인'
  },
  {
    eyebrow: 'OPEN CHAT', title: '축제 이야기는 전체채팅에서',
    body: '하단의 전체채팅을 누르면 행사장 모든 참가자와 실시간으로 대화할 수 있어요. 서로 배려하는 대화를 부탁드려요.',
    image: 'assets/onboarding/04-global-chat.png', alt: '실제 전체채팅 화면', badge: '모든 테이블과 실시간 대화'
  },
  {
    eyebrow: 'SOLO GAME', title: '기다리는 동안 개인 게임 한 판!',
    body: '농구게임과 시간 맞추기는 언제든 자유롭게 플레이할 수 있어요. 농구 최고 기록은 참가자 순위에도 반영돼요.',
    image: 'assets/onboarding/05-personal-games.png', alt: '실제 개인 게임 선택 화면', badge: '농구게임 · 시간 맞추기'
  },
  {
    eyebrow: 'GROUP GAME', title: '다 함께 즐기는 단체 게임',
    body: '핀볼 관전, OX퀴즈, 가위바위보, 제시어 맞히기, 룰렛, 이미지게임이 준비되어 있어요. 게임마다 소정의 상품도 놓치지 마세요.',
    image: 'assets/onboarding/05-personal-games.png', alt: '실제 게임 메뉴 화면', badge: '6가지 단체 게임 · 상품 증정'
  },
  {
    eyebrow: 'AUTO PLAY', title: '전체 게임은 자동으로 시작돼요',
    body: '관리자가 전체 게임을 시작하면 채팅 중이어도 게임 화면으로 자동 전환돼요. 게임이 끝나면 시작 전 화면으로 안전하게 돌아옵니다.',
    image: 'assets/onboarding/01-table-map.png', alt: '전체 게임 자동 전환 안내', badge: '자동 전환 · 이전 화면 복귀'
  },
  {
    eyebrow: 'NOTICE', title: '공지 확인은 꼭 해주세요',
    body: '게임 시작, 상품 수령, 현장 운영 안내 등 중요한 소식이 공지에 올라와요. 새 공지 배지가 보이면 바로 확인해 주세요.',
    image: 'assets/onboarding/06-notices.png', alt: '실제 공지 화면', badge: '운영 안내 · 상품 수령 정보'
  }
];

let onboardingIndex = 0;
let onboardingPointerX = null;

function renderOnboarding() {
  const slide = ONBOARDING_SLIDES[onboardingIndex];
  $('onboarding-progress').style.width = `${((onboardingIndex + 1) / ONBOARDING_SLIDES.length) * 100}%`;
  $('onboarding-slide').innerHTML = `
    <div class="onboarding-image-wrap">
      <img src="${slide.image}" alt="${slide.alt}" draggable="false">
      <span class="onboarding-count">${onboardingIndex + 1} / ${ONBOARDING_SLIDES.length}</span>
    </div>
    <div class="onboarding-copy">
      <div class="onboarding-eyebrow">${slide.eyebrow}</div>
      <h2>${slide.title}</h2>
      <p>${slide.body}</p>
      <div class="onboarding-badge">${slide.badge}</div>
    </div>`;
  $('onboarding-dots').innerHTML = ONBOARDING_SLIDES.map((_, index) =>
    `<button type="button" class="onboarding-dot${index === onboardingIndex ? ' active' : ''}" data-onboarding-index="${index}" aria-label="${index + 1}번째 안내"></button>`
  ).join('');
  $('onboarding-prev').disabled = onboardingIndex === 0;
  $('onboarding-next').textContent = onboardingIndex === ONBOARDING_SLIDES.length - 1 ? '시작하기' : '다음';
}

function openOnboarding() {
  onboardingIndex = 0;
  renderOnboarding();
  openModal('modal-onboarding');
}

function finishOnboarding() {
  localStorage.setItem(STORAGE_KEYS.onboardingSeen, '1');
  closeModal('modal-onboarding');
}

function showOnboardingIfNeeded() {
  if (!localStorage.getItem(STORAGE_KEYS.onboardingSeen)) openOnboarding();
}

function moveOnboarding(delta) {
  const next = onboardingIndex + delta;
  if (next >= ONBOARDING_SLIDES.length) return finishOnboarding();
  onboardingIndex = Math.max(0, next);
  renderOnboarding();
}

function updateMonitorStatus(status) {
  const node = $('monitor-connection-status');
  if (node) node.textContent = status;
}

function markMonitorEvent() {
  const node = $('monitor-last-event');
  if (node) node.textContent = new Date().toLocaleTimeString('ko-KR');
}

function enableMonitorUi() {
  document.body.classList.add('monitor-mode');
  const banner = document.createElement('div');
  banner.id = 'monitor-banner';
  document.querySelector('.phone')?.prepend(banner);
  banner.innerHTML = '<strong>MONITOR MODE</strong><span id="monitor-connection-status">연결 중</span><span id="monitor-current-game">현재 전체게임: -</span><span>마지막 이벤트 <time id="monitor-last-event">-</time></span>';
  document.querySelector('.stats-bar').hidden = true;
  ['map-viewport', 'member-chips', 'accept-toggle-banner', 'global-chat-btn', 'board-btn'].forEach((id) => { const node = $(id); if (node) node.hidden = true; });
  $('staff-call-text').textContent = '직원호출 테스트';
}

async function initMonitor() {
  try {
    const data = await monitorApi.authenticate(state.monitorToken);
    saveMonitorAuth(data.token);
    state.isMonitor = true;
    enableMonitorUi();
    ['map-viewport', 'global-chat-btn', 'board-btn'].forEach((id) => { const node = $(id); if (node) node.hidden = false; });
    ['global-chat-input', 'global-chat-send-btn', 'board-write-btn', 'board-history-btn'].forEach((id) => { const node = $(id); if (node) node.disabled = true; });
    showScreen('screen-seats');
    initTableMap();
    bindSocket();
    await syncMonitorState({ render: false });
    state.initialSyncDone = true;
    renderAll();
  } catch {
    $('join-btn').disabled = true;
    $('team-setup-fields').hidden = true;
    $('nickname-input').closest('.field-group').hidden = true;
    setLandingStatus('유효하지 않은 모니터링 QR입니다.');
  }
}

async function refreshParticipants() {
  state.participants = await participantsApi.list();
  state.participant = state.participants.find((p) => p.id === state.participant?.id) || state.participant;
}

async function refreshTables() {
  state.tables = await tablesApi.list();
  const mine = state.tables.find((table) => table.id === state.table?.id);
  if (mine?.activeSession) {
    state.session = mine.activeSession;
    setCounts(state.session.maleCount, state.session.femaleCount);
  }
}

async function refreshChatRoom() {
  state.chatRoom = await chatApi.active().catch(() => null);
  const [received, sent] = await Promise.all([
    chatApi.listRequests({ direction: 'received', status: 'PENDING' }).catch(() => []),
    chatApi.listRequests({ direction: 'sent', status: 'PENDING' }).catch(() => []),
  ]);
  state.receivedRequestsLog = received.map(receivedRequestEntry);
  state.pendingRequestPeers = new Map([...received, ...sent].map((room) => [Number(room.roomId), Number(room.peerSessionId)]));
  if (state.chatRoom?.status === 'ACTIVE') {
    await loadMessages(state.chatRoom.roomId);
    joinChatRoom(state.chatRoom.roomId);
  }
}

async function refreshNotices() {
  try {
    state.notices = await noticesApi.list(state.isMonitor ? 'MONITOR' : 'PARTICIPANT');
  } catch {
    state.notices = [];
  }
}

async function refreshBasketballLeaderboard() {
  state.basketballLeaderboard = (await basketballApi.leaderboard()).slice(0, 3);
}

async function refreshLikes() {
  const { given, received } = await tablesApi.likes();
  state.givenLikes = new Set(given.map((item) => Number(item.toSessionId)));
  state.receivedLikes = received;
}

async function refreshStaffCallStatus() {
  const { pending } = await tablesApi.staffCallStatus();
  state.staffCallPending = pending;
}

async function syncParticipantState(options = {}) {
  if (state.syncPromise) return state.syncPromise;
  state.syncPromise = (async () => {
    await Promise.allSettled([
      refreshParticipants(),
      refreshTables(),
      refreshChatRoom(),
      refreshNotices(),
      refreshBasketballLeaderboard(),
      refreshLikes(),
      refreshStaffCallStatus(),
    ]);
    if (options.render !== false) renderAll();
    if (state.chatRoom?.status === 'ACTIVE') openChat(state.chatRoom.roomId);
  })().finally(() => {
    state.syncPromise = null;
  });
  return state.syncPromise;
}

function renderMonitorGameStatus() {
  const node = $('monitor-current-game');
  if (!node) return;
  const game = state.activeGame;
  node.textContent = game ? `현재 전체게임: ${gameNames[game.type] || game.type} · ${game.state?.lifecyclePhase || game.status || '-'}` : '현재 전체게임: 없음';
}

async function refreshGlobalChat() {
  const messages = await globalChatApi.list(state.isMonitor ? 'MONITOR' : 'PARTICIPANT');
  mergeGlobalChatMessages(messages);
  state.globalChatLoaded = true;
}

async function refreshLiveContent() {
  if (state.liveContentRefreshPending || (!state.token && !state.isMonitor)) return;
  state.liveContentRefreshPending = true;
  try {
    const [noticesResult, chatResult, boardResult] = await Promise.allSettled([
      noticesApi.list(state.isMonitor ? 'MONITOR' : 'PARTICIPANT'),
      globalChatApi.list(state.isMonitor ? 'MONITOR' : 'PARTICIPANT'),
      boardApi.posts(state.isMonitor ? 'MONITOR' : 'PARTICIPANT'),
    ]);
    if (noticesResult.status === 'fulfilled') {
      const previousIds = new Set(state.notices.map((item) => String(item.id)));
      const incoming = noticesResult.value.filter((item) => !previousIds.has(String(item.id)));
      state.notices = noticesResult.value;
      if (state.liveContentReady && state.activeMenu !== 'notice') state.unreadNoticeCount += incoming.length;
      if (state.activeMenu === 'notice' || incoming.length) renderNotices();
    }
    if (chatResult.status === 'fulfilled') {
      const previousIds = new Set(state.globalChatMessages.map((item) => String(item.id)));
      const incoming = chatResult.value.filter((item) => !previousIds.has(String(item.id)));
      mergeGlobalChatMessages(chatResult.value);
      state.globalChatLoaded = true;
      if (state.liveContentReady && state.activeMenu !== 'chat') {
        state.unreadGlobalChatCount += incoming.filter((message) => (
          Number(message.senderParticipantId) !== Number(state.participant?.id)
        )).length;
      }
      updateGlobalChatBadge();
      if (state.activeMenu === 'chat') renderGlobalChat();
    }
    if (boardResult.status === 'fulfilled') {
      state.board.posts = boardResult.value;
      if (state.activeMenu === 'board' && !$('board-list-view').hidden) renderBoardList();
    }
    state.liveContentReady = true;
  } finally {
    state.liveContentRefreshPending = false;
  }
}

async function syncMonitorState(options = {}) {
  if (state.syncPromise) return state.syncPromise;
  state.syncPromise = Promise.allSettled([
    refreshTables(),
    refreshNotices(),
    refreshBasketballLeaderboard(),
    refreshGlobalChat(),
    loadBoardPosts(),
  ]).then(() => {
    if (options.render !== false) renderAll();
  }).finally(() => { state.syncPromise = null; });
  return state.syncPromise;
}

function scheduleTableRefresh() {
  state.tableRefreshPending = true;
  if (state.tableRefreshTimer || state.tableRefreshPromise) return;
  state.tableRefreshTimer = setTimeout(() => {
    state.tableRefreshTimer = null;
    state.tableRefreshPending = false;
    if (!state.tableRefreshPromise) {
      state.tableRefreshPromise = refreshTables()
        .catch(() => {})
        .then(() => {
          renderStats();
          renderTables();
        })
        .finally(() => {
          state.tableRefreshPromise = null;
          if (state.tableRefreshPending) scheduleTableRefresh();
        });
    }
  }, 120);
}

function bindSocket() {
  const socket = connectSocket(state.isMonitor ? 'MONITOR' : 'PARTICIPANT');
  if (!socket) return;

  socket.on('connect', () => {
    if (state.isMonitor) updateMonitorStatus('● 실시간 연결됨');
    $('connection-status').textContent = '실시간 연결됨';
    if (state.chatRoom?.status === 'ACTIVE') joinChatRoom(state.chatRoom.roomId);
    if (state.hasConnectedOnce && state.initialSyncDone) {
      if (state.isMonitor) syncMonitorState().catch(() => {});
      else syncParticipantState().catch(() => {});
    }
    state.hasConnectedOnce = true;
  });
  socket.on('disconnect', () => {
    $('connection-status').textContent = '재연결 대기';
    if (state.isMonitor) updateMonitorStatus('재연결 중');
  });
  socket.onAny(() => { if (state.isMonitor) markMonitorEvent(); });
  socket.on('participant:joined', async (payload = {}) => {
    if (payload.sessionId && Number(payload.sessionId) !== Number(state.session?.id)) return;
    await refreshParticipants();
    renderParticipants();
  });
  socket.on('participant:updated', async () => {
    await refreshParticipants();
    renderParticipants();
  });
  socket.on('participant:left', async (payload = {}) => {
    // Reserved for a future explicit leave flow; checkout still uses table:checked-out.
    if (payload.sessionId && Number(payload.sessionId) !== Number(state.session?.id)) return;
    await refreshParticipants();
    renderParticipants();
  });
  socket.on('participant:kicked', (payload = {}) => {
    clearParticipantAuth();
    if (state.timer) clearInterval(state.timer);
    $('kicked-message').textContent = payload.message || '관리자에 의해 강제 퇴장되었습니다.';
    showScreen('screen-kicked');
    socket.disconnect();
  });
  socket.on('table:updated', scheduleTableRefresh);
  socket.on('table:extended', ({ session }) => {
    state.session = session;
    renderStats();
    renderTables();
  });
  socket.on('table:checked-out', () => {
    showToast('퇴실 처리되었습니다.');
    clearParticipantAuth();
    setLandingStatus('세션이 종료되었습니다. 관리자에게 문의해 주세요.');
    showScreen('screen-landing');
  });
  socket.on('chat:request-received', (room) => {
    if (room.direction === 'received') {
      upsertReceivedRequest(room);
    }
    renderChatRequest();
    renderTables();
    refreshReceivedRequestsIfOpen();
  });
  socket.on('chat:request-cancelled', (room) => {
    if (state.chatRoom?.roomId === room.roomId) state.chatRoom = null;
    removeReceivedRequest(room.roomId);
    renderStats();
    refreshReceivedRequestsIfOpen();
    renderTables();
    showToast('상대방이 채팅 요청을 취소했습니다.');
  });
  socket.on('chat:request-rejected', (room) => {
    if (state.chatRoom?.roomId === room.roomId) state.chatRoom = null;
    removeReceivedRequest(room.roomId);
    renderStats();
    refreshReceivedRequestsIfOpen();
    renderTables();
    showToast('채팅 요청이 거절되었습니다.');
  });
  socket.on('chat:request-expired', (room) => {
    if (state.chatRoom?.roomId === room.roomId) state.chatRoom = null;
    removeReceivedRequest(room.roomId);
    renderStats();
    refreshReceivedRequestsIfOpen();
    renderTables();
    showToast('채팅 요청 시간이 만료되었습니다.');
  });
  socket.on('chat:started', async (room) => {
    state.chatRoom = room;
    removeReceivedRequest(room.roomId);
    closeModal('modal-received-requests');
    await loadMessages(room.roomId);
    showToast('채팅 요청이 수락되었습니다!');
    openChat(room.roomId);
  });
  socket.on('chat:active', async (room) => {
    state.chatRoom = room;
    await loadMessages(room.roomId);
    openChat(room.roomId);
  });
  socket.on('chat:message', (message) => {
    const list = state.messages.get(message.roomId) || [];
    if (!list.some((item) => item.id === message.id)) list.push(message);
    state.messages.set(message.roomId, list);
    renderChat();
  });
  socket.on('chat:ended', (room) => {
    const roomId = room.roomId ?? room.id;
    state.messages.delete(roomId);
    if (state.chatRoom?.roomId === roomId) state.chatRoom = null;
    if (state.activeRoomId === roomId) {
      state.activeRoomId = null;
      showScreen('screen-seats');
      const endedByMe = room.endedByParticipantId && room.endedByParticipantId === state.participant?.id;
      if (!endedByMe) {
        $('chat-ended-detail').textContent = '채팅 참여자가 채팅을 종료해 해당 채팅이 종료되었습니다.';
        openModal('modal-chat-ended');
      }
    }
  });
  socket.on('notice:created', (notice) => {
    if (!state.notices.some((item) => item.id === notice.id)) state.notices.unshift(notice);
    if (state.activeMenu !== 'notice') state.unreadNoticeCount += 1;
    renderNotices();
    showNoticePopup(notice);
  });
  socket.on('notice:deleted', ({ id }) => {
    state.notices = state.notices.filter((notice) => notice.id !== id);
    renderNotices();
  });
  socket.on('globalChat:message', (message) => {
    mergeGlobalChatMessages([message]);
    const mine = Number(message.senderParticipantId) === Number(state.participant?.id);
    if (state.activeMenu === 'chat') renderGlobalChat();
    else if (!mine) {
      state.unreadGlobalChatCount += 1;
      updateGlobalChatBadge();
    }
  });
  socket.on('board:created', (post) => {
    if (!state.board.posts.some((item) => item.id === post.id)) state.board.posts.unshift(post);
    if (state.activeMenu === 'board' && !$('board-list-view').hidden) renderBoardList();
  });
  socket.on('board:deleted', ({ id }) => {
    state.board.posts = state.board.posts.filter((post) => post.id !== id);
    if (state.board.currentPost?.id === id) showBoardList();
    if (state.activeMenu === 'board' && !$('board-list-view').hidden) renderBoardList();
  });
  socket.on('board:profile-viewed', async (view = {}) => {
    if (!$('board-views-view').hidden) await showBoardViews();
    const tableLabel = view.viewer?.tableNumber ? `TABLE ${view.viewer.tableNumber}` : 'TABLE -';
    showToast(`${view.viewer?.nickname || '참가자'} · ${tableLabel}님이 내 정보를 열람했습니다.`);
  });
  socket.on('table:like-changed', async (result) => {
    try {
      const { received } = await tablesApi.likes();
      state.receivedLikes = received;
      renderTables();
      if ($('modal-received-likes').classList.contains('active')) renderReceivedLikes();
      if (result?.liked && result.fromTableNumber) showLikePopup(result.fromTableNumber);
    } catch { /* ignore */ }
  });
  socket.on('staffCall:resolved', () => {
    state.staffCallPending = false;
    updateStaffCallButton();
  });
  socket.on('game:global:announced', (game) => {
    closeAllTransientModals();
    state.activeGame = game;
    showGameAnnouncement(game);
    renderGame();
  });
  socket.on('game:global:started', (game) => {
    closeAllTransientModals();
    state.activeGame = game;
    closeModal('modal-game-participation');
    requestGameParticipation(game);
    renderGame();
  });
  socket.on('game:global:current', (game) => {
    closeAllTransientModals();
    state.activeGame = game;
    if (game?.state?.lifecyclePhase === 'ANNOUNCED') showGameAnnouncement(game);
    else if (game?.state?.lifecyclePhase === 'RESULTS') showFinalScores(game);
    else if (state.isMonitor || game?.type !== 'TIME_MATCH') requestGameParticipation(game);
    renderGame();
  });
  socket.on('game:global:ended', (game) => {
    closeAllTransientModals();
    resetTimeMatch();
    state.activeGame = null;
    state.participationDecisions.delete(Number(game.id));
    $('pinball-viewer-frame').src = 'about:blank';
    renderGame();
    closeModal('modal-game');
    closeModal('modal-game-participation');
    closeModal('modal-game-results');
    showScreen(state.activeRoomId ? 'screen-chat' : 'screen-seats');
    showToast(`${gameNames[game.type] || game.type} 게임이 종료되었습니다.`);
  });
  socket.on('admin:data-reset', () => {
    closeAllTransientModals();
    state.activeGame = null;
    state.boardPosts = [];
    state.boardLoaded = false;
    state.board = { profile: null, posts: [], currentPost: null, revealedProfile: null, views: [] };
    state.participationDecisions.clear();
    $('pinball-viewer-frame').src = 'about:blank';
    renderGame();
    showScreen(state.activeRoomId ? 'screen-chat' : 'screen-seats');
  });
  socket.on('game:global:updated', (game) => {
    const previousRound = Number(state.activeGame?.state?.currentRound || 0);
    state.activeGame = game;
    const currentRound = Number(game.state?.currentRound || 0);
    if (currentRound !== previousRound) {
      closeAllTransientModals();
      state.gameAnswer = null;
      if (isParticipating(game.id)) showGlobalGameScreen();
      showToast(`${currentRound + 1}라운드가 시작되었습니다.`);
    } else if (game.state?.answerRevealed) {
      if (isParticipating(game.id)) {
        if (!$('screen-game').classList.contains('active')) showGlobalGameScreen();
        showRoundResult();
      }
    }
  });
  socket.on('game:global:results', (game) => {
    closeAllTransientModals();
    state.activeGame = game;
    showFinalScores(game);
  });
  socket.on('basketball:leaderboard', (payload = {}) => {
    state.basketballLeaderboard = Array.isArray(payload.leaderboard) ? payload.leaderboard.slice(0, 3) : [];
    renderGame();
  });
  socket.on('game:global:round', (payload) => {
    closeAllTransientModals();
    if (!state.activeGame || Number(payload.gameId) !== Number(state.activeGame.id)) return;
    if (['TIME_MATCH', 'PINBALL'].includes(payload.type || state.activeGame.type)) return;
    const rounds = [...(state.activeGame.state?.rounds || [])];
    rounds[Number(payload.roundIndex || 0)] = payload.round || {};
    state.activeGame = {
      ...state.activeGame,
      type: payload.type || state.activeGame.type,
      state: { ...(state.activeGame.state || {}), rounds, currentRound: Number(payload.roundIndex || 0), answerRevealed: false },
    };
    if (isParticipating(state.activeGame.id)) showGlobalGameScreen();
  });
  socket.on('game:global:prompt', (payload) => {
    closeAllTransientModals();
    if (!state.activeGame || Number(payload.gameId) !== Number(state.activeGame.id)) return;
    state.activeGame = {
      ...state.activeGame,
      state: {
        ...(state.activeGame.state || {}),
        currentRound: Number(payload.roundIndex || 0),
        currentPrompt: Number(payload.promptIndex || 0),
      },
    };
    if (isParticipating(state.activeGame.id)) {
      showGlobalGameScreen();
      showToast(`${Number(payload.promptIndex || 0) + 1}번째 제시어가 공개되었습니다.`);
    }
  });
  socket.on('game:global:answer', (payload) => {
    if (!state.activeGame || Number(payload.gameId) !== Number(state.activeGame.id)) return;
    const roundIndex = Number(payload.roundIndex || 0);
    const rounds = [...(state.activeGame.state?.rounds || [])];
    rounds[roundIndex] = { ...(rounds[roundIndex] || {}), answer: payload.answer };
    state.activeGame = { ...state.activeGame, state: { ...(state.activeGame.state || {}), rounds, currentRound: roundIndex, answerRevealed: true } };
    if (isParticipating(state.activeGame.id)) {
      if (!$('screen-game').classList.contains('active')) showGlobalGameScreen();
      showRoundResult();
    }
  });
  socket.on('game:global:spin', (payload) => {
    closeAllTransientModals();
    if (!state.activeGame || Number(payload.gameId) !== Number(state.activeGame.id)) return;
    if (isParticipating(state.activeGame.id)) {
      if (!$('screen-game').classList.contains('active')) showGlobalGameScreen();
      spinRoulette(payload);
    }
  });
  socket.on('game:invited', (game) => {
    state.activeGame = game;
    renderGame();
    showToast('1:1 게임 초대가 도착했습니다.');
  });
  socket.on('game:started', (game) => {
    state.activeGame = game;
    renderGame();
  });
  socket.on('game:state', (game) => {
    state.activeGame = game;
    renderGame();
  });
  socket.on('game:ended', (game) => {
    state.activeGame = game;
    renderGame();
  });
}

function renderAll() {
  if (state.isMonitor) {
    renderStats();
    renderTables();
    renderSeatView();
    renderNotices();
    renderGame();
    return;
  }
  renderStats();
  renderParticipants();
  renderTables();
  renderSeatView();
  renderChatRequest();
  renderNotices();
  renderGame();
}

function renderStats() {
  if (state.isMonitor) {
    $('table-tag').textContent = 'MONITOR';
    $('table-tag-time').textContent = '운영 데이터 미포함';
    return;
  }
  $('table-tag').textContent = `TABLE ${state.table?.tableNumber || '-'}`;
  $('stat-male').textContent = state.session?.maleCount ?? state.counts.male;
  $('stat-female').textContent = state.session?.femaleCount ?? state.counts.female;
  const left = state.session?.expiresAt ? formatRemaining(state.session.expiresAt) : '00:00';
  $('stat-time').textContent = left;
  $('table-tag-time').textContent = `${left} 남음`;
  $('stat-requests').textContent = `${state.receivedRequestsLog.length}개`;
  renderAcceptToggle();
  updateStaffCallButton();
}

function renderAcceptToggle() {
  const banner = $('accept-toggle-banner');
  const isHost = !!state.participant?.isHost;
  banner.hidden = !isHost;
  if (!isHost) return;
  const accepting = state.session?.acceptingRequests !== false;
  $('accept-toggle-label').textContent = accepting ? '채팅 요청을 받고 있어요.' : '채팅 요청을 받지 않아요.';
  $('accept-toggle-btn').classList.toggle('on', accepting);
}

function updateStaffCallButton() {
  const btn = $('staff-call-btn');
  btn.classList.toggle('calling', !!state.staffCallPending);
  $('staff-call-text').textContent = state.isMonitor ? '직원호출 테스트' : state.staffCallPending ? '직원 호출 중...' : '직원호출';
}

async function callStaff() {
  if (state.isMonitor) {
    await monitorApi.staffCallTest();
    showToast('관리자에게 테스트 호출을 전송했습니다.');
    return;
  }
  if (state.staffCallPending) {
    showToast('이미 직원을 호출했습니다. 잠시만 기다려 주세요.');
    return;
  }
  await tablesApi.callStaff();
  state.staffCallPending = true;
  updateStaffCallButton();
  showToast('직원을 호출했습니다.');
}

function renderReceivedLikes() {
  const list = $('received-likes-list');
  clear(list);
  if (!state.receivedLikes.length) {
    list.appendChild(text('div', 'history-empty', '아직 좋아요를 받지 않았습니다.'));
    return;
  }
  state.receivedLikes.forEach((like) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const info = document.createElement('div');
    info.className = 'history-info';
    info.appendChild(text('div', 'history-seat-name', `TABLE ${like.fromTableNumber}`));
    item.appendChild(info);
    item.addEventListener('click', () => {
      const table = state.tables.find((entry) => entry.tableNumber === like.fromTableNumber);
      if (!table?.activeSession) return showToast('사용 중인 테이블에만 요청할 수 있습니다.');
      closeModal('modal-received-likes');
      openJoinModal(table);
    });
    list.appendChild(item);
  });
}

function removeReceivedRequest(roomId) {
  state.pendingRequestPeers.delete(Number(roomId));
  const index = state.receivedRequestsLog.findIndex((item) => item.roomId === roomId);
  if (index !== -1) state.receivedRequestsLog.splice(index, 1);
}

function receivedRequestEntry(room) {
  return {
    roomId: room.roomId,
    peerSessionId: room.peerSessionId,
    tableNumber: room.peerTableNumber,
    maleCount: room.peerMaleCount,
    femaleCount: room.peerFemaleCount,
    createdAt: room.createdAt || new Date().toISOString(),
  };
}

function upsertReceivedRequest(room) {
  state.pendingRequestPeers.set(Number(room.roomId), Number(room.peerSessionId));
  if (state.receivedRequestsLog.some((entry) => entry.roomId === room.roomId)) return;
  state.receivedRequestsLog.unshift(receivedRequestEntry(room));
}

function refreshReceivedRequestsIfOpen() {
  if ($('modal-received-requests').classList.contains('active')) renderReceivedRequests();
}

function renderReceivedRequests() {
  const list = $('received-requests-list');
  clear(list);
  if (!state.receivedRequestsLog.length) {
    list.appendChild(text('div', 'history-empty', '받은 채팅 요청이 없습니다.'));
    return;
  }
  state.receivedRequestsLog.forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.appendChild(text('div', 'request-card-icon', '💬'));

    const body = document.createElement('div');
    body.className = 'request-card-body';
    const top = document.createElement('div');
    top.className = 'request-card-top';
    top.appendChild(text('div', 'request-card-title', `TABLE ${entry.tableNumber} 채팅 요청`));
    top.appendChild(text('div', 'request-card-time', '지금'));
    body.appendChild(top);
    body.appendChild(text('div', 'request-card-sub', formatComposition({ maleCount: entry.maleCount, femaleCount: entry.femaleCount })));

    const actions = document.createElement('div');
    actions.className = 'request-card-actions';
    actions.appendChild(button('request-action reject', '거절', () => rejectReceivedRequest(entry.roomId)));
    actions.appendChild(button('request-action accept', '수락', () => acceptReceivedRequest(entry.roomId)));
    body.appendChild(actions);

    card.appendChild(body);
    list.appendChild(card);
  });
}

function updateSendLikeButton(table) {
  const sessionId = Number(table?.activeSession?.id);
  const liked = state.givenLikes.has(sessionId);
  $('send-like-btn').classList.toggle('liked', liked);
  $('send-like-text').textContent = liked ? '좋아요 취소' : '테이블 좋아요 누르기';
  $('send-like-count-value').textContent = table?.activeSession?.receivedLikeCount || 0;
}

async function toggleTableLike(table) {
  if (!state.participant?.isHost) {
    showToast('대표만 좋아요를 누를 수 있습니다.');
    return;
  }
  try {
    const result = await tablesApi.toggleLike(table.id);
    const sessionId = Number(result.toSessionId);
    if (result.liked) state.givenLikes.add(sessionId);
    else state.givenLikes.delete(sessionId);
    renderTables();
    if (state.pendingTargetTable?.id === table.id) {
      const current = state.pendingTargetTable.activeSession?.receivedLikeCount || 0;
      state.pendingTargetTable.activeSession.receivedLikeCount = Math.max(0, current + (result.liked ? 1 : -1));
      updateSendLikeButton(state.pendingTargetTable);
    }
  } catch (error) {
    showToast(error.message);
  }
}

function renderParticipants() {
  const box = $('member-chips');
  clear(box);
  state.participants.forEach((participant) => {
    const chip = text('span', `chip ${participant.id === state.participant?.id ? 'me' : ''}`, `${participant.nickname}${participant.isHost ? ' 대표' : ''}`);
    if (participant.id === state.participant?.id) {
      chip.addEventListener('click', () => {
        $('nickname-edit-input').value = participant.nickname;
        openModal('modal-nickname');
      });
    }
    box.appendChild(chip);
  });
}

function formatComposition(session) {
  const male = session.maleCount || 0;
  const female = session.femaleCount || 0;
  const parts = [];
  if (male > 0) parts.push(`남 ${male}`);
  if (female > 0) parts.push(`여 ${female}`);
  return parts.join(' · ') || '-';
}

const LIKE_HEAT_BASE_OPACITY = 0.12;
const LIKE_HEAT_STEP_PER_LIKE = 0.05;
const LIKE_HEAT_MAX_SPREAD = 0.25;
const LIKE_HEAT_CATEGORY_RGB = {
  male: '102, 178, 255',
  female: '255, 121, 164',
  mixed: '159, 216, 63',
};

function tableGenderCategory(session) {
  const hasMale = (session?.maleCount || 0) > 0;
  const hasFemale = (session?.femaleCount || 0) > 0;
  return hasMale && hasFemale ? 'mixed' : hasFemale ? 'female' : hasMale ? 'male' : null;
}

function computeLikeHeatMaxByCategory(tables) {
  const max = { male: 0, female: 0, mixed: 0 };
  tables.forEach((table) => {
    const session = table.activeSession;
    const category = session && tableGenderCategory(session);
    if (!category) return;
    const count = session.receivedLikeCount || 0;
    if (count > max[category]) max[category] = count;
  });
  return max;
}

function renderTables() {
  const canvas = $('map-canvas');
  clear(canvas);

  const stage = document.createElement('div');
  stage.className = 'map-stage';
  stage.appendChild(text('div', 'map-stage-arrows', '↑ ↑ ↑'));
  stage.appendChild(text('div', 'map-stage-label', '무대'));
  canvas.appendChild(stage);

  const likeHeatMax = computeLikeHeatMaxByCategory(state.tables);

  state.tables.forEach((table) => {
    const session = table.activeSession;
    const isMine = table.id === state.table?.id;
    const requestsOff = !isMine && !!session && session.acceptingRequests === false;
    let genderClass = '';
    let category = null;
    if (session && !isMine) {
      category = tableGenderCategory(session);
      genderClass = category ? ` ${category}` : '';
    }
    const cell = document.createElement('div');
    cell.className = `table-cell ${isMine ? 'mine' : session ? `taken${genderClass}` : 'available'}${requestsOff ? ' requests-off' : ''}`;
    if (category && !requestsOff) {
      const maxForCategory = likeHeatMax[category] || 0;
      const likeCount = session.receivedLikeCount || 0;
      const t = maxForCategory > 0 ? Math.min(1, likeCount / maxForCategory) : 0;
      const spread = Math.min(LIKE_HEAT_MAX_SPREAD, maxForCategory * LIKE_HEAT_STEP_PER_LIKE);
      const opacity = LIKE_HEAT_BASE_OPACITY + spread * t;
      cell.style.background = `rgba(${LIKE_HEAT_CATEGORY_RGB[category]}, ${opacity.toFixed(3)})`;
    }
    cell.appendChild(text('span', 'table-cell-number', String(table.tableNumber).padStart(2, '0')));
    if (session) cell.appendChild(text('div', 'table-cell-count', formatComposition(session)));
    if (session?.inChat) cell.appendChild(text('div', 'table-cell-chatting', '채팅중'));
    if (isMine) {
      if (state.receivedLikes.length) {
        const badge = text('span', 'table-cell-like-badge', state.receivedLikes.length > 99 ? '99+' : String(state.receivedLikes.length));
        cell.appendChild(badge);
      }
      cell.addEventListener('click', () => {
        if (mapZoom?.hasMoved()) return;
        renderReceivedLikes();
        openModal('modal-received-likes');
      });
    }
    if (!isMine && session && !state.isMonitor) {
      cell.appendChild(createLikeButton(table));
      cell.appendChild(button('table-cell-btn', '채팅 요청', (event) => {
        event.stopPropagation();
        if (requestsOff) return showToast('합석 요청이 꺼져있어 합석이 불가능합니다.');
        openJoinModal(table);
      }));
      cell.addEventListener('click', () => {
        if (mapZoom?.hasMoved()) return;
        if (requestsOff) return showToast('합석 요청이 꺼져있어 합석이 불가능합니다.');
        openJoinModal(table);
      });
    }
    canvas.appendChild(cell);
  });
  mapZoom?.refreshMinScale();
}

let mapZoom = null;
function initTableMap() {
  if (mapZoom) return;
  mapZoom = initMapZoom({
    viewport: $('map-viewport'),
    canvas: $('map-canvas'),
    minScale: 1,
    maxScale: 3,
    zoomedThreshold: 1.6,
  });
  $('map-zoom-in').addEventListener('click', () => mapZoom.zoomIn());
  $('map-zoom-out').addEventListener('click', () => mapZoom.zoomOut());
  $('map-zoom-reset').addEventListener('click', () => mapZoom.reset());
}

async function acceptReceivedRequest(roomId) {
  try {
    const accepted = await chatApi.accept(roomId);
    state.chatRoom = accepted;
    removeReceivedRequest(roomId);
    closeModal('modal-received-requests');
    renderStats();
    renderTables();
    await loadMessages(accepted.roomId);
    openChat(accepted.roomId);
  } catch (error) {
    showToast(error.message);
  }
}

async function rejectReceivedRequest(roomId) {
  try {
    await chatApi.reject(roomId);
    if (state.chatRoom?.roomId === roomId) state.chatRoom = null;
    removeReceivedRequest(roomId);
    renderStats();
    renderTables();
    renderReceivedRequests();
  } catch (error) {
    showToast(error.message);
  }
}

function showRequestPopup() {
  const push = $('request-push');
  push.classList.add('show');
  clearTimeout(push._hideTimer);
  push._hideTimer = setTimeout(() => push.classList.remove('show'), 3500);
}

function renderChatRequest() {
  if (state.receivedRequestsLog.length && state.participant?.isHost) showRequestPopup();
  renderStats();
}

async function toggleAcceptingRequests() {
  const current = state.session?.acceptingRequests !== false;
  try {
    await tablesApi.updateAccepting(!current);
    await refreshTables();
    renderTables();
    renderStats();
  } catch (error) {
    showToast(error.message);
  }
}

function openJoinModal(table) {
  if (!state.participant?.isHost) {
    showToast('처음 로그인한 대표자만 채팅 요청이 가능합니다.');
    return;
  }
  if (state.chatRoom?.status === 'ACTIVE') {
    showToast('이미 진행 중인 채팅 요청이 있습니다.');
    return;
  }
  state.pendingTargetTable = table;
  $('send-seat-label').textContent = `TABLE ${table.tableNumber}에 채팅 요청`;
  const inChat = !!table.activeSession?.inChat;
  const pending = [...state.pendingRequestPeers.values()].some((id) => Number(id) === Number(table.activeSession.id));
  const sendBtn = $('send-request-btn');
  sendBtn.disabled = inChat || pending;
  sendBtn.textContent = inChat ? '이미 채팅 중인 테이블입니다' : pending ? '처리 대기 중인 요청이 있습니다' : '요청 보내기';
  updateSendLikeButton(table);
  openModal('modal-send');
  loadRequestBlockState(table);
}

function renderRequestBlockToggle() {
  const toggle = $('request-block-toggle');
  const blockState = state.requestBlock;
  toggle.classList.toggle('on', blockState.blocked);
  toggle.disabled = blockState.loading || !state.participant?.isHost || !blockState.targetSessionId;
}

async function loadRequestBlockState(table) {
  const targetSessionId = table?.activeSession?.id;
  const requestId = state.requestBlock.requestId + 1;
  state.requestBlock = { targetSessionId, blocked: false, loading: true, requestId };
  renderRequestBlockToggle();
  if (!targetSessionId) return;

  try {
    const result = await chatApi.getBlock(targetSessionId);
    const currentTargetId = state.pendingTargetTable?.activeSession?.id;
    if (state.requestBlock.requestId !== requestId || Number(currentTargetId) !== Number(targetSessionId)) return;
    state.requestBlock = { targetSessionId, blocked: !!result.blocked, loading: false, requestId };
    renderRequestBlockToggle();
  } catch (error) {
    if (state.requestBlock.requestId !== requestId) return;
    state.requestBlock = { targetSessionId, blocked: false, loading: false, requestId };
    renderRequestBlockToggle();
    showToast(error.message);
  }
}

async function toggleRequestBlock() {
  const blockState = state.requestBlock;
  const targetSessionId = blockState.targetSessionId;
  if (!targetSessionId || blockState.loading) return;

  state.requestBlock = { ...blockState, loading: true };
  renderRequestBlockToggle();
  try {
    const result = blockState.blocked
      ? await chatApi.unblock(targetSessionId)
      : await chatApi.block(targetSessionId);
    const currentTargetId = state.pendingTargetTable?.activeSession?.id;
    if (state.requestBlock.requestId !== blockState.requestId || Number(currentTargetId) !== Number(targetSessionId)) return;
    state.requestBlock = {
      targetSessionId,
      blocked: !!result.blocked,
      loading: false,
      requestId: blockState.requestId,
    };
    renderRequestBlockToggle();
  } catch (error) {
    if (state.requestBlock.requestId !== blockState.requestId) return;
    state.requestBlock = { ...blockState, loading: false };
    renderRequestBlockToggle();
    showToast(error.message);
  }
}

async function sendJoinRequest() {
  const target = state.pendingTargetTable;
  if (!target?.activeSession?.id) return showToast('사용 중인 테이블에만 요청할 수 있습니다.');
  let room;
  try {
    room = await chatApi.createRequest({ targetSessionId: target.activeSession.id });
  } catch (error) {
    if (error.code === 'CHAT_REQUEST_REJECTED') closeModal('modal-send');
    throw error;
  }
  closeModal('modal-send');
  showToast('채팅 요청을 보냈습니다. 상대방의 응답을 기다려 주세요.');
}

async function loadMessages(roomId) {
  const messages = await chatApi.messages(roomId);
  state.messages.set(roomId, messages);
}

function joinChatRoom(roomId) {
  getSocket()?.emit('chat:join', { roomId }, (response) => {
    if (!response?.ok) showToast(response?.message || response?.error || '채팅방 입장 실패');
  });
}

function openChat(roomId) {
  state.activeRoomId = roomId;
  joinChatRoom(roomId);
  const peerTableNumber = state.chatRoom?.peerTableNumber;
  $('chat-title').textContent = peerTableNumber ? `TABLE ${peerTableNumber}과 채팅중` : `채팅방 #${roomId}`;
  $('chat-me-label').textContent = `내 닉네임: ${state.participant?.nickname || '-'}`;
  renderChat();
  showScreen('screen-chat');
}

async function confirmLeaveChat() {
  const roomId = state.activeRoomId;
  if (!roomId) return closeModal('modal-leave-confirm');
  try {
    await chatApi.end(roomId);
    closeModal('modal-leave-confirm');
  } catch (error) {
    showToast(error.message);
  }
}

function renderChat() {
  if (!state.activeRoomId) return;
  const log = $('chat-log');
  clear(log);
  const messages = state.messages.get(state.activeRoomId) || [];
  messages.forEach((message) => {
    const mine = message.senderParticipantId === state.participant?.id;
    const group = document.createElement('div');
    group.className = `bubble-group ${mine ? 'me' : 'other'}`;
    group.appendChild(text('div', 'bubble-name', mine ? state.participant.nickname : message.senderParticipant?.nickname || '참가자'));
    group.appendChild(text('div', `chat-bubble ${mine ? 'me' : 'other'}`, message.content));
    log.appendChild(group);
  });
  log.scrollTop = log.scrollHeight;
}

function sendChatMessage() {
  const input = $('chat-input');
  const content = input.value.trim();
  if (!content || !state.activeRoomId) return;
  getSocket()?.emit('chat:send', { roomId: state.activeRoomId, content }, (response) => {
    if (!response?.ok) return showToast(response?.message || response?.error || '메시지 전송 실패');
    input.value = '';
  });
}

function renderGlobalChat({ forceBottom = false } = {}) {
  const log = $('global-chat-log');
  const previousScrollTop = log.scrollTop;
  const distanceFromBottom = log.scrollHeight - log.scrollTop - log.clientHeight;
  const shouldStickToBottom = forceBottom || distanceFromBottom < 48;
  clear(log);
  state.globalChatMessages.forEach((message) => {
    const isAdmin = message.senderRole === 'ADMIN';
    const mine = !isAdmin && Number(message.senderParticipantId) === Number(state.participant?.id);
    const session = message.senderParticipant?.session;
    const tableNumber = session?.table?.tableNumber;
    const name = isAdmin ? '관리자' : (message.senderParticipant?.nickname || '참가자');
    const label = isAdmin ? name : `${name}(Table ${tableNumber ?? '-'})`;
    const hasMale = Number(session?.maleCount || 0) > 0;
    const hasFemale = Number(session?.femaleCount || 0) > 0;
    const genderClass = isAdmin ? 'admin' : hasMale && hasFemale ? 'mixed' : hasFemale ? 'female' : hasMale ? 'male' : '';
    const row = document.createElement('article');
    row.className = `global-chat-message${mine ? ' mine' : ''}${isAdmin ? ' admin' : ''}`;
    row.appendChild(text('span', `global-chat-icon ${genderClass}`));
    const body = document.createElement('div');
    body.className = 'global-chat-message-body';
    const head = document.createElement('div');
    head.className = 'global-chat-message-head';
    head.appendChild(text('strong', 'global-chat-message-name', label));
    const createdAt = new Date(message.createdAt);
    head.appendChild(text('time', 'global-chat-message-time', Number.isNaN(createdAt.getTime()) ? '' : createdAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })));
    body.appendChild(head);
    body.appendChild(text('div', 'global-chat-message-content', message.content || ''));
    row.appendChild(body);
    log.appendChild(row);
  });
  $('global-chat-empty').hidden = state.globalChatMessages.length > 0;
  log.scrollTop = shouldStickToBottom ? log.scrollHeight : previousScrollTop;
}

function mergeGlobalChatMessages(messages) {
  const byId = new Map(state.globalChatMessages.map((message) => [String(message.id), message]));
  messages.forEach((message) => {
    if (message?.id == null) return;
    byId.set(String(message.id), message);
  });
  state.globalChatMessages = [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function renderSeatView() {
  const globalChatOpen = state.activeMenu === 'chat';
  setMainContent(state.activeMenu || 'map');
  document.querySelectorAll('.bottombar .pill-btn').forEach((node) => node.classList.toggle('active', node.id === `${state.activeMenu === 'chat' ? 'global-chat' : state.activeMenu}-btn`));
  if (globalChatOpen) renderGlobalChat({ forceBottom: true });
}

function renderBottomMenuState() {
  document.querySelectorAll('.bottombar .pill-btn').forEach((node) => {
    const key = node.id === 'global-chat-btn' ? 'chat' : node.id.replace('-btn', '');
    node.classList.toggle('active', key === state.activeMenu);
  });
}

async function toggleGlobalChat() {
  setMainContent('chat');
  if (state.activeMenu !== 'chat' || state.globalChatLoaded) return;
  try {
    const messages = await globalChatApi.list(state.isMonitor ? 'MONITOR' : 'PARTICIPANT');
    mergeGlobalChatMessages(messages);
    state.globalChatLoaded = true;
    if (state.activeMenu === 'chat') renderGlobalChat({ forceBottom: true });
  } catch (error) {
    showToast(error.message || '전체채팅을 불러오지 못했습니다.');
  }
}

function sendGlobalChatMessage() {
  const input = $('global-chat-input');
  const content = input.value.trim();
  if (!content || state.globalChatSending) return;
  const socket = getSocket();
  if (!socket?.connected) return showToast('서버 연결을 확인해 주세요.');
  state.globalChatSending = true;
  $('global-chat-send-btn').disabled = true;
  socket.timeout(5000).emit('globalChat:send', { content }, (error, response) => {
    state.globalChatSending = false;
    $('global-chat-send-btn').disabled = false;
    if (error || !response?.ok) return showToast(response?.message || response?.error || '메시지 전송에 실패했습니다.');
    input.value = '';
    input.focus();
  });
}

function renderBoardListLegacy() {
  const list = $('board-list');
  clear(list);
  if (!state.boardPosts.length) {
    list.appendChild(text('div', 'history-empty', '게시글이 없습니다.'));
    return;
  }
  state.boardPosts.forEach((post) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const info = document.createElement('div');
    info.className = 'history-info';
    info.appendChild(text('div', 'history-seat-name', post.title));
    const authorName = post.author?.nickname || '참가자';
    const tableNumber = post.author?.session?.table?.tableNumber;
    info.appendChild(text('div', 'history-preview', tableNumber ? `${authorName} · T${tableNumber}` : authorName));
    item.appendChild(info);
    item.addEventListener('click', () => showBoardDetail(post));
    list.appendChild(item);
  });
}

function showBoardListLegacy() {
  state.activeBoardPost = null;
  $('board-write-view').hidden = true;
  $('board-detail-view').hidden = true;
  $('board-list-view').hidden = false;
}

function showBoardWriteLegacy() {
  $('board-title-input').value = '';
  $('board-content-input').value = '';
  $('board-list-view').hidden = true;
  $('board-detail-view').hidden = true;
  $('board-write-view').hidden = false;
}

function showBoardDetailLegacy(post) {
  state.activeBoardPost = post;
  $('board-detail-title').textContent = post.title;
  $('board-detail-content').textContent = post.content;
  const authorName = post.author?.nickname || '참가자';
  const tableNumber = post.author?.session?.table?.tableNumber;
  const who = tableNumber ? `${authorName} · T${tableNumber}` : authorName;
  $('board-detail-meta').textContent = `${who} · ${formatDateTime(post.createdAt)}`;
  $('board-delete-btn').hidden = post.authorParticipantId !== state.participant?.id;
  $('board-list-view').hidden = true;
  $('board-write-view').hidden = true;
  $('board-detail-view').hidden = false;
}

async function submitBoardPostLegacy() {
  const title = $('board-title-input').value.trim();
  const content = $('board-content-input').value.trim();
  if (!title || !content) return showToast('제목과 내용을 입력해 주세요.');
  const post = await boardApi.create(title, content);
  if (!state.boardPosts.some((entry) => entry.id === post.id)) state.boardPosts.unshift(post);
  showBoardList();
  renderBoardList();
}

async function deleteActiveBoardPostLegacy() {
  if (!state.activeBoardPost) return;
  const id = state.activeBoardPost.id;
  await boardApi.remove(id);
  state.boardPosts = state.boardPosts.filter((post) => post.id !== id);
  showBoardList();
  renderBoardList();
}

function renderNotices() {
  const list = $('notice-list');
  clear(list);
  if (!state.notices.length) {
    list.appendChild(text('div', 'history-empty', '공지 없음'));
  } else {
    state.notices.forEach((notice) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const info = document.createElement('div');
      info.className = 'history-info';
      info.appendChild(text('div', 'history-seat-name', notice.title));
      item.appendChild(info);
      item.addEventListener('click', () => showNoticeDetail(notice));
      list.appendChild(item);
    });
  }
  updateNoticeBadge();
}

function showNoticeList() {
  $('notice-detail-view').hidden = true;
  $('notice-list-view').hidden = false;
}

function showNoticeDetail(notice) {
  $('notice-detail-title').textContent = notice.title;
  $('notice-detail-content').textContent = notice.content;
  $('notice-list-view').hidden = true;
  $('notice-detail-view').hidden = false;
}

function showNoticePopup(notice) {
  const push = $('notice-push');
  $('notice-push-title').textContent = notice.title;
  push.classList.add('show');
  clearTimeout(push._hideTimer);
  push._hideTimer = setTimeout(() => push.classList.remove('show'), 3500);
}

function showLikePopup(fromTableNumber) {
  const push = $('like-push');
  $('like-push-title').textContent = `${fromTableNumber}번 테이블에서\n좋아요를 눌렀습니다`;
  push.classList.add('show');
  clearTimeout(push._hideTimer);
  push._hideTimer = setTimeout(() => push.classList.remove('show'), 3500);
}

function updateNoticeBadge() {
  const badge = $('notice-badge');
  badge.textContent = state.unreadNoticeCount > 99 ? '99+' : state.unreadNoticeCount;
  badge.hidden = state.unreadNoticeCount === 0;
}

function updateGlobalChatBadge() {
  const badge = $('global-chat-badge');
  badge.textContent = state.unreadGlobalChatCount > 99 ? '99+' : state.unreadGlobalChatCount;
  badge.hidden = state.unreadGlobalChatCount === 0;
}

function showBoardView(viewId) {
  ['board-profile-view', 'board-list-view', 'board-write-view', 'board-detail-view', 'board-confirm-view', 'board-views-view']
    .forEach((id) => { $(id).hidden = id !== viewId; });
}

async function openBoard() {
  if (state.isMonitor) {
    await loadBoardPosts();
    showBoardList();
    return;
  }
  state.board.profile = await boardApi.profile();
  if (!state.board.profile) {
    showBoardView('board-profile-view');
    return;
  }
  await loadBoardPosts();
  showBoardList();
}

async function loadBoardPosts() {
  state.board.posts = await boardApi.posts(state.isMonitor ? 'MONITOR' : 'PARTICIPANT');
}

function genderLabel(gender) {
  return gender === 'FEMALE' ? '여성' : gender === 'MALE' ? '남성' : '-';
}

function formatBoardDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderBoardList() {
  const list = $('board-post-list');
  if (!list) return;
  clear(list);
  if (!state.board.posts.length) {
    list.appendChild(text('div', 'history-empty', '아직 게시글이 없습니다.'));
    return;
  }
  state.board.posts.forEach((post) => {
    const item = document.createElement('div');
    item.className = 'history-item board-post-item';
    const info = document.createElement('div');
    info.className = 'history-info';
    const genderClass = post.author?.gender === 'FEMALE' ? 'female' : post.author?.gender === 'MALE' ? 'male' : '';
    const title = text('div', `history-seat-name board-title ${genderClass}`.trim(), post.title);
    info.appendChild(title);
    info.appendChild(text('div', 'history-preview', formatBoardDate(post.createdAt)));
    item.appendChild(info);
    item.addEventListener('click', () => showBoardDetail(post.id).catch((error) => showToast(error.message)));
    list.appendChild(item);
  });
}

function showBoardList() {
  state.board.currentPost = null;
  state.board.revealedProfile = null;
  renderBoardList();
  showBoardView('board-list-view');
}

function showBoardWrite() {
  $('board-title-input').value = '';
  $('board-content-input').value = '';
  showBoardView('board-write-view');
}

async function saveBoardProfile() {
  const gender = document.querySelector('input[name="board-gender"]:checked')?.value;
  const instagramId = $('board-instagram-input').value.trim();
  state.board.profile = await boardApi.saveProfile({ gender, instagramId });
  await loadBoardPosts();
  showBoardList();
}

async function createBoardPost() {
  const title = $('board-title-input').value.trim();
  const content = $('board-content-input').value.trim();
  const post = await boardApi.createPost({ title, content });
  if (!state.board.posts.some((item) => item.id === post.id)) state.board.posts.unshift(post);
  showBoardList();
}

function renderRevealedProfile(profile) {
  const box = $('board-revealed-profile');
  clear(box);
  if (!profile) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const tableLabel = profile.tableNumber ? `TABLE ${profile.tableNumber}` : 'TABLE -';
  box.appendChild(text('div', 'board-profile-line', `${profile.nickname || '참가자'} · ${tableLabel}`));
  const link = document.createElement('a');
  link.className = 'board-profile-link';
  link.href = `https://www.instagram.com/${profile.instagramId}/`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `@${profile.instagramId}`;
  box.appendChild(link);
}

async function showBoardDetail(postId) {
  const post = await boardApi.post(postId, state.isMonitor ? 'MONITOR' : 'PARTICIPANT');
  state.board.currentPost = post;
  state.board.revealedProfile = null;
  $('board-detail-title').textContent = post.title;
  $('board-detail-meta').textContent = formatBoardDate(post.createdAt);
  $('board-detail-content').textContent = post.content;
  $('board-reveal-btn').hidden = state.isMonitor || !!post.isMine;
  $('board-delete-btn').hidden = state.isMonitor || !post.isMine;
  renderRevealedProfile(null);
  showBoardView('board-detail-view');
}

function showBoardRevealConfirm() {
  if (!state.board.currentPost) return;
  showBoardView('board-confirm-view');
}

async function revealBoardProfile() {
  const post = state.board.currentPost;
  if (!post) return;
  const result = await boardApi.revealProfile(post.id);
  state.board.currentPost = result.post;
  state.board.revealedProfile = result.profile;
  renderRevealedProfile(result.profile);
  showBoardView('board-detail-view');
}

async function deleteBoardPost() {
  const post = state.board.currentPost;
  if (!post) return;
  await boardApi.removePost(post.id);
  state.board.posts = state.board.posts.filter((item) => item.id !== post.id);
  showBoardList();
}

async function showBoardViews() {
  state.board.views = await boardApi.profileViews();
  const list = $('board-view-list');
  clear(list);
  if (!state.board.views.length) {
    list.appendChild(text('div', 'history-empty', '아직 내 정보를 열람한 사람이 없습니다.'));
  } else {
    state.board.views.forEach((view) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const info = document.createElement('div');
      info.className = 'history-info';
      const tableLabel = view.viewer?.tableNumber ? `TABLE ${view.viewer.tableNumber}` : 'TABLE -';
      info.appendChild(text('div', 'history-seat-name', `${view.viewer?.nickname || '참가자'} · ${tableLabel}`));
      info.appendChild(text('div', 'history-preview', `${genderLabel(view.viewer?.gender)} · @${view.viewer?.instagramId || '-'} · ${view.sourcePostTitle || '삭제된 게시글'} · ${formatBoardDate(view.createdAt)}`));
      item.appendChild(info);
      list.appendChild(item);
    });
  }
  showBoardView('board-views-view');
}

function renderGame() {
  if (state.isMonitor) renderMonitorGameStatus();
  const box = $('game-panel');
  clear(box);

  const basketballCard = document.createElement('div');
  basketballCard.className = 'basketball-entry';
  basketballCard.appendChild(text('div', 'basketball-entry-icon', '🏀'));
  basketballCard.appendChild(text('div', 'basketball-entry-title', '농구게임'));
  const basketballButton = button('btn-dark full', 'PLAY', () => {
    if (state.isMonitor) return showToast('MONITOR MODE에서는 점수를 제출할 수 없습니다.');
    window.location.href = '/basketball/';
  });
  if (state.isMonitor) {
    basketballButton.disabled = true;
    basketballButton.textContent = 'MONITOR VIEW';
  }
  basketballCard.appendChild(basketballButton);
  appendBasketballLeaderboard(basketballCard);
  box.appendChild(basketballCard);

  const stopwatchActive = state.activeGame?.type === 'TIME_MATCH' && state.activeGame?.status === 'ACTIVE';
  const stopwatchCard = document.createElement('div');
  stopwatchCard.className = 'basketball-entry';
  stopwatchCard.appendChild(text('div', 'basketball-entry-icon stopwatch-icon', '⏱'));
  stopwatchCard.appendChild(text('div', 'basketball-entry-title', '스톱워치 게임'));
  stopwatchCard.appendChild(text('div', 'basketball-entry-copy', stopwatchActive
    ? `목표 ${formatGameTime(state.activeGame.state?.targetMs)}에 맞춰 멈춰보세요.`
    : '관리자가 스톱워치를 시작하면 입장할 수 있습니다.'));
  const stopwatchButton = button('btn-dark full', stopwatchActive ? '스톱워치 입장' : '관리자 시작 대기', () => {
    window.location.href = '/stopwatch/';
  });
  stopwatchButton.disabled = !stopwatchActive;
  stopwatchCard.appendChild(stopwatchButton);
  box.appendChild(stopwatchCard);

  if (!state.activeGame) return;
  if (['TIME_MATCH', 'PINBALL', 'BASKETBALL'].includes(state.activeGame.type)) {
    return;
  }
  box.appendChild(text('div', 'history-seat-name', `${state.activeGame.type} / ${state.activeGame.status}`));
  box.appendChild(button('btn-primary full', '응답 보내기', () => {
    getSocket()?.emit('game:action', {
      gameId: state.activeGame.id,
      action: 'ANSWER',
      state: { answeredAt: new Date().toISOString() },
    }, (response) => {
      if (response?.ok) showToast('응답을 보냈습니다.');
      else showToast(response?.message || response?.error || '게임 응답 실패');
    });
  }));
  if (state.activeGame.status === 'PENDING') {
    box.appendChild(button('btn-dark full', '초대 수락', () => {
      getSocket()?.emit('game:accept', { gameId: state.activeGame.id }, (response) => {
        if (!response?.ok) showToast(response?.message || response?.error || '게임 수락 실패');
      });
    }));
  }
}

function appendBasketballLeaderboard(container) {
  const ranking = document.createElement('div');
  ranking.className = 'basketball-top-three';
  if (!state.basketballLeaderboard.length) {
    ranking.appendChild(text('div', 'basketball-top-three-empty', '아직 등록된 기록이 없습니다.'));
  } else {
    const podium = document.createElement('div');
    podium.className = 'basketball-podium';
    state.basketballLeaderboard.slice(0, 3).forEach((entry, index) => {
      const rank = index + 1;
      const nickname = entry.nickname || '참가자';
      const col = document.createElement('div');
      col.className = `podium-col rank-${rank}`;
      col.appendChild(text('div', 'podium-medal', String(rank)));
      col.appendChild(text('div', 'podium-avatar', nickname.slice(0, 1)));
      col.appendChild(text('div', 'podium-name', nickname));
      col.appendChild(text('div', 'podium-table', `T${entry.tableNumber ?? '-'}`));
      col.appendChild(text('div', 'podium-bar', `${Number(entry.score || 0)}점`));
      podium.appendChild(col);
    });
    ranking.appendChild(podium);
  }
  container.appendChild(ranking);
}

function pinballViewerUrl(game) {
  const params = new URLSearchParams({
    viewer: '1',
    names: (game?.state?.names || []).join(','),
    seed: String(game?.state?.seed || 1),
    startAt: String(game?.state?.startAt || Date.now()),
  });
  return `/pinball-local/?${params}`;
}

function showPinballScreen(game) {
  if (!game || game.type !== 'PINBALL') return;
  const frame = $('pinball-viewer-frame');
  const loading = document.querySelector('.pinball-loading');
  if (loading) {
    loading.hidden = false;
    loading.textContent = '핀볼 게임을 불러오는 중입니다...';
  }
  const nextSrc = pinballViewerUrl(game);
  if (frame.getAttribute('src') !== nextSrc) frame.src = nextSrc;
  showScreen('screen-pinball');
}

function formatGameTime(totalMs) {
  const value = Math.max(0, Math.floor(Number(totalMs) || 0));
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const centiseconds = Math.floor((value % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function resetTimeMatch() {
  if (state.timeMatch.frame) cancelAnimationFrame(state.timeMatch.frame);
  state.timeMatch = { phase: 'ready', startedAt: 0, elapsedMs: 0, frame: null };
}

function updateTimeMatchDisplay() {
  const live = document.querySelector('.time-live-value');
  if (live) live.textContent = formatGameTime(state.timeMatch.elapsedMs);
}

function startTimeMatch() {
  resetTimeMatch();
  state.timeMatch.phase = 'running';
  state.timeMatch.startedAt = performance.now();
  const actionButton = $('game-screen-action');
  actionButton.textContent = 'STOP';
  actionButton.classList.add('is-stop');
  $('game-screen-status').textContent = '목표 시간에 맞춰 멈추세요';

  const tick = (now) => {
    state.timeMatch.elapsedMs = Math.floor(now - state.timeMatch.startedAt);
    updateTimeMatchDisplay();
    state.timeMatch.frame = requestAnimationFrame(tick);
  };
  state.timeMatch.frame = requestAnimationFrame(tick);
}

function stopTimeMatch() {
  if (state.timeMatch.phase !== 'running') return;
  if (state.timeMatch.frame) cancelAnimationFrame(state.timeMatch.frame);
  state.timeMatch.frame = null;
  state.timeMatch.elapsedMs = Math.floor((performance.now() - state.timeMatch.startedAt) / 10) * 10;
  state.timeMatch.phase = 'stopped';
  updateTimeMatchDisplay();

  const targetMs = Number(state.activeGame?.state?.targetMs || 0);
  const differenceMs = state.timeMatch.elapsedMs - targetMs;
  const success = differenceMs === 0;
  const mission = $('game-demo-mission');
  mission.querySelector('.time-result').textContent = success
    ? 'PERFECT! 정확히 일치했습니다'
    : `${(Math.abs(differenceMs) / 1000).toFixed(2)}초 ${differenceMs < 0 ? '빨랐어요' : '늦었어요'}`;
  const actionButton = $('game-screen-action');
  actionButton.disabled = true;
  actionButton.classList.remove('is-stop');
  actionButton.textContent = success ? 'PERFECT' : '도전 완료';
  $('game-screen-status').textContent = '결과를 중앙 관리자에게 전송 중입니다.';

  getSocket()?.emit('game:action', {
    gameId: state.activeGame.id,
    action: 'STOP',
    state: {
      elapsedMs: state.timeMatch.elapsedMs,
      targetMs,
      differenceMs,
      success,
      stoppedAt: new Date().toISOString(),
    },
  }, (response) => {
    $('game-screen-status').textContent = response?.ok ? '결과가 중앙 관리자에게 전달되었습니다.' : '결과 전송에 실패했습니다.';
  });
}

function showGlobalGameScreen() {
  const isTimeMatch = state.activeGame?.type === 'TIME_MATCH';
  $('screen-game').classList.toggle('time-match', isTimeMatch);
  const names = { OX_QUIZ: 'O/X 퀴즈', RPS: '가위바위보', WORD_GUESS: '제시어 맞히기', ROULETTE: '룰렛', IMAGE_GAME: '이미지 게임' };
  $('game-screen-title').textContent = isTimeMatch ? '시간을 멈춰라' : names[state.activeGame?.type] || '전체 게임';
  $('game-screen-kicker').textContent = isTimeMatch ? 'PRECISION GAME' : 'ADMIN EVENT';
  $('game-screen-copy').innerHTML = isTimeMatch ? '중앙에서 설정한 목표 시간입니다.<br>1/100초까지 정확히 맞춰보세요.' : '';
  $('game-screen-copy').hidden = !isTimeMatch;
  $('game-demo-icon').textContent = isTimeMatch ? '' : ({ WORD_GUESS: '💬', ROULETTE: '🎯', IMAGE_GAME: '🖼️' }[state.activeGame?.type] || '');
  $('game-demo-icon').classList.toggle('rps-call', state.activeGame?.type === 'RPS');
  $('game-demo-label').textContent = isTimeMatch ? 'TARGET TIME' : '';
  $('game-demo-label').hidden = !isTimeMatch;
  const answerKey = `${state.activeGame?.id}:${Number(state.activeGame?.state?.currentRound || 0)}`;
  const submittedAnswer = state.submittedGameAnswers.get(answerKey);
  if (state.gameAnswerKey !== answerKey) state.gameAnswer = submittedAnswer ?? null;
  state.gameAnswerKey = answerKey;
  const mission = $('game-demo-mission');
  clear(mission);
  if (isTimeMatch) {
    mission.innerHTML = `<span class="time-target-value">${formatGameTime(state.activeGame?.state?.targetMs)}</span><span class="time-live-value">00:00.00</span><span class="time-result">START를 눌러 시작하세요</span>`;
  } else {
    renderRecreationGame(mission);
  }
  resetTimeMatch();
  state.revealSequenceKey = null;
  $('game-screen-action').disabled = state.isMonitor || submittedAnswer !== undefined;
  $('game-screen-action').hidden = state.activeGame?.type === 'ROULETTE';
  $('game-screen-action').classList.remove('is-stop');
  $('game-screen-action').textContent = state.isMonitor ? 'MONITOR VIEW' : isTimeMatch ? 'START'
    : state.activeGame?.type === 'ROULETTE' ? '룰렛 돌리기'
      : submittedAnswer !== undefined ? '제출 완료' : '제출';
  $('game-screen-status').textContent = state.isMonitor ? 'MONITOR MODE에서는 응답과 점수를 제출할 수 없습니다.' : submittedAnswer !== undefined ? '이 라운드의 답을 제출했습니다.' : '응답 대기 중';
  showScreen('screen-game');
}

function renderRecreationGame(mission) {
  const game = state.activeGame;
  const roundIndex = Number(game?.state?.currentRound || 0);
  const config = game?.state?.rounds?.[roundIndex] || game?.round || game?.state || {};
  $('game-screen-kicker').textContent = `ROUND ${roundIndex + 1} / ${game?.state?.rounds?.length || 1}`;
  if (game.type === 'OX_QUIZ') {
    mission.appendChild(text('div', 'recreation-prompt', config.prompt));
    const choices = document.createElement('div');
    choices.className = 'game-choice-row';
    ['O', 'X'].forEach((choice) => choices.appendChild(gameChoice(choice, choice)));
    mission.appendChild(choices);
  } else if (game.type === 'RPS') {
    mission.appendChild(text('div', 'recreation-prompt', '하나를 선택하세요'));
    const choices = document.createElement('div');
    choices.className = 'game-choice-row three';
    [['rock', '✊'], ['scissors', '✌️'], ['paper', '✋']].forEach(([value, label]) => choices.appendChild(gameChoice(value, label)));
    mission.appendChild(choices);
  } else if (game.type === 'WORD_GUESS') {
    const prompts = config.prompts || (config.prompt ? [config.prompt] : []);
    const promptIndex = Math.min(Number(game.state?.currentPrompt || 0), Math.max(0, prompts.length - 1));
    const promptList = document.createElement('div');
    promptList.className = 'word-prompt-list';
    const visiblePrompts = prompts.slice(0, promptIndex + 1);
    if (visiblePrompts.length) {
      visiblePrompts.forEach((prompt) => promptList.appendChild(text('span', 'word-prompt-chip', prompt)));
    } else {
      promptList.appendChild(text('span', 'word-prompt-chip', '제시어 준비 중'));
    }
    mission.appendChild(promptList);
    mission.appendChild(gameTextInput());
  } else if (game.type === 'IMAGE_GAME') {
    const frame = document.createElement('div');
    frame.className = 'game-image-frame';
    const image = document.createElement('img');
    image.src = config.imageUrl;
    image.alt = '이미지 퀴즈';
    image.style.transform = `scale(${[3.4, 2.6, 2, 1.45, 1][Number(config.imageStage) || 0]})`;
    frame.appendChild(image);
    mission.appendChild(frame);
    mission.appendChild(gameTextInput());
  } else if (game.type === 'ROULETTE') {
    mission.appendChild(createRouletteWheel(config.options || []));
    mission.appendChild(text('div', 'roulette-result', '관리자가 룰렛을 돌릴 때까지 기다려 주세요.'));
  }
}

function createRouletteWheel(options) {
  state.rouletteRotation = 0;
  const wrap = document.createElement('div');
  wrap.className = 'roulette-wrap';
  wrap.appendChild(text('div', 'roulette-pointer', '▼'));
  const wheel = document.createElement('div');
  wheel.className = 'roulette-wheel';
  const colors = ['#d7ff38', '#ff6b6b', '#6bc5ff', '#ffd66b', '#b98cff', '#62e6a6', '#ff92d0', '#ff9f5b'];
  const slice = 360 / Math.max(options.length, 1);
  wheel.style.background = `conic-gradient(${options.map((_, index) => `${colors[index % colors.length]} ${index * slice}deg ${(index + 1) * slice}deg`).join(', ')})`;
  options.forEach((option, index) => {
    const label = text('span', 'roulette-label', option);
    const centerAngle = (index * slice + slice / 2) * Math.PI / 180;
    label.style.left = `${50 + Math.sin(centerAngle) * 31}%`;
    label.style.top = `${50 - Math.cos(centerAngle) * 31}%`;
    wheel.appendChild(label);
  });
  wheel.appendChild(text('div', 'roulette-hub', 'PIU:M'));
  wrap.appendChild(wheel);
  return wrap;
}

function spinRoulette(payload) {
  const wheel = document.querySelector('.roulette-wheel');
  const result = document.querySelector('.roulette-result');
  const options = state.activeGame?.state?.rounds?.[Number(payload.roundIndex || 0)]?.options || [];
  if (!wheel || !options.length) return;
  const slice = 360 / options.length;
  const targetAngle = (360 - (Number(payload.resultIndex) * slice + slice / 2)) % 360;
  const rotation = Math.floor(state.rouletteRotation / 360) * 360 + 360 * 7 + targetAngle;
  state.rouletteRotation = rotation;
  wheel.style.transitionDuration = `${Number(payload.durationMs || 4200)}ms`;
  requestAnimationFrame(() => { wheel.style.transform = `rotate(${rotation}deg)`; });
  result.textContent = '룰렛이 돌아가는 중...';
  setTimeout(() => {
    result.textContent = `당첨: ${payload.result}`;
    showFinalScores({ type: 'ROULETTE', state: { rouletteSpin: payload } });
  }, Number(payload.durationMs || 4200));
}

function showRoundResult() {
  const index = Number(state.activeGame?.state?.currentRound || 0);
  const round = state.activeGame?.state?.rounds?.[index] || {};
  const expected = String(round.answer || '').trim();
  const submitted = String(state.gameAnswer || '').trim();
  const hasAnswer = Boolean(expected);
  const correct = hasAnswer && submitted.localeCompare(expected, 'ko', { sensitivity: 'base' }) === 0;
  document.querySelector('.round-result')?.remove();
  const result = document.createElement('div');
  const answerLabels = { rock: '바위 ✊', scissors: '가위 ✌️', paper: '보 ✋' };
  if (state.activeGame?.type === 'RPS') {
    const sequenceKey = `${state.activeGame.id}:${index}`;
    if (state.revealSequenceKey === sequenceKey) return;
    state.revealSequenceKey = sequenceKey;
    const winsAgainst = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
    const outcome = submitted === expected ? 'draw' : winsAgainst[submitted] === expected ? 'win' : 'lose';
    const labels = { win: '이겼습니다!', draw: '비겼습니다!', lose: '졌습니다!' };
    result.className = `round-result ${submitted ? outcome : 'draw'}`;
    result.innerHTML = submitted
      ? `${labels[outcome]}<br>진행자: ${answerLabels[expected] || '-'}<br>참가자: ${answerLabels[submitted]}`
      : `선택하지 않았습니다<br>진행자: ${answerLabels[expected] || '-'}`;
    playRpsReveal(expected, result);
    return;
  } else {
    result.className = `round-result ${correct ? 'correct' : 'wrong'}`;
    result.textContent = hasAnswer ? (correct ? '정답입니다!' : `오답입니다 · 정답: ${answerLabels[expected] || expected}`) : '라운드 결과가 공개되었습니다.';
  }
  $('game-demo-mission').appendChild(result);
  $('game-screen-action').disabled = true;
  $('game-screen-action').textContent = '다음 라운드 대기';
  $('game-screen-status').textContent = '관리자가 다음 라운드를 시작할 때까지 기다려 주세요.';
}

function playRpsReveal(expected, result) {
  const icon = $('game-demo-icon');
  const calls = ['가위!', '바위!', '보!'];
  $('game-screen-action').disabled = true;
  $('game-screen-action').textContent = '결과 공개 중';
  $('game-screen-status').textContent = '진행자의 선택을 공개합니다.';
  calls.forEach((call, index) => setTimeout(() => { icon.textContent = call; }, index * 650));
  setTimeout(() => {
    const answerLabels = { rock: '바위 ✊', scissors: '가위 ✌️', paper: '보 ✋' };
    icon.textContent = answerLabels[expected] || '-';
    $('game-demo-label').textContent = '진행자가 낸 것';
  }, calls.length * 650);
  setTimeout(() => {
    $('game-demo-mission').appendChild(result);
    $('game-screen-action').textContent = '다음 라운드 대기';
    $('game-screen-status').textContent = '관리자가 다음 라운드를 시작할 때까지 기다려 주세요.';
  }, calls.length * 650 + 550);
}

function gameChoice(value, label) {
  const choice = button('game-choice', label, () => {
    state.gameAnswer = value;
    document.querySelectorAll('.game-choice').forEach((node) => node.classList.toggle('selected', node === choice));
  });
  choice.disabled = state.isMonitor;
  return choice;
}

function gameTextInput() {
  const input = document.createElement('input');
  input.className = 'game-answer-input';
  input.placeholder = '정답을 입력하세요';
  input.value = state.gameAnswer || '';
  input.disabled = state.isMonitor || state.submittedGameAnswers.has(state.gameAnswerKey);
  input.addEventListener('input', () => { state.gameAnswer = input.value.trim(); });
  return input;
}

function submitRecreationAnswer() {
  const game = state.activeGame;
  if (game.type === 'ROULETTE') return;
  if (!state.gameAnswer) return showToast('답을 선택하거나 입력해 주세요.');
  sendGameAnswer(state.gameAnswer, 'ANSWER');
}

function sendGameAnswer(answer, action) {
  $('game-screen-action').disabled = true;
  $('game-screen-action').textContent = '전송 중...';
  getSocket()?.emit('game:action', {
    gameId: state.activeGame.id,
    action,
    state: { answer, roundIndex: Number(state.activeGame.state?.currentRound || 0), answeredAt: new Date().toISOString() },
  }, (response) => {
    if (response?.ok && state.activeGame?.type === 'WORD_GUESS') {
      state.submittedGameAnswers.set(state.gameAnswerKey, answer);
    }
    $('game-screen-action').textContent = response?.ok ? '참여 완료' : '다시 시도하기';
    $('game-screen-action').disabled = Boolean(response?.ok);
    $('game-screen-status').textContent = response?.ok ? '응답이 관리자에게 전달되었습니다.' : response?.message || '응답 전송에 실패했습니다.';
  });
}

function renderPushPrompt() {
  const prompt = $('push-prompt');
  prompt.hidden = !shouldShowPushPrompt();
}
function startTimer() {
  if (state.timer) clearInterval(state.timer);
  if (state.liveContentTimer) clearInterval(state.liveContentTimer);
  state.timer = setInterval(() => {
    renderStats();
    renderTables();
  }, 1000);
  state.liveContentTimer = setInterval(() => {
    refreshLiveContent().catch(() => {});
  }, 3000);
}

function bindEvents() {
  document.querySelectorAll('.modal-close[data-modal]').forEach((node) => {
    node.addEventListener('click', () => closeModal(node.dataset.modal));
  });
  document.querySelectorAll('.step-btn').forEach((node) => {
    node.addEventListener('click', () => {
      const target = node.dataset.target;
      const delta = Number(node.dataset.delta);
      setCounts(
        target === 'male' ? Math.max(0, state.counts.male + delta) : state.counts.male,
        target === 'female' ? Math.max(0, state.counts.female + delta) : state.counts.female
      );
    });
  });
  $('join-btn').addEventListener('click', () => enter().catch((error) => showToast(error.message)));
  $('send-request-btn').addEventListener('click', () => sendJoinRequest().catch((error) => showToast(error.message)));
  $('send-like-btn').addEventListener('click', () => {
    if (state.pendingTargetTable) toggleTableLike(state.pendingTargetTable);
  });
  $('request-block-toggle').addEventListener('click', () => toggleRequestBlock());
  $('chat-send-btn').addEventListener('click', sendChatMessage);
  $('chat-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendChatMessage();
  });
  $('chat-leave-btn').addEventListener('click', () => openModal('modal-leave-confirm'));
  $('leave-cancel-btn').addEventListener('click', () => closeModal('modal-leave-confirm'));
  $('leave-confirm-btn').addEventListener('click', confirmLeaveChat);
  $('chat-ended-confirm-btn').addEventListener('click', () => closeModal('modal-chat-ended'));
  $('nickname-confirm-btn').addEventListener('click', async () => {
    const nickname = $('nickname-edit-input').value.trim();
    if (!nickname) return showToast('닉네임을 입력해 주세요.');
    state.participant = await participantsApi.updateMe({ nickname });
    await refreshParticipants();
    renderParticipants();
    closeModal('modal-nickname');
  });
  $('global-chat-btn').addEventListener('click', toggleGlobalChat);
  $('map-btn').addEventListener('click', () => setMainContent('map'));
  $('staff-call-btn').addEventListener('click', () => callStaff().catch((error) => showToast(error.message)));
  $('stat-requests-block').addEventListener('click', () => {
    renderReceivedRequests();
    openModal('modal-received-requests');
  });
  $('global-chat-send-btn').addEventListener('click', sendGlobalChatMessage);
  $('global-chat-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      sendGlobalChatMessage();
    }
  });
  $('notice-btn').addEventListener('click', () => {
    setMainContent('notice');
    showNoticeList();
  });
  $('notice-detail-back').addEventListener('click', showNoticeList);
  $('board-btn').addEventListener('click', () => { setMainContent('board'); openBoard().catch((error) => showToast(error.message)); });
  $('game-btn').addEventListener('click', () => setMainContent('game'));
  $('board-profile-save-btn').addEventListener('click', () => saveBoardProfile().catch((error) => showToast(error.message)));
  $('board-write-btn').addEventListener('click', showBoardWrite);
  $('board-history-btn').addEventListener('click', () => showBoardViews().catch((error) => showToast(error.message)));
  $('board-write-back').addEventListener('click', showBoardList);
  $('board-detail-back').addEventListener('click', showBoardList);
  $('board-views-back').addEventListener('click', showBoardList);
  $('board-submit-btn').addEventListener('click', () => createBoardPost().catch((error) => showToast(error.message)));
  $('board-reveal-btn').addEventListener('click', showBoardRevealConfirm);
  $('board-reveal-cancel-btn').addEventListener('click', () => showBoardView('board-detail-view'));
  $('board-reveal-confirm-btn').addEventListener('click', () => revealBoardProfile().catch((error) => showToast(error.message)));
  $('board-delete-btn').addEventListener('click', () => deleteBoardPost().catch((error) => showToast(error.message)));
  $('guide-btn').addEventListener('click', openOnboarding);
  $('onboarding-skip').addEventListener('click', finishOnboarding);
  $('onboarding-prev').addEventListener('click', () => moveOnboarding(-1));
  $('onboarding-next').addEventListener('click', () => moveOnboarding(1));
  $('onboarding-dots').addEventListener('click', (event) => {
    const dot = event.target.closest('[data-onboarding-index]');
    if (!dot) return;
    onboardingIndex = Number(dot.dataset.onboardingIndex);
    renderOnboarding();
  });
  $('onboarding-slide').addEventListener('pointerdown', (event) => { onboardingPointerX = event.clientX; });
  $('onboarding-slide').addEventListener('pointerup', (event) => {
    if (onboardingPointerX === null) return;
    const distance = event.clientX - onboardingPointerX;
    onboardingPointerX = null;
    if (Math.abs(distance) > 45) moveOnboarding(distance < 0 ? 1 : -1);
  });
  $('game-screen-action').addEventListener('click', () => {
    if (!state.activeGame) return;
    if (state.activeGame.type === 'TIME_MATCH') {
      if (state.timeMatch.phase === 'ready') startTimeMatch();
      else if (state.timeMatch.phase === 'running') stopTimeMatch();
      return;
    }
    submitRecreationAnswer();
  });
  $('accept-toggle-btn').addEventListener('click', () => toggleAcceptingRequests());
  $('pinball-viewer-frame').addEventListener('load', () => {
    const loading = document.querySelector('.pinball-loading');
    if (loading) loading.hidden = true;
  });
}

async function restoreFromToken() {
  const auth = getParticipantAuth();
  if (!auth?.token) return false;
  try {
    state.token = auth.token;
    state.table = { id: auth.tableId, tableNumber: auth.tableNumber };
    state.participant = await participantsApi.me();
    await refreshTables();
    await afterAuthenticated();
    return true;
  } catch {
    return false;
  }
}

bindEvents();
if (state.monitorToken) {
  initMonitor();
} else if (state.qrToken) {
  initEntry();
} else {
  restoreFromToken().then((restored) => {
    if (!restored) initEntry();
  });
}
