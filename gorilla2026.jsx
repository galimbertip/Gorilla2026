import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const W = 390;   // logical canvas width  (iPhone 14 width)
const H = 700;   // logical canvas height
const GRAVITY = 9.8;
const DT = 0.04;
const BANANA_R = 10;
const GORILLA_W = 48;
const GORILLA_H = 56;
const EXPLOSION_R = 38;
const MAX_BUILDINGS = 8;
const WIND_ARROW_MAX = 80;

// Neon palette
const NEON = {
  bg:       "#070712",
  grid:     "#0d1a2e",
  sky:      "#0a0e1a",
  p1:       "#00ffe0",   // cyan  – Player 1
  p2:       "#ff3c78",   // pink  – Player 2
  banana:   "#ffe600",
  explosion:"#ff6a00",
  building: ["#0d1f3c","#0f2545","#102a4c","#0e2038","#112850"],
  window:   ["#ffe600","#00ffe0","#ff3c78","#ffffff","#b0f0ff"],
  road:     "#111827",
  moon:     "#c8e6ff",
  star:     "#e0f0ff",
  hud:      "#0a0e1a",
  hudBorder:"#1a2f5a",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randBetween(a, b) { return a + Math.random() * (b - a); }

function buildCity() {
  const buildings = [];
  const minW = W / (MAX_BUILDINGS + 1);
  const maxW = W / (MAX_BUILDINGS - 1);
  let x = 0;
  for (let i = 0; i < MAX_BUILDINGS; i++) {
    const w = i === MAX_BUILDINGS - 1 ? W - x : randBetween(minW, maxW);
    const h = randBetween(H * 0.22, H * 0.55);
    const color = NEON.building[Math.floor(Math.random() * NEON.building.length)];
    const windows = [];
    const wCols = Math.floor(w / 14);
    const wRows = Math.floor(h / 18);
    for (let r = 0; r < wRows; r++) {
      for (let c = 0; c < wCols; c++) {
        if (Math.random() > 0.3) {
          windows.push({
            x: x + 5 + c * 14,
            y: H - h + 5 + r * 18,
            on: Math.random() > 0.35,
            col: NEON.window[Math.floor(Math.random() * NEON.window.length)],
          });
        }
      }
    }
    buildings.push({ x, y: H - h, w, h, color, windows });
    x += w;
  }
  return buildings;
}

function placeGorillas(buildings) {
  const b1 = buildings[1];
  const b2 = buildings[buildings.length - 2];
  return [
    { x: b1.x + b1.w / 2 - GORILLA_W / 2, y: b1.y - GORILLA_H, building: 1 },
    { x: b2.x + b2.w / 2 - GORILLA_W / 2, y: b2.y - GORILLA_H, building: buildings.length - 2 },
  ];
}

function generateStars(n) {
  return Array.from({ length: n }, () => ({
    x: Math.random() * W,
    y: Math.random() * H * 0.45,
    r: Math.random() * 1.5 + 0.3,
    a: Math.random(),
  }));
}

// Physics: projectile with wind
function stepBanana(pos, vel, wind) {
  return {
    pos: { x: pos.x + vel.x * DT, y: pos.y + vel.y * DT },
    vel: { x: vel.x + wind * DT, y: vel.y + GRAVITY * DT },
  };
}

// Check collision with buildings
function checkBuildingHit(pos, buildings) {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= H) {
      return i;
    }
  }
  return -1;
}

// Check gorilla hit
function checkGorillaHit(pos, gorillas, shooter) {
  for (let i = 0; i < gorillas.length; i++) {
    if (i === shooter) continue;
    const g = gorillas[i];
    const cx = g.x + GORILLA_W / 2;
    const cy = g.y + GORILLA_H / 2;
    const dx = pos.x - cx, dy = pos.y - cy;
    if (Math.sqrt(dx * dx + dy * dy) < EXPLOSION_R * 0.7) return i;
  }
  return -1;
}

