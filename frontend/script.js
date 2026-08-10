// TODO(backend): 백엔드 시드 기본값은 TABLE_COUNT=20 (backend/.env). 좌석 수를 하드코딩하지 말고
// GET /api/tables 응답 길이에 맞춰 동적으로 구성해야 함.
const SEAT_COUNT = 10;
const TABLE_TIME_LIMIT_SEC = 2 * 60 * 60; // 테이블 이용 제한: 2시간
const state = {
  mySeat: null,
  seats: [],       // { id, status: 'available' | 'mine' | 'pending' | 'taken' }
  timerSeconds: 0,
  timerHandle: null,
  chats: {},       // seatId -> { messages: [{from:'me'|'other', nickname, text}], time: Date, partnerNickname }
  pendingTargetSeat: null,
  chatPartnerSeat: null,
  activeChatSeat: null,
  genderCount: { male: 0, female: 0 },
  myNickname: '',
  myTable: null,
  tableMembers: [],
  receivedRequests: 0,
  // TODO(backend): 데모용 mock 데이터. 실제로는 GET /api/tables (인증 불필요, 실제 테이블+세션 목록 조회)로 대체.
  // 주의: 백엔드는 물리 테이블(tableId, 고정)과 "현재 그 자리를 쓰는 팀"(tableSessionId, 팀 바뀔 때마다 새로 생성)을 구분함.
  // 합석요청/채팅/게임은 전부 tableId가 아니라 tableSessionId를 기준으로 처리해야 함 — 지금 코드는 이 구분이 없어서 전체 재설계 필요.
  occupiedTables: {
    3: { members: ['수현', '지훈'], male: 1, female: 1, joinedAt: Date.now() - 25 * 60 * 1000 },
    7: { members: ['서연'], male: 0, female: 1, joinedAt: Date.now() - 70 * 60 * 1000 },
  },
};

const el = (id) => document.getElementById(id);

const AVATAR_EMOJIS = ['🐱', '🐶', '🦊', '🐻', '🐼', '🐰', '🐯', '🦁', '🐨', '🐸'];
const avatarFor = (seatId) => AVATAR_EMOJIS[seatId % AVATAR_EMOJIS.length];

// TODO(backend): 채팅은 현재 실제 상대방이 없고 아래 목록으로 가짜 자동응답만 함.
// 실제 채팅은 Socket.IO 이벤트로 교체: 방 입장 시 chat:join({ roomId }), 메시지 전송 chat:send({ roomId, senderSessionId, content }),
// 수신은 chat:message 이벤트. 방 자체는 REST POST /api/chat/rooms 로 먼저 생성, 이전 기록은 GET /api/chat/rooms/:roomId/messages.
// (docs/SOCKET_API.md 참고, socket.io-client 로 연결: io(SERVER_URL, { auth: { token } }))
const CANNED_REPLIES = ['ㅋㅋㅋ 그쵸', '오 진짜요?', '좋아요 ㅎㅎ', '저도요!', '재밌겠다'];
const NAME_POOL = ['민지', '서준', '하은', '지호', '유나', '도윤', '채원', '시우'];
const randomName = () => NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];

const tableSelect = el('table-select');
const tableSelectBtn = el('table-select-btn');
const tableOptionsGrid = el('table-options');

for (let i = 1; i <= 10; i++) {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = `${i}번 테이블`;
  tableSelect.appendChild(opt);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'table-option';
  btn.dataset.table = String(i);
  btn.textContent = `${i}번`;
  tableOptionsGrid.appendChild(btn);
}

// 커스텀 드롭다운 버튼 → 모달 열기
tableSelectBtn.addEventListener('click', () => openModal('modal-table-select'));

// 모달에서 테이블 선택
tableOptionsGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.table-option');
  if (!btn) return;

  tableOptionsGrid.querySelectorAll('.table-option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  tableSelect.value = btn.dataset.table;
  tableSelectBtn.textContent = `${btn.dataset.table}번 테이블`;
  tableSelectBtn.classList.add('picked');
  tableSelect.dispatchEvent(new Event('change'));

  closeModal('modal-table-select');
});

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el(id).classList.add('active');
}

