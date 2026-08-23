'use client';

import { PointerEvent, useCallback, useEffect, useRef, useState } from 'react';

const W = 390;
const H = 680;
const START = { x: 195, y: 590 };
const BALL_RADIUS = 23;
const GRAVITY = 0.31;
const BASE_RIM_Y = 194;
const BASE_RIM_WIDTH = 106;

type Ball = { x: number; y: number; vx: number; vy: number; r: number; angle: number; depth: number };

function bounceOnPoint(ball: Ball, x: number, y: number, radius: number) {
  const dx = ball.x - x;
  const dy = ball.y - y;
  const distance = Math.hypot(dx, dy);
  const minimum = ball.r + radius;
  if (distance >= minimum || distance === 0) return false;
  const nx = dx / distance;
  const ny = dy / distance;
  ball.x = x + nx * minimum;
  ball.y = y + ny * minimum;
  const speedIntoRim = ball.vx * nx + ball.vy * ny;
  if (speedIntoRim < 0) {
    ball.vx -= 1.52 * speedIntoRim * nx;
    ball.vy -= 1.52 * speedIntoRim * ny;
    ball.vx = Math.max(-7, Math.min(7, ball.vx * 0.86));
    ball.vy = Math.max(-15, Math.min(15, ball.vy * 0.86));
  }
  return true;
}

