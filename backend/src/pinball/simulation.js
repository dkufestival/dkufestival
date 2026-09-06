// Single authoritative physics engine. Preserve the existing 120 Hz collision rules.
const DEFAULT_MAP = require('../../../frontend/pinball-local/map-data.js');
const STEP = 1 / 120;
function seededRandom(value) {
  let seed = Number(value) >>> 0 || 1;
  return () => {
    seed += 0x6D2B79F5;
    let n = seed;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}


function createSimulation({ names: entries, seed }) {
  const random = seededRandom(seed);
  const names = entries.flatMap(value => {
    const match = /^(.*?)(?:\*(\d+))?$/.exec(value);
    return Array.from({ length: Number(match[2] || 1) }, () => match[1]);
  });
  const colors = ['#ff5d73', '#55d6ff', '#ffe45e', '#a8ff60', '#c998ff', '#ff9f43', '#66f2c2', '#ff7ee2'];
  const width = 390, height = 1850;
  const { pegs, sideBumpers, spinners, rails } = DEFAULT_MAP;
  const sideWalls = [[5, 0, 5, height - 190], [width - 5, 0, width - 5, height - 190]];
  let balls = [], finishOrder = [], eliminatedOrder = [];
  let simulationSteps = 0, simulationTime = 0;
  function createBalls() {
    const radius = Math.max(8, Math.min(11, width / 36));
    const columns = Math.max(2, Math.min(10, Math.floor((width - 30) / (radius * 2.4))));
    balls = names.map((name, index) => ({
      id: index, name,
      x: 18 + radius + (index % columns) * ((width - 36 - radius * 2) / Math.max(1, columns - 1)),
      y: 60 + Math.floor(index / columns) * radius * 2.15,
      vx: (random() - .5) * 22, vy: 0, radius,
      color: colors[index % colors.length], finished: false,
    }));
  }

  function collideCircle(ball, obstacle, bounce = .72) {
    const dx = ball.x - obstacle.x;
    const dy = ball.y - obstacle.y;
    const distance = Math.hypot(dx, dy);
    const minimum = ball.radius + obstacle.radius;
    if (!distance || distance >= minimum) return false;
    const nx = dx / distance;
    const ny = dy / distance;
    ball.x = obstacle.x + nx * minimum;
    ball.y = obstacle.y + ny * minimum;
    const velocity = ball.vx * nx + ball.vy * ny;
    if (velocity < 0) {
      ball.vx -= (1 + bounce) * velocity * nx;
      ball.vy -= (1 + bounce) * velocity * ny;
    }
    return true;
  }

  function collideSegment(ball, x1, y1, x2, y2, bounce = .66, push = 0) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((ball.x - x1) * dx + (ball.y - y1) * dy) / lengthSquared));
    const hit = collideCircle(ball, { x: x1 + dx * t, y: y1 + dy * t, radius: 4 }, bounce);
    if (hit && push) {
      const length = Math.sqrt(lengthSquared);
      ball.vx += -dy / length * push;
      ball.vy += dx / length * push;
    }
    return hit;
  }

  function collideBalls() {
    for (let i = 0; i < balls.length; i += 1) {
      const a = balls[i];
      if (a.finished || a.eliminated) continue;
      for (let j = i + 1; j < balls.length; j += 1) {
        const b = balls[j];
        if (b.finished || b.eliminated) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const minimum = a.radius + b.radius;
        if (!distance || distance >= minimum) continue;
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = (minimum - distance) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relative < 0) {
          const impulse = relative * .86;
          a.vx += impulse * nx; a.vy += impulse * ny;
          b.vx -= impulse * nx; b.vy -= impulse * ny;
        }
      }
    }
  }

  function updateBall(ball) {
    if (ball.finished || ball.eliminated) return;
    ball.vy += 430 * STEP;
    ball.vx *= .998;
    ball.x += ball.vx * STEP;
    ball.y += ball.vy * STEP;
    if (ball.x < ball.radius + 5) { ball.x = ball.radius + 5; ball.vx = Math.abs(ball.vx) * .75; }
    if (ball.x > width - ball.radius - 5) { ball.x = width - ball.radius - 5; ball.vx = -Math.abs(ball.vx) * .75; }
    pegs.forEach((peg) => collideCircle(ball, peg));
    sideBumpers.forEach((bumper) => {
      if (collideCircle(ball, bumper, .78)) {
        ball.vx += bumper.x < width / 2 ? 34 : -34;
      }
    });
    spinners.forEach((spinner) => {
      const angle = spinner.phase + simulationTime * spinner.speed;
      const dx = Math.cos(angle) * spinner.length / 2;
      const dy = Math.sin(angle) * spinner.length / 2;
      collideSegment(ball, spinner.x - dx, spinner.y - dy, spinner.x + dx, spinner.y + dy, .8, spinner.speed * 13);
    });
    rails.forEach(([x1, y1, x2, y2]) => collideSegment(ball, x1, y1, x2, y2, .58));
    sideWalls.forEach(([x1, y1, x2, y2]) => collideSegment(ball, x1, y1, x2, y2, .5));
    const bladeAngle = simulationTime * 3;
    const bladeX = width / 2;
    const bladeY = height - 126;
    for (let arm = 0; arm < 1; arm += 1) {
      const angle = bladeAngle;
      const tipX = bladeX + Math.cos(angle) * 46;
      const tipY = bladeY + Math.sin(angle) * 46;
      if (collideSegment(ball, bladeX, bladeY, tipX, tipY, .2)) {
        ball.eliminated = true;
        eliminatedOrder.push(ball);
        return;
      }
    }
    const funnelTop = height - 190;
    const exitHalf = Math.max(24, ball.radius * 2.4);
    collideSegment(ball, 5, funnelTop, width / 2 - exitHalf, height - 42, .48);
    collideSegment(ball, width - 5, funnelTop, width / 2 + exitHalf, height - 42, .48);
    // 출구 안으로 충분히 진입한 공은 아래쪽 경계와 재충돌하기 전에 즉시 완주 처리한다.
    if (ball.y >= height - 45 && Math.abs(ball.x - width / 2) <= exitHalf - ball.radius * .2) {
      ball.finished = true;
      finishOrder.push(ball);
      return;
    }
    if (ball.y > height - 48 && Math.abs(ball.x - width / 2) > exitHalf - ball.radius * .25) {
      ball.y = height - 48;
      ball.vy = -Math.abs(ball.vy) * .32;
      ball.vx += ball.x < width / 2 ? 30 : -30;
    }
    if (ball.y > height + ball.radius) {
      ball.finished = true;
      finishOrder.push(ball);
    }
  }

  function simulate() {
    simulationSteps += 1;
    simulationTime = simulationSteps * STEP;
    balls.forEach(updateBall);
    collideBalls();
  }


  createBalls();
  return {
    advance() { if (!this.done) simulate(); },
    get step() { return simulationSteps; },
    get done() { return finishOrder.length + eliminatedOrder.length === balls.length; },
    snapshot() {
      return { step: simulationSteps, simulationTime, balls: balls.map(ball => ({ ...ball })),
        result: { winner: finishOrder[0] ? { ...finishOrder[0] } : null,
          finishOrder: finishOrder.map(ball => ({ ...ball })), eliminatedOrder: eliminatedOrder.map(ball => ({ ...ball })) } };
    },
  };
}
module.exports = { createSimulation, STEP };
