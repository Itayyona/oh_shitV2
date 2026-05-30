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
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    var ctx = canvas.getContext('2d');
    var cols = 20;
    var cell = Math.max(1, Math.floor(canvas.width / cols));
    var rows = Math.max(4, Math.floor(canvas.height / cell));
    var gridWidth = cols * cell;
    var gridHeight = rows * cell;
    var offsetX = Math.round((canvas.width - gridWidth) / 2);
    var offsetY = Math.round((canvas.height - gridHeight) / 2);

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
        snake: [],
        food: null,
        direction: { x: 1, y: 0 },
        queuedDirections: [],
        lastTouchX: 0,
        lastTouchY: 0,
        lastMoveTime: performance.now(),
        moveInterval: 150,
        gameOver: false,
        running: true,
        bestScore: bestScore,
        touchStartHandler: null,
        touchEndHandler: null,
        _gbInputHandler: null,
        updateLevel: function() {
            var newLevel = Math.floor(this.score / 50) + 1;
            if (newLevel !== this.level) {
                this.level = newLevel;
                this.moveInterval = Math.max(80, 150 - (this.level - 1) * 10);
            }
        },
        resetGame: function() {
            this.score = 0;
            this.level = 1;
            this.moveInterval = 150;
            this.direction = { x: 1, y: 0 };
            this.queuedDirections = [];
            this.gameOver = false;
            this.running = true;
            this.spawnSnake();
            this.spawnFood();
            updateGameHUD(this.level, this.score);
        },
        spawnSnake: function() {
            var midX = Math.floor(this.cols / 2);
            var midY = Math.floor(this.rows / 2);
            this.snake = [
                { x: midX, y: midY },
                { x: midX - 1, y: midY },
                { x: midX - 2, y: midY }
            ];
        },
        spawnFood: function() {
            for (var attempt = 0; attempt < 200; attempt++) {
                var fx = Math.floor(Math.random() * this.cols);
                var fy = Math.floor(Math.random() * this.rows);
                var occupied = false;
                for (var si = 0; si < this.snake.length; si++) {
                    if (this.snake[si].x === fx && this.snake[si].y === fy) {
                        occupied = true;
                        break;
                    }
                }
                if (!occupied) {
                    this.food = { x: fx, y: fy };
                    return;
                }
            }
            this.food = { x: 0, y: 0 };
        },
        saveBestScore: function() {
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                localStorage.setItem('snake_best', String(this.bestScore));
            }
        }
    };

    snakeState.spawnSnake();
    snakeState.spawnFood();
    updateGameHUD(snakeState.level, snakeState.score);

    function isOpposite(dirA, dirB) {
        return dirA.x === -dirB.x && dirA.y === -dirB.y;
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
                snakeState.resetGame();
            }
            return;
        }
        var direction;
        if (Math.abs(dx) > Math.abs(dy)) {
            direction = dx < 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
        } else {
            direction = dy < 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
        }
        if (isOpposite(direction, snakeState.direction)) {
            return;
        }
        queueDirection(direction);
    }

    snakeState.touchStartHandler = handleTouchStart;
    snakeState.touchEndHandler = handleTouchEnd;
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    snakeState._gbInputHandler = function(event) {
        var detail = event.detail;
        if (detail === 'stop') {
            stopSnake();
            return;
        }
        if (snakeState.gameOver && (detail === 'a' || detail === 'start')) {
            snakeState.resetGame();
            return;
        }
    };
    window.addEventListener('gbinput', snakeState._gbInputHandler);

    function moveSnake() {
        if (snakeState.gameOver) return;
        if (snakeState.queuedDirections.length) {
            var next = snakeState.queuedDirections.shift();
            if (!isOpposite(next, snakeState.direction)) {
                snakeState.direction = next;
            }
        }
        var head = snakeState.snake[0];
        var nextHead = { x: head.x + snakeState.direction.x, y: head.y + snakeState.direction.y };

        if (nextHead.x < 0 || nextHead.x >= snakeState.cols || nextHead.y < 0 || nextHead.y >= snakeState.rows) {
            snakeState.gameOver = true;
            snakeState.running = false;
            snakeState.saveBestScore();
            return;
        }

        for (var i = 0; i < snakeState.snake.length; i++) {
            if (snakeState.snake[i].x === nextHead.x && snakeState.snake[i].y === nextHead.y) {
                snakeState.gameOver = true;
                snakeState.running = false;
                snakeState.saveBestScore();
                return;
            }
        }

        snakeState.snake.unshift(nextHead);
        if (snakeState.food && nextHead.x === snakeState.food.x && nextHead.y === snakeState.food.y) {
            snakeState.score += 10;
            snakeState.updateLevel();
            updateGameHUD(snakeState.level, snakeState.score);
            queueDirection(snakeState.direction);
            snakeState.spawnFood();
            snakeState.saveBestScore();
        } else {
            snakeState.snake.pop();
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
        var radius = Math.min(width, height) * 0.06;
        var ring = Math.min(width, height) * 0.04;

        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = '#d7f1ff';
        drawRoundedRect(ctx, ring, ring, width - ring * 2, height - ring * 2, radius);
        ctx.fill();

        ctx.strokeStyle = '#f8f9fb';
        ctx.lineWidth = ring * 0.35;
        drawRoundedRect(ctx, ring, ring, width - ring * 2, height - ring * 2, radius);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = Math.max(1, ring * 0.03);
        for (var line = offsetY; line <= offsetY + snakeState.rows * cell; line += cell) {
            ctx.beginPath();
            ctx.moveTo(offsetX, line);
            ctx.lineTo(offsetX + snakeState.cols * cell, line);
            ctx.stroke();
        }
        for (var col = offsetX; col <= offsetX + snakeState.cols * cell; col += cell) {
            ctx.beginPath();
            ctx.moveTo(col, offsetY);
            ctx.lineTo(col, offsetY + snakeState.rows * cell);
            ctx.stroke();
        }

        if (snakeState.food) {
            var foodX = offsetX + snakeState.food.x * cell + cell / 2;
            var foodY = offsetY + snakeState.food.y * cell + cell / 2;
            var foodRadius = cell * 0.32;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(foodX - foodRadius * 0.4, foodY, foodRadius, Math.PI * 0.5, Math.PI * 1.5);
            ctx.arc(foodX + foodRadius * 0.4, foodY, foodRadius, Math.PI * 1.5, Math.PI * 0.5);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#e3e3e3';
            ctx.beginPath();
            ctx.arc(foodX - foodRadius * 0.4, foodY - foodRadius * 0.65, foodRadius * 0.32, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(foodX + foodRadius * 0.4, foodY - foodRadius * 0.65, foodRadius * 0.32, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#c8c8c8';
            ctx.lineWidth = Math.max(1, foodRadius * 0.12);
            ctx.beginPath();
            ctx.moveTo(foodX - foodRadius * 0.7, foodY);
            ctx.lineTo(foodX + foodRadius * 0.7, foodY);
            ctx.stroke();
        }

        for (var i = snakeState.snake.length - 1; i >= 0; i--) {
            var segment = snakeState.snake[i];
            var segX = offsetX + segment.x * cell;
            var segY = offsetY + segment.y * cell;
            var pad = cell * 0.12;
            var size = cell - pad * 2;
            var color = i === 0 ? '#6b3f20' : (i % 2 ? '#7e4722' : '#a15a31');

            ctx.fillStyle = color;
            drawRoundedRect(ctx, segX + pad, segY + pad, size, size, size * 0.25);
            ctx.fill();

            if (i === 0) {
                var eyeRadius = cell * 0.06;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(segX + cell * 0.28, segY + cell * 0.30, eyeRadius, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(segX + cell * 0.72, segY + cell * 0.30, eyeRadius, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#202020';
                ctx.beginPath(); ctx.arc(segX + cell * 0.28, segY + cell * 0.30, eyeRadius * 0.45, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(segX + cell * 0.72, segY + cell * 0.30, eyeRadius * 0.45, 0, Math.PI * 2); ctx.fill();

                ctx.strokeStyle = '#d65a4a';
                ctx.lineWidth = Math.max(1, cell * 0.04);
                ctx.beginPath();
                ctx.moveTo(segX + cell * 0.5, segY + cell * 0.5);
                ctx.lineTo(segX + cell * 0.5, segY + cell * 0.75);
                ctx.stroke();
            }
        }

        if (snakeState.gameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffffff';
            var titleSize = Math.max(18, Math.round(height * 0.06));
            ctx.font = 'bold ' + titleSize + 'px Nunito, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GAME OVER', width / 2, height * 0.36);
            ctx.font = Math.max(14, Math.round(height * 0.035)) + 'px Nunito, sans-serif';
            ctx.fillText('Score: ' + snakeState.score, width / 2, height * 0.48);
            ctx.fillText('Best: ' + snakeState.bestScore, width / 2, height * 0.54);
            ctx.font = Math.max(12, Math.round(height * 0.03)) + 'px Nunito, sans-serif';
            ctx.fillText('Tap to play again', width / 2, height * 0.64);
        }
    }

    function frameLoop(timestamp) {
        if (!snakeState) return;
        window._gameLoopRaf = requestAnimationFrame(frameLoop);
        if (!snakeState.running) {
            draw();
            return;
        }
        if (timestamp - snakeState.lastMoveTime >= snakeState.moveInterval) {
            snakeState.lastMoveTime = timestamp;
            moveSnake();
        }
        draw();
    }

    snakeState.lastMoveTime = performance.now();
    window._gameLoopRaf = requestAnimationFrame(frameLoop);
}
