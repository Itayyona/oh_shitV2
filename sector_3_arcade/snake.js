(function () {
  'use strict';

  // ── DOM ───────────────────────────────────────────────────────────────────
  const canvas  = document.getElementById('gameCanvas');
  const ctx     = canvas.getContext('2d');
  const elScore = document.getElementById('hud-score');
  const elBest  = document.getElementById('hud-best');
  const elLives = document.getElementById('hud-lives');
  const elLevel = document.getElementById('hud-level');
  console.log('elLevel (id=hud-level):', elLevel);

  // ── Constants ─────────────────────────────────────────────────────────────
  const CELL           = 24;
  const SEG_DARK       = '#7B4A2D';
  const SEG_ALT        = '#5C3318';
  const BASE_FPM       = 18;   // frames per move at start
  const MIN_FPM        = 6;
  const FOOD_PER_LEVEL = 5;    // food eaten to advance one level

  // ── State ─────────────────────────────────────────────────────────────────
  let W, H, cols, rows;
  let snake, dir, nextDir, food;
  let score, eaten, level, lives, fpm, frame;
  let state;               // 'play' | 'over'
  let touchX, touchY;
  let swirlAngle = 0;
  let started    = false;

  // Visual effect timers (all in animation frames)
  let deathFlash     = 0;  // red overlay countdown
  let deathTextTimer = 0;  // "💩 -1 LIFE" text countdown
  let respawnPause   = 0;  // freeze snake after death before it moves
  let levelUpTimer   = 0;  // "LEVEL UP! 🚽" text countdown

  // Golden toilet paper — appears every 5 levels
  let goldenFood      = null;  // { x, y, timeLeft, tickTimer, moveTimer }
  let goldenMilestone = 0;     // highest level-multiple-of-5 that already spawned TP

  // Persistent high score
  let highScore = parseInt(localStorage.getItem('snake_best') || '0');

  // ── Utility ───────────────────────────────────────────────────────────────
  function inBounds(x, y) {
    return x >= 0 && x < cols && y >= 0 && y < rows;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = canvas.width  = Math.round(r.width);
    H = canvas.height = Math.round(r.height);
    cols = Math.floor(W / CELL);
    rows = Math.floor(H / CELL);
  }

  function updateHUD() {
    elScore.textContent = '🧻 ×' + Math.floor((score || 0) / 10);

    elBest.textContent  = 'BEST: ' + (highScore || 0);
    elLives.textContent = '💩'.repeat(Math.max(0, lives || 0));

    console.log('level:', level);
    const lvl = level || 1;
    elLevel.textContent = 'LVL: ' + lvl;
  }

  function maybeSaveHighScore() {
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('snake_best', String(highScore));
    }
  }

  // ── Init / spawn ──────────────────────────────────────────────────────────
  function init() {
    resize();
    score           = 0;
    eaten           = 0;
    level           = 1;
    lives           = 3;
    updateHUD();
    fpm             = BASE_FPM;
    frame           = 0;
    state           = 'play';
    deathFlash      = 0;
    deathTextTimer  = 0;
    respawnPause    = 0;
    levelUpTimer    = 0;
    goldenFood      = null;
    goldenMilestone = 0;
    spawnSnake();
    placeFood();
  }

  function spawnSnake() {
    const cx = Math.max(3, Math.floor(cols / 2));
    const cy = Math.max(0, Math.floor(rows / 2));
    snake   = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    dir     = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    frame   = 0;
  }

  // ── Lives system ──────────────────────────────────────────────────────────
  function loseLife() {
    if (state !== 'play') return;   // prevent re-entry if collision fires twice
    lives = Math.max(0, lives - 1);
    maybeSaveHighScore();
    updateHUD();
    deathFlash     = 30;   // ~500 ms red flash
    deathTextTimer = 70;   // ~1.2 s "–1 LIFE" text
    if (lives <= 0) {
      state = 'over';
    } else {
      respawnPause = 90;   // 1.5 s freeze before snake starts moving
      spawnSnake();
      placeFood();         // move food away from new spawn position
    }
  }

  // ── Food placement ────────────────────────────────────────────────────────
  function placeFood() {
    let p, tries = 0;
    do {
      p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
      tries++;
    } while (tries < 3000 && (
      snake.some(s => s.x === p.x && s.y === p.y) ||
      (goldenFood && p.x === goldenFood.x && p.y === goldenFood.y)
    ));
    food = p;
  }

  function spawnGoldenFood() {
    let p, tries = 0;
    do {
      p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
      tries++;
    } while (tries < 3000 && (
      snake.some(s => s.x === p.x && s.y === p.y) ||
      (food && p.x === food.x && p.y === food.y)
    ));
    goldenFood = { x: p.x, y: p.y, timeLeft: 10, tickTimer: 60, moveTimer: 120 };
  }

  function relocateGoldenFood() {
    if (!goldenFood) return;
    let p, tries = 0;
    do {
      p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
      tries++;
    } while (tries < 500 && (
      snake.some(s => s.x === p.x && s.y === p.y) ||
      (food && p.x === food.x && p.y === food.y)
    ));
    goldenFood.x = p.x;
    goldenFood.y = p.y;
  }

  // ── Step (one snake move) ─────────────────────────────────────────────────
  function step() {
    dir = { x: nextDir.x, y: nextDir.y };
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Exclude tail from collision — it will vacate this tick
    const body = snake.slice(0, snake.length - 1);

    if (!inBounds(head.x, head.y) || body.some(s => s.x === head.x && s.y === head.y)) {
      loseLife();
      return;
    }

    snake.unshift(head);

    // Normal food
    if (head.x === food.x && head.y === food.y) {
      eaten++;
      score += 10;

      // Level up check
      const newLevel = Math.floor(eaten / FOOD_PER_LEVEL) + 1;
      if (newLevel > level) {
        level    = newLevel;
        fpm      = Math.max(MIN_FPM, BASE_FPM - (level - 1) * 2);
        levelUpTimer = 80;

        // Spawn golden TP every 5 levels
        const milestone = Math.floor(level / 5);
        if (milestone > goldenMilestone && level % 5 === 0) {
          goldenMilestone = milestone;
          spawnGoldenFood();
        }
      }

      maybeSaveHighScore();
      updateHUD();
      placeFood();
    } else {
      snake.pop();
    }

    // Golden food — bonus points, snake doesn't grow
    if (goldenFood && head.x === goldenFood.x && head.y === goldenFood.y) {
      score += 100;
      goldenFood = null;
      maybeSaveHighScore();
      updateHUD();
    }
  }

  // ── Drawing utilities ─────────────────────────────────────────────────────

  // Rounded-rect fill — avoids ctx.roundRect browser gaps
  function fillRR(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
    ctx.fill();
  }

  // ── Water background with animated bezier swirls ──────────────────────────
  function drawWater() {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0,    '#5bc8f0');
    g.addColorStop(0.40, '#1a9fd4');
    g.addColorStop(1,    '#0d6e9e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    swirlAngle += 0.006;
    const cx = W / 2, cy = H / 2, m = Math.min(W, H);
    ctx.save();
    ctx.lineCap = 'round';

    // 3 clockwise outer swirl arms
    for (let i = 0; i < 3; i++) {
      const a = swirlAngle + i * (Math.PI * 2 / 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * m * 0.40, cy + Math.sin(a) * m * 0.40);
      ctx.bezierCurveTo(
        cx + Math.cos(a + 0.75) * m * 0.26, cy + Math.sin(a + 0.75) * m * 0.26,
        cx + Math.cos(a + 1.65) * m * 0.14, cy + Math.sin(a + 1.65) * m * 0.14,
        cx + Math.cos(a + 2.60) * m * 0.05, cy + Math.sin(a + 2.60) * m * 0.05
      );
      ctx.stroke();
    }

    // 4 counter-clockwise inner ripples
    for (let i = 0; i < 4; i++) {
      const a = -swirlAngle * 0.65 + i * (Math.PI * 2 / 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * m * 0.28, cy + Math.sin(a) * m * 0.28);
      ctx.bezierCurveTo(
        cx + Math.cos(a + 1.05) * m * 0.16, cy + Math.sin(a + 1.05) * m * 0.16,
        cx + Math.cos(a + 2.10) * m * 0.08, cy + Math.sin(a + 2.10) * m * 0.08,
        cx, cy
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Snake body ────────────────────────────────────────────────────────────
  function drawSegment(seg, idx) {
    const px = seg.x * CELL + 2, py = seg.y * CELL + 2;
    const sz = CELL - 4;
    ctx.fillStyle = idx % 2 === 0 ? SEG_DARK : SEG_ALT;
    fillRR(px, py, sz, sz, 4);
    // Specular sheen
    ctx.fillStyle = 'rgba(255,200,150,0.10)';
    fillRR(px + 1, py + 1, sz * 0.52, sz * 0.36, 2);
  }

  // Mr Hankey head — drawn facing +x in local space, then rotated
  function drawHead(seg) {
    const cx = seg.x * CELL + CELL / 2;
    const cy = seg.y * CELL + CELL / 2;
    const r  = CELL * 0.54;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(
      dir.x ===  1 ?  0         :
      dir.x === -1 ?  Math.PI   :
      dir.y === -1 ? -Math.PI / 2 : Math.PI / 2
    );

    // Brown head circle
    ctx.fillStyle = SEG_DARK;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // White eyes — in forward half, spread vertically
    const er = CELL * 0.12;
    const ex = r * 0.18, ey = r * 0.32;
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(ex, -ey, er, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex,  ey, er, 0, Math.PI * 2); ctx.fill();

    // Black pupils — slight forward gaze
    const pr = er * 0.62;
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(ex + er*0.18, -ey + er*0.18, pr, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + er*0.18,  ey + er*0.18, pr, 0, Math.PI*2); ctx.fill();

    // Smile arc (sweeps bottom of a small circle = happy curve)
    ctx.strokeStyle = 'rgba(22,6,1,0.92)';
    ctx.lineWidth   = Math.max(1.5, r * 0.18);
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(r * 0.06, r * 0.16, r * 0.40, Math.PI * 0.10, Math.PI * 0.90);
    ctx.stroke();

    ctx.restore();
  }

  // ── Food ──────────────────────────────────────────────────────────────────
  function drawFood() {
    ctx.font         = `${CELL}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧻', food.x * CELL + CELL / 2, food.y * CELL + CELL / 2);
  }

  // Golden TP — glow + emoji + countdown
  function drawGoldenFood() {
    if (!goldenFood) return;
    const fx = goldenFood.x * CELL + CELL / 2;
    const fy = goldenFood.y * CELL + CELL / 2;

    // Pulsing outer glow
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 180);
    ctx.fillStyle = `rgba(255,215,0,${0.18 * pulse})`;
    ctx.beginPath();
    ctx.arc(fx, fy, CELL * 0.92, 0, Math.PI * 2);
    ctx.fill();

    // Solid gold halo
    ctx.fillStyle = 'rgba(255,215,0,0.42)';
    ctx.beginPath();
    ctx.arc(fx, fy, CELL * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Toilet paper emoji
    ctx.font         = `${CELL}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧻', fx, fy);

    // Countdown timer above the emoji
    const tSz = Math.max(10, CELL * 0.50);
    ctx.font         = `bold ${tSz}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
    ctx.lineWidth    = 3;
    ctx.strokeText(goldenFood.timeLeft + 's', fx, fy - CELL * 0.50);
    ctx.fillStyle    = '#FFD700';
    ctx.fillText(goldenFood.timeLeft + 's', fx, fy - CELL * 0.50);
  }

  // ── Notification overlay (level up / death) ───────────────────────────────
  function drawNotif(line1, line2, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';

    const sz = Math.min(22, W * 0.07);
    const bw = W * 0.78, bh = sz * (line2 ? 3.4 : 2.2);
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    fillRR(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh, 14);

    ctx.font        = `bold ${sz}px 'Courier New', monospace`;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth   = 3;
    const y1 = line2 ? H / 2 - sz * 0.65 : H / 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(line1, W / 2, y1);
    ctx.fillText(line1,   W / 2, y1);

    if (line2) {
      const sz2 = Math.floor(sz * 0.72);
      ctx.font      = `bold ${sz2}px 'Courier New', monospace`;
      ctx.fillStyle = '#FFD700';
      ctx.strokeText(line2, W / 2, H / 2 + sz * 0.95);
      ctx.fillText(line2,   W / 2, H / 2 + sz * 0.95);
    }
    ctx.restore();
  }

  // ── Game-over screen ──────────────────────────────────────────────────────
  function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.74)';
    ctx.fillRect(0, 0, W, H);

    const mx = W / 2, my = H / 2;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const big = Math.min(24, W * 0.08);
    ctx.font      = `bold ${big}px 'Courier New', monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('💩 GAME OVER', mx, my - big * 1.9);

    const med = Math.min(16, W * 0.055);
    ctx.font      = `bold ${med}px 'Courier New', monospace`;
    ctx.fillStyle = '#00ff44';
    ctx.fillText('SCORE: ' + score, mx, my - med * 0.5);

    ctx.fillStyle = '#FFD700';
    ctx.fillText('BEST:  ' + highScore, mx, my + med * 1.5);

    ctx.font      = `${Math.min(11, W * 0.037)}px monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    ctx.fillText('tap anywhere to restart', mx, my + big * 1.9);
  }

  // ── Main draw ─────────────────────────────────────────────────────────────
  function draw() {
    drawWater();
    drawGoldenFood();
    drawFood();

    // Snake body tail-first so head renders on top
    for (let i = snake.length - 1; i >= 1; i--) drawSegment(snake[i], i);
    drawHead(snake[0]);

    // Red death flash — fades over ~500 ms
    if (deathFlash > 0) {
      ctx.fillStyle = `rgba(220,0,0,${(deathFlash / 30) * 0.55})`;
      ctx.fillRect(0, 0, W, H);
      deathFlash--;
    }

    // "💩 -1 LIFE" text (fades out in last 10 frames)
    if (deathTextTimer > 0) {
      drawNotif('💩 -1 LIFE', null, Math.min(1, deathTextTimer / 10));
      deathTextTimer--;
    }

    // "LEVEL UP! 🚽" text (fades out in last 12 frames)
    if (levelUpTimer > 0) {
      drawNotif('LEVEL UP! 🚽', 'LVL ' + level, Math.min(1, levelUpTimer / 12));
      levelUpTimer--;
    }

    if (state === 'over') drawGameOver();
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  function loop() {
    // Tick golden TP timers every frame
    if (state === 'play' && goldenFood) {
      goldenFood.tickTimer--;
      if (goldenFood.tickTimer <= 0) {
        goldenFood.tickTimer = 60;       // one second
        goldenFood.timeLeft--;
        if (goldenFood.timeLeft <= 0) {
          goldenFood = null;
        }
      }
      if (goldenFood) {
        goldenFood.moveTimer--;
        if (goldenFood.moveTimer <= 0) {
          goldenFood.moveTimer = 120;    // two seconds
          relocateGoldenFood();
        }
      }
    }

    // Snake movement — paused briefly after respawn
    if (state === 'play') {
      if (respawnPause > 0) {
        respawnPause--;
      } else if (++frame >= fpm) {
        frame = 0;
        step();
      }
    }

    draw();
    requestAnimationFrame(loop);
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const UP    = { x:  0, y: -1 };
  const DOWN  = { x:  0, y:  1 };
  const LEFT  = { x: -1, y:  0 };
  const RIGHT = { x:  1, y:  0 };

  function turn(d) {
    if (state === 'over') { init(); return; }
    if (d.x !== -dir.x || d.y !== -dir.y) nextDir = d;
  }

  // Arrow keys
  document.addEventListener('keydown', function (e) {
    const map = { ArrowUp: UP, ArrowDown: DOWN, ArrowLeft: LEFT, ArrowRight: RIGHT };
    const d = map[e.key];
    if (d) { turn(d); e.preventDefault(); }
    else if (state === 'over') init();
  });

  // Canvas swipe
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) { if (state === 'over') init(); return; }
    turn(Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? RIGHT : LEFT)
      : (dy > 0 ? DOWN  : UP));
  }, { passive: false });

  // D-pad buttons
  function bindDir(id, d) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', function (e) { e.preventDefault(); turn(d); }, { passive: false });
    el.addEventListener('mousedown',  function (e) { e.preventDefault(); turn(d); });
  }
  bindDir('btn-up', UP); bindDir('btn-down', DOWN);
  bindDir('btn-left', LEFT); bindDir('btn-right', RIGHT);

  // A / B buttons — restart on game over
  function bindAction(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', function (e) { e.preventDefault(); fn(); }, { passive: false });
    el.addEventListener('mousedown',  function (e) { e.preventDefault(); fn(); });
  }
  bindAction('btn-a', function () { if (state === 'over') init(); });
  bindAction('btn-b', function () { if (state === 'over') init(); });

  // Resize
  window.addEventListener('resize', function () {
    resize();
    if (food) placeFood();
  });

  // ── Bootstrap — wait for CSS layout to give real canvas dimensions ─────────
  const ro = new ResizeObserver(function () {
    if (started) return;
    const r = canvas.getBoundingClientRect();
    if (r.width > 60 && r.height > 60) {
      started = true;
      init();
      loop();
    }
  });
  ro.observe(document.querySelector('.bowl-frame'));

})();
