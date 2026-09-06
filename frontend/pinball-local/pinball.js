import './map-data.js?v=2';
const DEFAULT_MAP = globalThis.PINBALL_MAP;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const statusNode = document.getElementById('status');
const rankingNode = document.getElementById('ranking');
const params = new URLSearchParams(location.search);
const editMode = params.get('edit') === '1' && !params.has('gameId');
const MAP_STORAGE_KEY = 'festival-pinball-map-v1';

const BOARD_WIDTH = 390;
const BOARD_HEIGHT = 1850;
let width = BOARD_WIDTH;
let height = BOARD_HEIGHT;
let pegs = [];
let spinners = [];
let rails = [];
let sideWalls = [];
let sideBumpers = [];
let balls = [];
let finishOrder = [];
let eliminatedOrder = [];
let simulationTime = 0;
let simulationSteps = 0;
let started = false;
let renderScale = 1;
let viewportHeight = 700;
let cameraY = 0;
let winnerAnnounced = false;

function announceWinner(ball) {
  if (winnerAnnounced) return;
  winnerAnnounced = true;
  document.getElementById('winner-name').textContent = ball.name;
  document.getElementById('winner-popup').hidden = false;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  // Hidden admin tabs can initially report a zero-sized canvas.
  const displayWidth = Math.max(1, rect.width);
  const displayHeight = Math.max(1, rect.height);
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(displayWidth * ratio);
  canvas.height = Math.round(displayHeight * ratio);
  renderScale = displayWidth / BOARD_WIDTH;
  viewportHeight = displayHeight / renderScale;
  if (!pegs.length) buildMap();
}

function buildMap() {
  pegs = [];
  const gapX = Math.max(42, width / 8);
  const gapY = 62;
  for (let row = 0; row < 24; row += 1) {
    const y = 150 + row * gapY;
    const offset = row % 2 ? gapX / 2 : 0;
    for (let x = gapX / 2 + offset; x < width; x += gapX) {
      if (x >= 62 && x <= width - 62) pegs.push({ x, y, radius: 5 });
    }
  }
  spinners = [
    { x: 150, y: 390, length: 78, speed: 2.2, phase: 0 },
    { x: 240, y: 690, length: 78, speed: -2.5, phase: 1.1 },
    { x: 195, y: 1010, length: 105, speed: 2.8, phase: .5 },
    { x: 145, y: 1320, length: 72, speed: -3.1, phase: .8 },
    { x: 245, y: 1490, length: 72, speed: 2.7, phase: 1.5 },
  ];
  rails = [
    [62, 520, 155, 555], [235, 555, 328, 520],
    [62, 820, 210, 870], [285, 870, 328, 840],
    [62, 1120, 115, 1155], [190, 1185, 328, 1135],
    [62, 1420, 155, 1460], [235, 1460, 328, 1420],
  ];
  sideWalls = [
    [5, 0, 5, height - 190],
    [width - 5, 0, width - 5, height - 190],
  ];
  sideBumpers = [
    { x: 44, y: 245, radius: 8 }, { x: width - 44, y: 335, radius: 8 },
    { x: 44, y: 470, radius: 8 }, { x: width - 44, y: 600, radius: 8 },
    { x: 44, y: 755, radius: 8 }, { x: width - 44, y: 925, radius: 8 },
    { x: 44, y: 1060, radius: 8 }, { x: width - 44, y: 1215, radius: 8 },
    { x: 44, y: 1370, radius: 8 }, { x: width - 44, y: 1535, radius: 8 },
  ];

  // 긴 장애물 주변은 점 장애물까지 겹치면 공이 끼므로 넉넉한 통로를 둔다.
  const distanceToSegment = (point, segment) => {
    const [x1, y1, x2, y2] = segment;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((point.x - x1) * dx + (point.y - y1) * dy) / lengthSquared));
    return Math.hypot(point.x - (x1 + dx * t), point.y - (y1 + dy * t));
  };
  pegs = pegs.filter((peg) => {
    const nearRail = rails.some((rail) => distanceToSegment(peg, rail) < 35);
    const nearSpinner = spinners.some((spinner) => (
      Math.hypot(peg.x - spinner.x, peg.y - spinner.y) < spinner.length / 2 + 32
    ));
    return !nearRail && !nearSpinner;
  });
  const builtInMap = JSON.parse(JSON.stringify(DEFAULT_MAP));
  pegs = builtInMap.pegs;
  sideBumpers = builtInMap.sideBumpers;
  spinners = builtInMap.spinners;
  rails = builtInMap.rails;
  try {
    const saved = editMode ? JSON.parse(localStorage.getItem(MAP_STORAGE_KEY)) : null;
    if (saved) {
      if (Array.isArray(saved.pegs)) pegs = saved.pegs;
      if (Array.isArray(saved.sideBumpers)) sideBumpers = saved.sideBumpers;
      if (Array.isArray(saved.spinners)) spinners = saved.spinners;
      if (Array.isArray(saved.rails)) rails = saved.rails;
    }
  } catch (_) { /* 손상된 임시 편집 데이터는 기본 맵으로 대체한다. */ }
}

