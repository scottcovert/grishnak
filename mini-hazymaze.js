"use strict";
/* ============================================================
   GRISHNAK — HAZY MAZY  (3D PAC variant, sideways-scrolling)

   Same pinhole camera as 3D PAC, rotated in intent: the board is
   ~100% of the screen tall and ~300% wide, and the CAMERA TRACKS
   SIDEWAYS (camX follows you; camWY is fixed — every row is
   always in view).

   The signature: walls are HIGHER here (WZ 24 vs 15), so things
   genuinely disappear behind them — EXCEPT right around you,
   where walls render as pure light WIREFRAME you can see straight
   through to monsters, dots and fruit. The transparency fades
   with screen distance and is gone entirely at ~1/6 screen width.

   Three monster kinds:
     PIPS    small, deadly, frightenable — the classic three
             (chase / ambush / flank), released from the pen.
     LURKERS medium, HARMLESS, and solid — they patrol corridors
             and block you like a moving wall. SPACE hops over.
     THE OGRE huge, slow, deadly, immune to pellets — and too
             TALL to jump: his head clears the walls, so he is
             the one monster the haze never hides.
   Center of the board is a TOWN SQUARE where walls are short
   ('l' tiles, ~1/3 height) — an open plaza holding the pen.
   Top-right: a C64 Rat-Race-style pixel minimap, 1px light-blue
   grid, with blips for you and every monster.
   ============================================================ */
