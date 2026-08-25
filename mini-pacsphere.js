"use strict";
/* ============================================================
   GRISHNAK — PACSPHERE  (Scott, 2026-08-10)

   3D PAC's descendant: a pac maze wrapped around a WHOLE SPHERE.
   The maze is authored on the 6 faces of a cube (9x9 cells each,
   486 cells) and inflated onto the ball — so the grid logic stays
   square and testable while the player sees a seamless globe with
   NO EDGES: no corners to camp, ambushes from anywhere, and the
   horizon is honest fog — ghosts crest the curve at you, and in
   fright mode you chase them over it.

   Cell adjacency across cube seams is computed GEOMETRICALLY
   (step off the face edge, snap to the nearest cell centre), so
   there is no hand-stitching to get wrong; the test suite flood-
   fills the real graph.

   Controls are ABSOLUTE, the way a pac game should be: UP/DOWN/LEFT/RIGHT
   move toward the top/bottom/left/right of the SCREEN, buffered at the next
   cell. Turning never spins the world. The camera orientation is carried
   along with you (parallel transport) rather than aimed at your heading, so
   the maze slides under the player and screen-up keeps its meaning.

   The pen sits on the north face; you start on the south face.
   Four power pellets, one at each side-face heart. Renderer is
   MOONWALK's: literal-arc horizon (radius 640 = a 60-degree
   slice), depth chart bowed toward the rim, radar minimap.
   ============================================================ */
