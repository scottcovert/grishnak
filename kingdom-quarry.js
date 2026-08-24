"use strict";
/* ============================================================
   GRISHNAK — DANGER BLOCKS (was MINER THREAT)
   Smash rock, chop the beams, bring down the ceiling on purpose.

   THE MATERIAL LANGUAGE (one glance = one physics class):
     STEEL '#'   riveted blue-grey plates — never breaks, never moves
     BOULDER 'B' round warm granite      — never breaks, FALLS
     ROCK/CRACKED/SAND/GEM               — breakable, fall when unsupported
     WOOD 'W'    planks                  — breakable, holds the span above

   TESTING KEYS: E leaves to the Arcade, H hauls you back to the
   entry lip (free — a shipping version would charge a life, like
   the ESC-suicide in commercial Boulder Dash).
   Everything you break has WEIGHT ABOVE IT. Break the wrong thing
   and the stack comes down; break them in the right order and the
   quarry does the work for you.

   THE ONE RULE: nothing ever kills you without telling you first.
   Every unsupported block TEETERS (shakes + spits dust + cracks)
   for a beat before it falls. Read the stack, then swing.

   Legend: '#' bedrock  'R' rock(2)  'C' cracked(1)  'B' boulder(falls,
   unbreakable)  'S' sand(1, slides off round tops)  'W' wood beam(1,
   holds up the span above it)  'G' gem  ' ' air
   ============================================================ */