(function(){

const COLS=57, ROWS=12;
const TW=30, TH=26;
const BOARD_W=COLS*TW, BOARD_H=ROWS*TH;

/* camera: identical projection family to 3D PAC, but camWY is FIXED
   (the whole 12-row board fits the window) and camX SCROLLS. */
const D0=560, F=588, CAMH=1021;
const HOR=430-CAMH*F/D0;
const CX=RW/2;
const VS=150;
const WZ=24, WZ_LOW=9;               // higher walls; short plaza walls
const SKEW=0.27;
const camWY=BOARD_H-VS;              // fixed: near edge lands at scale ~1.05
const CAMX_MIN=300, CAMX_MAX=BOARD_W-300;
let camX=BOARD_W/2;

const HAZE_R=RW/6;                   // the see-through window radius (screen px)

const PSTEP=0.075, GSTEP=0.060, LSTEP=0.045, OSTEP=0.032;
const JUMP_V=-3.1, JUMP_G=0.15;      // the 1.5x arc, same as 3D PAC
const JUMP_PEAK=JUMP_V*JUMP_V/(2*JUMP_G);
const ZSCALE=1.15;
const FRIGHT_T=420;
const FRUIT_AT=[0.35,0.70];

/* ---------------- the board (generated + flood-fill verified) ------- */
//HAZYMAZE-START
const MAZE=[
'#########################################################',
'#o.....................................................o#',
'#.###..###..###..###..###..###..###..###..###..###..###.#',
'#.....#........#.......l.........l.......#........#.....#',
'#.#####..#####..#####................#####..#####..####.#',
'#.....................l...lll-lll.......................#',
'#.........................l     l.l.....................#',
'#.##..#####..#####..##....lllllll..####..#####..#####...#',
'#.........#........#...l.....P...l...........#......#...#',
'#.###..###..###..###..###..###..###..###..###..###..###.#',
'#o.....................................................o#',
'#########################################################'
];
//HAZYMAZE-END

const HOUSE=[{r:6,c:28},{r:6,c:29},{r:6,c:30}];
const DOOR={r:5,c:29};
const PEN={r0:5,r1:7,c0:26,c1:32};
const BONUS_TILE={r:3,c:28};

/* COZY CASTLE look (Scott 2026-08-07): dusk over battlements, cobbled
   courtyards, candle-flame dots, warm pie. And the survival rule that
   makes the haze CRUCIAL: monsters are only visible inside your light
   (or on the minimap) — beyond it the castle keeps its secrets. */
const th={
  name:'HAZY MAZY',
  sky:['#241628','#4a2a34'],
  floor:'#48413a', floorAlt:'#4f4840', floorEdge:'rgba(20,14,10,.35)',
  wallTop:'#8a8078', wallTopLit:'#b0a494', wallFace:'#6a6058', wallDark:'#443c34',
  lowTop:'#9a9086', lowTopLit:'#c0b4a4', lowFace:'#7a7066', lowDark:'#544c44',
  wire:'255,222,160',
  dot:'#ffd88a', dotGlow:'rgba(255,200,110,.5)',
  pellet:'#ffe9b0', pelletGlow:'rgba(255,215,140,.75)',
  bonus:{name:'WARM PIE', score:250}
};

/* ---------------- state ---------------- */
let grid=[], dots=new Set(), pellets=new Set();
let pac={r:0,c:0,t:0,dir:{x:0,y:0},want:null,z:0,vz:0,air:false};
let START={r:8,c:29};
let ghosts=[], lurkers=[], ogre=null;
let score=0, lives=10, level=1, frightT=0, chain=0;
let totalDots=0, eaten=0, bonusStage=0, bonuses=[];
let floats=[];
let introT=0, dyingT=0, doneT=0, over=false;
let flies=[];
let jumpLatch=true, exitLatch=true, savedPos=null;
let pacScr={x:CX,y:300};             // pac's screen point, cached per frame for the haze

const key=(r,c)=>r*COLS+c;
/* NO wraparound here — the board is a closed 3-screen-wide room */
const at=(r,c)=>{ if(r<0||r>=ROWS||c<0||c>=COLS) return '#'; return grid[r][c]; };
const isSolid=(r,c)=>{ const t=at(r,c); return t==='#'||t==='l'; };
const blocked=(r,c,ghost)=>{ const t=at(r,c);
  if(t==='#'||t==='l') return true;
  if(t==='-') return !ghost; return false; };
const inPen=(r,c)=> r>=PEN.r0 && r<=PEN.r1 && c>=PEN.c0 && c<=PEN.c1;
const lurkerAt=(r,c)=> lurkers.some(L=>L.r===r && L.c===c);

const GHOST_DEF=[
  {name:'ember', col:'#ff5a5a', home:HOUSE[0], out:0,   mode:'chase'},
  {name:'wisp',  col:'#ff9fd0', home:HOUSE[1], out:90,  mode:'ambush'},
  {name:'gloam', col:'#7fe7ff', home:HOUSE[2], out:210, mode:'flank'}
];
const LURKER_DEF=[{r:1,c:10},{r:10,c:46}];
const OGRE_HOME={r:10,c:28};

function loadLevel(n){
  level=n;
  grid=MAZE.map(row=>row.split(''));
  dots=new Set(); pellets=new Set();
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const t=grid[r][c];
    if(t==='.') dots.add(key(r,c));
    else if(t==='o') pellets.add(key(r,c));
    else if(t==='P'){ pac.r=r; pac.c=c; START={r,c}; grid[r][c]=' '; }
  }
  totalDots=dots.size+pellets.size; eaten=0;
  bonuses=[]; floats=[];
  pac.t=0; pac.dir={x:0,y:0}; pac.want=null; pac.z=0; pac.vz=0; pac.air=false;
  ghosts=GHOST_DEF.map((d,i)=>({def:d, r:d.home.r, c:d.home.c, t:0,
    dir:{x:0,y:-1}, penT:d.out, frightened:false, eatenT:0, bob:i*1.7}));
  lurkers=LURKER_DEF.map((L,i)=>({r:L.r, c:L.c, t:0, dir:{x:i?-1:1, y:0}, bob:i*2.3}));
  ogre={r:OGRE_HOME.r, c:OGRE_HOME.c, t:0, dir:{x:1,y:0}, bob:0.9};
  frightT=0; chain=0; bonusStage=0;
  introT=90; dyingT=0; doneT=0;
  flies=Array.from({length:14},(x,i)=>({wx:60+Math.random()*(BOARD_W-120),
    wy:30+Math.random()*(BOARD_H-60), ph:i*0.9}));
  camX=Math.max(CAMX_MIN, Math.min(CAMX_MAX, (pac.c+0.5)*TW));
}

function float(wx,wy,txt,col){ floats.push({wx,wy,wz:14,t:60,txt,col}); }

/* ---------------- movement ---------------- */
function stepEnt(e, spd){
  e.t+=spd;
  while(e.t>=1){ e.t-=1; e.r+=e.dir.y; e.c+=e.dir.x; return true; }
  return false;
}
/* a grounded pac treats a LURKER like a wall — SPACE is the way past */
function canGoPac(d){
  if(blocked(pac.r+d.y, pac.c+d.x, false)) return false;
  if(!pac.air && lurkerAt(pac.r+d.y, pac.c+d.x)) return false;
  return true;
}
function canGo(e,d,ghost){ return !blocked(e.r+d.y, e.c+d.x, ghost); }

function pacTick(){
  const want=readDir();
  if(want) pac.want=want;
  if(pac.t===0 || pac.dir.x===0&&pac.dir.y===0){
    if(pac.want && canGoPac(pac.want)){ pac.dir=pac.want; pac.want=null; }
  }
  /* mid-step reversal: commit to the tile ahead first — without that, the
     logical position (and every collision against it) teleports a full tile */
  if(pac.want && pac.t>0 && (pac.dir.x||pac.dir.y) &&
     pac.want.x===-pac.dir.x && pac.want.y===-pac.dir.y){
    pac.r+=pac.dir.y; pac.c+=pac.dir.x;
    pac.dir=pac.want; pac.want=null; pac.t=1-pac.t;
  }
  if(pac.dir.x||pac.dir.y){
    if(!canGoPac(pac.dir) && pac.t===0){ /* nose to a wall (or a lurker) */ }
    else {
      const arrived=stepEnt(pac,PSTEP);
      if(arrived){
        if(pac.want && canGoPac(pac.want)){ pac.dir=pac.want; pac.want=null; }
        if(!canGoPac(pac.dir)){ pac.t=0; pac.dir={x:0,y:0}; }
        collect();
      }
    }
  }
  if(held[' ']){
    if(!jumpLatch && !pac.air){ pac.air=true; pac.vz=JUMP_V; jumpLatch=true; sfx.jump ? sfx.jump() : (sfx.task&&sfx.task()); }
  } else jumpLatch=false;
  if(pac.air){
    pac.z-=pac.vz; pac.vz+=JUMP_G;
    if(pac.z<=0){ pac.z=0; pac.air=false;
      /* landing ON a lurker's tile: slide off to the nearest free side */
      if(lurkerAt(pac.r,pac.c)){
        for(const d of DIRS){ if(canGoPac(d)){ pac.r+=d.y; pac.c+=d.x; break; } }
      }
      const p=scrEnt(pac,0); puff(p.x, p.y, '#cfe8ff', 4);
    }
  }
}
function readDir(){
  if(held.ArrowLeft) return {x:-1,y:0};
  if(held.ArrowRight) return {x:1,y:0};
  if(held.ArrowUp) return {x:0,y:-1};
  if(held.ArrowDown) return {x:0,y:1};
  return null;
}

function collect(){
  const k=key(pac.r,pac.c);
  if(dots.has(k)){
    dots.delete(k); eaten++; score+=10; res.gold=Math.min(999,res.gold+1);
    sfx.coin && sfx.coin();
  } else if(pellets.has(k)){
    pellets.delete(k); eaten++; score+=50; chain=0; frightT=FRIGHT_T;
    for(const g of ghosts) if(g.eatenT===0) g.frightened=true;
    sfx.heart && sfx.heart();
    float((pac.c+0.5)*TW, (pac.r+0.5)*TH, 'RUN', '#ffe066');
  }
  const frac=eaten/totalDots;
  if(bonusStage<FRUIT_AT.length && frac>=FRUIT_AT[bonusStage]){
    bonusStage++;
    bonuses.push({r:BONUS_TILE.r, c:BONUS_TILE.c, t:600});
  }
  for(let i=bonuses.length-1;i>=0;i--){
    const b=bonuses[i];
    if(b.r===pac.r && b.c===pac.c){
      score+=th.bonus.score; res.gold=Math.min(999,res.gold+15);
      float((pac.c+0.5)*TW, (pac.r+0.5)*TH, th.bonus.name+' +'+th.bonus.score, '#ffd23f');
      sfx.chest && sfx.chest(); bonuses.splice(i,1);
    }
  }
  if(dots.size===0 && pellets.size===0) finish();
}

/* ---------------- monsters ---------------- */
function targetOf(g){
  if(g.eatenT>0) return HOUSE[1];
  if(g.frightened) return {r:pac.r + (pac.r<ROWS/2?4:-4), c:pac.c + (pac.c<COLS/2?5:-5)};
  switch(g.def.mode){
    case 'chase':  return {r:pac.r, c:pac.c};
    case 'ambush': return {r:pac.r+pac.dir.y*4, c:pac.c+pac.dir.x*4};
    default:       return {r:pac.r-pac.dir.y*3, c:pac.c-pac.dir.x*3};
  }
}
const DIRS=[{x:0,y:-1},{x:-1,y:0},{x:0,y:1},{x:1,y:0}];
function ghostTick(g){
  if(g.penT>0){ g.penT--; return; }
  const spd = g.eatenT>0 ? GSTEP*2.1 : (g.frightened ? GSTEP*0.62 : GSTEP*(1+level*0.04));
  if(!stepEnt(g,spd)) return;
  if(g.eatenT>0 && g.r===HOUSE[1].r && g.c===HOUSE[1].c){
    g.eatenT=0; g.frightened=false; g.penT=90;
  }
  let tgt, allowReverse=false;
  if(g.eatenT===0 && inPen(g.r,g.c)){
    tgt={r:PEN.r0-1, c:DOOR.c};
    allowReverse=true;
  } else tgt=targetOf(g);
  let best=null, bestD=1e9;
  for(const d of DIRS){
    if(!allowReverse && d.x===-g.dir.x && d.y===-g.dir.y) continue;
    if(blocked(g.r+d.y, g.c+d.x, true)) continue;
    const dd=(g.r+d.y-tgt.r)**2 + (g.c+d.x-tgt.c)**2;
    if(dd<bestD){ bestD=dd; best=d; }
  }
  if(!best){ g.dir={x:-g.dir.x,y:-g.dir.y}; }
  else g.dir=best;
}
/* LURKERS pace their corridor and reverse off walls — and off YOU, which is
   what makes them a moving roadblock rather than a threat */
function lurkerTick(L){
  if(!stepEnt(L,LSTEP)) return;
  const ahead={r:L.r+L.dir.y, c:L.c+L.dir.x};
  const pacThere = !pac.air && ahead.r===pac.r && ahead.c===pac.c;
  if(blocked(ahead.r, ahead.c, false) || pacThere || lurkerAt(ahead.r, ahead.c)){
    L.dir={x:-L.dir.x, y:-L.dir.y};
  }
}
/* THE OGRE wanders: at every tile he keeps going if he can, otherwise picks
   a random open turn. Slow, tall, unstoppable, pellet-proof. */
function ogreTick(){
  if(!stepEnt(ogre,OSTEP*(1+level*0.05))) return;
  const opts=DIRS.filter(d=>
    !(d.x===-ogre.dir.x && d.y===-ogre.dir.y) && !blocked(ogre.r+d.y, ogre.c+d.x, false));
  if(opts.length===0) ogre.dir={x:-ogre.dir.x, y:-ogre.dir.y};
  else if(!opts.some(d=>d.x===ogre.dir.x&&d.y===ogre.dir.y) || Math.random()<0.3)
    ogre.dir=opts[(Math.random()*opts.length)|0];
}

/* true mid-step distance in tile units — same-tile checks miss head-on
   passes (entities "belong" to the tile they're leaving until t rolls over)
   and compare t-progress along different axes, which means nothing */
function wdist(a,b){
  const dx=(a.c+a.dir.x*a.t)-(b.c+b.dir.x*b.t);
  const dy=(a.r+a.dir.y*a.t)-(b.r+b.dir.y*b.t);
  return Math.hypot(dx,dy);
}
function collisions(){
  if(dyingT>0||doneT>0) return;
  for(const g of ghosts){
    if(g.eatenT>0 || g.penT>0) continue;
    if(wdist(g,pac)>0.5) continue;
    if(pac.air) continue;                       // small ones: jumpable
    if(g.frightened){
      const val=Math.min(1600, 200*Math.pow(2,chain)); chain++;
      score+=val; g.eatenT=1; g.frightened=false;
      float((g.c+0.5)*TW, (g.r+0.5)*TH, '+'+val, val>=800?'#ffe066':'#bfeffc');
      sfx.chest && sfx.chest();
    } else die();
  }
  /* the ogre is too tall to jump — airborne or not, he ends you */
  if(wdist(ogre,pac)<=0.6) die();
}
function die(){
  if(dyingT>0) return;
  sfx.hurt && sfx.hurt();
  const p=scrEnt(pac,0);
  puff(p.x, p.y, '#ff5a3c', 14);
  dyingT=110; pac.dir={x:0,y:0}; pac.want=null;
}
function afterDeath(){
  lives--;
  if(lives<=0){ over=true; doneT=150; return; }
  pac.r=START.r; pac.c=START.c; pac.t=0; pac.dir={x:0,y:0}; pac.z=0; pac.air=false;
  for(const g of ghosts){ g.r=g.def.home.r; g.c=g.def.home.c; g.t=0; g.dir={x:0,y:-1};
    g.penT=g.def.out; g.frightened=false; g.eatenT=0; }
  ogre.r=OGRE_HOME.r; ogre.c=OGRE_HOME.c; ogre.t=0;
  frightT=0; chain=0;
}
function finish(){
  doneT=150; sfx.win && sfx.win();
  score+=200*level;
}

/* ---------------- update ---------------- */
function update(){
  if(introT>0) introT--;
  if(held.Escape){ if(!exitLatch){ exitLatch=true; startHazyTrans('out'); return; } } else exitLatch=false;
  if(doneT>0){
    if(--doneT===0){
      if(over){ startHazyTrans('out'); return; }
      loadLevel(level+1); lives=Math.min(5,lives+1);
    }
    return;
  }
  if(dyingT>0){ if(--dyingT===0) afterDeath(); return; }
  if(introT>0) return;

  if(frightT>0){ frightT--; if(frightT===0) for(const g of ghosts) g.frightened=false; }
  for(let i=bonuses.length-1;i>=0;i--) if(--bonuses[i].t<=0) bonuses.splice(i,1);
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.wz+=0.5; if(--f.t<=0) floats.splice(i,1); }

  pacTick();
  for(const g of ghosts) ghostTick(g);
  for(const L of lurkers) lurkerTick(L);
  ogreTick();
  collisions();

  /* SIDEWAYS camera — the whole point of the variant */
  const want=Math.max(CAMX_MIN, Math.min(CAMX_MAX, (pac.c+pac.dir.x*pac.t+0.5)*TW));
  camX += (want-camX)*0.10;
}

