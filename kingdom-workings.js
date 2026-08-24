/* ============================================================
   DIGGY J (was THE DEEP WORKINGS, then briefly DANGER BLOCKS) — the floor below the quarry.

   A Boulder-Dash / Digging Jim engine. The whole design law:

     EVERY OBJECT HAS FIXED, DETERMINISTIC PHYSICS.
     NOTHING IS RANDOM. NOTHING GETS A SPECIAL CASE.
     THE LAYOUT — AND ONLY THE LAYOUT — MAKES A LEVEL HARD.

   That is what lets a small set of rules carry a hundred levels,
   and what lets a player reason three moves ahead instead of
   reacting. If any element below ever needs an exception, the
   exception is the bug.

   The six elements in this build:
     #  BEDROCK  immovable, indestructible. The pen.
     .  SPOIL    diggable earth. Supports what sits on it.
     O  BOULDER  falls when unsupported; rolls off round things;
                 pushable sideways; kills only if it was falling.
     *  GEM      identical physics to a boulder, but collectible.
                 Your treasure is also your hazard and your tool.
     a/b GRUB    wall-hugging, fully deterministic, two turn
                 directions. Kills on contact. Crushed by a falling
                 object it bursts into gems.
     E  GATE     opens at quota.

   THE SAFETY RULE that makes it playable: a boulder resting on
   your head does NOT crush you. Only one that has already fallen
   at least a tile does. So you can tunnel under a row of boulders
   and let them drop in behind you — that is the core technique.

   Tick order every frame-group: player acts, then gravity, then
   grubs. Bottom-up gravity scan, so a stacked column falls as a
   unit rather than one tile per tick.
   ============================================================ */
