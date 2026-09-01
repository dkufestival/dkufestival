import { connectSocket, getSocket } from '../js/socket.js';
import { getParticipantAuth } from '../js/auth.js';

const $ = (id) => document.getElementById(id);

const state = {
  game: null,
  phase: 'idle',
  startedAt: 0,
  elapsedMs: 0,
  frame: null,
  attempts: [],
  maxAttempts: 1,
};

function formatTime(totalMs) {
  const value = Math.max(0, Math.floor(Number(totalMs) || 0));
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const centiseconds = Math.floor((value % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function formatDiff(diffMs) {
  const value = (Number(diffMs) || 0) / 10;
  if (value === 0) return '±0ms';
  return `${value < 0 ? '-' : '+'}${Math.abs(value)}ms`;
}

function setStatus(message) {
  $('status-text').textContent = message;
}

function setResult(message, tone = '') {
  const node = $('result-text');
  node.textContent = message;
  node.classList.toggle('good', tone === 'good');
  node.classList.toggle('bad', tone === 'bad');
}

function renderElapsed() {
  const value = Math.max(0, Math.floor(Number(state.elapsedMs) || 0));
  const elapsed = $('elapsed-time');
  elapsed.querySelector('[data-time-part="minutes"]').textContent = String(Math.floor(value / 60000)).padStart(2, '0');
  elapsed.querySelector('[data-time-part="seconds"]').textContent = String(Math.floor((value % 60000) / 1000)).padStart(2, '0');
  elapsed.querySelector('[data-time-part="centiseconds"]').textContent = String(Math.floor((value % 1000) / 10)).padStart(2, '0');
  elapsed.setAttribute('aria-label', formatTime(value));
}

function resetRun() {
  if (state.frame) cancelAnimationFrame(state.frame);
  state.phase = state.game ? 'ready' : 'idle';
  state.startedAt = 0;
  state.elapsedMs = 0;
  state.frame = null;
  renderElapsed();
}

function renderAttempts() {
  const list = $('attempts-list');
  const rows = $('attempts-rows');
  rows.innerHTML = '';
  $('attempts-count').textContent = `${state.attempts.length}/${state.maxAttempts}`;
  list.hidden = !state.game;
  if (!state.game || !state.attempts.length) return;

  let bestIndex = 0;
  state.attempts.forEach((attempt, index) => {
    if (Math.abs(attempt.differenceMs) < Math.abs(state.attempts[bestIndex].differenceMs)) bestIndex = index;
  });

  state.attempts.forEach((attempt, index) => {
    const row = document.createElement('div');
    row.className = 'attempt-row';
    if (attempt.success) row.classList.add('perfect');
    if (index === bestIndex && state.attempts.length > 1) row.classList.add('best');

    const label = document.createElement('span');
    label.className = 'attempt-row-label';
    const labelText = document.createElement('span');
    labelText.textContent = `시도 ${attempt.attemptNumber || index + 1}`;
    label.appendChild(labelText);
    if (index === bestIndex && state.attempts.length > 1) {
      const tag = document.createElement('span');
      tag.className = 'attempt-row-tag';
      tag.textContent = '최고 기록';
      label.appendChild(tag);
    }

    const value = document.createElement('span');
    value.className = 'attempt-row-value';
    value.textContent = formatTime(attempt.elapsedMs);
    const diff = document.createElement('span');
    diff.className = 'attempt-row-diff';
    diff.textContent = attempt.success ? 'PERFECT' : formatDiff(attempt.differenceMs);
    value.appendChild(diff);

    row.appendChild(label);
    row.appendChild(value);
    rows.appendChild(row);
  });
}

function updateActionAvailability() {
  if (!state.game || state.phase === 'running') return;
  const btn = $('action-button');
  const remaining = state.maxAttempts - state.attempts.length;
  if (remaining <= 0) {
    state.phase = 'exhausted';
    btn.disabled = true;
    btn.classList.remove('is-stop');
    btn.textContent = '기회 소진';
    setResult(`모든 기회(${state.maxAttempts}회)를 사용했습니다.`);
  } else {
    state.phase = 'ready';
    btn.disabled = false;
    btn.classList.remove('is-stop');
    btn.textContent = state.attempts.length > 0 ? `다시 시도 (${remaining}회 남음)` : 'START';
  }
}

function syncMyAttempts(gameId) {
  const socket = getSocket();
  if (!socket) return;
  socket.emit('game:global:my-response', { gameId }, (response) => {
    if (!state.game || state.game.id !== gameId) return;
    const data = response?.ok ? response.data : null;
    state.attempts = data?.attempts || [];
    if (data?.maxAttempts) state.maxAttempts = data.maxAttempts;
    renderAttempts();
    updateActionAvailability();
  });
}

function renderGame(game) {
  if (!game || game.type !== 'TIME_MATCH' || game.status !== 'ACTIVE') {
    state.game = null;
    state.attempts = [];
    state.maxAttempts = 1;
    resetRun();
    $('target-time').textContent = '--:--.--';
    $('action-button').disabled = true;
    $('action-button').classList.remove('is-stop');
    $('action-button').textContent = '대기 중';
    setResult('관리자가 스톱워치 게임을 시작하면 참여할 수 있습니다.');
    setStatus('진행 중인 스톱워치 게임이 없습니다.');
    renderAttempts();
    return;
  }

  state.game = game;
  state.maxAttempts = Number(game.state?.maxAttempts) || 1;
  resetRun();
  $('target-time').textContent = formatTime(game.state?.targetMs);
  $('action-button').disabled = true;
  $('action-button').classList.remove('is-stop');
  $('action-button').textContent = '불러오는 중';
  setResult('내 기록을 불러오는 중입니다.');
  setStatus('스톱워치 게임 준비 완료');
  renderAttempts();
  syncMyAttempts(game.id);
}

function tick(now) {
  state.elapsedMs = Math.floor(now - state.startedAt);
  renderElapsed();
  state.frame = requestAnimationFrame(tick);
}

function startRun() {
  if (!state.game || state.phase !== 'ready') return;
  state.phase = 'running';
  state.startedAt = performance.now();
  state.elapsedMs = 0;
  $('action-button').textContent = 'STOP';
  $('action-button').classList.add('is-stop');
  setResult('목표 시간에 맞춰 멈추세요.');
  setStatus('측정 중');
  state.frame = requestAnimationFrame(tick);
}

function stopRun() {
  if (!state.game || state.phase !== 'running') return;
  if (state.frame) cancelAnimationFrame(state.frame);
  state.frame = null;
  state.elapsedMs = Math.floor((performance.now() - state.startedAt) / 10) * 10;
  state.phase = 'done';
  renderElapsed();

  const targetMs = Number(state.game.state?.targetMs || 0);
  const differenceMs = state.elapsedMs - targetMs;
  const success = differenceMs === 0;
  const label = success
    ? 'PERFECT! 정확히 일치했습니다.'
    : `${Math.abs(differenceMs) / 10}ms ${differenceMs < 0 ? '빨랐습니다.' : '늦었습니다.'}`;
  setResult(label, success ? 'good' : 'bad');
  setStatus('결과 전송 중');
  $('action-button').disabled = true;
  $('action-button').classList.remove('is-stop');
  $('action-button').textContent = '전송 중';

  const gameId = state.game.id;
  getSocket()?.emit('game:action', {
    gameId,
    action: 'STOP',
    state: {
      elapsedMs: state.elapsedMs,
      targetMs,
      differenceMs,
      success,
      stoppedAt: new Date().toISOString(),
    },
  }, (response) => {
    setStatus(response?.ok ? '결과가 관리자에게 전달되었습니다.' : response?.message || response?.error || '결과 전송에 실패했습니다.');
    syncMyAttempts(gameId);
  });
}

function bindSocket() {
  if (!getParticipantAuth()?.token) {
    setStatus('참가자 입장 후 이용할 수 있습니다.');
    setResult('먼저 QR로 테이블에 입장해주세요.', 'bad');
    return;
  }

  const socket = connectSocket('PARTICIPANT');
  if (!socket) {
    setStatus('소켓 연결을 시작할 수 없습니다.');
    return;
  }

  socket.on('connect', () => setStatus('서버 연결됨'));
  socket.on('disconnect', () => setStatus('서버 연결 대기'));
  socket.on('game:global:current', renderGame);
  socket.on('game:global:started', renderGame);
  socket.on('game:global:ended', () => renderGame(null));
  socket.on('game:global:attempts-granted', ({ gameId } = {}) => {
    if (state.game && gameId === state.game.id) syncMyAttempts(gameId);
  });
}

$('action-button').addEventListener('click', () => {
  if (state.phase === 'ready') startRun();
  else if (state.phase === 'running') stopRun();
});

$('back-button').addEventListener('click', () => {
  if (document.referrer && new URL(document.referrer).origin === location.origin) history.back();
  else location.href = '/';
});

renderGame(null);
bindSocket();