/* ---------------- projection (camX scrolls; camWY fixed) -------------- */
function depth(wy){ return D0 + (camWY + VS - wy); }
function flipX(wy){ return camX - (camWY + VS - wy)*SKEW; }
function proj(wx, wy, wz){
  const d=depth(wy), s=F/d;
  return { x: CX + ((wx-camX) + (camWY + VS - wy)*SKEW)*s,
           y: HOR + (CAMH-(wz||0))*s,
           s };
}
function scrEnt(e, wz){
  const wx=(e.c + e.dir.x*e.t + 0.5)*TW;
  const wy=(e.r + e.dir.y*e.t + 0.5)*TH;
  return proj(wx, wy, wz||0);
}
const tileWX=c=>c*TW, tileWY=r=>r*TH;
function colVisible(r,c){
  const p=proj(tileWX(c)+TW/2, tileWY(r)+TH/2, 0);
  return p.x>-80 && p.x<RW+80;
}
/* 0 = fully solid · 1 = pure wireframe, by screen distance from the player */
function hazeAt(sx,sy){
  const d=Math.hypot(sx-pacScr.x, sy-pacScr.y);
  return Math.max(0, 1-d/HAZE_R);
}

function quad(g,a,b,c2,d){
  g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y);
  g.lineTo(c2.x,c2.y); g.lineTo(d.x,d.y); g.closePath();
}

