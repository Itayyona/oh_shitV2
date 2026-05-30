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

    canvas.width = window.innerWidth;
    canvas.height = Math.floor(window.innerHeight * 0.58);
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';

    var ctx = canvas.getContext('2d');
    var cell = Math.floor(canvas.width / 20);
    var cols = 20;
    var rows = Math.max(6, Math.floor(canvas.height / cell));
    var offsetX = Math.floor((canvas.width - cols * cell) / 2);
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
        queuedDirections: [],
        lastTouchX: 0,
        lastTouchY: 0,
        frameCount: 0,
        moveEveryFrames: 4,
        maxCells: 4,
        gameOver: false,
        running: true,
        bestScore: bestScore,
        touchStartHandler: null,
        touchEndHandler: null,
        _gbInputHandler: null,
        saveBestScore: function() {
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                localStorage.setItem('snake_best', String(this.bestScore));
            }
        }
    };

    function resetGame() {
        snakeState.score = 0;
        snakeState.level = 1;
        snakeState.maxCells = 4;
        snakeState.direction = { x: 1, y: 0 };
        snakeState.queuedDirections = [];
        snakeState.gameOver = false;
        snakeState.running = true;
        snakeState.frameCount = 0;
        spawnSnake();
        spawnFood();
        updateGameHUD(1, snakeState.score);
    }

    function spawnSnake() {
        var startX = Math.floor(snakeState.cols / 2);
        var startY = Math.floor(snakeState.rows / 2);
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
            if (!occupied) {
                snakeState.food = { x: fx, y: fy };
                return;
            }
        }
        snakeState.food = { x: 0, y: 0 };
    }

    function isOpposite(a, b) {
        return a.x === -b.x && a.y === -b.y;
    }

    function queueDirection(direction) {
        if (!direction) return;
        var last = snakeState.queuedDirections.length ? snakeState.queuedDirections[snakeState.queuedDirections.length - 1] : snakeState.direction;
        if (isOpposite(direction, last)) return;
        if (snakeState.queuedDirections.length > 2) {
            snakeState.queuedDirections.shift();
        }
        snakeState.queuedDirections.push(direction);
    }

    function handleTouchStart(event) {
        if (!event.touches || !event.touches[0]) return;
        var touch = event.touches[0];
        snakeState.lastTouchX = touch.clientX;
        snakeState.lastTouchY = touch.clientY;
    }

    function handleTouchEnd(event) {
        if (!event.changedTouches || !event.changedTouches[0]) return;
        var touch = event.changedTouches[0];
        var dx = touch.clientX - snakeState.lastTouchX;
        var dy = touch.clientY - snakeState.lastTouchY;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 30) {
            if (snakeState.gameOver) {
                resetGame();
            }
            return;
        }
        var direction;
        if (Math.abs(dx) > Math.abs(dy)) {
            direction = dx < 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
        } else {
            direction = dy < 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
        }
        queueDirection(direction);
    }

    function handleGbInput(event) {
        if (!snakeState) return;
        var detail = event.detail;
        if (detail === 'stop') {
            stopSnake();
            return;
        }
        if (snakeState.gameOver) {
            if (detail === 'a' || detail === 'start' || detail === 'select') {
                resetGame();
            }
            return;
        }
        if (detail === 'up' || detail === 'down' || detail === 'left' || detail === 'right') {
            var dir = { x: 0, y: 0 };
            if (detail === 'up') dir = { x: 0, y: -1 };
            if (detail === 'down') dir = { x: 0, y: 1 };
            if (detail === 'left') dir = { x: -1, y: 0 };
            if (detail === 'right') dir = { x: 1, y: 0 };
            queueDirection(dir);
        }
    }

    function wrap(value, max) {
        if (value < 0) return max - 1;
        if (value >= max) return 0;
        return value;
    }

    function moveSnake() {
        if (snakeState.gameOver) return;
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

        for (var i = 0; i < snakeState.cells.length; i++) {
            if (snakeState.cells[i].x === nextHead.x && snakeState.cells[i].y === nextHead.y) {
                snakeState.gameOver = true;
                snakeState.running = false;
                snakeState.saveBestScore();
                return;
            }
        }

        snakeState.cells.unshift(nextHead);
        if (snakeState.food && nextHead.x === snakeState.food.x && nextHead.y === snakeState.food.y) {
            snakeState.maxCells++;
            snakeState.score += 10;
            updateGameHUD(1, snakeState.score);
            snakeState.saveBestScore();
            spawnFood();
        }
        if (snakeState.cells.length > snakeState.maxCells) {
            snakeState.cells.pop();
        }
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        if (ctx.roundRect) {
            ctx.roundRect(x, y, width, height, radius);
            return;
        }
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    function draw() {
        var ctx = snakeState.ctx;
        var width = snakeState.canvas.width;
        var height = snakeState.canvas.height;
        var cell = snakeState.cell;
        var offsetX = snakeState.offsetX;
        var offsetY = snakeState.offsetY;
        var border = 10;
        var radius = 14;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#f1f1f1';
        ctx.lineWidth = border;
        drawRoundedRect(ctx, border / 2, border / 2, width - border, height - border, radius);
        ctx.stroke();

        if (snakeState.food) {
            var fx = offsetX + snakeState.food.x * cell + cell / 2;
            var fy = offsetY + snakeState.food.y * cell + cell / 2;
            var foodR = cell * 0.34;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(fx, fy, foodR, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#8b5a3c';
            ctx.beginPath(); ctx.arc(fx, fy, foodR * 0.45, 0, Math.PI * 2); ctx.fill();
        }

        for (var i = snakeState.cells.length - 1; i >= 0; i--) {
            var segment = snakeState.cells[i];
            var segX = offsetX + segment.x * cell;
            var segY = offsetY + segment.y * cell;
            if (i === 0) {
                var cx = segX + cell / 2;
                var cy = segY + cell / 2;
                var headR = (cell - 6) / 2;
                ctx.fillStyle = '#6b3a2a';
                ctx.beginPath(); ctx.arc(cx, cy, headR, 0, Math.PI * 2); ctx.fill();
                var eyeR = Math.max(1, cell * 0.06);
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(cx - cell * 0.18, cy - cell * 0.18, eyeR, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(cx + cell * 0.18, cy - cell * 0.18, eyeR, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#202020';
                ctx.beginPath(); ctx.arc(cx - cell * 0.18, cy - cell * 0.18, eyeR * 0.45, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(cx + cell * 0.18, cy - cell * 0.18, eyeR * 0.45, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.fillStyle = '#6b3a2a';
                drawRoundedRect(ctx, segX + 2, segY + 2, cell - 4, cell - 4, 6);
                ctx.fill();
            }
        }

        if (snakeState.gameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold ' + Math.max(24, Math.round(height * 0.06)) + 'px Nunito, sans-serif';
            ctx.fillText('GAME OVER', width / 2, height * 0.34);
            ctx.font = Math.max(16, Math.round(height * 0.04)) + 'px Nunito, sans-serif';
            ctx.fillText('🧻 ' + snakeState.score, width / 2, height * 0.5);
            ctx.fillText('Tap to restart', width / 2, height * 0.62);
        }
    }

    function frameLoop() {
        if (!snakeState) return;
        window._gameLoopRaf = requestAnimationFrame(frameLoop);
        snakeState.frameCount++;
        if (snakeState.running && snakeState.frameCount % snakeState.moveEveryFrames === 0) {
            moveSnake();
        }
        draw();
    }

    spawnSnake();
    spawnFood();
    updateGameHUD(1, snakeState.score);

    snakeState.touchStartHandler = handleTouchStart;
    snakeState.touchEndHandler = handleTouchEnd;
    snakeState.canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    snakeState.canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    snakeState._gbInputHandler = handleGbInput;
    window.addEventListener('gbinput', handleGbInput);

    window._gameLoopRaf = requestAnimationFrame(frameLoop);
}