function openModal(id) { el(id).classList.add('active'); }
function closeModal(id) { el(id).classList.remove('active'); }

// 모든 모달의 X 버튼: data-modal 있으면 그 모달을 닫음
document.querySelectorAll('.modal-close[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});

function showToast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

function randomGenderCount() {
  const genders = ['남', '여'];
  const g = genders[Math.floor(Math.random() * 2)];
  const n = Math.floor(Math.random() * 3) + 1;
  return `${g}${n}명`;
}

// 테이블 선택 시 이미 사용중인 테이블인지 확인해서 화면 분기
tableSelect.addEventListener('change', () => {
  const table = state.occupiedTables[tableSelect.value];
  const maleRow = el('male-row');
  const femaleRow = el('female-row');
  const notice = el('occupied-notice');
  const joinBtn = el('join-btn');

  if (table) {
    state.genderCount.male = table.male;
    state.genderCount.female = table.female;
    document.querySelectorAll('.step-value[data-count="male"]').forEach(s => s.textContent = table.male);
    document.querySelectorAll('.step-value[data-count="female"]').forEach(s => s.textContent = table.female);
    maleRow.classList.add('disabled');
    femaleRow.classList.add('disabled');
    notice.classList.add('show');
    joinBtn.textContent = '합류하기';
  } else {
    maleRow.classList.remove('disabled');
    femaleRow.classList.remove('disabled');
    notice.classList.remove('show');
    joinBtn.textContent = '참여';
  }
});

// 인원 선택 스테퍼 (남/여) - 초기화면과 인원수 변경 모달에서 공통으로 사용
document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const delta = parseInt(btn.dataset.delta, 10);
    const next = Math.min(4, Math.max(0, state.genderCount[target] + delta));
    state.genderCount[target] = next;
    document.querySelectorAll(`.step-value[data-count="${target}"]`).forEach(span => {
      span.textContent = next;
    });
  });
});

function initSeats() {
  state.seats = Array.from({ length: SEAT_COUNT }, (_, i) => ({
    id: i + 1,
    status: 'available',
    fakeTime: '',
  }));
  // 내 좌석 = 선택한 테이블 번호와 동일, 나머지 일부 좌석은 이미 사용 중(taken)으로 표시
  state.mySeat = Number(state.myTable);
  state.seats.find(s => s.id === state.mySeat).status = 'mine';

  // TODO(backend): 다른 좌석의 사용 여부/남은 시간은 지금 랜덤으로 지어낸 값.
  // 실제로는 GET /api/tables 응답(테이블+세션 목록)으로 대체해야 함.
  const others = state.seats.filter(s => s.id !== state.mySeat).sort(() => Math.random() - 0.5);
  others.slice(0, 2).forEach(s => {
    const seatObj = state.seats.find(x => x.id === s.id);
    seatObj.status = 'taken';
    const usedSec = 10 * 60 + Math.floor(Math.random() * 80 * 60); // 10~90분 사용된 것으로 가정
    seatObj.fakeTime = formatTime(Math.max(0, TABLE_TIME_LIMIT_SEC - usedSec));
  });

  // 남은 이용 시간 = 2시간 - (테이블을 처음 등록한 시각부터 지금까지 경과 시간)
  // TODO(backend): joinedAt은 지금 클라이언트 mock 데이터(occupiedTables)에서 가져옴.
  // 실제로는 POST /api/tables/:tableId/enter 응답에 담긴 tableSession의 생성 시각을 써야 함.
  // 주의: 2시간 이용 제한 자체가 REST_API.md / SOCKET_API.md 어디에도 명시돼 있지 않음 — 백엔드팀에 이 규칙을 서버에서도 관리할지 확인 필요.
  const myTableRecord = state.occupiedTables[state.myTable];
  const elapsedSec = myTableRecord && myTableRecord.joinedAt
    ? Math.floor((Date.now() - myTableRecord.joinedAt) / 1000)
    : 0;
  state.timerSeconds = Math.max(0, TABLE_TIME_LIMIT_SEC - elapsedSec);
  state.receivedRequests = 0;
  startTimer();
  renderSeats();
  renderStatsBar();
  renderHistoryBadge();
}

