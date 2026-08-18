const el = (id) => document.getElementById(id);

// TODO(backend): 데모용 하드코딩 로그인. ID/PW가 클라이언트 코드에 평문 노출되어 있어 실서비스에 절대 이대로 쓰면 안 됨.
// 실제로는 POST /api/admin/login (인증 불필요, 성공 시 JWT 발급)으로 교체하고,
// 이후 관리자 API(GET /api/admin/tables, POST /api/admin/tables/:tableId/checkout, POST /api/notices 등)는
// 발급받은 토큰을 Authorization: Bearer <token> 헤더에 실어 보내야 함.
const ADMIN_ID = 'admin';
const ADMIN_PW = '1234';

// TODO(backend): 게임 id('mission'/'ox'/'reaction')가 실제 소켓 이벤트의 type 값과 맞는지 백엔드팀과 확인 필요.
// SOCKET_API.md 예시는 type: 'RPS' 하나뿐이라 나머지 게임 타입 이름을 서로 맞춰야 함.
const GAMES = [
  { id: 'mission', name: '미션 카드', level: 'Lv.1 · 미션 브로드캐스트' },
  { id: 'ox', name: 'OX 퀴즈', level: 'Lv.2 · 실시간 투표' },
  { id: 'reaction', name: '반응속도 게임', level: 'Lv.3 · 경쟁 랭킹 (준비중)' },
];

const state = {
  selectedGame: GAMES[0].id,
  autoHourly: false,
  activeDetailTable: null,
  checkinCount: { male: 0, female: 0 },
  // TODO(backend): 데모용 시드 데이터. 실제로는 GET /api/admin/tables (인증 필요)로 대체.
  // 지금은 사용자 페이지(script.js)의 occupiedTables와도 완전히 분리된 별개의 mock 데이터임 — 같은 서버 데이터 소스로 통일 필요.
  tables: {
    1: null,
    2: null,
    3: { members: ['수현', '지훈'], male: 1, female: 1, seconds: 5 * 60 + 12, checkedInAt: '20:41' },
    4: null,
    5: null,
    6: null,
    7: { members: ['서연'], male: 0, female: 1, seconds: 2 * 60 + 40, checkedInAt: '20:58' },
    8: { members: ['도윤', '채원', '민지'], male: 1, female: 2, seconds: 8 * 60 + 5, checkedInAt: '20:12' },
    9: null,
    10: null,
  },
};

