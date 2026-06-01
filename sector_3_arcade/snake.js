// ── SNAKE — Oh Sh*t Edition ──

var snakeState  = null;
var _snakeRafId = null;

function stopSnake() {
    if (_snakeRafId) {
        cancelAnimationFrame(_snakeRafId);
        _snakeRafId         = null;
        window._gameLoopRaf = null;
    }
    if (snakeState) {
        snakeState.canvas.removeEventListener('touchstart', snakeState._touchStart);
        snakeState.canvas.removeEventListener('touchend',   snakeState._touchEnd);
        window.removeEventListener('gbinput', snakeState._gbHandler);
        snakeState = null;
    }
}

function startSnake(canvas, toiletId) {
    stopSnake();

    // Size canvas from the rendered toilet bowl
    var bowl = document.getElementById('toilet-bowl');
    var rect = bowl.getBoundingClientRect();
    canvas.width  = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);

    var ctx = canvas.getContext('2d');

    // ── Constants ────────────────────────────────────────────────
    var CELL           = 24;
    var SEG_DARK       = '#7B4A2D';
    var SEG_ALT        = '#5C3318';
    var BASE_FPM       = 18;   // frames per move at start
    var MIN_FPM        = 6;
    var FOOD_PER_LEVEL = 5;

    // ── Pixel/grid state ─────────────────────────────────────────
    var W    = canvas.width;
    var H    = canvas.height;
    var cols = Math.floor(W / CELL);
    var rows = Math.floor(H / CELL);

    // ── Game state ───────────────────────────────────────────────
    var snake, dir, nextDir, food;
    var score, eaten, level, lives, fpm, frame;
    var gameState;   // 'play' | 'over'
    var touchX, touchY;
    var swirlAngle = 0;

    var deathFlash = 0, deathTextTimer = 0, respawnPause = 0, levelUpTimer = 0;
    var goldenFood = null, goldenMilestone = 0;
    var highScore  = parseInt(localStorage.getItem('snake_best') || '0', 10);

    // ── HUD / economy helpers ────────────────────────────────────
    function updateHUD() {
        if (typeof updateGameHUD === 'function') updateGameHUD(level, score);
    }

    function maybeSaveHighScore() {
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('snake_best', String(highScore));
        }
    }

    function awardRolls(amount) {
        if (typeof addRolls === 'function') {
            addRolls(amount);
        } else {
            var n = Number(localStorage.getItem('rolls') || 0) + amount;
            localStorage.setItem('rolls', String(n));
            var el = document.getElementById('roll-counter');
            if (el) el.textContent = n;
        }
    }

    // ── Init / spawn ─────────────────────────────────────────────
    function init() {
        score = 0; eaten = 0; level = 1; lives = 3;
        fpm = BASE_FPM; frame = 0; gameState = 'play';
        deathFlash = 0; deathTextTimer = 0; respawnPause = 0; levelUpTimer = 0;
        goldenFood = null; goldenMilestone = 0; swirlAngle = 0;
        updateHUD();
        spawnSnake();
        placeFood();
    }

    function spawnSnake() {
        var cx = Math.max(3, Math.floor(cols / 2));
        var cy = Math.max(0, Math.floor(rows / 2));
        snake   = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
        dir     = { x: 1, y: 0 };
        nextDir = { x: 1, y: 0 };
        frame   = 0;
    }

    // ── Lives ─────────────────────────────────────────────────────
    function loseLife() {
        if (gameState !== 'play') return;
        lives = Math.max(0, lives - 1);
        maybeSaveHighScore();
        updateHUD();
        deathFlash     = 30;   // ~500 ms red flash
        deathTextTimer = 70;   // ~1.2 s "-1 LIFE" text
        if (lives <= 0) {
            gameState = 'over';
        } else {
            respawnPause = 90; // 1.5 s freeze before snake moves
            spawnSnake();
            placeFood();
        }
    }

    // ── Food placement ────────────────────────────────────────────
    function placeFood() {
        var p, tries = 0;
        do {
            p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
            tries++;
        } while (tries < 3000 && snake.some(function(s){ return s.x === p.x && s.y === p.y; }));
        food = p;
    }

    function spawnGoldenFood() {
        var p, tries = 0;
        do {
            p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
            tries++;
        } while (tries < 3000 && (
            snake.some(function(s){ return s.x === p.x && s.y === p.y; }) ||
            (food && p.x === food.x && p.y === food.y)
        ));
        goldenFood = { x: p.x, y: p.y, timeLeft: 10, tickTimer: 60, moveTimer: 120 };
    }

    function relocateGoldenFood() {
        if (!goldenFood) return;
        var p, tries = 0;
        do {
            p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
            tries++;
        } while (tries < 500 && (
            snake.some(function(s){ return s.x === p.x && s.y === p.y; }) ||
            (food && p.x === food.x && p.y === food.y)
        ));
        goldenFood.x = p.x;
        goldenFood.y = p.y;
    }

    // ── Step (one snake move) ─────────────────────────────────────
    function step() {
        dir = { x: nextDir.x, y: nextDir.y };
        var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        var body = snake.slice(0, snake.length - 1); // tail will vacate this tick

        if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows ||
            body.some(function(s){ return s.x === head.x && s.y === head.y; })) {
            loseLife();
            return;
        }

        snake.unshift(head);

        // Normal food
        if (head.x === food.x && head.y === food.y) {
            eaten++;
            score += 10;

            var newLevel = Math.floor(eaten / FOOD_PER_LEVEL) + 1;
            if (newLevel > level) {
                level    = newLevel;
                fpm      = Math.max(MIN_FPM, BASE_FPM - (level - 1) * 2);
                levelUpTimer = 80;
                awardRolls(1);

                // Spawn golden TP every 5 levels
                var milestone = Math.floor(level / 5);
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
            awardRolls(2);
            goldenFood = null;
            maybeSaveHighScore();
            updateHUD();
        }
    }

    // ── Drawing helpers ───────────────────────────────────────────
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

    // ── Water background with animated bezier swirls ──────────────
    function drawWater() {
        var g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
        g.addColorStop(0,    '#5bc8f0');
        g.addColorStop(0.40, '#1a9fd4');
        g.addColorStop(1,    '#0d6e9e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        swirlAngle += 0.006;
        var cx = W / 2, cy = H / 2, m = Math.min(W, H);
        ctx.save();
        ctx.lineCap = 'round';

        // 3 clockwise outer swirl arms
        for (var i = 0; i < 3; i++) {
            var a = swirlAngle + i * (Math.PI * 2 / 3);
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
        for (var j = 0; j < 4; j++) {
            var b = -swirlAngle * 0.65 + j * (Math.PI * 2 / 4);
            ctx.strokeStyle = 'rgba(255,255,255,0.20)';
            ctx.lineWidth   = 2.5;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(b) * m * 0.28, cy + Math.sin(b) * m * 0.28);
            ctx.bezierCurveTo(
                cx + Math.cos(b + 1.05) * m * 0.16, cy + Math.sin(b + 1.05) * m * 0.16,
                cx + Math.cos(b + 2.10) * m * 0.08, cy + Math.sin(b + 2.10) * m * 0.08,
                cx, cy
            );
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── Snake body ────────────────────────────────────────────────
    function drawSegment(seg, idx) {
        var px = seg.x * CELL + 2, py = seg.y * CELL + 2;
        var sz = CELL - 4;
        ctx.fillStyle = idx % 2 === 0 ? SEG_DARK : SEG_ALT;
        fillRR(px, py, sz, sz, 4);
        // Specular sheen
        ctx.fillStyle = 'rgba(255,200,150,0.10)';
        fillRR(px + 1, py + 1, sz * 0.52, sz * 0.36, 2);
    }

    // Mr Hankey head — drawn facing +x in local space, then rotated
    function drawHead(seg) {
        var hx = seg.x * CELL + CELL / 2;
        var hy = seg.y * CELL + CELL / 2;
        var r  = CELL * 0.54;

        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(
            dir.x ===  1 ?  0 :
            dir.x === -1 ?  Math.PI :
            dir.y === -1 ? -Math.PI / 2 : Math.PI / 2
        );

        ctx.fillStyle = SEG_DARK;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        var er = CELL * 0.12;
        var ex = r * 0.18, ey = r * 0.32;
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(ex, -ey, er, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex,  ey, er, 0, Math.PI * 2); ctx.fill();

        var pr = er * 0.62;
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(ex + er * 0.18, -ey + er * 0.18, pr, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + er * 0.18,  ey + er * 0.18, pr, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = 'rgba(22,6,1,0.92)';
        ctx.lineWidth   = Math.max(1.5, r * 0.18);
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.arc(r * 0.06, r * 0.16, r * 0.40, Math.PI * 0.10, Math.PI * 0.90);
        ctx.stroke();

        ctx.restore();
    }

    // ── Food ──────────────────────────────────────────────────────
    function drawFood() {
        ctx.font         = CELL + 'px serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🧻', food.x * CELL + CELL / 2, food.y * CELL + CELL / 2);
    }

    // Golden TP — glow + emoji + countdown (appears every 5 levels)
    function drawGoldenFood() {
        if (!goldenFood) return;
        var fx = goldenFood.x * CELL + CELL / 2;
        var fy = goldenFood.y * CELL + CELL / 2;

        var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 180);
        ctx.fillStyle = 'rgba(255,215,0,' + (0.18 * pulse) + ')';
        ctx.beginPath(); ctx.arc(fx, fy, CELL * 0.92, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = 'rgba(255,215,0,0.42)';
        ctx.beginPath(); ctx.arc(fx, fy, CELL * 0.62, 0, Math.PI * 2); ctx.fill();

        ctx.font = CELL + 'px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🧻', fx, fy);

        var tSz = Math.max(10, CELL * 0.50);
        ctx.font         = 'bold ' + tSz + 'px monospace';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
        ctx.lineWidth    = 3;
        ctx.strokeText(goldenFood.timeLeft + 's', fx, fy - CELL * 0.50);
        ctx.fillStyle = '#FFD700';
        ctx.fillText(goldenFood.timeLeft + 's', fx, fy - CELL * 0.50);
    }

    // ── Notification overlay ──────────────────────────────────────
    function drawNotif(line1, line2, alpha) {
        if (alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha  = Math.min(1, alpha);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        var sz = Math.min(22, W * 0.07);
        var bw = W * 0.78, bh = sz * (line2 ? 3.4 : 2.2);
        ctx.fillStyle = 'rgba(0,0,0,0.68)';
        fillRR(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh, 14);

        ctx.font        = 'bold ' + sz + 'px "Courier New", monospace';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth   = 3;
        var y1 = line2 ? H / 2 - sz * 0.65 : H / 2;
        ctx.fillStyle = '#ffffff';
        ctx.strokeText(line1, W / 2, y1); ctx.fillText(line1, W / 2, y1);

        if (line2) {
            var sz2 = Math.floor(sz * 0.72);
            ctx.font      = 'bold ' + sz2 + 'px "Courier New", monospace';
            ctx.fillStyle = '#FFD700';
            ctx.strokeText(line2, W / 2, H / 2 + sz * 0.95);
            ctx.fillText(line2,   W / 2, H / 2 + sz * 0.95);
        }
        ctx.restore();
    }

    // ── Game-over screen ──────────────────────────────────────────
    function drawGameOver() {
        ctx.fillStyle = 'rgba(0,0,0,0.74)';
        ctx.fillRect(0, 0, W, H);

        var mx = W / 2, my = H / 2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        var big = Math.min(24, W * 0.08);
        ctx.font      = 'bold ' + big + 'px "Courier New", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('💩 GAME OVER', mx, my - big * 1.9);

        var med = Math.min(16, W * 0.055);
        ctx.font      = 'bold ' + med + 'px "Courier New", monospace';
        ctx.fillStyle = '#00ff44';
        ctx.fillText('SCORE: ' + score, mx, my - med * 0.5);
        ctx.fillStyle = '#FFD700';
        ctx.fillText('BEST:  ' + highScore, mx, my + med * 1.5);

        ctx.font      = Math.min(11, W * 0.037) + 'px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.58)';
        ctx.fillText('tap or [A] to restart', mx, my + big * 1.9);
    }

    // ── Main draw ─────────────────────────────────────────────────
    function draw() {
        drawWater();
        drawGoldenFood();
        drawFood();

        for (var i = snake.length - 1; i >= 1; i--) drawSegment(snake[i], i);
        drawHead(snake[0]);

        if (deathFlash > 0) {
            ctx.fillStyle = 'rgba(220,0,0,' + (deathFlash / 30 * 0.55) + ')';
            ctx.fillRect(0, 0, W, H);
            deathFlash--;
        }

        if (deathTextTimer > 0) {
            drawNotif('💩 -1 LIFE', null, Math.min(1, deathTextTimer / 10));
            deathTextTimer--;
        }

        if (levelUpTimer > 0) {
            drawNotif('LEVEL UP! 🚽', 'LVL ' + level, Math.min(1, levelUpTimer / 12));
            levelUpTimer--;
        }

        if (gameState === 'over') drawGameOver();
    }

    // ── Game loop ─────────────────────────────────────────────────
    function loop() {
        if (!snakeState) return;  // guard: stopSnake() was called

        if (gameState === 'play' && goldenFood) {
            goldenFood.tickTimer--;
            if (goldenFood.tickTimer <= 0) {
                goldenFood.tickTimer = 60;
                goldenFood.timeLeft--;
                if (goldenFood.timeLeft <= 0) goldenFood = null;
            }
            if (goldenFood) {
                goldenFood.moveTimer--;
                if (goldenFood.moveTimer <= 0) {
                    goldenFood.moveTimer = 120;
                    relocateGoldenFood();
                }
            }
        }

        if (gameState === 'play') {
            if (respawnPause > 0) {
                respawnPause--;
            } else if (++frame >= fpm) {
                frame = 0;
                step();
            }
        }

        draw();
        _snakeRafId         = requestAnimationFrame(loop);
        window._gameLoopRaf = _snakeRafId;
    }

    // ── Input ─────────────────────────────────────────────────────
    var UP    = { x:  0, y: -1 };
    var DOWN  = { x:  0, y:  1 };
    var LEFT  = { x: -1, y:  0 };
    var RIGHT = { x:  1, y:  0 };

    function turn(d) {
        if (gameState === 'over') { init(); return; }
        if (d.x !== -dir.x || d.y !== -dir.y) nextDir = d;
    }

    function handleTouchStart(e) {
        if (!e.touches || !e.touches[0]) return;
        e.preventDefault();
        touchX = e.touches[0].clientX;
        touchY = e.touches[0].clientY;
    }

    function handleTouchEnd(e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        e.preventDefault();
        var dx = e.changedTouches[0].clientX - touchX;
        var dy = e.changedTouches[0].clientY - touchY;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) { if (gameState === 'over') init(); return; }
        turn(Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? RIGHT : LEFT)
            : (dy > 0 ? DOWN  : UP));
    }

    function handleGbInput(e) {
        if (!snakeState) return;
        var d = e.detail;
        if (d === 'stop')                                           { stopSnake(); return; }
        if (d === 'a' || d === 'b' || d === 'start' || d === 'select') {
            if (gameState === 'over') { init(); return; }
        }
        var dirMap = { up: UP, down: DOWN, left: LEFT, right: RIGHT };
        if (dirMap[d]) turn(dirMap[d]);
    }

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend',   handleTouchEnd,   { passive: false });
    window.addEventListener('gbinput', handleGbInput);

    // Store refs for cleanup in stopSnake()
    snakeState = {
        canvas:      canvas,
        toiletId:    toiletId,
        _touchStart: handleTouchStart,
        _touchEnd:   handleTouchEnd,
        _gbHandler:  handleGbInput
    };

    // ── Boot ──────────────────────────────────────────────────────
    init();
    _snakeRafId         = requestAnimationFrame(loop);
    window._gameLoopRaf = _snakeRafId;
}