function renderStatsBar() {
  el('stat-male').textContent = state.genderCount.male;
  el('stat-female').textContent = state.genderCount.female;
  el('stat-time').textContent = formatTime(state.timerSeconds);
  el('stat-requests').textContent = `${state.receivedRequests}개`;
  el('table-tag-time').textContent = `${formatTime(state.timerSeconds)} 이용중`;
}

function startTimer() {
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = setInterval(() => {
    if (state.timerSeconds > 0) {
      state.timerSeconds -= 1;
      renderSeats();
      renderStatsBar();
    } else {
      clearInterval(state.timerHandle);
    }
  }, 1000);
}

// 초는 표시하지 않고 시:분(예: 01:59, 00:30)만 표시
function formatTime(sec) {
  const totalMin = Math.floor(sec / 60);
  const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
  const m = (totalMin % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function renderSeats() {
  const grid = el('seat-grid');
  grid.innerHTML = '';
  state.seats.forEach(seat => {
    const div = document.createElement('div');
    div.className = `seat ${seat.status}`;
    div.dataset.seatId = seat.id;

    const numberBadge = `<span class="seat-number">${String(seat.id).padStart(2, '0')}</span>`;

    if (seat.status === 'mine') {
      div.innerHTML = `
        ${numberBadge}
        <div class="seat-status-text">현재 이용중</div>
        <div class="seat-timer">${formatTime(state.timerSeconds)}</div>
        <button type="button" class="change-count-btn">인원수 변경</button>
      `;
      div.querySelector('.change-count-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openModal('modal-count');
      });
    } else if (seat.status === 'pending') {
      div.innerHTML = `${numberBadge}<div class="seat-status-text">요청 보냄</div>`;
    } else if (seat.status === 'taken') {
      const hasChat = !!state.chats[seat.id];
      if (hasChat) div.classList.add('has-chat');
      div.innerHTML = `
        ${numberBadge}
        <div class="seat-status-text">${hasChat ? '대화중' : '사용중'}</div>
        <div class="seat-fake-time">${seat.fakeTime}</div>
      `;
    } else {
      div.innerHTML = `
        ${numberBadge}
        <div class="seat-status-text">사용 가능</div>
        <span class="seat-talk-btn">말 걸기</span>
      `;
    }
    div.addEventListener('click', () => onSeatClick(seat));
    grid.appendChild(div);
  });
}

function onSeatClick(seat) {
  if (seat.status === 'mine') return;
  if (seat.status === 'taken') {
    if (state.chats[seat.id]) openChat(seat.id);
    return;
  }
  if (seat.status === 'pending') {
    showToast('이미 요청을 보낸 좌석이에요');
    return;
  }
  state.pendingTargetSeat = seat.id;
  el('send-seat-label').textContent = `${seat.id}번 좌석에게 채팅 요청 보내기`;
  el('send-message').value = '';
  openModal('modal-send');
}

// TODO(backend): 테이블 참여는 지금 드롭다운으로 번호를 직접 고르는 방식인데, 백엔드는 QR 스캔 후
// POST /api/tables/:tableId/enter 호출로 새 tableSession을 만드는 흐름을 전제로 함(인증 불필요, 응답에 참가자용 JWT 포함).
// 이후 모든 인증 API는 그 토큰을 Authorization: Bearer <token> 헤더에 실어 보내야 함.
// 드롭다운 UI를 유지할지, QR 흐름으로 바꿀지 백엔드팀과 먼저 맞춰야 함.
el('join-btn').addEventListener('click', () => {
  const table = el('table-select').value;
  const nickname = el('nickname-input').value.trim();
  const existing = state.occupiedTables[table];

  if (!table || !nickname) {
    showToast('테이블 번호와 닉네임을 입력해주세요');
    return;
  }
  if (!existing && state.genderCount.male + state.genderCount.female === 0) {
    showToast('인원을 선택해주세요');
    return;
  }

  state.myNickname = nickname;
  state.myTable = table;

  if (existing) {
    // 이미 있는 테이블에 합류: 기존 멤버 목록에 내 닉네임 추가
    state.tableMembers = [...existing.members, nickname];
    existing.members = state.tableMembers;
  } else {
    // 새 테이블 등록: 내가 첫 멤버, 나중에 다른 사람이 같은 테이블 스캔하면 이 정보를 보게 됨
    state.tableMembers = [nickname];
    state.occupiedTables[table] = {
      members: state.tableMembers,
      male: state.genderCount.male,
      female: state.genderCount.female,
      joinedAt: Date.now(), // 테이블을 처음 등록한 시각 (2시간 카운트다운 기준)
    };
  }

  el('table-tag').textContent = `TABLE ${table}`;
  showScreen('screen-seats');
  initSeats();
  renderMemberChips();
});

function renderMemberChips() {
  const box = el('member-chips');
  box.innerHTML = state.tableMembers.map(name => {
    const isMe = name === state.myNickname;
    return `<span class="chip ${isMe ? 'me' : ''}">${name}</span>`;
  }).join('');
  if (box.children.length) {
    const meIndex = state.tableMembers.indexOf(state.myNickname);
    if (meIndex !== -1) {
      box.children[meIndex].addEventListener('click', () => {
        el('nickname-edit-input').value = state.myNickname;
        openModal('modal-nickname');
      });
    }
  }
}

el('send-request-btn').addEventListener('click', () => {
  const targetId = state.pendingTargetSeat;
  const msg = el('send-message').value.trim();
  const seat = state.seats.find(s => s.id === targetId);
  seat.status = 'pending';
  renderSeats();
  closeModal('modal-send');
  showToast(`${targetId}번 좌석에 요청을 보냈어요`);

  // TODO(backend): 아래는 상대방 응답을 가짜로 흉내낸 것. 실제로는 POST /api/join-requests (인증 필요)로 합석 요청을 생성하고,
  // 내 쪽은 GET /api/join-requests로 받은 요청을 조회, 수락은 PATCH /api/join-requests/:requestId/accept,
  // 거절은 .../reject, 취소는 DELETE /api/join-requests/:requestId.
  // 주의: 상대방에게 "요청이 왔다"를 실시간으로 알리는 방식이 SOCKET_API.md에 명시돼 있지 않음 —
  // 폴링으로 GET /api/join-requests를 주기적으로 확인할지, 소켓 이벤트를 추가할지 백엔드팀과 확인 필요.
  setTimeout(() => {
    state.chatPartnerSeat = targetId;
    state.receivedRequests += 1;
    renderStatsBar();
    el('incoming-detail').textContent = `${targetId}번 좌석 ${randomGenderCount()} ㅎㅎㅎㅎ\n"${msg || '안녕하세요!'}"`;
    openModal('modal-incoming');
  }, 1800);
});

function rejectRequest() {
  closeModal('modal-incoming');
  const seatId = state.chatPartnerSeat;
  const seatObj = state.seats.find(s => s.id === seatId);
  if (seatObj) seatObj.status = 'available';
  renderSeats();
}

el('accept-btn').addEventListener('click', () => {
  closeModal('modal-incoming');
  const seatId = state.chatPartnerSeat;
  if (!state.chats[seatId]) {
    const partnerNickname = randomName();
    state.chats[seatId] = {
      messages: [{ from: 'other', nickname: partnerNickname, text: '안녕하세요! 반가워요 :)' }],
      time: new Date(),
      unread: false,
      partnerNickname,
    };
  }
  const seatObj = state.seats.find(s => s.id === seatId);
  if (seatObj) seatObj.status = 'taken';
  renderSeats();
  renderHistoryBadge();
  openChat(seatId);
});

function renderHistoryBadge() {
  const count = Object.keys(state.chats).length;
  const badge = el('history-badge');
  badge.textContent = count;
  badge.dataset.zero = count === 0 ? 'true' : 'false';
}

el('reject-btn').addEventListener('click', rejectRequest);
el('incoming-close').addEventListener('click', rejectRequest);

function openChat(seatId) {
  state.activeChatSeat = seatId;
  state.chats[seatId].unread = false;
  el('chat-title').textContent = `${avatarFor(seatId)} ${seatId}번 좌석과의 채팅`;
  el('chat-me-label').innerHTML = `내 닉네임: <b>${state.myNickname || '익명'}</b>`;
  renderChatLog();
  openModal('modal-chat');
}

function renderChatLog(showTyping) {
  const chat = state.chats[state.activeChatSeat];
  const log = el('chat-log');
  log.innerHTML = chat.messages
    .map(m => `
      <div class="bubble-group ${m.from === 'me' ? 'me' : 'other'}">
        <div class="bubble-name">${m.nickname || (m.from === 'me' ? state.myNickname : '')}</div>
        <div class="chat-bubble ${m.from === 'me' ? 'me' : 'other'}">${m.text}</div>
      </div>`)
    .join('');
  if (showTyping) {
    log.innerHTML += `<div class="chat-bubble typing"><span></span><span></span><span></span></div>`;
  }
  log.scrollTop = log.scrollHeight;
}

el('chat-send-btn').addEventListener('click', sendChatMessage);
el('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});
function sendChatMessage() {
  const input = el('chat-input');
  const text = input.value.trim();
  if (!text || state.activeChatSeat == null) return;
  const seatId = state.activeChatSeat;
  const chat = state.chats[seatId];
  chat.messages.push({ from: 'me', nickname: state.myNickname, text });
  chat.time = new Date();
  input.value = '';
  renderChatLog();

  // TODO(backend): 여기서부터 진짜 채팅이 아님 — CANNED_REPLIES 중 하나를 랜덤으로 골라 자동응답하는 것뿐.
  // 실제로는 socket.emit('chat:send', { roomId, senderSessionId, content: text })로 전송하고,
  // socket.on('chat:message', ...)으로 내가 보낸 것 포함 모든 메시지를 서버로부터 받아서 렌더링해야 함
  // (로컬에서 먼저 push하는 지금 방식이 아니라 서버 응답을 그대로 신뢰하는 구조로 바뀌어야 함).
  setTimeout(() => {
    if (state.activeChatSeat === seatId) renderChatLog(true);
  }, 500);
  setTimeout(() => {
    const reply = CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)];
    chat.messages.push({ from: 'other', nickname: chat.partnerNickname, text: reply });
    chat.time = new Date();
    chat.unread = state.activeChatSeat !== seatId;
    if (state.activeChatSeat === seatId) renderChatLog();
  }, 1800);
}

