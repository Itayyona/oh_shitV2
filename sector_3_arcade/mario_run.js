// ── MARIO RUN — Oh Sh*t Edition ──

var marioGame = {
    canvas:null, ctx:null, toiletId:null,
    level:1, score:0, lives:3,
    running:false, over:false,
    _onInput:null, _onInputEnd:null, _loop:null,

    W:280, H:280,
    GY:245,
    GRAVITY:0.5,
    JUMP:-9,

    mario:null, platforms:[], enemies:[], coins:[], peach:null,
    camX:0, keys:{left:false,right:false}, frame:0, banner:null,

    init: function(canvas, toiletId) {
        this.canvas=canvas; this.ctx=canvas.getContext('2d');
        this.toiletId=toiletId;
        this.level=1; this.score=0; this.lives=3;
        this.over=false; this.running=true; this.frame=0;
        this.buildLevel(); this.bindInput(); this.startLoop();
    },

    buildLevel: function() {
        var GY=this.GY;
        this.camX=0; this.keys={left:false,right:false};

        this.mario={
            x:50, y:GY-36, w:16, h:34,
            vx:0, vy:0, onGround:false,
            facing:1, frame:0, invincible:0
        };

        // Ground
        this.platforms=[{ x:-100, y:GY, w:3000, h:40, ground:true }];

        // Platforms: [x, y, w] — hand spaced with big gaps
        var layout=[
            [180,195,80],[340,165,80],[500,190,80],[660,160,80],
            [820,188,80],[980,163,80],[1140,190,80],[1300,168,80]
        ];
        var dy=(this.level-1)*10;
        for(var i=0;i<layout.length;i++){
            var pl=layout[i];
            this.platforms.push({
                x:pl[0], y:Math.max(100,pl[1]-dy), w:pl[2], h:14, ground:false
            });
        }

        // Coins above platforms
        this.coins=[];
        for(var pi=1;pi<this.platforms.length;pi++){
            var p=this.platforms[pi];
            for(var ci=0;ci<3;ci++){
                this.coins.push({x:p.x+10+ci*24, y:p.y-20, got:false, bob:ci*1.2});
            }
        }
        // Ground coins
        var cx=140;
        for(var gi=0;gi<7;gi++){
            this.coins.push({x:cx, y:GY-20, got:false, bob:gi*0.8});
            cx+=120;
        }

        // Enemies
        this.enemies=[];
        var espd=0.8+this.level*0.1;
        var epos=[250,430,620,810,1000,1200];
        var ne=Math.min(2+this.level,epos.length);
        for(var k=0;k<ne;k++){
            this.enemies.push({
                x:epos[k], y:GY-22, w:18, h:18,
                vx:k%2===0?espd:-espd,
                dead:false, deadTimer:0, frame:0
            });
        }

        // Peach
        this.peach={x:1500, y:GY-34, w:24, h:30, rescued:false, frame:0};
        this.banner={msg:'LEVEL '+this.level, timer:90};
        updateGameHUD(this.level, this.score);
    },

    bindInput: function() {
        var self=this;
        if(self._onInput)    window.removeEventListener('gbinput',    self._onInput);
        if(self._onInputEnd) window.removeEventListener('gbinputend', self._onInputEnd);
        self._onInput=function(e){
            var d=e.detail;
            if(d==='stop'){self.stop();return;}
            if(self.over){if(d==='a'||d==='start')self.restart();return;}
            if(d==='left')  self.keys.left=true;
            if(d==='right') self.keys.right=true;
            if((d==='up'||d==='a')&&self.mario.onGround){
                self.mario.vy=self.JUMP; self.mario.onGround=false;
            }
        };
        self._onInputEnd=function(e){
            var d=e.detail;
            if(d==='left')  self.keys.left=false;
            if(d==='right') self.keys.right=false;
        };
        window.addEventListener('gbinput',    self._onInput);
        window.addEventListener('gbinputend', self._onInputEnd);
    },

    startLoop: function() {
        var self=this;
        if(self._loop) clearInterval(self._loop);
        window._gameLoop=self._loop=setInterval(function(){
            if(!self.running)return;
            self.frame++;
            self.update();
            self.draw();
        },1000/60);
    },

    update: function() {
        if(this.over)return;
        if(this.banner&&this.banner.timer>0){this.banner.timer--;return;}
        var m=this.mario;
        var spd=2.5+this.level*0.1;
        m.frame++;
        if(m.invincible>0)m.invincible--;

        if(this.keys.right)     {m.vx=spd;  m.facing=1;}
        else if(this.keys.left) {m.vx=-spd; m.facing=-1;}
        else                    {m.vx=0;}

        m.vy+=this.GRAVITY;
        if(m.vy>12)m.vy=12;
        m.x+=m.vx; m.y+=m.vy;
        if(m.x<0)m.x=0;

        m.onGround=false;
        for(var i=0;i<this.platforms.length;i++){
            var p=this.platforms[i];
            if(m.x+m.w<p.x||m.x>p.x+p.w||m.y+m.h<p.y||m.y>p.y+p.h)continue;
            var fromTop=(m.y+m.h-m.vy)<=p.y+4;
            var fromBot=(m.y-m.vy)>=p.y+p.h-4;
            if(m.vy>=0&&fromTop){m.y=p.y-m.h;m.vy=0;m.onGround=true;}
            else if(m.vy<0&&fromBot){m.y=p.y+p.h;m.vy=0;}
            else{m.x-=m.vx;}
        }

        if(m.y>this.H+20){this.loseLife();return;}
        this.camX=Math.max(0,m.x-100);

        for(var j=0;j<this.coins.length;j++){
            var c=this.coins[j]; c.bob+=0.06;
            if(c.got)continue;
            if(Math.abs(c.x-(m.x+m.w/2))<18&&Math.abs(c.y-(m.y+m.h/2))<18){
                c.got=true; this.score+=10; updateGameHUD(this.level,this.score);
            }
        }

        for(var k=0;k<this.enemies.length;k++){
            var en=this.enemies[k];
            if(en.dead){en.deadTimer++;continue;}
            en.x+=en.vx; en.frame++;
            if(en.x<0||en.x>1600)en.vx*=-1;
            if(m.invincible>0)continue;
            if(m.x+m.w>en.x&&m.x<en.x+en.w&&m.y+m.h>en.y&&m.y<en.y+en.h){
                if(m.vy>0&&m.y+m.h<en.y+en.h*0.5){
                    en.dead=true;en.deadTimer=0;m.vy=-6;
                    this.score+=20;updateGameHUD(this.level,this.score);
                } else {this.loseLife();return;}
            }
        }

        if(this.peach&&!this.peach.rescued){
            this.peach.frame++;
            if(m.x+m.w>this.peach.x&&m.x<this.peach.x+this.peach.w&&
               m.y+m.h>this.peach.y&&m.y<this.peach.y+this.peach.h){
                this.peach.rescued=true; this.score+=100;
                onLevelComplete('mario',this.level,this.score);
                updateGameHUD(this.level,this.score);
                var self=this;
                setTimeout(function(){self.nextLevel();},2500);
            }
        }
    },

    draw: function() {
        var ctx=this.ctx, cam=this.camX, W=this.W, H=this.H;
        var theme=(this.level-1)%4;

        // ── BATHROOM THEMES ──
        if(theme===0){
            // 🚽 NORMAL BATHROOM — white tiles, clean
            ctx.fillStyle='#e8f4f8'; ctx.fillRect(0,0,W,H);
            // Tile grid
            ctx.strokeStyle='rgba(180,210,230,0.6)'; ctx.lineWidth=1;
            for(var tx=0;tx<W;tx+=24){ ctx.beginPath();ctx.moveTo(tx,0);ctx.lineTo(tx,H);ctx.stroke(); }
            for(var ty=0;ty<H;ty+=24){ ctx.beginPath();ctx.moveTo(0,ty);ctx.lineTo(W,ty);ctx.stroke(); }
            // Floating toilet paper rolls drifting across
            ctx.font='16px serif'; ctx.textAlign='center';
            var rolls=[[40,40],[120,25],[200,50],[300,30],[450,45],[600,22]];
            for(var ri=0;ri<rolls.length;ri++){
                var rx=(rolls[ri][0]-cam*0.15+W*6)%(W+60)-30;
                ctx.fillText('🧻',rx,rolls[ri][1]);
            }
            // Toilet on wall
            ctx.font='28px serif';
            ctx.fillText('🚽',(180-cam*0.05+W*4)%(W+40)-20,60);
        }
        else if(theme===1){
            // 💩 SEWER — dark green, dripping pipes
            ctx.fillStyle='#1a2a1a'; ctx.fillRect(0,0,W,H);
            // Sewer brick pattern
            ctx.fillStyle='#223322';
            for(var bry=0;bry<H;bry+=20){
                var off=bry%40===0?0:16;
                for(var brx=-off;brx<W;brx+=32){
                    ctx.strokeStyle='#2a4a2a'; ctx.lineWidth=1;
                    ctx.strokeRect(brx,bry,30,18);
                }
            }
            // Pipes
            ctx.fillStyle='#334433';
            var pipes=[60,180,320];
            for(var pi2=0;pi2<pipes.length;pi2++){
                var ppx=(pipes[pi2]-cam*0.2+W*4)%(W+80)-40;
                ctx.fillRect(ppx-8,0,16,60);
                ctx.fillStyle='#445544'; ctx.fillRect(ppx-10,55,20,10);
                ctx.fillStyle='#334433';
                // Drip
                var dripY=(this.frame*2+pi2*40)%80;
                ctx.fillStyle='rgba(100,180,100,0.7)';
                ctx.beginPath(); ctx.arc(ppx,65+dripY,3,0,Math.PI*2); ctx.fill();
            }
            // Glowing eyes in background
            ctx.fillStyle='rgba(255,80,0,0.6)';
            ctx.beginPath(); ctx.arc(200,120,3,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(210,120,3,0,Math.PI*2); ctx.fill();
        }
        else if(theme===2){
            // 🏪 GAS STATION BATHROOM — grimy yellow, flickering
            var flicker=Math.sin(this.frame*0.3)>0.95?0.6:1;
            ctx.fillStyle='rgba(180,160,80,'+flicker+')'; ctx.fillRect(0,0,W,H);
            // Grime stains
            ctx.fillStyle='rgba(120,100,40,0.3)';
            ctx.fillRect(30,40,60,30); ctx.fillRect(180,80,40,20);
            ctx.fillRect(220,30,50,40); ctx.fillRect(80,100,30,25);
            // Graffiti on wall
            ctx.font='10px Nunito'; ctx.fillStyle='rgba(80,60,20,0.6)'; ctx.textAlign='left';
            ctx.fillText('WAS HERE',(120-cam*0.1+W*4)%(W+80)-40,70);
            ctx.fillText('💩 RULES',(240-cam*0.1+W*4)%(W+80)-40,110);
            // Flickering light bulb
            ctx.font='20px serif'; ctx.textAlign='center';
            ctx.fillText(flicker>0.8?'💡':'🔦',(140-cam*0.08+W*4)%(W+60)-30,40);
            // Flies
            ctx.font='10px serif';
            var flyX=(this.frame*3+100)%W;
            ctx.fillText('🪰',flyX,90);
        }
        else{
            // ✨ LUXURY TOILET — marble, gold
            ctx.fillStyle='#f0ece4'; ctx.fillRect(0,0,W,H);
            // Marble pattern
            ctx.strokeStyle='rgba(200,190,170,0.5)'; ctx.lineWidth=1.5;
            for(var mx2=0;mx2<W;mx2+=40){
                ctx.beginPath(); ctx.moveTo(mx2,0);
                ctx.bezierCurveTo(mx2+15,H/3,mx2-10,H*2/3,mx2+5,H);
                ctx.stroke();
            }
            // Gold trim
            ctx.fillStyle='rgba(220,180,60,0.4)';
            ctx.fillRect(0,0,W,6); ctx.fillRect(0,H-6,W,6);
            // Chandelier
            ctx.font='22px serif'; ctx.textAlign='center';
            ctx.fillText('✨',(140-cam*0.05+W*4)%(W+60)-30,30);
            // Fancy flowers
            ctx.font='14px serif';
            ctx.fillText('🌸',(80-cam*0.08+W*4)%(W+50)-25,55);
            ctx.fillText('🌸',(200-cam*0.08+W*4)%(W+50)-25,45);
            // Gold toilet
            ctx.font='24px serif';
            ctx.fillText('🏆',(260-cam*0.06+W*4)%(W+60)-30,65);
        }

        // Platforms
        for(var i=0;i<this.platforms.length;i++){
            var p=this.platforms[i], px=p.x-cam;
            if(px>W+50||px+p.w<-50)continue;
            if(p.ground){
                // Ground color per theme
                var gc=['#5a8a3c','#2a4a1a','#8a7a30','#c8b870'][theme];
                var gt=['#4a7a2c','#1a3a0a','#6a5a20','#b8a860'][theme];
                ctx.fillStyle=gc; ctx.fillRect(px,p.y,p.w,p.h);
                ctx.fillStyle=gt; ctx.fillRect(px,p.y,p.w,8);
            } else {
                // Platform color per theme
                var pc=['#c8a040','#3a6a3a','#8a7020','#d4c080'][theme];
                var pt=['#d4b050','#4a7a4a','#aa9030','#e4d090'][theme];
                ctx.fillStyle=pc; ctx.fillRect(px,p.y,p.w,p.h);
                ctx.fillStyle=pt; ctx.fillRect(px,p.y,p.w,5);
                ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=1;
                for(var bx=0;bx<p.w;bx+=16){
                    ctx.beginPath(); ctx.moveTo(px+bx,p.y); ctx.lineTo(px+bx,p.y+p.h); ctx.stroke();
                }
            }
        }

        // Coins
        ctx.font='14px serif'; ctx.textAlign='center';
        for(var j=0;j<this.coins.length;j++){
            var c=this.coins[j]; if(c.got)continue;
            var ccx2=c.x-cam; if(ccx2<-20||ccx2>W+20)continue;
            ctx.fillText('🧻',ccx2,c.y+Math.sin(c.bob)*3);
        }

        // Enemies
        ctx.font='18px serif';
        for(var k=0;k<this.enemies.length;k++){
            var en=this.enemies[k], ex=en.x-cam;
            if(ex<-30||ex>W+30)continue;
            if(en.dead){
                if(en.deadTimer<20){
                    ctx.save(); ctx.translate(ex+en.w/2,en.y+en.h);
                    ctx.scale(1,0.3); ctx.fillText('💩',0,0); ctx.restore();
                }
                continue;
            }
            ctx.fillText('💩',ex+en.w/2,en.y+en.h+Math.sin(en.frame*0.2)*2);
        }

        // Peach
        if(this.peach){
            var px2=this.peach.x-cam;
            if(px2>-40&&px2<W+40)
                this.drawPeach(ctx,px2+this.peach.w/2,this.peach.y+this.peach.h,this.peach.frame);
        }

        // Mario
        var m=this.mario, mx=m.x-cam;
        var blink=m.invincible>0&&Math.floor(m.invincible/5)%2===0;
        if(!blink)this.drawMario(ctx,mx+m.w/2,m.y+m.h,m.facing,m.frame,m.onGround);

        // HUD bar
        ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,16);
        ctx.fillStyle='#ffe600'; ctx.font='bold 10px Nunito'; ctx.textAlign='left';
        ctx.fillText('LVL '+this.level,4,11);
        ctx.fillStyle='#ff6b6b'; ctx.textAlign='center';
        var hearts=''; for(var h=0;h<this.lives;h++)hearts+='❤️';
        ctx.fillText(hearts,140,11);
        ctx.fillStyle='#fff'; ctx.textAlign='right';
        ctx.fillText('🧻 '+this.score,W-4,11);

        // Banner
        if(this.banner&&this.banner.timer>0){
            ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.fillRect(0,105,W,65);
            ctx.fillStyle='#ffe600'; ctx.font='bold 22px Nunito'; ctx.textAlign='center';
            ctx.fillText(this.banner.msg,140,138);
            ctx.fillStyle='#fff'; ctx.font='11px Nunito';
            ctx.fillText('Save Princess Peach! 👸',140,158);
        }

        // Peach rescued
        if(this.peach&&this.peach.rescued){
            ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,95,W,65);
            ctx.fillStyle='#ffe600'; ctx.font='bold 18px Nunito'; ctx.textAlign='center';
            ctx.fillText('PEACH SAVED! 💕',140,122);
            ctx.fillStyle='#fff'; ctx.font='12px Nunito';
            ctx.fillText('+100 🧻  Next level...',140,142);
        }

        // Game over
        if(this.over){
            ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.fillRect(0,0,W,H);
            ctx.fillStyle='#ff4444'; ctx.font='bold 26px Nunito'; ctx.textAlign='center';
            ctx.fillText('GAME OVER',140,85);
            ctx.fillStyle='#ffb8ff'; ctx.font='12px Nunito';
            ctx.fillText('Peach is still waiting... 👸',140,108);
            ctx.fillStyle='#fff'; ctx.font='14px Nunito';
            ctx.fillText('Score: '+this.score+' 🧻',140,135);
            ctx.fillText('Level: '+this.level,140,155);
            ctx.fillStyle='#1a4a8a'; ctx.beginPath();
            ctx.roundRect?ctx.roundRect(70,168,140,40,10):ctx.rect(70,168,140,40);
            ctx.fill();
            ctx.fillStyle='#fff'; ctx.font='bold 14px Nunito';
            ctx.fillText('▶ PLAY AGAIN',140,194);
            ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='10px Nunito';
            ctx.fillText('Tap A or START',140,218);
        }
    },

    drawMario: function(ctx,x,y,facing,frame,onGround){
        ctx.save(); ctx.translate(x,y);
        if(facing===-1)ctx.scale(-1,1);
        var leg=onGround?Math.sin(frame*0.35)*4:0;
        ctx.fillStyle='#2255cc';
        ctx.fillRect(-5,-10,4,8+leg); ctx.fillRect(1,-10,4,8-leg);
        ctx.fillStyle='#221100';
        ctx.fillRect(-6,-3+leg,5,3); ctx.fillRect(0,-3-leg,5,3);
        ctx.fillStyle='#cc2200'; ctx.fillRect(-6,-18,12,9);
        ctx.fillStyle='#2255cc'; ctx.fillRect(-3,-17,6,6);
        ctx.fillStyle='#ffdd00';
        ctx.fillRect(-2,-16,1,1); ctx.fillRect(1,-16,1,1);
        ctx.fillStyle='#cc2200';
        ctx.fillRect(6,-17,3,6); ctx.fillRect(-9,-17,3,6);
        ctx.fillStyle='#fff';
        ctx.fillRect(6,-12,4,3); ctx.fillRect(-10,-12,4,3);
        ctx.fillStyle='#ffcc99'; ctx.fillRect(-4,-26,8,9);
        ctx.fillStyle='#cc2200';
        ctx.fillRect(-5,-30,10,4); ctx.fillRect(-4,-34,8,5);
        ctx.fillStyle='#000'; ctx.fillRect(1,-24,2,2);
        ctx.fillStyle='#e8a870'; ctx.fillRect(-1,-22,4,2);
        ctx.fillStyle='#221100'; ctx.fillRect(-4,-20,8,2);
        ctx.restore();
    },

    drawPeach: function(ctx,x,y,frame){
        ctx.save(); ctx.translate(x,y);
        ctx.fillStyle='#ff88cc';
        ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(-12,18);
        ctx.lineTo(12,18); ctx.lineTo(9,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#ff66bb'; ctx.fillRect(-5,-8,10,9);
        ctx.fillStyle='#ffcc99'; ctx.fillRect(-4,-18,8,11);
        ctx.fillStyle='#ffdd00'; ctx.fillRect(-5,-24,10,7);
        ctx.fillStyle='#ffcc00'; ctx.fillRect(-4,-27,8,3);
        ctx.fillStyle='#4444ff';
        ctx.fillRect(-2,-14,2,2); ctx.fillRect(1,-14,2,2);
        ctx.fillStyle='#ffcc99'; ctx.save();
        ctx.translate(10,-5); ctx.rotate(Math.sin(frame*0.1)*0.4);
        ctx.fillRect(0,0,3,6); ctx.restore();
        if(Math.floor(Date.now()/900)%2===0){
            ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.fillRect(-18,-40,52,14);
            ctx.fillStyle='#333'; ctx.font='7px Nunito'; ctx.textAlign='center';
            ctx.fillText('SAVE ME! 💕',8,-30);
        }
        ctx.restore();
    },

    loseLife: function(){
        this.lives--;
        if(this.lives<=0){this.doGameOver();return;}
        this.mario.x=50; this.mario.y=this.GY-36;
        this.mario.vx=0; this.mario.vy=0;
        this.mario.onGround=false; this.mario.invincible=90;
        this.camX=0; this.keys={left:false,right:false};
        this.banner={msg:'❤️ '+this.lives+' LIVES LEFT',timer:70};
    },

    nextLevel: function(){this.level++;this.buildLevel();},

    doGameOver: function(){
        this.over=true; this.running=false;
        this.keys={left:false,right:false};
        clearInterval(this._loop); this._loop=null;
    },

    restart: function(){
        this.level=1;this.score=0;this.lives=3;
        this.over=false;this.running=true;this.frame=0;
        this.keys={left:false,right:false};
        this.buildLevel();
        if(!this._loop)this.startLoop();
    },

    stop: function(){
        this.running=false; this.keys={left:false,right:false};
        if(this._loop){clearInterval(this._loop);this._loop=null;window._gameLoop=null;}
        if(this._onInput)    window.removeEventListener('gbinput',    this._onInput);
        if(this._onInputEnd) window.removeEventListener('gbinputend', this._onInputEnd);
    }
};

function startMario(canvas,toiletId){marioGame.init(canvas,toiletId);}
