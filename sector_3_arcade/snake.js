// ── SNAKE — Oh Sh*t Edition ──
// Brown poo-style snake eats 🧻 toilet paper rolls
// 3 lives, slow start, speeds up per level

var snakeGame = {
    canvas: null, ctx: null, toiletId: null,
    level: 1, score: 0, lives: 3,
    foodEaten: 0, gameRunning: false, gameOver: false,
    _onInput: null, _loop: null,

    CELL: 20, COLS: 14, ROWS: 14,
    snake: [], food: null,
    dx: 1, dy: 0, nextDx: 1, nextDy: 0,
    growPending: 0, frame: 0,
    moveTimer: 0, moveInterval: 20,

    showBanner: false, bannerTimer: 0, bannerMsg: '',

    init: function(canvas, toiletId) {
        this.canvas      = canvas;
        this.ctx         = canvas.getContext('2d');
        this.toiletId    = toiletId;
        this.level       = 1;
        this.score       = 0;
        this.lives       = 3;
        this.foodEaten   = 0;
        this.gameOver    = false;
        this.gameRunning = true;
        this.frame       = 0;
        this.setupLevel();
        this.bindInput();
        this.startLoop();
    },

    setupLevel: function() {
        var mid = Math.floor(this.COLS / 2);
        this.snake = [
            { x:mid,   y:7 },
            { x:mid-1, y:7 },
            { x:mid-2, y:7 },
        ];
        this.dx          = 1;
        this.dy          = 0;
        this.nextDx      = 1;
        this.nextDy      = 0;
        this.growPending = 0;
        this.moveTimer   = 0;

        // Level 1=20, 2=17, 3=14, 4=11, 5=9, 6=7, 7+=5
        this.moveInterval = Math.max(5, 20 - (this.level-1) * 3);

        this.showBanner  = true;
        this.bannerTimer = 90;
        this.bannerMsg   = 'LEVEL ' + this.level;

        this.spawnFood();
        updateGameHUD(this.level, this.score);
    },

    spawnFood: function() {
        // Spawn within safe inner zone (cols 2-11, rows 2-11)
        for (var a = 0; a < 200; a++) {
            var fx = Math.floor(Math.random() * 10) + 2;
            var fy = Math.floor(Math.random() * 10) + 2;
            var ok = true;
            for (var i = 0; i < this.snake.length; i++) {
                if (this.snake[i].x===fx && this.snake[i].y===fy) { ok=false; break; }
            }
            if (ok) { this.food = { x:fx, y:fy }; return; }
        }
        this.food = { x:7, y:7 };
    },

    bindInput: function() {
        var self = this;
        if (self._onInput) window.removeEventListener('gbinput', self._onInput);
        self._onInput = function(e) {
            var d = e.detail;
            if (d === 'stop') { self.stop(); return; }
            if (self.gameOver) {
                if (d==='a'||d==='start') self.restart();
                return;
            }
            if (d==='up'    && self.dy!==1)  { self.nextDx=0;  self.nextDy=-1; }
            if (d==='down'  && self.dy!==-1) { self.nextDx=0;  self.nextDy=1;  }
            if (d==='left'  && self.dx!==1)  { self.nextDx=-1; self.nextDy=0;  }
            if (d==='right' && self.dx!==-1) { self.nextDx=1;  self.nextDy=0;  }
        };
        window.addEventListener('gbinput', self._onInput);
    },

    startLoop: function() {
        var self = this;
        if (self._loop) clearInterval(self._loop);
        window._gameLoop = self._loop = setInterval(function() {
            if (!self.gameRunning) return;
            self.frame++;
            // Banner
            if (self.showBanner) {
                self.bannerTimer--;
                if (self.bannerTimer<=0) self.showBanner=false;
                self.draw(); return;
            }
            self.moveTimer++;
            if (self.moveTimer >= self.moveInterval) {
                self.moveTimer = 0;
                self.update();
            }
            self.draw();
        }, 1000/60);
    },

    update: function() {
        if (this.gameOver) return;
        this.dx = this.nextDx;
        this.dy = this.nextDy;

        var head    = this.snake[0];
        var newHead = { x:head.x+this.dx, y:head.y+this.dy };

        // Wall collision — rounded rect boundary (water area: cells 1-12)
        var bx=newHead.x, by=newHead.y;
        var insideBowl = bx>=1 && bx<=12 && by>=1 && by<=12;
        if(!insideBowl){this.loseLife();return;}
        // Self collision
        for (var i=0; i<this.snake.length; i++) {
            if (this.snake[i].x===newHead.x && this.snake[i].y===newHead.y) {
                this.loseLife(); return;
            }
        }

        this.snake.unshift(newHead);

        // Eat food
        if (newHead.x===this.food.x && newHead.y===this.food.y) {
            this.score      += 10 * this.level;
            this.foodEaten++;
            this.growPending += 3;
            updateGameHUD(this.level, this.score);

            // Level up every 5 foods
            if (this.foodEaten % 5 === 0) {
                onLevelComplete('snake', this.level, this.score);
                this.level++;
                this.moveInterval = Math.max(5, 20-(this.level-1)*3);
                // Reset snake to starting size and position
                var mid = Math.floor(this.COLS/2);
                this.snake = [{x:mid,y:7},{x:mid-1,y:7},{x:mid-2,y:7}];
                this.dx=1; this.dy=0; this.nextDx=1; this.nextDy=0;
                this.growPending=0; this.moveTimer=0;
                this.showBanner   = true;
                this.bannerTimer  = 80;
                this.bannerMsg    = 'LEVEL ' + this.level;
                updateGameHUD(this.level, this.score);
            }
            this.spawnFood();
        }

        if (this.growPending>0) this.growPending--;
        else this.snake.pop();
    },

    loseLife: function() {
        this.lives--;
        if (this.lives<=0) {
            this.gameOver    = true;
            this.gameRunning = false;
            clearInterval(this._loop);
            this._loop = null;
        } else {
            // Respawn
            var mid = Math.floor(this.COLS/2);
            this.snake    = [{x:mid,y:7},{x:mid-1,y:7},{x:mid-2,y:7}];
            this.dx       = 1; this.dy=0;
            this.nextDx   = 1; this.nextDy=0;
            this.growPending = 0;
            this.moveTimer   = 0;
            this.showBanner  = true;
            this.bannerTimer = 75;
            this.bannerMsg   = '❤️ ' + this.lives + ' LIVES LEFT';
            this.spawnFood();
        }
    },

    restart: function() {
        this.level=1; this.score=0; this.lives=3;
        this.foodEaten=0; this.gameOver=false;
        this.gameRunning=true; this.frame=0;
        this.setupLevel();
        if (!this._loop) this.startLoop();
    },

    // ── DRAW SNAKE SEGMENT ──
    drawSegment: function(ctx, seg, isHead, idx) {
        var C   = this.CELL;
        var px  = seg.x * C;
        var py  = seg.y * C;
        var pad = 2;

        // Poo-brown colors
        ctx.fillStyle = isHead ? '#5c3317' : (idx%2===0 ? '#7a4520' : '#8a5528');
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px+pad, py+pad, C-pad*2, C-pad*2, 5);
        else ctx.rect(px+pad, py+pad, C-pad*2, C-pad*2);
        ctx.fill();

        // Shine on top
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(px+pad+1, py+pad+1, C-pad*2-3, 3);

        // Body scale dots
        if (!isHead) {
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.beginPath();
            ctx.arc(px+C/2, py+C/2, 3, 0, Math.PI*2);
            ctx.fill();
        }

        // Head details
        if (isHead) {
            // Eyes
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(px+C*0.28, py+C*0.3, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(px+C*0.72, py+C*0.3, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(px+C*0.30, py+C*0.32, 1.2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(px+C*0.74, py+C*0.32, 1.2, 0, Math.PI*2); ctx.fill();

            // Tongue flick
            if (Math.floor(this.frame/10) % 4 !== 0) {
                ctx.strokeStyle = '#ff3333';
                ctx.lineWidth   = 1.5;
                ctx.beginPath();
                ctx.moveTo(px+C/2, py+C*0.72);
                ctx.lineTo(px+C/2, py+C*0.9);
                ctx.moveTo(px+C/2, py+C*0.9);
                ctx.lineTo(px+C/2-3, py+C);
                ctx.moveTo(px+C/2, py+C*0.9);
                ctx.lineTo(px+C/2+3, py+C);
                ctx.stroke();
            }
        }
    },

    draw: function() {
        var ctx = this.ctx;
        var C   = this.CELL;
        var W   = 280, H = 280;

        // ── TOILET BOWL — top-down, rounded rectangle ──
        // Floor tiles
        ctx.fillStyle='#c8c8c8'; ctx.fillRect(0,0,W,H);
        ctx.strokeStyle='#b0b0b0'; ctx.lineWidth=1;
        for(var tx=0;tx<W;tx+=40){ctx.beginPath();ctx.moveTo(tx,0);ctx.lineTo(tx,H);ctx.stroke();}
        for(var ty=0;ty<H;ty+=40){ctx.beginPath();ctx.moveTo(0,ty);ctx.lineTo(W,ty);ctx.stroke();}

        // Outer porcelain — rounded rect
        ctx.fillStyle='#f0f0f0';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(6,6,268,268,32) : ctx.rect(6,6,268,268);
        ctx.fill();
        ctx.strokeStyle='#d8d8d8'; ctx.lineWidth=4;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(6,6,268,268,32) : ctx.rect(6,6,268,268);
        ctx.stroke();

        // Water — rounded rect, inset from porcelain
        var bwg=ctx.createRadialGradient(140,135,8,140,135,140);
        bwg.addColorStop(0,'#00d4ff');
        bwg.addColorStop(0.35,'#40c8f0');
        bwg.addColorStop(0.7,'#80d8f8');
        bwg.addColorStop(1,'#b8eeff');
        ctx.fillStyle=bwg;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(22,22,236,236,22) : ctx.rect(22,22,236,236);
        ctx.fill();

        // Inner rim shadow
        ctx.strokeStyle='rgba(0,0,0,0.10)'; ctx.lineWidth=12;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(22,22,236,236,22) : ctx.rect(22,22,236,236);
        ctx.stroke();

        // Water reflection highlight
        ctx.fillStyle='rgba(255,255,255,0.45)';
        ctx.beginPath(); ctx.ellipse(105,90,42,16,-0.2,0,Math.PI*2); ctx.fill();

        // Blue cleaning block
        var bcg=ctx.createRadialGradient(140,152,2,140,152,28);
        bcg.addColorStop(0,'#00aaff'); bcg.addColorStop(1,'#0055cc');
        ctx.fillStyle=bcg;
        ctx.beginPath(); ctx.ellipse(140,152,24,20,0,0,Math.PI*2); ctx.fill();

        // Ripples — rounded rect
        var rs=1+Math.sin(this.frame*0.03)*0.015;
        ctx.strokeStyle='rgba(255,255,255,0.18)'; ctx.lineWidth=1.5;
        var r1=58*rs;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(140-r1,140-r1,r1*2,r1*2,r1*0.4) : ctx.rect(140-r1,140-r1,r1*2,r1*2);
        ctx.stroke();
        var r2=90*rs;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(140-r2,140-r2,r2*2,r2*2,r2*0.3) : ctx.rect(140-r2,140-r2,r2*2,r2*2);
        ctx.stroke();

        // Grid clipped to water area
        ctx.save();
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(22,22,236,236,22) : ctx.rect(22,22,236,236);
        ctx.clip();
        ctx.strokeStyle='rgba(0,120,180,0.12)'; ctx.lineWidth=0.5;
        for(var r=0;r<=this.ROWS;r++){ctx.beginPath();ctx.moveTo(0,r*C);ctx.lineTo(W,r*C);ctx.stroke();}
        for(var c=0;c<=this.COLS;c++){ctx.beginPath();ctx.moveTo(c*C,0);ctx.lineTo(c*C,H);ctx.stroke();}
        ctx.restore();

        // Food — toilet paper with glow
        if (this.food) {
            var bounce = Math.sin(this.frame*0.12)*2;
            var grd = ctx.createRadialGradient(
                this.food.x*C+C/2, this.food.y*C+C/2, 1,
                this.food.x*C+C/2, this.food.y*C+C/2, C
            );
            grd.addColorStop(0,'rgba(255,255,200,0.4)');
            grd.addColorStop(1,'rgba(255,255,200,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(this.food.x*C-C/2, this.food.y*C-C/2, C*2, C*2);
            ctx.font = '16px serif'; ctx.textAlign = 'center';
            ctx.fillText('🧻', this.food.x*C+C/2, this.food.y*C+C-1+bounce);
        }

        // Snake — tail to head
        for (var i=this.snake.length-1; i>=0; i--) {
            this.drawSegment(ctx, this.snake[i], i===0, i);
        }

        // HUD bar
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,16);
        ctx.fillStyle = '#00ff41'; ctx.font='bold 10px Nunito'; ctx.textAlign='left';
        ctx.fillText('LVL '+this.level, 4, 11);
        ctx.fillStyle = '#ff6b6b'; ctx.textAlign='center';
        ctx.fillText('❤️'.repeat(this.lives), 140, 11);
        ctx.fillStyle = '#fff'; ctx.textAlign='right';
        ctx.fillText('🧻 '+this.score, W-4, 11);

        // Next level progress
        var progress = (this.foodEaten%5);
        ctx.fillStyle = 'rgba(0,255,65,0.15)';
        ctx.fillRect(0, H-4, W*(progress/5), 4);
        ctx.fillStyle = 'rgba(0,255,65,0.5)';
        ctx.fillRect(0, H-4, W*(progress/5), 2);

        // Banner
        if (this.showBanner) {
            ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0,95,W,85);
            ctx.fillStyle = '#00ff41'; ctx.font='bold 20px Nunito'; ctx.textAlign='center';
            ctx.fillText(this.bannerMsg, 140, 133);
            ctx.fillStyle = '#fff'; ctx.font='11px Nunito';
            var spd = this.level<=2?'🐢 Slow':this.level<=4?'🐍 Medium':this.level<=6?'💨 Fast':'🔥 Very Fast';
            ctx.fillText('Speed: '+spd, 140, 155);
            ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='10px Nunito';
            ctx.fillText((5-(this.foodEaten%5)||5)+' 🧻 to next level', 140, 172);
        }

        // Game over
        if (this.gameOver) {
            ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.fillRect(0,0,W,H);
            ctx.fillStyle='#ff4444'; ctx.font='bold 24px Nunito'; ctx.textAlign='center';
            ctx.fillText('GAME OVER',140,85);
            ctx.fillStyle='#fff'; ctx.font='14px Nunito';
            ctx.fillText('Score: '+this.score+' 🧻',140,115);
            ctx.fillText('Level: '+this.level,140,137);
            ctx.fillText('Length: '+this.snake.length,140,158);
            // Play again button
            ctx.fillStyle='#1a4a8a';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(70,170,140,40,10);
            else ctx.rect(70,170,140,40);
            ctx.fill();
            ctx.fillStyle='#fff'; ctx.font='bold 14px Nunito';
            ctx.fillText('▶ PLAY AGAIN',140,196);
            ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='10px Nunito';
            ctx.fillText('Tap A or START',140,224);
        }
    },

    stop: function() {
        this.gameRunning = false;
        if (this._loop) { clearInterval(this._loop); this._loop=null; window._gameLoop=null; }
        if (this._onInput) window.removeEventListener('gbinput', this._onInput);
    }
};

function startSnake(canvas, toiletId) {
    snakeGame.init(canvas, toiletId);
}