/* ---------------- art ---------------- */
function drawPie(g,x,y,s){
  g.fillStyle='#b0764a';                      // dish
  g.beginPath(); g.ellipse(x,y+3*s,9.5*s,4*s,0,0,7); g.fill();
  g.fillStyle='#e0b060';                      // crust
  g.beginPath(); g.ellipse(x,y,9*s,5.5*s,0,0,7); g.fill();
  g.fillStyle='#c89040';                      // crimped rim
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2;
    g.beginPath(); g.arc(x+Math.cos(a)*8*s, y+Math.sin(a)*4.6*s, 1.6*s, 0, 7); g.fill();
  }
  g.fillStyle='#8a4a2a';                      // filling vents
  g.fillRect(x-3*s,y-1*s,2*s,2*s); g.fillRect(x+1*s,y-1*s,2*s,2*s);
  const st=Math.sin(frame*0.08);              // steam
  g.strokeStyle='rgba(255,255,255,'+(0.25+0.15*st).toFixed(2)+')'; g.lineWidth=1.4*s;
  g.beginPath(); g.moveTo(x-2*s,y-6*s); g.quadraticCurveTo(x-4*s+st*2,y-10*s, x-2*s,y-13*s); g.stroke();
  g.beginPath(); g.moveTo(x+2*s,y-6*s); g.quadraticCurveTo(x+4*s-st*2,y-10*s, x+2*s,y-13*s); g.stroke();
}
th.bonus.draw=drawPie;

function drawFloor(g,r,c){
  const x0=tileWX(c), x1=x0+TW, yN=tileWY(r), yS=yN+TH;
  const a=proj(x0,yN,0), b=proj(x1,yN,0), c2=proj(x1,yS,0), d=proj(x0,yS,0);
  quad(g,a,b,c2,d);
  g.fillStyle=((r+c)&1) ? th.floor : th.floorAlt;
  g.fill();
  g.strokeStyle=th.floorEdge; g.lineWidth=1; g.stroke();
}

/* one wall block. Near the player it dissolves into light wireframe —
   the solid faces fade OUT as the wire fades IN, so whatever stands
   behind it (drawn earlier in painter order) shows through. */
function drawWall(g,r,c){
  const low = at(r,c)==='l';
  const H = low? WZ_LOW : WZ;
  const x0=tileWX(c), x1=x0+TW, yN=tileWY(r), yS=yN+TH;
  const bNW=proj(x0,yN,0), bNE=proj(x1,yN,0), bSE=proj(x1,yS,0), bSW=proj(x0,yS,0);
  const tNW=proj(x0,yN,H), tNE=proj(x1,yN,H), tSE=proj(x1,yS,H), tSW=proj(x0,yS,H);
  const cxw=(x0+x1)/2, fx=flipX((yN+yS)/2);
  const mid=proj(cxw,(yN+yS)/2,H/2);
  const haze=hazeAt(mid.x, mid.y);
  const solidA=Math.min(1, Math.max(0, 1-haze));
  const wallTop=low?th.lowTop:th.wallTop, wallTopLit=low?th.lowTopLit:th.wallTopLit;
  const wallFace=low?th.lowFace:th.wallFace, wallDark=low?th.lowDark:th.wallDark;
  const sameKind=(rr2,cc2)=> at(rr2,cc2)===(low?'l':'#');

  if(solidA>0.02){
    g.globalAlpha=solidA;
    if(cxw<fx && !sameKind(r,c+1)){
      quad(g,bNE,bSE,tSE,tNE); g.fillStyle=wallDark; g.fill();
    } else if(cxw>fx && !sameKind(r,c-1)){
      quad(g,bNW,bSW,tSW,tNW); g.fillStyle=wallDark; g.fill();
    }
    if(!sameKind(r+1,c)){
      quad(g,bSW,bSE,tSE,tSW);
      const fg=g.createLinearGradient(0,tSW.y,0,bSW.y);
      fg.addColorStop(0,wallFace); fg.addColorStop(1,wallDark);
      g.fillStyle=fg; g.fill();
      /* mortar courses on the exposed face — castle masonry, not neon */
      g.strokeStyle='rgba(30,22,16,.35)'; g.lineWidth=1;
      for(const f2 of [0.38,0.72]){
        const yA=tSW.y+(bSW.y-tSW.y)*f2, yB=tSE.y+(bSE.y-tSE.y)*f2;
        g.beginPath(); g.moveTo(tSW.x,yA); g.lineTo(tSE.x,yB); g.stroke();
      }
      g.beginPath();
      g.moveTo((tSW.x+tSE.x)/2,(tSW.y+tSE.y)/2);
      g.lineTo((bSW.x+bSE.x)/2, tSW.y+(bSW.y-tSW.y)*0.38); g.stroke();
    }
    quad(g,tNW,tNE,tSE,tSW);
    const tg=g.createLinearGradient(0,tNW.y,0,tSW.y);
    tg.addColorStop(0,wallTop); tg.addColorStop(1,wallTopLit);
    g.fillStyle=tg; g.fill();
    g.strokeStyle='rgba(0,0,0,.22)'; g.lineWidth=1;
    quad(g,tNW,tNE,tSE,tSW); g.stroke();
    /* BATTLEMENTS: merlons along the exposed south lip of full-height walls */
    if(!low && !sameKind(r+1,c)){
      g.fillStyle=wallTopLit;
      for(const [f0,f1] of [[0.06,0.30],[0.40,0.62],[0.72,0.94]]){
        const m0=proj(x0+f0*TW,yS,H), m1=proj(x0+f1*TW,yS,H);
        const m2=proj(x0+f1*TW,yS,H+6), m3=proj(x0+f0*TW,yS,H+6);
        quad(g,m0,m1,m2,m3); g.fill();
      }
      g.strokeStyle='rgba(0,0,0,.25)'; g.lineWidth=1;
      for(const [f0,f1] of [[0.06,0.30],[0.40,0.62],[0.72,0.94]]){
        const m0=proj(x0+f0*TW,yS,H), m1=proj(x0+f1*TW,yS,H);
        const m2=proj(x0+f1*TW,yS,H+6), m3=proj(x0+f0*TW,yS,H+6);
        quad(g,m0,m1,m2,m3); g.stroke();
      }
    }
    g.globalAlpha=1;
  }
  if(haze>0.02){
    /* the light wireframe: top rectangle + the vertical edges */
    const wa=(0.85*haze).toFixed(2);
    g.strokeStyle='rgba('+th.wire+','+wa+')';
    g.lineWidth=Math.max(0.8, 1.3*mid.s);
    quad(g,tNW,tNE,tSE,tSW); g.stroke();
    g.beginPath();
    g.moveTo(bSW.x,bSW.y); g.lineTo(tSW.x,tSW.y);
    g.moveTo(bSE.x,bSE.y); g.lineTo(tSE.x,tSE.y);
    g.stroke();
    g.strokeStyle='rgba('+th.wire+','+(0.35*haze).toFixed(2)+')';
    quad(g,bNW,bNE,bSE,bSW); g.stroke();
  }
}
function drawDoor(g,r,c){
  const yM=tileWY(r)+TH/2;
  const a=proj(tileWX(c)+2,yM,0), b=proj(tileWX(c)+TW-2,yM,0);
  g.strokeStyle='rgba(190,210,255,.55)'; g.lineWidth=4*a.s;
  g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.stroke();
}
/* dots are CANDLE FLAMES — a wick and a flickering teardrop. They dim
   outside your light (still visible enough to route by, warmer up close) */