el('chat-close').addEventListener('click', () => {
  closeModal('modal-chat');
  state.activeChatSeat = null;
});

// 인원수 변경
el('count-confirm-btn').addEventListener('click', () => {
  const { male, female } = state.genderCount;
  if (male + female === 0) {
    showToast('최소 1명 이상 선택해주세요');
    return;
  }
  closeModal('modal-count');
  showToast(`인원수가 남 ${male}명 · 여 ${female}명으로 변경됐어요`);
});

// 닉네임 변경 (변경하면 예전 채팅 기록에도 소급 반영)
el('nickname-confirm-btn').addEventListener('click', () => {
  const newName = el('nickname-edit-input').value.trim();
  if (!newName) {
    showToast('닉네임을 입력해주세요');
    return;
  }
  const oldName = state.myNickname;
  if (newName === oldName) {
    closeModal('modal-nickname');
    return;
  }

  // 테이블 멤버 목록에서 내 이름 교체
  const memberIndex = state.tableMembers.indexOf(oldName);
  if (memberIndex !== -1) state.tableMembers[memberIndex] = newName;
  const tableRecord = state.occupiedTables[state.myTable];
  if (tableRecord) {
    const idx = tableRecord.members.indexOf(oldName);
    if (idx !== -1) tableRecord.members[idx] = newName;
  }

  // 예전 채팅 기록에도 전부 소급 반영
  Object.values(state.chats).forEach(chat => {
    chat.messages.forEach(m => {
      if (m.from === 'me' && m.nickname === oldName) m.nickname = newName;
    });
  });

  state.myNickname = newName;
  renderMemberChips();
  if (state.activeChatSeat != null) {
    el('chat-me-label').innerHTML = `내 닉네임: <b>${state.myNickname}</b>`;
    renderChatLog();
  }
  closeModal('modal-nickname');
  showToast(`닉네임이 "${newName}"(으)로 바뀌었어요`);
});

