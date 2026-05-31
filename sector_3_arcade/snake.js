// ── SNAKE — Oh Sh*t Edition ──
// Drop this file at: sector_3_arcade/snake.js

var snakeState = null;

function stopSnake() {
    if (snakeState) {
        if (snakeState.canvas) {
            snakeState.canvas.removeEventListener('touchstart', snakeState.touchStartHandler);
            snakeState.canvas.removeEventListener('touchend', snakeState.touchEndHandler);
        }
        if (snakeState._gbInputHandler) {
            window.removeEventListener('gbinput', snakeState._gbInputHandler);
            snakeState._gbInputHandler = null;
        }
        snakeState = null;
    }
    if (window._gameLoopRaf) {
        cancelAnimationFrame(window._gameLoopRaf);
        window._gameLoopRaf = null;
    }
    window._gameLoop = null;
}


function startSnake(canvas, toiletId) {
    stopSnake();

    // Canvas sized from the rendered toilet bowl after layout is fully visible
    var bowl = document.getElementById('toilet-bowl');
    var rect = bowl.getBoundingClientRect();
    canvas.width  = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
    canvas.style.width  = canvas.width  + 'px';
    canvas.style.height = canvas.height + 'px';

    var ctx  = canvas.getContext('2d');
    var cell = Math.floor(canvas.width / 20);
    var cols = 20;
    var rows = Math.max(8, Math.floor(canvas.height / cell));

    // Centre the grid in the canvas
    var offsetX = Math.floor((canvas.width  - cols * cell) / 2);
    var offsetY = Math.floor((canvas.height - rows * cell) / 2);

    var bestScore = Number(localStorage.getItem('snake_best') || 0);

    snakeState = {
        canvas: canvas,
        ctx: ctx,
        toiletId: toiletId,
        cols: cols,
        rows: rows,
        cell: cell,
        offsetX: offsetX,
        offsetY: offsetY,
        score: 0,
        level: 1,
        cells: [],
        food: null,
        direction: { x: 1, y: 0 },
        nextDirection: { x: 1, y: 0 },   // applied once per move tick (fixes false self-collision)
        queuedDirections: [],
        lastTouchX: 0,
        lastTouchY: 0,
        frameCount: 0,
        moveEveryFrames: 18,              // ~3.3 moves/sec at 60fps — comfortable on mobile
        maxCells: 4,
        gameOver: false,
        running: true,
        bestScore: bestScore,
        touchStartHandler: null,
        touchEndHandler: null,
        _gbInputHandler: null,

        saveBestScore: function () {
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                localStorage.setItem('snake_best', String(this.bestScore));
            }
        },

        // Award 🧻 rolls to the global counter
        addRolls: function (amount) {
            var current = Number(localStorage.getItem('rolls') || 0);
            var next    = current + amount;
            localStorage.setItem('rolls', String(next));
            // Update HUD counters if they exist
            var el1 = document.getElementById('roll-counter');
            var el2 = document.getElementById('store-roll-count');
            if (el1) el1.textContent = next;
            if (el2) el2.textContent = next;
        }
    };

    // ── helpers ──────────────────────────────────────────────────

    function resetGame() {
        snakeState.score           = 0;
        snakeState.level           = 1;
        snakeState.maxCells        = 4;
        snakeState.direction       = { x: 1, y: 0 };
        snakeState.nextDirection   = { x: 1, y: 0 };
        snakeState.queuedDirections = [];
        snakeState.gameOver        = false;
        snakeState.running         = true;
        snakeState.frameCount      = 0;
        snakeState.moveEveryFrames = 18;
        spawnSnake();
        spawnFood();
        if (typeof updateGameHUD === 'function') updateGameHUD(1, 0);
    }

    function spawnSnake() {
        var startX = Math.floor((snakeState.cols - 1) / 2);
        var startY = Math.floor((snakeState.rows - 1) / 2);
        snakeState.cells = [];
        for (var i = 0; i < snakeState.maxCells; i++) {
            snakeState.cells.push({ x: startX - i, y: startY });
        }
    }

    function spawnFood() {
        for (var attempt = 0; attempt < 200; attempt++) {
            var fx = Math.floor(Math.random() * snakeState.cols);
            var fy = Math.floor(Math.random() * snakeState.rows);
            var occupied = false;
            for (var j = 0; j < snakeState.cells.length; j++) {
                if (snakeState.cells[j].x === fx && snakeState.cells[j].y === fy) {
                    occupied = true;
                    break;
                }
            }
            if (!occupied) { snakeState.food = { x: fx, y: fy }; return; }
        }
        snakeState.food = { x: 0, y: 0 };
    }

    function isOpposite(a, b) {
        return a.x === -b.x && a.y === -b.y;
    }

    function queueDirection(dir) {
        if (!dir) return;
        var last = snakeState.queuedDirections.length
            ? snakeState.queuedDirections[snakeState.queuedDirections.length - 1]
            : snakeState.direction;
        if (isOpposite(dir, last)) return;
        if (snakeState.queuedDirections.length > 2) snakeState.queuedDirections.shift();
        snakeState.queuedDirections.push(dir);
    }

    function wrap(v, max) {
        if (v < 0) return max - 1;
        if (v >= max) return 0;
        return v;
    }

    // ── move ─────────────────────────────────────────────────────

    function moveSnake() {
        if (snakeState.gameOver) return;

        // Consume queued direction
        if (snakeState.queuedDirections.length) {
            var next = snakeState.queuedDirections.shift();
            if (!isOpposite(next, snakeState.direction)) {
                snakeState.direction = next;
            }
        }

        var head = snakeState.cells[0];
        var nextHead = {
            x: wrap(head.x + snakeState.direction.x, snakeState.cols),
            y: wrap(head.y + snakeState.direction.y, snakeState.rows)
        };

        // Self-collision: skip the last tail cell (it will move away this tick)
        var checkLen = snakeState.cells.length - 1;
        for (var i = 0; i < checkLen; i++) {
            if (snakeState.cells[i].x === nextHead.x && snakeState.cells[i].y === nextHead.y) {
                snakeState.gameOver = true;
                snakeState.running  = false;
                snakeState.saveBestScore();
                return;
            }
        }

        snakeState.cells.unshift(nextHead);

        // Ate food?
        if (snakeState.food && nextHead.x === snakeState.food.x && nextHead.y === snakeState.food.y) {
            snakeState.maxCells++;
            snakeState.score += 10;
            snakeState.saveBestScore();

            // Award 1 🧻 roll every 50 points
            if (snakeState.score % 50 === 0) {
                snakeState.addRolls(1);
            }

            // Level up every 5 food eaten (maxCells grows from 4, so level = floor((maxCells-4)/5)+1)
            snakeState.level = Math.floor((snakeState.maxCells - 4) / 5) + 1;

            // Speed up: start at 18 frames, drop 1 per level, floor at 6
            snakeState.moveEveryFrames = Math.max(6, 18 - (snakeState.level - 1));

            if (typeof updateGameHUD === 'function') updateGameHUD(snakeState.level, snakeState.score);
            spawnFood();
        }

        if (snakeState.cells.length > snakeState.maxCells) {
            snakeState.cells.pop();
        }
    }

    // ── draw ─────────────────────────────────────────────────────

    function draw() {
        var c  = snakeState.ctx;
        var W  = snakeState.canvas.width;
        var H  = snakeState.canvas.height;
        var cl = snakeState.cell;
        var ox = snakeState.offsetX;
        var oy = snakeState.offsetY;

        // Background — toilet water blue (#1a9fd4)
        c.fillStyle = '#1a9fd4';
        c.fillRect(0, 0, W, H);

        // Subtle grid lines
        c.strokeStyle = 'rgba(255,255,255,0.07)';
        c.lineWidth = 0.5;
        for (var col = 0; col <= snakeState.cols; col++) {
            c.beginPath();
            c.moveTo(ox + col * cl, oy);
            c.lineTo(ox + col * cl, oy + snakeState.rows * cl);
            c.stroke();
        }
        for (var row = 0; row <= snakeState.rows; row++) {
            c.beginPath();
            c.moveTo(ox, oy + row * cl);
            c.lineTo(ox + snakeState.cols * cl, oy + row * cl);
            c.stroke();
        }

        // Food — toilet roll 🧻
        if (snakeState.food) {
            var fx = ox + snakeState.food.x * cl + cl / 2;
            var fy = oy + snakeState.food.y * cl + cl / 2;
            c.font         = Math.max(10, cl - 2) + 'px serif';
            c.textAlign    = 'center';
            c.textBaseline = 'middle';
            c.fillText('🧻', fx, fy);
        }

        // Snake — pixel art, poop brown, hard square blocks
        for (var i = snakeState.cells.length - 1; i >= 0; i--) {
            var seg  = snakeState.cells[i];
            var segX = ox + seg.x * cl;
            var segY = oy + seg.y * cl;

            if (i === 0) {
                // Head
                c.fillStyle = '#7B4A2D';
                c.fillRect(segX + 1, segY + 1, cl - 2, cl - 2);

                // Pixel art eyes — 2×2 blocks, direction-aware
                var es  = Math.max(2, Math.floor(cl * 0.18));
                var ep  = Math.max(2, Math.floor(cl * 0.22));
                var dir = snakeState.direction;
                var e1x, e1y, e2x, e2y;

                if (dir.x === 1) {
                    e1x = segX + cl - ep - es; e1y = segY + ep;
                    e2x = segX + cl - ep - es; e2y = segY + cl - ep - es;
                } else if (dir.x === -1) {
                    e1x = segX + ep; e1y = segY + ep;
                    e2x = segX + ep; e2y = segY + cl - ep - es;
                } else if (dir.y === -1) {
                    e1x = segX + ep;           e1y = segY + ep;
                    e2x = segX + cl - ep - es; e2y = segY + ep;
                } else {
                    e1x = segX + ep;           e1y = segY + cl - ep - es;
                    e2x = segX + cl - ep - es; e2y = segY + cl - ep - es;
                }

                c.fillStyle = '#fff';
                c.fillRect(e1x, e1y, es, es);
                c.fillRect(e2x, e2y, es, es);
                c.fillStyle = '#111';
                c.fillRect(e1x + 1, e1y + 1, es - 1, es - 1);
                c.fillRect(e2x + 1, e2y + 1, es - 1, es - 1);

            } else {
                // Body — alternating brown shades
                c.fillStyle = (i % 2 === 0) ? '#7B4A2D' : '#5C3420';
                c.fillRect(segX + 1, segY + 1, cl - 2, cl - 2);
            }
        }

        // Game over overlay
        if (snakeState.gameOver) {
            c.fillStyle = 'rgba(0,0,0,0.78)';
            c.fillRect(0, 0, W, H);

            c.textAlign    = 'center';
            c.textBaseline = 'middle';

            c.fillStyle = '#ff4444';
            c.font      = 'bold ' + Math.max(16, Math.round(H * 0.09)) + 'px "Courier New",monospace';
            c.fillText('GAME OVER 💩', W / 2, H * 0.32);

            c.fillStyle = '#7fff00';
            c.font      = Math.max(11, Math.round(H * 0.055)) + 'px "Courier New",monospace';
            c.fillText('SCORE:' + snakeState.score + '  BEST:' + snakeState.bestScore, W / 2, H * 0.50);

            c.fillStyle = '#facc15';
            c.font      = Math.max(10, Math.round(H * 0.045)) + 'px "Courier New",monospace';
            c.fillText('TAP OR [A] TO RESTART', W / 2, H * 0.66);
        }
    }

    // ── game loop ─────────────────────────────────────────────────

    function frameLoop() {
        if (!snakeState) return;
        window._gameLoopRaf = requestAnimationFrame(frameLoop);
        snakeState.frameCount++;
        if (snakeState.running && snakeState.frameCount % snakeState.moveEveryFrames === 0) {
            moveSnake();
        }
        draw();
    }

    // ── input handlers ────────────────────────────────────────────

    function handleTouchStart(e) {
        if (!e.touches || !e.touches[0]) return;
        snakeState.lastTouchX = e.touches[0].clientX;
        snakeState.lastTouchY = e.touches[0].clientY;
    }

    function handleTouchEnd(e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        var t  = e.changedTouches[0];
        var dx = t.clientX - snakeState.lastTouchX;
        var dy = t.clientY - snakeState.lastTouchY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 30) {
            if (snakeState.gameOver) resetGame();
            return;
        }
        var dir;
        if (Math.abs(dx) > Math.abs(dy)) {
            dir = dx < 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
        } else {
            dir = dy < 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
        }
        queueDirection(dir);
    }

    function handleGbInput(e) {
        if (!snakeState) return;
        var d = e.detail;
        if (d === 'stop') { stopSnake(); return; }
        if (snakeState.gameOver) {
            if (d === 'a' || d === 'start' || d === 'select') resetGame();
            return;
        }
        var dirMap = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
        if (dirMap[d]) queueDirection(dirMap[d]);
    }

    // ── kick it off ───────────────────────────────────────────────

    spawnSnake();
    spawnFood();
    if (typeof updateGameHUD === 'function') updateGameHUD(1, 0);

    snakeState.touchStartHandler = handleTouchStart;
    snakeState.touchEndHandler   = handleTouchEnd;
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend',   handleTouchEnd,   { passive: false });

    snakeState._gbInputHandler = handleGbInput;
    window.addEventListener('gbinput', handleGbInput);

    window._gameLoopRaf = requestAnimationFrame(frameLoop);
}