function drawDot(g,r,c){
  const p=proj(tileWX(c)+TW/2, tileWY(r)+TH/2, 3);
  const vis=Math.min(1, 0.30+hazeAt(p.x,p.y)*1.3);
  g.globalAlpha=vis;
  const fl=0.8+0.2*Math.sin(frame*0.3+c*1.7+r);
  g.fillStyle='rgba(0,0,0,.25)';
  g.beginPath(); g.ellipse(p.x,p.y+3*p.s,3.2*p.s,1.5*p.s,0,0,7); g.fill();
  const gl=g.createRadialGradient(p.x,p.y-2*p.s,0.5,p.x,p.y-2*p.s,8*p.s);
  gl.addColorStop(0,th.dotGlow); gl.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gl; g.beginPath(); g.arc(p.x,p.y-2*p.s,8*p.s,0,7); g.fill();
  g.fillStyle='#e8e0d0';                                       // stub of wax
  g.fillRect(p.x-1.4*p.s, p.y-1*p.s, 2.8*p.s, 3*p.s);
  g.fillStyle=th.dot;                                          // the flame
  g.beginPath();
  g.moveTo(p.x, p.y-6.5*p.s*fl);
  g.quadraticCurveTo(p.x+2.4*p.s, p.y-2*p.s, p.x, p.y-0.5*p.s);
  g.quadraticCurveTo(p.x-2.4*p.s, p.y-2*p.s, p.x, p.y-6.5*p.s*fl);
  g.fill();
  g.globalAlpha=1;
}
function drawPellet(g,r,c){
  const p=proj(tileWX(c)+TW/2, tileWY(r)+TH/2, 4);
  const pu=(0.6+0.4*Math.sin(frame*0.13+c)) * Math.min(1, 0.45+hazeAt(p.x,p.y));
  const gl=g.createRadialGradient(p.x,p.y,1,p.x,p.y,17*p.s);
  gl.addColorStop(0,th.pelletGlow); gl.addColorStop(1,'rgba(0,0,0,0)');
  g.globalAlpha=pu; g.fillStyle=gl; g.beginPath(); g.arc(p.x,p.y,17*p.s,0,7); g.fill(); g.globalAlpha=1;
  g.fillStyle=th.pellet;
  g.beginPath(); g.arc(p.x,p.y,(5+pu*1.6)*p.s,0,7); g.fill();
}
function drawPac(g){
  const gz=pac.z*ZSCALE;
  const p=scrEnt(pac, gz);
  const pf=scrEnt(pac, 0);
  const jf=pac.air ? Math.min(1, pac.z/JUMP_PEAK) : 0;
  const sh=pac.air ? Math.max(0.08, 0.34*(1-jf)) : 0.34;
  GFX.shadow(g, pf.x, pf.y, (pac.air?9:12)*pf.s, sh);
  const bite=Math.abs(Math.sin(frame*0.22))*0.55 + 0.06;
  let a=0;
  if(pac.dir.x>0) a=0; else if(pac.dir.x<0) a=Math.PI;
  else if(pac.dir.y>0) a=Math.PI/2; else if(pac.dir.y<0) a=-Math.PI/2;
  const R=14*p.s*(1+0.4*jf);
  const y=p.y-R*0.5;
  if(jf>0.04){
    const gg=g.createRadialGradient(p.x,y,2,p.x,y,R+16*jf);
    gg.addColorStop(0,'rgba(210,245,255,'+(0.45*jf).toFixed(2)+')');
    gg.addColorStop(1,'rgba(210,245,255,0)');
    g.fillStyle=gg; g.beginPath(); g.arc(p.x,y,R+16*jf,0,7); g.fill();
  }
  const bg=g.createRadialGradient(p.x-R*0.3,y-R*0.4,1,p.x,y,R);
  bg.addColorStop(0,'#fff3a0'); bg.addColorStop(1,'#f2c000');
  g.beginPath(); g.moveTo(p.x,y);
  g.arc(p.x,y,R,a+bite,a-bite); g.closePath();
  g.fillStyle=bg; g.fill();
  g.strokeStyle='rgba(90,60,0,.55)'; g.lineWidth=1.6; g.stroke();
  g.fillStyle='#3a2a00';
  const ex2=p.x+Math.cos(a-1.25)*R*0.42, ey=y+Math.sin(a-1.25)*R*0.42;
  g.beginPath(); g.arc(ex2,ey,1.9*p.s,0,7); g.fill();
}
function drawGhost(g,gh){
  const p=scrEnt(gh, 2);
  const bob=Math.sin(frame*0.09+gh.bob)*1.8*p.s;
  const y=p.y-13*p.s*0.5+bob;
  GFX.shadow(g, p.x, p.y, 11*p.s, 0.28);
  if(gh.eatenT>0){ drawEyes(g,p.x,y,gh,p.s); return; }
  const body = gh.frightened
    ? ((frightT<120 && (frame>>3)%2) ? '#ffffff' : '#3a4be0')
    : gh.def.col;
  const R=12*p.s;
  const bg=g.createRadialGradient(p.x-R*0.3,y-R*0.45,1,p.x,y,R+4*p.s);
  bg.addColorStop(0, GFX.lift(body,1.35));
  bg.addColorStop(0.35, body);
  bg.addColorStop(1, GFX.dim(body,0.58));
  g.beginPath();
  g.arc(p.x,y-1,R,Math.PI,0);
  g.lineTo(p.x+R,y+R*0.7);
  for(let i=0;i<3;i++){
    const w=(2*R)/3;
    g.quadraticCurveTo(p.x+R-w*(i+0.5), y+R*0.7-5.5*p.s, p.x+R-w*(i+1), y+R*0.7);
  }
  g.closePath();
  g.fillStyle=bg; g.fill();
  g.strokeStyle='rgba(0,0,0,.32)'; g.lineWidth=1.4; g.stroke();
  if(gh.frightened){
    g.fillStyle='#fff';
    g.beginPath(); g.arc(p.x-4*p.s,y-2,2.2*p.s,0,7); g.arc(p.x+4*p.s,y-2,2.2*p.s,0,7); g.fill();
  } else drawEyes(g,p.x,y,gh,p.s);
}
function drawEyes(g,x,y,gh,s){
  g.fillStyle='#fff';
  g.beginPath(); g.ellipse(x-4.2*s,y-2,3.5*s,4*s,0,0,7); g.ellipse(x+4.2*s,y-2,3.5*s,4*s,0,0,7); g.fill();
  g.fillStyle='#1b2a6a';
  const lx=gh.dir.x*1.7*s, ly=gh.dir.y*1.8*s;
  g.beginPath(); g.arc(x-4.2*s+lx,y-2+ly,1.7*s,0,7); g.arc(x+4.2*s+lx,y-2+ly,1.7*s,0,7); g.fill();
}
/* the LURKER: a wide sleepy dome — reads "hop over me", not "run" */
function drawLurker(g,L){
  const p=scrEnt(L, 2);
  const y=p.y-2;
  const W=17*p.s, H2=11*p.s;
  GFX.shadow(g, p.x, p.y, 14*p.s, 0.3);
  const bg=g.createRadialGradient(p.x-W*0.25,y-H2,1,p.x,y,W+4*p.s);
  bg.addColorStop(0,'#b8ccb8'); bg.addColorStop(0.5,'#8aa890'); bg.addColorStop(1,'#54705c');
  g.beginPath(); g.moveTo(p.x-W,y);
  g.quadraticCurveTo(p.x-W,y-H2*1.7, p.x,y-H2*1.7);
  g.quadraticCurveTo(p.x+W,y-H2*1.7, p.x+W,y);
  g.closePath(); g.fillStyle=bg; g.fill();
  g.strokeStyle='rgba(20,40,25,.4)'; g.lineWidth=1.4; g.stroke();
  const blink=(frame+L.bob*40)%210<12;
  g.strokeStyle='#243428'; g.lineWidth=1.6*p.s; g.lineCap='round';
  if(blink){
    g.beginPath(); g.moveTo(p.x-6*p.s,y-H2); g.lineTo(p.x-2.5*p.s,y-H2);
    g.moveTo(p.x+2.5*p.s,y-H2); g.lineTo(p.x+6*p.s,y-H2); g.stroke();
  } else {
    g.fillStyle='#243428';
    g.beginPath(); g.arc(p.x-4.2*p.s,y-H2,1.8*p.s,0,7); g.arc(p.x+4.2*p.s,y-H2,1.8*p.s,0,7); g.fill();
  }
  const zt=(frame>>5)%3;
  g.fillStyle='rgba(200,220,205,.5)'; g.font='bold '+Math.round(8*p.s)+'px '+FONT; g.textAlign='center';
  if(zt===2) g.fillText('z', p.x+10*p.s, y-H2*1.9);
}
/* THE OGRE: half again taller than the walls — the haze never hides him */
function drawOgre(g){
  const p=scrEnt(ogre, 2);
  const topP=scrEnt(ogre, WZ*1.5);
  const y=p.y;
  const W=16*p.s;
  GFX.shadow(g, p.x, p.y, 16*p.s, 0.34);
  const H2=y-topP.y;                       // world-tall, projected
  const bg=g.createLinearGradient(0,topP.y,0,y);
  bg.addColorStop(0,'#c09a6a'); bg.addColorStop(0.5,'#8a6a48'); bg.addColorStop(1,'#54402c');
  g.beginPath(); g.moveTo(p.x-W,y);
  g.lineTo(p.x-W*0.85, topP.y+H2*0.15);
  g.quadraticCurveTo(p.x, topP.y-H2*0.08, p.x+W*0.85, topP.y+H2*0.15);
  g.lineTo(p.x+W,y);
  g.closePath(); g.fillStyle=bg; g.fill();
  g.strokeStyle='rgba(30,20,10,.5)'; g.lineWidth=1.8; g.stroke();
  // arms
  g.strokeStyle='#6a5238'; g.lineWidth=4.5*p.s; g.lineCap='round';
  const sw=Math.sin(frame*0.06)*3*p.s;
  g.beginPath(); g.moveTo(p.x-W*0.9, topP.y+H2*0.45); g.lineTo(p.x-W*1.25, y-4*p.s+sw); g.stroke();
  g.beginPath(); g.moveTo(p.x+W*0.9, topP.y+H2*0.45); g.lineTo(p.x+W*1.25, y-4*p.s-sw); g.stroke();
  // face high up, above wall height
  const fy=topP.y+H2*0.22;
  g.fillStyle='#ffd76e';
  g.beginPath(); g.arc(p.x-5*p.s,fy,2.4*p.s,0,7); g.arc(p.x+5*p.s,fy,2.4*p.s,0,7); g.fill();
  g.fillStyle='#2a1c10';
  g.beginPath(); g.arc(p.x-5*p.s,fy,1.1*p.s,0,7); g.arc(p.x+5*p.s,fy,1.1*p.s,0,7); g.fill();
  g.strokeStyle='#2a1c10'; g.lineWidth=1.6*p.s;
  g.beginPath(); g.moveTo(p.x-4*p.s,fy+5*p.s); g.lineTo(p.x+4*p.s,fy+5*p.s); g.stroke();
  g.fillStyle='#f0e6d0';                       // two little tusks
  g.beginPath(); g.moveTo(p.x-4*p.s,fy+5*p.s); g.lineTo(p.x-3*p.s,fy+2.5*p.s); g.lineTo(p.x-2*p.s,fy+5*p.s); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(p.x+2*p.s,fy+5*p.s); g.lineTo(p.x+3*p.s,fy+2.5*p.s); g.lineTo(p.x+4*p.s,fy+5*p.s); g.closePath(); g.fill();
}

