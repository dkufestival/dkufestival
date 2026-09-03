import { API_BASE_URL, SOCKET_URL } from '../js/config.js';
import { getParticipantAuth } from '../js/auth.js';

const W = 390;
const H = 680;
const START = { x: 195, y: 590 };
const BALL_RADIUS = 23;
const GRAVITY = 0.31;
const BASE_RIM_Y = 194;
const BASE_RIM_WIDTH = 106;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreNode = document.getElementById('score');
const bestNode = document.getElementById('best-score');
const messageNode = document.getElementById('game-message');
const swipeGuide = document.getElementById('swipe-guide');
const courtNode = document.querySelector('.court');
const competitionStatusNode = document.getElementById('competition-status');
const leaderboardNode = document.getElementById('leaderboard-list');
const footerNode = document.getElementById('game-footer');
const participantAuth = getParticipantAuth();

let ball = freshBall();
let gestureSamples = [];
let dragging = false;
let launched = false;
let scoredThisShot = false;
let clearedRimFromAbove = false;
let depthSpeed = 0;
let resetFrames = 0;
let score = 0;
let best = Number(localStorage.getItem('festival-basketball-best') || 0);
let netKick = 0;
let netEnergy = 0;
let netMotion = 0;
let lastTime = performance.now();
let confirmedBest = 0;
let pendingBest = 0;
let submittingBest = false;
let globalGameRedirectTimer = null;

bestNode.textContent = String(best);

function renderLeaderboard(entries = []) {
  leaderboardNode.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = '기록 대기 중';
    leaderboardNode.appendChild(empty);
    return;
  }
  entries.slice(0, 3).forEach((entry, index) => {
    const row = document.createElement('li');
    const rank = document.createElement('b');
    const player = document.createElement('span');
    const points = document.createElement('em');
    rank.textContent = String(index + 1);
    player.textContent = `${entry.nickname || '참가자'} · T${entry.tableNumber ?? '-'}`;
    points.textContent = String(Number(entry.score || 0));
    row.append(rank, player, points);
    leaderboardNode.appendChild(row);
  });
}

function setFreePlayMode() {
  pendingBest = Math.max(pendingBest, confirmedBest);
  competitionStatusNode.textContent = participantAuth?.token ? '자유 플레이 · 기록 저장 중' : '자유 플레이';
  competitionStatusNode.classList.add('active');
  competitionStatusNode.classList.remove('waiting');
  courtNode.classList.remove('locked');
  footerNode.textContent = participantAuth?.token
    ? '공을 위로 밀어서 슛하세요 · 놓치면 점수가 초기화돼요'
    : '자유롭게 플레이할 수 있어요 · 앱에서 입장하면 최고기록이 저장돼요';
  setMessage('공을 위로 빠르게 밀어보세요');
}