function mapData() {
  return { pegs, sideBumpers, spinners, rails };
}

function setupEditor() {
  if (!editMode) return;
  document.body.classList.add('editing');
  const editor = document.getElementById('editor');
  const scroll = document.getElementById('editor-scroll');
  const help = document.getElementById('editor-help');
  editor.hidden = false;
  started = false;
  statusNode.textContent = '맵 편집 모드';
  let tool = 'select';
  let selected = null;
  let dragging = false;

  const entries = () => [
    ...pegs.map((item) => ({ type: 'peg', item })),
    ...sideBumpers.map((item) => ({ type: 'bumper', item })),
    ...spinners.map((item) => ({ type: 'spinner', item })),
    ...rails.map((item) => ({ type: 'rail', item })),
  ];
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(24, Math.min(width - 24, (event.clientX - rect.left) / renderScale)),
      y: Math.max(30, Math.min(height - 210, (event.clientY - rect.top) / renderScale + cameraY)),
    };
  };
  const center = (entry) => entry.type === 'rail'
    ? { x: (entry.item[0] + entry.item[2]) / 2, y: (entry.item[1] + entry.item[3]) / 2 }
    : entry.item;
  const selectNear = (p) => entries().map((entry) => ({ entry, distance: Math.hypot(p.x - center(entry).x, p.y - center(entry).y) }))
    .sort((a, b) => a.distance - b.distance).find((value) => value.distance < 34)?.entry || null;

  editor.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
    tool = button.dataset.tool;
    selected = null;
    editor.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('active', item === button));
    help.textContent = tool === 'select' ? '장애물을 선택한 뒤 드래그해서 이동하세요.' : '맵에서 원하는 위치를 클릭하세요.';
  }));
  canvas.addEventListener('pointerdown', (event) => {
    const p = point(event);
    if (tool === 'select') {
      selected = selectNear(p);
      dragging = Boolean(selected);
      canvas.setPointerCapture(event.pointerId);
      help.textContent = selected ? `${selected.type} 선택됨 · 드래그 이동 또는 선택 삭제` : '가까운 장애물이 없습니다.';
      return;
    }
    if (tool === 'peg') pegs.push({ ...p, radius: 5 });
    if (tool === 'bumper') sideBumpers.push({ ...p, radius: 8 });
    if (tool === 'spinner') spinners.push({ ...p, length: 76, speed: 2.2, phase: 0 });
    if (tool === 'rail') rails.push([p.x - 42, p.y, p.x + 42, p.y]);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || !selected) return;
    const p = point(event);
    if (selected.type === 'rail') {
      const old = center(selected);
      selected.item[0] += p.x - old.x; selected.item[2] += p.x - old.x;
      selected.item[1] += p.y - old.y; selected.item[3] += p.y - old.y;
    } else {
      selected.item.x = p.x; selected.item.y = p.y;
    }
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  scroll.max = Math.max(0, Math.round(height - viewportHeight));
  scroll.addEventListener('input', () => { cameraY = Number(scroll.value); });
  document.getElementById('editor-delete').addEventListener('click', () => {
    if (!selected) return;
    const collection = selected.type === 'peg' ? pegs : selected.type === 'bumper' ? sideBumpers : selected.type === 'spinner' ? spinners : rails;
    collection.splice(collection.indexOf(selected.item), 1);
    selected = null;
    help.textContent = '선택한 장애물을 삭제했습니다.';
  });
  document.getElementById('editor-save').addEventListener('click', () => {
    localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(mapData()));
    help.textContent = '이 브라우저에 저장했습니다. 일반 화면을 새로고침하면 미리보기됩니다.';
  });
  document.getElementById('editor-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(mapData(), null, 2));
    help.textContent = '맵 JSON을 복사했습니다.';
  });
  document.getElementById('editor-reset').addEventListener('click', () => {
    localStorage.removeItem(MAP_STORAGE_KEY);
    pegs = [];
    buildMap();
    selected = null;
    help.textContent = '기본 맵으로 초기화했습니다.';
  });
}