(function(){
'use strict';

const W=20, H=12, TS=32;
const TICK=8;                       // frames per simulation tick (7.5/sec)
/* TICK was 6. Everything — digger, grubs, falling rock — is driven off it, so
   raising it slows the whole world by a third without touching a single rule.
   Solutions are counted in TICKS, not seconds, so none of them change. */

/* ---------------- levels ----------------
   Each is exactly 12 rows of 20 chars. P marks the start.
   Designed with a known solution; tools/test_workings.js plays
   that solution and fails the build if a level is unwinnable. */
const LEVELS=[
  { name:'THE CRAWLER', quota:4,
    hint:'It never guesses. It walks the same lap forever. Watch one, then cross.',
    map:[
    '####################',
    '#P.................#',
    '#.....*............#',
    '#..................#',
    '#..................#',
    '####.#########.#####',
    '#        a         #',
    '####.#########.#####',
    '#..................#',
    '#.......*..........#',
    '#.....*..........*E#',
    '####################'] },

  /* v2 (2026-08-09) — the old room was machine-solvable and human-hostile:
     a one-tick crush window behind an up-dig that dropped the rock on your
     own head. This one puts the whole MECHANISM on display and makes the
     natural move the winning move.
     The grub laps a ring whose two sides are TALL SHAFTS it climbs every
     lap. Two rocks sit in plain sight on earth plugs DIRECTLY over those
     shafts, and the only road east — toward the gem and the gate — is the
     tunnel that runs straight through both plugs. Dig through a plug and
     the rock drops down the shaft behind you (it rests on your head while
     you pass — the safety rule IS the technique). A rock falling a 4-tall
     shaft meets a grub climbing it across a wide window, not one perfect
     tick — and there are two rocks, so a miss costs a rock, not the run.
     Whichever shaft the crush plugs, the other one is your staircase down
     to the burst. Quota 5 = two loose gems + the stingiest possible burst. */
  { name:'THE CRUSH', quota:5,
    hint:'The rock wants the shaft. The grub climbs the shaft. Dig the earth out from under the rock — and keep walking.',
    map:[
    '####################',
    '#P.................#',
    '#....*.............#',
    '#..................#',
    '#........O.....O...#',
    '#..........*......E#',
    '#########       ####',
    '######### ##### ####',
    '######### ##### ####',
    '#########   a   ####',
    '####################',
    '####################'] },

  { name:'THE DEEP WORKING', quota:7,
    hint:'Everything you have learned, in one room.',
    map:[
    '####################',
    '#P...OOOO..........#',
    '#....****..........#',
    '#..................#',
    '####.##########.####',
    '#b                 #',
    '#                  #',
    '####.##########.####',
    '#..................#',
    '#..*....*....*..*..#',
    '#.................E#',
    '####################'] }
];

/* ---------------- state ---------------- */
let lvl=0, g=[], pr=1, pc=1, gems=0, quota=0;
let falling=new Set(), grubs=[], tickT=0;
let deadT=0, doneT=0, introT=0, exitLatch=true, restartLatch=true;
let shakeT=0, runGems=0, runDeaths=0, allDone=false;

/* ---- smoothing ----------------------------------------------------------
   The SIMULATION stays on its fixed tick — that is what makes the physics
   deterministic and what the solution tests drive. Only the DRAWING is
   interpolated: everything remembers the tile it came from and is rendered
   part-way between the two. Nothing below changes a single rule. */
let ppr=1, ppc=1;                 // the player's previous tile
let slides=[];                    // [{fr,fc,tr,tc,t}] blocks that moved this tick
let noLerp=false;                 // suppress player lerp for one tick (see push)

/* ---- heavy boulders -----------------------------------------------------
   A boulder is not a thing you stroll through. Leaning on one moves it at a
   QUARTER of walking speed: four consecutive ticks of pushing the same rock
   the same way before it — and you — advance one tile. */
const PUSH_TICKS=4;
let push={r:-1, c:-1, dc:0, n:0};
const pushProgress=()=> push.n<=0 ? 0 : Math.min(1, (push.n + (tickT/TICK)) / PUSH_TICKS);
function resetPush(){ push={r:-1,c:-1,dc:0,n:0}; }

const isRound=t=>t==='O'||t==='*';
const idx=(r,c)=>r*W+c;

function loadLevel(n){
  lvl=n;
  const L=LEVELS[n];
  g=L.map.map(row=>row.split(''));
  quota=L.quota; gems=0;
  falling=new Set(); grubs=[];
  for(let r=0;r<H;r++) for(let c=0;c<W;c++){
    const t=g[r][c];
    if(t==='P'){ pr=r; pc=c; g[r][c]=' '; }
    else if(t==='a'||t==='b') grubs.push({r,c,pr:r,pc:c,type:t,dir:2});
  }
  deadT=0; doneT=0; introT=150; tickT=0; shakeT=0;
  ppr=pr; ppc=pc; slides=[]; noLerp=false; resetPush();
}

/* count how many gems a level can possibly yield, so quota is honest */
function gemsAvailable(){
  let n=0;
  for(let r=0;r<H;r++) for(let c=0;c<W;c++) if(g[r][c]==='*') n++;
  return n + grubs.length*8;   // a crushed grub yields up to 8 new gems
}

/* ---------------- death + explosion ---------------- */
function kill(reason){
  if(deadT>0||doneT>0) return;
  deadT=90; runDeaths++;
  shakeT=18;
  puff(pc*TS+16, pr*TS+16, '#ff6a6a', 16);
  sfx.die && sfx.die();
  toast(reason);
}
function explode(r,c){
  for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
    const rr2=r+dr, cc=c+dc;
    if(rr2<0||rr2>=H||cc<0||cc>=W) continue;
    if(g[rr2][cc]==='#') continue;                 // bedrock survives everything
    for(let i=grubs.length-1;i>=0;i--) if(grubs[i].r===rr2&&grubs[i].c===cc) grubs.splice(i,1);
    g[rr2][cc]='*';
    falling.delete(idx(rr2,cc));
    if(rr2===pr&&cc===pc) kill('Caught in the burst.');
  }
  shakeT=14;
  puff(c*TS+16, r*TS+16, '#ffd23f', 22);
  sfx.explode && sfx.explode();
}

/* ---------------- the player's tick ---------------- */
function playerStep(){
  const d=dirHeld();
  let dc=0, dr=0;
  if(d.x) dc=d.x>0?1:-1; else if(d.y) dr=d.y>0?1:-1;
  if(!dc&&!dr){ resetPush(); return; }
  const nr=pr+dr, nc=pc+dc;
  if(nr<0||nr>=H||nc<0||nc>=W) return;
  const t=g[nr][nc];

  if(t==='#'){ resetPush(); return; }
  if(t==='a'||t==='b'){ resetPush(); kill('You walked into it.'); return; }
  if(t==='E'){
    resetPush();
    if(gems>=quota){ finishLevel(); }
    else { addFloat(nc*TS+16, nr*TS+4, (quota-gems)+' more', '#ffb0b0'); sfx.denied && sfx.denied(); }
    return;
  }
  if(t==='O'){
    if(dr!==0){ resetPush(); return; }               // you cannot push a boulder up or down
    const bc=nc+dc;
    if(bc<0||bc>=W||g[nr][bc]!==' '){ resetPush(); return; }   // nowhere for it to go
    // four ticks of steady pressure on the SAME rock in the SAME direction
    if(push.r===nr && push.c===nc && push.dc===dc) push.n++;
    else push={r:nr, c:nc, dc:dc, n:1};
    if(push.n<PUSH_TICKS){
      if(push.n===1){ sfx.hit && sfx.hit(); }
      return;                                        // heaving, not moving
    }
    g[nr][bc]='O'; g[nr][nc]=' ';
    falling.delete(idx(nr,nc));
    slides.push({fr:nr, fc:nc, tr:nr, tc:bc, t:'O'});
    resetPush();
    noLerp=true;                                     // the rock already crept there
    sfx.mine && sfx.mine();
  } else if(t==='*'){
    resetPush();
    gems++; runGems++;
    g[nr][nc]=' ';
    falling.delete(idx(nr,nc));
    addFloat(nc*TS+16, nr*TS+6, '+1', '#7fe7ff');
    sfx.coin && sfx.coin();
    if(gems===quota) toast('Quota met. The gate is open.');
  } else if(t==='.'){
    resetPush();
    g[nr][nc]=' ';
    sfx.mine && sfx.mine();
  } else {
    resetPush();                                     // walking through open air
  }
  pr=nr; pc=nc;
}

/* ---------------- gravity ----------------
   Bottom-up so a stacked column falls together. */
function gravityStep(){
  const next=new Set();
  for(let r=H-2;r>=0;r--){
    for(let c=1;c<W-1;c++){
      const t=g[r][c];
      if(t!=='O'&&t!=='*') continue;
      const key=idx(r,c), wasFalling=falling.has(key);
      const br=r+1, below=g[br][c];

      if(br===pr&&c===pc){                          // the player is directly under it
        if(wasFalling) kill('Crushed.');            // ...but only a FALLING one crushes
        continue;
      }
      if(below===' '){
        g[br][c]=t; g[r][c]=' ';
        next.add(idx(br,c));
        slides.push({fr:r, fc:c, tr:br, tc:c, t});
        continue;
      }
      if(wasFalling && (below==='a'||below==='b')){ explode(br,c); continue; }
      if(isRound(below)){                            // roll off a rounded shoulder
        if(g[r][c-1]===' ' && g[br][c-1]===' '){
          g[r][c-1]=t; g[r][c]=' '; next.add(idx(r,c-1));
          slides.push({fr:r, fc:c, tr:r, tc:c-1, t}); continue;
        }
        if(g[r][c+1]===' ' && g[br][c+1]===' '){
          g[r][c+1]=t; g[r][c]=' '; next.add(idx(r,c+1));
          slides.push({fr:r, fc:c, tr:r, tc:c+1, t}); continue;
        }
      }
      if(wasFalling){                                // it just landed
        sfx.chop && sfx.chop();
        for(let i=0;i<3;i++) puff(c*TS+16, r*TS+28, '#6b5a48', 1);
      }
    }
  }
  falling=next;
}

/* ---------------- grubs ----------------
   Deterministic wall-hugging. 'a' prefers a left turn, 'b' a right
   turn. Same layout, opposite grub, completely different level. */
const DIRS=[[-1,0],[0,1],[1,0],[0,-1]];   // up, right, down, left
function grubStep(){
  for(const gr of grubs){
    const order = gr.type==='a'
      ? [(gr.dir+3)%4, gr.dir, (gr.dir+1)%4, (gr.dir+2)%4]
      : [(gr.dir+1)%4, gr.dir, (gr.dir+3)%4, (gr.dir+2)%4];
    let moved=false;
    for(const d of order){
      const nr=gr.r+DIRS[d][0], nc=gr.c+DIRS[d][1];
      if(nr<0||nr>=H||nc<0||nc>=W) continue;
      if(nr===pr&&nc===pc){ gr.dir=d; kill('It found you.'); return; }
      if(g[nr][nc]!==' ') continue;
      g[gr.r][gr.c]=' ';
      gr.pr=gr.r; gr.pc=gr.c;                        // remember, so drawing can glide
      gr.r=nr; gr.c=nc; gr.dir=d;
      g[nr][nc]=gr.type;
      moved=true; break;
    }
    if(!moved){ gr.pr=gr.r; gr.pc=gr.c; gr.dir=(gr.dir+1)%4; }   // boxed in: turn on the spot
  }
}

/* ---------------- level flow ---------------- */
function finishLevel(){
  doneT=110;
  sfx.win && sfx.win();
  allDone = (lvl>=LEVELS.length-1);
}
function advance(){
  if(allDone){
    flags.workingsDone=true;
    res.gold+=60;
    toast('DIGGY J cleared. +60 gold.');
    if(window.Interlude){
      Interlude.offer('breathe', {
        title:'That was a long way down.',
        sub:'You solved every one of those with your head, not your hands. Sit back for a minute before the next thing.'
      });
    }
    exitLatch=true;
    startWorkingsTrans('out');
    return;
  }
  const nxt=lvl+1;
  loadLevel(nxt);
  if(nxt===3 && window.Interlude){
    Interlude.offer('float', {
      title:'Halfway down.',
      sub:'Three solved. Hands off the keys for thirty seconds — the next three are the ones that need a clear head.'
    });
  }
}

/* ---------------- update ---------------- */
function update(){
  if(introT>0) introT--;
  if(shakeT>0) shakeT--;

  if(deadT>0){
    if(--deadT===0) loadLevel(lvl);
    return;
  }
  if(doneT>0){
    if(--doneT===0) advance();
    return;
  }

  if(held['r']||held['R']){
    if(!restartLatch){ restartLatch=true; loadLevel(lvl); return; }
  } else restartLatch=false;

  if(held['Escape']){
    if(!exitLatch){ exitLatch=true; startWorkingsTrans('out'); return; }
  } else exitLatch=false;

  if(++tickT<TICK) return;
  tickT=0;

  // everything that is about to move remembers where it was
  ppr=pr; ppc=pc; slides=[]; noLerp=false;
  for(const gr of grubs){ gr.pr=gr.r; gr.pc=gr.c; }

  playerStep();
  if(deadT>0||doneT>0) return;
  gravityStep();
  if(deadT>0) return;
  grubStep();
}

/* ---------------- draw ---------------- */
function tileTop(r,c){ return r*TS+HUD; }

/* Three cuts of each material, picked deterministically from the tile's own
   coordinates — so a wall never looks like wallpaper, and a tile always looks
   the same on a restart. Variety in the ART only; the rules do not know. */
const SPOIL_V=[
  {top:'#7d5334', bot:'#5e3a24', grit:3},
  {top:'#87593a', bot:'#623d26', grit:5},
  {top:'#734b30', bot:'#573520', grit:2}
];
function drawSpoil(x,y,r,c){
  const v=SPOIL_V[Math.floor(hash2(c*7+1,r*13+5)*3)%3];
  const h=hash2(c,r);
  ctx.fillStyle=v.top; ctx.fillRect(x,y,TS,TS);
  ctx.fillStyle=v.bot; ctx.fillRect(x,y+TS*0.62,TS,TS*0.38);
  // a soft dug-out scoop so the seam is never a straight line
  ctx.fillStyle='rgba(0,0,0,.10)';
  ctx.beginPath();
  ctx.ellipse(x+TS*(0.3+h*0.4), y+TS*0.62, TS*0.34, 3.5, 0, 0, 7); ctx.fill();
  for(let i=0;i<v.grit;i++){
    const gh=hash2(c*11+i*3, r*5+i*17);
    ctx.fillStyle= gh>0.55 ? 'rgba(255,220,170,.11)' : 'rgba(0,0,0,.15)';
    ctx.fillRect(x+2+gh*26, y+3+((gh*97+i*23)%26), 3+gh*2, 2.5);
  }
}
/* Bedrock is edge-lit from whichever side is OPEN. A side wall gets a vertical
   highlight, a floor gets a horizontal one, and a corner gets both — the old
   version drew the horizontal-run treatment on every tile, which is why the
   left and right walls looked wrong. */
function drawBedrock(x,y,r,c){
  const rock=(rr,cc)=> (rr<0||rr>=H||cc<0||cc>=W) ? true : g[rr][cc]==='#';
  const up=rock(r-1,c), dn=rock(r+1,c), lf=rock(r,c-1), rt=rock(r,c+1);
  const v=Math.floor(hash2(c*5+3, r*9+1)*3)%3;
  ctx.fillStyle=['#3d3a52','#413d58','#39364c'][v];
  ctx.fillRect(x,y,TS,TS);
  ctx.fillStyle='#2a2738';
  ctx.fillRect(x,y+TS*0.66,TS,TS*0.34);
  // masonry seams, offset per row so the courses interlock like real blocks
  ctx.strokeStyle='rgba(0,0,0,.16)'; ctx.lineWidth=1;
  const off=(r%2)?0:TS/2;
  ctx.beginPath(); ctx.moveTo(x, y+TS*0.5); ctx.lineTo(x+TS, y+TS*0.5);
  ctx.moveTo(x+off, y); ctx.lineTo(x+off, y+TS*0.5);
  ctx.moveTo(x+(off+TS/2)%TS, y+TS*0.5); ctx.lineTo(x+(off+TS/2)%TS, y+TS);
  ctx.stroke();
  const LIT='rgba(255,255,255,.09)', DARK='rgba(0,0,0,.26)';
  if(!up){ ctx.fillStyle=LIT; ctx.fillRect(x+ (lf?0:2), y+2, TS-(lf?0:2)-(rt?0:2), 3); }
  if(!lf){ ctx.fillStyle=LIT; ctx.fillRect(x+2, y+(up?0:2), 3, TS-(up?0:2)-(dn?0:2)); }
  if(!dn){ ctx.fillStyle=DARK; ctx.fillRect(x, y+TS-2, TS, 2); }
  if(!rt){ ctx.fillStyle=DARK; ctx.fillRect(x+TS-2, y, 2, TS); }
  // rounded inner corner where two open faces meet
  if(!up&&!lf){ ctx.fillStyle=LIT; ctx.fillRect(x+2,y+2,4,4); }
  if(!up&&!rt){ ctx.fillStyle=LIT; ctx.fillRect(x+TS-6,y+2,4,4); }
}
const BOULDER_V=[
  {rx:13,  ry:12.5, lit:'#9aa0b5', dim:'#5f6478', gx:11,  gy:11,  gr:4},
  {rx:12.4,ry:13,   lit:'#a3a8bd', dim:'#666b80', gx:12.5,gy:10.5,gr:3.4},
  {rx:13.4,ry:11.8, lit:'#9399ae', dim:'#585d71', gx:10,  gy:12,  gr:4.6}
];
function drawBoulder(x,y,r,c){
  const v=BOULDER_V[Math.floor(hash2((c||0)*3+7,(r||0)*11+2)*3)%3];
  GFX.shadow(ctx, x+TS/2, y+TS-3, 12, 0.30);
  GFX.body(ctx, x+TS/2, y+TS/2-1, v.rx, v.ry, v.lit, v.dim);
  ctx.strokeStyle='rgba(20,18,30,.30)'; ctx.lineWidth=1.1; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(x+TS/2-5, y+TS/2+2); ctx.lineTo(x+TS/2+1, y+TS/2+5);
  ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.28)';
  ctx.beginPath(); ctx.ellipse(x+v.gx,y+v.gy,v.gr,2.6,-0.5,0,7); ctx.fill();
}
function drawGem(x,y){
  const cx=x+TS/2, cy=y+TS/2, p=0.6+0.4*Math.sin(frame*0.08+cx);
  const gl=ctx.createRadialGradient(cx,cy,2,cx,cy,16);
  gl.addColorStop(0,'rgba(79,224,200,'+(0.42*p).toFixed(2)+')');
  gl.addColorStop(1,'rgba(79,224,200,0)');
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(cx,cy,16,0,7); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx,cy-11); ctx.lineTo(cx+9,cy); ctx.lineTo(cx,cy+11); ctx.lineTo(cx-9,cy);
  ctx.closePath();
  ctx.fillStyle='#4fe0c8'; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle='#1f9c8c'; ctx.fillRect(cx-10,cy+1,20,12);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(cx,cy-11); ctx.lineTo(cx+9,cy); ctx.lineTo(cx,cy+11); ctx.lineTo(cx-9,cy);
  ctx.closePath(); GFX.ink(ctx,1.6);
  ctx.fillStyle='rgba(255,255,255,.75)';
  ctx.beginPath(); ctx.ellipse(cx-3,cy-4,2.4,1.4,-0.6,0,7); ctx.fill();
}
function drawGrub(x,y,gr){
  const cx=x+TS/2, cy=y+TS/2;
  GFX.shadow(ctx, cx, y+TS-3, 11, 0.26);
  const spin=frame*0.05*(gr.type==='a'?1:-1);
  ctx.fillStyle='#a51f4e';
  for(let i=0;i<8;i++){
    const a=spin+i*0.785;
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(a)*6, cy+Math.sin(a)*6);
    ctx.lineTo(cx+Math.cos(a+0.28)*6, cy+Math.sin(a+0.28)*6);
    ctx.lineTo(cx+Math.cos(a+0.14)*13, cy+Math.sin(a+0.14)*13);
    ctx.closePath(); ctx.fill();
  }
  GFX.body(ctx, cx, cy, 9, 9, '#e8407a', '#a51f4e');
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.arc(cx-3,cy-1,2.6,0,7); ctx.arc(cx+3,cy-1,2.6,0,7); ctx.fill();
  ctx.fillStyle='#12101a';
  const lx=DIRS[gr.dir][1]*0.9, ly=DIRS[gr.dir][0]*0.9;
  ctx.beginPath(); ctx.arc(cx-3+lx,cy-1+ly,1.3,0,7); ctx.arc(cx+3+lx,cy-1+ly,1.3,0,7); ctx.fill();
}
function drawGate(x,y){
  const open=gems>=quota, cx=x+16, cy=y+16;
  ctx.fillStyle=open?'#2a2010':'#231f30';
  ctx.fillRect(x,y,TS,TS);
  if(open){
    const p=0.55+0.45*Math.sin(frame*0.1);
    // a wide bloom so it is findable from the far side of the room
    const far=ctx.createRadialGradient(cx,cy,4,cx,cy,54);
    far.addColorStop(0,'rgba(255,210,63,'+(0.30*p).toFixed(3)+')');
    far.addColorStop(1,'rgba(255,210,63,0)');
    ctx.fillStyle=far; ctx.fillRect(x-40,y-40,TS+80,TS+80);
    const gl=ctx.createRadialGradient(cx,cy,2,cx,cy,20);
    gl.addColorStop(0,'rgba(255,236,150,'+(0.62*p).toFixed(3)+')');
    gl.addColorStop(1,'rgba(255,210,63,0)');
    ctx.fillStyle=gl; ctx.fillRect(x-6,y-6,TS+12,TS+12);
    // slow shafts of light turning in the doorway
    ctx.save();
    ctx.beginPath(); ctx.rect(x,y,TS,TS); ctx.clip();
    ctx.globalAlpha=0.16+0.10*p;
    ctx.fillStyle='#fff3c4';
    for(let i=0;i<4;i++){
      const a=frame*0.012+i*1.57;
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,26,a,a+0.30); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    const rise=Math.sin(frame*0.1)*1.2;
    ctx.fillStyle='#ffd23f'; ctx.fillRect(x+6,y+4+rise,20,24);
    ctx.fillStyle='#fff6cf'; ctx.fillRect(x+9,y+7+rise,14,10);   // hot centre
    ctx.fillStyle='#8a6a10'; ctx.fillRect(x+6,y+20+rise,20,8);
    ctx.beginPath(); ctx.rect(x+6,y+4+rise,20,24); GFX.ink(ctx,1.6);
    // motes drifting up out of the opening
    for(let i=0;i<3;i++){
      const t=((frame*1.6+i*37)%64)/64;
      ctx.fillStyle='rgba(255,240,180,'+(0.5*(1-t)).toFixed(2)+')';
      ctx.fillRect(cx-7+((i*11+Math.floor(frame*0.05))%15), y+26-t*24, 2, 2);
    }
  } else {
    // unmistakably SHUT, and it tells you what it is waiting for
    ctx.fillStyle='#1b1826'; ctx.fillRect(x+5,y+3,22,26);
    ctx.strokeStyle='#5a4a6a'; ctx.lineWidth=3; ctx.strokeRect(x+6,y+4,20,24);
    ctx.strokeStyle='#4a3d5c'; ctx.lineWidth=2;
    for(let i=1;i<4;i++){ ctx.beginPath(); ctx.moveTo(x+6,y+4+i*6); ctx.lineTo(x+26,y+4+i*6); ctx.stroke(); }
    ctx.fillStyle='#6b5a7f';
    ctx.beginPath(); ctx.arc(cx,cy+1,4.5,0,7); ctx.fill();
    ctx.fillStyle='#231f30'; ctx.fillRect(cx-1.2,cy,2.4,5);
    const need=Math.max(0,quota-gems);
    if(need>0 && (frame%150)<70){
      ctx.textAlign='center'; ctx.font='bold 9px '+FONT;
      ctx.fillStyle='rgba(255,176,176,.85)';
      ctx.fillText(need+' more', cx, y-3);
    }
  }
}
function drawDigger(x,y){
  const SKIN='#e8d9b0', HAT='#d8a33a', SUIT='#3f6a4a', LEG='#2c4a34';
  const cx=x+TS/2, base=y+TS-4;
  GFX.shadow(ctx, cx, base+2, 9, 0.32);
  GFX.box(ctx, cx-5, base-8, 4.5, 8, LEG, GFX.dim(LEG,0.7), 1.5);
  GFX.box(ctx, cx+0.5, base-8, 4.5, 8, LEG, GFX.dim(LEG,0.7), 1.5);
  GFX.box(ctx, cx-5.5, base-20, 11, 13, SUIT, GFX.dim(SUIT,0.68), 3);
  GFX.body(ctx, cx, base-24, 6, 6, SKIN, GFX.dim(SKIN,0.76));
  ctx.beginPath(); ctx.arc(cx,base-27,6.6,Math.PI,0);
  ctx.fillStyle=HAT; ctx.fill(); GFX.ink(ctx,1.5);
  ctx.fillStyle='#fff3c4'; ctx.beginPath(); ctx.arc(cx+5,base-27,2,0,7); ctx.fill();
  ctx.fillStyle='#0b1c16';
  ctx.beginPath(); ctx.arc(cx+2,base-25,1.3,0,7); ctx.fill();
}