async function fetchJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (participantAuth?.token) headers.Authorization = `Bearer ${participantAuth.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || '서버 요청에 실패했습니다.');
  return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
}

async function refreshLeaderboard() {
  const leaderboard = await fetchJson('/api/basketball/leaderboard');
  renderLeaderboard(Array.isArray(leaderboard) ? leaderboard : []);
}

async function refreshCompetitionState() {
  if (!participantAuth?.token) {
    setFreePlayMode();
    return;
  }
  const data = await fetchJson('/api/basketball/state');
  confirmedBest = Number(data.personalBest || 0);
  best = confirmedBest;
  pendingBest = confirmedBest;
  bestNode.textContent = String(best);
  localStorage.setItem('festival-basketball-best', String(best));
  setFreePlayMode();
}

async function drainScoreSubmission() {
  if (submittingBest || !participantAuth?.token) return;
  submittingBest = true;
  try {
    while (pendingBest > confirmedBest) {
      const target = pendingBest;
      const data = await fetchJson('/api/basketball/scores', {
        method: 'POST',
        body: JSON.stringify({ score: target }),
      });
      confirmedBest = Math.max(confirmedBest, Number(data.personalBest || target));
      best = Math.max(best, confirmedBest);
      bestNode.textContent = String(best);
      localStorage.setItem('festival-basketball-best', String(best));
      renderLeaderboard(data.leaderboard || []);
    }
  } catch (error) {
    footerNode.textContent = `기록 저장 대기 · ${error.message}`;
  } finally {
    submittingBest = false;
  }
}

function queueScoreSubmission(nextScore) {
  if (nextScore <= 0) return;
  pendingBest = Math.max(pendingBest, nextScore);
  drainScoreSubmission();
}

function connectCompetitionSocket() {
  if (!participantAuth?.token || !window.io) return;
  const socket = window.io(SOCKET_URL, {
    auth: { token: participantAuth.token },
    transports: ['websocket', 'polling'],
  });
  socket.on('basketball:leaderboard', (payload = {}) => renderLeaderboard(payload.leaderboard || []));
  const returnToGlobalGame = (game, { announce = false } = {}) => {
    if (!game || game.type === 'BASKETBALL') return;
    clearTimeout(globalGameRedirectTimer);
    const navigate = () => window.location.replace(`/${window.location.search}`);
    if (!announce) return navigate();
    document.getElementById('global-game-notice').hidden = false;
    globalGameRedirectTimer = setTimeout(navigate, 900);
  };
  socket.on('game:global:announced', (game) => returnToGlobalGame(game, { announce: true }));
  socket.on('game:global:started', (game) => returnToGlobalGame(game));
  socket.on('game:global:current', (game) => returnToGlobalGame(game, {
    announce: game?.state?.lifecyclePhase === 'ANNOUNCED',
  }));
  const resetBasketballState = () => {
    score = 0;
    best = 0;
    confirmedBest = 0;
    pendingBest = 0;
    scoreNode.textContent = '0';
    bestNode.textContent = '0';
    localStorage.removeItem('festival-basketball-best');
    renderLeaderboard([]);
  };
  socket.on('basketball:reset', resetBasketballState);
  socket.on('admin:data-reset', resetBasketballState);
}

function freshBall() {
  return { ...START, vx: 0, vy: 0, r: BALL_RADIUS, angle: 0, depth: 0 };
}

function setMessage(message) {
  messageNode.textContent = message;
  messageNode.hidden = !message;
  messageNode.classList.toggle('success', message.includes('GOAL'));
}

function updateScore(nextScore) {
  score = nextScore;
  scoreNode.textContent = String(score);
  if (score > best) {
    best = score;
    bestNode.textContent = String(best);
    localStorage.setItem('festival-basketball-best', String(best));
  }
}

function resetBall(missed = false) {
  if (missed && score > 0) {
    const finalScore = score;
    queueScoreSubmission(finalScore);
    updateScore(0);
    setMessage('놓쳤어요 — 다시 시작!');
  } else {
    setMessage('공을 위로 빠르게 밀어보세요');
  }
  ball = freshBall();
  dragging = false;
  launched = false;
  scoredThisShot = false;
  clearedRimFromAbove = false;
  depthSpeed = 0;
  resetFrames = 0;
  netEnergy = 0;
  netMotion = 0;
}

function bounceOnPoint(target, x, y, radius) {
  const dx = target.x - x;
  const dy = target.y - y;
  const distance = Math.hypot(dx, dy);
  const minimum = target.r + radius;
  if (distance >= minimum || distance === 0) return false;
  const nx = dx / distance;
  const ny = dy / distance;
  target.x = x + nx * minimum;
  target.y = y + ny * minimum;
  const speedIntoRim = target.vx * nx + target.vy * ny;
  if (speedIntoRim < 0) {
    target.vx -= 1.52 * speedIntoRim * nx;
    target.vy -= 1.52 * speedIntoRim * ny;
    target.vx = Math.max(-7, Math.min(7, target.vx * 0.86));
    target.vy = Math.max(-15, Math.min(15, target.vy * 0.86));
  }
  return true;
}

function hoopOffset(time) {
  if (score <= 20) return 0;
  const speed = score >= 40 ? 0.002 : 0.00145;
  const range = score >= 40 ? 54 : 38;
  return Math.sin(time * speed) * range;
}

function rimWidth() {
  return Math.max(70, BASE_RIM_WIDTH - Math.floor(score / 10) * 9);
}

function drawBall(target) {
  ctx.save();
  ctx.translate(target.x, target.y);
  const perspectiveScale = 1 - Math.min(target.depth, 1.25) * 0.18;
  ctx.scale(perspectiveScale, perspectiveScale);
  ctx.rotate(target.angle);
  ctx.shadowColor = 'rgba(79, 35, 8, .28)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 4;
  const leather = ctx.createRadialGradient(-9, -11, 1, 2, 3, target.r + 2);
  leather.addColorStop(0, '#ffc06b');
  leather.addColorStop(0.24, '#f59a3d');
  leather.addColorStop(0.64, '#e37326');
  leather.addColorStop(0.88, '#c85218');
  leather.addColorStop(1, '#8f300e');
  ctx.fillStyle = leather;
  ctx.beginPath();
  ctx.arc(0, 0, target.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  ctx.save();
  ctx.clip();
  for (let y = -20; y <= 20; y += 4) {
    for (let x = -20; x <= 20; x += 4) {
      if (x * x + y * y > 430) continue;
      const jitter = ((x * 17 + y * 23) % 5) * 0.18;
      ctx.fillStyle = (x + y) % 8 === 0 ? 'rgba(255,224,164,.42)' : 'rgba(96,38,12,.2)';
      ctx.beginPath();
      ctx.arc(x + jitter, y - jitter, 0.72, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  const shine = ctx.createRadialGradient(-10, -12, 0, -10, -12, 12);
  shine.addColorStop(0, 'rgba(255,255,255,.42)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(-8, -10, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#54220e';
  ctx.lineWidth = 2.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, target.r - 1, 0, Math.PI * 2);
  ctx.moveTo(-target.r, 1);
  ctx.bezierCurveTo(-9, -6, 9, -6, target.r, 1);
  ctx.moveTo(1, -target.r);
  ctx.bezierCurveTo(-7, -9, -7, 9, 1, target.r);
  ctx.moveTo(-17, -16);
  ctx.bezierCurveTo(-6, -7, 7, 7, 17, 16);
  ctx.stroke();
  ctx.restore();
}

function drawHoop(offset, width) {
  const center = W / 2 + offset;
  const boardLeft = center - 82;
  ctx.save();
  ctx.fillStyle = 'rgba(250,250,250,.72)';
  ctx.fillRect(boardLeft, 62, 164, 112);
  ctx.strokeStyle = '#b8b8b8';
  ctx.lineWidth = 4;
  ctx.strokeRect(boardLeft, 62, 164, 112);
  ctx.strokeStyle = '#a9a9a9';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(center - 38, 103, 76, 49);
  ctx.strokeStyle = '#8d8d8d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(center - 28, 174);
  ctx.lineTo(center - 21, BASE_RIM_Y - 1);
  ctx.moveTo(center + 28, 174);
  ctx.lineTo(center + 21, BASE_RIM_Y - 1);
  ctx.stroke();
  ctx.strokeStyle = '#a92d10';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(center, BASE_RIM_Y, width / 2, 7, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#f36a31';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(center, BASE_RIM_Y - 1, width / 2 - 2, 6, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawNet(offset, width, front) {
  const center = W / 2 + offset;
  const catchAmount = Math.min(1, netMotion / 7) * netEnergy;
  const rebound = Math.sin(netMotion * 0.42) * netEnergy;
  const pullDown = catchAmount * (18 + rebound * 6);
  const squeeze = catchAmount * (8 + Math.sin(netMotion * 0.31) * 3);
  const sway = netKick * 11 + rebound * 5;
  const rimDepth = 14;
  const netHeight = 62 + pullDown;
  ctx.save();
  ctx.strokeStyle = front ? 'rgba(142,148,154,.8)' : 'rgba(174,180,186,.48)';
  ctx.lineWidth = front ? 1.3 : 1;
  ctx.lineCap = 'round';
  for (let i = 0; i <= 7; i += 1) {
    const u = i / 7;
    const normalizedX = u * 2 - 1;
    const topX = center + normalizedX * width / 2;
    const ellipseY = Math.sqrt(Math.max(0, 1 - normalizedX ** 2)) * rimDepth / 2;
    const topY = BASE_RIM_Y + (front ? ellipseY : -ellipseY);
    const bottomSpread = 22 - squeeze * 0.55;
    const bottomX = center + normalizedX * bottomSpread + sway * (0.35 + u * 0.65);
    const middleX = center + normalizedX * (width * 0.35 - squeeze) + sway * u;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.bezierCurveTo(topX + sway * 0.18, BASE_RIM_Y + netHeight * 0.3, middleX, BASE_RIM_Y + netHeight * 0.7, bottomX, BASE_RIM_Y + netHeight);
    ctx.stroke();
  }
  for (let row = 1; row <= 4; row += 1) {
    const t = row / 4;
    const halfWidth = width / 2 * (1 - t * 0.56) - squeeze * Math.sin(Math.PI * t);
    const rowCenter = center + sway * t ** 1.5;
    const y = BASE_RIM_Y + netHeight * t;
    const depth = Math.max(2, rimDepth / 2 * (1 - t * 0.55));
    ctx.beginPath();
    ctx.ellipse(rowCenter, y, halfWidth, depth, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFrontRim(offset, width) {
  const center = W / 2 + offset;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#a92d10';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(center, BASE_RIM_Y, width / 2, 7, 0, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = '#f36a31';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.ellipse(center, BASE_RIM_Y - 1, width / 2 - 2, 6, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

function render(now) {
  const dt = Math.min((now - lastTime) / 16.667, 2);
  lastTime = now;
  const offset = hoopOffset(now);
  const currentRimWidth = rimWidth();
  const center = W / 2 + offset;
  const rimLeft = center - currentRimWidth / 2;
  const rimRight = center + currentRimWidth / 2;

  if (launched) {
    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.depth += depthSpeed * dt;
    ball.angle += ball.vx * 0.018 * dt;
    if (ball.x - ball.r < 5) {
      ball.x = ball.r + 5;
      ball.vx = Math.abs(ball.vx) * 0.18;
    } else if (ball.x + ball.r > W - 5) {
      ball.x = W - ball.r - 5;
      ball.vx = -Math.abs(ball.vx) * 0.18;
    }

    const nearHoopPlane = Math.abs(ball.depth - 1) < 0.14;
    const leftHit = !scoredThisShot && nearHoopPlane && bounceOnPoint(ball, rimLeft, BASE_RIM_Y, 5.5);
    const rightHit = !scoredThisShot && nearHoopPlane && bounceOnPoint(ball, rimRight, BASE_RIM_Y, 5.5);
    if (leftHit || rightHit) navigator.vibrate?.(10);
    if (ball.y + ball.r < BASE_RIM_Y - 5) clearedRimFromAbove = true;

    const inScoringDepth = ball.depth > 0.76 && ball.depth < 1.32;
    const insideRim = ball.x > rimLeft + 8 && ball.x < rimRight - 8;
    const inScoringBand = ball.y >= BASE_RIM_Y - 3 && ball.y <= BASE_RIM_Y + 18;
    if (!scoredThisShot && inScoringDepth && clearedRimFromAbove && insideRim && inScoringBand && ball.vy > 0) {
      scoredThisShot = true;
      netKick = Math.max(-1, Math.min(1, ball.vx / 5));
      netEnergy = 1;
      netMotion = 0;
      updateScore(score + 1);
      setMessage(score > 20 ? 'GOAL! · 움직이는 골대' : score % 10 === 0 ? 'GOAL! · 림이 좁아집니다' : 'GOAL!');
      navigator.vibrate?.([18, 24, 18]);
    }
    if (scoredThisShot && ball.y > BASE_RIM_Y && ball.y < BASE_RIM_Y + 82) {
      ball.vx += (center - ball.x) * 0.018 * dt;
      ball.vx *= Math.pow(0.91, dt);
      ball.vy = Math.min(7.2, ball.vy * Math.pow(0.975, dt));
    }
    if (ball.y > H + 55) {
      resetFrames += dt;
      if (resetFrames > 7) resetBall(!scoredThisShot);
    }
  }

  if (netEnergy > 0.003) {
    netMotion += dt;
    netEnergy *= Math.pow(0.965, dt);
  } else {
    netEnergy = 0;
  }
  netKick *= Math.pow(0.94, dt);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f7f7f7';
  ctx.fillRect(0, H - 52, W, 52);
  if (!launched) {
    ctx.fillStyle = 'rgba(49,38,31,.13)';
    ctx.beginPath();
    ctx.ellipse(START.x, START.y + 29, 29, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const ballIsBehindFrontRim = ball.depth >= 0.86 && ball.y > BASE_RIM_Y - ball.r * 0.8;
  const ballIsInsideNet = scoredThisShot && ball.depth >= 0.9 && ball.y > BASE_RIM_Y - 5 && ball.y < BASE_RIM_Y + 90;
  drawHoop(offset, currentRimWidth);
  drawNet(offset, currentRimWidth, false);
  if (!ballIsInsideNet) drawNet(offset, currentRimWidth, true);
  if (!ballIsBehindFrontRim) drawFrontRim(offset, currentRimWidth);
  drawBall(ball);
  if (ballIsInsideNet) drawNet(offset, currentRimWidth, true);
  if (ballIsBehindFrontRim) drawFrontRim(offset, currentRimWidth);
  requestAnimationFrame(render);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * W, y: (event.clientY - rect.top) / rect.height * H };
}

canvas.addEventListener('pointerdown', (event) => {
  if (launched) return;
  const point = pointFromEvent(event);
  if (Math.hypot(point.x - START.x, point.y - START.y) > BALL_RADIUS + 25) return;
  canvas.setPointerCapture(event.pointerId);
  gestureSamples = [{ ...point, time: performance.now() }];
  dragging = true;
  swipeGuide.classList.remove('visible');
  setMessage('손을 놓아 슛');
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const point = pointFromEvent(event);
  const time = performance.now();
  gestureSamples.push({ ...point, time });
  gestureSamples = gestureSamples.filter((sample) => time - sample.time <= 150);
});

function releaseBall(event) {
  if (!dragging) return;
  const point = pointFromEvent(event);
  const releaseTime = performance.now();
  gestureSamples.push({ ...point, time: releaseTime });
  dragging = false;
  const dx = point.x - START.x;
  const dy = point.y - START.y;
  const recent = gestureSamples.find((sample) => releaseTime - sample.time <= 130) || gestureSamples[0];
  const elapsed = Math.max(releaseTime - recent.time, 16);
  const gestureVx = (point.x - recent.x) / elapsed;
  const gestureVy = (point.y - recent.y) / elapsed;
  if (dy > -35 || gestureVy > -0.12) {
    resetBall(false);
    return;
  }
  const launchX = gestureVx * 8 + dx * 0.018;
  const launchY = gestureVy * 8 + dy * 0.038;
  ball.vx = Math.max(-8.5, Math.min(8.5, launchX));
  ball.vy = Math.max(-17.2, Math.min(-7, launchY));
  const discriminant = ball.vy ** 2 - 2 * GRAVITY * (START.y - BASE_RIM_Y);
  const descendingRimTime = discriminant > 0 ? (-ball.vy + Math.sqrt(discriminant)) / GRAVITY : 86;
  depthSpeed = 1 / descendingRimTime;
  launched = true;
  setMessage('');
}

canvas.addEventListener('pointerup', releaseBall);
canvas.addEventListener('pointercancel', releaseBall);
document.getElementById('reset-button').addEventListener('click', () => {
  updateScore(0);
  resetBall(false);
});
document.getElementById('back-button').addEventListener('click', () => {
  if (document.referrer && new URL(document.referrer).origin === location.origin) history.back();
  else location.href = '/';
});

setFreePlayMode();
refreshLeaderboard().catch(() => {});
refreshCompetitionState().catch(() => setFreePlayMode());
connectCompetitionSocket();
requestAnimationFrame(render);