function showToast(msg) {
  const t = el('admin-toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ---------- 로그인 (localStorage에 저장 — 로그아웃 전까지 새로고침/재부팅해도 유지) ----------
// TODO(backend): 지금은 로그인 여부만 localStorage 플래그로 기억함(서버 검증 없음, 누구나 콘솔에서 조작 가능).
// 실제로는 POST /api/admin/login으로 받은 JWT를 저장하고, 매 관리자 API 요청마다 그 토큰을 실어 보내서
// 서버가 유효성을 검증하도록 해야 함(토큰 만료 시 재로그인 처리도 필요).
const ADMIN_LOGIN_KEY = 'piumAdminLoggedIn';

el('login-btn').addEventListener('click', attemptLogin);
el('admin-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });

function enterAdmin() {
  el('screen-login').classList.remove('active');
  el('screen-admin').classList.add('active');
  renderAll();
  startClock();
}

function attemptLogin() {
  const id = el('admin-id').value.trim();
  const pw = el('admin-pw').value.trim();
  if (id !== ADMIN_ID || pw !== ADMIN_PW) {
    showToast('아이디 또는 비밀번호가 올바르지 않아요');
    return;
  }
  localStorage.setItem(ADMIN_LOGIN_KEY, 'true');
  enterAdmin();
}

el('logout-btn').addEventListener('click', () => {
  localStorage.removeItem(ADMIN_LOGIN_KEY);
  el('screen-admin').classList.remove('active');
  el('screen-login').classList.add('active');
});

// ---------- 탭 전환 ----------
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    el(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ---------- 상단 통계 ----------
function renderStats() {
  const occupied = Object.values(state.tables).filter(Boolean);
  const totalPeople = occupied.reduce((sum, t) => sum + t.male + t.female, 0);
  el('stat-occupied').textContent = `${occupied.length}/${Object.keys(state.tables).length}`;
  el('stat-people').textContent = `${totalPeople}명`;
  el('stat-game').textContent = state.autoHourly ? '자동 방송 켜짐' : '대기중';
}

// ---------- 테이블 그리드 ----------
function renderTableGrid() {
  const grid = el('table-grid');
  grid.innerHTML = Object.keys(state.tables).map(num => {
    const t = state.tables[num];
    if (!t) {
      return `
        <div class="table-card" data-table="${num}">
          <div class="table-card-num">TABLE ${num}</div>
          <div class="table-card-status">비어있음</div>
          <div class="table-card-meta"><span>-</span><span>-</span></div>
        </div>`;
    }
    return `
      <div class="table-card occupied" data-table="${num}">
        <div class="table-card-num">TABLE ${num}</div>
        <div class="table-card-status">사용중 · ${t.members.length}명</div>
        <div class="table-card-meta">
          <span>입실 ${t.checkedInAt}</span>
          <span class="table-card-timer">${formatTime(t.seconds)}</span>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.table-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.table));
  });
}

// ---------- 테이블 상세 패널 ----------
function openDetail(num) {
  state.activeDetailTable = num;
  const t = state.tables[num];
  el('detail-title').textContent = `TABLE ${num}`;

  if (!t) {
    state.checkinCount = { male: 0, female: 0 };
    el('detail-body').innerHTML = `
      <div class="detail-empty" style="padding:10px 0 20px;">아직 아무도 입실하지 않은 테이블이에요</div>
      <div class="detail-section">
        <div class="detail-label">입실 처리</div>
        <div class="admin-stepper-row">
          <span>남자</span>
          <div class="admin-stepper">
            <button type="button" class="admin-step-btn" data-g="male" data-d="-1">−</button>
            <span id="checkin-male" class="admin-step-value">0</span>
            <button type="button" class="admin-step-btn" data-g="male" data-d="1">+</button>
          </div>
        </div>
        <div class="admin-stepper-row">
          <span>여자</span>
          <div class="admin-stepper">
            <button type="button" class="admin-step-btn" data-g="female" data-d="-1">−</button>
            <span id="checkin-female" class="admin-step-value">0</span>
            <button type="button" class="admin-step-btn" data-g="female" data-d="1">+</button>
          </div>
        </div>
        <input id="checkin-nickname" class="field" style="margin-top:10px;" placeholder="닉네임 (선택, 비우면 '게스트')">
        <button id="checkin-btn" class="btn-dark full" style="margin-top:10px;">입실 처리</button>
      </div>
    `;
    el('detail-body').querySelectorAll('.admin-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = btn.dataset.g;
        const d = parseInt(btn.dataset.d, 10);
        state.checkinCount[g] = Math.max(0, Math.min(9, state.checkinCount[g] + d));
        el(`checkin-${g}`).textContent = state.checkinCount[g];
      });
    });
    // TODO(backend): 입실/연장/초기화/퇴실 처리가 전부 로컬 state만 바꾸고 새로고침하면 사라짐.
    // ⚠️ 퇴실만 POST /api/admin/tables/:tableId/checkout로 문서화되어 있고, "관리자가 수동으로 입실 처리/연장/초기화"하는
    // API는 REST_API.md에 없음 — 입장은 참가자가 QR로 직접 하는 흐름(POST /api/tables/:tableId/enter)이라
    // 이 관리자 수동 입실/연장/초기화 기능 자체가 필요한지 백엔드팀과 먼저 확인해야 함.
    el('checkin-btn').addEventListener('click', () => {
      const { male, female } = state.checkinCount;
      if (male + female === 0) {
        showToast('인원을 1명 이상 선택해주세요');
        return;
      }
      const nickname = el('checkin-nickname').value.trim() || '게스트';
      const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      state.tables[num] = { members: [nickname], male, female, seconds: 5 * 60, checkedInAt: now };
      renderTableGrid();
      renderStats();
      openDetail(num);
      showToast(`TABLE ${num} 입실 처리 완료`);
    });
  } else {
    el('detail-body').innerHTML = `
      <div class="detail-section">
        <div class="detail-label">이용자 (${t.members.length}명 · 남${t.male} 여${t.female})</div>
        <div class="member-list">${t.members.map(m => `<span class="chip">${m}</span>`).join('')}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">이용 시간</div>
        <div class="detail-timer">${formatTime(t.seconds)}</div>
        <div class="detail-btn-row">
          <button class="detail-btn" data-action="extend">+10분 연장</button>
          <button class="detail-btn" data-action="reset">초기화</button>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-label">입실 시각</div>
        <div style="font-size:13px;">${t.checkedInAt}</div>
      </div>
      <div class="detail-section">
        <button class="detail-btn danger" data-action="checkout" style="width:100%;">퇴실 처리 (좌석 비우기)</button>
      </div>
    `;
    // TODO(backend): +10분 연장 / 초기화 API도 REST_API.md에 없음 — 필요하면 백엔드팀에 추가 요청.
    el('detail-body').querySelector('[data-action="extend"]').addEventListener('click', () => {
      t.seconds += 600;
      renderTableGrid();
      openDetail(num);
      showToast(`TABLE ${num} 이용시간을 10분 연장했어요`);
    });
    el('detail-body').querySelector('[data-action="reset"]').addEventListener('click', () => {
      t.seconds = 5 * 60;
      renderTableGrid();
      openDetail(num);
      showToast(`TABLE ${num} 이용시간을 초기화했어요`);
    });
    // TODO(backend): 퇴실 처리는 POST /api/admin/tables/:tableId/checkout (인증 필요)로 교체.
    el('detail-body').querySelector('[data-action="checkout"]').addEventListener('click', () => {
      state.tables[num] = null;
      renderTableGrid();
      renderStats();
      closeDetail();
      showToast(`TABLE ${num} 퇴실 처리 완료`);
    });
  }

  el('detail-overlay').classList.add('show');
  el('detail-panel').classList.add('show');
}

function closeDetail() {
  el('detail-overlay').classList.remove('show');
  el('detail-panel').classList.remove('show');
  state.activeDetailTable = null;
}
el('detail-close').addEventListener('click', closeDetail);
el('detail-overlay').addEventListener('click', closeDetail);

// ---------- 실시간 타이머 ----------
function startClock() {
  setInterval(() => {
    let changed = false;
    Object.values(state.tables).forEach(t => {
      if (t && t.seconds > 0) { t.seconds -= 1; changed = true; }
    });
    if (changed) {
      renderTableGrid();
      if (state.activeDetailTable && state.tables[state.activeDetailTable]) {
        const timerEl = document.querySelector('.detail-timer');
        if (timerEl) timerEl.textContent = formatTime(state.tables[state.activeDetailTable].seconds);
      }
    }
  }, 1000);
}

// ---------- 게임 관리 ----------
function renderGameList() {
  el('game-list').innerHTML = GAMES.map(g => `
    <div class="game-option ${g.id === state.selectedGame ? 'selected' : ''}" data-game="${g.id}">
      <span class="game-option-name">${g.name}</span>
      <span class="game-option-level">${g.level}</span>
    </div>
  `).join('');

  document.querySelectorAll('.game-option').forEach(opt => {
    opt.addEventListener('click', () => {
      state.selectedGame = opt.dataset.game;
      renderGameList();
    });
  });
}

// TODO(backend): 지금은 관리자 화면에 로그만 남기고 끝 — 실제 사용자에게는 아무것도 전달되지 않음.
// 실제로는 socket.emit('game:global:start', { type: game.id, state? })로 보내고,
// 서버가 모든 참가자에게 game:global:started를 push. 참가자 응답은 game:action, 관리자는 game:global:state로 응답 상태 확인,
// 종료는 game:global:end → 참가자에게 game:global:ended. (docs/SOCKET_API.md "관리자 단체 게임" 표 참고)
el('broadcast-btn').addEventListener('click', () => {
  const game = GAMES.find(g => g.id === state.selectedGame);
  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const log = el('game-log');
  const empty = log.querySelector('.game-log-empty');
  if (empty) empty.remove();
  const item = document.createElement('div');
  item.className = 'game-log-item';
  item.innerHTML = `<b>${game.name}</b> 전체 방송 · ${time}`;
  log.prepend(item);
  showToast(`"${game.name}" 게임을 모든 참여자에게 방송했어요`);
});

el('auto-toggle').addEventListener('change', (e) => {
  state.autoHourly = e.target.checked;
  renderStats();
  showToast(state.autoHourly ? '매시 정각 자동 방송이 켜졌어요' : '자동 방송이 꺼졌어요');
});

// ---------- 신청곡 (사용자 페이지와 localStorage로 공유) ----------
const SONG_REQUEST_KEY = 'piumSongRequests';

function loadSongRequests() {
  return JSON.parse(localStorage.getItem(SONG_REQUEST_KEY) || '[]');
}

function renderSongRequests() {
  const requests = loadSongRequests();
  const badge = el('song-nav-badge');
  badge.textContent = requests.length;
  badge.dataset.zero = requests.length === 0 ? 'true' : 'false';

  const list = el('song-request-list');
  if (requests.length === 0) {
    list.innerHTML = `<div class="song-empty">아직 받은 신청곡이 없어요</div>`;
    return;
  }

  list.innerHTML = requests.map(r => `
    <div class="song-item" data-id="${r.id}">
      <div class="song-item-info">
        <div class="song-item-title">${r.song}</div>
        <div class="song-item-meta">TABLE ${r.table ?? '-'} · ${r.nickname} · ${r.time}</div>
      </div>
      <button type="button" class="song-done-btn" data-id="${r.id}">완료</button>
    </div>
  `).join('');

  list.querySelectorAll('.song-done-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const remaining = loadSongRequests().filter(r => r.id !== id);
      localStorage.setItem(SONG_REQUEST_KEY, JSON.stringify(remaining));
      renderSongRequests();
    });
  });
}

// 사용자 쪽에서 새 신청곡이 들어오면 (다른 탭에서 localStorage 변경) 자동으로 갱신
window.addEventListener('storage', (e) => {
  if (e.key === SONG_REQUEST_KEY) renderSongRequests();
});

function renderAll() {
  renderStats();
  renderTableGrid();
  renderGameList();
  renderSongRequests();
}

// 페이지 로드 시 이미 로그인되어 있으면 로그인 화면 건너뛰기
// (파일 맨 끝에 둬야 위에서 쓰는 함수/상수들이 모두 정의된 뒤에 실행됨)
if (localStorage.getItem(ADMIN_LOGIN_KEY) === 'true') {
  enterAdmin();
}
