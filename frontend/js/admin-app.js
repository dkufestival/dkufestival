import { setToastHandler } from './api.js';
import { clearAdminToken, getAdminToken, saveAdminToken } from './auth.js';
import { connectSocket, getSocket } from './socket.js';
import { $, button, clear, formatDateTime, formatRemaining, text } from './dom.js';
import { adminApi } from './admin-api.js?v=2';
import { globalChatApi } from './globalChat.js';
import { boardApi } from './board.js';
import { noticesApi } from './notices.js?v=2';
import { GAME_TYPES } from './games.js';
import { basketballApi } from './basketball-api.js';

const state = {
  tables: [],
  chatRooms: [],
  notices: [],
  globalChatMessages: [],
  globalChatLoaded: false,
  boardPosts: [],
  staffCalls: [],
  selectedGame: 'PINBALL',
  activeGame: null,
  activeDetailTable: null,
  detailCounts: { male: 0, female: 0 },
  gameRounds: {},
  rouletteSpinning: false,
  adminRouletteSpinId: null,
  adminRouletteRotation: 0,
  adminRouletteWinnerTimer: null,
  timer: null,
  hasConnectedOnce: false,
  initialSyncDone: false,
  syncPromise: null,
  refreshPromise: null,
  refreshTimer: null,
  refreshNeedsChat: false,
  refreshPending: false,
  gameHistory: [],
  gameHistoryById: {},
  attemptsSelectedGame: 'TIME_MATCH',
  attemptsSelectedTable: null,
  attemptsSelectedParticipantIds: new Set(),
  attemptsGrantHistory: [],
  gameUpdateInFlight: false,
  basketballLeaderboard: [],
};

const RANKED_GAME_TYPES = ['TIME_MATCH', 'RPS', 'OX_QUIZ', 'WORD_GUESS', 'IMAGE_GAME'];

function showToast(message) {
  const toast = $('admin-toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function showRouletteResult(result) {
  const modal = $('modal-roulette-result');
  if (!modal) return;
  $('roulette-result-value').textContent = `당첨: ${result || '-'}`;
  modal.classList.add('active');
}

setToastHandler(showToast);

function showAdmin() {
  $('screen-login').classList.remove('active');
  $('screen-admin').classList.add('active');
}

function showLogin() {
  $('screen-admin').classList.remove('active');
  $('screen-login').classList.add('active');
}

async function login() {
  const id = $('admin-id').value.trim();
  const password = $('admin-pw').value.trim();
  const data = await adminApi.login({ id, password });
  saveAdminToken(data.token);
  await enterAdmin();
}

async function enterAdmin() {
  showAdmin();
  bindSocket();
  await syncAdminState({ render: false });
  state.initialSyncDone = true;
  renderAll();
  startTimer();
}

function bindSocket() {
  const socket = connectSocket('ADMIN');
  if (!socket) return;
  socket.on('connect', () => {
    if (state.hasConnectedOnce && state.initialSyncDone) {
      syncAdminState().catch(() => {});
    }
    state.hasConnectedOnce = true;
  });
  socket.on('table:updated', () => scheduleAdminRefresh({ includeChatRooms: true }));
  socket.on('chat:started', () => scheduleAdminRefresh({ includeChatRooms: true }));
  socket.on('chat:ended', () => scheduleAdminRefresh({ includeChatRooms: true }));
  socket.on('globalChat:message', (message) => {
    state.globalChatMessages.push(message);
    renderGlobalChat();
  });
  socket.on('board:created', (post) => {
    state.boardPosts.unshift(post);
    renderBoard();
  });
  socket.on('board:deleted', ({ id }) => {
    state.boardPosts = state.boardPosts.filter((post) => post.id !== id);
    renderBoard();
  });
  socket.on('staffCall:created', (call) => {
    if (!state.staffCalls.some((entry) => entry.id === call.id)) state.staffCalls.push(call);
    renderStaffCalls();
    showToast(`TABLE ${call.tableNumber}에서 직원을 호출했습니다.`);
  });
  socket.on('staffCall:resolved', ({ id }) => {
    state.staffCalls = state.staffCalls.filter((call) => call.id !== id);
    renderStaffCalls();
  });
  socket.on('game:global:state', (game) => {
    const responses = Object.values(game.state?.responses || {});
    const latest = responses.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (latest) recordGameResponse(game, latest);
    if (game.type === 'TIME_MATCH' && latest?.state) {
      const diff = Number(latest.state.differenceMs || 0);
      addGameLog(latest.state.success ? '시간 맞추기 성공 · 정확히 일치' : `시간 맞추기 응답 · ${(Math.abs(diff) / 1000).toFixed(2)}초 ${diff < 0 ? '빠름' : '늦음'}`);
    } else if (latest?.state) {
      addGameLog(`${game.type} 참가 응답 수신`);
    } else {
      addGameLog(`${game.type} 응답 수신`);
    }
    state.activeGame = game;
    renderWordSubmissions();
    renderGameRankList();
  });
  socket.on('game:global:current', (game) => {
    state.activeGame = game;
    if (game) seedGameRecordFromResponses(game);
    renderGameControls();
    renderGameList();
    renderGameRankList();
  });
  socket.on('game:global:ended', (game) => {
    state.activeGame = null;
    const record = ensureGameRecord(game);
    if (record) record.endedAt = game.endedAt || new Date().toISOString();
    renderGameControls();
    renderGameList();
    addGameLog(`${game.type} 전체 게임 종료`);
    renderGameRankList();
  });
  socket.on('game:global:updated', (game) => {
    state.activeGame = game;
    renderGameControls();
    renderGameList();
    seedGameRecordFromResponses(game);
    renderGameRankList();
  });
  socket.on('basketball:leaderboard', (payload = {}) => {
    state.basketballLeaderboard = Array.isArray(payload.leaderboard) ? payload.leaderboard.slice(0, 3) : [];
    renderBasketballLeaderboard();
  });
  $('roulette-result-close')?.addEventListener('click', () => $('modal-roulette-result')?.classList.remove('active'));
}

async function loadTables() {
  state.tables = await adminApi.tables();
}

async function loadChatRooms() {
  state.chatRooms = await adminApi.chatRooms('ACTIVE');
}

async function loadNotices() {
  state.notices = await noticesApi.list('ADMIN');
}

async function loadBasketballLeaderboard() {
  state.basketballLeaderboard = (await basketballApi.leaderboard()).slice(0, 3);
}

async function loadGlobalChat() {
  state.globalChatMessages = await globalChatApi.list('ADMIN');
  state.globalChatLoaded = true;
}

async function loadBoard() {
  state.boardPosts = await boardApi.list('ADMIN');
}

async function loadStaffCalls() {
  state.staffCalls = await adminApi.staffCalls();
}

async function syncAdminState(options = {}) {
  if (state.syncPromise) return state.syncPromise;
  state.syncPromise = (async () => {
    await Promise.allSettled([loadTables(), loadChatRooms(), loadNotices(), loadGlobalChat(), loadBoard(), loadBasketballLeaderboard(), loadStaffCalls()]);
    if (options.render !== false) renderAll();
    if (state.activeDetailTable) openDetail(state.activeDetailTable);
  })().finally(() => {
    state.syncPromise = null;
  });
  return state.syncPromise;
}

function scheduleAdminRefresh(options = {}) {
  state.refreshNeedsChat = state.refreshNeedsChat || Boolean(options.includeChatRooms);
  state.refreshPending = true;
  if (state.refreshTimer || state.refreshPromise) return;
  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = null;
    state.refreshPending = false;
    if (!state.refreshPromise) {
      const includeChatRooms = state.refreshNeedsChat;
      state.refreshNeedsChat = false;
      const tasks = includeChatRooms ? [loadTables(), loadChatRooms()] : [loadTables()];
      state.refreshPromise = Promise.allSettled(tasks)
        .then(() => {
          renderAll();
          if (state.activeDetailTable) openDetail(state.activeDetailTable);
        })
        .finally(() => {
          state.refreshPromise = null;
          if (state.refreshPending) scheduleAdminRefresh({ includeChatRooms: state.refreshNeedsChat });
        });
    }
  }, 120);
}

