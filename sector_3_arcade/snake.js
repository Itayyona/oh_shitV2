var snakePhaserGame = null;
var snakeSceneRef = null;

function stopSnake() {
    if (snakeSceneRef && snakeSceneRef._gbInputHandler) {
        window.removeEventListener('gbinput', snakeSceneRef._gbInputHandler);
        snakeSceneRef._gbInputHandler = null;
    }
    if (snakePhaserGame) {
        try { snakePhaserGame.destroy(true, false); } catch (e) {}
        snakePhaserGame = null;
        snakeSceneRef = null;
    }
}

function startSnake(canvas, toiletId) {
    stopSnake();
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(280, Math.floor(rect.width));
    var height = Math.max(280, Math.floor(rect.height));

    snakePhaserGame = new Phaser.Game({
        type: Phaser.AUTO,
        canvas: canvas,
        width: width,
        height: height,
        backgroundColor: '#000000',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH
        },
        scene: {
            create: snakeSceneCreate,
            update: snakeSceneUpdate
        }
    });
}

function snakeSceneCreate() {
    snakeSceneRef = this;
    var canvas = this.sys.canvas;
    this.width = canvas.width;
    this.height = canvas.height;
    this.gridCols = 14;
    this.gridRows = 14;
    this.cellSize = Math.floor(Math.min(this.width, this.height) / 16);
    if (this.cellSize < 18) this.cellSize = 18;
    this.boardWidth = this.cellSize * this.gridCols;
    this.boardHeight = this.cellSize * this.gridRows;
    this.offsetX = Math.round((this.width - this.boardWidth) / 2);
    this.offsetY = Math.round((this.height - this.boardHeight) / 2);

    this.level = 1;
    this.score = 0;
    this.foodEaten = 0;
    this.grow = 0;
    this.gameOver = false;
    this.moveTimer = 0;
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.setMoveInterval = function() {
        this.moveInterval = Math.max(80, 220 - (this.level - 1) * 20);
    };
    this.setMoveInterval();

    this.resetSnake = function() {
        this.snake = [
            { x: 7, y: 7 },
            { x: 6, y: 7 },
            { x: 5, y: 7 }
        ];
        this.direction = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };
        this.grow = 0;
        this.moveTimer = 0;
    };
    this.resetSnake();

    this.spawnFood = function() {
        for (var i = 0; i < 200; i++) {
            var fx = Phaser.Math.Between(2, 11);
            var fy = Phaser.Math.Between(2, 11);
            var blocked = false;
            for (var k = 0; k < this.snake.length; k++) {
                if (this.snake[k].x === fx && this.snake[k].y === fy) {
                    blocked = true;
                    break;
                }
            }
            if (!blocked) {
                this.food = { x: fx, y: fy };
                return;
            }
        }
        this.food = { x: 7, y: 7 };
    };
    this.spawnFood();

    this.graphics = this.add.graphics();
    this.foodText = this.add.text(0, 0, '\u{1F9FB}', { font: Math.round(this.cellSize * 0.95) + 'px Arial' }).setOrigin(0.5);
    this.snakeTexts = [];
    this.overlayText = this.add.text(this.width / 2, this.height / 2, '', {
        font: '20px Arial',
        fill: '#ffffff',
        align: 'center',
        wordWrap: { width: this.boardWidth - 40 }
    }).setOrigin(0.5).setDepth(10).setVisible(false);

    this.handleDirection = function(dir) {
        if (this.gameOver) return;
        var dx = this.direction.x;
        var dy = this.direction.y;
        if (dir === 'up' && dy !== 1) this.nextDirection = { x: 0, y: -1 };
        if (dir === 'down' && dy !== -1) this.nextDirection = { x: 0, y: 1 };
        if (dir === 'left' && dx !== 1) this.nextDirection = { x: -1, y: 0 };
        if (dir === 'right' && dx !== -1) this.nextDirection = { x: 1, y: 0 };
    };

    this.saveScore = function() {
        try {
            var userName = localStorage.getItem('username') || 'anonymous';
            var allScores = JSON.parse(localStorage.getItem('arcade_scores') || '{}');
            if (!allScores.snake) allScores.snake = {};
            var prev = allScores.snake[userName] || 0;
            if (this.score > prev) allScores.snake[userName] = this.score;
            localStorage.setItem('arcade_scores', JSON.stringify(allScores));
        } catch (e) {}
    };

    this.endGame = function() {
        if (this.gameOver) return;
        this.gameOver = true;
        this.saveScore();
    };

    this.restart = function() {
        this.level = 1;
        this.score = 0;
        this.foodEaten = 0;
        this.grow = 0;
        this.gameOver = false;
        this.setMoveInterval();
        this.resetSnake();
        this.spawnFood();
        updateGameHUD(this.level, this.score);
    };

    this.step = function() {
        if (this.gameOver) return;
        this.direction = { x: this.nextDirection.x, y: this.nextDirection.y };
        var head = this.snake[0];
        var newHead = { x: head.x + this.direction.x, y: head.y + this.direction.y };

        if (newHead.x < 1 || newHead.x > 12 || newHead.y < 1 || newHead.y > 12) {
            this.endGame();
            return;
        }
        for (var i = 0; i < this.snake.length; i++) {
            if (this.snake[i].x === newHead.x && this.snake[i].y === newHead.y) {
                this.endGame();
                return;
            }
        }

        this.snake.unshift(newHead);
        if (newHead.x === this.food.x && newHead.y === this.food.y) {
            this.score += 10 * this.level;
            this.foodEaten++;
            this.grow += 3;
            updateGameHUD(this.level, this.score);
            if (this.foodEaten % 5 === 0) {
                onLevelComplete('snake', this.level, this.score);
                this.level++;
                this.setMoveInterval();
                this.resetSnake();
                updateGameHUD(this.level, this.score);
            }
            this.spawnFood();
        }
        if (this.grow > 0) {
            this.grow--;
        } else {
            this.snake.pop();
        }
    };

    this.drawScene = function() {
        this.graphics.clear();
        this.graphics.fillStyle(0xffffff, 1);
        this.graphics.fillRoundedRect(this.offsetX - 8, this.offsetY - 8, this.boardWidth + 16, this.boardHeight + 16, 24);
        this.graphics.lineStyle(6, 0xd8d8d8, 1);
        this.graphics.strokeRoundedRect(this.offsetX - 8, this.offsetY - 8, this.boardWidth + 16, this.boardHeight + 16, 24);

        this.graphics.fillStyle(0x80d8f8, 1);
        this.graphics.fillRoundedRect(this.offsetX, this.offsetY, this.boardWidth, this.boardHeight, 18);
        this.graphics.lineStyle(4, 0x0eaccf, 0.35);
        this.graphics.strokeRoundedRect(this.offsetX, this.offsetY, this.boardWidth, this.boardHeight, 18);

        this.graphics.lineStyle(1, 0xffffff, 0.35);
        for (var i = 0; i <= this.gridRows; i++) {
            var y = this.offsetY + i * this.cellSize;
            this.graphics.beginPath();
            this.graphics.moveTo(this.offsetX, y);
            this.graphics.lineTo(this.offsetX + this.boardWidth, y);
            this.graphics.strokePath();
        }
        for (var j = 0; j <= this.gridCols; j++) {
            var x = this.offsetX + j * this.cellSize;
            this.graphics.beginPath();
            this.graphics.moveTo(x, this.offsetY);
            this.graphics.lineTo(x, this.offsetY + this.boardHeight);
            this.graphics.strokePath();
        }

        if (this.food) {
            var fx = this.offsetX + this.food.x * this.cellSize + this.cellSize / 2;
            var fy = this.offsetY + this.food.y * this.cellSize + this.cellSize / 2;
            this.foodText.setFontSize(Math.round(this.cellSize * 0.95));
            this.foodText.setPosition(fx, fy);
            this.foodText.setVisible(true);
        }

        while (this.snakeTexts.length < this.snake.length) {
            this.snakeTexts.push(this.add.text(0, 0, '\u{1F4A9}', { font: Math.round(this.cellSize * 0.95) + 'px Arial' }).setOrigin(0.5));
        }
        while (this.snakeTexts.length > this.snake.length) {
            this.snakeTexts.pop().destroy();
        }

        for (var k = 0; k < this.snake.length; k++) {
            var seg = this.snake[k];
            var px = this.offsetX + seg.x * this.cellSize + this.cellSize / 2;
            var py = this.offsetY + seg.y * this.cellSize + this.cellSize / 2;
            this.snakeTexts[k].setPosition(px, py);
        }

        if (this.snake.length > 0) {
            var head = this.snake[0];
            var hx = this.offsetX + head.x * this.cellSize + this.cellSize / 2;
            var hy = this.offsetY + head.y * this.cellSize + this.cellSize / 2;
            this.graphics.fillStyle(0xffffff, 1);
            this.graphics.fillCircle(hx - this.cellSize * 0.14, hy - this.cellSize * 0.18, this.cellSize * 0.07);
            this.graphics.fillCircle(hx + this.cellSize * 0.14, hy - this.cellSize * 0.18, this.cellSize * 0.07);
            this.graphics.fillStyle(0x111111, 1);
            this.graphics.fillCircle(hx - this.cellSize * 0.14, hy - this.cellSize * 0.18, this.cellSize * 0.03);
            this.graphics.fillCircle(hx + this.cellSize * 0.14, hy - this.cellSize * 0.18, this.cellSize * 0.03);
        }

        if (this.gameOver) {
            this.graphics.fillStyle(0x000000, 0.88);
            this.graphics.fillRect(this.offsetX, this.offsetY, this.boardWidth, this.boardHeight);
            this.overlayText.setText('GAME OVER\nScore: ' + this.score + ' \u{1F9FB}\nLevel: ' + this.level + '\nTap A or START to restart');
            this.overlayText.setPosition(this.width / 2, this.height / 2);
            this.overlayText.setVisible(true);
        } else {
            this.overlayText.setVisible(false);
        }
    };

    this.input.on('pointerdown', function(pointer) {
        this._touchStart = { x: pointer.x, y: pointer.y };
    }, this);

    this.input.on('pointerup', function(pointer) {
        if (!this._touchStart) return;
        var dx = pointer.x - this._touchStart.x;
        var dy = pointer.y - this._touchStart.y;
        this._touchStart = null;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        var dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        this.handleDirection(dir);
    }, this);

    this.input.keyboard.on('keydown', function(event) {
        switch (event.code) {
            case 'ArrowUp': this.handleDirection('up'); break;
            case 'ArrowDown': this.handleDirection('down'); break;
            case 'ArrowLeft': this.handleDirection('left'); break;
            case 'ArrowRight': this.handleDirection('right'); break;
        }
    }, this);

    this._gbInputHandler = function(e) {
        var d = e.detail;
        if (d === 'stop') {
            stopSnake();
            return;
        }
        if (this.gameOver) {
            if (d === 'a' || d === 'start') this.restart();
            return;
        }
        if (d === 'up' || d === 'down' || d === 'left' || d === 'right') {
            this.handleDirection(d);
        }
        if (d === 'a' || d === 'start') {
            if (this.gameOver) this.restart();
        }
    }.bind(this);
    window.addEventListener('gbinput', this._gbInputHandler);

    updateGameHUD(this.level, this.score);
    this.drawScene();
}

function snakeSceneUpdate(time, delta) {
    if (!snakeSceneRef || snakeSceneRef.gameOver) return;
    snakeSceneRef.moveTimer += delta;
    if (snakeSceneRef.moveTimer >= snakeSceneRef.moveInterval) {
        snakeSceneRef.moveTimer -= snakeSceneRef.moveInterval;
        snakeSceneRef.step();
    }
    snakeSceneRef.drawScene();
}