/* ---------------- draw ---------------- */
function draw(){
  const g=ctx;
  const sg=g.createLinearGradient(0,HUD,0,HUD+RH);
  sg.addColorStop(0,th.sky[0]); sg.addColorStop(1,th.sky[1]);
  g.fillStyle=sg; g.fillRect(0,HUD,RW,RH);

  pacScr=scrEnt(pac, pac.z*ZSCALE);            // the haze window centre

  g.save();
  g.beginPath(); g.rect(0,HUD,RW,RH); g.clip();

  for(let r=0;r<ROWS;r++)
    for(let c=0;c<COLS;c++)
      if(!isSolid(r,c) && colVisible(r,c)) drawFloor(g,r,c);

  for(let r=0;r<ROWS;r++){
    const fx=flipX(tileWY(r)+TH/2);
    const colOrder=[...Array(COLS).keys()].sort((a,b)=>
      Math.abs(b*TW+TW/2-fx)-Math.abs(a*TW+TW/2-fx));
    for(const c of colOrder){
      if(!colVisible(r,c)) continue;
      const t=at(r,c);
      if(t==='#'||t==='l') drawWall(g,r,c);
      else if(t==='-') drawDoor(g,r,c);
    }
    for(let c=0;c<COLS;c++){
      if(!colVisible(r,c)) continue;
      const k=key(r,c);
      if(dots.has(k)) drawDot(g,r,c);
      else if(pellets.has(k)) drawPellet(g,r,c);
    }
    for(const b of bonuses) if(b.r===r){
      const hover=Math.sin(frame*0.07+b.c)*2.5;
      const blink=b.t<120 && (frame>>3)%2;
      if(blink) continue;
      const bp=proj(tileWX(b.c)+TW/2, tileWY(b.r)+TH/2, WZ+8);
      const bf=proj(tileWX(b.c)+TW/2, tileWY(b.r)+TH/2, 0);
      GFX.shadow(g,bf.x,bf.y,9*bf.s,0.3);
      th.bonus.draw(g,bp.x,bp.y+hover,bp.s);
    }
    /* THE SURVIVAL RULE: pips and lurkers only exist to your eyes inside
       your light (frightened ones glow — always visible). The ogre is too
       tall to hide. Beyond the light: trust the map. */
    for(const gh of ghosts) if(gh.r===r && gh.penT<=0){
      const pp=scrEnt(gh,2);
      const vis=gh.frightened? 1 : Math.min(1, hazeAt(pp.x,pp.y)*1.8+0.05);
      if(vis>0.07){ g.globalAlpha=vis; drawGhost(g,gh); g.globalAlpha=1; }
    }
    for(const L of lurkers) if(L.r===r){
      const pp=scrEnt(L,2);
      const vis=Math.min(1, hazeAt(pp.x,pp.y)*1.8+0.05);
      if(vis>0.07){ g.globalAlpha=vis; drawLurker(g,L); g.globalAlpha=1; }
    }
    if(ogre.r===r) drawOgre(g);
    if(pac.r===r && (dyingT===0 || (frame>>2)%2)) drawPac(g);
  }
  for(const gh of ghosts) if(gh.penT>0){
    const pp=scrEnt(gh,2);
    const vis=Math.min(1, hazeAt(pp.x,pp.y)*1.8+0.05);
    if(vis>0.07){ g.globalAlpha=vis; drawGhost(g,gh); g.globalAlpha=1; }
  }

  /* dusk closes in beyond your lamplight — the cozy and the danger are
     the same gradient */
  const dg=g.createRadialGradient(pacScr.x,pacScr.y,HAZE_R*0.5,pacScr.x,pacScr.y,HAZE_R*2.4);
  dg.addColorStop(0,'rgba(16,10,20,0)'); dg.addColorStop(1,'rgba(16,10,20,.62)');
  g.fillStyle=dg; g.fillRect(0,HUD,RW,RH);
  const wg=g.createRadialGradient(pacScr.x,pacScr.y,2,pacScr.x,pacScr.y,HAZE_R);
  wg.addColorStop(0,'rgba(255,205,130,.13)'); wg.addColorStop(1,'rgba(255,205,130,0)');
  g.fillStyle=wg; g.beginPath(); g.arc(pacScr.x,pacScr.y,HAZE_R,0,7); g.fill();
  // fireflies drifting over the courtyards
  for(const fy of flies){
    fy.ph+=0.02;
    const fx2=fy.wx+Math.sin(fy.ph)*14, fyy=fy.wy+Math.cos(fy.ph*0.7)*9;
    const p=proj(fx2, fyy, 12+Math.sin(fy.ph*1.3)*4);
    if(p.x<-10||p.x>RW+10) continue;
    const a=0.18+0.22*Math.abs(Math.sin(fy.ph*2.1));
    g.fillStyle='rgba(220,255,160,'+a.toFixed(2)+')';
    g.beginPath(); g.arc(p.x,p.y,1.6*p.s,0,7); g.fill();
  }

  if(dyingT===0){
    const p=pacScr;
    const gl=g.createRadialGradient(p.x,p.y-6,2,p.x,p.y-6,20*p.s);
    gl.addColorStop(0,'rgba(210,240,255,.20)');
    gl.addColorStop(1,'rgba(210,240,255,0)');
    g.fillStyle=gl; g.beginPath(); g.arc(p.x,p.y-6,20*p.s,0,7); g.fill();
  }
  for(const f of floats){
    const p=proj(f.wx, f.wy, f.wz);
    g.globalAlpha=Math.min(1, f.t/20);
    g.textAlign='center'; g.font='bold '+Math.round(13*p.s)+'px '+FONT;
    g.lineWidth=3; g.strokeStyle='rgba(10,8,18,.8)';
    g.strokeText(f.txt, p.x, p.y);
    g.fillStyle=f.col; g.fillText(f.txt, p.x, p.y);
    g.globalAlpha=1;
  }
  g.restore();

  drawHUD(g);
}
/* the C64 Rat-Race minimap: 2px tiles, 1px light-blue grid, live blips */
function drawMiniMap(g){
  const S=2, MW=COLS*S, MH=ROWS*S;
  const mx=RW-MW-10, my=(HUD-MH)/2;
  g.fillStyle='rgba(4,8,18,.85)'; g.fillRect(mx-2,my-2,MW+4,MH+4);
  g.strokeStyle='rgba(150,200,255,.14)'; g.lineWidth=1;
  g.beginPath();
  for(let c=0;c<=COLS;c+=2){ g.moveTo(mx+c*S+0.5,my); g.lineTo(mx+c*S+0.5,my+MH); }
  for(let r=0;r<=ROWS;r+=2){ g.moveTo(mx,my+r*S+0.5); g.lineTo(mx+MW,my+r*S+0.5); }
  g.stroke();
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const t=at(r,c);
    if(t==='#'){ g.fillStyle='rgba(150,210,255,.55)'; g.fillRect(mx+c*S,my+r*S,S,S); }
    else if(t==='l'){ g.fillStyle='rgba(150,210,255,.25)'; g.fillRect(mx+c*S,my+r*S,S,S); }
  }
  for(const gh of ghosts) if(gh.penT<=0 && gh.eatenT===0){
    g.fillStyle= gh.frightened? '#4a5cff' : '#ff6a6a';
    g.fillRect(mx+gh.c*S,my+gh.r*S,S,S);
  }
  for(const L of lurkers){ g.fillStyle='#9ab8a8'; g.fillRect(mx+L.c*S,my+L.r*S,S,S); }
  g.fillStyle='#ffb85a'; g.fillRect(mx+ogre.c*S-1,my+ogre.r*S-1,S+2,S+2);
  if((frame>>3)%2){ g.fillStyle='#ffe066'; g.fillRect(mx+pac.c*S,my+pac.r*S,S,S); }
  g.strokeStyle='rgba(150,200,255,.4)'; g.strokeRect(mx-2.5,my-2.5,MW+5,MH+5);
}
function drawHUD(g){
  const hg=g.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#141a2e'); hg.addColorStop(1,'#0a0e1c');
  g.fillStyle=hg; g.fillRect(0,0,RW,HUD);
  g.fillStyle='rgba(140,190,255,.35)'; g.fillRect(0,HUD-2,RW,2);
  g.textAlign='left'; g.font='bold 14px '+FONT; g.fillStyle='#9ad8ff';
  g.fillText(th.name, 12, 20);
  g.font='10px '+FONT; g.fillStyle='#8a96b8';
  g.fillText('L'+level+' · SPACE hops lurkers · the tall one cannot be jumped', 12, 37);
  g.textAlign='left'; g.font='bold 15px '+FONT; g.fillStyle='#ffe9a8';
  g.fillText(String(score).padStart(5,'0'), 330, 20);
  g.font='10px '+FONT; g.fillStyle='#ffd23f';
  g.fillText('LIVES '+lives, 330, 36);
  drawMiniMap(g);

  if(introT>0){
    g.globalAlpha=Math.min(1,introT/40); g.textAlign='center';
    g.font='bold 20px '+FONT; g.fillStyle='#9ad8ff';
    g.fillText('HAZY MAZY', RW/2, HUD+RH/2-8);
    g.font='12px '+FONT; g.fillStyle='#d8e2f0';
    g.fillText('Your little light is all you can trust. Beyond it, only the map knows.', RW/2, HUD+RH/2+14);
    g.globalAlpha=1;
  }
  if(doneT>0){
    g.fillStyle='rgba(6,8,16,.72)'; g.fillRect(0,HUD,RW,RH);
    g.textAlign='center'; g.font='bold 22px '+FONT;
    g.fillStyle= over? '#ff9a9a' : '#9ad8ff';
    g.fillText(over?'LOST IN THE HAZE':'THE HAZE LIFTS', RW/2, HUD+RH/2-6);
    g.font='12px '+FONT; g.fillStyle='#d8e2f0';
    g.fillText(over? 'Score '+score : 'Deeper in — level '+(level+1), RW/2, HUD+RH/2+18);
  }
}

