"use strict";
/* ============================================================
   GRISHNAK — FIREBALL MAZE (Pac-Man style arcade room)
   Loaded by newgame2.html after the main engine + caverns layer.
   Your own character runs the grid; the ghosts are pulsing
   D&D fireballs, each with a distinct hunting personality.
   ============================================================ */
(function(){

const PSPD=2.6, GSPD0=1.55;
const FRUIT_THRESHOLDS=[0.35,0.7];          // fraction of the board's dots eaten before each banana appears
const FRUIT_LIFE=600;                       // ~10s visible before it vanishes uneaten
const FRUIT_SCORE=200, FRUIT_GOLD=15;

//MAZEMAP-START
const MAZE_ROWS=[
"####################",
"#o................o#",
"#.#####..###...#####",
"#..................#",
"#..##...#....###...#",
"#........#....#....#",
"....................",
"#....#....#.....##.#",
"#...#..##...#####..#",
"#..................#",
"#o.###..###..#####o#",
"####################"
];
//MAZEMAP-END

/* LEVEL 2 — "THE VAULT". Deliberately a different kind of maze than level 1:
   open sprawl becomes tight concentric rings around a sealed middle; the
   corridor tunnel moves to the top row; the four fireballs start in the four
   corners instead of huddled in the middle, so the danger arrives from the
   edges inward; and there are only two power pellets, both deep inside. */
//MAZEMAP2-START
const MAZE_ROWS_L2=[
"####################",
"....................",
"#.##.##.####.##.##.#",
"#..................#",
"#.##.#.#o..o#.#.##.#",
"#....#.#....#.#....#",
"#.##.#.#.##.#.#.##.#",
"#....#........#....#",
"#.##.####..####.##.#",
"#..................#",
"#o.##.##.##.##.##.o#",
"####################"
];
//MAZEMAP2-END

const LEVELS=[
  { rows:MAZE_ROWS_L2, tunnel:6, exit:{r:6,c:9}, spawn:{r:9,c:1},
    fruits:[{r:4,c:9},{r:8,c:9}],
    homes:[{r:5,c:6},{r:5,c:13},{r:7,c:6},{r:7,c:13}] },        // placeholder; replaced in enter()
  { rows:MAZE_ROWS_L2, tunnel:1, exit:{r:5,c:10}, spawn:{r:9,c:9},
    fruits:[{r:3,c:2},{r:3,c:17}],
    homes:[{r:1,c:1},{r:1,c:18},{r:9,c:1},{r:9,c:18}] }
];
let tunnelRow=6, EXIT_TILE={r:6,c:9}, SPAWN={r:9,c:1}, FRUIT_TILES=[{r:4,c:9},{r:8,c:9}];

const GHOST_DEF=[
  {id:'ember',  personality:'chaser',   color:'#ff5a3c', home:{r:5,c:6}},
  {id:'cinder', personality:'ambusher', color:'#ff8a3c', home:{r:5,c:13}},
  {id:'brimst', personality:'flanker',  color:'#e0475a', home:{r:7,c:6}},
  {id:'wisp',   personality:'wanderer', color:'#ffb23c', home:{r:7,c:13}}
];

let mgrid=[], dots=new Set(), pellets=new Set();
let ghosts=[];
let PR=SPAWN.r, PC=SPAWN.c, PT=0, PDIR={x:0,y:0}, bufferedDir=null;
let trail=[];
let savedPos=null, lives=10, score=0, level=1, frightT=0, introT=0, doneT=0, over=false, exitLatch=false;
let frightChain=0;      // ghosts eaten on THIS pellet: 200, 400, 800, 1600
let dyingT=0;           // frames held on the death beat before the board resets
let totalDots=0, dotsEaten=0, fruitStage=0, fruit=null;
let jumpZ=0, jumpV=0, jumping=false, jumpLatch=false;   // Pac-Mania hop: SPACE arcs you over the fireballs

function gkey(r,c){ return r+','+c; }
function openAt(r,c){
  if(r===tunnelRow && (c<0||c>=COLS)) return true;
  if(r<0||r>=ROWS||c<0||c>=COLS) return false;
  return mgrid[r][c]!=='#';
}
function resetDots(){
  dots.clear(); pellets.clear();
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const ch=mgrid[r][c];
    if(ch==='.') dots.add(gkey(r,c));
    else if(ch==='o') pellets.add(gkey(r,c));
  }
  totalDots=dots.size+pellets.size; dotsEaten=0; fruitStage=0; fruit=null;
}
const RESPAWN_WAIT=300; // 5s @60fps before a returned/reset ghost rejoins the hunt
function curGhostSpd(){ return GSPD0 + Math.min(0.28,(level-1)*0.06); }
function resetGhost(g){ g.r=g.home.r; g.c=g.home.c; g.t=0; g.dir={x:0,y:0}; g.frightened=false; g.eaten=false; g.respawnT=RESPAWN_WAIT; }

/* ---------------- GHOST AI (greedy best-first, like the original arcade) ---------------- */
function ghostTargetTile(g){
  if(g.eaten) return g.home;
  switch(g.def.personality){
    case 'ambusher': {
      let tr=PR+PDIR.y*4, tc=PC+PDIR.x*4;
      tr=Math.max(1,Math.min(ROWS-2,tr)); tc=Math.max(1,Math.min(COLS-2,tc));
      return {r:tr,c:tc};
    }
    case 'flanker': {
      const corners=[{r:1,c:1},{r:1,c:18},{r:10,c:1},{r:10,c:18}];
      let best=corners[0], bd=-1;
      for(const cn of corners){ const d=(cn.r-PR)**2+(cn.c-PC)**2; if(d>bd){ bd=d; best=cn; } }
      return best;
    }
    case 'wanderer':
      if(!g.wanderT || frame%140===0) g.wanderT = Math.random()<0.35
        ? {r:PR,c:PC}
        : {r:1+Math.floor(Math.random()*(ROWS-2)), c:1+Math.floor(Math.random()*(COLS-2))};
      return g.wanderT;
    default: return {r:PR,c:PC};   // chaser
  }
}
function chooseGhostDir(g){
  const dirs=[{x:0,y:-1},{x:0,y:1},{x:-1,y:0},{x:1,y:0}];
  let cands=dirs.filter(d=> openAt(g.r+d.y,g.c+d.x) && !((g.dir.x||g.dir.y) && g.dir.x===-d.x && g.dir.y===-d.y));
  if(!cands.length) cands=dirs.filter(d=>openAt(g.r+d.y,g.c+d.x));
  if(!cands.length) return {x:0,y:0};
  if(g.frightened && !g.eaten){
    let best=cands[0], bd=-1;
    for(const d of cands){ const nr=g.r+d.y,nc=g.c+d.x; const dist=(nr-PR)**2+(nc-PC)**2; if(dist>bd){ bd=dist; best=d; } }
    return best;
  }
  const t=ghostTargetTile(g);
  let best=cands[0], bd=Infinity;
  for(const d of cands){ const nr=g.r+d.y,nc=g.c+d.x; const dist=(nr-t.r)**2+(nc-t.c)**2; if(dist<bd){ bd=dist; best=d; } }
  return best;
}
function stepGhost(g){
  if(g.respawnT>0){ g.respawnT--; return; }
  if(!g.dir.x && !g.dir.y){ g.dir=chooseGhostDir(g); if(!g.dir.x && !g.dir.y) return; }
  const spd = g.eaten? GSPD0*2.1 : g.frightened? GSPD0*0.55 : curGhostSpd();
  g.t += spd/T;
  if(g.t>=1){
    let nr=g.r+g.dir.y, nc=g.c+g.dir.x;
    if(g.dir.y===0 && g.r===tunnelRow){ if(nc<0) nc=COLS-1; else if(nc>=COLS) nc=0; }
    g.r=nr; g.c=nc; g.t=0;
    if(g.eaten && g.r===g.home.r && g.c===g.home.c){ g.eaten=false; g.frightened=false; g.respawnT=RESPAWN_WAIT; }
    g.dir=chooseGhostDir(g);
  }
}

/* ---------------- SCORING ---------------- */
function triggerFright(){
  frightT=480;
  frightChain=0;           // every pellet starts the ladder over at 200
  ghosts.forEach(g=>{
    if(g.eaten) return;
    g.frightened=true;
    const rev={x:-g.dir.x,y:-g.dir.y};
    g.dir = openAt(g.r+rev.y,g.c+rev.x) ? rev : chooseGhostDir(g);
  });
}
function maybeSpawnFruit(){
  if(fruit || fruitStage>=FRUIT_THRESHOLDS.length) return;
  if(dotsEaten >= Math.floor(totalDots*FRUIT_THRESHOLDS[fruitStage])){
    const spot=FRUIT_TILES[fruitStage%FRUIT_TILES.length];
    fruit={r:spot.r, c:spot.c, t:FRUIT_LIFE};
    fruitStage++;
  }
}
function eatAt(r,c){
  const k=gkey(r,c);
  if(dots.has(k)){ dots.delete(k); score+=10; dotsEaten++; maybeSpawnFruit(); }
  else if(pellets.has(k)){ pellets.delete(k); score+=50; dotsEaten++; maybeSpawnFruit(); triggerFright(); sfx.pick(); }
  if(fruit && fruit.r===r && fruit.c===c){
    score+=FRUIT_SCORE; res.gold=Math.min(999,res.gold+FRUIT_GOLD);
    addFloat(c*T+16, r*T+16, '+'+FRUIT_SCORE+' banana!', '#ffe066');
    puff(c*T+16, r*T+16, '#ffe066', 10); sfx.coin();
    fruit=null;
  }
  if(!dots.size && !pellets.size) clearBoard();
}
/* which of the three locked doors still needs a key */
function owedKeyColor(){
  for(const c of ['gold','rose','sky']) if(!flags['kt_'+c] && !flags['door_'+c]) return c;
  return null;
}
const KEYNAME={gold:'GOLD', rose:'ROSE', sky:'SKY-BLUE'};

function loadLevel(n){
  const cfg=LEVELS[Math.min(n,LEVELS.length)-1];
  mgrid = cfg.rows.map(r=>r.split(''));
  tunnelRow=cfg.tunnel; EXIT_TILE=cfg.exit; SPAWN=cfg.spawn; FRUIT_TILES=cfg.fruits;
  resetDots();
  ghosts.forEach((g,i)=>{ g.home=cfg.homes[i%cfg.homes.length]; resetGhost(g); });
  PR=SPAWN.r; PC=SPAWN.c; PT=0; PDIR={x:0,y:0}; bufferedDir=null; trail=[];
  PL.x=PC*T+16; PL.y=PR*T+16;
  jumpZ=0; jumpV=0; jumping=false; jumpLatch=true; exitLatch=true;
}

function clearBoard(){
  sfx.task();
  res.gold=Math.min(999,res.gold+20);
  if(level===1){
    level=2;
    const kc=owedKeyColor();
    flashCard('LEVEL 1 COMPLETE!', kc
      ? 'One more maze and the '+KEYNAME[kc]+' KEY is yours — one of the three locked doors opens.'
      : 'One more maze and the vault below pays out in gold.', '#ffd76e');
    loadLevel(2);
    introT=140;
    /* the still thirty seconds between the two mazes is OFF for now
       (Scott, 2026-08-21). The Interlude module stays loaded; to bring it
       back, drop this same call back in:
       if(window.Interlude){ paused=true; Interlude.float({seconds:30,
         title:'Level one, done.', sub:'One more maze to go. Thirty seconds first — hands off the keyboard, shoulders down, look at something far away.'
       }).then(()=>{ paused=false; introT=140; }); } */
  } else {
    const kc=owedKeyColor();
    if(kc){
      flags['kt_'+kc]=true; keysHeld.push(kc);
      res.gold=Math.min(999,res.gold+60);
      flashCard('THE '+KEYNAME[kc]+' KEY IS YOURS', 'Both mazes cleared. +80 gold. Go open the door you have been walking past.', '#ffe9a0');
      addFloat(PL.x, PL.y-16, KEYNAME[kc]+' KEY!', '#ffe066');
    } else {
      res.gold=Math.min(999,res.gold+60);
      flashCard('BOTH MAZES CLEARED', '+80 gold. Every door you had is already open.', '#ffe9a0');
    }
    flags.mazeMaster=true;
    if(typeof saveGame==='function') saveGame();
    level=3; over=true; doneT=200;
  }
}

/* 2-second card flash — used at level milestones */
let flashT=0, flashTitle='', flashSub='', flashCol='#ffd76e';
function flashCard(title, sub, col){ flashT=120; flashTitle=title; flashSub=sub||''; flashCol=col||'#ffd76e'; }
function drawFlash(){
  if(flashT<=0) return;
  const a=Math.min(1, flashT/18);
  ctx.globalAlpha=a*0.72; ctx.fillStyle='#05060c'; ctx.fillRect(0,HUD,RW,RH); ctx.globalAlpha=a;
  const bw=Math.min(RW-60,440), bh=104, bx=(RW-bw)/2, by=HUD+RH/2-bh/2;
  const bg=ctx.createLinearGradient(0,by,0,by+bh);
  bg.addColorStop(0,'#2c2470'); bg.addColorStop(1,'#12102e');
  ctx.fillStyle=bg; rr(ctx,bx,by,bw,bh,10); ctx.fill();
  ctx.strokeStyle=flashCol; ctx.lineWidth=2.5; rr(ctx,bx+1.5,by+1.5,bw-3,bh-3,9); ctx.stroke();
  ctx.textAlign='center';
  ctx.font='bold 20px '+FONT; ctx.fillStyle=flashCol; ctx.fillText(flashTitle, RW/2, by+40);
  ctx.font='12px '+FONT; ctx.fillStyle='#e6e0d0';
  const words=flashSub.split(' '); let line='', ly=by+66;
  for(const w of words){
    if(ctx.measureText(line+w+' ').width > bw-40){ ctx.fillText(line, RW/2, ly); line=w+' '; ly+=17; }
    else line+=w+' ';
  }
  if(line.trim()) ctx.fillText(line, RW/2, ly);
  ctx.globalAlpha=1;
}

/* ---------------- PLAYER (grid-locked, same input as everywhere else) ---------------- */
function stepPlayer(){
  const dh=dirHeld();
  const want = (dh.x||dh.y) ? (Math.abs(dh.x)>=Math.abs(dh.y) ? {x:Math.sign(dh.x),y:0} : {x:0,y:Math.sign(dh.y)}) : null;
  if(want) bufferedDir=want;   // remember the latest press even a beat before a turn opens up
  if(PT===0){
    if(bufferedDir && openAt(PR+bufferedDir.y,PC+bufferedDir.x)){ PDIR=bufferedDir; bufferedDir=null; }
    else if((PDIR.x||PDIR.y) && !openAt(PR+PDIR.y,PC+PDIR.x)) PDIR={x:0,y:0};
  }
  if(PDIR.x||PDIR.y){
    PT += PSPD/T;
    if(PT>=1){
      let nr=PR+PDIR.y, nc=PC+PDIR.x;
      if(PDIR.y===0 && PR===tunnelRow){ if(nc<0) nc=COLS-1; else if(nc>=COLS) nc=0; }
      PR=nr; PC=nc; PT=0;
      eatAt(PR,PC);
      if(bufferedDir && openAt(PR+bufferedDir.y,PC+bufferedDir.x)){ PDIR=bufferedDir; bufferedDir=null; }
      else if(!openAt(PR+PDIR.y,PC+PDIR.x)) PDIR={x:0,y:0};
    }
    PL.fx=PDIR.x||PL.fx; PL.fy=PDIR.y||PL.fy; PL.walkT+=0.25;
  } else PL.walkT=0;
  PL.x=(PC+PDIR.x*PT)*T+16; PL.y=(PR+PDIR.y*PT)*T+16;
  if((PDIR.x||PDIR.y) && frame%3===0) trail.push({x:PL.x, y:PL.y, life:16});
}

/* Death is a held beat, not an instant snap-back: the board freezes and
   the fireball swells inside a slow throbbing glow before anything moves.
   Two seconds of "that happened" reads far better than a teleport. */
function loseLife(){
  if(dyingT>0) return;
  sfx.hurt(); puff(PL.x,PL.y,'#ff5a3c',14);
  dyingT=125;
  PDIR={x:0,y:0};
}
function finishDeath(){
  lives--;
  if(lives<=0){ over=true; doneT=140; toast('GAME OVER — score '+score); return; }
  PL.iframes=100;
  PR=SPAWN.r; PC=SPAWN.c; PT=0; PDIR={x:0,y:0};
  frightT=0; frightChain=0;
  ghosts.forEach(resetGhost);
  toast('Caught! '+lives+' '+(lives===1?'life':'lives')+' left.');
}
function checkCollisions(){
  if(PL.iframes>0) return;
  if(jumping) return;               // airborne: sail clean over every fireball (Pac-Mania rules)
  for(const g of ghosts){
    if(g.respawnT>0) continue;
    const gx=(g.c+g.dir.x*g.t)*T+16, gy=(g.r+g.dir.y*g.t)*T+16;
    if(Math.hypot(PL.x-gx,PL.y-gy)<15){
      if(g.frightened && !g.eaten){
        const val=Math.min(1600, 200*Math.pow(2, frightChain));   // 200 -> 400 -> 800 -> 1600
        frightChain++;
        g.eaten=true; g.frightened=false; score+=val;
        addFloat(gx,gy-14,'+'+val, val>=800?'#ffe066':'#bfeffc');
        puff(gx,gy, val>=800?'#ffe066':'#bfeffc', 10+frightChain*4);
        sfx.coin();
        if(val>=1600) toast('All four on one pellet. 1600.');
      } else if(!g.eaten){
        loseLife(); return;
      }
    }
  }
}

/* ---------------- UPDATE ---------------- */
function update(){
  if(PL.iframes>0) PL.iframes--;
  if(flashT>0) flashT--;
  if(introT>0){ introT--; return; }
  if(over){ if(doneT>0){ doneT--; if(doneT<=0) startMazeTrans('out'); } return; }
  if(dyingT>0){ dyingT--; if(dyingT<=0) finishDeath(); return; }   // everything holds
  stepPlayer();
  ghosts.forEach(stepGhost);
  checkCollisions();
  if(fruit){ fruit.t--; if(fruit.t<=0) fruit=null; }
  if(frightT>0){ frightT--; if(frightT===0){ ghosts.forEach(g=>{ if(!g.eaten) g.frightened=false; }); frightChain=0; } }
  const ex=EXIT_TILE.c*T+16, ey=EXIT_TILE.r*T+16;
  const nearExit=Math.hypot(PL.x-ex,PL.y-ey)<26;
  if(nearExit){
    if(held[' '] && !exitLatch){ exitLatch=true; startMazeTrans('out'); }
  } else if(held[' '] && !jumpLatch && !jumping){
    jumping=true; jumpV=-3.1; jumpLatch=true;      // hop arc ~28 frames, ~13px apex
    if(sfx.jump) sfx.jump();
  }
  if(!held[' ']){ exitLatch=false; jumpLatch=false; }
  if(jumping){
    jumpZ-=jumpV; jumpV+=0.225;
    if(jumpZ<=0){ jumpZ=0; jumping=false; puff(PL.x,PL.y+8,'#ffd77a',4); }
  }
}

/* ---------------- DRAW ---------------- */
function drawGhost(g){
  const x=(g.c+g.dir.x*g.t)*T+16, y=(g.r+g.dir.y*g.t)*T+16+HUD;
  if(g.respawnT>0) ctx.globalAlpha=0.35+0.15*Math.sin(frame*0.2);
  if(g.eaten){
    ctx.fillStyle='#eef2ff'; ctx.beginPath(); ctx.arc(x-4,y-2,3,0,7); ctx.arc(x+4,y-2,3,0,7); ctx.fill();
    ctx.fillStyle='#223'; ctx.beginPath();
    ctx.arc(x-4+g.dir.x*1.2,y-2+g.dir.y*1.2,1.3,0,7); ctx.arc(x+4+g.dir.x*1.2,y-2+g.dir.y*1.2,1.3,0,7); ctx.fill();
    ctx.globalAlpha=1;
    return;
  }
  const flee=g.frightened, blink= flee && frightT<120 && (frame>>3)%2;
  const c1 = blink? '#eaf6ff' : flee? '#6aa0ff' : g.def.color;
  const c2 = blink? '#bfe6ff' : flee? '#233a99' : shade(g.def.color,-0.45);
  const pulse=Math.sin(frame*0.22+g.pulse)*1.6;
  ctx.save(); ctx.shadowColor=c1; ctx.shadowBlur=9;
  const gl=ctx.createRadialGradient(x,y-3,1,x,y-3,11+pulse);
  gl.addColorStop(0,c1); gl.addColorStop(1,c2);
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(x,y-3,9+pulse*0.4,0,7); ctx.fill();
  ctx.restore();
  ctx.fillStyle=c1;
  for(let i=0;i<3;i++){
    const fx=x-8+i*8, fh=4+Math.sin(frame*0.3+i*2+g.pulse)*2.5;
    ctx.beginPath(); ctx.moveTo(fx-3,y+4); ctx.lineTo(fx,y+4+fh); ctx.lineTo(fx+3,y+4); ctx.closePath(); ctx.fill();
  }
  if(!flee){
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x-3.5,y-5,2.4,0,7); ctx.arc(x+3.5,y-5,2.4,0,7); ctx.fill();
    ctx.fillStyle='#241a12'; ctx.beginPath();
    ctx.arc(x-3.5+g.dir.x*1.1,y-5+g.dir.y*1.1,1.2,0,7); ctx.arc(x+3.5+g.dir.x*1.1,y-5+g.dir.y*1.1,1.2,0,7); ctx.fill();
  } else {
    ctx.strokeStyle='#fff'; ctx.lineWidth=1.4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x-6,y-5); ctx.lineTo(x-1,y-5); ctx.moveTo(x+1,y-5); ctx.lineTo(x+6,y-5); ctx.stroke();
  }
  ctx.globalAlpha=1;
}
function drawTrail(){
  for(let i=trail.length-1;i>=0;i--){
    const p=trail[i]; p.life--;
    if(p.life<=0){ trail.splice(i,1); continue; }
    const a=p.life/16;
    const g=ctx.createRadialGradient(p.x,p.y+HUD,0,p.x,p.y+HUD,8*a+2);
    g.addColorStop(0,'rgba(255,220,150,'+(0.55*a).toFixed(2)+')');
    g.addColorStop(1,'rgba(255,140,50,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y+HUD,8*a+2,0,7); ctx.fill();
  }
}
function drawPlayerFireball(){
  const x=PL.x, y=PL.y+HUD-jumpZ*1.35;
  if(jumping){   // ground shadow sells the hop
    ctx.fillStyle='rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(PL.x, PL.y+HUD+9, Math.max(3,9-jumpZ*0.35), Math.max(1.5,3.5-jumpZ*0.12), 0, 0, 7); ctx.fill();
  }
  // the death beat: a big slow throb that swells while the board is frozen
  if(dyingT>0){
    const age=1-dyingT/125;                      // 0 at the hit, 1 just before reset
    const throb=0.5+0.5*Math.sin(frame*0.16);    // slow, deliberate — not a flicker
    const rad=22+age*46+throb*14;
    const gl2=ctx.createRadialGradient(x,y,2,x,y,rad);
    gl2.addColorStop(0,   'rgba(255,246,214,'+(0.55*(1-age*0.5)).toFixed(3)+')');
    gl2.addColorStop(0.35,'rgba(255,154,60,' +(0.36*(1-age*0.4)*(0.6+throb*0.4)).toFixed(3)+')');
    gl2.addColorStop(1,   'rgba(255,90,60,0)');
    ctx.fillStyle=gl2; ctx.beginPath(); ctx.arc(x,y,rad,0,7); ctx.fill();
    ctx.strokeStyle='rgba(255,224,102,'+(0.5*(1-age)*throb).toFixed(3)+')';
    ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(x,y,rad*0.62,0,7); ctx.stroke();
  }
  const pulse = dyingT>0 ? Math.sin(frame*0.16)*3.2 : Math.sin(frame*0.3)*1.4;
  ctx.save(); ctx.shadowColor='#fff3c4'; ctx.shadowBlur= dyingT>0 ? 26 : 11;
  const gl=ctx.createRadialGradient(x,y,1,x,y,10+pulse);
  gl.addColorStop(0,'#fffef0'); gl.addColorStop(0.5,'#ffe066'); gl.addColorStop(1,'#ff9838');
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(x,y,9+pulse*0.4,0,7); ctx.fill();
  ctx.restore();
  ctx.fillStyle='#ffe066';
  for(let i=0;i<3;i++){
    const fx=x-8+i*8, fh=4+Math.sin(frame*0.35+i*2)*2.5;
    ctx.beginPath(); ctx.moveTo(fx-3,y+4); ctx.lineTo(fx,y+4+fh); ctx.lineTo(fx+3,y+4); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle='#3a2a10'; ctx.beginPath();
  ctx.arc(x-3.2+PL.fx*1.1,y-2+PL.fy*1.1,1.3,0,7); ctx.arc(x+3.2+PL.fx*1.1,y-2+PL.fy*1.1,1.3,0,7); ctx.fill();
}
function drawMazeBar(){
  const hg=ctx.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#171233'); hg.addColorStop(1,'#0c0a1e');
  ctx.fillStyle=hg; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle='rgba(255,112,67,.3)'; ctx.fillRect(0,HUD-2,RW,2);
  ctx.textAlign='left';
  ctx.font='bold 13px '+FONT; ctx.fillStyle='#ffb199'; ctx.fillText('DOTS '+(dots.size+pellets.size), 14, 20);
  ctx.font='11px '+FONT; ctx.fillStyle='#98a58c'; ctx.fillText('LEVEL '+level+'   SPACE = hop', 14, 36);
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#ffe9a0'; ctx.fillText('FIREBALL MAZE', RW/2, 24);
  ctx.textAlign='right';
  for(let i=0;i<10;i++){
    ctx.fillStyle = i<lives? '#ff5a3c' : '#3a2c28';
    ctx.beginPath(); ctx.arc(RW-16-i*14,16,5,0,7); ctx.fill();
  }
  ctx.font='10px '+FONT; ctx.fillStyle='#8a957e'; ctx.fillText('SCORE '+score, RW-16, 38);
}
function drawBanana(fr){
  const x=fr.c*T+16, y=fr.r*T+16+HUD;
  const bob=Math.sin(frame*0.1)*2;
  const blink = fr.t<150 && (frame>>3)%2;
  if(blink) return;
  ctx.save(); ctx.translate(x,y+bob); ctx.rotate(-0.5);
  const grad=ctx.createLinearGradient(-8,-6,8,6);
  grad.addColorStop(0,'#fff3a0'); grad.addColorStop(1,'#ffcc33');
  ctx.fillStyle=grad; ctx.lineWidth=1.4; ctx.strokeStyle='rgba(120,80,10,.6)';
  ctx.beginPath();
  ctx.moveTo(-9,4);
  ctx.quadraticCurveTo(-2,-9, 9,-6);
  ctx.quadraticCurveTo(0,-2, -9,4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(90,60,10,.5)';
  ctx.beginPath(); ctx.arc(9,-6,1.4,0,7); ctx.fill();
  ctx.restore();
}
function draw(){
  const g=ctx;
  g.fillStyle='#05060c'; g.fillRect(0,HUD,RW,RH);
  for(let i=0;i<40;i++){
    const hv=hash2(i*13,i*7);
    g.fillStyle='rgba(120,140,255,'+(0.03+hv*0.05).toFixed(3)+')';
    g.beginPath(); g.arc(hv*RW, HUD+hash2(i,3)*RH, 1, 0, 7); g.fill();
  }
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    if(mgrid[r][c]==='#'){
      const x=c*T, y=r*T+HUD;
      const wg=g.createLinearGradient(x,y,x,y+T);
      wg.addColorStop(0,'#2c2470'); wg.addColorStop(1,'#171340');
      g.fillStyle=wg; rr(g,x+1,y+1,T-2,T-2,4); g.fill();
      g.strokeStyle='rgba(140,160,255,.45)'; g.lineWidth=1.4;
      rr(g,x+1.5,y+1.5,T-3,T-3,4); g.stroke();
    }
  }
  g.fillStyle='#ffe9c2';
  for(const k of dots){ const [r,c]=k.split(',').map(Number); const x=c*T+16,y=r*T+16+HUD; g.beginPath(); g.arc(x,y,2.6,0,7); g.fill(); }
  const pp=3.5+Math.sin(frame*0.15)*1.4;
  for(const k of pellets){
    const [r,c]=k.split(',').map(Number); const x=c*T+16,y=r*T+16+HUD;
    const gl=g.createRadialGradient(x,y,1,x,y,12);
    gl.addColorStop(0,'rgba(255,214,80,.55)'); gl.addColorStop(1,'rgba(255,214,80,0)');
    g.fillStyle=gl; g.beginPath(); g.arc(x,y,12,0,7); g.fill();
    g.fillStyle='#ffd76e'; g.beginPath(); g.arc(x,y,pp,0,7); g.fill();
  }
  if(fruit) drawBanana(fruit);
  const ex=EXIT_TILE.c*T+16, ey=EXIT_TILE.r*T+16+HUD;
  const pul=0.5+Math.sin(frame*0.08)*0.25;
  g.strokeStyle='rgba(232,193,90,'+pul.toFixed(2)+')'; g.lineWidth=2.2;
  g.beginPath(); g.ellipse(ex,ey,14,7,0,0,7); g.stroke();
  if(Math.hypot(PL.x-(EXIT_TILE.c*T+16),PL.y-(EXIT_TILE.r*T+16))<50) drawLabel('EXIT  [SPACE]', ex, ey-18, '#ffe9a0');
  for(const gh of ghosts) drawGhost(gh);
  drawTrail();
  drawPlayerFireball();
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.05; p.life--;
    if(p.life<=0){ particles.splice(i,1); continue; }
    ctx.globalAlpha=Math.min(1,p.life/15)*0.85; ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y+HUD,2.2,0,7); ctx.fill(); ctx.globalAlpha=1;
  }
  ctx.font='bold 12px '+FONT; ctx.textAlign='center'; ctx.lineJoin='round';
  for(let i=floats.length-1;i>=0;i--){
    const f=floats[i]; f.y-=0.4; f.life--;
    if(f.life<=0){ floats.splice(i,1); continue; }
    ctx.globalAlpha=Math.min(1,f.life/20);
    ctx.lineWidth=3; ctx.strokeStyle='rgba(6,6,14,.85)'; ctx.strokeText(f.text,f.x,f.y+HUD);
    ctx.fillStyle=f.color||'#fff'; ctx.fillText(f.text,f.x,f.y+HUD); ctx.globalAlpha=1;
  }
  drawMazeBar();
  if(introT>0 && (frame>>3)%2){
    ctx.font='bold 22px '+FONT; ctx.textAlign='center'; ctx.fillStyle='#ffd76e';
    ctx.fillText('READY!', RW/2, HUD+RH/2);
  }
  if(over && flashT<=0 && lives<=0){
    ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(0,HUD,RW,RH);
    ctx.font='bold 26px '+FONT; ctx.textAlign='center'; ctx.fillStyle='#ff7a7a'; ctx.fillText('GAME OVER', RW/2, HUD+RH/2-6);
    ctx.font='14px '+FONT; ctx.fillStyle='#e8e8dc'; ctx.fillText('score '+score, RW/2, HUD+RH/2+18);
  }
  drawFlash();
}

/* ---------------- API ---------------- */
window.MazeLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    ghosts = GHOST_DEF.map(def=>({def, home:def.home, r:def.home.r, c:def.home.c, t:0, dir:{x:0,y:0}, frightened:false, eaten:false, respawnT:0, pulse:Math.random()*6}));
    LEVELS[0].rows=MAZE_ROWS; LEVELS[0].homes=GHOST_DEF.map(d=>d.home);
    lives=10; score=0; level=1; frightT=0; over=false; doneT=0; flashT=0;
    loadLevel(1);
    introT=70; exitLatch=false;
    PL.swing=0; PL.iframes=0; PL.kb.x=0; PL.kb.y=0;
    toast('The maze hums awake. Dots score points — mind the fireballs!');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; } else loadScreen(12);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw
};

})();
