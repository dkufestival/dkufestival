import { serverNow } from './game-clock.js';

export function rouletteFrame(spin, count, now) {
  const duration = Number(spin.durationMs || 4200);
  const progress = Math.max(0, Math.min(1, (now - Number(spin.startAt || spin.spinId)) / duration));
  const target = (360 - (Number(spin.resultIndex) + .5) * 360 / count) % 360;
  const from = Number(spin.fromRotation || 0);
  const to = Number(spin.toRotation ?? (Math.floor(from / 360) * 360 + 2520 + target));
  return { rotation: from + (to - from) * (1 - (1 - progress) ** 4), done: progress === 1 };
}

export function animateRoulette(wheel, result, spin, count, onDone = () => {}) {
  let frame;
  let cancelled = false;
  wheel.style.transition = 'none';
  const tick = () => {
    if (cancelled || !wheel.isConnected) return;
    const current = rouletteFrame(spin, count, serverNow());
    wheel.style.transform = `rotate(${current.rotation}deg)`;
    result.textContent = current.done ? `당첨: ${spin.result}` : '룰렛이 돌아가는 중...';
    if (current.done) onDone();
    else frame = requestAnimationFrame(tick);
  };
  tick();
  return () => { cancelled = true; cancelAnimationFrame(frame); };
}
