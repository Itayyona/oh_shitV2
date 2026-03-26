// ── TETRIS — Oh Sh*t Edition ──

var tetrisGame = {
    canvas:null, ctx:null, toiletId:null,
    level:1, score:0, lines:0,
    gameRunning:false, over:false, frame:0,
    CELL:18, COLS:10, ROWS:14,
    board:[], current:null, next:null,
    dropTimer:0, dropInterval:40,
    flashRows:[], flashTimer:0,
    _onInput:null, _loop:null,

    // 💩 bathroom-themed piece colors
    PIECES:[
        { shape:[[1,1,1,1]],           color:'#00d4ff' }, // I — toilet water blue
        { shape:[[1,1],[1,1]],         color:'#f0e040' }, // O — yellow
        { shape:[[0,1,0],[1,1,1]],     color:'#a855f7' }, // T — purple
        { shape:[[0,1,1],[1,1,0]],     color:'#4ade80' }, // S — green (mold)
        { shape:[[1,1,0],[0,1,1]],     color:'#f87171' }, // Z — red
        { shape:[[1,0,0],[1,1,1]],     color:'#60a5fa' }, // J — blue
        { shape:[[0,0,1],[1,1,1]],     color:'#fb923c' }, // L — orange (rust)
    ],

    rng: null,
    seed: function(n) {
        var s = n;
        return { next: function() { s=(s*16807+0)%2147483647; return s/2147483647; } };
    },

    init: function(canvas, toiletId) {
        this.canvas=canvas; this.ctx=canvas.getContext('2d');
        this.toiletId=toiletId;
        this.level=1; this.score=0; this.lines=0;
        this.gameRunning=true; this.over=false; this.frame=0;
        this.flashRows=[]; this.flashTimer=0;
        this.rng=this.seed(Date.now()%99999);
        this.setupBoard();
        this.next=this.randomPiece();
        this.current=this.spawnPiece();
        this.bindInput();
        this.startLoop();
    },

    setupBoard: function() {
        this.board=Array.from({length:this.ROWS},function(){return Array(10).fill(null);});
    },

    randomPiece: function() {
        var p=this.PIECES[Math.floor(this.rng.next()*this.PIECES.length)];
        return { shape:p.shape.map(function(r){return r.slice();}), color:p.color, x:0, y:0 };
    },

    spawnPiece: function() {
        var p=this.next;
        p.x=Math.floor(this.COLS/2)-Math.floor(p.shape[0].length/2);
        p.y=0;
        this.next=this.randomPiece();
        if(this.collides(p,0,0)){ this.doGameOver(); return null; }
        this.dropTimer=0;
        return p;
    },

    bindInput: function() {
        var self=this;
        if(self._onInput) window.removeEventListener('gbinput',self._onInput);
        self._onInput=function(e){
            var d=e.detail;
            if(d==='stop'){self.stop();return;}
            if(self.over){if(d==='a'||d==='start')self.restart();return;}
            if(!self.gameRunning||!self.current)return;
            if(d==='left')  self.move(-1,0);
            if(d==='right') self.move(1,0);
            if(d==='down')  self.move(0,1);
            if(d==='up'||d==='a') self.rotate();
            if(d==='b'||d==='start') self.hardDrop();
        };
        window.addEventListener('gbinput',self._onInput);
    },

    startLoop: function() {
        var self=this;
        if(self._loop) clearInterval(self._loop);
        window._gameLoop=self._loop=setInterval(function(){self.tick();},1000/60);
    },

    tick: function() {
        if(!this.gameRunning&&!this.over){this.draw();return;}
        this.frame++;

        // Flash animation
        if(this.flashTimer>0){
            this.flashTimer--;
            this.draw(); return;
        }
        // Clear flashed rows
        if(this.flashRows.length>0){
            this.clearLines();
            this.flashRows=[];
        }

        if(!this.current){this.current=this.spawnPiece();if(!this.current)return;}
        this.dropTimer++;
        if(this.dropTimer>=this.dropInterval){
            this.dropTimer=0;
            if(!this.move(0,1)) this.lock();
        }
        this.draw();
    },

    move: function(dx,dy) {
        if(!this.collides(this.current,dx,dy)){
            this.current.x+=dx; this.current.y+=dy;
            return true;
        }
        return false;
    },

    rotate: function() {
        var old=this.current.shape;
        var rows=old.length, cols=old[0].length;
        var rotated=[];
        for(var c=0;c<cols;c++){
            rotated[c]=[];
            for(var r=rows-1;r>=0;r--){
                rotated[c][rows-1-r]=old[r][c];
            }
        }
        var prev=this.current.shape;
        this.current.shape=rotated;
        // Wall kick
        if(this.collides(this.current,0,0)){
            if(!this.collides(this.current,1,0))       this.current.x+=1;
            else if(!this.collides(this.current,-1,0)) this.current.x-=1;
            else this.current.shape=prev;
        }
    },

    hardDrop: function() {
        var dropped=0;
        while(this.move(0,1)){dropped++;}
        this.score+=dropped*2;
        this.lock();
    },

    collides: function(p,dx,dy) {
        for(var r=0;r<p.shape.length;r++){
            for(var c=0;c<p.shape[r].length;c++){
                if(!p.shape[r][c])continue;
                var br=p.y+dy+r, bc=p.x+dx+c;
                if(bc<0||bc>=this.COLS||br>=this.ROWS) return true;
                if(br>=0&&this.board[br][bc]) return true;
            }
        }
        return false;
    },

    getGhostY: function() {
        var gy=this.current.y;
        while(!this.collides({shape:this.current.shape,x:this.current.x,y:gy+1},0,0)) gy++;
        return gy;
    },

    lock: function() {
        for(var r=0;r<this.current.shape.length;r++){
            for(var c=0;c<this.current.shape[r].length;c++){
                if(this.current.shape[r][c]){
                    var br=this.current.y+r;
                    if(br>=0) this.board[br][this.current.x+c]=this.current.color;
                }
            }
        }
        // Find full rows
        var full=[];
        for(var row=this.ROWS-1;row>=0;row--){
            if(this.board[row].every(function(c){return c!==null;})) full.push(row);
        }
        if(full.length>0){
            this.flashRows=full;
            this.flashTimer=18; // flash for 18 frames
        } else {
            this.current=this.spawnPiece();
        }
        this.dropTimer=0;
    },

    clearLines: function() {
        var count=this.flashRows.length;
        // Remove full rows
        for(var i=0;i<this.flashRows.length;i++){
            this.board.splice(this.flashRows[i],1);
            this.board.unshift(Array(this.COLS).fill(null));
        }
        this.lines+=count;
        var pts=[0,100,300,500,800];
        this.score+=pts[Math.min(count,4)]*this.level;
        this.level=Math.floor(this.lines/10)+1;
        this.dropInterval=Math.max(5,40-(this.level*3));
        if(typeof updateGameHUD==='function') updateGameHUD(this.level,this.score);
        if(typeof onLevelComplete==='function'&&this.lines%10===0) onLevelComplete('tetris',this.level,this.score);
        this.current=this.spawnPiece();
    },

    doGameOver: function() {
        this.over=true; this.gameRunning=false;
    },

    restart: function() {
        this.level=1; this.score=0; this.lines=0;
        this.over=false; this.gameRunning=true; this.frame=0;
        this.flashRows=[]; this.flashTimer=0;
        this.rng=this.seed(Date.now()%99999);
        this.setupBoard();
        this.next=this.randomPiece();
        this.current=this.spawnPiece();
        if(!this._loop) this.startLoop();
    },

    draw: function() {
        var ctx=this.ctx, W=280, H=280;
        var CELL=this.CELL;
        var boardW=this.COLS*CELL; // 180
        var boardX=4; // left side
        var previewX=boardX+boardW+8; // right side preview panel

        // Background
        ctx.fillStyle='#0d0d1a'; ctx.fillRect(0,0,W,H);

        // Board background
        ctx.fillStyle='#1a1a2e'; ctx.fillRect(boardX,0,boardW,H);

        // Grid lines
        ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=0.5;
        for(var r=0;r<this.ROWS;r++){
            ctx.beginPath(); ctx.moveTo(boardX,r*CELL); ctx.lineTo(boardX+boardW,r*CELL); ctx.stroke();
        }
        for(var c=0;c<=this.COLS;c++){
            ctx.beginPath(); ctx.moveTo(boardX+c*CELL,0); ctx.lineTo(boardX+c*CELL,H); ctx.stroke();
        }

        // Draw board cells
        for(var row=0;row<this.ROWS;row++){
            // Flash effect on clearing rows
            var isFlash=this.flashRows.indexOf(row)!==-1;
            for(var col=0;col<this.COLS;col++){
                if(this.board[row][col]){
                    if(isFlash){
                        var fi=Math.floor(this.flashTimer/3)%2===0;
                        ctx.fillStyle=fi?'#ffffff':this.board[row][col];
                    } else {
                        ctx.fillStyle=this.board[row][col];
                    }
                    ctx.fillRect(boardX+col*CELL+1,row*CELL+1,CELL-2,CELL-2);
                    // Shine
                    ctx.fillStyle='rgba(255,255,255,0.2)';
                    ctx.fillRect(boardX+col*CELL+1,row*CELL+1,CELL-2,3);
                }
            }
        }

        // Ghost piece
        if(this.current&&!this.over){
            var gy=this.getGhostY();
            for(var r=0;r<this.current.shape.length;r++){
                for(var c=0;c<this.current.shape[r].length;c++){
                    if(this.current.shape[r][c]){
                        ctx.fillStyle='rgba(255,255,255,0.12)';
                        ctx.fillRect(boardX+(this.current.x+c)*CELL+1,(gy+r)*CELL+1,CELL-2,CELL-2);
                        ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1;
                        ctx.strokeRect(boardX+(this.current.x+c)*CELL+1,(gy+r)*CELL+1,CELL-2,CELL-2);
                    }
                }
            }
            // Current piece
            for(var r=0;r<this.current.shape.length;r++){
                for(var c=0;c<this.current.shape[r].length;c++){
                    if(this.current.shape[r][c]){
                        ctx.fillStyle=this.current.color;
                        ctx.fillRect(boardX+(this.current.x+c)*CELL+1,(this.current.y+r)*CELL+1,CELL-2,CELL-2);
                        ctx.fillStyle='rgba(255,255,255,0.25)';
                        ctx.fillRect(boardX+(this.current.x+c)*CELL+1,(this.current.y+r)*CELL+1,CELL-2,3);
                    }
                }
            }
        }

        // Board border
        ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1;
        ctx.strokeRect(boardX,0,boardW,H);

        // Baseline — glowing line at bottom
        ctx.strokeStyle='rgba(255,100,100,0.8)'; ctx.lineWidth=2;
        ctx.shadowColor='#ff4444'; ctx.shadowBlur=6;
        ctx.beginPath();
        ctx.moveTo(boardX, this.ROWS*CELL);
        ctx.lineTo(boardX+boardW, this.ROWS*CELL);
        ctx.stroke();
        ctx.shadowBlur=0;

        // ── RIGHT PANEL ──
        // Next piece label
        ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='bold 8px Nunito'; ctx.textAlign='center';
        ctx.fillText('NEXT',previewX+44,14);

        // Next piece preview box
        ctx.fillStyle='#1a1a2e';
        ctx.fillRect(previewX,18,88,60);
        ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1;
        ctx.strokeRect(previewX,18,88,60);

        if(this.next){
            var ns=this.next.shape;
            var nw=ns[0].length, nh=ns.length;
            var nc=14, npx=previewX+(88-nw*nc)/2, npy=18+(60-nh*nc)/2;
            for(var r=0;r<nh;r++){
                for(var c=0;c<nw;c++){
                    if(ns[r][c]){
                        ctx.fillStyle=this.next.color;
                        ctx.fillRect(npx+c*nc+1,npy+r*nc+1,nc-2,nc-2);
                        ctx.fillStyle='rgba(255,255,255,0.25)';
                        ctx.fillRect(npx+c*nc+1,npy+r*nc+1,nc-2,3);
                    }
                }
            }
        }

        // Stats
        var sy=90;
        ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='bold 7px Nunito'; ctx.textAlign='center';
        ctx.fillText('SCORE',previewX+44,sy);
        ctx.fillStyle='#ffe600'; ctx.font='bold 11px Nunito';
        ctx.fillText(this.score,previewX+44,sy+13);

        ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='bold 7px Nunito';
        ctx.fillText('LINES',previewX+44,sy+30);
        ctx.fillStyle='#00d4ff'; ctx.font='bold 11px Nunito';
        ctx.fillText(this.lines,previewX+44,sy+43);

        ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='bold 7px Nunito';
        ctx.fillText('LEVEL',previewX+44,sy+60);
        ctx.fillStyle='#4ade80'; ctx.font='bold 11px Nunito';
        ctx.fillText(this.level,previewX+44,sy+73);

        // Controls hint
        ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font='6px Nunito'; ctx.textAlign='center';
        ctx.fillText('A=rotate',previewX+44,H-36);
        ctx.fillText('B=drop',previewX+44,H-26);
        ctx.fillText('🧻 '+this.score,previewX+44,H-14);

        // HUD bar at top
        ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,W,15);
        ctx.fillStyle='#ffe600'; ctx.font='bold 9px Nunito'; ctx.textAlign='left';
        ctx.fillText('LVL '+this.level,4,10);
        ctx.fillStyle='#fff'; ctx.textAlign='right';
        ctx.fillText('🧻 '+this.score,W-4,10);

        // Game over overlay
        if(this.over){
            ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.fillRect(0,0,W,H);
            ctx.fillStyle='#ff4444'; ctx.font='bold 26px Nunito'; ctx.textAlign='center';
            ctx.fillText('GAME OVER',W/2,75);
            ctx.fillStyle='#fff'; ctx.font='13px Nunito';
            ctx.fillText('Score: '+this.score+' 🧻',W/2,105);
            ctx.fillText('Lines: '+this.lines,W/2,125);
            ctx.fillText('Level: '+this.level,W/2,145);
            ctx.fillStyle='#1a4a8a'; ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(70,160,140,40,10) : ctx.rect(70,160,140,40);
            ctx.fill();
            ctx.fillStyle='#fff'; ctx.font='bold 14px Nunito';
            ctx.fillText('▶ PLAY AGAIN',W/2,186);
            ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='10px Nunito';
            ctx.fillText('Tap A or START',W/2,214);
        }
    },

    stop: function() {
        this.gameRunning=false;
        if(this._loop){clearInterval(this._loop);this._loop=null;window._gameLoop=null;}
        if(this._onInput) window.removeEventListener('gbinput',this._onInput);
    }
};

function startTetris(canvas, id) { tetrisGame.init(canvas, id); }
