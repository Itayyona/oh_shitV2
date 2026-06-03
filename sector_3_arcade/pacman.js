// ── PAC-MAN — Oh Sh*t Edition ──

var _pacRafId     = null;
var _pacRunning   = false;
var _pacGbHandler = null;

function stopPacman() {
    _pacRunning = false;
    if (_pacRafId) {
        cancelAnimationFrame(_pacRafId);
        _pacRafId = null;
    }
    window._gameLoopRaf = null;
    window._gameLoop    = null;
    if (_pacGbHandler) {
        window.removeEventListener('gbinput', _pacGbHandler);
        _pacGbHandler = null;
    }
}

function startPacman(canvas, toiletId) {
    stopPacman();

    'use strict';

    const ctx = canvas.getContext('2d');

    // ── Maze: 0=dot, 1=wall, 2=power pellet, 3=empty ─────────────────────────
    const TEMPLATE = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
        [1,2,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,2,1],
        [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
        [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
        [1,1,1,1,0,1,1,1,3,3,3,1,1,1,0,1,1,1,1],
        [1,1,1,1,0,1,3,3,3,3,3,3,3,1,0,1,1,1,1],
        [1,1,1,1,0,1,3,1,1,3,1,1,3,1,0,1,1,1,1],
        [3,3,3,3,0,3,3,1,3,3,3,1,3,3,0,3,3,3,3], // tunnel row
        [1,1,1,1,0,1,3,1,1,1,1,1,3,1,0,1,1,1,1],
        [1,1,1,1,0,1,3,3,3,3,3,3,3,1,0,1,1,1,1],
        [1,1,1,1,0,1,3,1,1,1,1,1,3,1,0,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
        [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
        [1,2,0,1,0,0,0,0,0,3,0,0,0,0,0,1,0,2,1],
        [1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1],
        [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
        [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ];

    const ROWS = TEMPLATE.length;
    const COLS = TEMPLATE[0].length;
    const GHOST_COLORS = ['#7B4A2D', '#6B3A1D', '#8B5A3D', '#5B2A0D'];
    const DIRS = [{dr:-1,dc:0},{dr:1,dc:0},{dr:0,dc:-1},{dr:0,dc:1}];

    // Speed table: cells/sec for pac and ghosts per level (level 5+ uses index 4)
    const LEVEL_CFG = [
        { ps: 5.0, gs: 4.0, rand: 0.40 }, // level 1
        { ps: 5.5, gs: 5.5, rand: 0.30 }, // level 2
        { ps: 6.0, gs: 7.0, rand: 0.20 }, // level 3
        { ps: 6.5, gs: 8.5, rand: 0.10 }, // level 4
        { ps: 7.0, gs:10.0, rand: 0.00 }, // level 5+
    ];

    let W = 0, H = 0, CELL = 0, OX = 0, OY = 0;

    // ── Game state ────────────────────────────────────────────────────────────
    let grid, dotsLeft;
    let score = 0, best = 0, lives = 3, level = 1;
    let powerTimer = 0;
    let pacman, ghosts;
    let pendingDir = null;
    let phase = 'playing'; // playing | dying | levelup | over
    let phaseTimer = 0;
    let mouth = 0, mouthDir = 1;
    let lastTime = 0;
    let flushFlashEnd = 0, prevPowerTimer = 0;

    // ── Build grid ────────────────────────────────────────────────────────────
    function buildGrid() {
        grid = TEMPLATE.map(row => [...row]);
        dotsLeft = 0;
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
                if (grid[r][c] === 0 || grid[r][c] === 2) dotsLeft++;
    }

    // ── Init entities ─────────────────────────────────────────────────────────
    function initEntities() {
        const cfg = LEVEL_CFG[Math.min(level - 1, LEVEL_CFG.length - 1)];
        pacman = { r: 16, c: 9, dr: 0, dc: 0, prog: 0, speed: cfg.ps };

        ghosts = GHOST_COLORS.map((color, i) => ({
            r: 10, c: 7 + i,
            dr: 0, dc: i % 2 === 0 ? 1 : -1,
            prog: 0,
            speed: cfg.gs * (1 + i * 0.06),
            scared: false,
            dead: false,
            color,
            delay: i * 1.5,
            randomChance: cfg.rand,
        }));
    }

    // ── Maze helpers ──────────────────────────────────────────────────────────
    function wrap(c) { return ((c % COLS) + COLS) % COLS; }

    function isWall(r, c) {
        if (r < 0 || r >= ROWS) return true;
        return grid[r][wrap(c)] === 1;
    }

    function canMove(r, c, dr, dc) {
        return !isWall(r + dr, c + dc);
    }

    // ── Pac-Man step ──────────────────────────────────────────────────────────
    function stepPacman(dt) {
        if (pacman.prog === 0) {
            if (pendingDir && canMove(pacman.r, pacman.c, pendingDir.dr, pendingDir.dc)) {
                pacman.dr = pendingDir.dr;
                pacman.dc = pendingDir.dc;
                pendingDir = null;
            }
            if (!canMove(pacman.r, pacman.c, pacman.dr, pacman.dc)) {
                pacman.dr = 0; pacman.dc = 0;
            }
        }

        if (pacman.dr === 0 && pacman.dc === 0) return;

        pacman.prog += pacman.speed * dt;

        if (pacman.prog >= 0.5 && pendingDir) {
            const nr = pacman.r + pacman.dr;
            const nc = wrap(pacman.c + pacman.dc);
            if (canMove(nr, nc, pendingDir.dr, pendingDir.dc)) {
                // will turn on arrival — keep pending
            } else if (canMove(pacman.r, pacman.c, pendingDir.dr, pendingDir.dc)) {
                pacman.prog = 1;
            }
        }

        if (pacman.prog >= 1) {
            pacman.prog = 0;
            pacman.r = pacman.r + pacman.dr;
            pacman.c = wrap(pacman.c + pacman.dc);
            eat(pacman.r, pacman.c);

            if (pendingDir && canMove(pacman.r, pacman.c, pendingDir.dr, pendingDir.dc)) {
                pacman.dr = pendingDir.dr;
                pacman.dc = pendingDir.dc;
                pendingDir = null;
            }
        }
    }

    // ── Ghost step ────────────────────────────────────────────────────────────
    function stepGhost(g, dt) {
        if (g.dead) return;
        if (g.delay > 0) { g.delay -= dt; return; }

        g.prog += (g.scared ? g.speed * 0.5 : g.speed) * dt;

        if (g.prog >= 1) {
            g.prog = 0;
            g.r += g.dr;
            g.c  = wrap(g.c + g.dc);
            if (g.r < 0) g.r = 0;
            if (g.r >= ROWS) g.r = ROWS - 1;
            chooseGhostDir(g);
        }
    }

    function chooseGhostDir(g) {
        const rev = { dr: -g.dr, dc: -g.dc };
        const opts = DIRS.filter(d => {
            if (d.dr === rev.dr && d.dc === rev.dc) return false;
            return canMove(g.r, g.c, d.dr, d.dc);
        });

        if (opts.length === 0) {
            if (canMove(g.r, g.c, rev.dr, rev.dc)) { g.dr = rev.dr; g.dc = rev.dc; }
            return;
        }

        if (g.scared) {
            const pick = opts[Math.floor(Math.random() * opts.length)];
            g.dr = pick.dr; g.dc = pick.dc;
            return;
        }

        if (Math.random() < g.randomChance) {
            const pick = opts[Math.floor(Math.random() * opts.length)];
            g.dr = pick.dr; g.dc = pick.dc;
            return;
        }

        // Chase pac-man: minimise Manhattan distance
        let bestDir = opts[0], bestD = Infinity;
        for (const d of opts) {
            const dist = Math.abs((g.r + d.dr) - pacman.r) + Math.abs((g.c + d.dc) - pacman.c);
            if (dist < bestD) { bestD = dist; bestDir = d; }
        }
        g.dr = bestDir.dr; g.dc = bestDir.dc;
    }

    // ── Eating ────────────────────────────────────────────────────────────────
    function eat(r, c) {
        const wc = wrap(c);
        const v = grid[r][wc];
        if (v === 0) {
            grid[r][wc] = 3; score++; dotsLeft--;
        } else if (v === 2) {
            grid[r][wc] = 3; score += 10; dotsLeft--;
            powerTimer = 8;
            ghosts.forEach(g => { if (!g.dead) g.scared = true; });
        }
        if (dotsLeft <= 0) { phase = 'levelup'; phaseTimer = 2; }
    }

    // ── Collisions ────────────────────────────────────────────────────────────
    function checkCollisions() {
        for (const g of ghosts) {
            if (g.dead || g.delay > 0) continue;
            const sameCell = g.r === pacman.r && wrap(g.c) === wrap(pacman.c);
            if (!sameCell) continue;
            if (g.scared) {
                g.dead = true; g.scared = false; score += 20;
            } else {
                lives--;
                phase = 'dying'; phaseTimer = 1.5;
                return;
            }
        }
    }

    // ── Phase transitions ─────────────────────────────────────────────────────
    function endPhase() {
        if (phase === 'dying') {
            if (lives <= 0) {
                phase = 'over';
                saveBest();
            } else {
                resetPositions();
                phase = 'playing';
            }
        } else if (phase === 'levelup') {
            level++;
            buildGrid();
            initEntities();
            powerTimer = 0;
            phase = 'playing';
        }
        updateHUD();
    }

    function resetPositions() {
        pacman.r = 16; pacman.c = 9;
        pacman.dr = 0; pacman.dc = 0; pacman.prog = 0;
        pendingDir = null; powerTimer = 0;
        ghosts.forEach((g, i) => {
            g.r = 10; g.c = 7 + i;
            g.dr = 0; g.dc = i % 2 === 0 ? 1 : -1;
            g.prog = 0; g.scared = false; g.dead = false;
            g.delay = i * 1.5;
        });
    }

    // ── HUD ───────────────────────────────────────────────────────────────────
    function updateHUD() {
        const $ = id => document.getElementById(id);
        const s = $('hud-score'), b = $('hud-best'), lv = $('hud-lives'), ll = $('hud-level');
        if (s)  s.textContent  = `💩 ${score}`;
        if (b)  b.textContent  = `BEST: ${Math.max(score, best)}`;
        if (lv) lv.textContent = '🚽'.repeat(Math.max(0, lives));
        if (ll) ll.textContent = `LVL: ${level}`;
    }

    function saveBest() {
        best = Math.max(score, best);
        try { localStorage.setItem('pacman_best', String(best)); } catch(_) {}
        updateHUD();
    }

    // ── Draw ──────────────────────────────────────────────────────────────────
    function px(c, dc, prog) { return OX + (c + dc * prog + 0.5) * CELL; }
    function py(r, dr, prog) { return OY + (r + dr * prog + 0.5) * CELL; }

    const POOP_COLORS = ['#7B4A2D', '#6B3A1D', '#8B5A3D', '#5B2A0D'];

    function draw() {
        ctx.fillStyle = '#0d1b2e';
        ctx.fillRect(0, 0, W, H);

        drawFloor();
        drawMaze();
        drawDots();
        drawGhosts();

        if (phase !== 'dying' || Math.floor(phaseTimer * 8) % 2 === 0) {
            drawPacman();
        }

        if (powerTimer > prevPowerTimer + 1) flushFlashEnd = Date.now() + 500;
        prevPowerTimer = powerTimer;
        if (Date.now() < flushFlashEnd) {
            ctx.fillStyle = 'rgba(26,159,212,0.3)';
            ctx.fillRect(0, 0, W, H);
        }

        if (phase === 'dying')   overlay('OUCH!',                '#FF4444', lives > 0 ? `${lives} left` : '');
        if (phase === 'levelup') overlay(`LEVEL ${level + 1} 🚽`, '#1a9fd4', 'FLUSH COMPLETE!');
        if (phase === 'over')    overlay('GAME OVER',             '#FF4444', 'Tap to restart');
    }

    function drawFloor() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (TEMPLATE[r][c] !== 1) {
                    ctx.fillStyle = '#1a1a2e';
                    ctx.fillRect(OX + c * CELL, OY + r * CELL, CELL, CELL);
                }
            }
        }
    }

    function drawMaze() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (TEMPLATE[r][c] === 1) {
                    const x = OX + c * CELL, y = OY + r * CELL;
                    ctx.fillStyle = '#1a4a8a';
                    ctx.fillRect(x, y, CELL, CELL);
                    ctx.strokeStyle = '#0d2d5e';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
                }
            }
        }
    }

    function drawDots() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const v = grid[r][c];
                const x = OX + c * CELL + CELL / 2;
                const y = OY + r * CELL + CELL / 2;
                if (v === 0) {
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(x, y, 2, 0, Math.PI * 2);
                    ctx.fill();
                } else if (v === 2) {
                    const p = 0.85 + 0.15 * Math.sin(Date.now() / 220);
                    const fs = Math.max(8, CELL * 1.2) * p;
                    ctx.save();
                    ctx.font = `${fs}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🧻', x, y);
                    ctx.restore();
                }
            }
        }
    }

    function drawToiletShape(sz, lidAngle) {
        // Tank
        ctx.fillStyle = '#f0f0f0';
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-sz*0.9, -sz*0.8, sz*0.4, sz*0.75, 6);
        ctx.fill(); ctx.stroke();

        // Tank top lid
        ctx.fillStyle = '#e8e8e8';
        ctx.beginPath();
        ctx.roundRect(-sz*0.94, -sz*0.86, sz*0.48, sz*0.1, 4);
        ctx.fill(); ctx.stroke();

        // Bowl
        ctx.fillStyle = '#f8f8f8';
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-sz*0.5, -sz*0.05);
        ctx.lineTo(sz*0.5, -sz*0.05);
        ctx.quadraticCurveTo(sz*0.58, -sz*0.05, sz*0.58, sz*0.08);
        ctx.quadraticCurveTo(sz*0.58, sz*0.55, sz*0.2, sz*0.62);
        ctx.lineTo(-sz*0.2, sz*0.62);
        ctx.quadraticCurveTo(-sz*0.58, sz*0.55, -sz*0.58, sz*0.08);
        ctx.quadraticCurveTo(-sz*0.58, -sz*0.05, -sz*0.5, -sz*0.05);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Base
        ctx.fillStyle = '#f0f0f0';
        ctx.beginPath();
        ctx.ellipse(0, sz*0.62, sz*0.45, sz*0.1, 0, 0, Math.PI*2);
        ctx.fill(); ctx.stroke();

        // Seat oval
        ctx.fillStyle = '#ececec';
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -sz*0.05, sz*0.5, sz*0.1, 0, 0, Math.PI*2);
        ctx.fill(); ctx.stroke();

        // Lid — hinged left, flips up
        ctx.save();
        ctx.translate(-sz*0.5, -sz*0.05);
        ctx.rotate(-lidAngle);
        ctx.fillStyle = '#e8e8e8';
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sz*0.5, 0, sz*0.5, sz*0.1, 0, 0, Math.PI*2);
        ctx.fill(); ctx.stroke();
        ctx.restore();

        // Hinge dot
        ctx.fillStyle = '#aaa';
        ctx.beginPath();
        ctx.arc(-sz*0.5, -sz*0.05, 4, 0, Math.PI*2);
        ctx.fill();
    }

    function drawPacman() {
        const x = px(pacman.c, pacman.dc, pacman.prog);
        const y = py(pacman.r, pacman.dr, pacman.prog);
        const facingLeft = pacman.dc === -1;
        const lidAngle = mouth;

        ctx.save();
        ctx.translate(x, y);
        if (facingLeft) ctx.scale(-1, 1);
        drawToiletShape(CELL * 0.85, lidAngle);
        ctx.restore();
    }

    function drawGhosts() {
        const now = Date.now();
        ghosts.forEach((g, i) => {
            if (g.dead) return;

            const bob = Math.sin(now / 220 + i * 1.1) * Math.max(1, CELL * 0.06);
            const gx = px(g.c, g.dc, g.prog);
            const gy = py(g.r, g.dr, g.prog) + bob;
            const fs = Math.max(10, CELL * 0.85);

            if (g.scared) {
                const scaredColor = (powerTimer < 2 && Math.floor(powerTimer * 6) % 2 === 0)
                    ? 'rgba(255,255,255,0.7)' : 'rgba(180,170,160,0.7)';
                ctx.fillStyle = scaredColor;
                ctx.beginPath();
                ctx.arc(gx, gy, CELL * 0.44, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.save();
            ctx.font = `${fs}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💩', gx, gy);
            ctx.restore();
        });
    }

    function overlay(title, color, sub) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, W, H);
        const fs = Math.max(14, Math.floor(CELL * 1.1));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${fs}px monospace`;
        ctx.fillStyle = color;
        ctx.fillText(title, W / 2, H / 2 - fs * 0.7);
        if (sub) {
            ctx.font = `${Math.floor(fs * 0.6)}px monospace`;
            ctx.fillStyle = '#fff';
            ctx.fillText(sub, W / 2, H / 2 + fs * 0.4);
        }
        ctx.restore();
    }

    // ── Game loop ─────────────────────────────────────────────────────────────
    function update(dt) {
        if (phase !== 'playing') {
            phaseTimer -= dt;
            if (phaseTimer <= 0) endPhase();
            return;
        }

        const isMoving = pacman.dr !== 0 || pacman.dc !== 0;
        if (isMoving) {
            mouth += 0.16;
            if (mouth > Math.PI * 0.65) mouth = 0;
        }

        if (powerTimer > 0) {
            powerTimer -= dt;
            if (powerTimer <= 0) { powerTimer = 0; ghosts.forEach(g => { g.scared = false; }); }
        }

        stepPacman(dt);
        ghosts.forEach(g => stepGhost(g, dt));
        checkCollisions();
        updateHUD();
    }

    function loop(ts) {
        if (!_pacRunning) return;
        const dt = Math.min((ts - lastTime) / 1000, 0.05);
        lastTime = ts;
        update(dt);
        draw();
        _pacRafId = requestAnimationFrame(loop);
        window._gameLoopRaf = _pacRafId;
    }

    // ── Init / restart ────────────────────────────────────────────────────────
    function init() {
        try { best = parseInt(localStorage.getItem('pacman_best'), 10) || 0; } catch(_) { best = 0; }
        score = 0; lives = 3; level = 1; powerTimer = 0;
        pendingDir = null; phase = 'playing'; phaseTimer = 0;
        mouth = 0; mouthDir = 1;
        buildGrid();
        initEntities();
        updateHUD();
    }

    function startLoop() {
        if (_pacRafId) cancelAnimationFrame(_pacRafId);
        lastTime = performance.now();
        _pacRunning = true;
        _pacRafId = requestAnimationFrame(loop);
        window._gameLoopRaf = _pacRafId;
    }

    function restart() {
        init();
        startLoop();
    }

    // ── Controls ──────────────────────────────────────────────────────────────
    const KEY_DIR = {
        ArrowUp:   {dr:-1,dc:0}, ArrowDown:  {dr:1,dc:0},
        ArrowLeft: {dr:0,dc:-1}, ArrowRight: {dr:0,dc:1},
        w: {dr:-1,dc:0}, s: {dr:1,dc:0}, a: {dr:0,dc:-1}, d: {dr:0,dc:1},
    };

    document.addEventListener('keydown', e => {
        if (phase === 'over') { restart(); return; }
        if (KEY_DIR[e.key]) { pendingDir = KEY_DIR[e.key]; e.preventDefault(); }
    });

    // D-pad buttons (by ID — silently skips missing elements)
    const BTN = {
        'btn-up':    {dr:-1,dc:0}, 'btn-down':  {dr:1,dc:0},
        'btn-left':  {dr:0,dc:-1}, 'btn-right': {dr:0,dc:1},
    };
    Object.entries(BTN).forEach(([id, d]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const go = e => { e.preventDefault(); if (phase === 'over') { restart(); return; } pendingDir = d; };
        el.addEventListener('touchstart', go, { passive: false });
        el.addEventListener('mousedown',  go);
    });

    // Swipe on canvas
    let sw = null;
    canvas.addEventListener('touchstart', e => { sw = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
    canvas.addEventListener('touchend', e => {
        if (!sw) return;
        if (phase === 'over') { restart(); sw = null; return; }
        const dx = e.changedTouches[0].clientX - sw.x;
        const dy = e.changedTouches[0].clientY - sw.y;
        sw = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) return;
        pendingDir = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? {dr:0,dc:1} : {dr:0,dc:-1})
            : (dy > 0 ? {dr:1,dc:0} : {dr:-1,dc:0});
    }, { passive: true });

    canvas.addEventListener('click', () => { if (phase === 'over') restart(); });

    // gbinput events (D-pad via main app's gameInput())
    _pacGbHandler = function(e) {
        const d = e.detail;
        if (d === 'stop') { stopPacman(); return; }
        if (d === 'a' || d === 'b' || d === 'start' || d === 'select') {
            if (phase === 'over') { restart(); return; }
        }
        const dirMap = {
            up: {dr:-1,dc:0}, down: {dr:1,dc:0},
            left: {dr:0,dc:-1}, right: {dr:0,dc:1},
        };
        if (dirMap[d]) pendingDir = dirMap[d];
    };
    window.addEventListener('gbinput', _pacGbHandler);

    // ── Bootstrap — ResizeObserver waits for real canvas dimensions ───────────
    var ro = new ResizeObserver(function() {
        var r = canvas.getBoundingClientRect();
        if (r.width > 10 && r.height > 10) {
            ro.disconnect();
            canvas.width  = Math.round(r.width);
            canvas.height = Math.round(r.height);
            // Compute maze cell size to fit within canvas bounds
            W    = canvas.width;
            H    = canvas.height;
            CELL = Math.min(Math.floor(W / COLS), Math.floor(H / ROWS));
            OX   = Math.floor((W - COLS * CELL) / 2);
            OY   = Math.floor((H - ROWS * CELL) / 2);
            init();
            startLoop();
        }
    });
    ro.observe(canvas);
}