function line(x1, y1, x2, y2, color, size) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.stroke();
}

function draw() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#06070b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(renderScale * ratio, 0, 0, renderScale * ratio, 0, -cameraY * renderScale * ratio);
  const gradient = ctx.createLinearGradient(0, cameraY, 0, cameraY + viewportHeight);
  gradient.addColorStop(0, '#171b31'); gradient.addColorStop(1, '#06070b');
  ctx.fillStyle = gradient; ctx.fillRect(0, cameraY, width, viewportHeight + 2);
  pegs.forEach((peg) => {
    ctx.beginPath(); ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#edf0ff'; ctx.shadowColor = '#7890ff'; ctx.shadowBlur = 9; ctx.fill(); ctx.shadowBlur = 0;
  });
  sideBumpers.forEach((bumper) => {
    ctx.beginPath(); ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#70efff'; ctx.shadowColor = '#3bc9ff'; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
  });
  spinners.forEach((spinner) => {
    const angle = spinner.phase + simulationTime * spinner.speed;
    const dx = Math.cos(angle) * spinner.length / 2;
    const dy = Math.sin(angle) * spinner.length / 2;
    line(spinner.x - dx, spinner.y - dy, spinner.x + dx, spinner.y + dy, '#ffdf57', 8);
    ctx.beginPath(); ctx.arc(spinner.x, spinner.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  });
  rails.forEach(([x1, y1, x2, y2]) => line(x1, y1, x2, y2, '#7287c7', 8));
  sideWalls.forEach(([x1, y1, x2, y2]) => line(x1, y1, x2, y2, '#90a6e8', 10));
  const bladeAngle = simulationTime * 3;
  const bladeX = width / 2;
  const bladeY = height - 126;
  for (let arm = 0; arm < 1; arm += 1) {
    const angle = bladeAngle;
    const tipX = bladeX + Math.cos(angle) * 46;
    const tipY = bladeY + Math.sin(angle) * 46;
    line(bladeX, bladeY, tipX, tipY, '#f1f3ff', 10);
    line(bladeX + Math.cos(angle) * 28, bladeY + Math.sin(angle) * 28, tipX, tipY, '#ff405d', 3);
  }
  ctx.beginPath(); ctx.arc(bladeX, bladeY, 11, 0, Math.PI * 2); ctx.fillStyle = '#ff405d'; ctx.fill();
  const funnelTop = height - 190;
  const exitHalf = Math.max(24, (balls[0]?.radius || 10) * 2.4);
  line(5, funnelTop, width / 2 - exitHalf, height - 42, '#90a6e8', 10);
  line(width - 5, funnelTop, width / 2 + exitHalf, height - 42, '#90a6e8', 10);
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(width / 2, height - 30, exitHalf, 12, 0, 0, Math.PI * 2); ctx.fill();
  balls.filter((ball) => !ball.finished && !ball.eliminated).forEach((ball) => {
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color; ctx.shadowColor = ball.color; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#08090d'; ctx.font = `900 ${Math.max(5, ball.radius * .72)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ball.name, ball.x, ball.y + .5, ball.radius * 1.7);
  });
  if (editMode) {
    ctx.fillStyle = 'rgba(112,239,255,.75)';
    ctx.font = '700 12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`편집 위치 ${Math.round(cameraY)} / ${height}`, 28, cameraY + viewportHeight - 22);
  }
}