// 신청곡 (관리자 페이지와 localStorage로 공유 — 백엔드 연결 전까지의 임시 저장소)
const SONG_REQUEST_KEY = 'piumSongRequests';

// TODO(backend): 신청곡을 localStorage에 저장 중 — 같은 브라우저 안에서만 관리자 페이지와 공유됨(다른 기기에선 안 보임).
// ⚠️ 신청곡 API는 REST_API.md / SOCKET_API.md 어디에도 없음 — 백엔드 스펙에 아직 없는 기능이므로
// 백엔드팀에 별도로 요청해서 엔드포인트를 만들어야 함 (예: POST /api/songs, GET /api/songs).
function addSongRequest(song) {
  const list = JSON.parse(localStorage.getItem(SONG_REQUEST_KEY) || '[]');
  list.unshift({
    id: Date.now(),
    table: state.myTable,
    nickname: state.myNickname || '익명',
    song,
    time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
  });
  localStorage.setItem(SONG_REQUEST_KEY, JSON.stringify(list));
}

el('song-btn').addEventListener('click', () => {
  el('song-input').value = '';
  openModal('modal-song');
});
el('song-submit-btn').addEventListener('click', () => {
  const song = el('song-input').value.trim();
  if (!song) { showToast('곡 제목을 입력해주세요'); return; }
  closeModal('modal-song');
  addSongRequest(song);
  showToast(`"${song}" 신청 완료!`);
});

// 채팅 내역 (인스타 DM 스타일 목록)
el('history-btn').addEventListener('click', () => {
  const list = el('history-list');
  const seatIds = Object.keys(state.chats).map(Number).sort(
    (a, b) => state.chats[b].time - state.chats[a].time
  );

  if (seatIds.length === 0) {
    list.innerHTML = `<div class="history-empty">아직 채팅 내역이 없어요</div>`;
  } else {
    list.innerHTML = seatIds.map(seatId => {
      const chat = state.chats[seatId];
      const last = chat.messages[chat.messages.length - 1];
      const time = chat.time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="history-item" data-seat="${seatId}">
          <div class="history-avatar">${avatarFor(seatId)}</div>
          <div class="history-info">
            <div class="history-seat-name">${seatId}번 좌석 · ${chat.partnerNickname || ''} ${chat.unread ? '<span class="unread-dot"></span>' : ''}</div>
            <div class="history-preview">${last.nickname ? last.nickname + ': ' : ''}${last.text}</div>
          </div>
          <div class="history-time">${time}</div>
        </div>`;
    }).join('');

    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        closeModal('modal-history');
        openChat(Number(item.dataset.seat));
      });
    });
  }
  openModal('modal-history');
});
