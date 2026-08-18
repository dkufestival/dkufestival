import { setToastHandler } from './api.js';
import { clearParticipantAuth, getClientId, getParticipantAuth, saveParticipantAuth } from './auth.js';
import { connectSocket, getSocket } from './socket.js';
import { $, button, clear, formatRemaining, text } from './dom.js';
import { entryApi } from './entry.js';
import { tablesApi } from './tables.js';
import { participantsApi } from './participants.js';
import { joinApi } from './join.js';
import { chatApi } from './chat.js';
import { songsApi } from './songs.js';
import { noticesApi } from './notices.js';

const state = {
  qrToken: new URLSearchParams(location.search).get('qr'),
  token: null,
  table: null,
  session: null,
  participant: null,
  participants: [],
  tables: [],
  joinRequests: [],
  chatRooms: [],
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
  bindSocket();
  await Promise.all([
    refreshParticipants(),
    refreshTables(),
    refreshJoinRequests(),
    refreshChatRooms(),
    refreshSongs(),
    refreshNotices(),
  ]);
  renderAll();
  startTimer();
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

async function refreshJoinRequests() {
  state.joinRequests = await joinApi.list();
}

async function refreshChatRooms() {
  state.chatRooms = await chatApi.rooms();
  await Promise.all(state.chatRooms.map((room) => loadMessages(room.id)));
  rejoinChatRooms();
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

  socket.on('connect', rejoinChatRooms);
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
  ['join:created', 'join:accepted', 'join:rejected', 'join:cancelled'].forEach((event) => {
    socket.on(event, async () => {
      await refreshJoinRequests();
      renderJoinRequests();
    });
  });
  socket.on('chat:room-created', async (payload) => {
    const room = payload.room || payload;
    await addRoom(room);
    openChat(room.id);
  });
  socket.on('chat:message', (message) => {
    const list = state.messages.get(message.roomId) || [];
    if (!list.some((item) => item.id === message.id)) list.push(message);
    state.messages.set(message.roomId, list);
    renderChat();
    renderChatRooms();
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
  renderJoinRequests();
  renderChatRooms();
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
  $('stat-requests').textContent = `${state.joinRequests.filter((request) => request.targetSessionId === state.session?.id && request.status === 'PENDING').length}개`;
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

function renderTables() {
  const grid = $('seat-grid');
  clear(grid);
  state.tables.forEach((table) => {
    const session = table.activeSession;
    const isMine = table.id === state.table?.id;
    const card = document.createElement('div');
    card.className = `seat ${isMine ? 'mine' : session ? 'taken' : 'available'}`;
    card.appendChild(text('span', 'seat-number', String(table.tableNumber).padStart(2, '0')));
    card.appendChild(text('div', 'seat-status-text', isMine ? '현재 이용 중' : session ? '사용 중' : '사용 가능'));
    if (session) card.appendChild(text('div', 'seat-fake-time', `${formatRemaining(session.expiresAt)} 남음`));
    if (isMine && state.participant?.isHost) {
      card.appendChild(button('change-count-btn', '인원 변경', (event) => {
        event.stopPropagation();
        setCounts(state.session.maleCount, state.session.femaleCount);
        openModal('modal-count');
      }));
    }
    if (!isMine && session) {
      card.appendChild(button('seat-talk-btn', '말 걸기', (event) => {
        event.stopPropagation();
        openJoinModal(table);
      }));
    }
    grid.appendChild(card);
  });
}

function renderJoinRequests() {
  $('history-badge').textContent = state.chatRooms.length;
  $('history-badge').dataset.zero = state.chatRooms.length === 0 ? 'true' : 'false';
  const pending = state.joinRequests.find((request) => request.targetSessionId === state.session?.id && request.status === 'PENDING');
  if (pending) {
    $('incoming-detail').textContent = `TABLE SESSION ${pending.fromSessionId}\n${pending.message || ''}`;
    $('accept-btn').onclick = async () => {
      const updated = await joinApi.accept(pending.id);
      state.joinRequests = state.joinRequests.map((item) => item.id === updated.id ? updated : item);
      closeModal('modal-incoming');
      renderJoinRequests();
    };
    $('reject-btn').onclick = async () => {
      const updated = await joinApi.reject(pending.id);
      state.joinRequests = state.joinRequests.map((item) => item.id === updated.id ? updated : item);
      closeModal('modal-incoming');
      renderJoinRequests();
    };
    $('incoming-close').onclick = () => closeModal('modal-incoming');
    openModal('modal-incoming');
  }
  renderStats();
}

function openJoinModal(table) {
  state.pendingTargetTable = table;
  $('send-seat-label').textContent = `TABLE ${table.tableNumber}에 합석 요청`;
  $('send-message').value = '';
  openModal('modal-send');
}

async function sendJoinRequest() {
  const target = state.pendingTargetTable;
  if (!target?.activeSession?.id) return showToast('사용 중인 테이블에만 요청할 수 있습니다.');
  const data = await joinApi.create({
    targetSessionId: target.activeSession.id,
    message: $('send-message').value.trim(),
  });
  state.joinRequests.unshift(data.joinRequest);
  await addRoom(data.chatRoom);
  closeModal('modal-send');
  openChat(data.chatRoom.id);
  showToast('합석 요청과 채팅방을 만들었습니다.');
}

async function addRoom(room) {
  if (!state.chatRooms.some((item) => item.id === room.id)) state.chatRooms.unshift(room);
  await loadMessages(room.id);
  joinChatRoom(room.id);
  renderChatRooms();
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

function rejoinChatRooms() {
  state.chatRooms.forEach((room) => joinChatRoom(room.id));
}

function openChat(roomId) {
  state.activeRoomId = roomId;
  $('chat-title').textContent = `채팅방 #${roomId}`;
  $('chat-me-label').textContent = `내 닉네임: ${state.participant?.nickname || '-'}`;
  renderChat();
  openModal('modal-chat');
}

function renderChatRooms() {
  const list = $('history-list');
  clear(list);
  if (!state.chatRooms.length) {
    list.appendChild(text('div', 'history-empty', '아직 채팅방이 없습니다.'));
    return;
  }
  state.chatRooms.forEach((room) => {
    const messages = state.messages.get(room.id) || [];
    const last = messages[messages.length - 1];
    const item = document.createElement('div');
    item.className = 'history-item';
    item.appendChild(text('div', 'history-avatar', '#'));
    const info = document.createElement('div');
    info.className = 'history-info';
    info.appendChild(text('div', 'history-seat-name', `채팅방 ${room.id}`));
    info.appendChild(text('div', 'history-preview', last ? `${last.senderParticipant?.nickname || '참가자'}: ${last.content}` : '메시지 없음'));
    item.appendChild(info);
    item.addEventListener('click', () => {
      closeModal('modal-history');
      openChat(room.id);
    });
    list.appendChild(item);
  });
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
  $('history-btn').addEventListener('click', () => {
    renderChatRooms();
    openModal('modal-history');
  });
  $('chat-send-btn').addEventListener('click', sendChatMessage);
  $('chat-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendChatMessage();
  });
  $('chat-close').addEventListener('click', () => {
    state.activeRoomId = null;
    closeModal('modal-chat');
  });
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
