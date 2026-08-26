import { setToastHandler } from './api.js';
import { clearParticipantAuth, getClientId, getParticipantAuth, saveParticipantAuth } from './auth.js';
import { connectSocket, getSocket } from './socket.js';
import { $, button, clear, formatRemaining, text } from './dom.js';
import { entryApi } from './entry.js';
import { tablesApi } from './tables.js?v=2';
import { participantsApi } from './participants.js';
import { chatApi } from './chat.js';
import { songsApi } from './songs.js';
import { noticesApi } from './notices.js';
import { initMapZoom } from './mapzoom.js?v=2';
import { dismissPushPrompt, enablePush, shouldShowPushPrompt } from './push.js';

const state = {
  qrToken: new URLSearchParams(location.search).get('qr'),
  token: null,
  table: null,
  session: null,
  participant: null,
  participants: [],
  tables: [],
  chatRoom: null,
  messages: new Map(),
  notices: [],
  songRequests: [],
  activeRoomId: null,
  activeGame: null,
  entryContext: null,
  counts: { male: 0, female: 0 },
  timer: null,
  pendingTargetTable: null,
  timeMatch: { phase: 'ready', startedAt: 0, elapsedMs: 0, frame: null },
};

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
  $(id).classList.add('active');
}

function closeModal(id) {
  $(id).classList.remove('active');
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
    $('team-setup-fields').hidden = !state.entryContext.requiresTeamSetup;
    $('join-btn').textContent = state.entryContext.requiresTeamSetup ? '입장하기' : '합류하기';
    setLandingStatus(state.entryContext.hasActiveSession ? '사용 중인 테이블입니다. 닉네임만 입력하면 합류합니다.' : '첫 입장자입니다. 팀 인원을 입력해 주세요.');

    const auth = getParticipantAuth();
    if (auth?.token && auth.tableId === state.table.id) {
      $('nickname-input').value = auth.participant?.nickname || '';
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
  if (state.entryContext?.requiresTeamSetup && state.counts.male + state.counts.female < 1) {
    return showToast('첫 입장자는 남녀 인원을 1명 이상 입력해야 합니다.');
  }

  const body = {
    qrToken: state.qrToken,
    clientId: getClientId(),
    nickname,
  };
  if (state.entryContext?.requiresTeamSetup) {
    body.maleCount = state.counts.male;
    body.femaleCount = state.counts.female;
  }

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
  await Promise.all([
    refreshParticipants(),
    refreshTables(),
    refreshChatRoom(),
    refreshSongs(),
    refreshNotices(),
  ]);
  renderAll();
  startTimer();
  renderPushPrompt();
  if (state.chatRoom?.status === 'ACTIVE') openChat(state.chatRoom.roomId);
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
  if (!state.chatRoom) {
    const [sent, received] = await Promise.all([
      chatApi.listRequests({ direction: 'sent', status: 'PENDING' }).catch(() => []),
      chatApi.listRequests({ direction: 'received', status: 'PENDING' }).catch(() => []),
    ]);
    state.chatRoom = received[0] || sent[0] || null;
  }
  if (state.chatRoom?.status === 'ACTIVE') {
    await loadMessages(state.chatRoom.roomId);
    joinChatRoom(state.chatRoom.roomId);
  }
}

async function refreshSongs() {
  state.songRequests = await songsApi.mine();
}

async function refreshNotices() {
  try {
    state.notices = await noticesApi.list();
  } catch {
    state.notices = [];
  }
}

function bindSocket() {
  const socket = connectSocket('PARTICIPANT');
  if (!socket) return;

  socket.on('connect', () => {
    $('connection-status').textContent = '실시간 연결됨';
    if (state.chatRoom?.status === 'ACTIVE') joinChatRoom(state.chatRoom.roomId);
  });
  socket.on('disconnect', () => {
    $('connection-status').textContent = '재연결 대기';
  });
  socket.on('participant:joined', async () => {
    await refreshParticipants();
    renderParticipants();
  });
  socket.on('participant:updated', async () => {
    await refreshParticipants();
    renderParticipants();
  });
  socket.on('participant:left', async () => {
    await refreshParticipants();
    renderParticipants();
  });
  socket.on('table:updated', async () => {
    await refreshTables();
    renderStats();
    renderTables();
  });
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
    state.chatRoom = room;
    renderChatRequest();
  });
  socket.on('chat:request-cancelled', (room) => {
    if (state.chatRoom?.roomId === room.roomId) state.chatRoom = null;
    closeModal('modal-incoming');
    renderStats();
    showToast('상대방이 채팅 요청을 취소했습니다.');
  });
  socket.on('chat:request-rejected', (room) => {
    if (state.chatRoom?.roomId === room.roomId) state.chatRoom = null;
    renderStats();
    showToast('채팅 요청이 거절되었습니다.');
  });
  socket.on('chat:request-expired', (room) => {
    if (state.chatRoom?.roomId === room.roomId) state.chatRoom = null;
    closeModal('modal-incoming');
    renderStats();
    showToast('채팅 요청 시간이 만료되었습니다.');
  });
  socket.on('chat:started', async (room) => {
    state.chatRoom = room;
    closeModal('modal-incoming');
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
    state.notices.unshift(notice);
    renderNotices();
    showToast(`새 공지: ${notice.title}`);
  });
  socket.on('song:requested', (song) => {
    if (song.participantId === state.participant?.id) state.songRequests.unshift(song);
    renderSongs();
  });
  socket.on('song:cancelled', (song) => {
    state.songRequests = state.songRequests.map((item) => item.id === song.id ? song : item);
    renderSongs();
  });
  socket.on('song:completed', (song) => {
    state.songRequests = state.songRequests.map((item) => item.id === song.id ? song : item);
    renderSongs();
  });
  socket.on('game:global:started', (game) => {
    state.activeGame = game;
    renderGame();
    if (game.type === 'PINBALL') showPinballScreen(game);
    else if (game.type !== 'TIME_MATCH') showGlobalGameScreen();
    showToast('전체 게임이 시작되었습니다.');
  });
  socket.on('game:global:current', (game) => {
    state.activeGame = game;
    renderGame();
    if (game.type === 'PINBALL') showPinballScreen(game);
    else if (game.type !== 'TIME_MATCH') showGlobalGameScreen();
  });
  socket.on('game:global:ended', (game) => {
    resetTimeMatch();
    state.activeGame = null;
    $('pinball-viewer-frame').src = 'about:blank';
    renderGame();
    closeModal('modal-game');
    showScreen(state.activeRoomId ? 'screen-chat' : 'screen-seats');
    showToast(`${game.type} 게임이 종료되었습니다.`);
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
  renderStats();
  renderParticipants();
  renderTables();
  renderChatRequest();
  renderSongs();
  renderNotices();
  renderGame();
}

function renderStats() {
  $('table-tag').textContent = `TABLE ${state.table?.tableNumber || '-'}`;
  $('stat-male').textContent = state.session?.maleCount ?? state.counts.male;
  $('stat-female').textContent = state.session?.femaleCount ?? state.counts.female;
  const left = state.session?.expiresAt ? formatRemaining(state.session.expiresAt) : '00:00';
  $('stat-time').textContent = left;
  $('table-tag-time').textContent = `${left} 남음`;
  const hasPendingReceived = state.chatRoom?.status === 'PENDING' && state.chatRoom.direction === 'received';
  $('stat-requests').textContent = `${hasPendingReceived ? 1 : 0}개`;
  renderAcceptToggle();
}

function renderAcceptToggle() {
  const banner = $('accept-toggle-banner');
  const isHost = !!state.participant?.isHost;
  banner.hidden = !isHost;
  if (!isHost) return;
  const accepting = state.session?.acceptingRequests !== false;
  $('accept-toggle-label').textContent = accepting ? '합석 요청을 받고 있어요.' : '합석 요청을 받지 않아요.';
  $('accept-toggle-btn').classList.toggle('on', accepting);
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

function renderTables() {
  const canvas = $('map-canvas');
  clear(canvas);

  const stage = document.createElement('div');
  stage.className = 'map-stage';
  stage.appendChild(text('div', 'map-stage-arrows', '↑ ↑ ↑'));
  stage.appendChild(text('div', 'map-stage-label', '무대'));
  canvas.appendChild(stage);

  state.tables.forEach((table) => {
    const session = table.activeSession;
    const isMine = table.id === state.table?.id;
    const requestsOff = !isMine && !!session && session.acceptingRequests === false;
    let genderClass = '';
    if (session && !isMine) {
      const hasMale = (session.maleCount || 0) > 0;
      const hasFemale = (session.femaleCount || 0) > 0;
      genderClass = hasMale && hasFemale ? ' mixed' : hasFemale ? ' female' : hasMale ? ' male' : '';
    }
    const cell = document.createElement('div');
    cell.className = `table-cell ${isMine ? 'mine' : session ? `taken${genderClass}` : 'available'}${requestsOff ? ' requests-off' : ''}`;
    cell.appendChild(text('span', 'table-cell-number', String(table.tableNumber).padStart(2, '0')));
    if (session) cell.appendChild(text('div', 'table-cell-count', formatComposition(session)));
    if (isMine && state.participant?.isHost) {
      cell.appendChild(button('change-count-btn', '인원 변경', (event) => {
        event.stopPropagation();
        setCounts(state.session.maleCount, state.session.femaleCount);
        openModal('modal-count');
      }));
    }
    if (!isMine && session) {
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

function renderChatRequest() {
  const room = state.chatRoom;
  const pending = room?.status === 'PENDING' && room.direction === 'received';
  if (pending && state.participant?.isHost) {
    $('incoming-detail').textContent = `TABLE ${room.peerTableNumber} · ${formatComposition({ maleCount: room.peerMaleCount, femaleCount: room.peerFemaleCount })}`;
    $('accept-btn').onclick = async () => {
      try {
        const accepted = await chatApi.accept(room.roomId);
        state.chatRoom = accepted;
        closeModal('modal-incoming');
        await loadMessages(accepted.roomId);
        openChat(accepted.roomId);
      } catch (error) {
        showToast(error.message);
      }
    };
    $('reject-btn').onclick = async () => {
      try {
        await chatApi.reject(room.roomId);
        state.chatRoom = null;
        closeModal('modal-incoming');
        renderStats();
      } catch (error) {
        showToast(error.message);
      }
    };
    $('incoming-close').onclick = () => closeModal('modal-incoming');
    openModal('modal-incoming');
  } else {
    closeModal('modal-incoming');
  }
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
  if (state.chatRoom) {
    showToast('이미 진행 중인 채팅 요청이 있습니다.');
    return;
  }
  state.pendingTargetTable = table;
  $('send-seat-label').textContent = `TABLE ${table.tableNumber}에 채팅 요청`;
  openModal('modal-send');
}

async function sendJoinRequest() {
  const target = state.pendingTargetTable;
  if (!target?.activeSession?.id) return showToast('사용 중인 테이블에만 요청할 수 있습니다.');
  const room = await chatApi.createRequest({ targetSessionId: target.activeSession.id });
  state.chatRoom = room;
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
  $('chat-title').textContent = `채팅방 #${roomId}`;
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

function renderSongs() {
  const list = $('song-list');
  clear(list);
  if (!state.songRequests.length) {
    list.appendChild(text('div', 'history-empty', '신청곡이 없습니다.'));
    return;
  }
  state.songRequests.forEach((song) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const info = document.createElement('div');
    info.className = 'history-info';
    info.appendChild(text('div', 'history-seat-name', `${song.songTitle}${song.artist ? ` - ${song.artist}` : ''}`));
    info.appendChild(text('div', 'history-preview', song.status));
    item.appendChild(info);
    if (song.status === 'REQUESTED') {
      item.appendChild(button('song-done-btn', '취소', async () => {
        const updated = await songsApi.cancel(song.id);
        state.songRequests = state.songRequests.map((entry) => entry.id === updated.id ? updated : entry);
        renderSongs();
      }));
    }
    list.appendChild(item);
  });
}

function renderNotices() {
  const list = $('notice-list');
  clear(list);
  if (!state.notices.length) {
    list.appendChild(text('div', 'history-empty', '공지 없음'));
    return;
  }
  state.notices.slice(0, 5).forEach((notice) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const info = document.createElement('div');
    info.className = 'history-info';
    info.appendChild(text('div', 'history-seat-name', notice.title));
    info.appendChild(text('div', 'history-preview', notice.content));
    item.appendChild(info);
    list.appendChild(item);
  });
}

function renderGame() {
  const box = $('game-panel');
  clear(box);

  const pinballActive = state.activeGame?.type === 'PINBALL' && state.activeGame?.status === 'ACTIVE';
  const pinballCard = document.createElement('div');
  pinballCard.className = 'basketball-entry';
  pinballCard.appendChild(text('div', 'basketball-entry-icon', '🎯'));
  pinballCard.appendChild(text('div', 'basketball-entry-title', '핀볼게임'));
  pinballCard.appendChild(text('div', 'basketball-entry-copy', pinballActive
    ? `${state.activeGame.state?.marbleCount || state.activeGame.state?.names?.length || 0}개의 구슬이 달리는 핀볼 게임을 관전 중입니다.`
    : '관리자가 이름을 입력하고 게임을 시작하면 자동으로 관전 화면이 열립니다.'));
  const pinballButton = button('btn-dark full', pinballActive ? '관전 화면으로 이동' : '관리자 시작 대기', () => {
    showPinballScreen(state.activeGame);
  });
  pinballButton.disabled = !pinballActive;
  pinballCard.appendChild(pinballButton);
  box.appendChild(pinballCard);

  const stopwatchActive = state.activeGame?.type === 'TIME_MATCH' && state.activeGame?.status === 'ACTIVE';
  const stopwatchCard = document.createElement('div');
  stopwatchCard.className = 'basketball-entry';
  stopwatchCard.appendChild(text('div', 'basketball-entry-icon', '⏱'));
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

  if (!state.activeGame) {
    box.appendChild(text('div', 'history-empty', '진행 중인 게임이 없습니다.'));
    return;
  }
  if (state.activeGame.type === 'TIME_MATCH') {
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

function pinballViewerUrl(game) {
  const params = new URLSearchParams({
    viewer: '1',
    names: (game?.state?.names || []).join(','),
    seed: String(game?.state?.seed || 1),
    startAt: String(game?.state?.startAt || Date.now()),
  });
  return `/pinball-viewer/?${params}`;
}

function showPinballScreen(game) {
  if (!game || game.type !== 'PINBALL') return;
  const frame = $('pinball-viewer-frame');
  const nextSrc = pinballViewerUrl(game);
  if (frame.getAttribute('src') !== nextSrc) frame.src = nextSrc;
  showScreen('screen-pinball');
}

function formatGameTime(totalMs) {
  const value = Math.max(0, Math.floor(Number(totalMs) || 0));
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const milliseconds = value % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
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
  state.timeMatch.elapsedMs = Math.floor(performance.now() - state.timeMatch.startedAt);
  state.timeMatch.phase = 'stopped';
  updateTimeMatchDisplay();

  const targetMs = Number(state.activeGame?.state?.targetMs || 0);
  const differenceMs = state.timeMatch.elapsedMs - targetMs;
  const success = differenceMs === 0;
  const mission = $('game-demo-mission');
  mission.querySelector('.time-result').textContent = success
    ? 'PERFECT! 정확히 일치했습니다'
    : `${Math.abs(differenceMs)}ms ${differenceMs < 0 ? '빨랐어요' : '늦었어요'}`;
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
  $('game-screen-title').textContent = isTimeMatch ? '시간을 멈춰라' : state.activeGame?.type === 'MISSION' ? '전체 미션' : state.activeGame?.type || '전체 게임';
  $('game-screen-kicker').textContent = isTimeMatch ? 'PRECISION GAME' : 'ADMIN EVENT';
  $('game-screen-copy').innerHTML = isTimeMatch ? '중앙에서 설정한 목표 시간입니다.<br>밀리초까지 정확히 맞춰보세요.' : '관리자가 게임을 시작했습니다.<br>아래 버튼을 눌러 참여해 주세요.';
  $('game-demo-icon').textContent = isTimeMatch ? '' : '⚡';
  $('game-demo-label').textContent = isTimeMatch ? 'TARGET TIME' : '오늘의 미션';
  $('game-demo-mission').innerHTML = isTimeMatch
    ? `<span class="time-target-value">${formatGameTime(state.activeGame?.state?.targetMs)}</span><span class="time-live-value">00:00.000</span><span class="time-result">START를 눌러 시작하세요</span>`
    : '가장 빠르게<br><strong>참여 버튼</strong>을 누르세요!';
  resetTimeMatch();
  $('game-screen-action').disabled = false;
  $('game-screen-action').classList.remove('is-stop');
  $('game-screen-action').textContent = isTimeMatch ? 'START' : '게임 참여하기';
  $('game-screen-status').textContent = '응답 대기 중';
  showScreen('screen-game');
}

function renderPushPrompt() {
  const prompt = $('push-prompt');
  prompt.hidden = !shouldShowPushPrompt();
}

function startTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    renderStats();
    renderTables();
  }, 1000);
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
  $('count-confirm-btn').addEventListener('click', async () => {
    const session = await tablesApi.updateMine({
      maleCount: state.counts.male,
      femaleCount: state.counts.female,
    });
    state.session = session;
    closeModal('modal-count');
    renderStats();
  });
  $('song-btn').addEventListener('click', () => openModal('modal-song'));
  $('song-submit-btn').addEventListener('click', async () => {
    const raw = $('song-input').value.trim();
    if (!raw) return showToast('신청곡을 입력해 주세요.');
    const [songTitle, ...artistParts] = raw.split('-').map((part) => part.trim());
    const song = await songsApi.create({ songTitle, artist: artistParts.join(' - ') || undefined });
    state.songRequests.unshift(song);
    $('song-input').value = '';
    closeModal('modal-song');
    renderSongs();
  });
  $('notice-btn').addEventListener('click', () => {
    renderNotices();
    openModal('modal-notices');
  });
  $('game-btn').addEventListener('click', () => {
    renderGame();
    openModal('modal-game');
  });
  $('game-screen-action').addEventListener('click', () => {
    if (!state.activeGame) return;
    if (state.activeGame.type === 'TIME_MATCH') {
      if (state.timeMatch.phase === 'ready') startTimeMatch();
      else if (state.timeMatch.phase === 'running') stopTimeMatch();
      return;
    }
    const actionButton = $('game-screen-action');
    actionButton.disabled = true;
    actionButton.textContent = '응답 전송 중...';
    getSocket()?.emit('game:action', {
      gameId: state.activeGame.id,
      action: 'ANSWER',
      state: { answeredAt: new Date().toISOString() },
    }, (response) => {
      if (response?.ok) {
        actionButton.textContent = '참여 완료';
        $('game-screen-status').textContent = '응답이 관리자에게 전달되었습니다.';
      } else {
        actionButton.disabled = false;
        actionButton.textContent = '다시 시도하기';
        $('game-screen-status').textContent = response?.message || response?.error || '응답 전송에 실패했습니다.';
      }
    });
  });
  $('push-dismiss-btn').addEventListener('click', () => {
    dismissPushPrompt();
    renderPushPrompt();
  });
  $('accept-toggle-btn').addEventListener('click', () => toggleAcceptingRequests());
  $('push-enable-btn').addEventListener('click', async () => {
    try {
      const result = await enablePush();
      showToast(result.ok ? '알림을 켰습니다.' : '알림을 켜지 않았습니다.');
    } catch (error) {
      showToast(error.code === 'PUSH_NOT_CONFIGURED' ? '서버 알림 설정이 필요합니다.' : error.message);
    }
    renderPushPrompt();
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
if (state.qrToken) {
  initEntry();
} else {
  restoreFromToken().then((restored) => {
    if (!restored) initEntry();
  });
}
