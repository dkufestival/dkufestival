import { setToastHandler } from './api.js';
import { clearParticipantAuth, getClientId, getParticipantAuth, saveParticipantAuth } from './auth.js';
import { connectSocket, getSocket } from './socket.js';
import { $, button, clear, formatRemaining, text } from './dom.js';
import { entryApi } from './entry.js';
import { tablesApi } from './tables.js';
import { participantsApi } from './participants.js';
import { chatApi } from './chat.js';
import { songsApi } from './songs.js';
import { noticesApi } from './notices.js';
import { initMapZoom } from './mapzoom.js';

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
    if (state.chatRoom?.status === 'ACTIVE') joinChatRoom(state.chatRoom.roomId);
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
    showToast('전체 게임이 시작되었습니다.');
  });
  socket.on('game:global:ended', (game) => {
    state.activeGame = game;
    renderGame();
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
    let genderClass = '';
    if (session && !isMine) {
      const hasMale = (session.maleCount || 0) > 0;
      const hasFemale = (session.femaleCount || 0) > 0;
      genderClass = hasMale && hasFemale ? ' mixed' : hasFemale ? ' female' : hasMale ? ' male' : '';
    }
    const cell = document.createElement('div');
    cell.className = `table-cell ${isMine ? 'mine' : session ? `taken${genderClass}` : 'available'}`;
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
        openJoinModal(table);
      }));
      cell.addEventListener('click', () => {
        if (mapZoom?.hasMoved()) return;
        openJoinModal(table);
      });
    }
    canvas.appendChild(cell);
  });
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
  if (!state.activeGame) {
    box.appendChild(text('div', 'history-empty', '진행 중인 게임이 없습니다.'));
    return;
  }
  box.appendChild(text('div', 'history-seat-name', `${state.activeGame.type} / ${state.activeGame.status}`));
  box.appendChild(button('btn-dark full', '응답 보내기', () => {
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