// Destroy building pixels in radius
function destroyBuilding(buildings, cx, cy, radius) {
  return buildings.map(b => {
    const newW = b.windows.map(w => {
      const wx = w.x + 5, wy = w.y + 5;
      const dx = wx - cx, dy = wy - cy;
      return Math.sqrt(dx * dx + dy * dy) < radius ? { ...w, on: false } : w;
    });
    // Cut a circle out of building top
    return { ...b, windows: newW, craters: [...(b.craters || []), { cx, cy, r: radius }] };
  });
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawBackground(ctx, stars) {
  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.6);
  grad.addColorStop(0, "#030610");
  grad.addColorStop(1, "#0a0e1a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Grid lines (cyberpunk perspective)
  ctx.strokeStyle = NEON.grid;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= W; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H * 0.6); ctx.stroke();
  }
  for (let y = 0; y <= H * 0.6; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Stars
  stars.forEach(s => {
    ctx.globalAlpha = 0.4 + s.a * 0.6;
    ctx.fillStyle = NEON.star;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Moon
  ctx.save();
  ctx.fillStyle = NEON.moon;
  ctx.shadowColor = NEON.moon;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(W * 0.78, H * 0.12, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBuildings(ctx, buildings) {
  buildings.forEach(b => {
    // Body
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // Neon edge highlight
    ctx.strokeStyle = "#1a3a6a";
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y, b.w, b.h);

    // Top glow line
    ctx.strokeStyle = "#2a4a8a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.w, b.y);
    ctx.stroke();

    // Apply craters (clip circles)
    if (b.craters) {
      b.craters.forEach(cr => {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        const g2 = ctx.createRadialGradient(cr.cx, cr.cy, 0, cr.cx, cr.cy, cr.r);
        g2.addColorStop(0, "rgba(0,0,0,1)");
        g2.addColorStop(0.7, "rgba(0,0,0,0.8)");
        g2.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(cr.cx, cr.cy, cr.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // Windows
    b.windows.forEach(w => {
      if (!w.on) return;
      ctx.fillStyle = w.col;
      ctx.shadowColor = w.col;
      ctx.shadowBlur = 6;
      ctx.fillRect(w.x, w.y, 8, 10);
      ctx.shadowBlur = 0;
    });
  });
}

function drawRoad(ctx) {
  ctx.fillStyle = NEON.road;
  ctx.fillRect(0, H - 18, W, 18);
  ctx.strokeStyle = "#1e3a5a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 18);
  ctx.lineTo(W, H - 18);
  ctx.stroke();
  // Dashed center line
  ctx.setLineDash([20, 15]);
  ctx.strokeStyle = "#ffe600";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, H - 9);
  ctx.lineTo(W, H - 9);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGorilla(ctx, gx, gy, player, celebrating, throwing) {
  const color = player === 0 ? NEON.p1 : NEON.p2;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(gx + 10, gy + 18, 28, 26);

  // Head
  ctx.beginPath();
  ctx.arc(gx + 24, gy + 12, 13, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = NEON.bg;
  ctx.beginPath();
  ctx.arc(gx + 19, gy + 10, 3.5, 0, Math.PI * 2);
  ctx.arc(gx + 29, gy + 10, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(gx + 20, gy + 10, 1.5, 0, Math.PI * 2);
  ctx.arc(gx + 30, gy + 10, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  ctx.strokeStyle = NEON.bg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (celebrating) {
    ctx.arc(gx + 24, gy + 17, 5, 0, Math.PI);
  } else {
    ctx.arc(gx + 24, gy + 19, 4, Math.PI, 0);
  }
  ctx.stroke();

  // Arms
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  if (throwing) {
    // Throwing arm up
    ctx.beginPath();
    ctx.moveTo(gx + 10, gy + 24);
    ctx.lineTo(gx - 8, gy + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx + 38, gy + 24);
    ctx.lineTo(gx + 54, gy + 44);
    ctx.stroke();
  } else if (celebrating) {
    ctx.beginPath();
    ctx.moveTo(gx + 10, gy + 24);
    ctx.lineTo(gx - 10, gy + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx + 38, gy + 24);
    ctx.lineTo(gx + 58, gy + 6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(gx + 10, gy + 24);
    ctx.lineTo(gx - 6, gy + 34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx + 38, gy + 24);
    ctx.lineTo(gx + 54, gy + 34);
    ctx.stroke();
  }

  // Legs
  ctx.beginPath();
  ctx.moveTo(gx + 16, gy + 44);
  ctx.lineTo(gx + 14, gy + 56);
  ctx.moveTo(gx + 32, gy + 44);
  ctx.lineTo(gx + 34, gy + 56);
  ctx.stroke();

  ctx.restore();
}

function drawBanana(ctx, pos, vel, t) {
  ctx.save();
  const angle = Math.atan2(vel.y, vel.x) + Math.PI / 4;
  ctx.translate(pos.x, pos.y);
  ctx.rotate(t * 8);
  ctx.fillStyle = NEON.banana;
  ctx.shadowColor = NEON.banana;
  ctx.shadowBlur = 18;
  // Simple banana shape
  ctx.beginPath();
  ctx.ellipse(0, 0, BANANA_R, BANANA_R * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Curve detail
  ctx.strokeStyle = "#c8a000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, BANANA_R * 0.6, 0.3, Math.PI - 0.3);
  ctx.stroke();
  ctx.restore();
}

function drawExplosion(ctx, ex, particles, t) {
  if (!ex) return;
  const progress = (t - ex.t0) / ex.duration;
  if (progress > 1) return;

  ctx.save();
  // Shockwave
  ctx.strokeStyle = NEON.explosion;
  ctx.lineWidth = 3 * (1 - progress);
  ctx.globalAlpha = (1 - progress) * 0.8;
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, EXPLOSION_R * progress * 1.5, 0, Math.PI * 2);
  ctx.stroke();

  // Core flash
  const g = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, EXPLOSION_R * (1 - progress * 0.5));
  g.addColorStop(0, `rgba(255,255,200,${(1 - progress) * 0.9})`);
  g.addColorStop(0.3, `rgba(255,106,0,${(1 - progress) * 0.7})`);
  g.addColorStop(1, "rgba(255,60,0,0)");
  ctx.fillStyle = g;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, EXPLOSION_R * (1 - progress * 0.3), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Particles
  if (particles) {
    particles.forEach(p => {
      const px = p.x + p.vx * progress * 40;
      const py = p.y + p.vy * progress * 40 + 0.5 * GRAVITY * progress * progress * 20;
      ctx.save();
      ctx.globalAlpha = (1 - progress);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, p.r * (1 - progress * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}

function drawHUD(ctx, scores, turn, wind, gamePhase, angle, power) {
  // HUD background
  ctx.fillStyle = "rgba(7,7,18,0.92)";
  ctx.fillRect(0, 0, W, 58);
  ctx.strokeStyle = NEON.hudBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 58);
  ctx.lineTo(W, 58);
  ctx.stroke();

  // Player scores
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = NEON.p1;
  ctx.shadowColor = NEON.p1;
  ctx.shadowBlur = 8;
  ctx.fillText(`P1: ${scores[0]}`, 14, 18);
  ctx.shadowBlur = 0;

  ctx.fillStyle = NEON.p2;
  ctx.shadowColor = NEON.p2;
  ctx.shadowBlur = 8;
  ctx.fillText(`P2: ${scores[1]}`, W - 60, 18);
  ctx.shadowBlur = 0;

  // Turn indicator
  const turnColor = turn === 0 ? NEON.p1 : NEON.p2;
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.fillStyle = turnColor;
  ctx.shadowColor = turnColor;
  ctx.shadowBlur = 12;
  ctx.textAlign = "center";
  ctx.fillText(`▶ P${turn + 1} FIRES`, W / 2, 18);
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";

  // Wind indicator
  const wx = W / 2 - 55;
  ctx.fillStyle = "#556a8a";
  ctx.font = "9px 'Courier New', monospace";
  ctx.fillText("WIND", wx, 36);
  ctx.strokeStyle = "#334466";
  ctx.lineWidth = 1;
  ctx.strokeRect(wx + 30, 28, WIND_ARROW_MAX, 10);
  const windPx = Math.min(Math.abs(wind) / 20 * WIND_ARROW_MAX, WIND_ARROW_MAX);
  const windX = wind >= 0 ? wx + 30 : wx + 30 + WIND_ARROW_MAX - windPx;
  ctx.fillStyle = wind >= 0 ? "#00ffe0" : "#ff3c78";
  ctx.fillRect(windX, 28, windPx, 10);
  ctx.fillStyle = "#8899bb";
  ctx.font = "8px 'Courier New', monospace";
  ctx.fillText(wind >= 0 ? "→" : "←", wx + 140, 37);

  // Angle / Power display
  if (gamePhase === "aiming") {
    ctx.fillStyle = turnColor;
    ctx.font = "10px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText(`ANG ${Math.round(angle)}°  PWR ${Math.round(power)}`, W - 14, 36);
    ctx.textAlign = "left";

    // Power bar
    ctx.strokeStyle = "#334466";
    ctx.lineWidth = 1;
    ctx.strokeRect(14, 44, 120, 8);
    const pwrGrad = ctx.createLinearGradient(14, 0, 134, 0);
    pwrGrad.addColorStop(0, "#00ffe0");
    pwrGrad.addColorStop(0.5, "#ffe600");
    pwrGrad.addColorStop(1, "#ff3c78");
    ctx.fillStyle = pwrGrad;
    ctx.fillRect(14, 44, (power / 100) * 120, 8);

    // Angle arc hint
    ctx.strokeStyle = turnColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    const gRef = turn === 0 ? gorRef.current : gorRef2.current;
    if (gRef) {
      const cx = gRef.x + GORILLA_W / 2;
      const cy = gRef.y + GORILLA_H / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 30, -Math.PI, 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// These refs need to be accessible in drawHUD — we'll pass them as params instead
function drawHUDFull(ctx, scores, turn, wind, gamePhase, angle, power, gorillas) {
  ctx.fillStyle = "rgba(7,7,18,0.92)";
  ctx.fillRect(0, 0, W, 58);
  ctx.strokeStyle = NEON.hudBorder;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 58); ctx.lineTo(W, 58); ctx.stroke();

  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = NEON.p1; ctx.shadowColor = NEON.p1; ctx.shadowBlur = 8;
  ctx.fillText(`P1: ${scores[0]}`, 14, 18); ctx.shadowBlur = 0;
  ctx.fillStyle = NEON.p2; ctx.shadowColor = NEON.p2; ctx.shadowBlur = 8;
  ctx.fillText(`P2: ${scores[1]}`, W - 60, 18); ctx.shadowBlur = 0;

  const turnColor = turn === 0 ? NEON.p1 : NEON.p2;
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.fillStyle = turnColor; ctx.shadowColor = turnColor; ctx.shadowBlur = 12;
  ctx.textAlign = "center";
  ctx.fillText(gamePhase === "flying" ? "◉ INCOMING" : `▶ P${turn + 1} FIRES`, W / 2, 18);
  ctx.shadowBlur = 0; ctx.textAlign = "left";

  // Wind
  const wx = W / 2 - 65;
  ctx.fillStyle = "#556a8a"; ctx.font = "9px 'Courier New', monospace";
  ctx.fillText("WIND", wx, 36);
  ctx.strokeStyle = "#334466"; ctx.lineWidth = 1;
  ctx.strokeRect(wx + 32, 27, 80, 10);
  const windPx = Math.min(Math.abs(wind) / 20 * 80, 80);
  const windX = wind >= 0 ? wx + 32 : wx + 32 + 80 - windPx;
  ctx.fillStyle = wind >= 0 ? "#00ffe0" : "#ff3c78";
  ctx.fillRect(windX, 27, windPx, 10);
  ctx.fillStyle = "#8899bb"; ctx.font = "10px 'Courier New', monospace";
  ctx.fillText(wind >= 0 ? "→" : "←", wx + 118, 36);
  ctx.fillStyle = "#556a8a"; ctx.font = "8px 'Courier New', monospace";
  ctx.fillText(`${Math.abs(wind).toFixed(1)}`, wx + 128, 36);

  if (gamePhase === "aiming") {
    ctx.fillStyle = turnColor; ctx.font = "bold 10px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(angle)}° / ${Math.round(power)}%`, W - 14, 36);
    ctx.textAlign = "left";
    // Power bar
    ctx.strokeStyle = "#334466"; ctx.lineWidth = 1;
    ctx.strokeRect(14, 44, 140, 8);
    const pg = ctx.createLinearGradient(14, 0, 154, 0);
    pg.addColorStop(0, "#00ffe0"); pg.addColorStop(0.5, "#ffe600"); pg.addColorStop(1, "#ff3c78");
    ctx.fillStyle = pg;
    ctx.fillRect(14, 44, (power / 100) * 140, 8);
    ctx.fillStyle = turnColor; ctx.font = "8px 'Courier New', monospace";
    ctx.fillText("POWER", 14, 43);
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GorillaGame() {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const [uiOverlay, setUiOverlay] = useState("title"); // title | playing | gameover
  const [winner, setWinner] = useState(null);
  const [scores, setScores] = useState([0, 0]);
  const scoresRef = useRef([0, 0]);

  // Touch / drag state for aiming
  const dragRef = useRef(null);

  function initGame() {
    const buildings = buildCity();
    const gorillas = placeGorillas(buildings);
    const wind = randBetween(-12, 12);
    const stars = generateStars(60);
    stateRef.current = {
      buildings,
      gorillas,
      wind,
      stars,
      turn: 0,
      phase: "aiming",   // aiming | flying | exploding | celebrating | done
      angle: 45,
      power: 50,
      banana: null,
      bananaT: 0,
      explosion: null,
      expParticles: [],
      throwAnim: false,
      celebrateTimer: 0,
      t: 0,
      starBlink: Array.from({ length: 60 }, () => Math.random()),
    };
    setUiOverlay("playing");
    setWinner(null);
  }

  // ─── Game loop ──────────────────────────────────────────────────────────────
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const s = stateRef.current;
    if (!s) return;

    s.t += DT;

    // Twinkle stars
    s.starBlink = s.starBlink.map((b, i) => (b + 0.01 + i * 0.0003) % 1);
    const twinkleStars = s.stars.map((st, i) => ({ ...st, a: 0.3 + Math.abs(Math.sin(s.starBlink[i] * Math.PI)) * 0.7 }));

    // ── Physics ──
    if (s.phase === "flying" && s.banana) {
      const steps = 3;
      let hit = false;
      for (let i = 0; i < steps && !hit; i++) {
        const { pos, vel } = stepBanana(s.banana.pos, s.banana.vel, s.wind);
        s.banana = { pos, vel };
        s.bananaT += DT;

        // Out of bounds
        if (pos.x < -30 || pos.x > W + 30 || pos.y > H + 30) {
          s.phase = "aiming";
          s.turn = 1 - s.turn;
          s.banana = null;
          s.throwAnim = false;
          s.wind = randBetween(-12, 12);
          hit = true;
          break;
        }

        // Gorilla hit?
        const gorillaHit = checkGorillaHit(pos, s.gorillas, s.turn);
        if (gorillaHit !== -1) {
          triggerExplosion(s, pos.x, pos.y, gorillaHit);
          hit = true;
          break;
        }

        // Building hit?
        const buildHit = checkBuildingHit(pos, s.buildings);
        if (buildHit !== -1) {
          s.buildings = destroyBuilding(s.buildings, pos.x, pos.y, EXPLOSION_R);
          triggerExplosion(s, pos.x, pos.y, -1);
          hit = true;
          break;
        }
      }
    }

    // Explosion countdown
    if (s.phase === "exploding") {
      const prog = (s.t - s.explosion.t0) / s.explosion.duration;
      if (prog >= 1) {
        if (s.explosion.killedGorilla !== -1) {
          s.phase = "celebrating";
          s.celebrateTimer = s.t + 2.0;
        } else {
          s.phase = "aiming";
          s.turn = 1 - s.turn;
          s.banana = null;
          s.throwAnim = false;
          s.wind = randBetween(-12, 12);
        }
      }
    }

    if (s.phase === "celebrating" && s.t >= s.celebrateTimer) {
      const winner_ = s.turn;
      const newScores = [...scoresRef.current];
      newScores[winner_]++;
      scoresRef.current = newScores;
      setScores([...newScores]);
      setWinner(winner_);
      s.phase = "done";
      setUiOverlay("gameover");
    }

    // ── Draw ──
    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx, twinkleStars);
    drawBuildings(ctx, s.buildings);
    drawRoad(ctx);

    // Gorillas
    s.gorillas.forEach((g, i) => {
      const celebrating = s.phase === "celebrating" && s.turn === i;
      const throwing = s.throwAnim && s.turn === i && s.phase === "flying";
      if (s.explosion && s.explosion.killedGorilla === i) return; // hide dead gorilla
      drawGorilla(ctx, g.x, g.y, i, celebrating, throwing);
    });

    // Banana
    if (s.banana) drawBanana(ctx, s.banana.pos, s.banana.vel, s.bananaT);

    // Explosion
    if (s.explosion) drawExplosion(ctx, s.explosion, s.expParticles, s.t);

    // HUD
    drawHUDFull(ctx, scoresRef.current, s.turn, s.wind, s.phase, s.angle, s.power, s.gorillas);

    // Aim guide
    if (s.phase === "aiming") {
      drawAimGuide(ctx, s);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  function triggerExplosion(s, x, y, killedGorilla) {
    s.phase = "exploding";
    s.banana = null;
    s.throwAnim = false;
    const particles = Array.from({ length: 22 }, () => ({
      x, y,
      vx: randBetween(-1, 1),
      vy: randBetween(-2, 0.5),
      r: randBetween(2, 6),
      color: [NEON.explosion, NEON.banana, "#ff2a00", "#ffb300"][Math.floor(Math.random() * 4)],
    }));
    s.explosion = { x, y, t0: s.t, duration: 0.9, killedGorilla };
    s.expParticles = particles;
  }

  function drawAimGuide(ctx, s) {
    const g = s.gorillas[s.turn];
    const color = s.turn === 0 ? NEON.p1 : NEON.p2;
    const cx = g.x + GORILLA_W / 2;
    const cy = g.y + GORILLA_H * 0.3;
    const angleRad = (s.turn === 0 ? s.angle : 180 - s.angle) * Math.PI / 180;
    const speed = s.power * 1.5;
    const vx = Math.cos(-angleRad) * speed;
    const vy = Math.sin(-angleRad) * speed;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    let px = cx, py = cy, pvx = vx, pvy = vy;
    ctx.moveTo(px, py);
    for (let i = 0; i < 40; i++) {
      pvx += s.wind * DT * 3;
      pvy += GRAVITY * DT * 3;
      px += pvx * DT * 3;
      py += pvy * DT * 3;
      if (px < 0 || px > W || py > H) break;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Angle arrow
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(-angleRad) * 36, cy + Math.sin(-angleRad) * 36);
    ctx.stroke();
    ctx.restore();
  }

  // ─── Touch handlers ─────────────────────────────────────────────────────────
  function getCanvasPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
    };
  }

  function handleTouchStart(e) {
    e.preventDefault();
    const s = stateRef.current;
    if (!s || s.phase !== "aiming") return;
    const canvas = canvasRef.current;
    const pos = getCanvasPos(e, canvas);
    dragRef.current = { startX: pos.x, startY: pos.y, startAngle: s.angle, startPower: s.power };
  }

  function handleTouchMove(e) {
    e.preventDefault();
    const s = stateRef.current;
    if (!s || s.phase !== "aiming" || !dragRef.current) return;
    const canvas = canvasRef.current;
    const pos = getCanvasPos(e, canvas);
    const dx = pos.x - dragRef.current.startX;
    const dy = pos.y - dragRef.current.startY;

    // Horizontal drag → angle
    const newAngle = Math.max(0, Math.min(180, dragRef.current.startAngle + dx * 0.4));
    s.angle = newAngle;

    // Vertical drag → power (drag up = more power)
    const newPower = Math.max(5, Math.min(100, dragRef.current.startPower - dy * 0.25));
    s.power = newPower;
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    dragRef.current = null;
  }

  function handleFire() {
    const s = stateRef.current;
    if (!s || s.phase !== "aiming") return;
    const g = s.gorillas[s.turn];
    const cx = g.x + GORILLA_W / 2;
    const cy = g.y + GORILLA_H * 0.3;
    const angleRad = (s.turn === 0 ? s.angle : 180 - s.angle) * Math.PI / 180;
    const speed = s.power * 1.5;
    s.banana = {
      pos: { x: cx, y: cy },
      vel: { x: Math.cos(-angleRad) * speed, y: Math.sin(-angleRad) * speed },
    };
    s.bananaT = 0;
    s.phase = "flying";
    s.throwAnim = true;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: "#000",
      minHeight: "100svh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Courier New', monospace",
      userSelect: "none",
      WebkitUserSelect: "none",
      touchAction: "none",
      overflow: "hidden",
    }}>
      {/* Canvas */}
      <div style={{
        position: "relative",
        width: "min(100vw, 430px)",
        aspectRatio: `${W} / ${H}`,
      }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* ── Title screen ── */}
        {uiOverlay === "title" && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(7,7,18,0.93)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 18,
          }}>
            <div style={{ fontSize: 11, letterSpacing: 8, color: NEON.p1, textTransform: "uppercase", marginBottom: 4 }}>
              ◈ 2026 edition ◈
            </div>
            <div style={{
              fontSize: 52, fontWeight: 900, letterSpacing: -1,
              background: `linear-gradient(135deg, ${NEON.p1}, ${NEON.p2})`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              textShadow: "none", lineHeight: 1,
            }}>
              GORILLA
            </div>
            <div style={{ fontSize: 12, color: "#556a8a", letterSpacing: 3 }}>
              THE BANANA WARS
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, color: "#8899bb", fontSize: 11, textAlign: "center", lineHeight: 1.7 }}>
              <div>👆 <span style={{ color: NEON.p1 }}>Drag left/right</span> → angle</div>
              <div>👆 <span style={{ color: NEON.p2 }}>Drag up/down</span> → power</div>
              <div>🎯 <span style={{ color: NEON.banana }}>FIRE</span> to throw banana</div>
            </div>

            <button
              onClick={initGame}
              style={{
                marginTop: 18,
                padding: "14px 48px",
                background: "transparent",
                border: `2px solid ${NEON.p1}`,
                color: NEON.p1,
                fontSize: 15,
                fontFamily: "'Courier New', monospace",
                letterSpacing: 4,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: `0 0 24px ${NEON.p1}44`,
                transition: "all 0.15s",
              }}
            >
              START GAME
            </button>

            <div style={{ fontSize: 9, color: "#334466", letterSpacing: 2, marginTop: 8 }}>
              INSPIRED BY GORILLAS.BAS — DOS 1991
            </div>
          </div>
        )}

        {/* ── Game Over screen ── */}
        {uiOverlay === "gameover" && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(7,7,18,0.88)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 14,
          }}>
            <div style={{ fontSize: 9, letterSpacing: 6, color: "#556a8a", textTransform: "uppercase" }}>
              round over
            </div>
            <div style={{
              fontSize: 42, fontWeight: 900,
              color: winner === 0 ? NEON.p1 : NEON.p2,
              textShadow: `0 0 40px ${winner === 0 ? NEON.p1 : NEON.p2}`,
            }}>
              P{winner + 1} WINS!
            </div>
            <div style={{ display: "flex", gap: 32, marginTop: 4 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: NEON.p1, fontSize: 28, fontWeight: 900 }}>{scoresRef.current[0]}</div>
                <div style={{ color: "#556a8a", fontSize: 10, letterSpacing: 2 }}>P1</div>
              </div>
              <div style={{ color: "#334466", fontSize: 28, alignSelf: "center" }}>:</div>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: NEON.p2, fontSize: 28, fontWeight: 900 }}>{scoresRef.current[1]}</div>
                <div style={{ color: "#556a8a", fontSize: 10, letterSpacing: 2 }}>P2</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
              <button
                onClick={initGame}
                style={{
                  padding: "12px 28px",
                  background: "transparent",
                  border: `2px solid ${NEON.p1}`,
                  color: NEON.p1,
                  fontSize: 13,
                  fontFamily: "'Courier New', monospace",
                  letterSpacing: 3,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: `0 0 18px ${NEON.p1}44`,
                }}
              >
                REMATCH
              </button>
              <button
                onClick={() => { scoresRef.current = [0, 0]; setScores([0, 0]); setUiOverlay("title"); }}
                style={{
                  padding: "12px 28px",
                  background: "transparent",
                  border: `2px solid #334466`,
                  color: "#556a8a",
                  fontSize: 13,
                  fontFamily: "'Courier New', monospace",
                  letterSpacing: 3,
                  cursor: "pointer",
                }}
              >
                MENU
              </button>
            </div>
          </div>
        )}

        {/* ── In-game controls ── */}
        {uiOverlay === "playing" && (
          <div style={{
            position: "absolute",
            bottom: 14,
            left: 0, right: 0,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
          }}>
            <button
              onTouchStart={e => { e.stopPropagation(); handleFire(); }}
              onClick={handleFire}
              style={{
                pointerEvents: "all",
                padding: "16px 52px",
                background: "rgba(7,7,18,0.9)",
                border: `2.5px solid ${NEON.banana}`,
                color: NEON.banana,
                fontSize: 16,
                fontFamily: "'Courier New', monospace",
                fontWeight: 900,
                letterSpacing: 5,
                cursor: "pointer",
                boxShadow: `0 0 28px ${NEON.banana}55`,
                borderRadius: 2,
                textShadow: `0 0 12px ${NEON.banana}`,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              🍌 FIRE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