/* ---------------- API ---------------- */
window.HazyLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    score=0; lives=10; over=false;
    jumpLatch=true; exitLatch=true;
    loadLevel(1);
    toast('HAZY MAZY. Candles to gather, battlements at dusk — and nothing shows itself outside your light except the tall one. The map remembers for you.');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; }
    else loadScreen(5);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw,
  _t:{ get grid(){return grid;}, get dots(){return dots;}, get pellets(){return pellets;},
       get pac(){return pac;}, get ghosts(){return ghosts;}, get lurkers(){return lurkers;},
       get ogre(){return ogre;}, get score(){return score;}, get lives(){return lives;},
       get level(){return level;}, get camX(){return camX;},
       COLS, ROWS, TW, TH, WZ, WZ_LOW, HAZE_R, CAMX_MIN, CAMX_MAX,
       MAZE, HOUSE, DOOR, PEN, BONUS_TILE,
       get bonuses(){return bonuses;}, get floats(){return floats;},
       loadLevel, pacTick, ghostTick, lurkerTick, ogreTick, collisions,
       isSolid, blocked, key, at, lurkerAt, canGoPac,
       proj, depth, scrEnt, inPen, flipX, hazeAt, update,
       setPac(r,c){ pac.r=r; pac.c=c; pac.t=0; },
       skipIntro(){ introT=0; },
       get frightT(){return frightT;}, set frightT(v){frightT=v;},
       get dying(){return dyingT;}, get done(){return doneT;} }
};

})();