const gameId = Number(params.get('gameId'));
let lastSnapshotSeq = -1;
let latestSnapshot = null;
let previousSnapshot = null;
let receivedAt = 0;
function applySnapshot(snapshot) {
  if (snapshot?.gameId !== gameId || !Number.isSafeInteger(snapshot.seq) || snapshot.seq <= lastSnapshotSeq) return;
  previousSnapshot = latestSnapshot;
  latestSnapshot = snapshot;
  lastSnapshotSeq = snapshot.seq;
  receivedAt = performance.now();
  simulationSteps = snapshot.step;
  finishOrder = snapshot.result.finishOrder;
  eliminatedOrder = snapshot.result.eliminatedOrder;
  rankingNode.replaceChildren(...[
    ...finishOrder.map(ball => ({ ball, eliminated: false })),
    ...eliminatedOrder.map(ball => ({ ball, eliminated: true })),
  ].map(({ ball, eliminated }) => {
    const li = document.createElement('li');
    li.textContent = `${eliminated ? '탈락 · ' : ''}${ball.name}`;
    if (eliminated) li.style.color = '#ff7187';
    return li;
  }));
  if (snapshot.result.winner) announceWinner(snapshot.result.winner);
  statusNode.textContent = snapshot.status === 'finished' ? (finishOrder.length ? '레이스 종료' : '전원 탈락')
    : snapshot.status === 'cancelled' ? '경기가 중단되었습니다'
    : snapshot.status === 'waiting' ? '곧 시작합니다' : '레이스 진행 중';
}
addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'pinball:state') return;
  applySnapshot(event.data.snapshot);
});
if (!editMode && gameId) parent.postMessage({ type: 'pinball:ready', gameId }, location.origin);
function frame() {
  if (latestSnapshot) {
    const next = latestSnapshot;
    const prev = previousSnapshot;
    const gap = prev ? next.serverTime - prev.serverTime : 0;
    const blend = prev && gap > 0 && gap <= 250 && next.status === 'running';
    const alpha = blend ? Math.min(1, (performance.now() - receivedAt) / Math.min(gap, 100)) : 1;
    simulationTime = blend ? prev.simulationTime + (next.simulationTime - prev.simulationTime) * alpha : next.simulationTime;
    balls = next.balls.map((ball, index) => {
      const before = prev?.balls[index];
      if (!blend || !before || before.id !== ball.id || ball.finished || ball.eliminated
        || Math.hypot(ball.x - before.x, ball.y - before.y) > 100) return ball;
      return { ...ball, x: before.x + (ball.x - before.x) * alpha, y: before.y + (ball.y - before.y) * alpha };
    });
  }
  const leader = balls.filter((ball) => !ball.finished && !ball.eliminated).reduce((best, ball) => (!best || ball.y > best.y ? ball : best), null);
  const targetCamera = Math.max(0, Math.min(height - viewportHeight, (leader?.y || height) - viewportHeight * .38));
  if (!editMode) cameraY = targetCamera;
  draw();
  requestAnimationFrame(frame);
}

addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
resize();
setupEditor();
if (!editMode) statusNode.textContent = '서버 경기 상태를 기다리는 중...';
requestAnimationFrame(frame);
