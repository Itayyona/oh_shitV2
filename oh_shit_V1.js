// ── TETRIS — Oh Sh*t Edition ──
// Automatic Locking & Instant-Spawn Logic

var tetrisGame = {
    canvas: null, ctx: null, toiletId: null,
    level: 1, score: 0, lines: 0, gameRunning: false,
    CELL: 20, COLS: 10, ROWS: 14,
    board: [], current: null, next: null,
    dropTimer: 0, dropInterval: 40, frame: 0,

    PIECES: [
        { shape:[[1,1,1,1]], color:'#00f0f0' },
        { shape:[[1,1],[1,1]], color:'#f0f000' },
        { shape:[[0,1,0],[1,1,1]], color:'#a000f0' },
        { shape:[[0,1,1],[1,1,0]], color:'#00f000' },
        { shape:[[1,1,0],[0,1,1]], color:'#f00000' },
        { shape:[[1,0,0],[1,1,1]], color:'#0000f0' },
        { shape:[[0,0,1],[1,1,1]], color:'#f0a000' },
    ],

    seed: function(n) {
        var s = n * 1234 + 5678;
        return { next: function() { s = (s * 16807) % 2147483647; return s / 2147483647; } };
    },

    init: function(canvas, toiletId) {
        this.canvas = canvas; this.ctx = canvas.getContext('2d');
        this.toiletId = toiletId; this.level = 1; this.score = 0;
        this.lines = 0; this.gameRunning = true; this.frame = 0;
        this.rng = this.seed(Date.now());
        this.setupBoard();
        this.next = this.randomPiece();
        this.current = this.spawnPiece();
        this.bindInput();
        this.startLoop();
    },

    setupBoard: function() {
        this.board = Array.from({ length: this.ROWS }, () => Array(this.COLS).fill(null));
    },

    randomPiece: function() {
        var p = this.PIECES[Math.floor(this.rng.next() * this.PIECES.length)];
        return { shape: p.shape.map(r => [...r]), color: p.color, x: 0, y: 0 };
    },

    spawnPiece: function() {
        var p = this.next;
        p.x = Math.floor(this.COLS / 2) - Math.floor(p.shape[0].length / 2);
        p.y = 0;
        this.next = this.randomPiece();
        if (this.collides(p, 0, 0)) { this.gameOver(); return null; }
        return p;
    },

    bindInput: function() {
        var self = this;
        self._onInput = function(e) {
            var d = e.detail;
            if (d === 'stop') { self.stop(); return; }
            if (!self.gameRunning || !self.current) return;
            if (d === 'left') self.move(-1, 0);
            if (d === 'right') self.move(1, 0);
            if (d === 'down') self.move(0, 1);
            if (d === 'up' || d === 'a') self.rotate();
            if (d === 'b' || d === 'start') self.hardDrop();
        };
        window.addEventListener('gbinput', self._onInput);
    },

    startLoop: function() {
        var self = this;
        if (window._gameLoop) clearInterval(window._gameLoop);
        window._gameLoop = setInterval(() => self.tick(), 1000 / 60);
    },

    tick: function() {
        if (!this.gameRunning) return;
        if (!this.current) { this.current = this.spawnPiece(); if (!this.current) return; }
        this.dropTimer++;
        if (this.dropTimer >= this.dropInterval) {
            this.dropTimer = 0;
            if (!this.move(0, 1)) this.lock();
        }
        this.draw();
    },

    move: function(dx, dy) {
        if (!this.collides(this.current, dx, dy)) {
            this.current.x += dx; this.current.y += dy;
            return true;
        }
        return false;
    },

    rotate: function() {
        var old = this.current.shape;
        this.current.shape = this.current.shape[0].map((_, i) => this.current.shape.map(r => r[i]).reverse());
        if (this.collides(this.current, 0, 0)) this.current.shape = old;
    },

    hardDrop: function() {
        while (this.move(0, 1)) { this.score += 2; }
        this.lock();
    },

    collides: function(p, dx, dy) {
        for (var r = 0; r < p.shape.length; r++) {
            for (var c = 0; c < p.shape[r].length; c++) {
                if (!p.shape[r][c]) continue;
                var br = p.y + dy + r, bc = p.x + dx + c;
                if (bc < 0 || bc >= this.COLS || br >= this.ROWS || (br >= 0 && this.board[br][bc])) return true;
            }
        }
        return false;
    },

    lock: function() {
        for (var r = 0; r < this.current.shape.length; r++) {
            for (var c = 0; c < this.current.shape[r].length; c++) {
                if (this.current.shape[r][c]) {
                    var br = this.current.y + r;
                    if (br >= 0) this.board[br][this.current.x + c] = this.current.color;
                }
            }
        }
        for (var row = this.ROWS - 1; row >= 0; row--) {
            if (this.board[row].every(c => c !== null)) {
                this.board.splice(row, 1);
                this.board.unshift(Array(this.COLS).fill(null));
                this.lines++; row++;
            }
        }
        this.score += [0, 100, 300, 500, 800][Math.min(4, this.lines % 10)] * this.level;
        this.level = Math.floor(this.lines / 10) + 1;
        this.dropInterval = Math.max(5, 40 - (this.level * 3));
        if (typeof updateGameHUD === 'function') updateGameHUD(this.level, this.score);
        this.current = this.spawnPiece();
        this.dropTimer = 0;
    },

    draw: function() {
        var ctx = this.ctx, W = 280, H = 280, CELL = this.CELL, boardW = this.COLS * CELL, boardX = (W - boardW) / 2;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.translate(boardX, 0);
        ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, boardW, H);
        for (var r = 0; r < this.ROWS; r++) {
            for (var c = 0; c < this.COLS; c++) {
                if (this.board[r][c]) { ctx.fillStyle = this.board[r][c]; ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2); }
            }
        }
        if (this.current) {
            for (var r = 0; r < this.current.shape.length; r++) {
                for (var c = 0; c < this.current.shape[r].length; c++) {
                    if (this.current.shape[r][c]) { ctx.fillStyle = this.current.color; ctx.fillRect((this.current.x + c) * CELL + 1, (this.current.y + r) * CELL + 1, CELL - 2, CELL - 2); }
                }
            }
        }
        ctx.restore();
    },

    gameOver: function() { this.gameRunning = false; },
    stop: function() { this.gameRunning = false; clearInterval(window._gameLoop); window.removeEventListener('gbinput', this._onInput); }
};