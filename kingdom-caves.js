"use strict";
/* ============================================================
   GRISHNAK — MONTY ZOOM (side-view Montezuma layer)
   Loaded by newgame2.html after the main engine. Shares the
   global player (PL), hearts, resources, audio, and helpers.
   Overworld = plan view; caverns = cutaway section view.
   Chars: # rock  = slab  H ladder  E exit rope  _ shimmy rope
          ^ spikes  W water  g gem  s skull  c chest  h heart  @ spawn
          b pushable crate (Sokoban-style: shove it under a floating
          gem cluster, then climb on top — out of reach until you do)
          Y derelict ship — walk up to board, short jump-in animation,
          hands off to window.AsteroidsLayer via startLayerTrans.
          NO Y ON ANY MAP since 2026-08-23: the wreck moved to the
          VILLAGE FIELDS in the overworld. The machinery stays for the
          day a map wants a ship again.
          R swing rope — a fixed ceiling anchor, NOT auto-grab like
          the old shimmy bar. Jump near its hanging end and press
          SPACE to grab, hold LEFT/RIGHT to pump a real pendulum
          swing, SPACE again to let go with your actual momentum
          (chains into a jump-arc, can grab a second rope mid-air).
          — Montezuma-original action set (Scott 2026-08-09) —
          C climbable CHAIN (climb through floors; its top is standable)
          D BLINK-STONE — pale-blue floor that is solid, flickers a
            warning, then is GONE for a beat (the original's
            disappearing floors)
          < > CONVEYOR BELTS — the floor itself has opinions
          Z LASER GATE — bites on a beat; walk through between flashes
          — the Dripstone set (Scott 2026-08-18: "fragile falling
            stalactite screen") —
          V FRAGILE STALACTITE — pass beneath and it TREMBLES (the
            telegraph), then falls; a crash sets its neighbours off.
            Where it lands it leaves standable RUBBLE ('u' at runtime) —
            crash two onto the spike bed and the hazard becomes the
            bridge. The ceiling resets when you re-enter the room.
          O CREVICE — a crack in the Flooded Hollow's floor; stand on
            it and press DOWN to squeeze through to room 7, which sits
            at grid slot (0,2) so the ordinary climb-out-the-top
            transition returns you to the Hollow with NO special code.
   ============================================================ */
