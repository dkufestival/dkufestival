import './map-data.js?v=2';
const DEFAULT_MAP = globalThis.PINBALL_MAP;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const staticCanvas = document.createElement('canvas');
const staticCtx = staticCanvas.getContext('2d');
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
let lastFrameAt = performance.now();
let canvasRatio = 1;
let staticLayerDirty = true;
const ballSpriteCache = new Map();

const INTERPOLATION_DELAY = 100;
const MAX_SNAPSHOT_BUFFER = 10;
const SNAPSHOT_RESET_GAP = 500;
const POSITION_SNAP_DISTANCE = 100;
const CAMERA_FOLLOW_SPEED = 7;
const CAMERA_LEADER_HOLD_MS = 180;
const FINISH_TRANSITION_MS = 350;
const ELIMINATION_TRANSITION_MS = 350;
const RENDER_MARGIN = 80;

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
  canvasRatio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(displayWidth * canvasRatio);
  canvas.height = Math.round(displayHeight * canvasRatio);
  renderScale = displayWidth / BOARD_WIDTH;
  viewportHeight = displayHeight / renderScale;
  if (!pegs.length) buildMap();
  staticLayerDirty = true;
}

function buildMap() {
  staticLayerDirty = true;
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
    staticLayerDirty = true;
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
    staticLayerDirty = true;
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
    staticLayerDirty = true;
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

function drawLine(target, x1, y1, x2, y2, color, size) {
  target.beginPath(); target.moveTo(x1, y1); target.lineTo(x2, y2);
  target.strokeStyle = color; target.lineWidth = size; target.lineCap = 'round'; target.stroke();
}

function line(x1, y1, x2, y2, color, size) {
  drawLine(ctx, x1, y1, x2, y2, color, size);
}

function rebuildStaticLayer() {
  staticCanvas.width = Math.ceil(width * canvasRatio);
  staticCanvas.height = Math.ceil(height * canvasRatio);
  staticCtx.setTransform(canvasRatio, 0, 0, canvasRatio, 0, 0);
  staticCtx.clearRect(0, 0, width, height);
  pegs.forEach((peg) => {
    staticCtx.beginPath(); staticCtx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
    staticCtx.fillStyle = '#edf0ff'; staticCtx.shadowColor = '#7890ff'; staticCtx.shadowBlur = 9; staticCtx.fill(); staticCtx.shadowBlur = 0;
  });
  sideBumpers.forEach((bumper) => {
    staticCtx.beginPath(); staticCtx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
    staticCtx.fillStyle = '#70efff'; staticCtx.shadowColor = '#3bc9ff'; staticCtx.shadowBlur = 12; staticCtx.fill(); staticCtx.shadowBlur = 0;
  });
  rails.forEach(([x1, y1, x2, y2]) => drawLine(staticCtx, x1, y1, x2, y2, '#7287c7', 8));
  sideWalls.forEach(([x1, y1, x2, y2]) => drawLine(staticCtx, x1, y1, x2, y2, '#90a6e8', 10));
  staticLayerDirty = false;
}

function createBallSprite(ball) {
  const padding = 14;
  const size = ball.radius * 2 + padding * 2;
  const scale = 2;
  const sprite = document.createElement('canvas');
  sprite.width = Math.ceil(size * scale);
  sprite.height = Math.ceil(size * scale);
  const spriteCtx = sprite.getContext('2d');
  spriteCtx.setTransform(scale, 0, 0, scale, 0, 0);
  const center = size / 2;
  spriteCtx.beginPath(); spriteCtx.arc(center, center, ball.radius, 0, Math.PI * 2);
  spriteCtx.fillStyle = ball.color; spriteCtx.shadowColor = ball.color; spriteCtx.shadowBlur = 12; spriteCtx.fill(); spriteCtx.shadowBlur = 0;
  spriteCtx.fillStyle = '#08090d'; spriteCtx.font = `900 ${Math.max(5, ball.radius * .72)}px sans-serif`;
  spriteCtx.textAlign = 'center'; spriteCtx.textBaseline = 'middle'; spriteCtx.fillText(ball.name, center, center + .5, ball.radius * 1.7);
  return { key: `${ball.color}|${ball.name}|${ball.radius}`, sprite, size };
}

function ballSprite(ball) {
  const key = `${ball.color}|${ball.name}|${ball.radius}`;
  let cached = ballSpriteCache.get(ball.id);
  if (!cached || cached.key !== key) {
    cached = createBallSprite(ball);
    ballSpriteCache.set(ball.id, cached);
  }
  return cached;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function drawBallSprite(ball, opacity = 1, scale = 1, glow = 0) {
  const cached = ballSprite(ball);
  if (opacity === 1 && scale === 1 && glow === 0) {
    ctx.drawImage(cached.sprite, ball.x - cached.size / 2, ball.y - cached.size / 2, cached.size, cached.size);
    return;
  }
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(ball.x, ball.y);
  ctx.scale(scale, scale);
  if (glow > 0) {
    ctx.shadowColor = ball.color;
    ctx.shadowBlur = glow;
  }
  ctx.drawImage(cached.sprite, -cached.size / 2, -cached.size / 2, cached.size, cached.size);
  ctx.restore();
}

function terminalState(ball) {
  if (ball.finished) return 'finished';
  if (ball.eliminated) return 'eliminated';
  return null;
}

function syncBallTransitions(snapshot, receivedAt) {
  const isInitialSnapshot = !hasReceivedAuthoritativeSnapshot;
  for (const ball of snapshot.balls) {
    const nextState = terminalState(ball);
    const previousState = authoritativeTerminalStates.get(ball.id);
    if (!isInitialSnapshot && !previousState && nextState) {
      ballTransitions.set(ball.id, {
        ball: { ...ball },
        type: nextState,
        startedAt: receivedAt,
        duration: nextState === 'finished' ? FINISH_TRANSITION_MS : ELIMINATION_TRANSITION_MS,
      });
      if (cameraLeader?.id === ball.id) {
        heldCameraLeader = { ...ball };
        cameraLeaderHoldUntil = receivedAt + CAMERA_LEADER_HOLD_MS;
      }
    }
    authoritativeTerminalStates.set(ball.id, nextState);
  }
  hasReceivedAuthoritativeSnapshot = true;
}

function drawTerminalTransitions(now, minY, maxY) {
  for (const [id, transition] of ballTransitions) {
    const progress = Math.min(1, Math.max(0, (now - transition.startedAt) / transition.duration));
    if (progress >= 1) {
      ballTransitions.delete(id);
      continue;
    }
    const ball = transition.ball;
    if (ball.y + ball.radius < minY || ball.y - ball.radius > maxY) continue;
    const eased = easeOutCubic(progress);
    const scale = transition.type === 'finished'
      ? 1 + .08 * Math.sin(progress * Math.PI) - .18 * eased
      : 1 - .25 * eased;
    const glow = 10 * Math.sin(progress * Math.PI);
    drawBallSprite(ball, 1 - eased, scale, glow);
  }
  if (clearBallSpriteCacheAfterTransitions && ballTransitions.size === 0) {
    ballSpriteCache.clear();
    clearBallSpriteCacheAfterTransitions = false;
  }
}

function draw(now) {
  if (staticLayerDirty) rebuildStaticLayer();
  const ratio = canvasRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#06070b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(renderScale * ratio, 0, 0, renderScale * ratio, 0, -cameraY * renderScale * ratio);
  const gradient = ctx.createLinearGradient(0, cameraY, 0, cameraY + viewportHeight);
  gradient.addColorStop(0, '#171b31'); gradient.addColorStop(1, '#06070b');
  ctx.fillStyle = gradient; ctx.fillRect(0, cameraY, width, viewportHeight + 2);
  const sourceY = Math.max(0, Math.floor(cameraY * canvasRatio));
  const sourceHeight = Math.min(staticCanvas.height - sourceY, Math.ceil(viewportHeight * canvasRatio));
  if (sourceHeight > 0) ctx.drawImage(staticCanvas, 0, sourceY, staticCanvas.width, sourceHeight, 0, cameraY, width, sourceHeight / canvasRatio);
  const minY = cameraY - RENDER_MARGIN;
  const maxY = cameraY + viewportHeight + RENDER_MARGIN;
  spinners.forEach((spinner) => {
    if (spinner.y + spinner.length / 2 < minY || spinner.y - spinner.length / 2 > maxY) return;
    const angle = spinner.phase + simulationTime * spinner.speed;
    const dx = Math.cos(angle) * spinner.length / 2;
    const dy = Math.sin(angle) * spinner.length / 2;
    line(spinner.x - dx, spinner.y - dy, spinner.x + dx, spinner.y + dy, '#ffdf57', 8);
    ctx.beginPath(); ctx.arc(spinner.x, spinner.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  });
  const bladeAngle = simulationTime * 3;
  const bladeX = width / 2;
  const bladeY = height - 126;
  if (bladeY >= minY && bladeY <= maxY) {
    for (let arm = 0; arm < 1; arm += 1) {
      const angle = bladeAngle;
      const tipX = bladeX + Math.cos(angle) * 46;
      const tipY = bladeY + Math.sin(angle) * 46;
      line(bladeX, bladeY, tipX, tipY, '#f1f3ff', 10);
      line(bladeX + Math.cos(angle) * 28, bladeY + Math.sin(angle) * 28, tipX, tipY, '#ff405d', 3);
    }
    ctx.beginPath(); ctx.arc(bladeX, bladeY, 11, 0, Math.PI * 2); ctx.fillStyle = '#ff405d'; ctx.fill();
  }
  const funnelTop = height - 190;
  const exitHalf = Math.max(24, (balls[0]?.radius || 10) * 2.4);
  if (funnelTop <= maxY) {
    line(5, funnelTop, width / 2 - exitHalf, height - 42, '#90a6e8', 10);
    line(width - 5, funnelTop, width / 2 + exitHalf, height - 42, '#90a6e8', 10);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(width / 2, height - 30, exitHalf, 12, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (const ball of balls) {
    if (ball.finished || ball.eliminated || ball.y + ball.radius < minY || ball.y - ball.radius > maxY) continue;
    drawBallSprite(ball);
  }
  if (!editMode) drawTerminalTransitions(now, minY, maxY);
  if (editMode) {
    ctx.fillStyle = 'rgba(112,239,255,.75)';
    ctx.font = '700 12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`편집 위치 ${Math.round(cameraY)} / ${height}`, 28, cameraY + viewportHeight - 22);
  }
}

const gameId = Number(params.get('gameId'));
let lastSnapshotSeq = -1;
let latestSnapshot = null;
let snapshotBuffer = [];
let rankingSignature = '';
const ballTransitions = new Map();
const authoritativeTerminalStates = new Map();
let hasReceivedAuthoritativeSnapshot = false;
let cameraLeader = null;
let heldCameraLeader = null;
let cameraLeaderHoldUntil = 0;
let clearBallSpriteCacheAfterTransitions = false;

function ballsHaveMatchingIds(before, after) {
  if (before.length !== after.length) return false;
  const beforeIds = new Set(before.map((ball) => ball.id));
  return after.every((ball) => beforeIds.has(ball.id));
}

function ballTerminalStateChanged(before, after) {
  const beforeById = new Map(before.map((ball) => [ball.id, ball]));
  return after.some((ball) => {
    const previous = beforeById.get(ball.id);
    return previous && Boolean(previous.finished || previous.eliminated) !== Boolean(ball.finished || ball.eliminated);
  });
}

function shouldResetSnapshotBuffer(snapshot) {
  const previous = snapshotBuffer.at(-1)?.snapshot;
  if (!previous) return true;
  const serverGap = snapshot.serverTime - previous.serverTime;
  return serverGap <= 0
    || serverGap > SNAPSHOT_RESET_GAP
    || snapshot.status !== previous.status
    || snapshot.status !== 'running'
    || !ballsHaveMatchingIds(previous.balls, snapshot.balls)
    || ballTerminalStateChanged(previous.balls, snapshot.balls);
}

function updateRanking(snapshot) {
  const nextSignature = [
    ...snapshot.result.finishOrder.map((ball) => `f:${ball.id}`),
    ...snapshot.result.eliminatedOrder.map((ball) => `e:${ball.id}`),
  ].join('|');
  if (nextSignature === rankingSignature) return;
  rankingSignature = nextSignature;
  rankingNode.replaceChildren(...[
    ...snapshot.result.finishOrder.map(ball => ({ ball, eliminated: false })),
    ...snapshot.result.eliminatedOrder.map(ball => ({ ball, eliminated: true })),
  ].map(({ ball, eliminated }) => {
    const li = document.createElement('li');
    li.textContent = `${eliminated ? '탈락 · ' : ''}${ball.name}`;
    if (eliminated) li.style.color = '#ff7187';
    return li;
  }));
}

function applySnapshot(snapshot) {
  if (snapshot?.gameId !== gameId || !Number.isSafeInteger(snapshot.seq) || snapshot.seq <= lastSnapshotSeq) return;
  const receivedAt = performance.now();
  syncBallTransitions(snapshot, receivedAt);
  if (shouldResetSnapshotBuffer(snapshot)) snapshotBuffer = [];
  snapshotBuffer.push({ snapshot, receivedAt });
  if (snapshotBuffer.length > MAX_SNAPSHOT_BUFFER) snapshotBuffer.shift();
  latestSnapshot = snapshot;
  if (snapshot.status === 'finished') clearBallSpriteCacheAfterTransitions = true;
  if (snapshot.status === 'cancelled') {
    ballTransitions.clear();
    authoritativeTerminalStates.clear();
    heldCameraLeader = null;
    cameraLeaderHoldUntil = 0;
    ballSpriteCache.clear();
  }
  lastSnapshotSeq = snapshot.seq;
  simulationSteps = snapshot.step;
  finishOrder = snapshot.result.finishOrder;
  eliminatedOrder = snapshot.result.eliminatedOrder;
  updateRanking(snapshot);
  if (snapshot.result.winner) announceWinner(snapshot.result.winner);
  const statusText = snapshot.status === 'finished' ? (finishOrder.length ? '레이스 종료' : '전원 탈락')
    : snapshot.status === 'cancelled' ? '경기가 중단되었습니다'
    : snapshot.status === 'waiting' ? '곧 시작합니다' : '레이스 진행 중';
  if (statusNode.textContent !== statusText) statusNode.textContent = statusText;
}
addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'pinball:state') return;
  applySnapshot(event.data.snapshot);
});
if (!editMode && gameId) parent.postMessage({ type: 'pinball:ready', gameId }, location.origin);
function getRenderSnapshots(now) {
  const latest = snapshotBuffer.at(-1);
  if (!latest) return null;
  const renderServerTime = latest.snapshot.serverTime + (now - latest.receivedAt) - INTERPOLATION_DELAY;
  if (renderServerTime <= snapshotBuffer[0].snapshot.serverTime) return { next: snapshotBuffer[0].snapshot, previous: null, alpha: 1 };
  for (let index = 1; index < snapshotBuffer.length; index += 1) {
    const next = snapshotBuffer[index].snapshot;
    if (renderServerTime <= next.serverTime) {
      const previous = snapshotBuffer[index - 1].snapshot;
      const alpha = (renderServerTime - previous.serverTime) / Math.max(1, next.serverTime - previous.serverTime);
      return { previous, next, alpha: Math.max(0, Math.min(1, alpha)) };
    }
  }
  return { next: latest.snapshot, previous: null, alpha: 1 };
}

function renderSnapshot(now) {
  const selection = getRenderSnapshots(now);
  if (!selection) return;
  const { previous, next, alpha } = selection;
  const blend = previous && previous.status === 'running' && next.status === 'running';
  simulationTime = blend ? previous.simulationTime + (next.simulationTime - previous.simulationTime) * alpha : next.simulationTime;
  if (!blend) {
    balls = next.balls;
    return;
  }
  const previousBallsById = new Map(previous.balls.map((ball) => [ball.id, ball]));
  balls = next.balls.map((ball) => {
    const before = previousBallsById.get(ball.id);
    if (!before || ball.finished || ball.eliminated || before.finished || before.eliminated
      || Math.hypot(ball.x - before.x, ball.y - before.y) > POSITION_SNAP_DISTANCE) return ball;
    return { ...ball, x: before.x + (ball.x - before.x) * alpha, y: before.y + (ball.y - before.y) * alpha };
  });
}

function frame(now = performance.now()) {
  const deltaSeconds = Math.min(.1, Math.max(0, (now - lastFrameAt) / 1000));
  lastFrameAt = now;
  if (latestSnapshot) renderSnapshot(now);
  let activeLeader = null;
  for (const ball of balls) {
    if (!ball.finished && !ball.eliminated && (!activeLeader || ball.y > activeLeader.y)) activeLeader = ball;
  }
  const leader = heldCameraLeader && now < cameraLeaderHoldUntil ? heldCameraLeader : activeLeader;
  if (now >= cameraLeaderHoldUntil) heldCameraLeader = null;
  if (activeLeader) cameraLeader = activeLeader;
  const targetCamera = Math.max(0, Math.min(height - viewportHeight, (leader?.y || height) - viewportHeight * .38));
  if (!editMode) {
    const smoothing = 1 - Math.exp(-CAMERA_FOLLOW_SPEED * deltaSeconds);
    cameraY += (targetCamera - cameraY) * smoothing;
  }
  draw(now);
  requestAnimationFrame(frame);
}

addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
resize();
setupEditor();
if (!editMode) statusNode.textContent = '서버 경기 상태를 기다리는 중...';
requestAnimationFrame(frame);