function renderAll() {
  renderStats();
  renderTableGrid();
  renderChatRooms();
  renderGameControls();
  renderGameList();
  renderGameRankList();
  renderGlobalChat();
  renderBoard();
  renderStaffCalls();
  renderNoticeHistory();
  renderBasketballLeaderboard();
}

function renderBasketballLeaderboard() {
  const panel = $('basketball-admin-ranking');
  const list = $('basketball-admin-ranking-list');
  if (!panel || !list) return;
  panel.hidden = state.selectedGame !== 'BASKETBALL' && state.activeGame?.type !== 'BASKETBALL';
  clear(list);
  if (!state.basketballLeaderboard.length) {
    list.appendChild(text('div', 'rank-empty', '아직 등록된 농구 기록이 없습니다.'));
    return;
  }
  state.basketballLeaderboard.slice(0, 3).forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'basketball-ranking-row';
    row.appendChild(text('span', 'basketball-ranking-position', `${index + 1}위`));
    const player = document.createElement('span');
    player.className = 'basketball-ranking-player';
    player.append(document.createTextNode(entry.nickname || '참가자'));
    player.appendChild(text('small', '', `TABLE ${entry.tableNumber ?? '-'}`));
    row.appendChild(player);
    row.appendChild(text('strong', 'basketball-ranking-score', `${Number(entry.score || 0)}점`));
    list.appendChild(row);
  });
}

function renderStats() {
  const occupied = state.tables.filter((table) => table.activeSession);
  const people = occupied.reduce((sum, table) => {
    const session = table.activeSession;
    return sum + Number(session?.maleCount || 0) + Number(session?.femaleCount || 0);
  }, 0);
  $('stat-occupied').textContent = `${occupied.length}/${state.tables.length}`;
  $('stat-people').textContent = `${people}명`;
  $('stat-chats').textContent = state.chatRooms.length;
  $('stat-game').textContent = state.activeGame ? '진행 중' : '대기 중';
}

function renderTableGrid() {
  const grid = $('table-grid');
  clear(grid);
  state.tables.forEach((table) => {
    const session = table.activeSession;
    const card = document.createElement('div');
    card.className = `table-card ${session ? 'occupied' : ''}`;
    card.appendChild(text('div', 'table-card-num', `TABLE ${table.tableNumber}`));
    card.appendChild(text('div', 'table-card-status', session ? `사용 중 · ${session.participants?.length || 0}명 접속` : '비어 있음'));
    const meta = document.createElement('div');
    meta.className = 'table-card-meta';
    meta.appendChild(text('span', '', session ? `남 ${session.maleCount} / 여 ${session.femaleCount}` : `QR ${table.qrEnabled ? 'ON' : 'OFF'}`));
    meta.appendChild(text('span', 'table-card-timer', session ? formatRemaining(session.expiresAt) : '-'));
    card.appendChild(meta);
    card.addEventListener('click', () => openDetail(table.id));
    grid.appendChild(card);
  });
}

function openDetail(tableId) {
  state.activeDetailTable = tableId;
  const table = state.tables.find((item) => item.id === Number(tableId));
  if (!table) return;
  $('detail-title').textContent = `TABLE ${table.tableNumber}`;
  const body = $('detail-body');
  clear(body);

  const qrSection = document.createElement('div');
  qrSection.className = 'detail-section';
  qrSection.appendChild(text('div', 'detail-label', 'QR'));
  qrSection.appendChild(text('div', '', `상태: ${table.qrEnabled ? '활성' : '비활성'} / 버전: ${table.qrVersion}`));
  const qrRow = document.createElement('div');
  qrRow.className = 'detail-btn-row';
  qrRow.appendChild(button('detail-btn', '재발급', async () => {
    await adminApi.regenerateQr(table.id);
    await reloadDetail();
  }));
  qrRow.appendChild(button('detail-btn', table.qrEnabled ? '비활성화' : '활성화', async () => {
    if (table.qrEnabled) await adminApi.disableQr(table.id);
    else await adminApi.enableQr(table.id);
    await reloadDetail();
  }));
  qrSection.appendChild(qrRow);
  body.appendChild(qrSection);

  if (!table.activeSession) renderEmptyDetail(body, table);
  else renderActiveDetail(body, table);

  $('detail-overlay').classList.add('show');
  $('detail-panel').classList.add('show');
}

function renderEmptyDetail(body, table) {
  state.detailCounts = { male: 0, female: 0 };
  body.appendChild(text('div', 'detail-empty', '아직 입장하지 않은 테이블입니다.'));
  body.appendChild(countEditor('입장 인원'));
  body.appendChild(button('btn-dark full', '수동 입장', async () => {
    if (state.detailCounts.male + state.detailCounts.female < 1) return showToast('인원을 입력해주세요.');
    await adminApi.checkin(table.id, state.detailCounts);
    await reloadDetail();
  }));
}

function renderActiveDetail(body, table) {
  const session = table.activeSession;
  state.detailCounts = { male: session.maleCount, female: session.femaleCount };

  const members = document.createElement('div');
  members.className = 'detail-section';
  members.appendChild(text('div', 'detail-label', '참가자'));
  const list = document.createElement('div');
  list.className = 'member-list';
  (session.participants || []).forEach((participant) => {
    list.appendChild(text('span', 'chip', `${participant.nickname}${participant.isHost ? ' 대표' : ''}`));
  });
  members.appendChild(list);
  body.appendChild(members);

  const time = document.createElement('div');
  time.className = 'detail-section';
  time.appendChild(text('div', 'detail-label', '시간'));
  time.appendChild(text('div', 'detail-timer', formatRemaining(session.expiresAt)));
  time.appendChild(text('div', '', `시작: ${formatDateTime(session.startedAt)}`));
  time.appendChild(text('div', '', `만료: ${formatDateTime(session.expiresAt)}`));
  const timeRow = document.createElement('div');
  timeRow.className = 'detail-btn-row';
  timeRow.appendChild(button('detail-btn', '+10분 연장', async () => {
    await adminApi.extend(table.id, { minutes: 10 });
    await reloadDetail();
  }));
  timeRow.appendChild(button('detail-btn', '시간 초기화', async () => {
    await adminApi.resetTime(table.id);
    await reloadDetail();
  }));
  time.appendChild(timeRow);
  body.appendChild(time);

  body.appendChild(countEditor('인원 변경'));
  body.appendChild(button('detail-btn', '인원 저장', async () => {
    await adminApi.counts(table.id, state.detailCounts);
    await reloadDetail();
  }));
  body.appendChild(button('detail-btn danger', '퇴실 처리', async () => {
    await adminApi.checkout(table.id);
    closeDetail();
    await Promise.all([loadTables(), loadChatRooms()]);
    renderAll();
  }));
}