function draw(){
  const L=LEVELS[lvl];
  ctx.save();
  if(shakeT>0) ctx.translate((Math.random()-0.5)*shakeT*0.5,(Math.random()-0.5)*shakeT*0.5);

  ctx.fillStyle='#221a2e'; ctx.fillRect(-8,HUD-8,RW+16,RH+16);

  for(let r=0;r<H;r++) for(let c=0;c<W;c++){
    const x=c*TS, y=tileTop(r,c), t=g[r][c];
    if(t==='#') drawBedrock(x,y,r,c);
    else if(t==='.') drawSpoil(x,y,r,c);
    else if(t==='E') drawGate(x,y);
  }
  /* --- everything that moves is drawn part-way between its two tiles --- */
  const a=Math.max(0, Math.min(1, tickT/TICK));
  const lerp=(p,n)=> p+(n-p)*a;
  // a block mid-slide is drawn along its path, so skip it where it landed
  const arriving=new Set(slides.map(s=>idx(s.tr,s.tc)));

  for(let r=0;r<H;r++) for(let c=0;c<W;c++){
    if(arriving.has(idx(r,c))) continue;
    const x=c*TS, y=tileTop(r,c), t=g[r][c];
    if(t==='O') drawBoulder(x,y,r,c);
    else if(t==='*') drawGem(x,y);
  }
  for(const s of slides){
    const x=lerp(s.fc,s.tc)*TS, y=tileTop(0,0)+lerp(s.fr,s.tr)*TS;
    if(s.t==='O') drawBoulder(x,y,s.tr,s.tc); else drawGem(x,y);
  }
  // a boulder being leaned on creeps toward its destination over four ticks
  if(push.n>0){
    const p=pushProgress();
    drawBoulder((push.c+push.dc*p)*TS, tileTop(push.r,push.c), push.r, push.c);
  }
  for(const gr of grubs){
    const gpr=(gr.pr===undefined?gr.r:gr.pr), gpc=(gr.pc===undefined?gr.c:gr.pc);
    drawGrub(lerp(gpc,gr.c)*TS, tileTop(0,0)+lerp(gpr,gr.r)*TS, gr);
  }
  if(deadT===0 || (frame>>2)%2){
    // while shoving, the digger leans in with the rock instead of standing still
    const shove=push.n>0 ? pushProgress()*0.55*push.dc : 0;
    const dx=noLerp ? pc : lerp(ppc,pc), dy=noLerp ? pr : lerp(ppr,pr);
    drawDigger((dx+shove)*TS, tileTop(0,0)+dy*TS);
  }

  ctx.restore();

  // HUD
  const hg=ctx.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#2c2140'); hg.addColorStop(1,'#181022');
  ctx.fillStyle=hg; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle='rgba(79,224,200,.35)'; ctx.fillRect(0,HUD-2,RW,2);
  ctx.textAlign='left'; ctx.font='bold 14px '+FONT; ctx.fillStyle='#4fe0c8';
  ctx.fillText('DIGGY J', 12, 20);
  ctx.font='11px '+FONT; ctx.fillStyle='#9a86b8';
  ctx.fillText((lvl+1)+' of '+LEVELS.length+' · '+L.name, 12, 37);
  ctx.textAlign='right';
  ctx.font='bold 16px '+FONT;
  ctx.fillStyle= gems>=quota ? '#ffd23f' : '#e8e2f2';
  ctx.fillText(gems+' / '+quota+' gems', RW-12, 22);
  ctx.font='10px '+FONT; ctx.fillStyle='#7a6b94';
  ctx.fillText('R restart  ·  ESC leave', RW-12, 38);

  if(introT>0){
    ctx.globalAlpha=Math.min(1,introT/40);
    ctx.textAlign='center';
    ctx.font='bold 15px '+FONT; ctx.fillStyle='#ffd23f';
    ctx.fillText(L.name, RW/2, HUD+RH-42);
    ctx.font='12px '+FONT; ctx.fillStyle='#d8cfe8';
    ctx.fillText(L.hint, RW/2, HUD+RH-22);
    ctx.globalAlpha=1;
  }
  if(deadT>0){
    ctx.textAlign='center';
    ctx.font='bold 13px '+FONT; ctx.fillStyle='#ff9a9a';
    ctx.fillText('Again. It costs you nothing.', RW/2, HUD+30);
  }
  if(doneT>0){
    ctx.globalAlpha=Math.min(1,(110-doneT)/20);
    ctx.fillStyle='rgba(8,6,14,.72)'; ctx.fillRect(0,HUD,RW,RH);
    ctx.textAlign='center';
    ctx.font='bold 22px '+FONT; ctx.fillStyle='#ffd23f';
    ctx.fillText(allDone?'DIGGY J CLEARED':'LEVEL CLEAR', RW/2, HUD+RH/2-6);
    ctx.font='12px '+FONT; ctx.fillStyle='#d8cfe8';
    ctx.fillText(allDone? LEVELS.length+' rooms, one set of rules, no luck involved.'
                        : LEVELS[lvl+1].name+' next.', RW/2, HUD+RH/2+18);
    ctx.globalAlpha=1;
  }
}

/* ---------------- API ---------------- */
window.WorkingsLayer={
  enter(){
    runGems=0; runDeaths=0; allDone=false;
    exitLatch=true; restartLatch=true;
    loadLevel(0);
    toast('DIGGY J. Nothing here is random.');
  },
  exitDone(){},
  update, draw,
  /* exposed so the headless test drives the real engine, not a copy */
  _t:{ get grid(){return g;}, get player(){return {r:pr,c:pc};},
       get gems(){return gems;}, get quota(){return quota;},
       get grubs(){return grubs;}, get dead(){return deadT;},
       get done(){return doneT;}, get level(){return lvl;},
       LEVELS, loadLevel, playerStep, gravityStep, grubStep,
       setPlayer(r,c){pr=r;pc=c;} }
};

})();
