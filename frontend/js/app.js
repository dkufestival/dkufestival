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
import { dismissPushPrompt, enablePush, shouldShowPushPrompt } from './push.js';

const state = {
  qrToken: new URLSearchParams(location.search).get('qr'),
  token: null,
  table: null,
  session: null,
  participant: null,
  participants: [],
  tables: [],
  chatRequests: [],
  activeRoom: null,
  messages: new Map(),
  notices: [],
  songRequests: [],
  activeGame: null,
  entryContext: null,
  counts: { male: 0, female: 0 },
  timer: null,
  pendingTargetTable: null,
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

function isHost() {
  return Boolean(state.participant?.isHost);
}

function ownBusyRoom() {
  return state.activeRoom || state.chatRequests.find((request) => ['PENDING', 'ACTIVE'].includes(request.status));
}

function peerSession(room) {
  if (!room) return null;
  const sent = Number(room.requesterSessionId) === Number(state.session?.id);
  return sent ? room.targetSession : room.requesterSession;
}

function peerLabel(room) {
  return `TABLE ${room?.peerTableNumber || peerSession(room)?.table?.tableNumber || '-'}`;
}

function formatCountdown(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function setLandingStatus(message) {
  $('entry-status').textContent = message;
}

async function initEntry() {
  const clientId = getClientId();
  $('client-id-label').textContent = clientId.slice(0, 8);

  if (!state.qrToken) {
    setLandingStatus('QR 정보가 없습니다. 테이블 QR로 접속해주세요.');
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
    setLandingStatus(state.entryContext.hasActiveSession ? '사용 중인 테이블입니다. 닉네임만 입력하면 합류합니다.' : '첫 입장자입니다. 테이블 인원을 입력해주세요.');

    const auth = getParticipantAuth();
    if (auth?.token && auth.tableId === state.table.id) {
      $('nickname-input').value = auth.participant?.nickname || '';
      await restoreFromToken();
    }
  } catch (error) {
    $('join-btn').disabled = true;
    setLandingStatus(error.code === 'INVALID_QR' ? '잘못되었거나 비활성화된 QR입니다.' : error.message);
  }
}

async function enter() {
  const nickname = $('nickname-input').value.trim();
  if (!nickname) return showToast('닉네임을 입력해주세요.');
  if (state.entryContext?.requiresTeamSetup && state.counts.male + state.counts.female < 1) {
    return showToast('첫 입장자는 인원을 1명 이상 입력해야 합니다.');
  }

  const body = { qrToken: state.qrToken, clientId: getClientId(), nickname };
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
    refreshChatRequests(),
    refreshSongs(),
    refreshNotices(),
  ]);
  await refreshActiveRoom();
  renderAll();
  startTimer();
  renderPushPrompt();
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

async function refreshChatRequests() {
  state.chatRequests = await chatApi.requests();
}

async function refreshActiveRoom() {
  const room = await chatApi.active();
  if (!room) {
    state.activeRoom = null;
    return;
  }
  await setActiveRoom(room);
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
    if (state.activeRoom) joinChatRoom(state.activeRoom.id);
  });
  socket.on('disconnect', () => {
    $('connection-status').textContent = '재연결 대기';
    renderChatState();
  });
  socket.on('participant:joined', () => refreshParticipants().then(renderParticipants));
  socket.on('participant:updated', () => refreshParticipants().then(renderParticipants));
  socket.on('participant:left', () => refreshParticipants().then(renderParticipants));
  socket.on('table:updated', () => Promise.all([refreshTables(), refreshChatRequests()]).then(renderAll));
  socket.on('table:extended', ({ session }) => {
    state.session = session;
    renderStats();
    renderTables();
  });
  socket.on('table:checked-out', () => {
    showToast('테이블 이용이 종료되었습니다.');
    clearParticipantAuth();
    state.activeRoom = null;
    showScreen('screen-landing');
  });
  socket.on('chat:request-received', handleRequestEvent);
  socket.on('chat:request-cancelled', handleRequestClosed);
  socket.on('chat:request-rejected', handleRequestClosed);
  socket.on('chat:request-expired', handleRequestClosed);
  socket.on('chat:started', (room) => setActiveRoom(room).then(() => showToast('채팅이 시작되었습니다.')));
  socket.on('chat:active', (room) => setActiveRoom(room));
  socket.on('chat:ended', handleChatEnded);
  socket.on('chat:message', (message) => {
    const list = state.messages.get(message.roomId) || [];
    if (!list.some((item) => item.id === message.id)) list.push(message);
    state.messages.set(message.roomId, list);
    renderChat();
  });
  socket.on('notification:created', (payload) => {
    if (payload?.message) showToast(payload.message);
  });
  socket.on('notice:created', (notice) => {
    state.notices.unshift(notice);
    renderNotices();
    showToast(`공지: ${notice.title}`);
  });
  socket.on('song:requested', (song) => {
    if (song.participantId === state.participant?.id) state.songRequests.unshift(song);
    renderSongs();
  });
  socket.on('song:cancelled', updateSong);
  socket.on('song:completed', updateSong);
  socket.on('game:global:started', (game) => {
    state.activeGame = game;
    renderGame();
    showGlobalGameScreen();
    showToast('전체 게임이 시작되었습니다.');
  });
  socket.on('game:global:current', (game) => {
    state.activeGame = game;
    renderGame();
    showGlobalGameScreen();
  });
  socket.on('game:global:ended', (game) => {
    state.activeGame = null;
    renderGame();
    closeModal('modal-game');
    showScreen('screen-seats');
    if (state.activeRoom) openModal('modal-chat');
    showToast(`${game.type} 게임이 종료되었습니다.`);
  });
  socket.on('game:invited', (game) => {
    state.activeGame = game;
    renderGame();
    showToast('게임 초대가 도착했습니다.');
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

function updateSong(song) {
  state.songRequests = state.songRequests.map((item) => item.id === song.id ? song : item);
  renderSongs();
}

async function handleRequestEvent(room) {
  await refreshChatRequests();
  renderAll();
  showIncoming(room);
}

async function handleRequestClosed(room) {
  state.chatRequests = state.chatRequests.filter((request) => request.id !== room.id);
  closeModal('modal-incoming');
  renderAll();
}

async function handleChatEnded() {
  state.activeRoom = null;
  state.messages.clear();
  closeModal('modal-end-chat');
  closeModal('modal-chat');
  showToast('채팅이 종료되었습니다.');
  await Promise.all([refreshChatRequests(), refreshTables()]);
  renderAll();
  showScreen('screen-seats');
}

function renderAll() {
  renderStats();
  renderParticipants();
  renderTables();
  renderRequestStatus();
  renderSongs();
  renderNotices();
  renderGame();
  renderChatRooms();
  if (state.activeRoom) renderChat();
}

function renderStats() {
  $('table-tag').textContent = `TABLE ${state.table?.tableNumber || '-'}`;
  $('stat-male').textContent = state.session?.maleCount ?? state.counts.male;
  $('stat-female').textContent = state.session?.femaleCount ?? state.counts.female;
  const left = state.session?.expiresAt ? formatRemaining(state.session.expiresAt) : '00:00';
  $('stat-time').textContent = left;
  $('table-tag-time').textContent = `${left} 남음`;
  $('stat-requests').textContent = state.chatRequests.filter((request) => request.status === 'PENDING').length;
  const badge = $('history-badge');
  if (badge) {
    const count = state.chatRequests.length + (state.activeRoom ? 1 : 0);
    badge.textContent = count;
    badge.dataset.zero = count ? 'false' : 'true';
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

function renderTables() {
  const grid = $('seat-grid');
  clear(grid);
  const busy = ownBusyRoom();
  state.tables.forEach((table) => {
    const session = table.activeSession;
    const isMine = table.id === state.table?.id;
    const card = document.createElement('div');
    card.className = `seat ${isMine ? 'mine' : session ? 'taken' : 'available'}`;
    card.appendChild(text('span', 'seat-number', String(table.tableNumber).padStart(2, '0')));
    card.appendChild(text('div', 'seat-status-text', isMine ? '내 테이블' : session ? '사용 중' : '비어 있음'));
    if (session) card.appendChild(text('div', 'seat-fake-time', `${formatRemaining(session.expiresAt)} 남음`));
    if (isMine && isHost()) {
      card.appendChild(button('seat-talk-btn', '인원 변경', (event) => {
        event.stopPropagation();
        setCounts(state.session.maleCount, state.session.femaleCount);
        openModal('modal-count');
      }));
    }
    if (!isMine && session && isHost()) {
      const disabled = Boolean(busy);
      const requestButton = button('seat-talk-btn', disabled ? '요청 불가' : '채팅 요청', (event) => {
        event.stopPropagation();
        if (disabled) return showToast('이미 진행 중인 요청 또는 채팅이 있습니다.');
        openRequestModal(table);
      });
      requestButton.disabled = disabled;
      card.appendChild(requestButton);
    }
    grid.appendChild(card);
  });
}

function renderRequestStatus() {
  const box = $('request-status');
  const pending = state.chatRequests.find((request) => request.status === 'PENDING');
  if (!pending || state.activeRoom) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.hidden = false;
  if (Number(pending.requesterSessionId) === Number(state.session?.id)) {
    box.innerHTML = `${peerLabel(pending)}의 응답을 기다리는 중 <b>${formatCountdown(pending.requestExpiresAt)}</b>`;
    if (isHost()) {
      const cancel = button('inline-action', '요청 취소', () => cancelRequest(pending.id));
      box.appendChild(cancel);
    }
  } else {
    box.textContent = `${peerLabel(pending)}에서 채팅 요청이 도착했습니다.`;
    showIncoming(pending);
  }
}

function renderChatRooms() {
  const list = $('history-list');
  if (!list) return;
  clear(list);

  if (state.activeRoom) {
    const item = document.createElement('div');
    item.className = 'history-item';
    const info = document.createElement('div');
    info.className = 'history-info';
    info.appendChild(text('div', 'history-seat-name', `${peerLabel(state.activeRoom)} 채팅 중`));
    info.appendChild(text('div', 'history-preview', '터치해서 채팅방 열기'));
    item.appendChild(info);
    item.addEventListener('click', () => {
      closeModal('modal-history');
      openModal('modal-chat');
      renderChat();
    });
    list.appendChild(item);
  }

  state.chatRequests.forEach((request) => {
    if (state.activeRoom && Number(request.id) === Number(state.activeRoom.id)) return;
    const item = document.createElement('div');
    item.className = 'history-item';
    const info = document.createElement('div');
    info.className = 'history-info';
    const sent = Number(request.requesterSessionId) === Number(state.session?.id);
    const label = sent ? '보낸 요청' : '받은 요청';
    info.appendChild(text('div', 'history-seat-name', `${peerLabel(request)} ${label}`));
    info.appendChild(text('div', 'history-preview', request.status));
    item.appendChild(info);
    list.appendChild(item);
  });

  if (!list.children.length) {
    list.appendChild(text('div', 'history-empty', '채팅방이 없습니다.'));
  }
}

function openRequestModal(table) {
  state.pendingTargetTable = table;
  $('send-seat-label').textContent = `TABLE ${table.tableNumber}에 채팅 요청`;
  $('send-message').value = '';
  openModal('modal-send');
}

async function sendChatRequest() {
  const target = state.pendingTargetTable;
  if (!target?.activeSession?.id) return showToast('사용 중인 테이블에만 요청할 수 있습니다.');
  const room = await chatApi.createRequest({
    targetSessionId: target.activeSession.id,
    message: $('send-message').value.trim(),
  });
  state.chatRequests.unshift(room);
  closeModal('modal-send');
  renderAll();
  showToast('채팅 요청을 보냈습니다.');
}

function showIncoming(room) {
  if (!room || room.status !== 'PENDING' || Number(room.targetSessionId) !== Number(state.session?.id)) return;
  $('incoming-title').textContent = `${peerLabel(room)}에서 채팅 요청`;
  $('incoming-detail').textContent = `${room.requesterSession?.maleCount ?? room.peerMaleCount ?? 0}명 / ${room.requesterSession?.femaleCount ?? room.peerFemaleCount ?? 0}명\n${room.requestMessage || ''}`;
  document.querySelector('.host-actions').hidden = !isHost();
  $('accept-btn').onclick = () => answerRequest(room.id, 'accept');
  $('reject-btn').onclick = () => answerRequest(room.id, 'reject');
  $('incoming-close').onclick = () => closeModal('modal-incoming');
  openModal('modal-incoming');
}

async function answerRequest(roomId, action) {
  const room = action === 'accept' ? await chatApi.accept(roomId) : await chatApi.reject(roomId);
  state.chatRequests = state.chatRequests.map((item) => item.id === room.id ? room : item);
  closeModal('modal-incoming');
  if (action === 'accept') await setActiveRoom(room);
  else renderAll();
}

async function cancelRequest(roomId) {
  await chatApi.cancel(roomId);
  state.chatRequests = state.chatRequests.filter((request) => request.id !== roomId);
  renderAll();
}

async function setActiveRoom(room) {
  state.activeRoom = room;
  await loadMessages(room.id);
  joinChatRoom(room.id);
  renderChat();
  renderChatRooms();
  openModal('modal-chat');
}

async function loadMessages(roomId) {
  const messages = await chatApi.messages(roomId);
  state.messages.set(Number(roomId), messages);
}

function joinChatRoom(roomId) {
  getSocket()?.emit('chat:join', { roomId }, (response) => {
    if (!response?.ok) showToast(response?.message || response?.error || '채팅방 입장 실패');
  });
}

function renderChatState() {
  $('chat-state').textContent = getSocket()?.connected ? '실시간 연결됨' : '재연결 대기';
}

function renderChat() {
  if (!state.activeRoom) return;
  $('chat-title').textContent = `${peerLabel(state.activeRoom)} 채팅`;
  renderChatState();
  const log = $('chat-log');
  clear(log);
  const messages = state.messages.get(Number(state.activeRoom.id)) || [];
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
  if (!content || !state.activeRoom) return;
  $('chat-send-btn').disabled = true;
  getSocket()?.emit('chat:send', { roomId: state.activeRoom.id, content }, (response) => {
    $('chat-send-btn').disabled = false;
    if (!response?.ok) return showToast(response?.message || response?.error || '메시지 전송 실패');
    input.value = '';
  });
}

async function endActiveChat() {
  if (!state.activeRoom) return;
  const roomId = state.activeRoom.id;
  await chatApi.end(roomId);
  await handleChatEnded();
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
        updateSong(updated);
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
  const basketballCard = document.createElement('div');
  basketballCard.className = 'basketball-entry';
  basketballCard.appendChild(text('div', 'basketball-entry-icon', '🏀'));
  basketballCard.appendChild(text('div', 'basketball-entry-title', '농구게임'));
  basketballCard.appendChild(text('div', 'basketball-entry-copy', '제한 시간 안에 최대한 많은 골을 넣어보세요.'));
  basketballCard.appendChild(button('btn-dark full', '농구게임 입장', () => {
    window.location.href = `${window.location.protocol}//${window.location.hostname}:5175/`;
  }));
  box.appendChild(basketballCard);
  if (!state.activeGame) {
    box.appendChild(text('div', 'history-empty', '현재 진행 중인 전체 게임은 없습니다.'));
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
    box.appendChild(button('btn-primary full', '초대 수락', () => {
      getSocket()?.emit('game:accept', { gameId: state.activeGame.id }, (response) => {
        if (!response?.ok) showToast(response?.message || response?.error || '게임 수락 실패');
      });
    }));
  }
}

function showGlobalGameScreen() {
  $('game-screen-title').textContent = state.activeGame?.type === 'MISSION' ? '전체 미션' : state.activeGame?.type || '전체 게임';
  $('game-screen-action').disabled = false;
  $('game-screen-action').textContent = '게임 참여하기';
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
    renderRequestStatus();
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
  $('send-request-btn').addEventListener('click', () => sendChatRequest().catch((error) => showToast(error.message)));
  $('history-btn').addEventListener('click', () => {
    renderChatRooms();
    openModal('modal-history');
  });
  $('chat-close').addEventListener('click', () => closeModal('modal-chat'));
  $('chat-send-btn').addEventListener('click', sendChatMessage);
  $('chat-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage();
    }
  });
  $('chat-end-btn').addEventListener('click', () => openModal('modal-end-chat'));
  $('end-cancel-btn').addEventListener('click', () => closeModal('modal-end-chat'));
  $('end-confirm-btn').addEventListener('click', () => endActiveChat().catch((error) => showToast(error.message)));
  $('nickname-confirm-btn').addEventListener('click', async () => {
    const nickname = $('nickname-edit-input').value.trim();
    if (!nickname) return showToast('닉네임을 입력해주세요.');
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
  $('chat-song-btn').addEventListener('click', () => openModal('modal-song'));
  $('song-submit-btn').addEventListener('click', async () => {
    const raw = $('song-input').value.trim();
    if (!raw) return showToast('신청곡을 입력해주세요.');
    const [songTitle, ...artistParts] = raw.split('-').map((part) => part.trim());
    const song = await songsApi.create({ songTitle, artist: artistParts.join(' - ') || undefined });
    state.songRequests.unshift(song);
    $('song-input').value = '';
    closeModal('modal-song');
    renderSongs();
  });
  $('notice-btn').addEventListener('click', () => openModal('modal-notices'));
  $('chat-notice-btn').addEventListener('click', () => openModal('modal-notices'));
  $('game-btn').addEventListener('click', () => openModal('modal-game'));
  $('chat-game-btn').addEventListener('click', () => openModal('modal-game'));
  $('game-screen-action').addEventListener('click', () => {
    if (!state.activeGame) return;
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