(function(){

const TAU=Math.PI*2;
const R=430;                          // gameplay sphere px-per-radian scale
const N=9;                            // cells per cube-face edge

/* --- camera + literal-arc horizon (MOONWALK's renderer, but the camera
   rides HIGHER here — Scott 2026-08-11: "a slightly higher view above the
   action". CH 110->150 with the pitch retuned: you see ~1.44 rad of maze
   ahead (was 1.25) and the ground band grows from ~92px to ~128px, so
   junctions and ghosts read earlier. The horizon keeps the true-arc
   silhouette. MOONWALK keeps its own lower camera untouched.

   PULLED BACK AND RAISED AGAIN — Scott 2026-08-16: "I'd like a higher
   perspective or something so that I can see 3 or 4 tiles behind
   (below/south) of the player character." You could see 1.3 tiles behind. The
   limit is the near clip: a point is dropped once CB+DSAT(f) < 24, and with
   the camera only CB=120 behind you, anything more than ~96px astern was
   already inside the lens. A cube face is 9 cells across 90°, so one tile is
   (pi/2)/9*R = 75px — 96px really was one tile and a bit.
   Setback 120->300 buys 3.7 tiles behind. On its own that would be a long
   lens: holding the scale at the player's feet (FOC=CB*1.25, unchanged at
   1.25) COMPRESSES the ground band from 128px to ~63px, because everything
   distant piles up toward the horizon. So the camera also climbs, 150->250,
   which reopens it: band 146px (better than the 128 it had) and 1.82 rad of
   maze ahead (was 1.44).
   Raising CH would have dropped the player's feet to y441, off a canvas that
   ends at 432 — so CY0, which is only the projection origin, comes down to
   hold SURF_Y at exactly 366 where it has always been. The horizon barely
   moves either (238 -> 220), which is why the SKY had to be unpinned from
   CY0/FOC: see SKY_Y/SKY_F below. --- */
/* SECOND CAMERA RAISE (Scott, 2026-08-19: "a little higher perspective to
   give player more of a shot at knowing when they're about to back into a
   monster"). An honest correction first: the Aug-16 "3.7 tiles astern" was
   measured to the NEAR CLIP, but the CANVAS BOTTOM was the real limiter —
   on screen the old rig showed barely 0.7 of a tile behind the player,
   because everything astern dives toward the camera plane and its scale
   diverges. This projection cannot ever show 3-4 rear tiles; what it CAN
   do is buy about one clean tile: setback out to 460 (rear tiles change
   relative distance more slowly), camera up to 320, focal 575 so the scale
   at the feet stays exactly 1.25, and the feet moved UP the canvas to 336
   so the freed bottom band belongs to what is behind you. The rest of the
   rear problem is solved by TELEGRAPH, not geometry — see REAR GLOW. */
const RV=1400, CB=460, FOC=575;
/* the starfield is not on the ground and must not ride the ground camera —
   it kept its own origin and focal so the sky is pixel-identical to the
   build before this one. Pinned to CY0/FOC it would have leapt 125px up the
   screen and spread 2.5x. */
const SKY_Y=HUD+130.6, SKY_F=150;
const CXS=RW/2;
const RC=640;
const S0=FOC/CB;        // 1.25 — the scale at the feet, pinned at EVERY vantage
const SURF_Y=336;       // ...because the feet never leave this line
/* VANTAGE (Scott 2026-08-18: "I still want the player to have a higher
   perspective... starting with 1st screen very high vantage point advantage,
   then lowering it on successive screens" — plus the live dial he floated).
   Not code bloat after all: every derived constant below is a function of
   CH, so vantage is ONE number — the camera height. The feet stay glued to
   SURF_Y at scale S0 because CY0 (only the projection origin) is recomputed
   to hold them there. VANT is the per-level ladder: screen 1 is nearly
   top-down, each screen steps down toward the Aug-19 tuned rig (320), and
   A/Z dolly the camera live between hard clamps that never break the rig. */
const VANT=[560,470,390,320];
const CH_MIN=320, CH_MAX=620;
let CH=0, CY0=0, UHV=0, UH=0, SH=0, HY=0;
function camTune(ch){
  CH=Math.max(CH_MIN,Math.min(CH_MAX,ch));
  UHV=Math.acos(RV/(RV+CH));
  UH=UHV*RV/R;
  CY0=SURF_Y-CH*S0;     // CH=320 lands CY0 at HUD-112 — the old rig, exactly
  SH=FOC/(CB+RV*Math.sin(UHV));
  HY=CY0+(CH+RV*(1-Math.cos(UHV)))*SH;
}
camTune(VANT[0]);
const DSAT=f=>RV*Math.sin(Math.min(1.35,Math.max(-0.6,f/RV)));
const RISE=f=>RV*(1-Math.cos(Math.min(1.35,Math.max(-0.6,f/RV))));
const BOW=x=>{ const dx=Math.min(Math.abs(x-CXS),RC-1); return RC-Math.sqrt(RC*RC-dx*dx); };
const WZH=15;                         // wall block height, px

/* --- vector kit --- */
const vd=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const vx=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const vam=(a,b,s)=>[a[0]+b[0]*s, a[1]+b[1]*s, a[2]+b[2]*s];
const vm=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const vn=a=>{ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; };
const ad=(a,b)=>Math.acos(Math.max(-1,Math.min(1,vd(a,b))));
const nlerp=(a,b,t)=>vn([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]);
/* tangent at A pointing toward B */
const dirT=(A,B)=>vn(vam(B,A,-vd(B,A)));
/* Rodrigues: spin v about unit axis k by th */
const rotAbout=(v,k,th)=>{
  const c=Math.cos(th), s=Math.sin(th), kv=vx(k,v), kd=vd(k,v)*(1-c);
  return [v[0]*c+kv[0]*s+k[0]*kd, v[1]*c+kv[1]*s+k[1]*kd, v[2]*c+kv[2]*s+k[2]*kd];
};

/* --- the six faces. '#' wall · '.' pellet · ' ' open · 'o' power ·
   'D' the pen door. TOP holds the pen; BOTTOM holds your start. --- */
const F_TOP=[
'.........',
'.##...##.',
'.#.....#.',
'..##D##..',
'..#   #..',
'..#####..',
'.#.....#.',
'.##...##.',
'.........'];
const F_BOT=[
'.........',
'.##.#.##.',
'.#.....#.',
'...###...',
'.#.. ..#.',
'...###...',
'.#.....#.',
'.##.#.##.',
'.........'];
const F_SIDE=[
'.........',
'.##.#.##.',
'....#....',
'.##...##.',
'.#..o..#.',
'.##...##.',
'....#....',
'.##.#.##.',
'.........'];
const FACE_DEFS=[
  { g:F_TOP,  A:[0,1,0],  U:[1,0,0],  V:[0,0,1]  },
  { g:F_BOT,  A:[0,-1,0], U:[1,0,0],  V:[0,0,-1] },
  { g:F_SIDE, A:[1,0,0],  U:[0,0,-1], V:[0,-1,0] },
  { g:F_SIDE, A:[-1,0,0], U:[0,0,1],  V:[0,-1,0] },
  { g:F_SIDE, A:[0,0,1],  U:[1,0,0],  V:[0,-1,0] },
  { g:F_SIDE, A:[0,0,-1], U:[-1,0,0], V:[0,-1,0] }];

/* --- build the cells: centres, corners, then GEOMETRIC neighbours --- */
const CELLS=[], NB=[];
{
  const pt=(fd,jj,ii)=>vn(vam(vam(fd.A.slice(), fd.U, 2*jj/N-1), fd.V, 2*ii/N-1));
  for(let f=0;f<6;f++){
    const fd=FACE_DEFS[f];
    for(let i=0;i<N;i++) for(let j=0;j<N;j++){
      CELLS.push({ id:CELLS.length, f,i,j, ch:fd.g[i][j],
        Q:pt(fd,j+0.5,i+0.5),
        cn:[pt(fd,j,i), pt(fd,j+1,i), pt(fd,j+1,i+1), pt(fd,j,i+1)] });
    }
  }
  const idOf=(f,i,j)=>f*N*N+i*N+j;
  /* neighbours across a seam: push just past the SHARED edge midpoint
     (both faces subdivide the cube edge identically, so the true
     neighbour's centre is by construction the nearest cell centre
     beyond it — cell-size variation can't fool this) */
  const EM=[[-1,0,0,1],[1,0,3,2],[0,-1,0,3],[0,1,1,2]];
  for(let id=0;id<CELLS.length;id++){
    const c=CELLS[id], nbs=[];
    for(const [di,dj,ca,cb] of EM){
      const ni=c.i+di, nj=c.j+dj;
      if(ni>=0&&ni<N&&nj>=0&&nj<N){ nbs.push(idOf(c.f,ni,nj)); continue; }
      const em=vn(vam(c.cn[ca], c.cn[cb], 1));
      const probe=vn([c.Q[0]+(em[0]-c.Q[0])*1.6,
                      c.Q[1]+(em[1]-c.Q[1])*1.6,
                      c.Q[2]+(em[2]-c.Q[2])*1.6]);
      let best=-1, bd=-2;
      for(let k=0;k<CELLS.length;k++){
        if(k===id) continue;
        const dd=vd(probe,CELLS[k].Q);
        if(dd>bd){ bd=dd; best=k; }
      }
      nbs.push(best);
    }
    NB.push(nbs);
  }
}
const idOf=(f,i,j)=>f*N*N+i*N+j;
const START_ID=idOf(1,4,4);
const DOOR_ID=idOf(0,3,4);
const PEN_IDS=[idOf(0,4,3), idOf(0,4,4), idOf(0,4,5)];
const OUT_ID=idOf(0,2,4);                 // just outside the door
const SCATTER=[idOf(2,4,4), idOf(3,4,4), idOf(4,4,4), idOf(5,4,4)];
const PEN_SET=new Set(PEN_IDS);
const pacPass=id=>{ const ch=CELLS[id].ch; return ch!=='#' && ch!=='D' && !PEN_SET.has(id); };
/* --- THIN WALLS (Scott, 2026-08-21: "the single-thickness wall cell jumpover
   ability in pac sphere"). A wall cell is THIN when some axis THROUGH it has
   open ground at both ends — which is exactly the condition for a leap to
   have somewhere to land, so the set that draws low is the same set that can
   be crossed. There is no second rule to keep in sync.
   NB is built [i-1, i+1, j-1, j+1], so 0/1 and 2/3 are the two axes, and that
   pairing survives a seam crossing because the geometric probe walks straight
   off the face edge. A ridge on a cube corner is not special-cased: if neither
   axis is open at both ends it is simply thick, and thick is nobody's.
   Ghosts never get this. ghoPass refuses '#' outright and no ghost jumps, so
   a thin ridge is a shortcut ONLY the player has — which is the whole point of
   the idea, and why wall thickness now says something. */
const THIN=new Set();
for(let id=0;id<CELLS.length;id++){
  if(CELLS[id].ch!=='#') continue;
  const n=NB[id];
  if((pacPass(n[0])&&pacPass(n[1])) || (pacPass(n[2])&&pacPass(n[3]))) THIN.add(id);
}
const thinAcross=(id,dir)=>{        // the far side of a ridge, straight on
  if(!THIN.has(id)) return -1;
  let best=-1, bs=0.35;
  for(const nd of neighborsWithDirs(id)){
    if(!pacPass(nd.id)) continue;
    const sc=vd(nd.t,dir);
    if(sc>bs){ bs=sc; best=nd.id; }
  }
  return best;
};
const ghoPass=(id,g)=>{ const ch=CELLS[id].ch;
  if(ch==='#') return false;
  if(ch==='D'||PEN_SET.has(id)) return g.eyes||g.mode==='exit';
  return true; };

/* --- game state --- */
const GHDEF=[
  /* DE-PAC (2026-08-25): the hunters wear valley names now — names are the
     colours, per the law next door. Same posts, same personalities. */
  {col:'#ff4a4a', name:'ember', penT:0},
  {col:'#ffb0d8', name:'rose',  penT:120},
  {col:'#5ad4e8', name:'teal',  penT:480},
  {col:'#ffb35a', name:'amber', penT:900}];
const PSPD=0.0085, GSPD=0.0078, FSPD=0.0050 /* retired 2026-08-19: blue = frozen */, ESPD=0.0165;
const FRIGHT0=540;
/* --- the JUMP (Scott 2026-08-12): SPACE hops pac in a clean arc.
   Pac-Mania's gift — while airborne there is NO ghost contact either
   way (you sail over hunters, and you cannot eat frightened ghosts
   mid-air either). Movement and pellet-eating carry on underneath.
   A landing cooldown + a re-press latch stop bunny-hop immunity. --- */
const JUMP_T=34, JUMP_CD=26, JUMP_H=30, LAND_GRACE=8;
/* the leap carries ONE CELL further than walking the same frames would
   (Scott, 2026-08-19): 34 frames x 0.0085 x 0.6 = 0.173 rad = one tile
   pitch, near enough. "Not directly into a wall" comes free — movement is
   edge-graph-constrained, so a leap with no forward edge simply lands at
   the node instead of phasing into brick. */
const JUMP_CARRY=1.6;
/* THE VAULT. Same key, same arc, one extra question asked at the moment you
   press it: is there a one-cell ridge directly ahead with somewhere to land
   beyond it? If so the leap CROSSES, carrying pac over the ridge cell and
   down the far side, and the arc is flown higher and longer to cover it.
   Held as a QUEUE of cells rather than a flag, because the crossing is two
   ordinary edge moves that happen to ignore passability, and reusing the
   movement the game already has means seams, buffering and pellet-eating all
   keep working without knowing anything about it. */
const VAULT_H=1.55;               // the arc flies this much higher than a hop
/* A vault is a much bigger move than a hop and it is also a second of ghost
   immunity, so it cannot be chainable. 98 of the maze's 133 wall cells are one
   cell thick — pac mazes are built that way — which means the ridge is common
   and the COOLDOWN is what keeps it from being a free pass. Roughly a second
   between crossings: enough to use one as an escape, not enough to live in
   the air. An ordinary hop keeps the short cooldown it always had. */
const VAULT_CD=58;
let jumpT=0, jumpCd=0, jumpLatch=true, landGrace=0;
let jumpMax=JUMP_T, jumpHi=JUMP_H, vault=null, vaultCd=false;
const vaulting=()=>!!(vault && vault.length);
const jumpH=()=> jumpT>0? Math.sin(Math.PI*(1-jumpT/jumpMax))*jumpHi : 0;
let pac={a:START_ID,b:-1,t:0}, H=[1,0,0], qDir=null, qT=0, chompT=0;
let P=[0,0,1], camF=[1,0,0], _Rt=[0,-1,0];
let ghosts=[], pellets=new Set(), powers=new Set(), pellets0=0;
let score=0, lives=3, level=1, frightT=0, chain=0, modeT=0, scatter=true;
let freezeT=0, deadT=0, clearT=0, doneT=0, over=false;
let introT=0, exitLatch=true, savedPos=null;
const HINT_T=540;
let hintT=0;            // ~9s of controls, three lines taking turns (see drawHUD)
let parts=[];

const lvlMul=()=>1+(level-1)*0.08;
const pacPos=()=> pac.b<0? CELLS[pac.a].Q : nlerp(CELLS[pac.a].Q, CELLS[pac.b].Q, pac.t);
const ghostPos=g=> g.b<0? CELLS[g.a].Q : nlerp(CELLS[g.a].Q, CELLS[g.b].Q, g.t);

function fillPellets(){
  pellets.clear(); powers.clear();
  for(let id=0;id<CELLS.length;id++){
    if(CELLS[id].ch==='.') pellets.add(id);
    else if(CELLS[id].ch==='o') powers.add(id);
  }
  pellets0=pellets.size+powers.size;
}
function resetActors(){
  pac={a:START_ID,b:-1,t:0};
  P=CELLS[START_ID].Q.slice();
  H=dirT(P, CELLS[NB[START_ID].find(pacPass)].Q);
  camF=H.slice(); qDir=null;
  ghosts=GHDEF.map((d,gi)=>({
    a: gi===0? OUT_ID : PEN_IDS[gi-1], b:-1, t:0,
    dir:[1,0,0], col:d.col, name:d.name,
    penT: gi===0? 0 : d.penT,
    mode: gi===0? 'play':'pen', eyes:false, scat:SCATTER[gi]
  }));
  frightT=0; chain=0; modeT=420; scatter=true; freezeT=40;
  jumpT=0; jumpCd=0; jumpLatch=true; landGrace=0;
  jumpMax=JUMP_T; jumpHi=JUMP_H; vault=null; vaultCd=false;
}
function reset(){
  score=0; lives=3; level=1;
  camTune(VANT[0]);                    // screen 1 = the crow's-nest advantage
  fillPellets(); resetActors();
  deadT=0; clearT=0; doneT=0; over=false; introT=100; parts=[]; hintT=HINT_T;
}

/* --- movement helpers --- */
function neighborsWithDirs(id){
  const A=CELLS[id].Q;
  return NB[id].map(n=>({ id:n, t:dirT(A, CELLS[n].Q) }));
}
function pickStraight(id, dir, pass){
  let best=null, bs=0.35;
  for(const nd of neighborsWithDirs(id)){
    if(!pass(nd.id)) continue;
    const s=vd(nd.t,dir);
    if(s>bs){ bs=s; best=nd; }
  }
  return best;
}
function startMove(ent, nd){ ent.b=nd.id; ent.t=0; }
/* Measured AT THE NODE the leap will start from, not at pac's feet: the
   heading is a tangent and a tangent a whole cell away is a different vector
   on a sphere. Mid-edge that node is pac.b, and "straight on" there is the
   a->b great circle continued, which is exactly -dirT(b,a). */
function vaultAhead(){
  const node = pac.b>=0? pac.b : pac.a;
  const dir  = pac.b>=0? vm(dirT(CELLS[node].Q, CELLS[pac.a].Q), -1) : H;
  let w=-1, ws=0.35;
  for(const nd of neighborsWithDirs(node)){
    if(!THIN.has(nd.id)) continue;              // thick walls are nobody's
    const sc=vd(nd.t,dir);
    if(sc>ws){ ws=sc; w=nd.id; }
  }
  if(w<0) return null;
  const on=vm(dirT(CELLS[w].Q, CELLS[node].Q), -1);
  const land=thinAcross(w, on);
  if(land<0 || land===node) return null;
  /* long enough to still be in the air when the far side arrives — the
     remaining edge, then the ridge, then the landing, plus slack */
  const rest = pac.b>=0? (1-pac.t)*arcOf(pac.a,pac.b) : 0;
  const arc  = rest + arcOf(node,w) + arcOf(w,land);
  const frames = Math.ceil(arc/(PSPD*lvlMul()*JUMP_CARRY)) + 6;
  return {w, land, frames};
}
/* one leg of a committed crossing. Passability is not consulted, which is the
   only place in the game that is true, and it is bounded to two steps. */
function vaultStep(){
  if(!vaulting() || pac.b>=0) return false;
  const nxt=vault.shift();
  const here=pac.a;
  startMove(pac,{id:nxt}); H=dirT(CELLS[here].Q, CELLS[nxt].Q);
  return true;
}
function arcOf(a,b){ return Math.max(0.02, ad(CELLS[a].Q, CELLS[b].Q)); }

/* --- pac update --- */
function pacTick(){
  // Absolute controls. The screen frame picks the direction, never the
  // heading, so LEFT means screen-left wherever you happen to be facing.
  // _Rt is screen-right: toCam maps a +_Rt component to a larger x.
  const rightT=vn(vx(camF,P));
  let want=null;
  if(held.ArrowUp)         want=camF.slice();
  else if(held.ArrowDown)  want=vm(camF,-1);
  else if(held.ArrowRight) want=rightT;
  else if(held.ArrowLeft)  want=vm(rightT,-1);

  if(want){ qDir=want; qT=90; }            // buffer it, Pac-Man style
  if(qT>0 && --qT===0) qDir=null;

  // Doubling back is instant, the way it is in every pac game. Once H flips,
  // want agrees with it, so this cannot retrigger while the key is held.
  // ...but not out of a crossing: a reverse mid-ridge would strand pac in stone
  if(want && !vaulting() && pac.b>=0 && vd(want,H)<-0.75){
    const tmp=pac.a; pac.a=pac.b; pac.b=tmp; pac.t=1-pac.t;
    H=vm(H,-1); qDir=null;
  }

  if(pac.b<0){
    if(vaultStep()) return;
    if(qDir){
      const nd=pickStraight(pac.a, qDir, pacPass);
      if(nd){ startMove(pac,nd); H=nd.t; qDir=null; }
    }
    return;
  }
  // advance along the great circle; the heading is the exact circle
  // velocity (axis x pos) — a tangent-toward-target here degenerates
  // to noise at arrival and sends pac bouncing back over seams
  const gcAxis=vn(vx(CELLS[pac.a].Q, CELLS[pac.b].Q));
  pac.t+=PSPD*lvlMul()*(jumpT>0?JUMP_CARRY:1)/arcOf(pac.a,pac.b);
  chompT++;
  const pos=pacPos();
  H=vn(vx(gcAxis,pos));
  if(pac.t>=1){
    pac.a=pac.b; pac.b=-1; pac.t=0;
    eatAt(pac.a);
    // choose what happens at this cell: the buffered direction first, then
    // carry straight on while any direction key is still down
    const here=pac.a;
    if(vaultStep()) return;                    // over the ridge, then down it
    let nd=null;
    if(qDir){
      nd=pickStraight(here, qDir, pacPass);
      if(nd) qDir=null;
    }
    if(!nd && want) nd=pickStraight(here, H, pacPass);
    if(nd){ startMove(pac,nd); H=nd.t; }
  }
}
function eatAt(id){
  if(pellets.delete(id)){
    score+=10;
    if((pellets.size&7)===0) sfx.task && sfx.task();
    if(pellets.size===0 && powers.size===0) sphereClear();
  } else if(powers.delete(id)){
    score+=50; sfx.chest && sfx.chest();
    frightT=Math.max(120, FRIGHT0-(level-1)*60); chain=0;
    for(const g of ghosts) if(!g.eyes && g.mode==='play'){
      // frightened ghosts turn on their heels
      if(g.b>=0){ const tmp=g.a; g.a=g.b; g.b=tmp; g.t=1-g.t; }
    }
    if(pellets.size===0 && powers.size===0) sphereClear();
  }
}
function sphereClear(){
  clearT=140; freezeT=140;
  score+=500; sfx.win && sfx.win();
  if(!flags.pacsphereDone){ flags.pacsphereDone=true;
    res.gold=Math.min(999,res.gold+40);
    toast('SPHERE CLEAN — +40 gold, once and forever.');
    saveGame && saveGame();
  }
}

/* --- ghosts --- */
function roseTarget(){   /* four steps ahead of your nose — the ambusher's aim */
  let id=pac.a, d=H;
  for(let k=0;k<4;k++){
    const nd=pickStraight(id, d, x=>CELLS[x].ch!=='#');
    if(!nd) break;
    id=nd.id; d=nd.t;
  }
  return CELLS[id].Q;
}
function ghostTarget(g,gi){
  if(g.eyes) return CELLS[PEN_IDS[1]].Q;
  if(g.mode==='exit') return CELLS[OUT_ID].Q;
  if(frightT>0) return null;                       // random
  if(scatter) return CELLS[g.scat].Q;
  if(gi===0) return pacPos();
  if(gi===1) return roseTarget();
  if(gi===2) return pacPos();       // its old private 25% whim moved into WILD, where everyone has one
  return ad(ghostPos(g),pacPos())>1.1? pacPos() : CELLS[g.scat].Q;
}
/* THE WHIM (Scott 2026-08-18: "add some added randomization to monster
   movements, right now they seem mostly to just zero in on the player").
   At every junction each hunter rolls against its own wildness — a hit and
   it takes a random legal turn instead of the greedy one. Ember stays the
   professional; the others get progressively flightier. Eyes flying home
   and pen exits never wander. */
const WILD=[0.10,0.25,0.38,0.50];
function ghostTick(g,gi){
  if(g.mode==='pen'){
    if(--g.penT<=0){ g.mode='exit'; g.a= g.b>=0? g.b : g.a; g.b=-1; g.t=0; }
    return;
  }
  /* BLUE = FROZEN (Scott, 2026-08-19). A frightened ghost stops dead where
     the pellet caught it — the fright window becomes a harvest, and a ghost
     you were about to back into becomes a statue instead of a slow pursuer.
     Eyes still fly home; ghosts still emerging from the pen keep walking. */
  const spd= g.eyes? ESPD : g.mode==='exit'? GSPD : frightT>0? 0 : GSPD*lvlMul();
  if(g.b<0){
    const tgt=ghostTarget(g,gi);
    const opts=neighborsWithDirs(g.a).filter(nd=>ghoPass(nd.id,g) && nd.id!==g.prev);
    const pool=opts.length? opts : neighborsWithDirs(g.a).filter(nd=>ghoPass(nd.id,g));
    if(!pool.length) return;
    let nd;
    const wild = !g.eyes && g.mode!=='exit' && frightT<=0 && Math.random()<(WILD[gi]||0.3);
    if(!tgt || wild) nd=pool[(Math.random()*pool.length)|0];
    else { let bd=99; for(const c of pool){ const dd=ad(CELLS[c.id].Q,tgt); if(dd<bd){ bd=dd; nd=c; } } }
    g.prev=g.a; startMove(g,nd); g.dir=nd.t;
  }
  g.t+=spd/arcOf(g.a,g.b);
  if(g.t>=1){
    g.a=g.b; g.b=-1; g.t=0;
    if(g.eyes && (g.a===DOOR_ID||PEN_SET.has(g.a))){
      if(PEN_SET.has(g.a)){ g.eyes=false; g.mode='exit'; }
    }
    if(g.mode==='exit' && g.a===OUT_ID){ g.mode='play'; g.prev=-1; }
  }
}

/* --- collisions --- */
/* --- collisions. Fairness contract (Scott 2026-08-12: "make sure we're
   really going over monsters before deciding I've been killed"):
   a kill must be CERTAIN — the ghost has to genuinely overlap a GROUNDED
   pac on TWO consecutive frames (per-ghost g.ct), the radius is
   tightened to true visual overlap, and no kill can land inside the
   short grace after a jump touches down. Frightened meals stay
   instant and generous — forgiveness only ever favours the player. --- */
/* tightened again 2026-08-19 (Scott: "make sure player and monster directly
   overlap before dying"). 0.034 rad on R=430 is ~15px of arc — the bodies
   are 13px; this is genuine sprite-on-sprite overlap, not proximity. */
const KILL_R=0.034;
function collisions(){
  if(jumpT>0){ for(const g of ghosts) g.ct=0; return; }   // airborne: no contact
  const pp=pacPos();
  for(const g of ghosts){
    if(g.mode==='pen'||g.eyes){ g.ct=0; continue; }
    if(ad(pp, ghostPos(g))>KILL_R){ g.ct=0; continue; }
    if(frightT>0){
      chain=Math.min(3,chain); const pts=200*Math.pow(2,chain); chain++;
      score+=pts; g.eyes=true; g.ct=0; freezeT=22;
      sfx.coin && sfx.coin();
      burst(CXS, SURF_Y-18, '#bfe8ff', 10);
    } else {
      g.ct=(g.ct||0)+1;
      if(g.ct>=2 && landGrace===0){
        deadT=100; freezeT=100; sfx.hurt && sfx.hurt();
        return;
      }
    }
  }
}
function burst(x,y,col,n){
  for(let i=0;i<n;i++) parts.push({x,y,vx:(Math.random()-.5)*2.4,
    vy:(Math.random()-.5)*2-0.8, life:16+Math.random()*12, col});
}

/* ---------------- update ---------------- */
/* THE SCREENS MENU (Scott, 2026-08-21). S, matching STONEBREAKER's W walls,
   CONTRAPTION's Y yards and 3D PAC's S screens.

   IMPORTANT difference from the other three: there is only ONE sphere. `level`
   here is a DIFFICULTY TIER, not a different map — so a menu that just listed
   "1 2 3 4 5" would be nine identical rows and would tell the player nothing.
   Each row says what that tier actually changes, which is the only reason to
   pick one. The vantage ladder runs out after VANT.length, and the menu says
   so rather than pretending screen 8 looks different from screen 5. */
const SCREENS=8;
let scrUI=false, scrSel=0, sLatch={};
function scrDesc(n){
  const v = n<=VANT.length ? 'vantage drops to '+VANT[n-1] : 'lowest vantage';
  const sp = Math.round((1+(n-1)*0.08)*100);
  return v+'  ·  ghosts '+sp+'%';
}
function scrJump(n){
  level=n;
  camTune(VANT[Math.min(level-1, VANT.length-1)]);
  fillPellets(); resetActors();
  frightT=0; chain=0; deadT=0; clearT=0; doneT=0; over=false;
}
/* THE FLASH (Scott, 2026-08-21: "when I click Y key it flashes levels on
   contraption for a split second"). Opening the menu replaced the latch with a
   BARE object, so the very key still under his finger had no 'was down' record
   — and one frame later the menu read it as a brand-new press and closed itself.
   Stonebreaker never had this because its wall menu seeds every key it reads.
   Seed the same way: everything the menu listens for starts marked ALREADY
   DOWN, so nothing held at the moment of opening counts as a fresh press. */
function seedLatch(keys){
  const o={open:true};
  for(let i=1;i<=9;i++) o[String(i)]=1;
  for(const k of keys) o[k]=1;
  return o;
}
function scrMenuInput(){
  const press=k=>{ const d=!!held[k], was=!!sLatch[k]; sLatch[k]=d; return d&&!was; };
  if(press('ArrowUp'))   scrSel=(scrSel+SCREENS-1)%SCREENS;
  if(press('ArrowDown')) scrSel=(scrSel+1)%SCREENS;
  for(let i=0;i<SCREENS && i<9;i++) if(press(String(i+1))) scrSel=i;
  if(press('Enter')){ scrUI=false; sLatch={open:true}; scrJump(scrSel+1); return; }
  /* exitLatch too, or the ESC that closed the menu leaves the game next frame */
  if(press('Escape')||press('s')||press('S')){ scrUI=false; sLatch={open:true}; exitLatch=true; }
}
function drawScrMenu(g){
  g.fillStyle='rgba(6,6,16,.95)'; g.fillRect(0,0,RW,HUD+RH);
  g.textAlign='center'; g.font='bold 16px '+FONT; g.fillStyle='#ffe14a';
  g.fillText('THE SCREENS', RW/2, 54);
  g.font='11px '+FONT; g.fillStyle='#7f78a0';
  g.fillText('one sphere, and it gets harder — there is nowhere else to go', RW/2, 74);
  const rowH=Math.min(30, Math.floor((RH-90)/SCREENS)), top=108;
  for(let i=0;i<SCREENS;i++){
    const ry=top+i*rowH;
    if(i===scrSel){ g.fillStyle='rgba(255,225,74,.13)';
      g.fillRect(RW/2-210, ry-15, 420, 22); }
    g.font='11px '+FONT; g.textAlign='right';
    g.fillStyle= i===scrSel? '#ffe14a':'#6f6890';
    g.fillText(String(i+1), RW/2-176, ry);
    g.textAlign='left'; g.font='bold 12px '+FONT;
    g.fillStyle= (i+1)===level? '#7fe7ff' : i===scrSel? '#f2e7b8' : '#b6b0c8';
    g.fillText('SCREEN '+(i+1) + ((i+1)===level? '  ·  you are here':''), RW/2-162, ry);
    g.font='10px '+FONT; g.fillStyle= i===scrSel? '#a99f7f':'#6f6890';
    g.fillText(scrDesc(i+1), RW/2-40, ry);
  }
  g.textAlign='center'; g.font='11px '+FONT; g.fillStyle='#9a90c0';
  g.fillText('ARROWS pick  ·  1-'+SCREENS+' jump  ·  ENTER go  ·  ESC close', RW/2, HUD+RH-26);
  g.textAlign='left';
}
function update(){
  if(scrUI){ scrMenuInput(); return; }
  { const sk=held['s']||held['S'];
    if(sk && !sLatch.open){ scrUI=true; scrSel=Math.max(0,Math.min(SCREENS-1, level-1));
      sLatch=seedLatch(['ArrowUp','ArrowDown','Enter','Escape','s','S']); return; }
    if(!sk) sLatch.open=false; }
  if(introT>0){ introT--; return; }
  if(held.Escape){ if(!exitLatch){ exitLatch=true; startPacsphereTrans('out'); return; } } else exitLatch=false;
  if(doneT>0){ if(--doneT===0) startPacsphereTrans('out'); return; }

  // the vantage dial — a smooth dolly on A/Z, clamped so it can't break the rig
  if(held.a||held.A) camTune(CH+6);
  else if(held.z||held.Z) camTune(CH-6);
  if(hintT>0) hintT--;

  // The camera orientation is CARRIED, never re-aimed. camF is rotated by
  // exactly the rotation that moved us, so the maze slides under the player
  // and turning never spins the world. Screen-up keeps meaning the same
  // direction of travel, which is what makes absolute controls honest.
  //
  // This is parallel transport, so there is no pole and no place the frame
  // dies -- the price is holonomy: walk a big closed loop and the maze comes
  // back rotated. That is curvature, not a bug, and it is unavoidable on a
  // sphere. Pinning camF to a fixed world axis would trade it for two dead
  // points, and both of those land on cells you actually play through.
  {
    const Pp=P;
    P=pacPos();
    const n=vx(Pp,P), s=Math.hypot(n[0],n[1],n[2]);
    if(s>1e-12) camF=rotAbout(camF, vm(n,1/s), ad(Pp,P));
    camF=vn(vam(camF,P,-vd(camF,P)));      // re-orthogonalise against float drift
  }

  if(deadT>0){
    if(--deadT===0){
      lives--;
      if(lives<0){ over=true; doneT=200; sfx.denied && sfx.denied(); }
      else resetActors();
    }
    return;
  }
  if(clearT>0){
    if(--clearT===0){ level++; fillPellets(); resetActors();
      camTune(VANT[Math.min(level-1,VANT.length-1)]);   // each screen steps the vantage down
    }
    return;
  }
  if(freezeT>0){ freezeT--; return; }

  // the jump: press-to-hop, latched so holding SPACE never auto-rejumps
  const jk=held[' '];
  if(jk && !jumpLatch && jumpT===0 && jumpCd===0){
    const v=vaultAhead();
    if(v){
      vault=[v.w, v.land];
      jumpMax=v.frames; jumpT=jumpMax; jumpHi=JUMP_H*VAULT_H; vaultCd=true;
      if(pac.b<0) vaultStep();                 // standing at the node: go now
      sfx.chest && sfx.chest();
    } else {
      vault=null; jumpMax=JUMP_T; jumpT=JUMP_T; jumpHi=JUMP_H;
      sfx.pick && sfx.pick();
    }
  }
  jumpLatch=!!jk;
  /* a crossing may not be cut short in mid-air: pac would come down INSIDE
     the ridge, where nothing can reach it and the wall is drawn over it. The
     frame estimate is generous, this makes it certain. */
  if(jumpT>0){
    if(vaulting() && jumpT<=1) jumpT=2;
    else if(--jumpT===0){ jumpCd= vaultCd? VAULT_CD : JUMP_CD; landGrace=LAND_GRACE;
                          jumpHi=JUMP_H; jumpMax=JUMP_T; vault=null; vaultCd=false; }
  }
  else { if(jumpCd>0) jumpCd--; if(landGrace>0) landGrace--; }

  if(frightT>0){ if(--frightT===0) chain=0; }
  /* chase 1400 -> 900 (2026-08-18): 23 unbroken seconds of lock-on was most
     of why the hunters read as pure zero-in; the whim handles the rest */
  if(--modeT<=0){ scatter=!scatter; modeT= scatter? 480 : 900; }

  pacTick();
  ghosts.forEach((g,gi)=>ghostTick(g,gi));
  collisions();

  for(let i=parts.length-1;i>=0;i--){ const q=parts[i];
    q.x+=q.vx; q.y+=q.vy; q.vy+=0.04; if(--q.life<=0) parts.splice(i,1); }
}

/* ---------------- projection (MOONWALK's, verbatim) ---------------- */
function camBasis(){ _Rt=vn(vx(camF,P)); }
function toCam(Q,h){
  const u=ad(Q,P);
  let fb=1, rb=0;
  if(u>1e-9){
    const t=vam(Q,P,-vd(Q,P)); const l=Math.hypot(t[0],t[1],t[2]);
    if(l>1e-12){ fb=vd(t,camF)/l; rb=vd(t,_Rt)/l; }
  }
  const f=u*fb*R, l=u*rb*R;
  const d=CB+DSAT(f);
  if(d<24) return null;
  const s=FOC/d;
  const x=CXS+l*s;
  let y=CY0+(CH+RISE(f)-(h||0))*s;
  const w=Math.max(0,Math.min(1,(S0-s)/(S0-SH)));
  y+=BOW(x)*w;
  return { x, y, s, d };
}
function horizonPt(th,dy){
  return { x:CXS+RC*Math.sin(th), y:HY+(dy||0)+RC*(1-Math.cos(th)), s:SH };
}
function horizonPath(g,dy){
  g.arc(CXS, HY+(dy||0)+RC, RC, -Math.PI/2-0.58, -Math.PI/2+0.58);
}
const CULL=Math.cos(UH);

/* ---------------- draw ---------------- */
const STARS=[]; for(let i=0;i<120;i++)
  STARS.push({Q:vn([Math.cos(Math.asin(2*hash2(i*11+3,i*23+9)-1))*Math.sin(hash2(i*5+1,i*13+7)*TAU),
                    2*hash2(i*11+3,i*23+9)-1,
                    Math.cos(Math.asin(2*hash2(i*11+3,i*23+9)-1))*Math.cos(hash2(i*5+1,i*13+7)*TAU)]),
              h:hash2(i,17)});
function drawSky(g){
  const sg=g.createLinearGradient(0,HUD,0,HUD+RH);
  sg.addColorStop(0,'#150f2c'); sg.addColorStop(1,'#2c2050');
  g.fillStyle=sg; g.fillRect(0,HUD,RW,RH);
  for(const st of STARS){
    const dx=vd(st.Q,camF); if(dx<0.25) continue;
    const sx=CXS+vd(st.Q,_Rt)/dx*SKY_F, sy=SKY_Y-vd(st.Q,P)/dx*SKY_F;
    if(sy<HUD+2||sy>HUD+RH||sx<0||sx>RW) continue;
    const tw=0.35+0.5*Math.abs(Math.sin(frame*0.02+st.h*9));
    g.fillStyle='rgba(238,236,255,'+(0.22+st.h*0.5*tw).toFixed(2)+')';
    g.fillRect(sx|0, sy|0, 2, 2);
  }
}
function drawGround(g){
  g.beginPath(); horizonPath(g,0);
  g.lineTo(RW+60,HUD+RH+60); g.lineTo(-60,HUD+RH+60); g.closePath();
  const hg=g.createLinearGradient(0,HY-6,0,HUD+RH);
  hg.addColorStop(0,'#26224a'); hg.addColorStop(0.55,'#201c40'); hg.addColorStop(1,'#181430');
  g.fillStyle=hg; g.fill();
  g.strokeStyle='#0c0920'; g.lineWidth=3;
  g.beginPath(); horizonPath(g,0); g.stroke();
  g.strokeStyle='rgba(160,180,255,.35)'; g.lineWidth=1.4;
  g.beginPath(); horizonPath(g,2.5); g.stroke();
  g.strokeStyle='rgba(160,180,255,.07)'; g.lineWidth=16;
  g.beginPath(); horizonPath(g,11); g.stroke();
}
function quad(g,a,b,c,d){
  g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.lineTo(c.x,c.y); g.lineTo(d.x,d.y);
  g.closePath();
}
/* HEIGHT IS THE RULE, WRITTEN ON THE MAZE. A one-cell ridge stands at 40% and
   wears a paler cap; everything else is full height in the old blue. Two
   signals, not one, because height alone reads poorly at the horizon where
   the whole band is foreshortened — colour survives the curve. Nothing new
   has to be authored into the six faces: the look is derived from THIN, and
   THIN is derived from the maze, so a ridge can never lie about itself. */
const RIDGE_Z=0.40;
function drawWall(g,cell){
  const thin=THIN.has(cell.id);
  const h= thin? WZH*RIDGE_Z : WZH;
  const B=cell.cn.map(q=>toCam(q,0)), T=cell.cn.map(q=>toCam(q,h));
  if(B.some(p=>!p)||T.some(p=>!p)) return;
  // far sides first, near sides after, top last
  const edges=[0,1,2,3].map(k=>({k, d:(B[k].d+B[(k+1)%4].d)/2})).sort((a,b)=>b.d-a.d);
  for(const e of edges){
    const k=e.k, k2=(k+1)%4;
    g.fillStyle= thin? (e.d>B[k].d? '#1e5470':'#246985')
                     : (e.d>B[k].d? '#22407e':'#274b96');
    quad(g,B[k],B[k2],T[k2],T[k]); g.fill();
  }
  g.fillStyle= thin? '#5fb9d8':'#3f6cd8';
  quad(g,T[0],T[1],T[2],T[3]); g.fill();
  g.strokeStyle='#0c0920'; g.lineWidth=Math.max(0.8,1.3*T[0].s);
  g.stroke();
  if(thin){                                    // a bright cap line down the crown
    g.strokeStyle='rgba(190,240,255,.55)'; g.lineWidth=Math.max(0.8,1.1*T[0].s);
    g.beginPath();
    g.moveTo((T[0].x+T[1].x)/2,(T[0].y+T[1].y)/2);
    g.lineTo((T[2].x+T[3].x)/2,(T[2].y+T[3].y)/2);
    g.stroke();
  }
}
function drawDoor(g,cell){
  const B=cell.cn.map(q=>toCam(q,6));
  if(B.some(p=>!p)) return;
  g.fillStyle='#ffb0d8';
  quad(g,B[0],B[1],B[2],B[3]); g.fill();
  g.strokeStyle='#0c0920'; g.lineWidth=1; g.stroke();
}
function drawGhostAt(g,gh){
  const p=toCam(ghostPos(gh),0); if(!p) return null;
  return {d:p.d, fn:()=>{
    const s=p.s, fl= frightT>0 && frightT<120 && (frame>>3)%2;
    const w=9*s, h=11*s;
    if(!gh.eyes){
      g.fillStyle= gh.eyes? 'transparent' : frightT>0 && gh.mode==='play'? (fl?'#e8e8ff':'#3a3ae8') : gh.col;
      g.beginPath();
      g.arc(p.x,p.y-h*0.9,w,Math.PI,0);
      const yb=p.y-1*s;
      g.lineTo(p.x+w,yb);
      for(let k=2;k>=-2;k--) g.lineTo(p.x+k*w/2.5, yb + ((k+2)%2? 0:3.2*s));
      g.closePath(); g.fill();
      g.strokeStyle='#0c0920'; g.lineWidth=Math.max(0.8,1.2*s); g.stroke();
    }
    // eyes look where the ghost goes
    const ex=Math.max(-1,Math.min(1, vd(gh.dir,_Rt)))*1.6*s;
    for(const off of [-3.4*s, 3.4*s]){
      g.fillStyle='#fff';
      g.beginPath(); g.ellipse(p.x+off,p.y-h,2.6*s,3.2*s,0,0,7); g.fill();
      g.fillStyle='#2a3ae0';
      g.beginPath(); g.arc(p.x+off+ex,p.y-h+0.8*s,1.4*s,0,7); g.fill();
    }
    if(frightT>0 && !gh.eyes && gh.mode==='play'){
      g.strokeStyle= fl? '#3a3ae8':'#e8e8ff'; g.lineWidth=1.1*s;
      g.beginPath();
      for(let k=-3;k<=3;k++){ const xx=p.x+k*2.2*s, yy=p.y-4.5*s+((k%2)? -1.6*s:0);
        k===-3? g.moveTo(xx,yy):g.lineTo(xx,yy); }
      g.stroke();
    }
  }};
}
/* THE ROLLER (Scott, 2026-08-19: "more of a rolling BB8 type thing").
   Seen from behind: a white ball that visibly ROLLS AWAY — its orange
   panel rings climb up and over the sphere as it moves — with a free-
   floating dome head that keeps its own counsel on top. The roll angle
   rides chompT, which already advances only while pac moves, so the ball
   stops rolling the instant the player does. */
function drawPac(g){
  if(deadT>0){
    // the ball shrinks; the dome pops free and sails up — droids die tidily
    const q=deadT/100;
    g.fillStyle='#e8e4dc';
    g.beginPath(); g.arc(CXS,SURF_Y-13,13*q,0,7); g.fill();
    g.strokeStyle='#0c0920'; g.lineWidth=1.6; g.stroke();
    g.fillStyle='#d4d0c8';
    g.beginPath(); g.arc(CXS,SURF_Y-24-(1-q)*46,7*Math.max(0.3,q),Math.PI,0); g.fill();
    return;
  }
  const jh=jumpH(), by=SURF_Y-13-jh;
  // the shadow stays on the ground, shrinking + fading with height
  const shq=1-(jh/JUMP_H)*0.45;
  g.fillStyle='rgba(6,4,16,'+(0.35-(jh/JUMP_H)*0.22).toFixed(2)+')';
  g.beginPath(); g.ellipse(CXS,SURF_Y+2,11*shq,3.2*shq,0,0,7); g.fill();
  const roll=chompT*0.30;
  // the ball
  g.fillStyle='#eeeae2';
  g.beginPath(); g.arc(CXS,by,13,0,7); g.fill();
  // panel rings, clipped to the ball, rolling up-and-over as it travels
  g.save(); g.beginPath(); g.arc(CXS,by,12.4,0,7); g.clip();
  for(let i=0;i<3;i++){
    const a=roll+i*2.094;
    const vy=Math.cos(a), face=Math.sin(a);          // face>0 = on the visible half
    if(face<=0.05) continue;
    const py=by+vy*9.5, sc=0.5+face*0.5;
    g.strokeStyle='rgba(230,140,50,'+(0.35+face*0.55).toFixed(2)+')';
    g.lineWidth=2.2*sc;
    g.beginPath(); g.arc(CXS+((i%2)?4:-4), py, 5.5*sc, 0, 7); g.stroke();
    g.fillStyle='rgba(150,150,160,'+(0.5*face).toFixed(2)+')';
    g.beginPath(); g.arc(CXS+((i%2)?4:-4), py, 1.6*sc, 0, 7); g.fill();
  }
  // one equator line for the roll to read against
  g.strokeStyle='rgba(190,120,45,.45)'; g.lineWidth=1.6;
  g.beginPath(); g.ellipse(CXS,by+Math.cos(roll*0.7)*4,12,4.5,0,0,7); g.stroke();
  g.restore();
  g.strokeStyle='#0c0920'; g.lineWidth=1.8;
  g.beginPath(); g.arc(CXS,by,13,0,7); g.stroke();
  // the dome head — floats level while the ball spins under it
  const wob=Math.sin(chompT*0.18)*1.4;
  g.fillStyle='#dcd8d0';
  g.beginPath(); g.arc(CXS+wob,by-12.5,7.2,Math.PI,0); g.closePath(); g.fill();
  g.strokeStyle='#0c0920'; g.lineWidth=1.4; g.stroke();
  g.fillStyle='#8890a0'; g.fillRect(CXS+wob-6.5,by-13.6,13,1.8);
  g.strokeStyle='#9aa0ac'; g.lineWidth=1.1;                       // antennae
  g.beginPath(); g.moveTo(CXS+wob+2,by-19.5); g.lineTo(CXS+wob+2,by-25); g.stroke();
  g.beginPath(); g.moveTo(CXS+wob-3,by-19.5); g.lineTo(CXS+wob-3,by-23); g.stroke();
}
/* --- REAR GLOW (Scott, 2026-08-19). Geometry can only show ~1 tile
   astern (see the camera note), so the rest of "about to back into a
   monster" is carried by telegraph: any hunting ghost within ~3 tiles
   BEHIND the player blooms its own colour up from the bottom screen edge
   at its true bearing, swelling as it closes. Frightened and penned
   ghosts stay dark — the warning means teeth, or it means nothing. --- */
const REAR_TILES=3.2, TILEPX=(Math.PI/2)/N*R;
function rearArc(Q){
  const u=ad(Q,P);
  let fb=1, rb=0;
  if(u>1e-9){
    const t=vam(Q,P,-vd(Q,P)); const l2=Math.hypot(t[0],t[1],t[2]);
    if(l2>1e-12){ fb=vd(t,camF)/l2; rb=vd(t,_Rt)/l2; }
  }
  return { f:u*fb*R, l:u*rb*R };
}
function drawRearGlows(g){
  if(deadT>0) return;
  const LIM=REAR_TILES*TILEPX;
  for(const gh of ghosts){
    if(gh.mode==='pen'||gh.eyes||frightT>0) continue;
    const c=rearArc(ghostPos(gh));
    if(c.f>-14 || c.f<-LIM) continue;                 // not astern, or too far
    const q=1+c.f/LIM;                                // 0 far .. 1 at the heels
    const x=Math.max(26,Math.min(RW-26,CXS+c.l*1.15));
    const rg=g.createRadialGradient(x,RH+HUD,4,x,RH+HUD,46+q*44);
    rg.addColorStop(0,gh.col); rg.addColorStop(1,'rgba(0,0,0,0)');
    g.save(); g.globalAlpha=0.16+q*0.34; g.fillStyle=rg;
    g.beginPath(); g.arc(x,RH+HUD,46+q*44,Math.PI,0,true); g.fill();
    g.globalAlpha=0.5+q*0.5; g.fillStyle=gh.col;
    g.beginPath(); g.arc(x,RH+HUD-3,2.2+q*2.2,0,7); g.fill();
    g.restore();
  }
}

/* --- threat telegraphs (Scott 2026-08-12: oncoming monsters were too
   startling; refined same day to the HORIZON GLOW). A ghost that keeps
   CLOSING on the player announces itself in its own colour: while it is
   still beyond the curve, a LOCALIZED glow blooms up from the exact
   horizon point where it will crest — a ~50px dome plus a bright seed
   on the horizon line, small enough to identify a single monster and
   where it's coming from. Once visible, a thin down-arrow hovers over
   the ghost itself, fading out inside 0.45 rad where it's obvious
   anyway. Hysteresis (gh.thr) stops corner-turn flicker. Frightened
   ghosts are prey and eyes are harmless — no telegraphs for either. --- */
const CREST=UH*0.92;
const hexRGB=h=>parseInt(h.slice(1,3),16)+','+parseInt(h.slice(3,5),16)+','+parseInt(h.slice(5,7),16);
function drawThreatArrows(g){
  if(deadT>0||doneT>0||clearT>0) return;
  for(const gh of ghosts){
    if(gh.mode==='pen'||gh.eyes||(frightT>0&&gh.mode==='play')){ gh.thr=0; gh.lastU=undefined; continue; }
    const Q=ghostPos(gh), u=ad(Q,P);
    const closing = gh.lastU!==undefined && u<gh.lastU-1e-6;
    gh.lastU=u;
    gh.thr = closing? Math.min(30,(gh.thr||0)+1) : Math.max(0,(gh.thr||0)-2);
    if(gh.thr<=8) continue;
    if(u>CREST){                      // beyond the curve: the horizon glow
      if(u>CREST+0.55) continue;
      const tt=dirT(P,Q);
      const Qh=vn(vam(vm(P,Math.cos(CREST)), tt, Math.sin(CREST)));
      const p=toCam(Qh,0); if(!p) continue;
      const al=0.9*(1-(u-CREST)/0.55);
      const rgb=hexRGB(gh.col), pu=0.7+0.3*Math.sin(frame*0.14);
      const gl=g.createRadialGradient(p.x,p.y+4,1,p.x,p.y+4,26);
      gl.addColorStop(0,'rgba('+rgb+','+(0.55*al*pu).toFixed(2)+')');
      gl.addColorStop(1,'rgba('+rgb+',0)');
      g.fillStyle=gl;
      g.beginPath(); g.arc(p.x,p.y+4,26,0,7); g.fill();
      g.strokeStyle='rgba('+rgb+','+(0.85*al).toFixed(2)+')';
      g.lineWidth=2.4; g.lineCap='round';
      g.beginPath(); g.moveTo(p.x-9,p.y+1); g.lineTo(p.x+9,p.y+1); g.stroke();
      continue;
    }
    // visible: a thin down-arrow over the ghost itself
    if(u<0.45) continue;              // close enough to be obvious — no clutter
    const p=toCam(Q,26); if(!p) continue;
    const al=0.85*Math.min(1,(u-0.45)/0.3);
    const s=Math.max(0.5,p.s), bob=Math.sin(frame*0.18)*2.2;
    const x=p.x, y=p.y-6*s+bob;
    g.globalAlpha=al;
    g.strokeStyle=gh.col; g.lineWidth=1.6; g.lineCap='round';
    g.beginPath(); g.moveTo(x,y-14*s); g.lineTo(x,y); g.stroke();
    g.beginPath(); g.moveTo(x-4*s,y-5*s); g.lineTo(x,y); g.lineTo(x+4*s,y-5*s); g.stroke();
    g.globalAlpha=1;
  }
}
function drawMiniMap(g){
  const cx=RW-44, cy=HUD+50, r=24;
  g.fillStyle='rgba(14,10,30,.66)';
  g.beginPath(); g.arc(cx,cy,r+9,0,7); g.fill();
  g.strokeStyle='rgba(255,225,74,.5)'; g.lineWidth=1.6;
  g.beginPath(); g.arc(cx,cy,r,0,7); g.stroke();
  // pellets remaining, as a rim arc
  const frac=(pellets.size+powers.size)/Math.max(1,pellets0);
  g.strokeStyle='rgba(255,225,74,.8)'; g.lineWidth=2;
  g.beginPath(); g.arc(cx,cy,r+5,-Math.PI/2,-Math.PI/2+frac*TAU); g.stroke();
  const right=vx(camF,P);
  const pt=Q=>{
    const dd=ad(Q,P);
    const t=vam(Q,P,-vd(Q,P)); const l=Math.hypot(t[0],t[1],t[2]);
    const b= l<1e-9? 0 : Math.atan2(vd(t,right)/l, vd(t,camF)/l);
    const rr=dd/Math.PI*r;
    return [cx+Math.sin(b)*rr, cy-Math.cos(b)*rr];
  };
  { const [x,y]=pt(CELLS[DOOR_ID].Q);                 // the pen
    g.fillStyle='#ffb0d8'; g.fillRect(x-2,y-2,4,4); }
  g.fillStyle='#ffe14a';
  for(const id of powers){ if((frame>>3)%2){ const [x,y]=pt(CELLS[id].Q); g.fillRect(x-2.2,y-2.2,4.4,4.4); } }
  for(const gh of ghosts){
    if(gh.mode==='pen') continue;
    const [x,y]=pt(ghostPos(gh));
    g.fillStyle= gh.eyes? '#ffffff' : frightT>0? '#3a3ae8' : gh.col;
    g.fillRect(x-1.8,y-1.8,3.6,3.6);
  }
  if((frame>>3)%2){ g.fillStyle='#ffe14a'; g.beginPath(); g.arc(cx,cy,2.4,0,7); g.fill(); }
  g.strokeStyle='rgba(255,255,255,.6)'; g.lineWidth=1.4;
  g.beginPath(); g.moveTo(cx,cy); g.lineTo(cx,cy-6); g.stroke();
}
function drawHUDbar(g){
  const hg=g.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#241e46'); hg.addColorStop(1,'#130f26');
  g.fillStyle=hg; g.fillRect(0,0,RW,HUD);
  g.fillStyle='rgba(255,225,74,.4)'; g.fillRect(0,HUD-2,RW,2);
  g.textAlign='left'; g.font='bold 14px '+FONT; g.fillStyle='#ffe14a';
  g.fillText('WAKA SPHERE',12,20);
  /* fades after ~9s — with 'A/Z vantage' added it was overprinting LEVEL,
     the same collision class the moonwalk HUD had (2026-08-18) */
  /* THE HINT ROTATES rather than running long. Probe-rendered 2026-08-21 while
     adding the vault line: the single 76-character string reached x407 and
     printed straight through LEVEL at x280 — the collision the comment above
     claimed was already handled. Three short lines take turns in the one slot,
     each safely clear of the centre column, and each gets about three seconds. */
  if(hintT>0){
    const HINTS=[['#9a90c0','UP run · L/R turn · DOWN reverse'],
                 ['#7fc8e0','SPACE jumps — and CLEARS a low pale ridge'],
                 ['#9a90c0','A/Z vantage · S screens · ESC leave']];
    const seg=Math.min(HINTS.length-1, Math.floor((HINT_T-hintT)/(HINT_T/HINTS.length)));
    g.globalAlpha=Math.min(1,hintT/60);
    g.font='11px '+FONT; g.fillStyle=HINTS[seg][0];
    g.fillText(HINTS[seg][1],12,37);
    g.globalAlpha=1;
  }
  g.textAlign='center'; g.font='bold 12px '+FONT; g.fillStyle='#cfd6ff';
  g.fillText((pellets.size+powers.size)+' left', RW/2-40, 21);
  g.fillStyle='#8fc4ff'; g.font='bold 11px '+FONT;
  g.fillText('LEVEL '+level, RW/2-40, 36);
  for(let i=0;i<3;i++){
    g.fillStyle= i<lives? '#ffe14a' : '#3a3452';
    g.beginPath(); g.arc(RW/2+60+i*17,16,6,0.6,5.7); g.lineTo(RW/2+60+i*17,16);
    g.closePath(); g.fill();
  }
  g.textAlign='right'; g.font='bold 16px '+FONT; g.fillStyle='#ffe9a8';
  g.fillText(String(score).padStart(5,'0'), RW-12, 22);
}

function draw(){
  const g=ctx;
  if(scrUI){ drawScrMenu(g); return; }
  camBasis();
  drawSky(g);
  drawGround(g);

  /* the maze: floors + pellets flat, then walls/door/ghosts/pac
     painter-sorted far-to-near over the curve */
  const plist=[];
  for(let id=0;id<CELLS.length;id++){
    const cell=CELLS[id];
    if(vd(cell.Q,P)<CULL) continue;
    if(cell.ch==='#'){
      const c0=toCam(cell.Q,0); if(!c0) continue;
      plist.push({d:c0.d, fn:()=>drawWall(g,cell)});
      continue;
    }
    // floor tint — a soft checker so the ground visibly turns
    const B=cell.cn.map(q=>toCam(q,0));
    if(B.every(Boolean)){
      g.fillStyle= ((cell.f+cell.i+cell.j)%2)? 'rgba(160,180,255,.05)':'rgba(10,6,24,.10)';
      quad(g,B[0],B[1],B[2],B[3]); g.fill();
    }
    if(cell.ch==='D'){ const c0=toCam(cell.Q,0); if(c0) plist.push({d:c0.d, fn:()=>drawDoor(g,cell)}); }
    if(pellets.has(id)){
      const p=toCam(cell.Q,4);
      if(p){ g.fillStyle='#ffe9a8'; g.beginPath(); g.arc(p.x,p.y,2.3*p.s,0,7); g.fill(); }
    } else if(powers.has(id)){
      const p=toCam(cell.Q,7);
      if(p){                          // MUCH bigger (Scott 2026-08-12)
        const pu=0.6+0.4*Math.sin(frame*0.12);
        const gl=g.createRadialGradient(p.x,p.y,1,p.x,p.y,20*p.s);
        gl.addColorStop(0,'rgba(255,179,90,'+(0.55*pu).toFixed(2)+')');
        gl.addColorStop(1,'rgba(255,179,90,0)');
        g.fillStyle=gl; g.beginPath(); g.arc(p.x,p.y,20*p.s,0,7); g.fill();
        g.fillStyle='#ffb35a';
        g.beginPath(); g.arc(p.x,p.y,(8+pu*2.6)*p.s,0,7); g.fill();
        g.strokeStyle='#0c0920'; g.lineWidth=1.4; g.stroke();
        g.fillStyle='rgba(255,240,200,.75)';
        g.beginPath(); g.arc(p.x-2.6*p.s,p.y-2.6*p.s,2.2*p.s,0,7); g.fill();
      }
    }
  }
  for(const gh of ghosts){
    if(gh.mode==='pen'){
      const e=drawGhostAt(g,gh); if(e) plist.push(e);
      continue;
    }
    const e=drawGhostAt(g,gh); if(e) plist.push(e);
  }
  plist.push({d:CB, fn:()=>drawPac(g)});
  plist.sort((a,b)=>b.d-a.d);
  for(const it of plist) it.fn();

  for(const q of parts){
    g.globalAlpha=Math.min(1,q.life/12);
    g.fillStyle=q.col; g.fillRect(q.x,q.y,2.4,2.4);
    g.globalAlpha=1;
  }
  drawThreatArrows(g);
  drawRearGlows(g);
  drawMiniMap(g);
  drawHUDbar(g);

  if(introT>0){
    g.globalAlpha=Math.min(1,introT/40); g.textAlign='center';
    g.font='bold 22px '+FONT; g.fillStyle='#ffe14a';
    g.fillText('WAKA SPHERE', RW/2, HUD+150);
    g.font='12px '+FONT; g.fillStyle='#d8cfe8';
    g.fillText('The maze has no edges. Eat it all.', RW/2, HUD+172);
    g.globalAlpha=1;
  }
  if(clearT>0){
    g.textAlign='center'; g.font='bold 22px '+FONT; g.fillStyle='#ffe14a';
    g.fillText('SPHERE CLEAN', RW/2, HUD+150);
  }
  if(doneT>0){
    g.fillStyle='rgba(8,4,20,.72)'; g.fillRect(0,HUD,RW,RH);
    g.textAlign='center'; g.font='bold 24px '+FONT; g.fillStyle='#ff9a9a';
    g.fillText('THE SPHERE KEEPS YOU', RW/2, HUD+RH/2-8);
    g.font='12px '+FONT; g.fillStyle='#d8cfe8';
    g.fillText('Score '+score+' · Level '+level, RW/2, HUD+RH/2+16);
  }
}

/* ---------------- API ---------------- */
window.PacsphereLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    reset();
    exitLatch=true;
    toast('A pac maze with no edges at all.');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; }
    else loadScreen(5);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw,
  _t:{ scrMenuInput, drawScrMenu, scrJump, SCREENS,
       get scrUI(){return scrUI;}, set scrUI(v){scrUI=v;},
       get scrSel(){return scrSel;}, set scrSel(v){scrSel=v;},
       get level(){return level;},
       get pac(){return pac;}, get H(){return H.slice();}, get ghosts(){return ghosts;},
       get camF(){return camF.slice();}, get camP(){return P.slice();},
       get pellets(){return pellets;}, get powers(){return powers;}, get pellets0(){return pellets0;},
       get score(){return score;}, get lives(){return lives;}, get level(){return level;},
       get frightT(){return frightT;}, set frightT(v){frightT=v;},
       get deadT(){return deadT;}, get clearT(){return clearT;},
       get doneT(){return doneT;}, get over(){return over;}, get freezeT(){return freezeT;},
       CELLS, NB, N, START_ID, DOOR_ID, PEN_IDS, OUT_ID, SCATTER,
       PSPD, GSPD, FRIGHT0, RC,
       /* UH/HY ride the vantage now — live getters, never load-time snapshots */
       get UH(){return UH;}, get HY(){return HY;}, get CH(){return CH;}, get CY0(){return CY0;},
       camTune, VANT, CH_MIN, CH_MAX, WILD, SURF_Y, S0,
       get scatter(){return scatter;}, get modeT(){return modeT;},
       ad, vd, sph:(la,lo)=>[Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo)],
       idOf, pacPass, ghoPass, pacPos, ghostPos:g=>ghostPos(g),
       horizonPt, toCam(Q,h){ camBasis(); return toCam(Q,h); },
       placePac(id,dirId){ pac={a:id,b:-1,t:0}; P=CELLS[id].Q.slice();
         if(dirId!==undefined){ H=dirT(CELLS[id].Q, CELLS[dirId].Q); camF=H.slice(); } },
       placeGhost(gi,id){ const g2=ghosts[gi]; g2.a=id; g2.b=-1; g2.t=0; g2.mode='play'; g2.penT=0; g2.prev=-1; },
       get jumpT(){return jumpT;}, get jumpCd(){return jumpCd;},
       get landGrace(){return landGrace;},
       JUMP_T, JUMP_CD, JUMP_H, LAND_GRACE, KILL_R, jumpH,
       THIN, thinAcross, vaultAhead, vaultStep, VAULT_H, VAULT_CD, RIDGE_Z, neighborsWithDirs,
       get vault(){return vault;}, get jumpMax(){return jumpMax;}, get jumpHi(){return jumpHi;},
       clearFreeze(){ freezeT=0; },
       skipIntro(){ introT=0; },
       reset }
};

})();
