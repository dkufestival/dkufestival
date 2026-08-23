import { setToastHandler } from './api.js';
import { clearAdminToken, getAdminToken, saveAdminToken } from './auth.js';
import { connectSocket, getSocket } from './socket.js';
import { $, button, clear, formatDateTime, formatRemaining, text } from './dom.js';
import { adminApi } from './admin-api.js';
import { songsApi } from './songs.js';
import { noticesApi } from './notices.js';

const state = {
  tables: [],
  songs: [],
  activeGame: null,
  activeDetailTable: null,
  detailCounts: { male: 0, female: 0 },
  timer: null,
};

function showToast(message) {
  const toast = $('admin-toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
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
  await Promise.all([loadTables(), loadSongs()]);
  renderAll();
  startTimer();
}

function bindSocket() {
  const socket = connectSocket('ADMIN');
  if (!socket) return;
  socket.on('table:updated', () => loadTables().then(renderAll));
  socket.on('table:extended', () => loadTables().then(renderAll));
  socket.on('table:checked-out', () => loadTables().then(renderAll));
  socket.on('song:requested', (song) => {
    if (!state.songs.some((item) => item.id === song.id)) state.songs.unshift(song);
    renderSongs();
  });
  socket.on('song:cancelled', updateSong);
  socket.on('song:completed', updateSong);
  socket.on('game:global:state', (game) => addGameLog(`${game.type} 응답 수신`));
  socket.on('game:global:current', (game) => {
    state.activeGame = game;
    renderGameControls();
  });
  socket.on('game:global:ended', (game) => {
    state.activeGame = null;
    renderGameControls();
    addGameLog(`${game.type} 전체 게임 종료`);
  });
}

function updateSong(song) {
  state.songs = state.songs.map((item) => item.id === song.id ? song : item);
  renderSongs();
}

async function loadTables() {
  state.tables = await adminApi.tables();
}

async function loadSongs() {
  state.songs = await songsApi.adminList();
}

function renderAll() {
  renderStats();
  renderTableGrid();
  renderGameControls();
  renderSongs();
}

function renderStats() {
  const occupied = state.tables.filter((table) => table.activeSession);
  const people = occupied.reduce((sum, table) => {
    const session = table.activeSession;
    return sum + Number(session?.maleCount || 0) + Number(session?.femaleCount || 0);
  }, 0);
  $('stat-occupied').textContent = `${occupied.length}/${state.tables.length}`;
  $('stat-people').textContent = `${people}명`;
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
  body.appendChild(text('div', 'detail-empty', '아직 입실하지 않은 테이블입니다.'));
  body.appendChild(countEditor('입실 인원'));
  body.appendChild(button('btn-dark full', '수동 입실', async () => {
    if (state.detailCounts.male + state.detailCounts.female < 1) return showToast('인원을 입력해 주세요.');
    await adminApi.checkin(table.id, {
      maleCount: state.detailCounts.male,
      femaleCount: state.detailCounts.female,
    });
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
  timeRow.appendChild(button('detail-btn', '초기화', async () => {
    await adminApi.resetTime(table.id);
    await reloadDetail();
  }));
  time.appendChild(timeRow);
  body.appendChild(time);

  body.appendChild(countEditor('인원 변경'));
  body.appendChild(button('detail-btn', '인원 저장', async () => {
    await adminApi.counts(table.id, {
      maleCount: state.detailCounts.male,
      femaleCount: state.detailCounts.female,
    });
    await reloadDetail();
  }));
  body.appendChild(button('detail-btn danger', '퇴실 처리', async () => {
    await adminApi.checkout(table.id);
    closeDetail();
    await loadTables();
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
  await loadTables();
  renderAll();
  openDetail(state.activeDetailTable);
}

function closeDetail() {
  $('detail-overlay').classList.remove('show');
  $('detail-panel').classList.remove('show');
  state.activeDetailTable = null;
}

function renderGameControls() {
  $('game-status').textContent = state.activeGame ? '참가자 화면에서 게임이 진행 중입니다.' : '게임을 시작할 수 있습니다.';
  $('broadcast-btn').hidden = Boolean(state.activeGame);
  $('end-game-btn').hidden = !state.activeGame;
  renderStats();
}

function addGameLog(message) {
  const log = $('game-log');
  const empty = log.querySelector('.game-log-empty');
  if (empty) empty.remove();
  const item = text('div', 'game-log-item', `${new Date().toLocaleTimeString('ko-KR')} · ${message}`);
  log.prepend(item);
}

function renderSongs() {
  const badge = $('song-nav-badge');
  badge.textContent = state.songs.filter((song) => song.status === 'REQUESTED').length;
  badge.dataset.zero = badge.textContent === '0' ? 'true' : 'false';
  const list = $('song-request-list');
  clear(list);
  if (!state.songs.length) {
    list.appendChild(text('div', 'song-empty', '아직 신청곡이 없습니다.'));
    return;
  }
  state.songs.forEach((song) => {
    const item = document.createElement('div');
    item.className = 'song-item';
    const info = document.createElement('div');
    info.className = 'song-item-info';
    info.appendChild(text('div', 'song-item-title', `${song.songTitle}${song.artist ? ` - ${song.artist}` : ''}`));
    info.appendChild(text('div', 'song-item-meta', `SESSION ${song.tableSessionId} · ${song.participant?.nickname || song.participantId} · ${song.status}`));
    item.appendChild(info);
    if (song.status === 'REQUESTED') {
      item.appendChild(button('song-done-btn', '완료', async () => {
        const updated = await songsApi.complete(song.id);
        updateSong(updated);
      }));
    }
    list.appendChild(item);
  });
}

async function createNotice() {
  const title = $('notice-title').value.trim();
  const content = $('notice-content').value.trim();
  const category = $('notice-category').value;
  if (!title || !content) return showToast('공지 제목과 내용을 입력해 주세요.');
  await noticesApi.create({ title, content, category });
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
    getSocket()?.emit('game:global:start', {
      type: 'MISSION',
      state: { startedBy: 'admin', startedAt: new Date().toISOString() },
    }, (response) => {
      if (response?.ok) {
        state.activeGame = response.data;
        renderGameControls();
        addGameLog('전체 게임 시작');
      }
      else showToast(response?.message || response?.error || '게임 시작 실패');
    });
  });
  $('end-game-btn').addEventListener('click', () => {
    if (!state.activeGame) return;
    getSocket()?.emit('game:global:end', { gameId: state.activeGame.id }, (response) => {
      if (!response?.ok) return showToast(response?.message || response?.error || '게임 종료 실패');
      state.activeGame = null;
      renderGameControls();
    });
  });
  $('notice-send-btn').addEventListener('click', () => createNotice().catch((error) => showToast(error.message)));
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
