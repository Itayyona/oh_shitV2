// ── PACMAN — Complete Rewrite — Crash Proof & Solid Borders ──
var pacmanGame = {
    canvas: null, ctx: null, toiletId: null,
    level: 1, score: 0, lives: 3,
    running: false, over: false,
    _input: null, _loop: null,

    C: 20, COLS: 14, ROWS: 14,
    px: 0, py: 0,           // player pixel pos
    pgx: 1, pgy: 1,         // player grid pos
    pdx: 0, pdy: 0,         // current direction
    ndx: 1, ndy: 0,         // queued direction
    pframe: 0,

    ghosts: [],
    grid: null,
    total: 0, eaten: 0,
    scared: false, scareTimer: 0,
    frame: 0,
    banner: '', bannerT: 0,

    MAZE: [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,1,1,0,0,0,0,0,1],
        [1,0,1,1,0,0,0,0,0,0,1,1,0,1],
        [1,2,1,1,0,1,1,1,1,0,1,1,2,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,1,0,1,1,3,3,1,1,0,1,0,1],
        [1,0,1,0,1,3,3,3,3,1,0,1,0,1],
        [1,0,1,0,1,3,3,3,3,1,0,1,0,1],
        [1,0,1,0,1,1,3,3,1,1,0,1,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,2,1,1,0,1,1,1,1,0,1,1,2,1],
        [1,0,1,1,0,0,0,0,0,0,1,1,0,1],
        [1,0,0,0,0,0,1,1,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],

    GD: [
        {c:'#ff0000',gx:6,gy:5,dx:1, dy:0},
        {c:'#ffb8ff',gx:7,gy:5,dx:-1,dy:0},
        {c:'#00ffff',gx:6,gy:7,dx:0, dy:1},
        {c:'#ffb852',gx:7,gy:7,dx:0, dy:-1},
    ],

    isWall: function(gx, gy) {
        if (gx < 0 || gx >= this.COLS || gy < 0 || gy >= this.ROWS) return true;
        return this.MAZE[gy][gx] === 1;
    },

    buildGrid: function() {
        this.grid  = new Array(this.COLS * this.ROWS).fill(0);
        this.total = 0;
        this.eaten = 0;
        for (var r = 0; r < this.ROWS; r++) {
            for (var c = 0; c < this.COLS; c++) {
                var v = this.MAZE[r][c];
                if (v === 0) { this.grid[r*this.COLS+c] = 1; this.total++; }
                if (v === 2) { this.grid[r*this.COLS+c] = 2; this.total++; }
            }
        }
    },

    getGrid: function(gx, gy) {
        if (gx<0||gx>=this.COLS||gy<0||gy>=this.ROWS) return 0;
        return this.grid[gy*this.COLS+gx];
    },

    clearGrid: function(gx, gy) {
        if (gx<0||gx>=this.COLS||gy<0||gy>=this.ROWS) return 0;
        var idx = gy*this.COLS+gx;
        var v   = this.grid[idx];
        if (v > 0) { this.grid[idx] = 0; this.eaten++; }
        return v;
    },

    init: function(canvas, toiletId) {
        this.canvas   = canvas;
        this.ctx      = canvas.getContext('2d');
        this.toiletId = toiletId;
        this.level    = 1;
        this.score    = 0;
        this.lives    = 3;
        this.over     = false;
        this.running  = true;
        this.frame    = 0;
        this.setup();
        this.bindInput();
        this._setupCanvas();
        this._bindTouch();
        this.startLoop();
    },

    _setupCanvas: function() {
        var dpr = window.devicePixelRatio || 1;
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        var rect = this.canvas.getBoundingClientRect();
        var w = Math.max(1, rect.width);
        var h = Math.max(1, rect.height);
        this.canvas.width  = Math.max(1, Math.floor(w * dpr));
        this.canvas.height = Math.max(1, Math.floor(h * dpr));
        this.ctx.setTransform(dpr,0,0,dpr,0,0);
    },

    _bindTouch: function() {
        var self = this;
        this._touchHandler = function(ev) {
            ev.preventDefault();
            var t = ev.touches && ev.touches[0]; if(!t) return;
            var rect = self.canvas.getBoundingClientRect();
            var x = t.clientX - rect.left, y = t.clientY - rect.top;
            var cx = rect.width/2, cy = rect.height/2;
            var dx = x - cx, dy = y - cy;
            var detail = 'up';
            if (Math.abs(dx) > Math.abs(dy)) detail = dx < 0 ? 'left' : 'right';
            else detail = dy < 0 ? 'up' : 'down';
            window.dispatchEvent(new CustomEvent('gbinput', { detail: detail }));
        };
        this.canvas.addEventListener('touchstart', this._touchHandler, { passive:false });
    },

    setup: function() {
        var C = this.C;
        this.buildGrid();
        this.scared     = false;
        this.scareTimer = 0;
        this.banner     = 'LEVEL ' + this.level + ' — ' + Math.min(4,this.level) + ' 👻';
        this.bannerT    = 90;

        // Player starts at grid 1,1
        this.pgx = 1; this.pgy = 1;
        this.px  = 1*C; this.py = 1*C;
        this.pdx = 0; this.pdy = 0;
        this.ndx = 1; this.ndy = 0;
        this.pframe = 0;

        // Ghosts
        var spd = 0.055 + this.level * 0.008;
        var m   = [1,0.92,0.86,0.80];
        this.ghosts = [];
        for (var i = 0; i < Math.min(4,this.level); i++) {
            var d = this.GD[i];
            this.ghosts.push({
                c:d.c, gx:d.gx, gy:d.gy,
                px:d.gx*C, py:d.gy*C,
                dx:d.dx, dy:d.dy,
                spd:spd*m[i],
                hgx:d.gx, hgy:d.gy,
                hdx:d.dx, hdy:d.dy
            });
        }
    },

    bindInput: function() {
        var self = this;
        if (self._input) window.removeEventListener('gbinput', self._input);
        self._input = function(e) {
            var d = e.detail;
            if (d==='stop') { self.stop(); return; }
            if (self.over) { if (d==='a'||d==='start') self.restart(); return; }
            if (d==='up')    { self.ndx=0;  self.ndy=-1; }
            if (d==='down')  { self.ndx=0;  self.ndy=1;  }
            if (d==='left')  { self.ndx=-1; self.ndy=0;  }
            if (d==='right') { self.ndx=1;  self.ndy=0;  }
        };
        window.addEventListener('gbinput', self._input);
    },

    startLoop: function() {
        var self = this;
        if (self._loop) clearInterval(self._loop);
        window._gameLoop = self._loop = setInterval(function() {
            if (!self.running) return;
            try {
                self.frame++;
                if (self.bannerT > 0) { self.bannerT--; self.draw(); return; }
                if (!self.over) self.update();
                self.draw();
            } catch(err) { 
                console.error("Pacman Crash Detected:", err); 
                self.stop(); 
            }
        }, 1000/30);
    },

    update: function() {
        var C   = this.C;
        var spd = 0.1 + this.level * 0.005;
        this.pframe++;

        // --- NEW MOVEMENT LOGIC (Fixes the running out of bounds bug) ---
        var tpx = this.pgx * C;
        var tpy = this.pgy * C;

        // Move strictly towards the current target grid cell
        if (this.px < tpx) this.px = Math.min(tpx, this.px + spd * C);
        else if (this.px > tpx) this.px = Math.max(tpx, this.px - spd * C);

        if (this.py < tpy) this.py = Math.min(tpy, this.py + spd * C);
        else if (this.py > tpy) this.py = Math.max(tpy, this.py - spd * C);

        // Snap and decide next cell ONLY when centered perfectly
        if (this.px === tpx && this.py === tpy) {
            
            // 1. Try queued direction first
            if (!this.isWall(this.pgx + this.ndx, this.pgy + this.ndy)) {
                this.pdx = this.ndx;
                this.pdy = this.ndy;
            }

            // 2. Look ahead. If it's open, set the next target cell
            if (!this.isWall(this.pgx + this.pdx, this.pgy + this.pdy)) {
                this.pgx += this.pdx;
                this.pgy += this.pdy;
            } else {
                // Hitting a solid wall. Stop entirely.
                this.pdx = 0;
                this.pdy = 0;
            }
        }

        // Screen wrap
        if (this.pgx < 0)           { this.pgx = this.COLS-1; this.px = this.pgx*C; }
        if (this.pgx >= this.COLS)  { this.pgx = 0;           this.px = 0; }

        // --- NEW EATING LOGIC (Fixes the telepathic eating bug) ---
        // Calculate grid based on VISUAL pixels, not future grid targets
        var eatX = Math.round(this.px / C);
        var eatY = Math.round(this.py / C);
        var v = this.clearGrid(eatX, eatY);
        
        if (v === 1) {
            this.score += 10;
            if (typeof updateGameHUD === 'function') updateGameHUD(this.level, this.score);
        } else if (v === 2) {
            this.score += 50;
            this.scared     = true;
            this.scareTimer = 220;
            if (typeof updateGameHUD === 'function') updateGameHUD(this.level, this.score);
        }

        // Scare timer
        if (this.scared) { this.scareTimer--; if (this.scareTimer<=0) this.scared=false; }

        // Move ghosts
        for (var i=0; i<this.ghosts.length; i++) this.moveGhost(this.ghosts[i]);

        // Ghost collision (tightened threshold to reduce false positives)
        for (var g=0; g<this.ghosts.length; g++) {
            var gh = this.ghosts[g];
            var dx = gh.px - this.px, dy = gh.py - this.py;
            var distSq = dx*dx + dy*dy;
            var thresh = (C*0.6)*(C*0.6);
            if (distSq < thresh) {
                if (this.scared) {
                    gh.gx=gh.hgx; gh.gy=gh.hgy;
                    gh.px=gh.hgx*C; gh.py=gh.hgy*C;
                    gh.dx=gh.hdx; gh.dy=gh.hdy;
                    this.score+=100; 
                    if (typeof updateGameHUD === 'function') updateGameHUD(this.level,this.score);
                } else {
                    this.loseLife(); return;
                }
            }
        }

        // Win
        if (this.eaten >= this.total && this.total > 0) {
            this.score += 100;
            if (typeof onLevelComplete === 'function') onLevelComplete('pacman',this.level,this.score);
            if (typeof updateGameHUD === 'function') updateGameHUD(this.level,this.score);
            var self = this;
            this.running = false;
            setTimeout(function() {
                self.level++;
                self.running = true;
                self.scared  = false;
                self.setup();
            }, 1500);
        }
    },

    moveGhost: function(g) {
        var C = this.C;
        g.px += g.dx * g.spd * C;
        g.py += g.dy * g.spd * C;

        var tpx = g.gx * C, tpy = g.gy * C;
        if (Math.abs(g.px-tpx) <= g.spd*C+0.5 &&
            Math.abs(g.py-tpy) <= g.spd*C+0.5) {
            g.px = tpx; g.py = tpy;

            var dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
            var valid = [];
            for (var i=0; i<dirs.length; i++) {
                if (dirs[i].dx===-g.dx && dirs[i].dy===-g.dy) continue;
                if (!this.isWall(g.gx+dirs[i].dx, g.gy+dirs[i].dy)) valid.push(dirs[i]);
            }
            if (!valid.length) valid.push({dx:-g.dx,dy:-g.dy});

            var chosen;
            var rnd = Math.max(0.05, 0.45-this.level*0.05);
            if (Math.random()<rnd) {
                chosen = valid[Math.floor(Math.random()*valid.length)];
            } else if (this.scared) {
                var maxD=-1;
                for (var j=0; j<valid.length; j++) {
                    var d2=Math.abs(g.gx+valid[j].dx-this.pgx)+Math.abs(g.gy+valid[j].dy-this.pgy);
                    if (d2>maxD) { maxD=d2; chosen=valid[j]; }
                }
            } else {
                var minD=Infinity;
                for (var k=0; k<valid.length; k++) {
                    var d3=Math.abs(g.gx+valid[k].dx-this.pgx)+Math.abs(g.gy+valid[k].dy-this.pgy);
                    if (d3<minD) { minD=d3; chosen=valid[k]; }
                }
            }
            if (chosen) {
                g.dx=chosen.dx; g.dy=chosen.dy;
                var nx=g.gx+g.dx, ny=g.gy+g.dy;
                nx=Math.max(0,Math.min(this.COLS-1,nx));
                ny=Math.max(0,Math.min(this.ROWS-1,ny));
                g.gx=nx; g.gy=ny;
            }
        }
    },

    loseLife: function() {
        this.lives--;
        if (this.lives<=0) {
            this.over = true;
            // Save final score
            try {
                var userName = localStorage.getItem('username') || 'anonymous';
                var allScores = (typeof getGameScores === 'function') ? getGameScores() : JSON.parse(localStorage.getItem('arcade_scores')||'{}');
                if (!allScores.pacman) allScores.pacman = {};
                var prev = allScores.pacman[userName] || 0;
                if (this.score > prev) allScores.pacman[userName] = this.score;
                localStorage.setItem('arcade_scores', JSON.stringify(allScores));
            } catch(e) {}
            this.stop();
            return;
        }
        var C=this.C;
        this.pgx=1; this.pgy=1; this.px=C; this.py=C;
        this.pdx=0; this.pdy=0; this.ndx=1; this.ndy=0;
        for (var i=0; i<this.ghosts.length; i++) {
            var g=this.ghosts[i];
            g.gx=g.hgx; g.gy=g.hgy; g.px=g.hgx*C; g.py=g.hgy*C;
            g.dx=g.hdx; g.dy=g.hdy;
        }
        this.scared=false; this.scareTimer=0;
        this.banner='❤️ '+this.lives+' LIVES LEFT';
        this.bannerT=70;
    },

    restart: function() {
        this.level=1; this.score=0; this.lives=3;
        this.over=false; this.running=true; this.frame=0;
        this.setup();
        if (!this._loop) this.startLoop();
    },

    drawGhost: function(ctx, px, py, color) {
        var s=17, gx=px+1, gy=py+2;
        var col = this.scared
            ? ((this.scareTimer>60||Math.floor(Date.now()/200)%2===0)?'#2121de':'#fff')
            : color;
        ctx.save();
        ctx.fillStyle=col;
        ctx.beginPath();
        ctx.arc(gx+s/2,gy+s/2,s/2,Math.PI,0,false);
        ctx.lineTo(gx+s,gy+s);
        var bw=s/3;
        ctx.lineTo(gx+s-bw*0.3,gy+s-4); ctx.lineTo(gx+s-bw,gy+s);
        ctx.lineTo(gx+s-bw*1.5,gy+s-4); ctx.lineTo(gx+s-bw*2,gy+s);
        ctx.lineTo(gx+s-bw*2.5,gy+s-4); ctx.lineTo(gx,gy+s);
        ctx.closePath(); ctx.fill();
        if (!this.scared) {
            ctx.fillStyle='#fff';
            ctx.beginPath(); ctx.ellipse(gx+s*0.3,gy+s*0.38,3,3.5,0,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(gx+s*0.7,gy+s*0.38,3,3.5,0,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#2121de';
            ctx.beginPath(); ctx.ellipse(gx+s*0.33,gy+s*0.4,1.8,2,0,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(gx+s*0.73,gy+s*0.4,1.8,2,0,0,Math.PI*2); ctx.fill();
        } else {
            ctx.fillStyle='#fff';
            ctx.beginPath(); ctx.arc(gx+s*0.3,gy+s*0.45,1.5,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(gx+s*0.7,gy+s*0.45,1.5,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle='#fff'; ctx.lineWidth=1.5;
            ctx.beginPath();
            ctx.moveTo(gx+3,gy+s*0.72); ctx.lineTo(gx+6,gy+s*0.65);
            ctx.lineTo(gx+9,gy+s*0.72); ctx.lineTo(gx+12,gy+s*0.65);
            ctx.lineTo(gx+15,gy+s*0.72); ctx.stroke();
        }
        ctx.restore();
    },

    drawPlayer: function(ctx, px, py, dx, dy, frame) {
        var C=this.C, cx=px+C/2, cy=py+C/2, r=C/2-2;
        var mouth=Math.abs(Math.sin(frame*0.3))*0.35;
        ctx.save(); ctx.translate(cx,cy);
        if (dx===-1) ctx.rotate(Math.PI);
        if (dy===1)  ctx.rotate(Math.PI/2);
        if (dy===-1) ctx.rotate(-Math.PI/2);
        ctx.fillStyle='#e8e8e8';
        ctx.beginPath(); ctx.moveTo(0,0);
        ctx.arc(0,0,r,mouth*Math.PI,(2-mouth)*Math.PI);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle='#bbb'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(0,0,r,mouth*Math.PI,(2-mouth)*Math.PI); ctx.stroke();
        ctx.fillStyle='#4a90d9';
        ctx.beginPath(); ctx.arc(0,0,r*0.42,0,Math.PI*2); ctx.fill();
        ctx.restore();
    },

    draw: function() {
        var ctx=this.ctx, C=this.C, W=280, H=280;
        ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);

        for (var r=0; r<this.ROWS; r++) {
            for (var c=0; c<this.COLS; c++) {
                if (this.MAZE[r][c]===1) {
                    ctx.fillStyle='#1a1aff';
                    ctx.fillRect(c*C+1,r*C+1,C-2,C-2);
                    ctx.strokeStyle='#6666ff';
                    ctx.lineWidth=1.5;
                    ctx.strokeRect(c*C+1,r*C+1,C-2,C-2);
                }
            }
        }

        ctx.strokeStyle='#8888ff';
        ctx.lineWidth=2;
        ctx.strokeRect(1,1,W-2,H-2);

        var pulse=11+Math.abs(Math.sin(Date.now()/200))*3;
        for (var dr=0; dr<this.ROWS; dr++) {
            for (var dc=0; dc<this.COLS; dc++) {
                var val=this.getGrid(dc,dr);
                if (val===1) {
                    ctx.font='10px serif'; ctx.textAlign='center';
                    ctx.fillText('💩',dc*C+C/2,dr*C+C-3);
                } else if (val===2) {
                    ctx.font=pulse+'px serif'; ctx.textAlign='center';
                    ctx.fillText('🧻',dc*C+C/2,dr*C+C-1);
                }
            }
        }

        for (var g=0; g<this.ghosts.length; g++) {
            this.drawGhost(ctx,this.ghosts[g].px,this.ghosts[g].py,this.ghosts[g].c);
        }

        this.drawPlayer(ctx,this.px,this.py,this.pdx,this.pdy,this.pframe);

        ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font='8px Nunito'; ctx.textAlign='center';
        ctx.fillText((this.total-this.eaten)+' left',140,275);

        if (this.bannerT>0) {
            ctx.fillStyle='rgba(0,0,0,0.82)'; ctx.fillRect(0,100,W,80);
            ctx.fillStyle='#ffe600'; ctx.font='bold 17px Nunito'; ctx.textAlign='center';
            ctx.fillText(this.banner,140,138);
            ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='10px Nunito';
            ctx.fillText('Get ready!',140,158);
        }

        if (this.over) {
            ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.fillRect(0,0,W,H);
            ctx.fillStyle='#ff4444'; ctx.font='bold 24px Nunito'; ctx.textAlign='center';
            ctx.fillText('GAME OVER',140,85);
            ctx.fillStyle='#fff'; ctx.font='14px Nunito';
            ctx.fillText('Score: '+this.score+' 🧻',140,115);
            ctx.fillText('Level: '+this.level,140,138);
            ctx.fillStyle='#1a4a8a'; ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(70,152,140,40,10);
            else ctx.rect(70,152,140,40);
            ctx.fill();
            ctx.fillStyle='#fff'; ctx.font='bold 14px Nunito';
            ctx.fillText('▶ PLAY AGAIN',140,178);
            ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='10px Nunito';
            ctx.fillText('Tap A or START',140,205);
        }
    },

    stop: function() {
        this.running=false;
        if (this._loop) { clearInterval(this._loop); this._loop=null; window._gameLoop=null; }
        if (this._input) window.removeEventListener('gbinput',this._input);
        if (this._touchHandler && this.canvas) {
            this.canvas.removeEventListener('touchstart', this._touchHandler);
            this._touchHandler = null;
        }
    }
};

function startPacman(canvas,toiletId) { pacmanGame.init(canvas,toiletId); }