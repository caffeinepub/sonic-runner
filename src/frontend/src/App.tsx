import { useCallback, useEffect, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type GameState = "start" | "playing" | "gameover";

interface Sonic {
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  onGround: boolean;
  lives: number;
  invincible: number;
  runFrame: number;
  runTimer: number;
  dead: boolean;
  deadTimer: number;
}

interface Goomba {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  walkFrame: number;
  walkTimer: number;
}

interface Pipe {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Gap {
  id: number;
  x: number;
  w: number;
}

interface Mushroom {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  collected: boolean;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
  speed: number;
}

interface Bush {
  x: number;
  y: number;
  w: number;
  far: boolean; // distant parallax bush
}

interface Mountain {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number; // 0=far, 1=near
}

interface GroundSegment {
  x: number;
  w: number;
}

interface ScorePop {
  value: number;
  x: number;
  y: number;
  timer: number; // ms remaining
}

interface GameData {
  state: GameState;
  score: number;
  highScore: number;
  speed: number;
  spawnTimer: number;
  mushroomTimer: number;
  sonic: Sonic;
  goombas: Goomba[];
  pipes: Pipe[];
  gaps: Gap[];
  mushrooms: Mushroom[];
  clouds: Cloud[];
  bushes: Bush[];
  mountains: Mountain[];
  ground: GroundSegment[];
  idCounter: number;
  lastTime: number;
  paused: boolean;
  frameId: number;
  bgScrollX: number;
  lastScorePop: number; // last score milestone at which we popped
  scorePops: ScorePop[];
  glowPulse: number; // time accumulator for pulsing effects
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GROUND_TOP = 360;
const GRAVITY = 1800;
const JUMP_VY = -779;
const MARIO_W = 32;
const MARIO_H = 40;
const MARIO_X = 80;
const CANVAS_W = 800;
const CANVAS_H = 450;
const BASE_SPEED = 220;
const INVINCIBLE_MS = 2000;
const MAX_SPEED = BASE_SPEED + 18 * 20; // approx max

// ─── Draw helpers ────────────────────────────────────────────────────────────
function drawSkyGradient(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_TOP);
  grad.addColorStop(0, "#0d1b4b");
  grad.addColorStop(0.35, "#1565C0");
  grad.addColorStop(0.75, "#3a8fd1");
  grad.addColorStop(1, "#90CAF9");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, GROUND_TOP);
}

function drawSun(ctx: CanvasRenderingContext2D, glowPulse: number) {
  const sx = CANVAS_W - 100;
  const sy = 60;
  const pulse = 1 + 0.06 * Math.sin(glowPulse * 0.003);
  // Outer glow
  const aura = ctx.createRadialGradient(sx, sy, 10, sx, sy, 55 * pulse);
  aura.addColorStop(0, "rgba(255,230,80,0.45)");
  aura.addColorStop(0.5, "rgba(255,200,40,0.18)");
  aura.addColorStop(1, "rgba(255,180,0,0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(sx, sy, 55 * pulse, 0, Math.PI * 2);
  ctx.fill();
  // Sun disc
  const disc = ctx.createRadialGradient(sx - 6, sy - 6, 2, sx, sy, 20);
  disc.addColorStop(0, "#FFFDE7");
  disc.addColorStop(0.6, "#FFD740");
  disc.addColorStop(1, "#FF8F00");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(sx, sy, 20, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountains(
  ctx: CanvasRenderingContext2D,
  mountains: Mountain[],
  bgScrollX: number,
) {
  // Far layer (slow parallax)
  ctx.save();
  for (const m of mountains) {
    if (m.layer !== 0) continue;
    const ox = (m.x - bgScrollX * 0.15) % (CANVAS_W + 400);
    const grad = ctx.createLinearGradient(ox, m.y, ox, m.y + m.h);
    grad.addColorStop(0, "#3a4a8a");
    grad.addColorStop(1, "#1e2a5a");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(ox, m.y + m.h);
    ctx.lineTo(ox + m.w * 0.1, m.y + m.h * 0.4);
    ctx.lineTo(ox + m.w * 0.2, m.y + m.h * 0.6);
    ctx.lineTo(ox + m.w * 0.35, m.y);
    ctx.lineTo(ox + m.w * 0.5, m.y + m.h * 0.3);
    ctx.lineTo(ox + m.w * 0.65, m.y + m.h * 0.05);
    ctx.lineTo(ox + m.w * 0.8, m.y + m.h * 0.45);
    ctx.lineTo(ox + m.w * 0.9, m.y + m.h * 0.25);
    ctx.lineTo(ox + m.w, m.y + m.h);
    ctx.closePath();
    ctx.fill();
    // Snow cap
    ctx.fillStyle = "rgba(200,220,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(ox + m.w * 0.3, m.y + m.h * 0.12);
    ctx.lineTo(ox + m.w * 0.35, m.y);
    ctx.lineTo(ox + m.w * 0.4, m.y + m.h * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ox + m.w * 0.6, m.y + m.h * 0.15);
    ctx.lineTo(ox + m.w * 0.65, m.y + m.h * 0.05);
    ctx.lineTo(ox + m.w * 0.7, m.y + m.h * 0.13);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Near layer (faster parallax)
  ctx.save();
  for (const m of mountains) {
    if (m.layer !== 1) continue;
    const ox = (m.x - bgScrollX * 0.3) % (CANVAS_W + 400);
    const grad = ctx.createLinearGradient(ox, m.y, ox, m.y + m.h);
    grad.addColorStop(0, "#2c5364");
    grad.addColorStop(1, "#1a2d35");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(ox, m.y + m.h);
    ctx.lineTo(ox + m.w * 0.15, m.y + m.h * 0.2);
    ctx.lineTo(ox + m.w * 0.3, m.y + m.h * 0.55);
    ctx.lineTo(ox + m.w * 0.45, m.y + m.h * 0.1);
    ctx.lineTo(ox + m.w * 0.6, m.y + m.h * 0.4);
    ctx.lineTo(ox + m.w * 0.75, m.y + m.h * 0.08);
    ctx.lineTo(ox + m.w * 0.88, m.y + m.h * 0.35);
    ctx.lineTo(ox + m.w, m.y + m.h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  const h = w * 0.45;
  // Shadow base
  ctx.fillStyle = "rgba(140,170,220,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.92, w * 0.42, h * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  const bumps = [
    { cx: 0.2, cy: 0.62, rx: 0.2, ry: 0.32 },
    { cx: 0.5, cy: 0.38, rx: 0.27, ry: 0.44 },
    { cx: 0.8, cy: 0.55, rx: 0.2, ry: 0.36 },
  ];
  // Gradient cloud
  for (const b of bumps) {
    const bx = x + w * b.cx;
    const by = y + h * b.cy;
    const brad = Math.max(w * b.rx, h * b.ry);
    const cg = ctx.createRadialGradient(
      bx - brad * 0.2,
      by - brad * 0.3,
      brad * 0.1,
      bx,
      by,
      brad,
    );
    cg.addColorStop(0, "rgba(255,255,255,0.98)");
    cg.addColorStop(0.5, "rgba(230,242,255,0.9)");
    cg.addColorStop(1, "rgba(180,210,240,0.6)");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(bx, by, w * b.rx, h * b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBush(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  far: boolean,
) {
  const h = w * 0.5;
  const alpha = far ? 0.5 : 1.0;
  const colTop = far ? `rgba(30,90,40,${alpha})` : `rgba(10,160,40,${alpha})`;
  const colBot = far ? `rgba(10,50,20,${alpha})` : `rgba(0,100,20,${alpha})`;

  ctx.fillStyle = `rgba(0,0,0,${alpha * 0.2})`;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.92, w * 0.42, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  const bumps = [
    { cx: 0.18, cy: 0.62, rx: 0.19, ry: 0.3 },
    { cx: 0.5, cy: 0.38, rx: 0.26, ry: 0.44 },
    { cx: 0.82, cy: 0.6, rx: 0.19, ry: 0.3 },
  ];
  for (const b of bumps) {
    const bx = x + w * b.cx;
    const by = y + h * b.cy;
    const brad = Math.max(w * b.rx, h * b.ry);
    const cg = ctx.createRadialGradient(
      bx - brad * 0.2,
      by - brad * 0.35,
      brad * 0.05,
      bx,
      by,
      brad,
    );
    cg.addColorStop(0, colTop);
    cg.addColorStop(1, colBot);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(bx, by, w * b.rx, h * b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Highlight
  ctx.fillStyle = far ? "rgba(80,200,80,0.12)" : "rgba(120,255,80,0.15)";
  ctx.beginPath();
  ctx.ellipse(
    x + w * 0.38,
    y + h * 0.22,
    w * 0.12,
    h * 0.16,
    -0.3,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

function drawPipe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const capH = 18;
  const bodyX = x + 4;
  const bodyW = w - 8;

  // Danger glow at base
  const dangerGlow = ctx.createRadialGradient(
    x + w / 2,
    y + h,
    0,
    x + w / 2,
    y + h,
    w * 1.2,
  );
  dangerGlow.addColorStop(0, "rgba(255,40,0,0.28)");
  dangerGlow.addColorStop(1, "rgba(255,40,0,0)");
  ctx.fillStyle = dangerGlow;
  ctx.fillRect(x - w * 0.5, y + h - 30, w * 2, 40);

  // Body gradient
  const bodyGrad = ctx.createLinearGradient(bodyX, y, bodyX + bodyW, y);
  bodyGrad.addColorStop(0, "#1ed63a");
  bodyGrad.addColorStop(0.2, "#4fff6a");
  bodyGrad.addColorStop(0.5, "#00c020");
  bodyGrad.addColorStop(0.8, "#008012");
  bodyGrad.addColorStop(1, "#004a08");
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(
    Math.round(bodyX),
    Math.round(y + capH),
    Math.round(bodyW),
    Math.round(h - capH),
  );

  // Inner bevel lines on body
  ctx.strokeStyle = "rgba(0,255,60,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bodyX + 6, y + capH + 4);
  ctx.lineTo(bodyX + 6, y + h - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bodyX + 10, y + capH + 4);
  ctx.lineTo(bodyX + 10, y + h - 4);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.moveTo(bodyX + bodyW - 6, y + capH + 4);
  ctx.lineTo(bodyX + bodyW - 6, y + h - 4);
  ctx.stroke();

  // Cap gradient
  const capGrad = ctx.createLinearGradient(x, y, x + w, y);
  capGrad.addColorStop(0, "#22ee44");
  capGrad.addColorStop(0.18, "#66ff88");
  capGrad.addColorStop(0.5, "#00c828");
  capGrad.addColorStop(0.82, "#007c10");
  capGrad.addColorStop(1, "#003808");
  ctx.fillStyle = capGrad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, capH, [6, 6, 2, 2]);
  ctx.fill();

  // Cap outline glow
  ctx.save();
  ctx.shadowColor = "#00ff44";
  ctx.shadowBlur = 8;
  ctx.strokeStyle = "rgba(100,255,120,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, capH, [6, 6, 2, 2]);
  ctx.stroke();
  ctx.restore();

  // Body outline
  ctx.strokeStyle = "rgba(0,180,40,0.5)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    Math.round(bodyX),
    Math.round(y + capH),
    Math.round(bodyW),
    Math.round(h - capH),
  );
}

function drawGoomba(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: number,
) {
  const legOffset = frame === 0 ? 0 : 2;

  // Goomba body gradient
  const bodyGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  bodyGrad.addColorStop(0, "#c47a30");
  bodyGrad.addColorStop(0.5, "#8B4513");
  bodyGrad.addColorStop(1, "#5C2E00");

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + h * 0.35, w - 4, h * 0.5, 4);
  ctx.fill();

  // Head
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h * 0.5, 8);
  ctx.fill();

  // Eye whites
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(x + 7, y + 10, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w - 7, y + 10, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glowing angry pupils
  ctx.save();
  ctx.shadowColor = "#FF3300";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#CC0000";
  ctx.beginPath();
  ctx.ellipse(x + 8, y + 11, 3, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w - 8, y + 11, 3, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Eyebrows (angry)
  ctx.strokeStyle = "#3a1a00";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 5);
  ctx.lineTo(x + 13, y + 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w - 3, y + 5);
  ctx.lineTo(x + w - 13, y + 8);
  ctx.stroke();

  // Feet
  ctx.fillStyle = "#3a1a00";
  ctx.beginPath();
  ctx.roundRect(x + 1, y + h * 0.83 - legOffset, 11, 8, 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x + w - 12, y + h * 0.83 + legOffset, 11, 8, 2);
  ctx.fill();
}

function drawSonic(
  ctx: CanvasRenderingContext2D,
  sonic: Sonic,
  blinkOn: boolean,
) {
  if (!blinkOn) return;
  const x = sonic.x;
  const y = sonic.y;
  const jumping = !sonic.onGround;
  const frame = sonic.runFrame;

  // Motion blur ghosts
  if (jumping) {
    const ghostAlphas = [0.1, 0.06];
    for (let gi = 0; gi < ghostAlphas.length; gi++) {
      ctx.save();
      ctx.globalAlpha = ghostAlphas[gi];
      ctx.fillStyle = "#0057B8";
      ctx.beginPath();
      ctx.arc(
        x - (gi + 1) * 7 + MARIO_W / 2,
        y + MARIO_H / 2,
        16,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }
  }

  // Shadow (oval gradient)
  const shadowGrad = ctx.createRadialGradient(
    x + MARIO_W / 2,
    GROUND_TOP + 3,
    2,
    x + MARIO_W / 2,
    GROUND_TOP + 3,
    16,
  );
  shadowGrad.addColorStop(0, "rgba(0,0,0,0.38)");
  shadowGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(x + MARIO_W / 2, GROUND_TOP + 3, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (jumping) {
    // Spin-dash ball
    const ballGrad = ctx.createRadialGradient(
      x + MARIO_W / 2 - 4,
      y + MARIO_H / 2 - 4,
      2,
      x + MARIO_W / 2,
      y + MARIO_H / 2,
      16,
    );
    ballGrad.addColorStop(0, "#4dabf7");
    ballGrad.addColorStop(0.5, "#0057B8");
    ballGrad.addColorStop(1, "#003A8C");
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(x + MARIO_W / 2, y + MARIO_H / 2, 16, 0, Math.PI * 2);
    ctx.fill();

    // Spike bumps
    ctx.fillStyle = "#003A8C";
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const sx = x + MARIO_W / 2 + Math.cos(angle) * 13;
      const sy = y + MARIO_H / 2 + Math.sin(angle) * 13;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Eye
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.ellipse(
      x + MARIO_W / 2 + 4,
      y + MARIO_H / 2 - 5,
      5,
      5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(x + MARIO_W / 2 + 6, y + MARIO_H / 2 - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(
      x + MARIO_W / 2 - 5,
      y + MARIO_H / 2 - 7,
      5,
      3,
      -0.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else {
    // Running form
    // Spikes
    ctx.fillStyle = "#003A8C";
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 10);
    ctx.lineTo(x - 9, y + 18);
    ctx.lineTo(x + 2, y + 20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 4);
    ctx.lineTo(x - 7, y + 10);
    ctx.lineTo(x + 2, y + 13);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 10, y - 2);
    ctx.lineTo(x - 3, y + 4);
    ctx.lineTo(x + 4, y + 7);
    ctx.closePath();
    ctx.fill();

    // Body
    const bodyGrad = ctx.createLinearGradient(x + 4, y + 12, x + 26, y + 30);
    bodyGrad.addColorStop(0, "#2979ff");
    bodyGrad.addColorStop(1, "#003A8C");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 12, 22, 18, 6);
    ctx.fill();

    // Belly
    ctx.fillStyle = "#FAD89A";
    ctx.beginPath();
    ctx.ellipse(x + 15, y + 22, 7, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = "#003A8C";
    ctx.beginPath();
    ctx.roundRect(x + 6, y + 28, 8, 10, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + 16, y + 28, 8, 10, 2);
    ctx.fill();

    // Shoes
    const legSwing = frame === 0 ? -3 : frame === 1 ? 0 : 3;
    ctx.fillStyle = "#CC0000";
    ctx.beginPath();
    ctx.roundRect(x + 3, y + MARIO_H - 8 + legSwing, 12, 7, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + 17, y + MARIO_H - 8 - legSwing, 12, 7, 2);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x + 5, y + MARIO_H - 6 + legSwing, 8, 2);
    ctx.fillRect(x + 19, y + MARIO_H - 6 - legSwing, 8, 2);

    // Head
    const headGrad = ctx.createRadialGradient(
      x + MARIO_W / 2,
      y + 8,
      2,
      x + MARIO_W / 2 + 2,
      y + 10,
      14,
    );
    headGrad.addColorStop(0, "#2979ff");
    headGrad.addColorStop(1, "#003A8C");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(x + MARIO_W / 2 + 2, y + 10, 13, 0, Math.PI * 2);
    ctx.fill();

    // Face
    ctx.fillStyle = "#FAD89A";
    ctx.beginPath();
    ctx.ellipse(x + MARIO_W / 2 + 5, y + 13, 8, 7, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.ellipse(x + MARIO_W / 2 + 7, y + 10, 5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(x + MARIO_W / 2 + 8, y + 9, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Eye shine
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(x + MARIO_W / 2 + 7, y + 7, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Arm
    const armSwing = frame === 1 ? 2 : frame === 2 ? 4 : 0;
    ctx.fillStyle = "#0057B8";
    ctx.beginPath();
    ctx.roundRect(x + 24, y + 14 + armSwing, 7, 6, 3);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x + 28, y + 20 + armSwing, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMushroom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  // Stem
  const stemGrad = ctx.createLinearGradient(
    x + w * 0.25,
    y + h * 0.5,
    x + w * 0.75,
    y + h,
  );
  stemGrad.addColorStop(0, "#FFFFFF");
  stemGrad.addColorStop(1, "#D0D0D0");
  ctx.fillStyle = stemGrad;
  ctx.beginPath();
  ctx.roundRect(x + w * 0.25, y + h * 0.5, w * 0.5, h * 0.5, 2);
  ctx.fill();

  // Cap
  const capGrad = ctx.createRadialGradient(
    x + w * 0.38,
    y + h * 0.22,
    2,
    x + w / 2,
    y + h * 0.35,
    w * 0.5,
  );
  capGrad.addColorStop(0, "#FF6B6B");
  capGrad.addColorStop(0.6, "#E52A1E");
  capGrad.addColorStop(1, "#9B1010");
  ctx.fillStyle = capGrad;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.42, w * 0.45, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  // Dots
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x + w * 0.3, y + h * 0.3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.7, y + h * 0.3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.5, y + h * 0.18, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  filled: boolean,
) {
  if (filled) {
    ctx.save();
    ctx.shadowColor = "#FF4466";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#E52A1E";
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
  }
  ctx.beginPath();
  ctx.moveTo(x + size / 2, y + size * 0.85);
  ctx.bezierCurveTo(
    x,
    y + size * 0.4,
    x - size * 0.1,
    y,
    x + size / 2,
    y + size * 0.35,
  );
  ctx.bezierCurveTo(
    x + size * 1.1,
    y,
    x + size,
    y + size * 0.4,
    x + size / 2,
    y + size * 0.85,
  );
  ctx.closePath();
  ctx.fill();
  if (filled) {
    ctx.restore();
    ctx.fillStyle = "rgba(255,160,160,0.4)";
    ctx.beginPath();
    ctx.ellipse(
      x + size * 0.32,
      y + size * 0.38,
      size * 0.14,
      size * 0.09,
      -0.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawGround(ctx: CanvasRenderingContext2D, segments: GroundSegment[]) {
  for (const seg of segments) {
    // Dirt fill gradient
    const dirtGrad = ctx.createLinearGradient(0, GROUND_TOP + 14, 0, CANVAS_H);
    dirtGrad.addColorStop(0, "#a0522d");
    dirtGrad.addColorStop(0.3, "#8B4513");
    dirtGrad.addColorStop(1, "#5c2e00");
    ctx.fillStyle = dirtGrad;
    ctx.fillRect(
      Math.round(seg.x),
      GROUND_TOP + 14,
      Math.round(seg.w),
      CANVAS_H - GROUND_TOP - 14,
    );

    // Brick pattern
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    for (let bx = Math.floor(seg.x / 32) * 32; bx < seg.x + seg.w; bx += 32) {
      for (let by = GROUND_TOP + 14; by < CANVAS_H; by += 18) {
        const offset = ((by - GROUND_TOP) / 18) % 2 === 0 ? 0 : 16;
        ctx.fillRect(bx + offset, by, 30, 16);
      }
    }
    // Brick vertical cracks
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    for (let bx = Math.floor(seg.x / 32) * 32; bx < seg.x + seg.w; bx += 32) {
      ctx.beginPath();
      ctx.moveTo(bx, GROUND_TOP + 14);
      ctx.lineTo(bx, CANVAS_H);
      ctx.stroke();
    }

    // Grass gradient top strip
    const grassGrad = ctx.createLinearGradient(
      0,
      GROUND_TOP,
      0,
      GROUND_TOP + 16,
    );
    grassGrad.addColorStop(0, "#56e838");
    grassGrad.addColorStop(0.3, "#2db820");
    grassGrad.addColorStop(1, "#1a8a10");
    ctx.fillStyle = grassGrad;
    ctx.fillRect(Math.round(seg.x), GROUND_TOP, Math.round(seg.w), 16);

    // Bright top line
    ctx.fillStyle = "rgba(120,255,80,0.45)";
    ctx.fillRect(Math.round(seg.x), GROUND_TOP, Math.round(seg.w), 3);

    // Drop shadow below grass
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(Math.round(seg.x), GROUND_TOP + 14, Math.round(seg.w), 4);

    // Gloss reflection
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(Math.round(seg.x), GROUND_TOP + 6, Math.round(seg.w), 3);
  }
}

function pixelFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "left",
) {
  ctx.font = `bold ${size}px 'Press Start 2P', monospace`;
  ctx.textAlign = align;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// ─── Initial state factories ──────────────────────────────────────────────────
function makeInitialGround(): GroundSegment[] {
  return [{ x: 0, w: CANVAS_W + 200 }];
}

function makeInitialClouds(): Cloud[] {
  return [
    { x: 60, y: 55, w: 130, speed: 15 },
    { x: 230, y: 32, w: 95, speed: 11 },
    { x: 420, y: 70, w: 150, speed: 18 },
    { x: 580, y: 40, w: 110, speed: 13 },
    { x: 690, y: 80, w: 85, speed: 16 },
    { x: 120, y: 115, w: 70, speed: 9 },
    { x: 350, y: 100, w: 100, speed: 12 },
    { x: 720, y: 120, w: 60, speed: 8 },
  ];
}

function makeInitialBushes(): Bush[] {
  return [
    // Far parallax
    { x: 0, y: GROUND_TOP - 60, w: 160, far: true },
    { x: 280, y: GROUND_TOP - 50, w: 130, far: true },
    { x: 560, y: GROUND_TOP - 55, w: 145, far: true },
    // Foreground
    { x: 50, y: GROUND_TOP - 30, w: 90, far: false },
    { x: 260, y: GROUND_TOP - 24, w: 70, far: false },
    { x: 460, y: GROUND_TOP - 32, w: 100, far: false },
    { x: 660, y: GROUND_TOP - 26, w: 80, far: false },
  ];
}

function makeInitialMountains(): Mountain[] {
  return [
    { x: 0, y: 170, w: 450, h: 180, layer: 0 },
    { x: 350, y: 190, w: 400, h: 160, layer: 0 },
    { x: 700, y: 175, w: 380, h: 175, layer: 0 },
    { x: 1050, y: 180, w: 420, h: 170, layer: 0 },
    { x: 0, y: 245, w: 320, h: 120, layer: 1 },
    { x: 280, y: 255, w: 280, h: 105, layer: 1 },
    { x: 520, y: 240, w: 340, h: 120, layer: 1 },
    { x: 820, y: 248, w: 300, h: 112, layer: 1 },
    { x: 1080, y: 242, w: 320, h: 118, layer: 1 },
  ];
}

function initialSonic(): Sonic {
  return {
    x: MARIO_X,
    y: GROUND_TOP - MARIO_H,
    w: MARIO_W,
    h: MARIO_H,
    vy: 0,
    onGround: true,
    lives: 3,
    invincible: 0,
    runFrame: 0,
    runTimer: 0,
    dead: false,
    deadTimer: 0,
  };
}

function createGame(): GameData {
  return {
    state: "start",
    score: 0,
    highScore: Number.parseInt(localStorage.getItem("sonic-hs") ?? "0", 10),
    speed: BASE_SPEED,
    spawnTimer: 0,
    mushroomTimer: 0,
    sonic: initialSonic(),
    goombas: [],
    pipes: [],
    gaps: [],
    mushrooms: [],
    clouds: makeInitialClouds(),
    bushes: makeInitialBushes(),
    mountains: makeInitialMountains(),
    ground: makeInitialGround(),
    idCounter: 0,
    lastTime: 0,
    paused: false,
    frameId: 0,
    bgScrollX: 0,
    lastScorePop: 0,
    scorePops: [],
    glowPulse: 0,
  };
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gRef = useRef<GameData>(createGame());

  const jump = useCallback(() => {
    const g = gRef.current;
    if (g.state === "start") {
      g.state = "playing";
      g.lastTime = performance.now();
      return;
    }
    if (g.state === "gameover") return;
    const m = g.sonic;
    if (m.onGround && !m.dead) {
      m.vy = JUMP_VY;
      m.onGround = false;
    }
  }, []);

  const restart = useCallback(() => {
    const g = gRef.current;
    const hs = g.highScore;
    const newG = createGame();
    newG.state = "playing";
    newG.highScore = hs;
    newG.lastTime = performance.now();
    gRef.current = newG;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";
    document.head.appendChild(link);

    function spawnObstacle(g: GameData) {
      const r = Math.random();
      const id = ++g.idCounter;
      if (r < 0.35) {
        g.goombas.push({
          id,
          x: CANVAS_W + 20,
          y: GROUND_TOP - 32,
          w: 32,
          h: 32,
          walkFrame: 0,
          walkTimer: 0,
        });
      } else if (r < 0.65) {
        // Short pipe — jumpable
        const ph = 55 + Math.random() * 30;
        g.pipes.push({
          id,
          x: CANVAS_W + 10,
          y: GROUND_TOP - ph,
          w: 44,
          h: ph,
        });
      } else {
        const gapW = 60 + Math.random() * 40;
        g.gaps.push({ id, x: CANVAS_W + 10, w: gapW });
      }
    }

    function spawnMushroom(g: GameData) {
      if (g.sonic.lives >= 3) return;
      const id = ++g.idCounter;
      g.mushrooms.push({
        id,
        x: CANVAS_W + 10,
        y: GROUND_TOP - 28,
        w: 24,
        h: 28,
        collected: false,
      });
    }

    function aabb(
      ax: number,
      ay: number,
      aw: number,
      ah: number,
      bx: number,
      by: number,
      bw: number,
      bh: number,
    ) {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function hitSonic(g: GameData) {
      if (g.sonic.invincible > 0) return;
      g.sonic.lives -= 1;
      if (g.sonic.lives <= 0) {
        g.sonic.dead = true;
        g.sonic.deadTimer = 1000;
        g.sonic.vy = JUMP_VY * 0.8;
      } else {
        g.sonic.invincible = INVINCIBLE_MS;
      }
    }

    function update(dt: number, g: GameData) {
      const m = g.sonic;
      const spd = g.speed;

      g.score += dt * 0.06;
      g.speed = BASE_SPEED + Math.floor(g.score / 500) * 18;
      g.glowPulse += dt;

      // Score pop at every 500
      const milestone = Math.floor(g.score / 500) * 500;
      if (milestone > 0 && milestone > g.lastScorePop) {
        g.lastScorePop = milestone;
        g.scorePops.push({ value: 500, x: CANVAS_W - 80, y: 80, timer: 900 });
      }
      // Update pops
      g.scorePops = g.scorePops.filter((p) => {
        p.timer -= dt;
        p.y -= dt * 0.04;
        return p.timer > 0;
      });

      // Parallax bg scroll
      g.bgScrollX += spd * dt * 0.001 * 0.5;

      // Clouds
      for (const c of g.clouds) {
        c.x -= c.speed * dt * 0.001;
        if (c.x + c.w < 0) c.x = CANVAS_W + c.w;
      }

      // Bushes
      for (const b of g.bushes) {
        const bspd = b.far ? spd * 0.35 : spd;
        b.x -= bspd * dt * 0.001;
        if (b.x + b.w < 0) b.x = CANVAS_W + b.w + 10;
      }

      // Ground segments
      for (const seg of g.ground) {
        seg.x -= spd * dt * 0.001;
      }
      const lastSeg = g.ground[g.ground.length - 1];
      if (lastSeg && lastSeg.x + lastSeg.w < CANVAS_W + 400) {
        g.ground.push({ x: lastSeg.x + lastSeg.w, w: 400 });
      }
      g.ground = g.ground.filter((s) => s.x + s.w > 0);

      // Sonic physics
      if (!m.dead) {
        m.vy += GRAVITY * dt * 0.001;
        m.y += m.vy * dt * 0.001;

        const mCenterX = m.x + m.w / 2;
        let overGap = true;
        for (const seg of g.ground) {
          if (mCenterX >= seg.x && mCenterX <= seg.x + seg.w) {
            overGap = false;
            break;
          }
        }
        for (const gap of g.gaps) {
          if (mCenterX >= gap.x && mCenterX <= gap.x + gap.w) {
            overGap = true;
            break;
          }
        }

        if (!overGap && m.y + m.h >= GROUND_TOP) {
          m.y = GROUND_TOP - m.h;
          m.vy = 0;
          m.onGround = true;
        } else if (overGap) {
          m.onGround = false;
          if (m.y > CANVAS_H + 50) {
            hitSonic(g);
            m.y = GROUND_TOP - m.h;
            m.vy = 0;
            m.onGround = true;
          }
        } else {
          m.onGround = false;
        }

        if (m.onGround) {
          m.runTimer += dt;
          if (m.runTimer > 100) {
            m.runFrame = (m.runFrame + 1) % 3;
            m.runTimer = 0;
          }
        }
        if (m.invincible > 0) m.invincible -= dt;
      } else {
        m.vy += GRAVITY * dt * 0.001;
        m.y += m.vy * dt * 0.001;
        m.deadTimer -= dt;
        if (m.deadTimer <= 0 || m.y > CANVAS_H + 60) {
          g.state = "gameover";
          if (g.score > g.highScore) {
            g.highScore = g.score;
            localStorage.setItem("sonic-hs", String(Math.floor(g.score)));
          }
        }
      }

      // Spawn
      g.spawnTimer -= dt;
      if (g.spawnTimer <= 0) {
        spawnObstacle(g);
        g.spawnTimer =
          1000 + Math.random() * 1200 - Math.floor(g.score / 1000) * 80;
        g.spawnTimer = Math.max(g.spawnTimer, 500);
      }
      g.mushroomTimer -= dt;
      if (g.mushroomTimer <= 0) {
        spawnMushroom(g);
        g.mushroomTimer = 8000 + Math.random() * 6000;
      }

      // Goombas
      g.goombas = g.goombas.filter((gb) => {
        gb.x -= spd * dt * 0.001;
        gb.walkTimer += dt;
        if (gb.walkTimer > 200) {
          gb.walkFrame = (gb.walkFrame + 1) % 2;
          gb.walkTimer = 0;
        }
        if (
          !m.dead &&
          aabb(m.x + 4, m.y + 4, m.w - 8, m.h - 4, gb.x, gb.y, gb.w, gb.h)
        ) {
          hitSonic(g);
          return false;
        }
        return gb.x + gb.w > -10;
      });

      // Pipes
      g.pipes = g.pipes.filter((p) => {
        p.x -= spd * dt * 0.001;
        if (
          !m.dead &&
          aabb(m.x + 4, m.y + 4, m.w - 8, m.h - 4, p.x, p.y, p.w, p.h)
        ) {
          hitSonic(g);
          p.x = -200;
        }
        return p.x + p.w > -10;
      });

      // Gaps
      g.gaps = g.gaps.filter((gp) => {
        gp.x -= spd * dt * 0.001;
        return gp.x + gp.w > -10;
      });

      // Mushrooms
      g.mushrooms = g.mushrooms.filter((mu) => {
        mu.x -= spd * dt * 0.001;
        if (
          !mu.collected &&
          !m.dead &&
          aabb(m.x, m.y, m.w, m.h, mu.x, mu.y, mu.w, mu.h)
        ) {
          mu.collected = true;
          if (m.lives < 3) m.lives += 1;
          return false;
        }
        return mu.x + mu.w > -10 && !mu.collected;
      });
    }

    function drawHUD(ctx: CanvasRenderingContext2D, g: GameData) {
      // Glassy score box
      ctx.save();
      ctx.shadowColor = "rgba(0,150,255,0.4)";
      ctx.shadowBlur = 12;
      const scoreGrad = ctx.createLinearGradient(
        CANVAS_W - 160,
        10,
        CANVAS_W - 10,
        62,
      );
      scoreGrad.addColorStop(0, "rgba(10,20,50,0.78)");
      scoreGrad.addColorStop(1, "rgba(5,10,30,0.88)");
      ctx.fillStyle = scoreGrad;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W - 160, 10, 150, 52, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(100,180,255,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W - 160, 10, 150, 52, 8);
      ctx.stroke();
      ctx.restore();
      pixelFont(ctx, "SCORE", CANVAS_W - 150, 30, 7, "#FFD700");
      pixelFont(
        ctx,
        String(Math.floor(g.score)).padStart(6, "0"),
        CANVAS_W - 150,
        52,
        10,
        "#FFFFFF",
      );

      // HI score
      ctx.save();
      ctx.shadowColor = "rgba(0,150,255,0.4)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "rgba(10,20,50,0.78)";
      ctx.beginPath();
      ctx.roundRect(CANVAS_W / 2 - 80, 10, 160, 52, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(100,180,255,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W / 2 - 80, 10, 160, 52, 8);
      ctx.stroke();
      ctx.restore();
      pixelFont(ctx, "HI-SCORE", CANVAS_W / 2 - 70, 30, 7, "#FFD700");
      pixelFont(
        ctx,
        String(Math.floor(g.highScore)).padStart(6, "0"),
        CANVAS_W / 2 - 70,
        52,
        10,
        "#FFFFFF",
      );

      // Lives box
      ctx.save();
      ctx.shadowColor = "rgba(255,50,100,0.4)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(10,20,50,0.78)";
      ctx.beginPath();
      ctx.roundRect(10, 10, 110, 44, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,100,150,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(10, 10, 110, 44, 8);
      ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 3; i++)
        drawHeart(ctx, 18 + i * 34, 18, 24, i < g.sonic.lives);

      // Speed bar at bottom
      const barW = 200;
      const barX = CANVAS_W / 2 - barW / 2;
      const barY = CANVAS_H - 16;
      const speedRatio = Math.min(
        (g.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED),
        1,
      );
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, 8, 4);
      ctx.fill();
      const sbarGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      sbarGrad.addColorStop(0, "#00cfff");
      sbarGrad.addColorStop(0.6, "#0057B8");
      sbarGrad.addColorStop(1, "#ff3b3b");
      ctx.fillStyle = sbarGrad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * speedRatio + 4, 8, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, 8, 4);
      ctx.stroke();

      // Score pops
      for (const pop of g.scorePops) {
        const alpha = Math.min(1, pop.timer / 300);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = 16;
        ctx.font = "bold 14px 'Press Start 2P', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#FFD700";
        ctx.fillText(`+${pop.value}`, pop.x, pop.y);
        ctx.restore();
      }
    }

    function drawStartScreen(ctx: CanvasRenderingContext2D, g: GameData) {
      // Dramatic gradient overlay
      const overlayGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      overlayGrad.addColorStop(0, "rgba(5,5,30,0.82)");
      overlayGrad.addColorStop(0.5, "rgba(0,10,50,0.72)");
      overlayGrad.addColorStop(1, "rgba(0,0,20,0.85)");
      ctx.fillStyle = overlayGrad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Panel
      ctx.save();
      ctx.shadowColor = "#0057B8";
      ctx.shadowBlur = 30;
      const panelGrad = ctx.createLinearGradient(
        CANVAS_W / 2 - 200,
        90,
        CANVAS_W / 2 + 200,
        290,
      );
      panelGrad.addColorStop(0, "rgba(8,16,60,0.9)");
      panelGrad.addColorStop(1, "rgba(2,6,30,0.95)");
      ctx.fillStyle = panelGrad;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W / 2 - 210, 90, 420, 210, 16);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(0,140,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W / 2 - 210, 90, 420, 210, 16);
      ctx.stroke();

      // Pulsing title glow
      const pulse = 0.7 + 0.3 * Math.sin(g.glowPulse * 0.004);
      ctx.save();
      ctx.shadowColor = "#0057B8";
      ctx.shadowBlur = 30 * pulse;
      pixelFont(ctx, "SONIC", CANVAS_W / 2, 152, 26, "#2979ff", "center");
      ctx.restore();
      ctx.save();
      ctx.shadowColor = "#FFFFFF";
      ctx.shadowBlur = 14 * pulse;
      pixelFont(ctx, "RUNNER", CANVAS_W / 2, 188, 26, "#FFFFFF", "center");
      ctx.restore();

      const blink = Math.floor(Date.now() / 600) % 2 === 0;
      if (blink) {
        ctx.save();
        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = 12;
        pixelFont(
          ctx,
          "PRESS SPACE / TAP",
          CANVAS_W / 2,
          256,
          8,
          "#FFD700",
          "center",
        );
        ctx.restore();
      }
    }

    function drawGameOver(ctx: CanvasRenderingContext2D, g: GameData) {
      const overlayGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      overlayGrad.addColorStop(0, "rgba(30,0,0,0.82)");
      overlayGrad.addColorStop(0.5, "rgba(10,0,0,0.75)");
      overlayGrad.addColorStop(1, "rgba(0,0,0,0.88)");
      ctx.fillStyle = overlayGrad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.save();
      ctx.shadowColor = "#E52A1E";
      ctx.shadowBlur = 30;
      const panelGrad = ctx.createLinearGradient(
        CANVAS_W / 2 - 200,
        70,
        CANVAS_W / 2 + 200,
        330,
      );
      panelGrad.addColorStop(0, "rgba(40,5,5,0.92)");
      panelGrad.addColorStop(1, "rgba(10,0,0,0.95)");
      ctx.fillStyle = panelGrad;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W / 2 - 210, 70, 420, 270, 16);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(229,42,30,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W / 2 - 210, 70, 420, 270, 16);
      ctx.stroke();

      const pulse = 0.7 + 0.3 * Math.sin(g.glowPulse * 0.004);
      ctx.save();
      ctx.shadowColor = "#E52A1E";
      ctx.shadowBlur = 28 * pulse;
      pixelFont(ctx, "GAME OVER", CANVAS_W / 2, 132, 18, "#E52A1E", "center");
      ctx.restore();

      pixelFont(
        ctx,
        `SCORE: ${Math.floor(g.score).toString().padStart(6, "0")}`,
        CANVAS_W / 2,
        172,
        9,
        "#FFFFFF",
        "center",
      );
      pixelFont(
        ctx,
        `BEST:  ${Math.floor(g.highScore).toString().padStart(6, "0")}`,
        CANVAS_W / 2,
        198,
        9,
        "#FFD700",
        "center",
      );

      // Play again button
      ctx.save();
      ctx.shadowColor = "#E52A1E";
      ctx.shadowBlur = 16;
      const btnGrad = ctx.createLinearGradient(
        CANVAS_W / 2 - 100,
        228,
        CANVAS_W / 2 + 100,
        276,
      );
      btnGrad.addColorStop(0, "#c0392b");
      btnGrad.addColorStop(1, "#96281b");
      ctx.fillStyle = btnGrad;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W / 2 - 100, 228, 200, 48, 8);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(255,120,100,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W / 2 - 100, 228, 200, 48, 8);
      ctx.stroke();
      pixelFont(ctx, "PLAY AGAIN", CANVAS_W / 2, 260, 9, "#FFFFFF", "center");
    }

    function draw(g: GameData) {
      if (!ctx) return;

      // Sky gradient
      drawSkyGradient(ctx);

      // Sun
      drawSun(ctx, g.glowPulse);

      // Mountains (parallax)
      drawMountains(ctx, g.mountains, g.bgScrollX);

      // Clouds
      for (const c of g.clouds) drawCloud(ctx, c.x, c.y, c.w);

      // Far bushes (parallax)
      for (const b of g.bushes) {
        if (b.far) drawBush(ctx, b.x, b.y, b.w, true);
      }

      // Ground
      drawGround(ctx, g.ground);

      // Gap void
      for (const gap of g.gaps) {
        const voidGrad = ctx.createLinearGradient(0, GROUND_TOP, 0, CANVAS_H);
        voidGrad.addColorStop(0, "#000820");
        voidGrad.addColorStop(1, "#000005");
        ctx.fillStyle = voidGrad;
        ctx.fillRect(gap.x, GROUND_TOP, gap.w, CANVAS_H - GROUND_TOP);
        // Edge highlights
        ctx.fillStyle = "rgba(0,100,255,0.15)";
        ctx.fillRect(gap.x, GROUND_TOP, 3, CANVAS_H - GROUND_TOP);
        ctx.fillRect(gap.x + gap.w - 3, GROUND_TOP, 3, CANVAS_H - GROUND_TOP);
      }

      // Foreground bushes
      for (const b of g.bushes) {
        if (!b.far) drawBush(ctx, b.x, b.y, b.w, false);
      }

      // Pipes
      for (const p of g.pipes) drawPipe(ctx, p.x, p.y, p.w, p.h);

      // Mushrooms
      for (const mu of g.mushrooms) drawMushroom(ctx, mu.x, mu.y, mu.w, mu.h);

      // Goombas
      for (const gb of g.goombas)
        drawGoomba(ctx, gb.x, gb.y, gb.w, gb.h, gb.walkFrame);

      // Sonic
      const blinkOn =
        g.sonic.invincible <= 0 ||
        Math.floor(g.sonic.invincible / 120) % 2 === 0;
      drawSonic(ctx, g.sonic, blinkOn);

      // HUD
      drawHUD(ctx, g);

      // Overlays
      if (g.state === "start") drawStartScreen(ctx, g);
      if (g.state === "gameover") drawGameOver(ctx, g);
    }

    function gameLoop(timestamp: number) {
      const g = gRef.current;
      if (g.paused || g.state === "start" || g.state === "gameover") {
        g.glowPulse += 16;
        draw(g);
        g.frameId = requestAnimationFrame(gameLoop);
        return;
      }

      const dt = Math.min(timestamp - g.lastTime, 50);
      g.lastTime = timestamp;
      update(dt, g);
      draw(g);
      g.frameId = requestAnimationFrame(gameLoop);
    }

    const g = gRef.current;
    g.frameId = requestAnimationFrame(gameLoop);

    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (gRef.current.state === "gameover") {
          restart();
          return;
        }
        jump();
      }
    }
    function onTouch(e: TouchEvent) {
      e.preventDefault();
      if (gRef.current.state === "gameover") {
        restart();
        return;
      }
      jump();
    }
    function onCanvasClick() {
      if (gRef.current.state === "gameover") {
        restart();
        return;
      }
      jump();
    }
    function onBlur() {
      gRef.current.paused = true;
    }
    function onFocus() {
      gRef.current.paused = false;
      gRef.current.lastTime = performance.now();
    }

    document.addEventListener("keydown", onKey);
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("click", onCanvasClick);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelAnimationFrame(g.frameId);
      document.removeEventListener("keydown", onKey);
      canvas.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("click", onCanvasClick);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.head.removeChild(link);
    };
  }, [jump, restart]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(160deg, #050818 0%, #0b1a3a 50%, #0d0d20 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Press Start 2P', monospace",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 860,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            color: "#FFD700",
            fontSize: 13,
            letterSpacing: 1,
            textShadow: "0 0 12px rgba(255,215,0,0.6)",
          }}
        >
          ⚡ SONIC RUNNER
        </span>
        <span style={{ color: "#6a8aaa", fontSize: 9 }}>
          SPACE / TAP TO JUMP
        </span>
      </div>

      <div
        style={{
          position: "relative",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow:
            "0 0 60px rgba(0,87,184,0.6), 0 0 120px rgba(0,30,90,0.8), 0 20px 60px rgba(0,0,0,0.9)",
          border: "2px solid rgba(0,120,255,0.4)",
          width: "100%",
          maxWidth: CANVAS_W,
          aspectRatio: `${CANVAS_W}/${CANVAS_H}`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          data-ocid="game.canvas_target"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            cursor: "pointer",
          }}
        />
      </div>

      <footer
        style={{
          marginTop: 18,
          color: "#334",
          fontSize: 8,
          textAlign: "center",
        }}
      >
        © {new Date().getFullYear()}. Built with ❤️ using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#0057B8", textDecoration: "none" }}
        >
          caffeine.ai
        </a>
      </footer>
    </div>
  );
}