(function(){

const QW=20, QH=12;                 // tiles
const GRAV=0.46, MOVE=2.15, MAXFALL=8.5;
const TEETER=48;                    // frames a block shakes before it drops
const FALLSPD=6;                    // frames per tile of falling

/* FOUR PITS (Scott 2026-08-12: "needs to start off easier — the current
   first level should be maybe level 4"). Pits 1-3 are teaching pits:
   1 THE OPEN CUT — dig, collect, watch one stack come down.
   2 THE BOULDER YARD — grind columns from the bottom; boulder caps chase
     the gems down to you.
   3 THE BEAM GALLERY — wood holds pockets in the air; chop the beam,
     crash the pocket, mine the rubble.
   4 THE DEEP FACE — the original quarry, untouched.
   The hoist at the end of each pit rides you DOWN to the next; the last
   one rides you out. Progress persists (flags.quarryPit); 1-4 jump. */
//QUARRYMAP-START
const MAPS=[
[ // PIT 1 — THE OPEN CUT
"                    ",
"                    ",
"####            ####",
"#..................#",
"#..................#",
"#..................#",
"#..................#",
"#..................#",
"#....R.....B.......#",
"#....R.....C..R....#",
"#...RGR....G..GR...#",
"####################"
],
[ // PIT 2 — THE BOULDER YARD
"                    ",
"                    ",
"####            ####",
"#..................#",
"#..................#",
"#.B.......B........#",
"#.R.......S....B...#",
"#.G.......G....R...#",
"#.R..RR...R....G...#",
"#.R..GR...R....R...#",
"#.R..RR...G....R...#",
"####################"
],
[ // PIT 3 — THE BEAM GALLERY
"                    ",
"                    ",
"####            ####",
"#..................#",
"#..RRR......RRR....#",
"#..RGR......RGR....#",
"#..WWW......WWW....#",
"#..................#",
"#.....B......B.....#",
"#.....W......W.....#",
"#.G....GG.......G..#",
"####################"
],
[ // PIT 4 — THE DEEP FACE (the original)
"                    ",
"   R      W       R ",
"###RR####WW####RRR##",
"#.GCG..RR..S..R.G..#",
"#.RR#..CC.SS..RR.R.#",
"#..W...GB..W..C.GW.#",
"#RRW#RRCC#WW#RCC.RW#",
"#..S..G..R..S..G...#",
"#.CC#.RR.#..RR#.CC.#",
"#R.W..B..W..B..W..R#",
"#..C..RR#RR..CCG.R.#",
"####################"
]];
//QUARRYMAP-END
const PIT_GEMS=[3,4,5,6];
const PIT_NAMES=['THE OPEN CUT','THE BOULDER YARD','THE BEAM GALLERY','THE DEEP FACE'];

const ENTRY={x:1.5*32, y:1*32};     // you rappel in at the top-left lip
const EXIT_T={c:18, r:10};          // the hoist cage, bottom-right

let g=[], falls=[], teeters=[];     // grid, active falling blocks, telegraphed ones
let pl={x:0,y:0,vx:0,vy:0,onGround:false,face:1,hitT:0,digT:0};
let gems=0, hoistFixed=false, introT=0, exitLatch=false, spaceWas=false, shakeT=0, dust=[];
let hp=0, maxhp=0, pit=0;
const needGems=()=>PIT_GEMS[pit];

const SOLID='#RCBSWG';
const FALLING='RCBSG';              // these obey gravity when unsupported
const HITS={R:2, C:1, S:1, W:1, G:1};

function at(c,r){ if(c<0||c>=QW||r<0||r>=QH) return '#'; return g[r][c]; }
function set(c,r,ch){ if(c<0||c>=QW||r<0||r>=QH) return; g[r]=g[r].substring(0,c)+ch+g[r].substring(c+1); }
function solid(c,r){ return SOLID.indexOf(at(c,r))>=0; }
function tileAtPx(x,y){ return {c:Math.floor(x/32), r:Math.floor(y/32)}; }

/* ---------------- support model ----------------
   A tile is SUPPORTED if something solid is under it, OR a wood beam
   anywhere on its row-below span holds it (beams carry the ceiling). */
function unsupported(c,r){
  const ch=at(c,r);
  if(FALLING.indexOf(ch)<0) return false;
  if(solid(c,r+1)) return false;
  return true;
}
function teetering(c,r){ return teeters.some(t=>t.c===c&&t.r===r); }
function falling(c,r){ return falls.some(f=>f.c===c&&f.r===r); }

function scanSupports(){
  for(let r=QH-2;r>=0;r--) for(let c=0;c<QW;c++){
    if(unsupported(c,r) && !teetering(c,r) && !falling(c,r)){
      teeters.push({c,r,t:TEETER});
      if(at(c,r)==='B') puff(c*32+16,r*32+16,'#b7a58c',3);
    }
  }
}
function stepTeeters(){
  for(let i=teeters.length-1;i>=0;i--){
    const t=teeters[i];
    if(!unsupported(t.c,t.r)){ teeters.splice(i,1); continue; }   // re-supported: stand down
    t.t--;
    if(t.t%9===0) dust.push({x:t.c*32+8+Math.random()*16, y:t.r*32+30, vy:0.5+Math.random()*0.6, life:26});
    if(t.t<=0){
      const ch=at(t.c,t.r);
      set(t.c,t.r,' ');
      falls.push({c:t.c, r:t.r, ch:ch, sub:0});
      teeters.splice(i,1);
      if(ch==='B') sfx.hurt && sfx.hurt();
    }
  }
}
function stepFalls(){
  for(let i=falls.length-1;i>=0;i--){
    const f=falls[i];
    f.sub++;
    if(f.sub<FALLSPD) continue;
    f.sub=0;
    // squash check: is the player in the tile we're about to enter?
    const nr=f.r+1;
    if(pl.hitT<=0){
      const pc=Math.floor(pl.x/32), prr=Math.floor((pl.y-10)/32), pr2=Math.floor((pl.y-26)/32);
      if(f.c===pc && (nr===prr || nr===pr2)) hurt(f.ch==='B'?2:1, f.c, nr);
    }
    // another falling block already occupies the tile below: land on it rather than merge
    const blockedByFaller = falls.some(o=>o!==f && o.c===f.c && o.r===nr);
    if(solid(f.c,nr) || nr>=QH || blockedByFaller){
      if(blockedByFaller && !solid(f.c,nr) && nr<QH){ continue; }   // wait a beat, keep stacking order
      // land: sand slides off round shoulders instead of stacking neatly
      if(f.ch==='S' && at(f.c,f.r)===' '){
        const under=at(f.c,nr);
        if((under==='B'||under==='R') && at(f.c-1,f.r)===' ' && at(f.c-1,nr)===' '){ f.c--; continue; }
        if((under==='B'||under==='R') && at(f.c+1,f.r)===' ' && at(f.c+1,nr)===' '){ f.c++; continue; }
      }
      set(f.c,f.r,f.ch);
      falls.splice(i,1);
      puff(f.c*32+16,f.r*32+28,'#8d7f6a',5);
      shakeT=Math.max(shakeT, f.ch==='B'?9:5);
      sfx.pick && sfx.pick();
      scanSupports();
      continue;
    }
    f.r=nr;
  }
}

/* ---------------- damage (gentle: the quarry bruises, it doesn't kill) --------- */
function hurt(n, c, r){
  if(pl.hitT>0) return;
  hp=Math.max(0, hp-n);
  pl.hitT=100; shakeT=12;
  puff(pl.x, pl.y-14, '#ff6a6a', 12); sfx.hurt && sfx.hurt();
  addFloat(pl.x, pl.y-30, '-'+n+' ♥', '#ff6a6a');
  if(hp<=0){
    hp=Math.max(2, Math.ceil(maxhp/2));
    pl.x=ENTRY.x; pl.y=ENTRY.y; pl.vx=0; pl.vy=0; pl.hitT=140;
    toast('The foreman hauls you back up the lip. Nothing broken. Read the stack next time.');
  } else {
    toast(r!==undefined && at(c,r)==='B' ? 'A boulder. It gave you a full second of warning.' : 'Rock to the shoulder.');
  }
}

/* ---------------- digging ---------------- */
function dig(){
  if(pl.digT>0) return;
  let c, r;
  const pc=Math.floor(pl.x/32), pr=Math.floor((pl.y-16)/32);
  if(held.ArrowDown){ c=pc; r=Math.floor((pl.y+6)/32); }
  else if(held.ArrowUp){ c=pc; r=pr-1; }
  else { c=pc+pl.face; r=pr; }
  const ch=at(c,r);
  if(ch===' '){ return; }
  if(ch==='#'){ addFloat(c*32+16,r*32+8,'bedrock','#9aa'); pl.digT=14; return; }
  if(ch==='B'){ addFloat(c*32+16,r*32+8,'too solid to break','#c9bda6'); pl.digT=16; return; }
  pl.digT=(ch==='R')?20:14;
  const key=c+','+r;
  dmg[key]=(dmg[key]||0)+1;
  puff(c*32+16, r*32+16, ch==='W'?'#8a5a2a':'#a99a80', 6);
  sfx.hit ? sfx.hit() : (sfx.pick && sfx.pick());
  if(dmg[key] >= (HITS[ch]||1)){
    delete dmg[key];
    if(ch==='G'){
      gems++; res.gold=Math.min(999,res.gold+8);
      addFloat(c*32+16, r*32+4, 'GEM  '+gems+'/'+needGems(), '#7fe7ff');
      puff(c*32+16,r*32+16,'#7fe7ff',12); sfx.coin && sfx.coin();
      if(gems>=needGems() && !hoistFixed){
        hoistFixed=true;
        toast(needGems()+' good stones — enough to counterweight the hoist. The cage rattles awake.');
      }
    }
    if(ch==='W'){ shakeT=10; toast('Beam gone. Whatever it was holding just became your problem.'); }
    set(c,r,' ');
    scanSupports();
  }
}
let dmg={};

/* ---------------- update ---------------- */
let eLatch=true, hLatch=true, numLatch=[];
function loadPit(n){
  pit=n;
  g=MAPS[n].slice();
  falls=[]; teeters=[]; dust=[]; dmg={};
  gems=0; hoistFixed=!!flags.quarryDone; exitLatch=true; shakeT=0;
  if(hoistFixed) gems=needGems();
  pl={x:ENTRY.x,y:ENTRY.y,vx:0,vy:0,onGround:false,face:1,hitT:60,digT:0};
  scanSupports();
}
function update(){
  if(introT>0){ introT--; }
  // E — leave to the Arcade from anywhere (no hoist required)
  if(held['e']||held['E']){
    if(!eLatch){ eLatch=true; startQuarryTrans('out'); return; }
  } else eLatch=false;
  // H — hauled back to the entry lip; the free unstick
  if(held['h']||held['H']){
    if(!hLatch){
      hLatch=true;
      pl.x=ENTRY.x; pl.y=ENTRY.y; pl.vx=0; pl.vy=0; pl.hitT=60;
      puff(pl.x, pl.y-10, '#c9bda6', 8);
      toast('The foreman hauls the rope back up. Free of charge — this time.');
    }
  } else hLatch=false;
  if(pl.hitT>0) pl.hitT--;
  if(pl.digT>0) pl.digT--;
  if(shakeT>0) shakeT--;
  for(let i=dust.length-1;i>=0;i--){ const d=dust[i]; d.y+=d.vy; d.life--; if(d.life<=0) dust.splice(i,1); }

  stepTeeters();
  stepFalls();

  const sp=held[' '], spEdge=sp&&!spaceWas; spaceWas=sp;

  // horizontal
  if(held.ArrowLeft && !held.ArrowDown && !held.ArrowUp){ pl.vx=-MOVE; pl.face=-1; }
  else if(held.ArrowRight && !held.ArrowDown && !held.ArrowUp){ pl.vx=MOVE; pl.face=1; }
  else pl.vx*=0.55;
  if(spEdge) dig();

  // move X with a one-tile auto-step so ledges don't need a jump button
  let nx=pl.x+pl.vx;
  const midR=Math.floor((pl.y-16)/32), footR=Math.floor((pl.y-2)/32);
  const nc=Math.floor((nx+Math.sign(pl.vx)*9)/32);
  if(pl.vx!==0 && (solid(nc,midR)||solid(nc,footR))){
    if(pl.onGround && !solid(nc,midR-1) && !solid(nc,footR-1) && solid(nc,footR)){
      pl.y-=32; pl.x=nx;                       // step up
    } else { pl.vx=0; }
  } else pl.x=nx;

  // gravity
  pl.vy=Math.min(MAXFALL, pl.vy+GRAV);
  pl.y+=pl.vy;
  pl.onGround=false;
  const pc=Math.floor(pl.x/32), fr=Math.floor(pl.y/32);
  if(pl.vy>=0 && solid(pc,fr)){
    pl.y=fr*32; pl.vy=0; pl.onGround=true;
  }
  const hr=Math.floor((pl.y-30)/32);
  if(pl.vy<0 && solid(pc,hr)){ pl.y=(hr+1)*32+30; pl.vy=0; }

  pl.x=Math.max(10, Math.min(QW*32-10, pl.x));
  if(pl.y>QH*32+40){ pl.x=ENTRY.x; pl.y=ENTRY.y; pl.vy=0; }

  // number keys jump straight to a pit (testing-friendly, like the walls)
  for(let n=0;n<MAPS.length;n++){
    const nk=held[String(n+1)];
    if(nk && !numLatch[n]){ numLatch[n]=true;
      if(n!==pit){ loadPit(n); sfx.pick && sfx.pick(); } }
    if(!nk) numLatch[n]=false;
  }

  // the hoist: pits 1-3 ride you DOWN to the next pit; the last rides out
  const ex=EXIT_T.c*32+16, ey=EXIT_T.r*32+16;
  if(Math.hypot(pl.x-ex, pl.y-16-ey)<26){
    if(hoistFixed){
      if(held.ArrowUp && !exitLatch){
        exitLatch=true;
        if(pit<MAPS.length-1){
          flags.quarryPit=Math.max(flags.quarryPit||0, pit+1);
          if(typeof saveGame==='function') saveGame();
          loadPit(pit+1);
          toast('The cage rattles you deeper. PIT '+(pit+1)+' — '+PIT_NAMES[pit]+'. '+needGems()+' stones this time.');
          return;
        }
        if(!flags.quarryDone){
          flags.quarryDone=true;
          if(typeof built!=='undefined' && built.add) built.add('quarry');
          res.gold=Math.min(999,res.gold+40);
          addFloat(pl.x,pl.y-34,'THE HOIST RUNS  +40 gold','#ffe066');
          toast('The hoist runs again. The MONTY ZOOM cabinet just stopped complaining.');
          if(typeof saveGame==='function') saveGame();
        }
        if(window.Interlude) Interlude.offer('breathe', {
          title:'Phew. That was exhausting.',
          sub:'Up out of the pit. Sit up straight and catch your breath — in for four, hold for three, out for five.'
        });
        startQuarryTrans('out'); return;
      }
    } else if(held.ArrowUp && !exitLatch){
      exitLatch=true;
      toast('The cage needs a counterweight — '+needGems()+' good stones. You have '+gems+'.');
    }
  }
  if(!held.ArrowUp) exitLatch=false;
}

/* ---------------- draw ---------------- */
function TILECOL(ch){
  switch(ch){
    case '#': return ['#2a2723','#171512'];
    case 'R': return ['#6d6558','#443f36'];
    case 'C': return ['#7d735f','#4d4538'];
    case 'B': return ['#6a5f52','#3a342c'];
    case 'S': return ['#c2a86a','#8a7440'];
    case 'W': return ['#8a5a2a','#5c3a18'];
    case 'G': return ['#7fe7ff','#1c6a8a'];
    default:  return null;
  }
}
function draw(){
  const shx=shakeT>0?(Math.random()-0.5)*shakeT*0.7:0, shy=shakeT>0?(Math.random()-0.5)*shakeT*0.5:0;
  ctx.save(); ctx.translate(shx, shy);
  // cavern air
  const bg=ctx.createLinearGradient(0,HUD,0,RH+HUD);
  bg.addColorStop(0,'#2b2b33'); bg.addColorStop(1,'#14131a');
  ctx.fillStyle=bg; ctx.fillRect(-8,HUD-8,RW+16,RH+16);

  for(let r=0;r<QH;r++) for(let c=0;c<QW;c++){
    const ch=at(c,r); const col=TILECOL(ch); if(!col) continue;
    const x=c*32, y=r*32+HUD;
    /* STEEL: square riveted plate, cold blue-grey, no rounding — visually a
       different SPECIES from everything you can break or that can move */
    if(ch==='#'){
      const sg=ctx.createLinearGradient(x,y,x,y+32);
      sg.addColorStop(0,'#5a6478'); sg.addColorStop(0.5,'#454e60'); sg.addColorStop(1,'#333a4a');
      ctx.fillStyle=sg; ctx.fillRect(x,y,32,32);
      ctx.strokeStyle='rgba(12,16,24,.7)'; ctx.lineWidth=2;
      ctx.strokeRect(x+1,y+1,30,30);
      ctx.fillStyle='rgba(255,255,255,.18)'; ctx.fillRect(x+2,y+2,28,2);
      ctx.fillStyle='#242a38';
      for(const [rx,ry] of [[6,6],[26,6],[6,26],[26,26]]){
        ctx.beginPath(); ctx.arc(x+rx,y+ry,2,0,7); ctx.fill();
      }
      ctx.fillStyle='rgba(160,175,200,.5)';
      for(const [rx,ry] of [[6,6],[26,6],[6,26],[26,26]]){
        ctx.beginPath(); ctx.arc(x+rx-0.6,y+ry-0.6,0.9,0,7); ctx.fill();
      }
      continue;
    }
    const t=teeters.find(t=>t.c===c&&t.r===r);
    const jx = t? (Math.random()-0.5)*3.2 : 0;
    const grd=ctx.createLinearGradient(x,y,x,y+32);
    grd.addColorStop(0,col[0]); grd.addColorStop(1,col[1]);
    ctx.fillStyle=grd; rr(ctx,x+jx+1,y+1,30,30,ch==='B'?14:4); ctx.fill();
    if(ch==='B'){
      /* BOULDER: fully round, warm granite, glossy — obviously LOOSE. The
         highlight + cradle shadow say "this rolls" before it ever does. */
      ctx.fillStyle='rgba(0,0,0,.30)';
      ctx.beginPath(); ctx.ellipse(x+16+jx, y+29, 12, 3, 0, 0, 7); ctx.fill();
      const bg2=ctx.createRadialGradient(x+11+jx,y+10,2,x+16+jx,y+16,15);
      bg2.addColorStop(0,'#8a7f72'); bg2.addColorStop(1,'#4a443c');
      ctx.fillStyle=bg2;
      ctx.beginPath(); ctx.arc(x+16+jx,y+16,14,0,7); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.30)';
      ctx.beginPath(); ctx.ellipse(x+11+jx,y+10,4.5,2.8,-0.6,0,7); ctx.fill();
    }
    if(ch==='W'){
      ctx.strokeStyle='rgba(40,24,10,.65)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x+3,y+11); ctx.lineTo(x+29,y+11); ctx.moveTo(x+3,y+21); ctx.lineTo(x+29,y+21); ctx.stroke();
    } else if(ch==='G'){
      ctx.fillStyle='rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.moveTo(x+16,y+7); ctx.lineTo(x+24,y+17); ctx.lineTo(x+16,y+26); ctx.lineTo(x+8,y+17); ctx.closePath(); ctx.fill();
    } else if(ch==='C'){
      ctx.strokeStyle='rgba(20,16,12,.6)'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(x+7,y+6); ctx.lineTo(x+15,y+16); ctx.lineTo(x+10,y+26);
      ctx.moveTo(x+18,y+9); ctx.lineTo(x+25,y+20); ctx.stroke();
    } else if(ch==='S'){
      ctx.fillStyle='rgba(255,255,255,.16)';
      for(let i=0;i<5;i++) ctx.fillRect(x+5+((i*7+r*3)%22), y+6+((i*9+c*5)%20), 2,2);
    }
    // damage marks
    const d=dmg[c+','+r];
    if(d){ ctx.strokeStyle='rgba(255,240,200,.85)'; ctx.lineWidth=1.8;
      ctx.beginPath(); ctx.moveTo(x+8,y+8); ctx.lineTo(x+24,y+24); ctx.moveTo(x+24,y+9); ctx.lineTo(x+9,y+23); ctx.stroke(); }
    // teeter warning: red rim + cracks, unmissable
    if(t){
      const a=0.35+0.45*Math.abs(Math.sin(frame*0.35));
      ctx.strokeStyle='rgba(255,120,80,'+a.toFixed(2)+')'; ctx.lineWidth=2.4;
      rr(ctx,x+jx+2,y+2,28,28,4); ctx.stroke();
      ctx.fillStyle='rgba(255,150,90,'+(a*0.5).toFixed(2)+')';
      ctx.beginPath(); ctx.moveTo(x+16+jx,y+34); ctx.lineTo(x+11+jx,y+42); ctx.lineTo(x+21+jx,y+42); ctx.closePath(); ctx.fill();
    }
  }
  // falling blocks
  for(const f of falls){
    const col=TILECOL(f.ch); if(!col) continue;
    const y=(f.r + f.sub/FALLSPD)*32+HUD, x=f.c*32;
    const grd=ctx.createLinearGradient(x,y,x,y+32);
    grd.addColorStop(0,col[0]); grd.addColorStop(1,col[1]);
    ctx.fillStyle=grd; rr(ctx,x+1,y+1,30,30,f.ch==='B'?14:4); ctx.fill();
    ctx.strokeStyle='rgba(255,150,90,.5)'; ctx.lineWidth=1.6; rr(ctx,x+2,y+2,28,28,4); ctx.stroke();
  }
  // dust
  for(const d of dust){
    ctx.globalAlpha=Math.min(1,d.life/26)*0.6; ctx.fillStyle='#b7a58c';
    ctx.beginPath(); ctx.arc(d.x, d.y+HUD, 1.6, 0, 7); ctx.fill(); ctx.globalAlpha=1;
  }
  // the hoist cage
  const ex=EXIT_T.c*32, ey=EXIT_T.r*32+HUD;
  ctx.strokeStyle=hoistFixed?'#ffe066':'#6b6355'; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.moveTo(ex+16,HUD); ctx.lineTo(ex+16,ey+6); ctx.stroke();
  ctx.strokeRect(ex+4,ey+6,24,24);
  if(hoistFixed){
    const pul=0.45+0.3*Math.sin(frame*0.09);
    ctx.strokeStyle='rgba(255,224,102,'+pul.toFixed(2)+')'; ctx.lineWidth=3; ctx.strokeRect(ex+3,ey+5,26,26);
    if(Math.abs(pl.x-(ex+16))<60) drawLabel('[UP] ride out', ex+16, ey-6, '#ffe9a0');
  } else if(Math.abs(pl.x-(ex+16))<60) drawLabel('needs '+needGems()+' stones', ex+16, ey-6, '#c9bda6');

  drawMiner();
  ctx.restore();

  // HUD
  const hg=ctx.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#241f1a'); hg.addColorStop(1,'#12100d');
  ctx.fillStyle=hg; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle='rgba(200,160,90,.35)'; ctx.fillRect(0,HUD-2,RW,2);
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#e8c15a';
  ctx.fillText('DANGER BLOCKS', RW/2, 22);
  ctx.font='11px '+FONT; ctx.fillStyle='#9a8f7a';
  ctx.fillText('SPACE = swing (hold UP/DOWN to aim) · red rim = it is coming down · STUCK? E = exit · H = restart spot', RW/2, 38);
  ctx.textAlign='left'; ctx.font='bold 13px '+FONT; ctx.fillStyle='#7fe7ff';
  ctx.fillText('STONES '+gems+'/'+needGems(), 14, 20);
  ctx.font='bold 11px '+FONT; ctx.fillStyle='#c9bda6';
  ctx.fillText('PIT '+(pit+1)+'/'+MAPS.length+' · '+PIT_NAMES[pit], 14, 36);
  ctx.textAlign='right';
  for(let i=0;i<maxhp;i++){
    ctx.fillStyle = i<hp? '#ff5a5a' : '#3a2c28';
    ctx.beginPath(); ctx.arc(RW-16-i*15,16,5,0,7); ctx.fill();
  }
  if(introT>0){
    ctx.globalAlpha=Math.min(1,introT/40); ctx.textAlign='center';
    ctx.font='bold 13px '+FONT; ctx.fillStyle='#e8dcc0';
    ctx.fillText('Everything in here is holding something else up.', RW/2, HUD+56);
    ctx.globalAlpha=1;
  }
}
function drawMiner(){
  if(pl.hitT>0 && (frame>>2)%2) return;
  const x=pl.x, y=pl.y+HUD;
  const SKIN='#e8d9b0', HAT='#d8a33a', SUIT='#3f6a4a', LEG='#2c4a34';
  GFX.shadow(ctx, x, y, 9, pl.onGround?0.36:0.18);
  GFX.box(ctx, x-5, y-8, 4.5, 8, LEG, GFX.dim(LEG,0.7), 1.5);
  GFX.box(ctx, x+0.5, y-8, 4.5, 8, LEG, GFX.dim(LEG,0.7), 1.5);
  GFX.box(ctx, x-5.5, y-20.5, 11, 13, SUIT, GFX.dim(SUIT,0.68), 3);
  GFX.body(ctx, x, y-25, 6.2, 6.2, SKIN, GFX.dim(SKIN,0.76));
  ctx.fillStyle='#0b1c16';
  ctx.beginPath(); ctx.arc(x+pl.face*2.2, y-26, 1.3, 0, 7); ctx.fill();   // eye
  ctx.beginPath(); ctx.arc(x,y-28,7,Math.PI,0);                            // hard hat
  ctx.fillStyle=HAT; ctx.fill(); GFX.ink(ctx,1.5);
  ctx.fillStyle='#fff3c4'; ctx.beginPath(); ctx.arc(x+pl.face*5,y-28,2,0,7); ctx.fill(); // lamp
  // pick
  ctx.strokeStyle='#8a5a2a'; ctx.lineWidth=2.4;
  const sw = pl.digT>0 ? (1-pl.digT/20)*1.5-0.4 : -0.6;
  ctx.save(); ctx.translate(x+pl.face*6,y-18); ctx.rotate(pl.face*sw);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-14); ctx.stroke();
  ctx.strokeStyle='#c9c2b4'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(-6,-14); ctx.lineTo(6,-14); ctx.stroke();
  ctx.restore();
}

/* ---------------- API ---------------- */
window.QuarryLayer={
  enter(){
    loadPit(Math.min(MAPS.length-1, flags.quarryPit||0));
    introT=170; spaceWas=true; numLatch=[];
    maxhp=(typeof PL!=='undefined'&&PL.maxhp)?PL.maxhp:6; hp=maxhp;
    toast('DANGER BLOCKS · PIT '+(pit+1)+' — '+PIT_NAMES[pit]+'. Steel never moves. Round stone never breaks — but it falls. SPACE swings; E leaves; H unsticks; 1-4 pick a pit.');
  },
  exitDone(){},
  update, draw,
  _t:{ get g(){return g;}, get pl(){return pl;}, get gems(){return gems;}, set gems(v){gems=v;},
       get pit(){return pit;}, get hoistFixed(){return hoistFixed;}, set hoistFixed(v){hoistFixed=v;},
       get falls(){return falls;}, get teeters(){return teeters;},
       MAPS, PIT_GEMS, PIT_NAMES, needGems, ENTRY, EXIT_T, QW, QH,
       at, loadPit, scanSupports, dig, unsupported }
};

})();