function countEditor(label) {
  const section = document.createElement('div');
  section.className = 'detail-section';
  section.appendChild(text('div', 'detail-label', label));
  section.appendChild(stepper('male', '남자'));
  section.appendChild(stepper('female', '여자'));
  return section;
}

function stepper(key, label) {
  const row = document.createElement('div');
  row.className = 'admin-stepper-row';
  row.appendChild(text('span', '', label));
  const controls = document.createElement('div');
  controls.className = 'admin-stepper';
  const value = text('span', 'admin-step-value', state.detailCounts[key]);
  controls.appendChild(button('admin-step-btn', '-', () => {
    state.detailCounts[key] = Math.max(0, state.detailCounts[key] - 1);
    value.textContent = state.detailCounts[key];
  }));
  controls.appendChild(value);
  controls.appendChild(button('admin-step-btn', '+', () => {
    state.detailCounts[key] += 1;
    value.textContent = state.detailCounts[key];
  }));
  row.appendChild(controls);
  return row;
}

async function reloadDetail() {
  await Promise.all([loadTables(), loadChatRooms()]);
  renderAll();
  openDetail(state.activeDetailTable);
}

function closeDetail() {
  $('detail-overlay').classList.remove('show');
  $('detail-panel').classList.remove('show');
  state.activeDetailTable = null;
}

function tableLabel(session) {
  return `TABLE ${session?.table?.tableNumber || '-'}`;
}

function renderChatRooms() {
  const list = $('chat-room-list');
  clear(list);
  if (!state.chatRooms.length) {
    list.appendChild(text('div', 'song-empty', '활성 채팅이 없습니다.'));
    return;
  }
  state.chatRooms.forEach((room) => {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    const info = document.createElement('div');
    info.className = 'admin-list-info';
    info.appendChild(text('div', 'song-item-title', `${tableLabel(room.requesterSession)} ↔ ${tableLabel(room.targetSession)}`));
    const requesterCount = (room.requesterSession?.participants || []).length;
    const targetCount = (room.targetSession?.participants || []).length;
    info.appendChild(text('div', 'song-item-meta', `시작 ${formatDateTime(room.acceptedAt)} · 참가 ${requesterCount + targetCount}명`));
    item.appendChild(info);
    item.appendChild(button('song-done-btn danger', '강제 종료', async () => {
      if (!window.confirm('이 채팅을 강제 종료하시겠습니까?')) return;
      await adminApi.endChatRoom(room.id);
      await loadChatRooms();
      renderAll();
    }));
    list.appendChild(item);
  });
}

function renderGameControls() {
  const isFreePlayBasketball = state.selectedGame === 'BASKETBALL';
  const activeTarget = state.activeGame?.type === 'TIME_MATCH'
    ? ` · 목표 ${formatTargetTime(state.activeGame.state?.targetMs)}`
    : state.activeGame?.type === 'PINBALL'
      ? ` · 구슬 ${state.activeGame.state?.marbleCount || state.activeGame.state?.names?.length || 0}개`
      : '';
  const activePhase = state.activeGame?.state?.lifecyclePhase;
  $('game-status').textContent = state.activeGame
    ? activePhase === 'ANNOUNCED'
      ? '참가자에게 게임 시작 전 알림을 표시하고 있습니다.'
      : activePhase === 'RESULTS'
        ? '게임 결과를 확인할 수 있습니다.'
        : `참가자 화면에서 게임이 진행 중입니다${activeTarget}.`
    : isFreePlayBasketball
      ? '농구게임은 관리자 시작 없이 항상 자유롭게 이용할 수 있습니다.'
      : '게임을 시작할 수 있습니다.';
  const phase = state.activeGame?.state?.lifecyclePhase;
  const isDirectGame = ['TIME_MATCH', 'BASKETBALL'].includes(state.activeGame?.type);
  $('broadcast-btn').hidden = isFreePlayBasketball || Boolean(state.activeGame && isDirectGame);
  const skipsResults = ['PINBALL', 'ROULETTE'].includes(state.activeGame?.type);
  $('broadcast-btn').textContent = !state.activeGame ? (state.selectedGame === 'TIME_MATCH' ? '게임 시작' : '게임 전 알림')
    : phase === 'ANNOUNCED' ? '게임 시작'
      : phase === 'STARTED' && !skipsResults ? '팀별 최종 점수 공개' : '게임 종료';
  $('end-game-btn').hidden = !state.activeGame || !isDirectGame;
  const hasRounds = Boolean(state.activeGame?.state?.rounds?.length);
  $('round-control').hidden = !hasRounds || phase !== 'STARTED';
  if (hasRounds) {
    const index = Number(state.activeGame.state.currentRound || 0);
    const isRoulette = state.activeGame.type === 'ROULETTE';
    const isWordGuess = state.activeGame.type === 'WORD_GUESS';
    const currentRound = state.activeGame.state.rounds[index] || {};
    $('reveal-answer-btn').textContent = isRoulette ? '룰렛 돌리기' : '정답 공개';
    $('next-prompt-btn').hidden = !isWordGuess;
    $('next-prompt-btn').disabled = !isWordGuess || Number(state.activeGame.state.currentPrompt || 0) >= (currentRound.prompts?.length || 1) - 1;
    $('next-round-btn').disabled = index >= state.activeGame.state.rounds.length - 1;
    $('reveal-answer-btn').disabled = isRoulette ? state.rouletteSpinning : Boolean(state.activeGame.state.answerRevealed);
    $('game-status').textContent += ` · ${index + 1}/${state.activeGame.state.rounds.length} 라운드`;
  }
  $('time-target-seconds').disabled = Boolean(state.activeGame);
  $('time-target-milliseconds').disabled = Boolean(state.activeGame);
  $('pinball-names').disabled = Boolean(state.activeGame);
  const isPinballActive = state.activeGame?.type === 'PINBALL' && ['STARTED', 'RESULTS'].includes(phase);
  $('pinball-admin-preview').hidden = !isPinballActive;
  const frame = $('pinball-admin-frame');
  const nextSrc = isPinballActive ? pinballViewerUrl(state.activeGame) : 'about:blank';
  if (frame.getAttribute('src') !== nextSrc) frame.src = nextSrc;
  renderAdminRoulette();
  renderWordSubmissions();
  $('game-custom-setting').querySelectorAll('input, textarea, select').forEach((node) => { node.disabled = Boolean(state.activeGame); });
  $('game-custom-setting').querySelectorAll('button').forEach((node) => { node.disabled = Boolean(state.activeGame); });
  renderStats();
}

