import { connectSocket, getSocket } from '../js/socket.js';
import { getParticipantAuth } from '../js/auth.js';

const $ = (id) => document.getElementById(id);

const state = {
  game: null,
  phase: 'idle',
  startedAt: 0,
  elapsedMs: 0,
  frame: null,
};

function formatTime(totalMs) {
  const value = Math.max(0, Math.floor(Number(totalMs) || 0));
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const milliseconds = value % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
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
  $('elapsed-time').textContent = formatTime(state.elapsedMs);
}

function resetRun() {
  if (state.frame) cancelAnimationFrame(state.frame);
  state.phase = state.game ? 'ready' : 'idle';
  state.startedAt = 0;
  state.elapsedMs = 0;
  state.frame = null;
  renderElapsed();
}

function renderGame(game) {
  if (!game || game.type !== 'TIME_MATCH' || game.status !== 'ACTIVE') {
    state.game = null;
    resetRun();
    $('target-time').textContent = '--:--.---';
    $('action-button').disabled = true;
    $('action-button').classList.remove('is-stop');
    $('action-button').textContent = '대기 중';
    setResult('관리자가 스톱워치 게임을 시작하면 참여할 수 있습니다.');
    setStatus('진행 중인 스톱워치 게임이 없습니다.');
    return;
  }

  state.game = game;
  resetRun();
  $('target-time').textContent = formatTime(game.state?.targetMs);
  $('action-button').disabled = false;
  $('action-button').classList.remove('is-stop');
  $('action-button').textContent = 'START';
  setResult('START를 누른 뒤 목표 시간에 맞춰 STOP을 누르세요.');
  setStatus('스톱워치 게임 준비 완료');
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
  state.elapsedMs = Math.floor(performance.now() - state.startedAt);
  state.phase = 'done';
  renderElapsed();

  const targetMs = Number(state.game.state?.targetMs || 0);
  const differenceMs = state.elapsedMs - targetMs;
  const success = differenceMs === 0;
  const label = success
    ? 'PERFECT! 정확히 일치했습니다.'
    : `${Math.abs(differenceMs)}ms ${differenceMs < 0 ? '빨랐어요.' : '늦었어요.'}`;
  setResult(label, success ? 'good' : 'bad');
  setStatus('결과 전송 중');
  $('action-button').disabled = true;
  $('action-button').classList.remove('is-stop');
  $('action-button').textContent = success ? 'PERFECT' : '제출 완료';

  getSocket()?.emit('game:action', {
    gameId: state.game.id,
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
}

$('action-button').addEventListener('click', () => {
  if (state.phase === 'ready') startRun();
  else if (state.phase === 'running') stopRun();
});

$('reset-button').addEventListener('click', () => {
  if (!state.game || state.phase === 'running') return;
  renderGame(state.game);
});

$('back-button').addEventListener('click', () => {
  if (document.referrer && new URL(document.referrer).origin === location.origin) history.back();
  else location.href = '/';
});

renderGame(null);
bindSocket();