(function(){

/* THE ORIGINAL'S LOOK (Scott, 2026-08-18, from two reference videos): rooms
   are BLACK VOIDS CARVED OUT OF A SOLID BRICK MASS. Flat colour, no gradients,
   no rim light, no vignette — the flatness IS the look, and Scott's own 8-bit
   rule names this exact layer as the place the constraint is the charm. One
   brick palette per room, the way the original recoloured its mass per screen. */
const CAVEPAL=[
  {base:'#b5766b', hi:'#c68a7d', lo:'#a5685e', mortar:'#54281f'},  // salmon
  {base:'#9d7f36', hi:'#b2934c', lo:'#8d712e', mortar:'#453410'},  // ochre
  {base:'#8b8b8b', hi:'#9d9d9d', lo:'#7d7d7d', mortar:'#3a3a3a'},  // stone grey
  {base:'#6a7c94', hi:'#7c90aa', lo:'#5e708a', mortar:'#28313e'},  // blue-grey
  {base:'#9a574a', hi:'#ae6759', lo:'#8a4c40', mortar:'#3e1c15'},  // dark red
  {base:'#5a8a7c', hi:'#6a9e8e', lo:'#4f7c6f', mortar:'#20382f'}   // teal
];
function cavePal(){ return CAVEPAL[cur%CAVEPAL.length]; }

const CGW=3, CGH=2;              // cave grid 3x2
const GRAVC=0.5, JUMPC=-8.8, SPDC=2.4, CLIMBC=2.3, HANGC=1.5;
const ROPE_LEN=170, ROPE_GRAV=0.010, ROPE_PUMP=0.0021, ROPE_DAMP=0.996, ROPE_MAXVEL=0.10, ROPE_MAXANG=1.45, GRAB_R=26;

//CAVEMAPS-START
const CAVES=[
{ name:"THE DESCENT", map:[
"####################",
"#...E..............#",
"#...E..............#",
"#...E..............#",
"#...E..............#",
"#...E..............#",
"#...E..............#",
"#...E..............#",
"#...E...............",
"#...@......g........",
"#..............H....",
"###############H####"]},
{ name:"SKULL RUN", map:[
"####################",
"#...Z..........Z...#",
"#.g.Z..........Z.g.#",
"#=C==.DDDDDDDD.==C=#",
"#.C..............C.#",
"#.C.....gg.......C.#",
"#.C..<<<<>>>>....C.#",
"#.C..............C.#",
"..C..............C..",
"..C..............C..",
"..C.s...^^^^...s.C..",
"####################"]},
{ name:"SHIMMY GALLERY", map:[
"####################",
"#..................#",
"#....R....R........#",
"#..................#",
"#..................#",
"#..................#",
"#..................#",
"#.......g..g.k.....#",
"...................#",
"..====.....===.....#",
"......^^^^^.....H..#",
"################H###"]},
{ name:"FLOODED HOLLOW", map:[
"###############H####",
"##........#..R.H...#",
"##....c...#....H...#",
"##....ggg......H...#",
"##.b...b..#....H...#",
"#.========.....H...#",
"#.....g........H...#",
"#....===.......H...#",
"#..............H....",
"#.........gg...H....",
"#..WWWWWW..O...H....",
"####################"]},
{ name:"BONE PIT", map:[
"####################",
"#..................#",
"#.....R......R.....#",
"#........h.........#",
"#.......====.......#",
"#DDDD..........DDDD#",
"#.g..............g.#",
"#>>>>.........<<<<.#",
"....................",
"..==....====....==..",
".....^^.s..s.^^.....",
"####################"]},
{ name:"TREASURE VAULT", map:[
"################H###",
"#...............H..#",
"#...............H..#",
"#...............H..#",
"#...............H..#",
"#...............H..#",
"#........g......H..#",
"#...............H..#",
"....g...c..g....H..#",
".......====.....H..#",
"................H..#",
"####################"]},
/* THE DRIPSTONE GALLERY (7) — under the Flooded Hollow, reached ONLY by the
   crevice. Grid slot (0,2): sealed on every edge except the rope at c12,
   whose top-exit lands you back in the Hollow by the ORDINARY transition
   math. The spike bed is 4 wide — unjumpable — until the two stalactites
   above it are baited down to become the bridge. */
{ name:"THE DRIPSTONE GALLERY", map:[
"############E#######",
"#.V..V..V...E..V...#",
"#...........E......#",
"#...........E......#",
"#..g...............#",
"#====....==========#",
"#...V......VV....V.#",
"#..................#",
"#.......g..........#",
"#..................#",
"#.g.......^^^^.g.c.#",
"####################"]}
];
//CAVEMAPS-END

let cur=0, cgrid=[], gems=[], skulls=[], chest=null, heart=null, ckey=null, crates=[], ship=null, ropes=[], zappers=[];
let stals=[], crevice=null, crevLatch=false;   // the Dripstone set
let cvy=0, onGround=false, climb=false, hang=false, hangRow=0, cLatch=false, runT=0;
let swingRope=null, swAngle=0, swVel=0, launchVX=0, spaceWasHeld=false, regrabT=0;
let entry={x:0,y:0,climb:false};
let savedPos=null, teaseCooldown=0, spawnPt={x:4*T+16,y:3*T};
const collected=new Set();
let chestsOpen=new Set(), heartTaken=false;   // per-room chest state (was one shared boolean — opening one chest used to open them all)
let boarding=0, boardFrom={x:0,y:0};
const roomHinted=new Set();
const ROOM_HINTS={
  4:'The heart hangs high: swing a rope to it, or run the blinking shelves. The pit floor walks out BOTH sides.',
  6:'The ceiling is rotten — what trembles will fall, and what falls can be STOOD ON.'
};
/* ---------------- THE DRIPSTONE SET ---------------- */
const STAL_LEN=22, STAL_TREM=38, STAL_TRIG_X=68, STAL_TRIG_Y=5*T, STAL_CASC=84;
function stalTick(){
  for(let i=stals.length-1;i>=0;i--){
    const s=stals[i], sx=s.c*T+16;
    if(s.state===0){
      /* the bait: a body passing BENEATH (never above — platform walkers on
         the far side of the rock are safe) wakes it */
      if(Math.abs(PL.x-sx)<STAL_TRIG_X && PL.y>s.y+STAL_LEN &&
         PL.y-(s.y+STAL_LEN)<STAL_TRIG_Y){
        s.state=1; s.trem=STAL_TREM; beep(160,90,0.12,'square',0.08);
      }
    } else if(s.state===1){
      if(s.trem%9===0) puff(sx+(Math.random()*8-4), s.y+STAL_LEN, '#c8bfae', 1);
      if(--s.trem<=0){ s.state=2; s.vy=0; }
    } else if(s.state===2){
      s.vy+=GRAVC*0.85; s.y+=s.vy;
      /* a falling spike is a hazard the telegraph already warned about */
      if(PL.iframes<=0 && Math.abs(PL.x-sx)<12 &&
         PL.y>s.y-2 && PL.y-26<s.y+STAL_LEN) hurt(1);
      const tipR=Math.floor((s.y+STAL_LEN)/T);
      const ch= tipR<ROWS? cgrid[tipR][s.c] : '#';
      if(ch==='^' || csolid(ch) || tipR>=ROWS){
        /* the crash: spikes are CAPPED by the rubble (the hazard becomes the
           bridge); on solid ground the stub stands in the tile above — unless
           the player's own tile, then it just shatters */
        let placed=false;
        if(ch==='^'){ cgrid[tipR][s.c]='u'; placed=true; }
        else {
          const rr2=tipR-1;
          const pc=Math.floor(PL.x/T), pr=Math.floor((PL.y-2)/T);
          if(rr2>0 && cgrid[rr2][s.c]==='.' && !(pc===s.c && pr===rr2)){
            cgrid[rr2][s.c]='u'; placed=true;
          }
        }
        puff(sx, s.y+STAL_LEN, '#d8d3c8', 9);
        beep(70,120,0.2,'square',0.14);
        stals.splice(i,1);
        /* the crash shakes the ceiling: neighbours within reach let go too —
           deliver one footstep, watch the gallery come down in a wave */
        for(const s2 of stals) if(s2.state===0 && Math.abs(s2.c*T+16-sx)<STAL_CASC){
          s2.state=1; s2.trem=Math.round(16+Math.abs(s2.c*T+16-sx)*0.22);
        }
        void placed;
      }
    }
  }
  /* the crevice: DOWN squeezes you through to the gallery below */
  if(crevice){
    const cx2=crevice.c*T+16;
    const d=dirHeld();
    if(d.y>0 && onGround && Math.abs(PL.x-cx2)<15 && Math.abs(PL.y-(crevice.r+1)*T)<8){
      if(!crevLatch){
        crevLatch=true;
        loadCave(6);
        PL.x=12*T+16; PL.y=2*T; cvy=1.5; climb=false; hang=false;
        entry={x:PL.x, y:PL.y, climb:false}; PL.iframes=50;
        beep(140,200,0.25,'sine',0.12);
      }
    } else if(d.y<=0) crevLatch=false;
  } else crevLatch=false;
}

function ctile(px,py){
  const c=Math.floor(px/T), r=Math.floor(py/T);
  if(c<0||c>=COLS||r<0||r>=ROWS) return '.';
  return cgrid[r][c];
}
/* the Montezuma clocks: blink-stone and laser gates run on DIFFERENT
   beats, so the room's rhythm never sync-locks into one metronome */
const DCYC=190, DGONE=70;                  // blink-stone: ~2s solid, ~1.2s gone
const ZCYC=170, ZOFF=64;                   // laser gate: ~1.8s biting, ~1.1s safe
const dOn=()=> (frame%DCYC) < DCYC-DGONE;
const zOn=()=> (frame%ZCYC) < ZCYC-ZOFF;
function csolid(ch){
  if(ch==='D') return dOn();
  return ch==='#'||ch==='='||ch==='<'||ch==='>'||ch==='u';   // u = fallen-stalactite rubble
}

function loadCave(idx){
  if(ROOM_HINTS[idx]!==undefined && !roomHinted.has(idx)){ roomHinted.add(idx); toast(ROOM_HINTS[idx]); }
  cur=idx; cgrid=[]; gems=[]; skulls=[]; chest=null; heart=null; ckey=null; crates=[]; ship=null; ropes=[]; zappers=[]; boarding=0;
  stals=[]; crevice=null;                      // fragile ceilings GROW BACK between visits
  swingRope=null; swAngle=0; swVel=0; launchVX=0;
  for(let r=0;r<ROWS;r++){
    const line=(CAVES[idx].map[r]||"").padEnd(COLS,'#').slice(0,COLS);
    const row=[];
    for(let c=0;c<COLS;c++){
      const ch=line[c];
      const id=idx+':'+c+':'+r;
      if(ch==='g'){ if(!collected.has(id)) gems.push({id,c,r}); row.push('.'); }
      else if(ch==='s'){ skulls.push({x:c*T+16, y:(r+1)*T-11, vx:(c<COLS/2?1.1:-1.1), ang:0}); row.push('.'); }
      else if(ch==='c'){ chest={x:c*T+16, y:r*T+30, open:chestsOpen.has(idx)}; row.push('.'); }
      else if(ch==='h'){ if(!heartTaken) heart={x:c*T+16, y:r*T+22}; row.push('.'); }
      else if(ch==='k'){ if(!flags.kt_sky) ckey={x:c*T+16, y:r*T+14}; row.push('.'); }
      else if(ch==='b'){ crates.push({x:c*T+16, y:r*T+16}); row.push('.'); }
      else if(ch==='Y'){ if(window.AsteroidsLayer) ship={x:c*T+16, y:r*T+16}; row.push('.'); }
      else if(ch==='R'){ ropes.push({x:c*T+16, y:r*T+16, sway:Math.random()*6.28}); row.push('.'); }
      else if(ch==='Z'){ zappers.push({c,r}); row.push('.'); }
      else if(ch==='V'){ stals.push({c, r, y:r*T, vy:0, state:0, trem:0}); row.push('.'); }
      else if(ch==='O'){ crevice={c,r}; row.push('.'); }
      else if(ch==='@'){ spawnPt={x:c*T+16, y:(r+1)*T}; row.push('.'); }
      else row.push(ch);
    }
    cgrid.push(row);
  }
}
const PUSH_DIST=26;
function crateAt(x,y){
  for(const cr of crates){ if(Math.abs(cr.x-x)<18 && Math.abs(cr.y-y)<16) return cr; }
  return null;
}
function crateTopUnder(px,py){   // a crate whose top surface the player is standing on
  for(const cr of crates){ if(Math.abs(px-cr.x)<18 && py>=cr.y-18 && py<=cr.y-6) return cr; }
  return null;
}

function hurt(n, fromX){
  if(PL.iframes>0) return;
  PL.hp-=n; PL.iframes=80; sfx.hurt();
  puff(PL.x,PL.y-14,'#e05050',6);
  cvy=-5;
  if(PL.hp<=0){ playerDown(); return; }
}
function respawnAtEntry(){
  PL.x=entry.x; PL.y=entry.y; cvy=0; climb=entry.climb; hang=false; PL.iframes=70;
}

/* ---------------- BOARDING (derelict ship in the Treasure Vault) ---------------- */
function updateBoarding(){
  boarding++;
  const t=Math.min(1,boarding/50), ease=t*t*(3-2*t);
  PL.x=boardFrom.x+(ship.x-boardFrom.x)*ease;
  PL.y=boardFrom.y+(ship.y-boardFrom.y)*ease-Math.sin(t*Math.PI)*22;
  if(boarding%4===0) puff(PL.x,PL.y-10,'#8ab4ff',3);
  if(boarding===30) beep(90,240,0.35,'sawtooth',0.16);
  if(boarding>=50){ boarding=0; startAsteroidsTrans('in'); }
}

/* ---------------- UPDATE ---------------- */
function update(){
  if(boarding>0){ updateBoarding(); return; }
  // sanity: never let the player be lost off-world
  if(!isFinite(PL.x)||!isFinite(PL.y)||PL.y<-60){ respawnAtEntry(); }
  if(teaseCooldown>0) teaseCooldown--;
  if(PL.iframes>0) PL.iframes--;
  const d=dirHeld();
  const up=d.y<0, down=d.y>0, left=d.x<0, right=d.x>0;
  const jump=held[' '];
  const spacePressed = jump && !spaceWasHeld;
  const cx=PL.x;

  // --- engage climbing (ladders + ropes + chains) ---
  const climbCh=ch=> ch==='H'||ch==='E'||ch==='C';
  if(!climb && !hang && (up||down)){
    const feet=ctile(cx,PL.y-2), mid=ctile(cx,PL.y-13), below=ctile(cx,PL.y+4);
    if(climbCh(mid)||climbCh(feet)||(down&&climbCh(below))){
      climb=true; cvy=0;
      PL.x=Math.floor(cx/T)*T+16;
      if(down && !climbCh(feet) && climbCh(below)) PL.y+=6;
    }
  }

  // --- swing rope: touch ANY part of a rope while airborne and you grab it ---
  // (jump into its side, or jump up under it — both work. SPACE still grabs while
  //  standing beside it; a short cooldown after release stops insta-relatching.)
  if(regrabT>0) regrabT--;
  let justGrabbed=false;
  if(!swingRope && !hang && !climb && regrabT<=0 && (!onGround || spacePressed)){
    const reach = GRAB_R + (onGround?0:14);   // forgiving airborne catch
    // sample the player's whole body span, not just one point
    const bodyYs=[PL.y-2, PL.y-13, PL.y-24];
    for(const rp of ropes){
      const ry0=rp.y, ry1=rp.y+ROPE_LEN;
      let best=Infinity;
      for(const by of bodyYs){
        const cyy=Math.max(ry0, Math.min(by, ry1));   // closest point on the hanging rope segment
        const d=Math.hypot(PL.x-rp.x, by-cyy);
        if(d<best) best=d;
      }
      if(best<reach){
        swingRope=rp;
        swAngle=Math.atan2(PL.x-rp.x, Math.max(24, PL.y-rp.y));   // grab-angle from where you hit it
        swVel=0; cvy=0; onGround=false;
        justGrabbed=true;
        beep(500,700,0.08,'sine',0.09);
        break;
      }
    }
  }

  if(hang){
    // shimmy along the rope
    let dx=0;
    if(left){ dx=-HANGC; PL.fx=-1; }
    if(right){ dx=HANGC; PL.fx=1; }
    PL.x+=dx; PL.walkT+=Math.abs(dx)*0.15;
    const handCh=ctile(PL.x, hangRow*T+10);
    if(handCh!=='_'){ hang=false; cvy=0.5; }          // slid off the end
    if((down||jump) && !cLatch){ hang=false; cvy=1; cLatch=true; }
  }
  else if(climb){
    let dy=0;
    if(up) dy=-CLIMBC;
    if(down) dy=CLIMBC;
    PL.y+=dy; PL.walkT+=Math.abs(dy)*0.15;
    if(jump && !cLatch){ climb=false; cvy=JUMPC*0.75; cLatch=true; beep(200,420,0.12,'square',0.07); }
    const feet=ctile(PL.x,PL.y-2), mid=ctile(PL.x,PL.y-13);
    if(!climbCh(feet)&&!climbCh(mid)){
      if(dy<0){ PL.y=Math.round(PL.y/T)*T; climb=false; cvy=0; onGround=true; }
      else climb=false;
    }
    // exit rope: reached the top of the entry rope
    if(cur===0 && ctile(PL.x,PL.y-13)==='E' && PL.y-26<44){ startCaveTrans('out'); return; }
  }
  else if(swingRope){
    // real pendulum: gravity pulls toward angle 0, LEFT/RIGHT pumps energy in
    let acc = -ROPE_GRAV*Math.sin(swAngle);
    if(left) acc -= ROPE_PUMP;
    else if(right) acc += ROPE_PUMP;
    swVel += acc;
    swVel *= ROPE_DAMP;
    swVel = Math.max(-ROPE_MAXVEL, Math.min(ROPE_MAXVEL, swVel));
    swAngle += swVel;
    if(swAngle>ROPE_MAXANG){ swAngle=ROPE_MAXANG; if(swVel>0) swVel=0; }
    else if(swAngle<-ROPE_MAXANG){ swAngle=-ROPE_MAXANG; if(swVel<0) swVel=0; }
    PL.x = swingRope.x + Math.sin(swAngle)*ROPE_LEN;
    PL.y = swingRope.y + Math.cos(swAngle)*ROPE_LEN;
    PL.fx = swVel>=0? 1 : -1; PL.walkT += Math.abs(swVel)*10;
    if(spacePressed && !justGrabbed){
      let vx = swVel*ROPE_LEN*Math.cos(swAngle);
      let vy = -swVel*ROPE_LEN*Math.sin(swAngle);
      launchVX = Math.max(-7, Math.min(7, vx));
      cvy = Math.max(-10, Math.min(6, vy));
      onGround=false; swingRope=null; regrabT=22;
      beep(500,300,0.1,'sine',0.09);
    }
  }
  else{
    runT = (left||right) ? runT+1 : 0;
    const spd = SPDC + (runT>72 ? Math.min(1.2,(runT-72)/25) : 0);  // sprint after holding ~1.2s
    let vx=0;
    if(left){ vx=-spd; PL.fx=-1; PL.fy=0; }
    if(right){ vx=spd; PL.fx=1; PL.fy=0; }
    if(jump && onGround && !cLatch){ cvy=JUMPC; onGround=false; cLatch=true; beep(200,420,0.12,'square',0.07); }
    cvy=Math.min(cvy+GRAVC,9);

    // horizontal (keyboard input + any residual momentum from a rope release)
    const mvx = vx+launchVX;
    launchVX *= 0.94; if(Math.abs(launchVX)<0.15) launchVX=0;
    PL.x+=mvx;
    if(mvx>0){ for(const yy of [PL.y-24,PL.y-13,PL.y-2]) if(csolid(ctile(PL.x+8,yy))){ PL.x=Math.floor((PL.x+8)/T)*T-8.01; launchVX=0; break; } }
    else if(mvx<0){ for(const yy of [PL.y-24,PL.y-13,PL.y-2]) if(csolid(ctile(PL.x-8,yy))){ PL.x=(Math.floor((PL.x-8)/T)+1)*T+8.01; launchVX=0; break; } }
    // pushable crates — only while walking into one at floor level; airborne players jump clean over them
    if(vx!==0 && onGround && !crateTopUnder(PL.x,PL.y)){
      const dir=Math.sign(vx);
      const cr=crateAt(PL.x+dir*PUSH_DIST, PL.y-13);
      if(cr){
        const nx=cr.x+vx;
        const blocked = csolid(ctile(nx+dir*16, cr.y)) || crateAt(nx+dir*16, cr.y)
          || !csolid(ctile(nx+dir*16, cr.y+17));   // crates won't slide off a ledge into thin air
        if(!blocked) cr.x=nx;
        PL.x = cr.x - dir*PUSH_DIST;
      }
    }
    if(onGround && vx!==0) PL.walkT+=0.25;
    if(onGround && vx===0) PL.walkT=0;

    // vertical
    PL.y+=cvy;
    onGround=false;
    if(cvy>0){
      let landed=false;
      for(const xx of [PL.x-6,PL.x+6]){
        const ch=ctile(xx,PL.y);
        if(csolid(ch) || ((ch==='H'||ch==='C')&&!down)){ PL.y=Math.floor(PL.y/T)*T-0.01; cvy=0; onGround=true; landed=true; break; }
      }
      if(!landed){
        const cr=crateTopUnder(PL.x,PL.y);
        if(cr){ PL.y=cr.y-16-0.01; cvy=0; onGround=true; }
      }
    } else if(cvy<0){
      for(const xx of [PL.x-6,PL.x+6]){
        if(csolid(ctile(xx,PL.y-26))){ PL.y=(Math.floor((PL.y-26)/T)+1)*T+26.01; cvy=0; break; }
      }
      // grab a shimmy rope while airborne
      if(ctile(PL.x,PL.y-24)==='_'){
        hang=true; hangRow=Math.floor((PL.y-24)/T);
        PL.y=hangRow*T+32; cvy=0;
        beep(600,900,0.08,'sine',0.09);
      }
    }
    // conveyor belts: the floor itself has opinions
    if(onGround){
      const bch=ctile(PL.x, PL.y+2);
      if(bch==='<'||bch==='>'){
        const bd=bch==='>'?1:-1;
        if(!csolid(ctile(PL.x+bd*9, PL.y-13))) PL.x+=bd*0.9;
      }
    }
  }
  if(!jump && !down) cLatch=false;
  spaceWasHeld=jump;

  // --- room transitions (never while swinging — a pendulum arc that
  //     crosses the threshold must not walk you out of the room) ---
  const col=cur%CGW, row=Math.floor(cur/CGW);
  let moved=false;
  if(swingRope){ /* the clamp below keeps the arc on-screen */ }
  else if(PL.x>RW-2 && col<CGW-1){ loadCave(cur+1); PL.x=9; moved=true; }
  else if(PL.x<2 && col>0){ loadCave(cur-1); PL.x=RW-9; moved=true; }
  else if(PL.y>RH-3 && row<CGH-1){ loadCave(cur+CGW); PL.y=30; moved=true; }      // arrive clear of the up-exit threshold
  else if(PL.y-26<2 && row>0 && climb){ loadCave(cur-CGW); PL.y=RH-8; moved=true; } // arrive clear of the down-exit threshold
  PL.x=Math.max(2,Math.min(RW-2,PL.x));
  if(PL.y>RH+40){ respawnAtEntry(); }   // safety net
  if(moved){ entry={x:PL.x,y:PL.y,climb}; PL.iframes=Math.max(PL.iframes,40); }

  // --- the dripstone set: fragile ceilings, and the crevice down ---
  stalTick();

  // --- hazards ---
  if(PL.iframes<=0){
    for(const [xx,yy] of [[PL.x-5,PL.y-4],[PL.x+5,PL.y-4],[PL.x,PL.y-14]]){
      if(ctile(xx,yy)==='^'){ hurt(1); break; }
    }
    if(state!=='cave') return;   // last heart lost -> woke in the village
  }
  // laser gates: they bite on a beat — walk through between flashes
  if(PL.iframes<=0 && zOn()){
    for(const z of zappers){
      const zx=z.c*T+16;
      if(Math.abs(PL.x-zx)<12 && PL.y>z.r*T+4 && PL.y-26<(z.r+1)*T){ hurt(1); break; }
    }
    if(state!=='cave') return;
  }
  // water: jungle teaser, gentle respawn
  if(ctile(PL.x,PL.y-4)==='W'){
    flags.sawWater=true;   // also unlocks the Jungle Hunt cabinet in the Arcade
    puff(PL.x,PL.y-6,'#4d9ac9',10);
    beep(300,80,0.4,'sine',0.12);
    respawnAtEntry();      // return spot is safe dry land when you climb back out
    if(window.JungleLayer && typeof startJungleTrans==='function'){
      toast('The dark water takes you DOWN.');
      startJungleTrans('in');
    } else if(teaseCooldown<=0){ toast('Dark water... something BIG stirs below.'); teaseCooldown=600; }
  }
  // skulls
  for(const s of skulls){
    s.x+=s.vx; s.ang+=s.vx*0.09;
    const ahead=s.vx>0? s.x+13 : s.x-13;
    const bodyCh=ctile(ahead, s.y);
    const floorCh=ctile(ahead, s.y+14);
    if(csolid(bodyCh) || bodyCh==='^' || bodyCh==='W' || !csolid(floorCh) || ahead<14 || ahead>RW-14) s.vx*=-1;
    if(PL.iframes<=0 && Math.abs(s.x-PL.x)<16 && Math.abs(s.y-(PL.y-12))<18){ hurt(1); if(state!=='cave') return; }
  }

  // --- treasure ---
  for(let i=gems.length-1;i>=0;i--){
    const gm=gems[i];
    const gx=gm.c*T+16, gy=gm.r*T+12;
    if(Math.hypot(PL.x-gx, (PL.y-13)-gy)<28){
      gems.splice(i,1); collected.add(gm.id);
      res.gold=Math.min(999,res.gold+5);
      sfx.coin(); addFloat(gx,gy-10,'+5 gold','#ffd76e');
      puff(gx,gy,'#5ad4c8',5);
    }
  }
  if(chest && !chest.open && Math.hypot(PL.x-chest.x,(PL.y-13)-(chest.y-8))<26){
    chest.open=true; chestsOpen.add(cur);
    res.gold=Math.min(999,res.gold+25);
    sfx.chest(); addFloat(chest.x,chest.y-26,'+25 GOLD!','#ffd76e');
    puff(chest.x,chest.y-14,'#ffd23e',12);
  }
  if(ckey && Math.hypot(PL.x-ckey.x,(PL.y-13)-ckey.y)<26){
    ckey=null; flags.kt_sky=true; keysHeld.push('sky');
    sfx.chest(); addFloat(PL.x,PL.y-34,'SKY KEY!','#7fd4ff');
    puff(PL.x,PL.y-14,'#7fd4ff',8);
  }
  if(heart && Math.hypot(PL.x-heart.x,(PL.y-13)-heart.y)<24){
    heart=null; heartTaken=true;
    PL.maxhp+=2; PL.hp=PL.maxhp; sfx.heart();
    addFloat(PL.x,PL.y-34,'MAX HEALTH UP!','#ff6a6a');
  }
  if(ship && onGround && Math.hypot(PL.x-ship.x,(PL.y-13)-ship.y)<28){
    boarding=1; boardFrom={x:PL.x,y:PL.y};
    toast('You climb aboard the derelict wreck...');
  }
}

/* ---------------- DRAW ---------------- */
function caveObjective(){
  switch(cur){
    case 0: return 'Gems turn to gold down here — the rope leads home';
    case 1: return 'The blue stone lies. Gates bite on a beat — move between flashes';
    case 2: return flags.kt_sky? 'Jump to grab a rope, pump LEFT/RIGHT to swing, SPACE to let go' : 'Swing the ropes over the gap — sky-blue glints past the spikes';
    case 3: return chestsOpen.has(3)? 'The hoard is yours. The way OUT is the high gap — push a crate to the wall and walk through'
      : "Swing to the sealed vault. Getting in is the easy half";
    case 4: return 'Belts, blink-stone, then a rope swing — the heart is earned';
    /* the half-buried wreck moved to the VILLAGE FIELDS (Scott, 2026-08-23) —
       OMEGA RUN boards from the overworld corn now, not from the vault */
    case 5: return chestsOpen.has(5)? 'The hoard is yours' : 'Plunder the vault!';
  }
  return '';
}

function drawShip(sh){
  const x=sh.x, y=sh.y+HUD;
  const glow=ctx.createRadialGradient(x,y-6,2,x,y-6,30);
  glow.addColorStop(0,'rgba(138,180,255,.25)'); glow.addColorStop(1,'rgba(138,180,255,0)');
  ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(x,y-6,30,0,7); ctx.fill();
  // half-buried derelict hull, tilted
  ctx.save(); ctx.translate(x,y); ctx.rotate(-0.18);
  const hg=ctx.createLinearGradient(-20,-14,20,10);
  hg.addColorStop(0,'#5a6478'); hg.addColorStop(1,'#2c3140');
  ctx.fillStyle=hg;
  ctx.beginPath();
  ctx.moveTo(-22,8); ctx.quadraticCurveTo(-18,-14,0,-16); ctx.quadraticCurveTo(20,-14,22,4);
  ctx.quadraticCurveTo(10,10,-22,8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(10,12,18,.6)'; ctx.lineWidth=1.6; ctx.stroke();
  // cockpit glass, pulsing faintly (still has power)
  const pul=0.5+Math.sin(frame*0.05)*0.3;
  ctx.fillStyle='rgba(140,200,255,'+pul.toFixed(2)+')';
  ctx.beginPath(); ctx.ellipse(2,-6,7,4.5,0,0,7); ctx.fill();
  ctx.strokeStyle='rgba(200,230,255,.5)'; ctx.lineWidth=1; ctx.stroke();
  // hull damage streaks
  ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(-10,-6); ctx.lineTo(-4,2); ctx.moveTo(6,-8); ctx.lineTo(12,-1); ctx.stroke();
  ctx.restore();
  if(Math.hypot(PL.x-sh.x,(PL.y-13)-sh.y)<58 && !boarding){
    drawLabel('a derelict ship — walk up to board', x, y-40, '#c8ddff');
  }
}
function drawCrate(cr){
  const x=cr.x, y=cr.y+HUD, s=15;
  const wg=ctx.createLinearGradient(x-s,y-s,x+s,y+s);
  wg.addColorStop(0,'#9a7648'); wg.addColorStop(1,'#6b4e2e');
  ctx.fillStyle=wg; rr(ctx,x-s,y-s,s*2,s*2,3); ctx.fill();
  ctx.strokeStyle='rgba(30,18,8,.7)'; ctx.lineWidth=1.6;
  rr(ctx,x-s,y-s,s*2,s*2,3); ctx.stroke();
  ctx.strokeStyle='rgba(230,200,150,.35)'; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(x-s,y-s); ctx.lineTo(x+s,y+s); ctx.moveTo(x+s,y-s); ctx.lineTo(x-s,y+s); ctx.stroke();
  ctx.strokeStyle='rgba(20,12,6,.6)'; ctx.lineWidth=2;
  ctx.strokeRect(x-s+3,y-s+3,s*2-6,s*2-6);
}

function drawRope(x0,y,phase){ // one vertical rope tile segment with sway (chunky, twisted-fiber look)
  const sway=Math.sin(frame*0.04+phase)*2.2;
  ctx.strokeStyle='#8a6a3a'; ctx.lineWidth=5; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(x0+sway*0.4, y);
  ctx.quadraticCurveTo(x0+sway, y+T/2, x0+sway*0.5, y+T);
  ctx.stroke();
  ctx.strokeStyle='rgba(60,42,20,.55)'; ctx.lineWidth=5; ctx.setLineDash([4,4]); ctx.lineDashOffset=-frame*0.3;
  ctx.beginPath();
  ctx.moveTo(x0+sway*0.4, y);
  ctx.quadraticCurveTo(x0+sway, y+T/2, x0+sway*0.5, y+T);
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='#8a6a3a';
  ctx.beginPath(); ctx.arc(x0+sway*0.8, y+T*0.45, 2.8, 0, 7); ctx.fill();
}
function drawSwingRope(rp){
  const grabbed = swingRope===rp;
  const angle = grabbed ? swAngle : Math.sin(frame*0.02+rp.sway)*0.05;
  const bx = rp.x+Math.sin(angle)*ROPE_LEN, by = rp.y+Math.cos(angle)*ROPE_LEN;
  const ax=rp.x, ay=rp.y+HUD, bxH=bx, byH=by+HUD;
  ctx.strokeStyle='#8a6a3a'; ctx.lineWidth=6; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bxH,byH); ctx.stroke();
  ctx.strokeStyle='rgba(60,42,20,.55)'; ctx.lineWidth=6; ctx.setLineDash([5,5]); ctx.lineDashOffset=-frame*0.35;
  ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bxH,byH); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='#5c4320'; ctx.beginPath(); ctx.arc(ax,ay,5,0,7); ctx.fill();
  ctx.strokeStyle='rgba(20,14,6,.6)'; ctx.lineWidth=1.4; ctx.stroke();
  if(!grabbed && !swingRope && Math.hypot(PL.x-bx,PL.y-by)<54){
    drawLabel('[SPACE] grab', bxH, byH-16, '#ffe9a0');
  }
  else if(!grabbed && !swingRope && onGround && Math.abs(PL.x-bx)<44 && PL.y>by && PL.y-by<150){
    drawLabel('[JUMP near the rope + SPACE] grab it', bxH, byH-14, '#c8b070');
  }
}

function draw(){
  const g=ctx;
  // the void. Flat black, nothing floating in it — the room reads as space
  // cut out of the brick mass, and any texture in the black breaks that.
  g.fillStyle='#000'; g.fillRect(0,HUD,RW,RH);
  // light shaft from the entry hole
  if(cur===0){
    const lg=g.createLinearGradient(0,HUD,0,HUD+RH*0.8);
    lg.addColorStop(0,'rgba(255,240,190,.30)'); lg.addColorStop(1,'rgba(255,240,190,0)');
    g.fillStyle=lg;
    g.beginPath(); g.moveTo(4*T-14,HUD); g.lineTo(4*T+46,HUD); g.lineTo(4*T+80,HUD+RH*0.8); g.lineTo(4*T-48,HUD+RH*0.8);
    g.closePath(); g.fill();
  }

  // tiles
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const ch=cgrid[r][c], x=c*T, y=r*T+HUD;
    if(ch==='#'){
      // BRICK MASS: four 8px courses per tile, bricks 16px wide, each course
      // offset half a brick, mortar lines dark, each brick one flat colour
      // hashed a shade up or down. No gradients, no lighting — flat is right.
      const P=cavePal();
      g.fillStyle=P.mortar; g.fillRect(x,y,T,T);
      for(let cy=0; cy<4; cy++){
        const gy=y+cy*8, courseRow=r*4+cy, off=(courseRow%2)*8;
        for(let bx=-1; bx<3; bx++){
          const gx=x+bx*16+off;
          const bid=hash2((c*4+bx)*7+courseRow*31, cur*13+courseRow);
          g.fillStyle= bid<0.25? P.hi : bid<0.5? P.lo : P.base;
          g.fillRect(Math.max(x,gx), gy, Math.min(x+T,gx+14.5)-Math.max(x,gx), 6.5);
        }
      }
    }
    else if(ch==='='){
      // the original's thin floor: a bright cyan walking line over a mottled
      // red-earth band, floating in the void
      g.fillStyle='#8fe0e0'; g.fillRect(x-0.5,y+2,T+1,3);
      g.fillStyle='#6a3428'; g.fillRect(x-0.5,y+5,T+1,9);
      g.fillStyle='#8a4634';
      for(let i=0;i<6;i++){
        const hv=hash2(c*17+i*7,r*11+i);
        g.fillRect(x+((hv*29)%29), y+5.5+((hv*731)%7), 2.5, 2);
      }
    }
    else if(ch==='H'){
      // the blue-violet ladder every screen of the original carries
      g.strokeStyle='#8078e8'; g.lineWidth=2.6;
      g.beginPath(); g.moveTo(x+9,y); g.lineTo(x+9,y+T); g.moveTo(x+T-9,y); g.lineTo(x+T-9,y+T); g.stroke();
      g.strokeStyle='#9a94f4'; g.lineWidth=2; g.lineCap='butt';
      for(let ry=4; ry<T; ry+=8){ g.beginPath(); g.moveTo(x+9,y+ry); g.lineTo(x+T-9,y+ry); g.stroke(); }
    }
    else if(ch==='E'){ drawRope(x+16, y, r*0.6); }
    else if(ch==='C'){
      // iron chain: alternating link profiles, anchored taut
      g.strokeStyle='#a8d8e8'; g.lineWidth=2.2;
      for(let ly=0; ly<T; ly+=8){
        const wide=(((r*T+ly)/8)|0)%2===0;
        g.beginPath();
        g.ellipse(x+16, y+ly+4, wide?2.4:4.2, wide?4.4:2.6, 0, 0, 7);
        g.stroke();
      }
      g.fillStyle='rgba(255,255,240,.18)';
      g.fillRect(x+14.6, y, 1.2, T);
    }
    else if(ch==='D'){
      // blink-stone: pale-blue slab that flickers a warning, then is GONE
      const ph=frame%DCYC, solidNow=ph<DCYC-DGONE;
      let al = solidNow? 1 : 0.10;
      if(solidNow && ph>DCYC-DGONE-32 && (frame>>2)%2) al=0.45;
      g.globalAlpha=al;
      g.fillStyle='#a8cbe4'; g.fillRect(x-0.5,y+2,T+1,3);
      g.fillStyle='#5c80a0'; g.fillRect(x-0.5,y+5,T+1,9);
      g.globalAlpha=1;
    }
    else if(ch==='<'||ch==='>'){
      // conveyor: worn slab, chevrons crawling the way it will carry you
      const dir=ch==='>'?1:-1;
      g.fillStyle='#20343a'; g.fillRect(x-0.5,y+2,T+1,12);
      g.strokeStyle='rgba(127,224,224,.75)'; g.lineWidth=2; g.lineCap='round';
      const off=((frame*0.8*dir)%10+10)%10;
      for(let ix=0; ix<T; ix+=10){
        const cxp=x+((ix+off)%T);
        g.beginPath();
        g.moveTo(cxp-3*dir, y+6); g.lineTo(cxp+3*dir, y+10); g.lineTo(cxp-3*dir, y+14);
        g.stroke();
      }
      g.fillStyle='#8fe0e0'; g.fillRect(x-0.5,y+2,T+1,2);
    }
    else if(ch==='_'){
      const sag=Math.sin(frame*0.05+c)*1.2;
      g.strokeStyle='#8a6a3a'; g.lineWidth=5; g.lineCap='round';
      g.beginPath(); g.moveTo(x-1,y+8); g.quadraticCurveTo(x+16,y+11+sag,x+T+1,y+8); g.stroke();
      g.strokeStyle='rgba(60,42,20,.55)'; g.lineWidth=5; g.setLineDash([4,4]); g.lineDashOffset=-frame*0.3;
      g.beginPath(); g.moveTo(x-1,y+8); g.quadraticCurveTo(x+16,y+11+sag,x+T+1,y+8); g.stroke(); g.setLineDash([]);
      g.fillStyle='#8a6a3a'; g.beginPath(); g.arc(x+16,y+10+sag,2.6,0,7); g.fill();
    }
    else if(ch==='^'){
      g.fillStyle='#2a251f'; g.fillRect(x,y+T-5,T,5);
      for(let i=0;i<4;i++){
        const sxp=x+i*8;
        const mg=g.createLinearGradient(sxp,y+6,sxp+8,y+T);
        mg.addColorStop(0,'#d8d3c8'); mg.addColorStop(1,'#77726a');
        g.fillStyle=mg;
        g.beginPath(); g.moveTo(sxp+0.5,y+T-3); g.lineTo(sxp+4,y+7); g.lineTo(sxp+7.5,y+T-3); g.closePath(); g.fill();
      }
    }
    else if(ch==='u'){
      // fallen-stalactite rubble: a broken spike heaped where it crashed —
      // flat pale stone, unmistakably STANDABLE (bright walking line on top)
      g.fillStyle='#8fe0e0'; g.fillRect(x+3,y+14,T-6,2.5);
      const rg2=g.createLinearGradient(0,y+16,0,y+T);
      rg2.addColorStop(0,'#c9c2b4'); rg2.addColorStop(1,'#8a8378');
      g.fillStyle=rg2;
      g.beginPath();
      g.moveTo(x+2,y+T); g.lineTo(x+8,y+18); g.lineTo(x+14,y+T-6);
      g.lineTo(x+19,y+16); g.lineTo(x+25,y+T-4); g.lineTo(x+30,y+T);
      g.closePath(); g.fill();
      g.strokeStyle='rgba(40,34,26,.5)'; g.lineWidth=1; g.stroke();
    }
    else if(ch==='W'){
      const wg=g.createLinearGradient(0,y,0,y+T);
      wg.addColorStop(0,'#1e4a5c'); wg.addColorStop(1,'#0e2833');
      g.fillStyle=wg; g.fillRect(x,y+6,T,T-6);
      g.strokeStyle='rgba(160,220,240,.35)'; g.lineWidth=1.6; g.lineCap='round';
      const ph=(frame*0.5+c*9)%T;
      g.beginPath(); g.moveTo(x+ph*0.4,y+8); g.quadraticCurveTo(x+ph*0.4+6,y+6.5,x+ph*0.4+12,y+8); g.stroke();
      // something stirs...
      if(((frame>>6)+c)%9===0){
        g.fillStyle='rgba(255,60,60,.8)';
        g.beginPath(); g.arc(x+9,y+20,1.4,0,7); g.arc(x+15,y+20,1.4,0,7); g.fill();
      }
    }
  }

  // the dripstone set: hanging spikes (trembling ones shiver), and the crevice
  for(const s of stals){
    const sx=s.c*T+16, sy=s.y+HUD;
    const jx= s.state===1? Math.sin(frame*1.7+s.c)*1.6 : 0;
    const sg2=g.createLinearGradient(0,sy,0,sy+STAL_LEN);
    sg2.addColorStop(0,'#d8d3c8'); sg2.addColorStop(1,'#77726a');
    g.fillStyle=sg2;
    g.beginPath();
    g.moveTo(sx-7+jx, sy); g.lineTo(sx+7+jx, sy); g.lineTo(sx+jx, sy+STAL_LEN);
    g.closePath(); g.fill();
    g.strokeStyle='rgba(40,34,26,.45)'; g.lineWidth=1; g.stroke();
    // the drip that names the place
    if(s.state===0 && ((frame+s.c*29)%140)<12){
      g.fillStyle='rgba(160,220,240,.7)';
      g.beginPath(); g.arc(sx, sy+STAL_LEN+((frame+s.c*29)%140)*1.6, 1.4, 0, 7); g.fill();
    }
    if(s.state===1 && (frame>>2)%2){                 // the warning reads twice:
      g.fillStyle='rgba(255,120,80,.5)';             // shiver AND a hot tip
      g.beginPath(); g.arc(sx+jx, sy+STAL_LEN, 2.4, 0, 7); g.fill();
    }
  }
  if(crevice){
    const cx2=crevice.c*T, cy2=(crevice.r+1)*T+HUD;
    g.strokeStyle='#0a0d12'; g.lineWidth=4; g.lineCap='round';
    g.beginPath(); g.moveTo(cx2+4,cy2-2); g.lineTo(cx2+12,cy2-5); g.lineTo(cx2+20,cy2-2); g.lineTo(cx2+28,cy2-4); g.stroke();
    g.strokeStyle='rgba(120,180,220,'+(0.20+0.15*Math.sin(frame*0.07)).toFixed(2)+')';
    g.lineWidth=1.4;
    g.beginPath(); g.moveTo(cx2+6,cy2-3); g.lineTo(cx2+26,cy2-3); g.stroke();
    if(Math.abs(PL.x-(cx2+16))<40 && Math.abs(PL.y-cy2)<40)
      drawLabel('DOWN — squeeze in', cx2+16, cy2-14, '#9fd8ff');
  }

  // open standable edges get a quiet chevron — the map connects sideways,
  // and a corridor that never says so reads as a wall
  {
    const pul=0.25+0.15*Math.sin(frame*0.06);
    g.fillStyle='rgba(255,244,200,'+pul.toFixed(2)+')';
    for(let r=1;r<ROWS-1;r++){
      const stand=(cc,rr2)=> !csolid(cgrid[rr2][cc]) && csolid(cgrid[rr2+1][cc]);
      if(stand(0,r) && cur%CGW>0){
        const yy=r*T+HUD+16;
        g.beginPath(); g.moveTo(10,yy-5); g.lineTo(4,yy); g.lineTo(10,yy+5); g.closePath(); g.fill();
      }
      if(stand(COLS-1,r) && cur%CGW<CGW-1){
        const yy=r*T+HUD+16;
        g.beginPath(); g.moveTo(RW-10,yy-5); g.lineTo(RW-4,yy); g.lineTo(RW-10,yy+5); g.closePath(); g.fill();
      }
    }
  }

  // ceiling hole above entry rope
  if(cur===0){
    g.fillStyle='#000';
    g.beginPath(); g.ellipse(4*T+16, HUD+3, 22, 7, 0, 0, 7); g.fill();
  }

  // treasure + hazards
  for(const gm of gems){
    const gx=gm.c*T+16, gy=gm.r*T+12+HUD+Math.sin(frame*0.08+gm.c)*2;
    const glow=g.createRadialGradient(gx,gy,1,gx,gy,12);
    glow.addColorStop(0,'rgba(90,212,200,.5)'); glow.addColorStop(1,'rgba(90,212,200,0)');
    g.fillStyle=glow; g.beginPath(); g.arc(gx,gy,12,0,7); g.fill();
    g.fillStyle='#5ad4c8';
    g.beginPath(); g.moveTo(gx,gy-7); g.lineTo(gx+6,gy); g.lineTo(gx,gy+7); g.lineTo(gx-6,gy); g.closePath(); g.fill();
    g.strokeStyle='rgba(10,40,38,.6)'; g.lineWidth=1.1; g.stroke();
    g.fillStyle='rgba(255,255,255,.65)'; g.fillRect(gx-2.5,gy-3.5,2.2,2.2);
  }
  for(const z of zappers){
    // laser gate: emitter studs always; the beam only when it bites
    const zx=z.c*T+16, zy0=z.r*T+HUD, zy1=zy0+T;
    ctx.fillStyle='#6a7488';
    ctx.fillRect(zx-5,zy0-2,10,4); ctx.fillRect(zx-5,zy1-2,10,4);
    if(zOn()){
      const flick=0.55+0.35*Math.sin(frame*0.55+z.r*3);
      const gl=ctx.createLinearGradient(zx-8,0,zx+8,0);
      gl.addColorStop(0,'rgba(120,220,255,0)');
      gl.addColorStop(0.5,'rgba(120,220,255,'+(0.20*flick).toFixed(2)+')');
      gl.addColorStop(1,'rgba(120,220,255,0)');
      ctx.fillStyle=gl; ctx.fillRect(zx-8,zy0,16,T);
      ctx.strokeStyle='rgba(140,230,255,'+flick.toFixed(2)+')'; ctx.lineWidth=2.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(zx,zy0);
      for(let yy=zy0+6; yy<zy1-4; yy+=7) ctx.lineTo(zx+(Math.random()*6-3), yy);
      ctx.lineTo(zx,zy1); ctx.stroke();
    } else if((frame>>3)%4===0){
      ctx.fillStyle='rgba(140,230,255,.35)';           // idle wink: it is not dead
      ctx.fillRect(zx-1.5,zy0+2,3,3);
    }
  }
  for(const rp of ropes) drawSwingRope(rp);
  for(const cr of crates) drawCrate(cr);
  if(chest) drawChest(chest);
  if(ship) drawShip(ship);
  if(heart) drawHeartItem(heart);
  if(ckey){
    const ky=ckey.y+HUD+Math.sin(frame*0.08)*2.5;
    const kgl=ctx.createRadialGradient(ckey.x,ky,2,ckey.x,ky,16);
    kgl.addColorStop(0,'rgba(127,212,255,.45)'); kgl.addColorStop(1,'rgba(127,212,255,0)');
    ctx.fillStyle=kgl; ctx.beginPath(); ctx.arc(ckey.x,ky,16,0,7); ctx.fill();
    drawKeyIcon(ckey.x,ky,'#7fd4ff',1.4);
  }
  for(const s of skulls){
    const y=s.y+HUD;
    g.save(); g.translate(s.x,y); g.rotate(s.ang);
    g.fillStyle='#f2f0e8'; g.beginPath(); g.arc(0,-1,10,0,7); g.fill();
    g.fillStyle='#c9c2b4'; rr(g,-6,5,12,6,2); g.fill();
    g.fillStyle='#191510';
    g.beginPath(); g.arc(-3.5,-2,2.4,0,7); g.arc(3.5,-2,2.4,0,7); g.fill();
    g.fillStyle='#191510'; g.fillRect(-3,6,1.8,3); g.fillRect(0,6,1.8,3);
    g.restore();
  }

  // player (shared sprite) — no lantern halo: the original is lit flat
  drawPlayerSprite();
  if(hang || swingRope){
    ctx.strokeStyle='#eab98a'; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(PL.x-4,PL.y+HUD-24); ctx.lineTo(PL.x-5,PL.y+HUD-30);
    ctx.moveTo(PL.x+4,PL.y+HUD-24); ctx.lineTo(PL.x+5,PL.y+HUD-30);
    ctx.stroke();
  }

  // particles + floats (shared arrays)
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.05; p.life--;
    if(p.life<=0){ particles.splice(i,1); continue; }
    ctx.globalAlpha=Math.min(1,p.life/15)*0.85;
    ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y+HUD,2.2,0,7); ctx.fill();
    ctx.globalAlpha=1;
  }
  ctx.font='bold 12px '+FONT; ctx.textAlign='center'; ctx.lineJoin='round';
  for(let i=floats.length-1;i>=0;i--){
    const f=floats[i]; f.y-=0.4; f.life--;
    if(f.life<=0){ floats.splice(i,1); continue; }
    ctx.globalAlpha=Math.min(1,f.life/20);
    ctx.lineWidth=3; ctx.strokeStyle='rgba(10,8,4,.85)';
    ctx.strokeText(f.text, f.x, f.y+HUD);
    ctx.fillStyle=f.color||'#fff'; ctx.fillText(f.text, f.x, f.y+HUD);
    ctx.globalAlpha=1;
  }

  // (the lantern-darkness vignette is gone with the reskin: the original's
  //  rooms are lit flat, and the vignette was fighting the brick mass)

  drawHUDbar('MONTY ZOOM · '+CAVES[cur].name, caveObjective());
}

/* ---------------- API ---------------- */
window.CaveLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    loadCave(0);
    PL.x=spawnPt.x; PL.y=200;                     // start partway down the entry rope
    cvy=0; climb=true; hang=false; onGround=false;
    PL.iframes=50; PL.swing=0; PL.kb.x=0; PL.kb.y=0;
    entry={x:PL.x, y:11*T, climb:false};
    toast('The caverns swallow you. Gems are 5 gold each.');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; }
    else { loadScreen(2); }
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
    hang=false; climb=false;
  },
  update, draw,
  save(){ return {collected:[...collected], chestsOpen:[...chestsOpen], heartTaken}; },
  load(d){
    collected.clear(); (d.collected||[]).forEach(x=>collected.add(x));
    chestsOpen=new Set(d.chestsOpen||[]);
    if(d.chestOpen) chestsOpen.add(5);   // legacy saves: the shared boolean meant (at least) the Treasure Vault
    heartTaken=!!d.heartTaken;
  },
  reset(){ collected.clear(); chestsOpen.clear(); heartTaken=false; teaseCooldown=0; savedPos=null; }
};

})();