export default function BasketballGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballRef = useRef<Ball>({ ...START, vx: 0, vy: 0, r: BALL_RADIUS, angle: 0, depth: 0 });
  const pointer = useRef({ ...START });
  const gestureSamples = useRef<Array<{ x: number; y: number; time: number }>>([]);
  const dragging = useRef(false);
  const launched = useRef(false);
  const scoredThisShot = useRef(false);
  const clearedRimFromAbove = useRef(false);
  const depthSpeed = useRef(0);
  const resetFrames = useRef(0);
  const scoreRef = useRef(0);
  const netKick = useRef(0);
  const netEnergy = useRef(0);
  const netMotion = useRef(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [firstShot, setFirstShot] = useState(true);
  const [message, setMessage] = useState('공을 위로 빠르게 밀어보세요');

  const resetBall = useCallback((missed = false) => {
    if (missed && scoreRef.current > 0) {
      scoreRef.current = 0;
      setScore(0);
      setMessage('놓쳤어요 — 다시 시작!');
    } else {
      setMessage('공을 위로 빠르게 밀어보세요');
    }
    ballRef.current = { ...START, vx: 0, vy: 0, r: BALL_RADIUS, angle: 0, depth: 0 };
    dragging.current = false;
    launched.current = false;
    scoredThisShot.current = false;
    clearedRimFromAbove.current = false;
    depthSpeed.current = 0;
    resetFrames.current = 0;
    netEnergy.current = 0;
    netMotion.current = 0;
  }, []);

  useEffect(() => {
    setBest(Number(localStorage.getItem('festival-basketball-best') || 0));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let animationFrame = 0;
    let lastTime = performance.now();

    const hoopOffset = (time: number) => {
      if (scoreRef.current <= 20) return 0;
      const speed = scoreRef.current >= 40 ? 0.002 : 0.00145;
      const range = scoreRef.current >= 40 ? 54 : 38;
      return Math.sin(time * speed) * range;
    };

    const rimWidth = () => Math.max(70, BASE_RIM_WIDTH - Math.floor(scoreRef.current / 10) * 9);

    const drawBall = (ball: Ball) => {
      ctx.save();
      ctx.translate(ball.x, ball.y);
      const perspectiveScale = 1 - Math.min(ball.depth, 1.25) * 0.18;
      ctx.scale(perspectiveScale, perspectiveScale);
      ctx.rotate(ball.angle);
      ctx.shadowColor = 'rgba(79, 35, 8, .28)';
      ctx.shadowBlur = 7;
      ctx.shadowOffsetY = 4;
      const leather = ctx.createRadialGradient(-9, -11, 1, 2, 3, ball.r + 2);
      leather.addColorStop(0, '#ffc06b');
      leather.addColorStop(0.24, '#f59a3d');
      leather.addColorStop(0.64, '#e37326');
      leather.addColorStop(0.88, '#c85218');
      leather.addColorStop(1, '#8f300e');
      ctx.fillStyle = leather;
      ctx.beginPath();
      ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
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
      ctx.arc(0, 0, ball.r - 1, 0, Math.PI * 2);
      ctx.moveTo(-ball.r, 1);
      ctx.bezierCurveTo(-9, -6, 9, -6, ball.r, 1);
      ctx.moveTo(1, -ball.r);
      ctx.bezierCurveTo(-7, -9, -7, 9, 1, ball.r);
      ctx.moveTo(-17, -16);
      ctx.bezierCurveTo(-6, -7, 7, 7, 17, 16);
      ctx.stroke();
      ctx.restore();
    };

    const drawHoop = (offset: number, width: number) => {
      const center = W / 2 + offset;
      const left = center - width / 2;
      const right = center + width / 2;
      const boardLeft = center - 82;

      ctx.save();
      // Backboard and the rear half of the hoop stay behind the ball.
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

      const rimDepth = 14;
      ctx.strokeStyle = '#a92d10';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(center, BASE_RIM_Y, width / 2, rimDepth / 2, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#f36a31';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(center, BASE_RIM_Y - 1, width / 2 - 2, rimDepth / 2 - 1, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return { left, right, boardRight: center + 82 };
    };

    const drawNet = (offset: number, width: number, front: boolean) => {
      const center = W / 2 + offset;
      const age = netMotion.current;
      const energy = netEnergy.current;
      const catchAmount = Math.min(1, age / 7) * energy;
      const rebound = Math.sin(age * .42) * energy;
      const pullDown = catchAmount * (18 + rebound * 6);
      const squeeze = catchAmount * (8 + Math.sin(age * .31) * 3);
      const sway = netKick.current * 11 + rebound * 5;
      const rimDepth = 14;
      const netHeight = 62 + pullDown;

      ctx.save();
      ctx.strokeStyle = front ? 'rgba(142,148,154,.8)' : 'rgba(174,180,186,.48)';
      ctx.lineWidth = front ? 1.3 : 1;
      ctx.lineCap = 'round';

      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        const normalizedX = u * 2 - 1;
        const topX = center + normalizedX * width / 2;
        const ellipseY = Math.sqrt(Math.max(0, 1 - normalizedX ** 2)) * rimDepth / 2;
        const topY = BASE_RIM_Y + (front ? ellipseY : -ellipseY);
        const bottomSpread = 22 - squeeze * .55;
        const bottomX = center + normalizedX * bottomSpread + sway * (.35 + u * .65);
        const middleX = center + normalizedX * (width * .35 - squeeze) + sway * u;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.bezierCurveTo(
          topX + sway * .18,
          BASE_RIM_Y + netHeight * .3,
          middleX,
          BASE_RIM_Y + netHeight * .7,
          bottomX,
          BASE_RIM_Y + netHeight,
        );
        ctx.stroke();
      }

      for (let row = 1; row <= 4; row++) {
        const t = row / 4;
        const halfWidth = width / 2 * (1 - t * .56) - squeeze * Math.sin(Math.PI * t);
        const rowCenter = center + sway * t ** 1.5;
        const y = BASE_RIM_Y + netHeight * t;
        const depth = Math.max(2, (rimDepth / 2) * (1 - t * .55));
        ctx.beginPath();
        ctx.ellipse(rowCenter, y, halfWidth, depth, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawFrontRim = (offset: number, width: number) => {
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
    };

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 16.667, 2);
      lastTime = now;
      const offset = hoopOffset(now);
      const currentRimWidth = rimWidth();
      const center = W / 2 + offset;
      const rimLeft = center - currentRimWidth / 2;
      const rimRight = center + currentRimWidth / 2;
      const ball = ballRef.current;

      if (launched.current) {
        ball.vy += GRAVITY * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.depth += depthSpeed.current * dt;
        ball.angle += ball.vx * 0.018 * dt;

        if (ball.x - ball.r < 5) {
          ball.x = ball.r + 5;
          ball.vx = Math.abs(ball.vx) * 0.18;
        } else if (ball.x + ball.r > W - 5) {
          ball.x = W - ball.r - 5;
          ball.vx = -Math.abs(ball.vx) * 0.18;
        }
        const nearHoopPlane = Math.abs(ball.depth - 1) < 0.14;
        const leftHit = !scoredThisShot.current && nearHoopPlane && bounceOnPoint(ball, rimLeft, BASE_RIM_Y, 5.5);
        const rightHit = !scoredThisShot.current && nearHoopPlane && bounceOnPoint(ball, rimRight, BASE_RIM_Y, 5.5);
        if (leftHit || rightHit) navigator.vibrate?.(10);

        if (ball.y + ball.r < BASE_RIM_Y - 5) {
          clearedRimFromAbove.current = true;
        }

        const inScoringDepth = ball.depth > .76 && ball.depth < 1.32;
        const insideRim = ball.x > rimLeft + 8 && ball.x < rimRight - 8;
        const inScoringBand = ball.y >= BASE_RIM_Y - 3 && ball.y <= BASE_RIM_Y + 18;
        if (!scoredThisShot.current && inScoringDepth && clearedRimFromAbove.current && insideRim && inScoringBand && ball.vy > 0) {
          scoredThisShot.current = true;
          netKick.current = Math.max(-1, Math.min(1, ball.vx / 5));
          netEnergy.current = 1;
          netMotion.current = 0;
          const next = scoreRef.current + 1;
          scoreRef.current = next;
          setScore(next);
          setBest((oldBest) => {
            const nextBest = Math.max(oldBest, next);
            localStorage.setItem('festival-basketball-best', String(nextBest));
            return nextBest;
          });
          setMessage(next > 20 ? 'GOAL! · 움직이는 골대' : next % 10 === 0 ? 'GOAL! · 림이 좁아집니다' : 'GOAL!');
          navigator.vibrate?.([18, 24, 18]);
        }

        if (scoredThisShot.current && ball.y > BASE_RIM_Y && ball.y < BASE_RIM_Y + 82) {
          // The net absorbs the shot, guides the ball toward its center and
          // briefly slows the fall instead of letting it pass through untouched.
          ball.vx += (center - ball.x) * .018 * dt;
          ball.vx *= Math.pow(.91, dt);
          ball.vy = Math.min(7.2, ball.vy * Math.pow(.975, dt));
        }

        if (ball.y > H + 55) {
          resetFrames.current += dt;
          if (resetFrames.current > 7) resetBall(!scoredThisShot.current);
        }
      }
      if (netEnergy.current > .003) {
        netMotion.current += dt;
        netEnergy.current *= Math.pow(.965, dt);
      } else {
        netEnergy.current = 0;
      }
      netKick.current *= Math.pow(.94, dt);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(0, H - 52, W, 52);

      if (!launched.current) {
        ctx.fillStyle = 'rgba(49, 38, 31, .13)';
        ctx.beginPath();
        ctx.ellipse(START.x, START.y + 29, 29, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // The ball remains in front while travelling toward the hoop. At the
      // hoop's depth, only the rim's front edge overlaps it—never the backboard.
      const ballIsBehindFrontRim = ball.depth >= 0.86 && ball.y > BASE_RIM_Y - ball.r * .8;
      const ballIsInsideNet = scoredThisShot.current && ball.depth >= .9 && ball.y > BASE_RIM_Y - 5 && ball.y < BASE_RIM_Y + 90;
      drawHoop(offset, currentRimWidth);
      drawNet(offset, currentRimWidth, false);
      if (!ballIsInsideNet) drawNet(offset, currentRimWidth, true);
      // The complete rim is always visible. Only its stacking order changes:
      // in front of the hoop the ball covers the rim; after clearing the apex,
      // the front arc covers the lower edge of the ball as it drops through.
      if (!ballIsBehindFrontRim) drawFrontRim(offset, currentRimWidth);
      drawBall(ball);
      if (ballIsInsideNet) drawNet(offset, currentRimWidth, true);
      if (ballIsBehindFrontRim) {
        drawFrontRim(offset, currentRimWidth);
      }
      animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrame);
  }, [resetBall]);

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (launched.current) return;
    const point = pointFromEvent(event);
    if (Math.hypot(point.x - START.x, point.y - START.y) > BALL_RADIUS + 25) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = point;
    gestureSamples.current = [{ ...point, time: performance.now() }];
    dragging.current = true;
    setFirstShot(false);
    setMessage('손을 놓아 슛');
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragging.current) {
      const point = pointFromEvent(event);
      const time = performance.now();
      pointer.current = point;
      gestureSamples.current.push({ ...point, time });
      gestureSamples.current = gestureSamples.current.filter((sample) => time - sample.time <= 150);
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const point = pointFromEvent(event);
    const releaseTime = performance.now();
    gestureSamples.current.push({ ...point, time: releaseTime });
    dragging.current = false;
    const dx = point.x - START.x;
    const dy = point.y - START.y;
    const recent = gestureSamples.current.find((sample) => releaseTime - sample.time <= 130) ?? gestureSamples.current[0];
    const elapsed = Math.max(releaseTime - recent.time, 16);
    const gestureVx = (point.x - recent.x) / elapsed;
    const gestureVy = (point.y - recent.y) / elapsed;
    if (dy > -35 || gestureVy > -0.12) return resetBall(false);
    const launchX = gestureVx * 8 + dx * 0.018;
    const launchY = gestureVy * 8 + dy * 0.038;
    ballRef.current.vx = Math.max(-8.5, Math.min(8.5, launchX));
    // Keep the apex visibly above the rim without an artificial ceiling bounce.
    ballRef.current.vy = Math.max(-17.2, Math.min(-7, launchY));
    const discriminant = ballRef.current.vy ** 2 - 2 * GRAVITY * (START.y - BASE_RIM_Y);
    const descendingRimTime = discriminant > 0 ? (-ballRef.current.vy + Math.sqrt(discriminant)) / GRAVITY : 86;
    depthSpeed.current = 1 / descendingRimTime;
    launched.current = true;
    setMessage('');
  };

  const restart = () => {
    scoreRef.current = 0;
    setScore(0);
    resetBall(false);
  };

  return (
    <main className="game-shell">
      <section className="game-card" aria-label="농구 슛 게임">
        <header className="topbar">
          <button className="back-button" type="button" aria-label="게임 나가기"><i>‹</i> 돌아가기</button>
          <h1>농구</h1>
          <button className="reset-button" type="button" onClick={restart} aria-label="게임 다시 시작">다시</button>
        </header>

        <div className="court">
          <div className="best-score"><span>최고 점수</span><strong>{best}</strong></div>
          <div className="scoreboard" aria-live="polite">
            <strong>{score}</strong>
          </div>
          <canvas ref={canvasRef} width={W} height={H} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="농구공을 위로 밀어 슛하는 게임 영역" />
          {message && <p className={`game-message ${message.includes('GOAL') ? 'success' : ''}`}>{message}</p>}
          <div className={`swipe-guide ${firstShot ? 'visible' : ''}`} aria-hidden="true"><i /><span>SWIPE UP</span></div>
        </div>

        <footer>공을 위로 밀어서 슛하세요 · 놓치면 점수가 초기화돼요</footer>
      </section>
    </main>
  );
}
