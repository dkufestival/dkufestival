import { $, clear, text } from './dom.js';
import { initMapZoom } from './mapzoom.js';
import { monitorApi } from './monitor-api.js';

const state = { tables: [], loading: false, mapZoom: null };
const POLL_INTERVAL_MS = 12_000;
const ENDING_SOON_MS = 20 * 60 * 1000;
const TOTAL_ROWS = 12;

function remaining(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  const prefix = ms < 0 ? '시간 초과 ' : '';
  const seconds = Math.floor(Math.abs(ms) / 1000);
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${prefix}${h}:${m}:${s}`;
}

function rotateSlotClockwise(row, col) { return { row: col, col: TOTAL_ROWS + 1 - row }; }

function renderSummary() {
  const occupied = state.tables.filter((table) => table.activeSession);
  const people = occupied.reduce((total, table) => total + table.activeSession.totalCount, 0);
  const urgent = occupied.filter((table) => new Date(table.activeSession.expiresAt).getTime() - Date.now() <= ENDING_SOON_MS);
  $('stat-total').textContent = state.tables.length;
  $('stat-occupied').textContent = occupied.length;
  $('stat-people').textContent = `${people}명`;
  $('stat-urgent').textContent = urgent.length;
}

function initMap() {
  if (state.mapZoom) return;
  state.mapZoom = initMapZoom({ viewport: $('monitor-map-viewport'), canvas: $('monitor-map-canvas'), minScale: 1, maxScale: 3, zoomedThreshold: 1.6, reserveBottom: 26, viewSelector: '#monitor-map-view' });
  $('monitor-map-zoom-in').addEventListener('click', () => state.mapZoom.zoomIn());
  $('monitor-map-zoom-out').addEventListener('click', () => state.mapZoom.zoomOut());
  $('monitor-map-zoom-reset').addEventListener('click', () => state.mapZoom.reset());
}

function renderMap() {
  initMap();
  const canvas = $('monitor-map-canvas');
  clear(canvas);
  const zone = (className, row, col) => { const node = text('div', `monitor-map-zone ${className}`, ''); node.style.gridRow = row; node.style.gridColumn = col; canvas.appendChild(node); };
  const top = rotateSlotClockwise(1, 1); zone('top', `${top.row} / 8`, String(top.col));
  const left = rotateSlotClockwise(2, 1); const leftEnd = rotateSlotClockwise(4, 1); zone('left', String(left.row), `${leftEnd.col} / ${left.col + 1}`);
  const right = rotateSlotClockwise(2, 8); const rightEnd = rotateSlotClockwise(4, 8); const entrance = text('div', 'monitor-map-zone right', ''); entrance.style.gridRow = String(right.row); entrance.style.gridColumn = `${rightEnd.col} / ${right.col + 1}`; entrance.appendChild(text('div', 'entrance-label', '입구')); canvas.appendChild(entrance);
  const bottom = [75, 76, 77, 78, 79, 80]; const blocked = { 1: [1, 8], 2: [1, 8], 3: [1, 8] }; let row = 1; let col = 1; let bottomRow = null;
  const next = () => { while (true) { if (col > 8) { row += 1; col = 1; } if ((blocked[row] || []).includes(col)) { col += 1; continue; } return { row: row + 1, col: col++ }; } };
  state.tables.forEach((table) => {
    const isBottom = bottom.includes(table.tableNumber);
    const original = isBottom ? { row: bottomRow ??= row + 2, col: bottom.indexOf(table.tableNumber) + 2 } : next();
    const slot = rotateSlotClockwise(original.row, original.col);
    const session = table.activeSession;
    const isUrgent = session && new Date(session.expiresAt).getTime() - Date.now() <= ENDING_SOON_MS;
    const cell = document.createElement('div');
    cell.className = `monitor-table ${session ? 'occupied' : ''}${isUrgent ? ' urgent' : ''}`;
    cell.style.gridRow = String(slot.row); cell.style.gridColumn = String(slot.col);
    cell.appendChild(text('div', 'table-number', String(table.tableNumber).padStart(2, '0')));
    cell.appendChild(text('div', 'table-status', session ? `사용 중 · ${session.totalCount}명` : '비어 있음'));
    if (session) { cell.appendChild(text('div', 'table-meta', `남${session.maleCount} / 여${session.femaleCount}`)); cell.appendChild(text('div', 'table-timer', remaining(session.expiresAt))); }
    canvas.appendChild(cell);
  });
  state.mapZoom.refreshMinScale();
}

function render() { renderSummary(); renderMap(); }
function setStatus(message, error = false) { $('monitor-status').textContent = message; $('monitor-status').classList.toggle('error', error); $('retry-button').hidden = !error; }
async function refresh() {
  if (state.loading || document.visibilityState === 'hidden') return;
  state.loading = true; $('connection-status').textContent = '갱신 중';
  try {
    state.tables = await monitorApi.list();
    if (!state.tables.length) setStatus('등록된 테이블이 없습니다.'); else setStatus('');
    $('map-section').hidden = !state.tables.length;
    render(); $('updated-at').textContent = `마지막 갱신: ${new Date().toLocaleTimeString('ko-KR')}`; $('connection-status').textContent = '정상 연결';
  } catch {
    setStatus('테이블 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', true); $('connection-status').textContent = '재연결 중';
  } finally { state.loading = false; }
}

setInterval(() => { if (state.tables.length) render(); }, 1000);
setInterval(refresh, POLL_INTERVAL_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
$('retry-button').addEventListener('click', refresh);
refresh();