function renderWordSubmissions() {
  const panel = $('word-submission-panel');
  const list = $('word-submission-list');
  if (!panel || !list) return;
  const game = state.activeGame;
  const visible = game?.type === 'WORD_GUESS' && ['STARTED', 'RESULTS'].includes(game.state?.lifecyclePhase);
  panel.hidden = !visible;
  if (!visible) return;
  const roundIndex = Number(game.state?.currentRound || 0);
  const round = game.state?.rounds?.[roundIndex] || {};
  $('word-submission-answer').textContent = `정답: ${round.answer || '-'}`;
  const submissions = Object.values(game.state?.responses || {})
    .filter((response) => Number(response.state?.roundIndex ?? roundIndex) === roundIndex && String(response.state?.answer || '').trim())
    .sort((a, b) => Number(Boolean(b.state?.success)) - Number(Boolean(a.state?.success))
      || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  clear(list);
  submissions.forEach((response) => {
    const row = document.createElement('div');
    row.className = `word-submission-row ${response.state?.success ? 'correct' : 'incorrect'}`;
    row.appendChild(text('strong', '', `TABLE ${tableNumberForSession(response.sessionId) ?? '-'}`));
    row.appendChild(text('span', 'word-submission-value', String(response.state?.answer || '')));
    row.appendChild(text('span', 'word-submission-result', response.state?.success ? '정답' : '오답'));
    list.appendChild(row);
  });
  if (!submissions.length) list.appendChild(text('div', 'rank-empty', '아직 제출된 답이 없습니다.'));
}

function renderAdminRoulette() {
  const panel = $('roulette-admin-preview');
  const stage = $('roulette-admin-stage');
  if (!panel || !stage) return;
  const game = state.activeGame;
  const visible = game?.type === 'ROULETTE' && ['STARTED', 'RESULTS'].includes(game.state?.lifecyclePhase);
  panel.hidden = !visible;
  if (!visible) return;
  const round = game.state?.rounds?.[Number(game.state?.currentRound || 0)] || {};
  const options = round.options || [];
  const spin = game.state?.rouletteSpin;
  if (spin && state.adminRouletteSpinId === spin.spinId && state.rouletteSpinning && stage.querySelector('.roulette-wheel')) return;
  stage.replaceChildren();
  if (!options.length) return;
  const colors = ['#d7ff38', '#ff6b6b', '#6bc5ff', '#ffd66b', '#b98cff', '#62e6a6', '#ff92d0', '#ff9f5b'];
  const slice = 360 / Math.max(options.length, 1);
  const wrap = document.createElement('div');
  wrap.className = 'roulette-wrap';
  wrap.appendChild(text('div', 'roulette-pointer', '▼'));
  const wheel = document.createElement('div');
  wheel.className = 'roulette-wheel';
  wheel.style.background = `conic-gradient(${options.map((_, index) => `${colors[index % colors.length]} ${index * slice}deg ${(index + 1) * slice}deg`).join(', ')})`;
  options.forEach((option, index) => {
    const label = text('span', 'roulette-label', option);
    const centerAngle = (index * slice + slice / 2) * Math.PI / 180;
    label.style.left = `${50 + Math.sin(centerAngle) * 31}%`;
    label.style.top = `${50 - Math.cos(centerAngle) * 31}%`;
    wheel.appendChild(label);
  });
  wheel.appendChild(text('div', 'roulette-hub', 'PIU:M'));
  const previousRotation = state.adminRouletteRotation;
  let shouldAnimate = false;
  if (spin && state.adminRouletteSpinId !== spin.spinId) {
    state.adminRouletteSpinId = spin.spinId;
    const targetAngle = (360 - (Number(spin.resultIndex) * slice + slice / 2)) % 360;
    state.adminRouletteRotation = Math.floor(state.adminRouletteRotation / 360) * 360 + 360 * 7 + targetAngle;
    shouldAnimate = true;
  }
  wheel.style.transform = `rotate(${shouldAnimate ? previousRotation : state.adminRouletteRotation}deg)`;
  wrap.appendChild(wheel);
  stage.appendChild(wrap);
  stage.appendChild(text('strong', 'roulette-result', state.rouletteSpinning
    ? '룰렛이 돌아가는 중...'
    : spin?.result ? `당첨: ${spin.result}` : '관리자가 룰렛을 돌릴 때까지 기다려 주세요.'));
  if (shouldAnimate) requestAnimationFrame(() => {
    wheel.style.transitionDuration = `${Number(spin.durationMs || 4200)}ms`;
    wheel.style.transform = `rotate(${state.adminRouletteRotation}deg)`;
  });
  if (shouldAnimate) {
    clearTimeout(state.adminRouletteWinnerTimer);
  }
}

function parsePinballEntries() {
  const values = $('pinball-names').value
    .split(/[,\n\r]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  const entries = [];
  let marbleCount = 0;

  for (const value of values) {
    const match = /^([^,/*]+?)(?:\*(\d+))?$/.exec(value);
    const name = match?.[1]?.trim();
    const count = Number(match?.[2] || 1);
    if (!name || name.length > 20 || !Number.isInteger(count) || count < 1 || count > 80) {
      return { valid: false, entries: [], marbleCount: 0 };
    }
    marbleCount += count;
    entries.push(count > 1 ? `${name}*${count}` : name);
  }

  return {
    valid: entries.length > 0 && marbleCount >= 2 && marbleCount <= 80,
    entries,
    marbleCount,
  };
}

function pinballViewerUrl(game) {
  const params = new URLSearchParams({
    viewer: '1',
    names: (game.state?.names || []).join(','),
    seed: String(game.state?.seed || 1),
    startAt: String(game.state?.startAt || Date.now()),
  });
  return `/pinball-local/?${params}`;
}

function renderPinballSetting() {
  const parsed = parsePinballEntries();
  $('pinball-setting').hidden = state.selectedGame !== 'PINBALL';
  $('pinball-name-count').textContent = parsed.entries.length && !parsed.valid
    ? '입력 확인'
    : `${parsed.marbleCount}개 구슬`;
}

function targetTimeMs() {
  const seconds = Math.max(0, Math.min(5999, Number($('time-target-seconds').value) || 0));
  const centiseconds = Math.max(0, Math.min(99, Number($('time-target-milliseconds').value) || 0));
  return seconds * 1000 + centiseconds * 10;
}

function targetAttempts() {
  return Math.max(1, Math.min(20, Number($('time-target-attempts').value) || 1));
}

function formatTargetTime(targetMs) {
  const value = Math.max(0, Number(targetMs) || 0);
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const centiseconds = Math.floor((value % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function renderTimeMatchSetting() {
  $('time-match-setting').hidden = state.selectedGame !== 'TIME_MATCH';
  $('time-target-preview').textContent = formatTargetTime(targetTimeMs());
}

function settingField(label, id, value = '', type = 'input') {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const field = document.createElement(type);
  field.id = id;
  field.value = value;
  wrapper.appendChild(field);
  return wrapper;
}

function renderCustomGameSetting() {
  const box = $('game-custom-setting');
  clear(box);
  box.hidden = ['TIME_MATCH', 'PINBALL', 'BASKETBALL'].includes(state.selectedGame);
  if (box.hidden) return;
  const rounds = state.gameRounds[state.selectedGame] || [defaultRound(state.selectedGame)];
  state.gameRounds[state.selectedGame] = rounds;
  const editor = document.createElement('div');
  editor.className = 'round-editor';
  rounds.forEach((round, index) => editor.appendChild(renderRoundCard(round, index)));
  editor.appendChild(button('round-add', '+ 라운드 추가', () => {
    rounds.push(defaultRound(state.selectedGame));
    renderCustomGameSetting();
  }));
  box.appendChild(editor);
  box.querySelectorAll('input, textarea, select, button').forEach((node) => { node.disabled = Boolean(state.activeGame); });
}

function defaultRound(type) {
  if (type === 'OX_QUIZ') return { prompt: '', answer: 'O' };
  if (type === 'RPS') return { prompt: '가위바위보를 선택하세요', answer: 'rock' };
  if (type === 'WORD_GUESS') return { prompts: [], answer: '' };
  if (type === 'ROULETTE') return { options: [] };
  return { imageUrl: '', answer: '', imageStage: 0 };
}

function roundInput(label, value, update, type = 'input') {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const field = document.createElement(type);
  field.value = value || '';
  field.addEventListener('input', () => update(field.value));
  wrapper.appendChild(field);
  return wrapper;
}

function renderRoundCard(round, index) {
  const card = document.createElement('div');
  card.className = 'round-card';
  const head = document.createElement('div');
  head.className = 'round-card-head';
  head.appendChild(text('span', '', `ROUND ${index + 1}`));
  const remove = button('round-delete', '삭제', () => {
    if (state.gameRounds[state.selectedGame].length === 1) return showToast('라운드는 최소 1개가 필요합니다.');
    state.gameRounds[state.selectedGame].splice(index, 1);
    renderCustomGameSetting();
  });
  head.appendChild(remove);
  card.appendChild(head);
  if (state.selectedGame === 'OX_QUIZ') {
    card.appendChild(roundInput('질문', round.prompt, (value) => { round.prompt = value; }));
    const answer = roundInput('정답', round.answer, (value) => { round.answer = value; }, 'select');
    answer.lastChild.innerHTML = '<option value="O">O</option><option value="X">X</option>';
    answer.lastChild.value = round.answer;
    card.appendChild(answer);
  } else if (state.selectedGame === 'RPS') {
    card.appendChild(roundInput('라운드 안내', round.prompt, (value) => { round.prompt = value; }));
    const answer = roundInput('진행자가 낼 것', round.answer, (value) => { round.answer = value; }, 'select');
    answer.lastChild.innerHTML = '<option value="rock">바위 ✊</option><option value="scissors">가위 ✌️</option><option value="paper">보 ✋</option>';
    answer.lastChild.value = round.answer;
    card.appendChild(answer);
  } else if (state.selectedGame === 'WORD_GUESS') {
    card.appendChild(roundInput('제시어 여러 개 (줄바꿈 또는 쉼표로 구분)', (round.prompts || []).join('\n'), (value) => {
      round.prompts = value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    }, 'textarea'));
    card.appendChild(roundInput('정답', round.answer, (value) => { round.answer = value; }));
  } else if (state.selectedGame === 'ROULETTE') {
    card.appendChild(roundInput('옵션 (줄바꿈 또는 쉼표)', (round.options || []).join('\n'), (value) => { round.options = value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean); }, 'textarea'));
  } else if (state.selectedGame === 'IMAGE_GAME') {
    card.appendChild(roundInput('이미지 URL', round.imageUrl, (value) => { round.imageUrl = value; }));
    card.appendChild(roundInput('정답', round.answer, (value) => { round.answer = value; }));
  }
  return card;
}

function selectedGameState() {
  if (state.selectedGame === 'TIME_MATCH') return { targetMs: targetTimeMs(), maxAttempts: targetAttempts() };
  if (['PINBALL', 'BASKETBALL'].includes(state.selectedGame)) return {};
  return { rounds: state.gameRounds[state.selectedGame] || [], currentRound: 0, answerRevealed: false };
}

function renderGameList() {
  const list = $('game-list');
  clear(list);
  GAME_TYPES.forEach((game) => {
    const item = document.createElement('div');
    const isTimeMatch = game.id === 'TIME_MATCH';
    const isBasketball = game.id === 'BASKETBALL';
    item.className = `game-option ${game.id === state.selectedGame ? 'selected' : ''}`;
    item.appendChild(text('span', 'game-option-name', game.name));
    if (isBasketball) {
      item.appendChild(text('span', 'game-toggle on', '자유 플레이'));
    } else if (isTimeMatch) {
      const running = state.activeGame?.type === 'TIME_MATCH';
      item.appendChild(text('span', `game-toggle ${running ? 'on' : ''}`, running ? '켜짐' : '꺼짐'));
    } else {
      item.appendChild(text('span', 'game-option-level', game.id));
    }
    item.addEventListener('click', () => {
      state.selectedGame = game.id;
      renderGameList();
      renderTimeMatchSetting();
      renderPinballSetting();
      renderCustomGameSetting();
      renderBasketballLeaderboard();
      renderGameControls();
    });
    list.appendChild(item);
  });
  renderTimeMatchSetting();
  renderPinballSetting();
  renderCustomGameSetting();
  renderBasketballLeaderboard();
}

function addGameLog(message) {
  const log = $('game-log');
  const empty = log.querySelector('.game-log-empty');
  if (empty) empty.remove();
  log.prepend(text('div', 'game-log-item', `${new Date().toLocaleTimeString('ko-KR')} · ${message}`));
  const count = $('game-log-count');
  count.textContent = `${log.querySelectorAll('.game-log-item').length}건`;
}

function formatTimeOnlyIfSameDay(startedAt, endedAt) {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const sameDay = start.toDateString() === end.toDateString();
  if (!sameDay) return formatDateTime(endedAt);
  return end.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function tableNumberForSession(sessionId) {
  const table = state.tables.find((item) => Number(item.activeSession?.id) === Number(sessionId));
  return table?.tableNumber ?? null;
}

function ensureGameRecord(game) {
  if (!game?.id) return null;
  let record = state.gameHistoryById[game.id];
  if (!record) {
    record = {
      id: game.id,
      type: game.type,
      startedAt: game.state?.actualStartedAt || game.startedAt || new Date().toISOString(),
      endedAt: game.endedAt || null,
      results: {},
      eligibleTeams: game.state?.eligibleTeams || [],
      scoreboard: game.state?.finalScoreboard || game.state?.scoreboard || [],
    };
    state.gameHistoryById[game.id] = record;
    state.gameHistory.unshift(record);
  }
  record.type = game.type;
  record.eligibleTeams = game.state?.eligibleTeams || record.eligibleTeams || [];
  record.scoreboard = game.state?.finalScoreboard || game.state?.scoreboard || record.scoreboard || [];
  if (game.endedAt) record.endedAt = game.endedAt;
  return record;
}

function recordGameResponse(game, response) {
  if (!response?.sessionId) return;
  const record = ensureGameRecord(game);
  if (!record || !RANKED_GAME_TYPES.includes(record.type)) return;
  const tableNumber = tableNumberForSession(response.sessionId);
  if (!tableNumber) return;
  const entry = record.results[tableNumber] || { tableNumber, rounds: {} };
  if (record.type === 'TIME_MATCH') {
    const diffMs = Math.abs(Number(response.state?.differenceMs));
    if (Number.isFinite(diffMs) && (entry.bestDiffMs === undefined || diffMs < entry.bestDiffMs)) {
      entry.bestDiffMs = diffMs;
    }
  } else {
    const roundIndex = Number(response.state?.roundIndex ?? game.state?.currentRound ?? 0);
    entry.rounds[roundIndex] = record.type === 'RPS' ? response.state?.outcome : Boolean(response.state?.success);
  }
  record.results[tableNumber] = entry;
}

function seedGameRecordFromResponses(game) {
  if (!game || (!['TIME_MATCH', 'BASKETBALL'].includes(game.type) && !['STARTED', 'RESULTS'].includes(game.state?.lifecyclePhase))) return;
  const record = ensureGameRecord(game);
  if (!record) return;
  Object.values(game.state?.responses || {}).forEach((response) => recordGameResponse(game, response));
}

function withDenseRanks(rows, scoreOf) {
  const sorted = [...rows].sort((a, b) => scoreOf(b) - scoreOf(a));
  let rank = 0;
  let prevScore = null;
  let seen = 0;
  return sorted.map((row) => {
    seen += 1;
    const score = scoreOf(row);
    if (score !== prevScore) { rank = seen; prevScore = score; }
    return { ...row, rank };
  });
}

function computeRanking(record) {
  if (record.scoreboard?.length && record.type !== 'TIME_MATCH') {
    const participated = new Set(Object.keys(record.results).map(Number));
    return withDenseRanks(record.scoreboard.filter((row) => participated.has(Number(row.tableNumber))), (row) => Number(row.score || 0))
      .map((row) => ({ ...row, scoreLabel: `${Number(row.score || 0)}점` }));
  }
  const rows = Object.values(record.results);
  if (record.type === 'TIME_MATCH') {
    const finished = rows.filter((row) => Number.isFinite(row.bestDiffMs));
    return withDenseRanks(finished, (row) => -row.bestDiffMs)
      .map((row) => ({ ...row, scoreLabel: `오차 ${(row.bestDiffMs / 1000).toFixed(2)}초` }));
  }
  if (record.type === 'RPS') {
    const withWins = rows.map((row) => ({ ...row, wins: Object.values(row.rounds).filter((o) => o === 'WIN').length }));
    return withDenseRanks(withWins, (row) => row.wins)
      .map((row) => ({ ...row, scoreLabel: `${row.wins}승` }));
  }
  const withCorrect = rows.map((row) => ({
    ...row,
    correct: Object.values(row.rounds).filter(Boolean).length,
    total: Object.keys(row.rounds).length,
  }));
  return withDenseRanks(withCorrect, (row) => row.correct)
    .map((row) => ({ ...row, scoreLabel: `${row.correct}/${row.total} 정답` }));
}

function renderGameRankList() {
  const list = $('game-rank-list');
  clear(list);
  const records = state.gameHistory.filter((record) => RANKED_GAME_TYPES.includes(record.type));
  if (!records.length) {
    list.appendChild(text('div', 'game-accordion-empty', '아직 순위를 매길 게임 결과가 없습니다.'));
    return;
  }
  records.forEach((record) => {
    const details = document.createElement('details');
    details.className = 'game-accordion-item';
    if (state.activeGame?.id === record.id) details.open = true;

    const summary = document.createElement('summary');
    const gameName = GAME_TYPES.find((game) => game.id === record.type)?.name || record.type;
    summary.appendChild(text('span', '', gameName));
    const meta = document.createElement('span');
    meta.className = 'game-accordion-meta';
    const timeLabel = record.endedAt
      ? `${formatDateTime(record.startedAt)} ~ ${formatTimeOnlyIfSameDay(record.startedAt, record.endedAt)}`
      : `${formatDateTime(record.startedAt)} 시작`;
    meta.appendChild(text('span', 'game-accordion-time', timeLabel));
    meta.appendChild(text('span', `game-accordion-badge ${record.endedAt ? '' : 'live'}`, record.endedAt ? '종료' : '진행중'));
    summary.appendChild(meta);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'game-accordion-body';
    const ranked = computeRanking(record);
    if (!ranked.length) {
      body.appendChild(text('div', 'rank-empty', '아직 참여한 테이블이 없습니다.'));
    } else {
      ranked.forEach((row) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'rank-row';
        rowEl.appendChild(text('span', 'rank-pos', `${row.rank}위`));
        rowEl.appendChild(text('span', 'rank-table-num', `TABLE ${row.tableNumber}`));
        rowEl.appendChild(text('span', 'rank-score', row.scoreLabel));
        body.appendChild(rowEl);
      });
    }
    const participated = new Set(Object.keys(record.results).map(Number));
    const missing = (record.eligibleTeams || []).filter((team) => !participated.has(Number(team.tableNumber)));
    body.appendChild(text('div', 'rank-empty', `미참여 ${missing.length}팀${missing.length ? ` · ${missing.map((team) => `TABLE ${team.tableNumber ?? '-'}`).join(', ')}` : ''}`));
    details.appendChild(body);
    list.appendChild(details);
  });
}

function renderGlobalChat() {
  const log = $('global-chat-log');
  clear(log);
  state.globalChatMessages.forEach((message) => {
    const isAdmin = message.senderRole === 'ADMIN';
    const tableNumber = message.senderParticipant?.session?.table?.tableNumber;
    const name = isAdmin ? '관리자' : (message.senderParticipant?.nickname || '참가자');
    const label = !isAdmin && tableNumber ? `${name} · T${tableNumber}` : name;
    const group = document.createElement('div');
    group.className = `bubble-group ${isAdmin ? 'me' : 'other'}`;
    group.appendChild(text('div', 'bubble-name', label));
    group.appendChild(text('div', `chat-bubble ${isAdmin ? 'admin' : 'other'}`, message.content));
    log.appendChild(group);
  });
  log.scrollTop = log.scrollHeight;
}

async function sendGlobalChatMessage() {
  const input = $('global-chat-input');
  const content = input.value.trim();
  if (!content) return;
  await globalChatApi.send(content, 'ADMIN');
  input.value = '';
}

function renderBoard() {
  const list = $('board-post-list');
  clear(list);
  if (!state.boardPosts.length) {
    list.appendChild(text('div', 'song-empty', '게시글이 없습니다.'));
    return;
  }
  state.boardPosts.forEach((post) => {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    const info = document.createElement('div');
    info.className = 'admin-list-info';
    info.appendChild(text('div', 'notice-item-title', post.title));
    const authorName = post.author?.nickname || '참가자';
    const tableNumber = post.author?.session?.table?.tableNumber;
    const who = tableNumber ? `${authorName} · T${tableNumber}` : authorName;
    info.appendChild(text('div', 'notice-item-meta', `${who} · ${formatDateTime(post.createdAt)}`));
    item.appendChild(info);
    item.appendChild(button('notice-delete-btn', '삭제', async () => {
      await boardApi.remove(post.id, 'ADMIN');
      state.boardPosts = state.boardPosts.filter((entry) => entry.id !== post.id);
      renderBoard();
    }));
    list.appendChild(item);
  });
}

function renderStaffCalls() {
  const badge = $('staffcall-nav-badge');
  badge.textContent = state.staffCalls.length > 99 ? '99+' : String(state.staffCalls.length);
  badge.hidden = state.staffCalls.length === 0;

  const list = $('staff-call-list');
  clear(list);
  if (!state.staffCalls.length) {
    list.appendChild(text('div', 'song-empty', '직원호출이 없습니다.'));
    return;
  }
  state.staffCalls.forEach((call) => {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    const info = document.createElement('div');
    info.className = 'admin-list-info';
    info.appendChild(text('div', 'notice-item-title', `TABLE ${call.tableNumber}`));
    info.appendChild(text('div', 'notice-item-meta', formatDateTime(call.createdAt)));
    item.appendChild(info);
    item.appendChild(button('notice-delete-btn', '해결', async () => {
      await adminApi.resolveStaffCall(call.id);
      state.staffCalls = state.staffCalls.filter((entry) => entry.id !== call.id);
      renderStaffCalls();
    }));
    list.appendChild(item);
  });
}

function renderNoticeHistory() {
  const list = $('notice-history-list');
  clear(list);
  if (!state.notices.length) {
    list.appendChild(text('div', 'song-empty', '보낸 공지가 없습니다.'));
    return;
  }
  state.notices.forEach((notice) => {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    const info = document.createElement('div');
    info.className = 'admin-list-info';
    info.appendChild(text('div', 'notice-item-title', notice.title));
    info.appendChild(text('div', 'notice-item-meta', `${notice.category} · ${formatDateTime(notice.createdAt)}`));
    item.appendChild(info);
    item.appendChild(button('notice-delete-btn', '삭제', async () => {
      await noticesApi.remove(notice.id);
      state.notices = state.notices.filter((entry) => entry.id !== notice.id);
      renderNoticeHistory();
    }));
    list.appendChild(item);
  });
}

async function createNotice() {
  const title = $('notice-title').value.trim();
  const content = $('notice-content').value.trim();
  const category = $('notice-category').value;
  if (!title || !content) return showToast('공지 제목과 내용을 입력해주세요.');
  const notice = await noticesApi.create({ title, content, category });
  state.notices.unshift(notice);
  renderNoticeHistory();
  $('notice-title').value = '';
  $('notice-content').value = '';
  showToast('공지 전송 완료');
}

function bindEvents() {
  $('login-btn').addEventListener('click', () => login().catch((error) => showToast(error.message)));
  $('admin-pw').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') login().catch((error) => showToast(error.message));
  });
  $('logout-btn').addEventListener('click', () => {
    clearAdminToken();
    getSocket()?.disconnect();
    showLogin();
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((node) => node.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
  $('detail-close').addEventListener('click', closeDetail);
  $('detail-overlay').addEventListener('click', closeDetail);
  $('broadcast-btn').addEventListener('click', () => {
    if (state.selectedGame === 'BASKETBALL') return showToast('농구게임은 관리자 시작 없이 항상 이용할 수 있습니다.');
    if (state.activeGame) {
      const phase = state.activeGame.state?.lifecyclePhase;
      const skipsResults = ['PINBALL', 'ROULETTE'].includes(state.activeGame.type);
      if (phase === 'RESULTS' || (phase === 'STARTED' && skipsResults)) {
        return getSocket()?.emit('game:global:end', { gameId: state.activeGame.id }, (response) => {
          if (!response?.ok) return showToast(response?.message || response?.error || '게임 종료 실패');
          state.activeGame = null;
          renderGameList();
          renderGameControls();
          renderGameRankList();
          addGameLog('전체 게임 종료');
        });
      }
      const action = phase === 'ANNOUNCED' ? 'START' : 'FINALIZE';
      return updateGlobalGame(action);
    }
    const targetMs = targetTimeMs();
    if (state.selectedGame === 'TIME_MATCH' && targetMs < 10) return showToast('목표 시간을 0.01초 이상 입력해주세요.');
    const pinball = parsePinballEntries();
    if (state.selectedGame === 'PINBALL') {
      if (!pinball.valid) return showToast('이름 또는 이름*개수 형식으로 총 2~80개 구슬을 입력해주세요.');
    }
    const gameState = selectedGameState();
    if (!gameState.rounds?.length && !['TIME_MATCH', 'PINBALL'].includes(state.selectedGame)) return showToast('라운드를 추가해주세요.');
    getSocket()?.emit('game:global:start', {
      type: state.selectedGame,
      state: {
        startedBy: 'admin',
        startedAt: new Date().toISOString(),
        ...(state.selectedGame === 'TIME_MATCH' ? { targetMs } : {}),
        ...(state.selectedGame === 'PINBALL' ? { names: pinball.entries } : {}),
        ...(state.selectedGame !== 'PINBALL' ? gameState : {}),
      },
    }, (response) => {
      if (response?.ok) {
        state.activeGame = response.data;
        if (response.data.state?.lifecyclePhase === 'STARTED') ensureGameRecord(response.data);
        renderGameList();
        renderGameControls();
        addGameLog(response.data.state?.lifecyclePhase === 'ANNOUNCED'
          ? `${state.selectedGame} 게임 전 알림`
          : `${state.selectedGame} 전체 게임 시작`);
        renderGameRankList();
      } else {
        showToast(response?.message || response?.error || '게임 시작 실패');
      }
    });
  });
  ['time-target-seconds', 'time-target-milliseconds'].forEach((id) => {
    $(id).addEventListener('input', renderTimeMatchSetting);
  });
  $('pinball-names').addEventListener('input', renderPinballSetting);
  $('end-game-btn').addEventListener('click', () => {
    if (!state.activeGame) return;
    getSocket()?.emit('game:global:end', { gameId: state.activeGame.id }, (response) => {
      if (!response?.ok) return showToast(response?.message || response?.error || '게임 종료 실패');
      state.activeGame = null;
      renderGameList();
      renderGameControls();
      addGameLog('전체 게임 종료');
    });
  });
  $('reveal-answer-btn').addEventListener('click', () => updateGlobalGame(state.activeGame?.type === 'ROULETTE' ? 'SPIN' : 'REVEAL'));
  $('next-round-btn').addEventListener('click', () => updateGlobalGame('NEXT'));
  $('next-prompt-btn').addEventListener('click', () => updateGlobalGame('NEXT_PROMPT'));
  $('notice-send-btn').addEventListener('click', () => createNotice().catch((error) => showToast(error.message)));
  $('global-chat-send-btn').addEventListener('click', () => sendGlobalChatMessage().catch((error) => showToast(error.message)));
  $('global-chat-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendGlobalChatMessage().catch((error) => showToast(error.message));
  });

  renderAttemptsGameList();
  renderAttemptsHistory();
  $('attempts-table-search').addEventListener('input', renderAttemptsTableResult);
  $('grant-attempts-btn').addEventListener('click', submitGrantAttempts);
}

function renderAttemptsGameList() {
  const list = $('attempts-game-list');
  clear(list);
  GAME_TYPES.forEach((game) => {
    const item = document.createElement('div');
    item.className = `game-option ${game.id === state.attemptsSelectedGame ? 'selected' : ''}`;
    item.appendChild(text('span', 'game-option-name', game.name));
    item.appendChild(text('span', 'game-option-level', game.id));
    item.addEventListener('click', () => {
      state.attemptsSelectedGame = game.id;
      renderAttemptsGameList();
    });
    list.appendChild(item);
  });
}

function renderAttemptsTableResult() {
  const result = $('attempts-table-result');
  clear(result);
  const query = $('attempts-table-search').value.trim();
  state.attemptsSelectedTable = null;
  state.attemptsSelectedParticipantIds = new Set();
  if (!query) {
    result.appendChild(text('div', 'attempts-table-empty', '테이블 번호를 입력해주세요.'));
    return;
  }
  const table = state.tables.find((item) => String(item.tableNumber) === query);
  if (!table) {
    result.appendChild(text('div', 'attempts-table-empty', '해당 번호의 테이블을 찾을 수 없습니다.'));
    return;
  }
  if (!table.activeSession || !(table.activeSession.participants || []).length) {
    result.appendChild(text('div', 'attempts-table-empty', '아직 입장한 참가자가 없는 테이블입니다.'));
    return;
  }
  state.attemptsSelectedTable = table;
  const list = document.createElement('div');
  list.className = 'attempts-participant-list';
  table.activeSession.participants.forEach((participant) => {
    const chip = document.createElement('div');
    chip.className = 'participant-pick';
    chip.appendChild(text('span', '', participant.nickname));
    if (participant.isHost) chip.appendChild(text('span', 'host-tag', '대표'));
    chip.addEventListener('click', () => {
      if (state.attemptsSelectedParticipantIds.has(participant.id)) {
        state.attemptsSelectedParticipantIds.delete(participant.id);
      } else {
        state.attemptsSelectedParticipantIds.add(participant.id);
      }
      chip.classList.toggle('selected', state.attemptsSelectedParticipantIds.has(participant.id));
    });
    list.appendChild(chip);
  });
  result.appendChild(list);
}

function submitGrantAttempts() {
  const table = state.attemptsSelectedTable;
  if (!table) return showToast('테이블을 먼저 검색해주세요.');
  if (!state.activeGame || state.activeGame.type !== state.attemptsSelectedGame) {
    return showToast('선택한 게임이 현재 진행 중이 아닙니다.');
  }
  const amount = Math.max(1, Math.min(20, Number($('attempts-amount').value) || 1));
  const requestedParticipantIds = [...state.attemptsSelectedParticipantIds];
  const gameId = state.activeGame.id;
  const tableSessionId = table.activeSession.id;
  const tableNumber = table.tableNumber;
  const wasWholeTable = !requestedParticipantIds.length;
  getSocket()?.emit('game:global:grant-attempts', {
    gameId,
    tableSessionId,
    participantIds: requestedParticipantIds,
    amount,
  }, (response) => {
    if (!response?.ok) {
      $('grant-attempts-status').textContent = response?.message || response?.error || '기회 지급 실패';
      return showToast(response?.message || response?.error || '기회 지급 실패');
    }
    const participantIds = response.data?.participantIds || requestedParticipantIds;
    const members = table.activeSession?.participants || [];
    const nicknameOf = (id) => members.find((member) => member.id === id)?.nickname || `#${id}`;
    const names = participantIds.map(nicknameOf);
    const namesText = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}명`;
    const target = wasWholeTable ? `TABLE ${tableNumber} 전체 (${namesText})` : `TABLE ${tableNumber} · ${namesText}`;
    $('grant-attempts-status').textContent = `${target}에게 기회 ${amount}회를 지급했습니다.`;
    showToast('기회를 지급했습니다.');
    state.attemptsGrantHistory.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      gameId,
      tableSessionId,
      tableNumber,
      target,
      amount,
      participantIds,
      cancelled: false,
      createdAt: new Date(),
    });
    renderAttemptsHistory();
  });
}

function renderAttemptsHistory() {
  const list = $('attempts-history-list');
  clear(list);
  if (!state.attemptsGrantHistory.length) {
    list.appendChild(text('div', 'attempts-history-empty', '아직 지급한 기회가 없습니다.'));
    return;
  }
  state.attemptsGrantHistory.forEach((record) => {
    const item = document.createElement('div');
    item.className = `attempts-history-item ${record.cancelled ? 'cancelled' : ''}`;

    const info = document.createElement('div');
    info.className = 'attempts-history-info';
    info.appendChild(text('span', 'attempts-history-target', `${record.target} · +${record.amount}회`));
    const metaText = record.cancelled
      ? `${formatDateTime(record.createdAt)} · 취소됨`
      : formatDateTime(record.createdAt);
    info.appendChild(text('span', `attempts-history-meta ${record.cancelled ? 'cancelled-tag' : ''}`, metaText));
    item.appendChild(info);

    if (!record.cancelled) {
      item.appendChild(button('attempts-history-cancel', '취소', () => cancelGrantHistory(record)));
    }
    list.appendChild(item);
  });
}

function cancelGrantHistory(record) {
  getSocket()?.emit('game:global:revoke-attempts', {
    gameId: record.gameId,
    tableSessionId: record.tableSessionId,
    participantIds: record.participantIds,
    amount: record.amount,
  }, (response) => {
    if (!response?.ok) {
      return showToast(response?.message || response?.error || '기회 취소 실패');
    }
    record.cancelled = true;
    renderAttemptsHistory();
    showToast('기회 지급을 취소했습니다.');
  });
}

function updateGlobalGame(action) {
  if (!state.activeGame || state.gameUpdateInFlight) return;
  if (action === 'SPIN') {
    if (state.rouletteSpinning) return;
    state.rouletteSpinning = true;
    renderGameControls();
  }
  state.gameUpdateInFlight = true;
  $('reveal-answer-btn').disabled = true;
  $('next-round-btn').disabled = true;
  $('next-prompt-btn').disabled = true;
  getSocket()?.emit('game:global:update', { gameId: state.activeGame.id, action }, (response) => {
    state.gameUpdateInFlight = false;
    if (!response?.ok) {
      state.rouletteSpinning = false;
      renderGameControls();
      return showToast(response?.message || response?.error || '게임 진행 실패');
    }
    state.activeGame = response.data;
    if (action === 'START') ensureGameRecord(response.data);
    seedGameRecordFromResponses(response.data);
    renderGameControls();
    renderGameRankList();
    const message = action === 'START' ? '게임 시작'
      : action === 'FINALIZE' ? '게임 결과 확정'
      : action === 'REVEAL' ? '현재 라운드 정답 공개'
      : action === 'SPIN' ? `룰렛 결과 · ${response.data.state?.rouletteSpin?.result}`
        : action === 'NEXT_PROMPT' ? `${Number(response.data.state?.currentPrompt || 0) + 1}번째 제시어 공개`
        : `${Number(response.data.state?.currentRound || 0) + 1} 라운드 시작`;
    addGameLog(message);
    if (action === 'SPIN') setTimeout(() => {
      state.rouletteSpinning = false;
      renderGameControls();
      showRouletteResult(response.data.state?.rouletteSpin?.result);
    }, Number(response.data.state?.rouletteSpin?.durationMs || 4200));
  });
}

function startTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    renderTableGrid();
    renderStats();
    if (state.activeDetailTable) {
      const timer = document.querySelector('.detail-timer');
      const table = state.tables.find((item) => item.id === state.activeDetailTable);
      if (timer && table?.activeSession) timer.textContent = formatRemaining(table.activeSession.expiresAt);
    }
  }, 1000);
}

bindEvents();
if (getAdminToken()) {
  enterAdmin().catch(() => {
    clearAdminToken();
    showLogin();
  });
}
