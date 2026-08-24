"use strict";
/* ============================================================
   GRISHNAK — JUNGLE HUNT: "THE UNDERRIVER"
   Entered by diving into the dark water in Flooded Hollow.
   A vast bioluminescent cavern-jungle under the valley:
   side-scrolling world (2000px), camera-follow.
     1. splash pool (entry)          x ~ 60..240
     2. vine swings over the mire    x ~ 260..950  (5 pre-swinging vines)
     3. the underriver + crocodiles  x ~ 950..1500 (swim; jaws have windows)
     4. far shore ledges + the IDOL  x ~ 1500..1950
   Gentle rules: no HP loss down here — mire/croc hits splash you
   back to the section's start. Idol = +60 gold + flags.jungleDone.
   Exit: hanging root at the far right (UP) -> back to the caves.
   ============================================================ */
(function(){

const JW=2000;                       // world width
const GRAV=0.5, JUMP=-8.2, MOVE=2.6, MAXFALL=9;
const SWING_A=0.65;                  // idle swing amplitude (rad)
const WATER_X0=950, WATER_X1=1500, WATER_Y=282;   // river surface
const MIRE_Y=352;                    // the glowing mire under the vines
const FLOOR_Y=344;                   // walkable ground level (shores)

let pl={x:120,y:FLOOR_Y,vx:0,vy:0,onGround:true,swim:false,face:1,iframes:0};
let camX=0, introT=0, exitLatch=false, spaceWas=false;
let vines=[], crocs=[], plats=[], spores=[], birds=[];
let onVine=null, vineT=0, regrabT=0, lastVine=null, lastVineT=0;
let idolGot=false, splashT=0;

const IDOL={x:1840,y:120};
const EXIT_ROOT={x:1950,y:FLOOR_Y};

/* THREE SCREENS (Scott, 2026-08-18: "separate the water area into a separate
   screen, then separate screen for step after that"). The WORLD stays one
   continuous strip — the suite's bot and the player's momentum both cross the
   seams without a teleport — but the CAMERA is banded, so each section plays
   in its own frame with a wipe and a title, the way the arcade cut between
   its stages. */
const SCR_BANDS=[[0,950],[900,1540],[1500,2000]];
const SCR_NAMES=['THE VINE GORGE','THE UNDERRIVER',"THE KEEPERS' SHRINE"];
let jscr=0, wipeT=0, nameT=0;
function bandFor(x){
  if(jscr===0 && x>958) return 1;
  if(jscr===1 && x<892) return 0;
  if(jscr===1 && x>1548) return 2;
  if(jscr===2 && x<1492) return 1;
  return jscr;
}

/* THE RESCUE (Scott: "some kind of challenge solving similar to the
   prototypical princess rescue"). The Pale Princess of the Underriver hangs
   in a root cage over a scalding geyser; two hooded idol-keepers patrol the
   shrine floor. The winch that lowers the cage is on the FAR side of both
   patrols, so the ground game is the arcade's ground game: time your run,
   jump the keepers, and crank while the geyser is quiet. Gentle rules hold —
   a keeper's shove costs position, never blood. The idol route (the
   platforms) passes safely above all of it. */
const GEYSER={x:1740, cyc:300, on:70};
const CAGE={x:1740, y:170};
const WINCH={x:1876};
const RESCUE_NEED=90;
let keepers=[], rescueT=0, rescued=false, cageDrop=0, princess=null;

function buildWorld(){
  vines=[];
  // pre-swinging pendulums, anchored high; phase-staggered like the arcade
  const VX=[300,440,590,740,880];
  for(let i=0;i<VX.length;i++){
    vines.push({x:VX[i], anchorY:36, len:236+((i%2)*22), ang:0, vel:0, phase:i*1.3});
  }
  crocs=[
    {x0:990,  x1:1150, x:1000, dir:1,  jawT:0,  phase:0},
    {x0:1160, x1:1330, x:1300, dir:-1, jawT:60, phase:70},
    {x0:1340, x1:1480, x:1350, dir:1,  jawT:120,phase:140}
  ];
  plats=[  // far-shore climb (top-landing platforms)
    {x:1530,y:308,w:90},
    {x:1660,y:258,w:80},
    {x:1770,y:200,w:80},
    {x:1810,y:148,w:96}   // idol ledge
  ];
  // slow pteranodons patrolling the vine gorge at different heights:
  // climb UP/DOWN the vine to duck them while you swing
  birds=[
    {y:132, spd:0.75, dir:-1, x:1000},
    {y:196, spd:0.60, dir: 1, x:210},
    {y:258, spd:0.90, dir:-1, x:640}
  ];
  spores=[];
  for(let i=0;i<40;i++) spores.push({x:hash2(i,7)*JW, y:40+hash2(i,13)*280, r:1+hash2(i,3)*2, ph:hash2(i,29)*7});
  // the shrine floor patrol — two lanes, opposite phases, both jumpable
  keepers=[
    {x0:1620, x1:1760, x:1640, dir:1,  spd:0.8},
    {x0:1780, x1:1912, x:1900, dir:-1, spd:1.15}
  ];
  rescueT=0; cageDrop=0; princess=null;
}

function respawnPool(){ pl.x=120; pl.y=FLOOR_Y; pl.vx=0; pl.vy=0; pl.onGround=true; pl.swim=false; onVine=null; pl.iframes=60; }
function respawnRiverStart(){ pl.x=WATER_X0-30; pl.y=FLOOR_Y; pl.vx=0; pl.vy=0; pl.onGround=true; pl.swim=false; onVine=null; pl.iframes=60; }
function respawnShrine(){ pl.x=1516; pl.y=FLOOR_Y; pl.vx=0; pl.vy=0; pl.onGround=true; pl.swim=false; onVine=null; pl.iframes=60; }
function geyserOn(){ return frame%GEYSER.cyc < GEYSER.on; }
function stepKeeper(k){
  if(rescued) return;                                // they kneel once she is free
  k.x+=k.dir*k.spd;
  if(k.x<k.x0){ k.x=k.x0; k.dir=1; }
  if(k.x>k.x1){ k.x=k.x1; k.dir=-1; }
}

function groundAt(x){
  // shores are solid; the mire gap (vines) and the river gap are not
  if(x<260) return FLOOR_Y;                       // entry shore
  if(x>=900 && x<WATER_X0) return FLOOR_Y;        // mid bank between mire and river
  if(x>=WATER_X1 && x<=JW) return FLOOR_Y;        // far shore
  return null; // over mire or river
}
/* what a shadow lands on at this x — floor, river surface, or mire */
function surfaceAt(x){
  const g=groundAt(x);
  if(g!==null) return g;
  if(x>=WATER_X0 && x<=WATER_X1) return WATER_Y;
  return MIRE_Y;
}

/* ---------------- vines ---------------- */
function vineTip(v){
  return {x:v.x+Math.sin(v.ang)*v.len, y:v.anchorY+Math.cos(v.ang)*v.len};
}
function stepVine(v){
  const w=Math.sqrt(GRAV/v.len);          // true pendulum frequency (~2.3s period)
  if(onVine===v){
    v.vel+=-(GRAV/v.len)*Math.sin(v.ang);
    if(held.ArrowLeft)  v.vel-=0.00032;
    if(held.ArrowRight) v.vel+=0.00032;
    v.vel*=0.9995;
    v.ang+=v.vel;
    if(v.ang> 1.2){ v.ang= 1.2; v.vel=Math.min(v.vel,0); }
    if(v.ang<-1.2){ v.ang=-1.2; v.vel=Math.max(v.vel,0); }
  } else {
    // idle: steady kinematic swing so it never dies out or drifts
    v.ang=SWING_A*Math.sin(frame*w+v.phase);
    v.vel=SWING_A*w*Math.cos(frame*w+v.phase);
  }
}
function tryGrabVine(){
  if(onVine || regrabT>0) return;
  for(const v of vines){
    if(v===lastVine && lastVineT>0) continue;   // don't re-catch the vine you just left
    // catch anywhere along the lower 60% of the vine, generous radius
    for(let f=0.4;f<=1.001;f+=0.08){
      const vx=v.x+Math.sin(v.ang)*v.len*f, vy=v.anchorY+Math.cos(v.ang)*v.len*f;
      for(const by of [pl.y-2,pl.y-13,pl.y-24]){
        if(Math.hypot(pl.x-vx, by-vy)<26){
          onVine=v; vineT=Math.max(0.5,f);
          v.vel+=pl.vx*0.004;    // carry momentum in
          sfx.jump && sfx.jump();
          return;
        }
      }
    }
  }
}

/* ---------------- crocs ---------------- */
function stepCroc(c){
  c.x+=c.dir*0.62;
  if(c.x<c.x0){ c.x=c.x0; c.dir=1; }
  if(c.x>c.x1){ c.x=c.x1; c.dir=-1; }
  c.jawT=(c.jawT+1)%210;      // 0..89 OPEN, 90..209 closed
}
function crocOpen(c){ return c.jawT<90; }
function crocHeadX(c){ return c.x+c.dir*20; }

/* ---------------- pteranodons ---------------- */
function stepBird(b){
  // straight flight across the whole world; wrap around off-screen
  b.x+=b.dir*b.spd;
  if(b.dir<0 && b.x<-70) b.x=JW+70;
  if(b.dir>0 && b.x>JW+70) b.x=-70;
}
function birdHit(){
  if(pl.iframes>0) return false;
  for(const b of birds){
    if(Math.abs(pl.x-b.x)<16 && Math.abs((pl.y-12)-b.y)<13) return true;
  }
  return false;
}

/* ---------------- update ---------------- */
function update(){
  if(introT>0){ introT--; }
  if(pl.iframes>0) pl.iframes--;
  if(regrabT>0) regrabT--;
  if(lastVineT>0) lastVineT--;
  if(pl.onGround||onVine) lastVine=null;
  if(splashT>0) splashT--;
  for(const v of vines) stepVine(v);
  for(const c of crocs) stepCroc(c);
  for(const b of birds) stepBird(b);
  for(const k of keepers) stepKeeper(k);
  if(wipeT>0) wipeT--;
  if(nameT>0) nameT--;
  const nb=bandFor(pl.x);
  if(nb!==jscr){ jscr=nb; wipeT=16; nameT=90; camFollow(); }
  // the cage comes down over a full second — an event, not a switch
  if(rescued && cageDrop<1){ cageDrop=Math.min(1, cageDrop+1/60); if(cageDrop>=1 && !princess) princess={x:CAGE.x, walking:true, gone:false, sparkleT:0}; }
  if(princess && princess.walking){
    princess.x+=0.9;
    if(princess.x>=EXIT_ROOT.x-6){ princess.walking=false; princess.sparkleT=70; }
  }
  if(princess && !princess.walking && princess.sparkleT>0){
    princess.sparkleT--;
    if(princess.sparkleT===0 && !princess.gone){
      princess.gone=true;
      toast('The Pale Princess climbs the root toward daylight. The keepers do not look up.');
    }
  }

  const sp=held[' '], spEdge=sp&&!spaceWas;
  spaceWas=sp;

  if(onVine){
    const v=onVine;
    const tip={x:v.x+Math.sin(v.ang)*v.len*vineT, y:v.anchorY+Math.cos(v.ang)*v.len*vineT};
    pl.x=tip.x; pl.y=tip.y+14; pl.onGround=false; pl.swim=false;
    if(birdHit()){
      puff(pl.x,pl.y,'#cfd8d2',12); sfx.hurt && sfx.hurt();
      toast('A pteranodon clips you off the vine. It does not apologize.');
      respawnPool(); return;
    }
    if(held.ArrowUp)   vineT=Math.max(0.35, vineT-0.012);   // climb the vine
    if(held.ArrowDown) vineT=Math.min(1.0,  vineT+0.012);
    if(spEdge){   // release with swing velocity + arcade launch assist
      const tangX=Math.cos(v.ang), tangY=-Math.sin(v.ang);
      const speed=v.vel*v.len*vineT;
      const dir=Math.abs(v.vel)>0.005 ? Math.sign(v.vel) : (Math.sign(v.ang)||pl.face);
      pl.vx=tangX*speed*1.15 + dir*2.4;
      pl.vy=tangY*speed*1.15 - 3.2;
      pl.face=dir>=0?1:-1;
      lastVine=v; lastVineT=45;
      onVine=null; regrabT=6;
      sfx.jump && sfx.jump();
    }
    camFollow(); return;
  }

  const inWater = pl.x>WATER_X0-6 && pl.x<WATER_X1+6 && pl.y>WATER_Y-6;
  pl.swim=inWater;

  if(inWater){
    // swimming: damped movement, gentle buoyancy toward surface
    if(held.ArrowLeft){ pl.vx-=0.24; pl.face=-1; }
    if(held.ArrowRight){ pl.vx+=0.24; pl.face=1; }
    if(held.ArrowUp) pl.vy-=0.26;
    if(held.ArrowDown) pl.vy+=0.26;
    pl.vy+=(pl.y>WATER_Y+8? -0.10 : 0.05);   // float up when deep
    pl.vx*=0.90; pl.vy*=0.90;
    pl.x+=pl.vx; pl.y+=pl.vy;
    if(pl.y<WATER_Y-2 && spEdge){ pl.vy=JUMP*0.62; }   // leap from the surface
    if(pl.y<WATER_Y-4) pl.swim=false;
    pl.y=Math.min(pl.y, MIRE_Y+16);
    // croc danger: OPEN jaws near the head, at surface band only
    if(pl.iframes<=0 && pl.y<WATER_Y+26){
      for(const c of crocs){
        if(crocOpen(c) && Math.abs(pl.x-crocHeadX(c))<17 && Math.abs(pl.y-(WATER_Y+8))<22){
          puff(pl.x,pl.y,'#7fd4ff',12); sfx.hurt && sfx.hurt();
          toast('SNAP! The river politely returns you to the shallows.');
          respawnRiverStart(); return;
        }
      }
    }
  } else {
    // platforming: crisp on the ground, momentum-preserving in the air
    if(pl.onGround){
      if(held.ArrowLeft){ pl.vx=-MOVE; pl.face=-1; }
      else if(held.ArrowRight){ pl.vx=MOVE; pl.face=1; }
      else pl.vx*=0.6;
    } else {
      if(held.ArrowLeft){ pl.vx-=0.14; pl.face=-1; }
      else if(held.ArrowRight){ pl.vx+=0.14; pl.face=1; }
      pl.vx*=0.995;
      pl.vx=Math.max(-9,Math.min(9,pl.vx));
    }
    const atWinch = pl.onGround && Math.abs(pl.x-WINCH.x)<16 && !rescued;
    if(atWinch && sp){
      // SPACE cranks here instead of jumping — but only while the geyser
      // sleeps; progress is KEPT between attempts (a shove costs position,
      // not work already done)
      if(!geyserOn()){
        rescueT++;
        if(rescueT>=RESCUE_NEED && !rescued){
          rescued=true;
          flags.jungleRescue=true;
          res.gold=Math.min(999,res.gold+80);
          addFloat(WINCH.x,FLOOR_Y-40,'THE CAGE COMES DOWN  +80 gold','#ffe066');
          puff(CAGE.x,CAGE.y,'#cfe8d8',16);
          sfx.chest ? sfx.chest() : (sfx.coin && sfx.coin());
          toast('The winch gives. The keepers kneel where they stand.');
          saveGame();
        }
      }
    }
    else if(spEdge && pl.onGround){ pl.vy=JUMP; pl.onGround=false; sfx.jump && sfx.jump(); }
    pl.vy=Math.min(MAXFALL, pl.vy+GRAV);
    const oldY=pl.y;
    pl.x+=pl.vx; pl.y+=pl.vy;
    pl.onGround=false;
    // ground shores
    const g=groundAt(pl.x);
    if(g!==null && pl.vy>=0 && pl.y>=g && oldY<=g+10){ pl.y=g; pl.vy=0; pl.onGround=true; }
    // platform top-landings
    for(const p of plats){
      if(pl.vx===pl.vx && pl.vy>=0 && pl.x>p.x-6 && pl.x<p.x+p.w+6 && oldY<=p.y+2 && pl.y>=p.y){
        pl.y=p.y; pl.vy=0; pl.onGround=true;
      }
    }
    // airborne near a vine? auto-grab
    if(!pl.onGround) tryGrabVine();
    // pteranodon mid-flight over the gorge
    if(!pl.onGround && pl.x>240 && pl.x<960 && birdHit()){
      puff(pl.x,pl.y,'#cfd8d2',12); sfx.hurt && sfx.hurt();
      toast('You are briefly a pteranodon passenger. Then you are not.');
      respawnPool(); return;
    }
    // a keeper's shove — ground only, so a well-timed jump clears them
    if(!rescued && pl.iframes<=0 && pl.onGround){
      for(const k of keepers){
        if(Math.abs(pl.x-k.x)<12 && pl.y>FLOOR_Y-26){
          puff(pl.x,pl.y,'#d8c8a0',12); sfx.hurt && sfx.hurt();
          toast('A keeper walks you firmly back to the shore. No blood, no negotiation.');
          respawnShrine(); return;
        }
      }
    }
    // fell in the mire (vine section floor)
    if(g===null && pl.x<900 && pl.y>MIRE_Y-6){
      puff(pl.x,MIRE_Y,'#9adf5c',12); sfx.hurt && sfx.hurt();
      toast('The mire glows appreciatively as it spits you back out.');
      respawnPool(); return;
    }
    // fell into the river from above -> swim (handled next frame)
  }

  pl.x=Math.max(14,Math.min(JW-14,pl.x));
  if(pl.y>RH+60){ respawnPool(); return; }

  // idol
  if(!idolGot && Math.hypot(pl.x-IDOL.x,pl.y-IDOL.y-14)<26){
    idolGot=true; flags.jungleDone=true;
    res.gold=Math.min(999,res.gold+60);
    addFloat(IDOL.x,IDOL.y-10,'THE IDOL OF THE UNDERRIVER  +60 gold','#ffe066');
    puff(IDOL.x,IDOL.y,'#ffe066',16);
    sfx.chest ? sfx.chest() : (sfx.coin && sfx.coin());
    toast('Something BIG stirred below. It was you, taking its idol.');
    saveGame();
  }
  // exit root
  if(Math.abs(pl.x-EXIT_ROOT.x)<24 && pl.onGround){
    if(held.ArrowUp && !exitLatch){ exitLatch=true; startJungleTrans('out'); return; }
  }
  if(!held.ArrowUp) exitLatch=false;
  camFollow();
}
function camFollow(){
  const B=SCR_BANDS[jscr];
  camX=Math.max(B[0], Math.min(B[1]-RW, pl.x-RW/2));
  return;
  camX=Math.max(0, Math.min(JW-RW, pl.x-RW/2));
}

/* ---------------- draw ---------------- */
function draw(){
  const X=x=>x-camX;
  // deep cavern gradient
  const bg=ctx.createLinearGradient(0,HUD,0,RH+HUD);
  bg.addColorStop(0,'#04121c'); bg.addColorStop(0.55,'#07222e'); bg.addColorStop(1,'#0b3230');
  ctx.fillStyle=bg; ctx.fillRect(0,HUD,RW,RH);
  // distant glow flora silhouettes
  for(let i=0;i<14;i++){
    const fx=X((i*160+40)%JW*1); if(fx<-60||fx>RW+60) continue;
    const fy=RH+HUD-30-hash2(i,5)*60;
    ctx.fillStyle='rgba(28,80,70,0.5)';
    ctx.beginPath(); ctx.ellipse(fx,fy,26+hash2(i,11)*18,44+hash2(i,17)*26,0,0,7); ctx.fill();
  }
  // spores
  for(const s of spores){
    const sx=X(s.x); if(sx<-8||sx>RW+8) continue;
    const tw=0.35+0.3*Math.sin(frame*0.03+s.ph);
    ctx.fillStyle='rgba(140,240,200,'+tw.toFixed(2)+')';
    ctx.beginPath(); ctx.arc(sx, s.y+HUD+Math.sin(frame*0.01+s.ph)*6, s.r, 0, 7); ctx.fill();
  }
  // tree canopy the vines dangle from: three parallax layers of scalloped foliage
  const LAY=[
    {col:'#0f3322', base:64, sp:44, para:0.92},   // deep back layer (slightly lighter, slower)
    {col:'#0b2a1c', base:48, sp:36, para:1},
    {col:'#071f15', base:32, sp:30, para:1}       // darkest, shallowest, front
  ];
  for(const L of LAY){
    const off=camX*L.para;
    ctx.fillStyle=L.col;
    ctx.fillRect(0,HUD,RW,L.base-14);
    for(let i=Math.floor(off/L.sp)-1;i<(off+RW)/L.sp+1;i++){
      const sx=i*L.sp-off, r=12+hash2(i,L.sp)*16;
      ctx.beginPath(); ctx.arc(sx, HUD+L.base-14, r, 0, 7); ctx.fill();
    }
  }
  // thick branches running through the canopy
  ctx.strokeStyle='#2a1e10'; ctx.lineWidth=7; ctx.lineCap='round';
  for(let i=0;i<6;i++){
    const bx=X(i*360+80); if(bx<-420||bx>RW+60) continue;
    const by=HUD+16+hash2(i,9)*18;
    ctx.beginPath(); ctx.moveTo(bx,by);
    ctx.quadraticCurveTo(bx+180,by+14+hash2(i,4)*10, bx+380,by-6);
    ctx.stroke();
  }
  ctx.lineCap='butt';
  // hanging leaf clumps + glow fruit along the canopy underside
  for(let i=0;i<44;i++){
    const hx=X(i*46+18); if(hx<-30||hx>RW+30) continue;
    const hy=HUD+40+hash2(i,21)*26, hr=7+hash2(i,13)*9;
    ctx.fillStyle= i%3? '#0b2a1c' : '#0f3322';
    ctx.beginPath(); ctx.ellipse(hx,hy,hr,hr*1.35,0,0,7); ctx.fill();
    if(i%5===0){
      const tw=0.45+0.3*Math.sin(frame*0.04+i);
      ctx.fillStyle='rgba(154,223,92,'+tw.toFixed(2)+')';
      ctx.beginPath(); ctx.arc(hx+2,hy+hr*1.2,2.2,0,7); ctx.fill();
    }
  }
  // dangling tendrils below the canopy
  ctx.strokeStyle='#123a30'; ctx.lineWidth=3;
  for(let i=0;i<20;i++){
    const rx=X(i*105+30); if(rx<-20||rx>RW+20) continue;
    ctx.beginPath(); ctx.moveTo(rx,HUD+40);
    ctx.quadraticCurveTo(rx+5+Math.sin(frame*0.02+i)*3,HUD+66,rx-3,HUD+74+hash2(i,3)*18);
    ctx.stroke();
  }

  // the mire (vine section floor): luminous green sludge
  if(camX<WATER_X0){
    const mx0=Math.max(0,X(260)), mx1=Math.min(RW,X(900));
    if(mx1>mx0){
      ctx.fillStyle='#123816'; ctx.fillRect(mx0,MIRE_Y+HUD,mx1-mx0,RH+HUD-MIRE_Y);
      for(let i=0;i<18;i++){
        const bx=260+i*40, sx=X(bx); if(sx<mx0||sx>mx1) continue;
        const bub=0.3+0.25*Math.sin(frame*0.05+i*1.9);
        ctx.fillStyle='rgba(154,223,92,'+bub.toFixed(2)+')';
        ctx.beginPath(); ctx.arc(sx, MIRE_Y+HUD+6+Math.sin(frame*0.04+i)*3, 3, 0, 7); ctx.fill();
      }
    }
  }
  // river
  const wx0=Math.max(0,X(WATER_X0)), wx1=Math.min(RW,X(WATER_X1));
  if(wx1>wx0){
    const wg=ctx.createLinearGradient(0,WATER_Y+HUD,0,RH+HUD);
    wg.addColorStop(0,'rgba(35,110,150,0.85)'); wg.addColorStop(1,'rgba(8,40,66,0.95)');
    ctx.fillStyle=wg; ctx.fillRect(wx0,WATER_Y+HUD,wx1-wx0,RH+HUD-WATER_Y);
    ctx.strokeStyle='rgba(140,220,255,0.5)'; ctx.lineWidth=2; ctx.beginPath();
    for(let x=wx0;x<=wx1;x+=8){
      const yy=WATER_Y+HUD+Math.sin((x+camX)*0.05+frame*0.06)*2.2;
      x===wx0? ctx.moveTo(x,yy) : ctx.lineTo(x,yy);
    }
    ctx.stroke();
  }
  // shores
  ctx.fillStyle='#14352a';
  if(X(260)>0) ctx.fillRect(0,FLOOR_Y+HUD,Math.min(RW,X(260)),RH+HUD-FLOOR_Y);
  ctx.fillRect(Math.max(0,X(900)),FLOOR_Y+HUD,Math.min(RW,X(WATER_X0))-Math.max(0,X(900)),RH+HUD-FLOOR_Y);
  if(X(WATER_X1)<RW) ctx.fillRect(Math.max(0,X(WATER_X1)),FLOOR_Y+HUD,RW,RH+HUD-FLOOR_Y);
  ctx.fillStyle='#1d4a39';
  if(X(260)>0) ctx.fillRect(0,FLOOR_Y+HUD,Math.min(RW,X(260)),5);
  ctx.fillRect(Math.max(0,X(900)),FLOOR_Y+HUD,Math.min(RW,X(WATER_X0))-Math.max(0,X(900)),5);
  if(X(WATER_X1)<RW) ctx.fillRect(Math.max(0,X(WATER_X1)),FLOOR_Y+HUD,RW,5);

  // platforms
  for(const p of plats){
    const px=X(p.x); if(px>RW||px+p.w<0) continue;
    ctx.fillStyle='#1d4a39'; ctx.fillRect(px,p.y+HUD,p.w,8);
    ctx.fillStyle='#2f7a55'; ctx.fillRect(px,p.y+HUD,p.w,3);
    ctx.strokeStyle='#123a30'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(px+p.w/2,p.y+HUD+8); ctx.lineTo(px+p.w/2,p.y+HUD+26); ctx.stroke();
  }

  // cast shadows onto whatever is underneath — floor, river, mire.
  // Not just decoration: the bird shadows telegraph an incoming pass
  // before the bird itself is on screen, and the player's own shadow
  // says where a released swing is going to put you down.
  for(const b of birds){
    const bx=X(b.x); if(bx<-40||bx>RW+40) continue;
    const sf=surfaceAt(b.x);
    GFX.airShadow(ctx, bx, sf+HUD, sf-b.y, 13, 420);
  }
  if(!pl.swim){
    const sf=surfaceAt(pl.x);
    GFX.airShadow(ctx, X(pl.x), sf+HUD, sf-pl.y, 9, 340);
  }

  // vines
  for(const v of vines){
    const ax=X(v.x); if(ax<-260||ax>RW+260) continue;
    const tip=vineTip(v);
    ctx.strokeStyle='#2f6b3a'; ctx.lineWidth=4.4;
    ctx.beginPath(); ctx.moveTo(ax,v.anchorY+HUD);
    ctx.lineTo(X(tip.x),tip.y+HUD); ctx.stroke();
    ctx.strokeStyle='#57a35c'; ctx.lineWidth=2; ctx.setLineDash([5,4]);
    ctx.beginPath(); ctx.moveTo(ax,v.anchorY+HUD); ctx.lineTo(X(tip.x),tip.y+HUD); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='#6fc45a'; ctx.beginPath(); ctx.arc(X(tip.x),tip.y+HUD,4,0,7); ctx.fill();
    ctx.fillStyle='#0b2a1c'; ctx.beginPath(); ctx.ellipse(ax,v.anchorY+HUD,9,6,0,0,7); ctx.fill();  // canopy knot
  }

  // pteranodons — chrome-dino-game style: blocky grey, two-frame wing flap
  for(const b of birds){
    const bx=X(b.x); if(bx<-40||bx>RW+40) continue;
    const by=b.y+HUD, wingUp=(frame>>4)%2===0;
    ctx.save(); ctx.translate(bx,by); ctx.scale(b.dir,1);
    ctx.fillStyle='#c8d0cc';
    ctx.fillRect(-12,-3,22,6);                       // body
    ctx.fillRect(-16,-3,4,3);                        // tail nub
    ctx.fillRect(6,-8,7,6);                          // head
    ctx.fillRect(13,-7,6,3);                         // upper beak
    ctx.fillRect(13,-3,4,2);                         // lower beak
    ctx.fillRect(8,-11,4,4);                         // crest
    if(wingUp){                                      // stepped pixel wing, raised
      ctx.fillRect(-6,-15,8,12);
      ctx.fillRect(-4,-19,6,5);
      ctx.fillRect(-2,-22,4,4);
    } else {                                         // wing swept down
      ctx.fillRect(-6,3,8,10);
      ctx.fillRect(-4,11,6,5);
      ctx.fillRect(-2,14,4,4);
    }
    ctx.fillStyle='#0b1c16';
    ctx.fillRect(9,-7,2,2);                          // eye
    ctx.restore();
  }

  // crocs
  for(const c of crocs){
    const cx=X(c.x); if(cx<-60||cx>RW+60) continue;
    const y=WATER_Y+HUD+6, open=crocOpen(c);
    ctx.save(); ctx.translate(cx,y); ctx.scale(c.dir,1);
    ctx.fillStyle='#173a26';
    ctx.beginPath(); ctx.ellipse(0,2,26,7,0,0,7); ctx.fill();          // body
    for(let s2=0;s2<3;s2++){ ctx.beginPath(); ctx.moveTo(-16+s2*9,-4); ctx.lineTo(-11+s2*9,-9); ctx.lineTo(-6+s2*9,-4); ctx.closePath(); ctx.fill(); }
    // head + jaws
    ctx.beginPath(); ctx.ellipse(20,0,10,5,0,0,7); ctx.fill();
    if(open){
      ctx.fillStyle='#0d2418';
      ctx.beginPath(); ctx.moveTo(14,-1); ctx.lineTo(32,-9); ctx.lineTo(32,-1); ctx.closePath(); ctx.fill();  // upper jaw
      ctx.beginPath(); ctx.moveTo(14,1);  ctx.lineTo(32,8);  ctx.lineTo(32,1);  ctx.closePath(); ctx.fill();  // lower jaw
      ctx.fillStyle='#e8f4e0';
      for(let t2=0;t2<4;t2++){ ctx.fillRect(17+t2*4,-2,2,2); ctx.fillRect(17+t2*4,0,2,2); }
    }
    ctx.fillStyle= open? '#ffd23f' : '#9adf5c';
    ctx.beginPath(); ctx.arc(16,-4,1.8,0,7); ctx.fill();               // eye
    ctx.restore();
  }

  // ---- THE KEEPERS' SHRINE set pieces ----
  if(camX>1400){
    // carved face in the far wall, watching the whole stage
    const fx=X(1700), fy=HUD+120;
    if(fx>-120&&fx<RW+120){
      ctx.fillStyle='rgba(20,44,38,.9)';
      ctx.beginPath(); ctx.ellipse(fx,fy,52,66,0,0,7); ctx.fill();
      ctx.fillStyle='rgba(12,30,26,.9)';
      ctx.beginPath(); ctx.ellipse(fx-18,fy-12,9,13,0,0,7); ctx.ellipse(fx+18,fy-12,9,13,0,0,7); ctx.fill();
      const gl=0.25+0.12*Math.sin(frame*0.03);
      ctx.fillStyle='rgba(154,223,192,'+gl.toFixed(2)+')';
      ctx.beginPath(); ctx.arc(fx-18,fy-12,3,0,7); ctx.arc(fx+18,fy-12,3,0,7); ctx.fill();
      ctx.fillStyle='rgba(12,30,26,.9)'; ctx.fillRect(fx-14,fy+26,28,7);
    }
    // the geyser: a breathing vent; on the beat, a scalding column
    const gx=X(GEYSER.x);
    if(gx>-60&&gx<RW+60){
      ctx.fillStyle='#1d4a39';
      ctx.beginPath(); ctx.ellipse(gx,FLOOR_Y+HUD+2,26,7,0,0,7); ctx.fill();
      ctx.fillStyle='#0d2c22';
      ctx.beginPath(); ctx.ellipse(gx,FLOOR_Y+HUD+1,14,4,0,0,7); ctx.fill();
      if(geyserOn()){
        const top=CAGE.y+34+cageDrop*(FLOOR_Y-30-CAGE.y);
        const cg=ctx.createLinearGradient(0,top+HUD,0,FLOOR_Y+HUD);
        cg.addColorStop(0,'rgba(180,240,230,0)'); cg.addColorStop(1,'rgba(180,240,230,.55)');
        ctx.fillStyle=cg;
        ctx.fillRect(gx-11,top+HUD,22,FLOOR_Y-top);
        for(let i=0;i<7;i++){
          const ph=(frame*3+i*47)%(FLOOR_Y-top);
          ctx.fillStyle='rgba(220,250,245,'+(0.5-0.4*ph/(FLOOR_Y-top)).toFixed(2)+')';
          ctx.beginPath(); ctx.arc(gx-8+((i*13)%17), FLOOR_Y+HUD-ph, 2.5+(i%3), 0, 7); ctx.fill();
        }
      }
    }
    // the cage, its rope, and the one inside it
    const cgx=X(CAGE.x), cy=CAGE.y+cageDrop*(FLOOR_Y-30-CAGE.y)+HUD;
    if(cgx>-60&&cgx<RW+60){
      ctx.strokeStyle='#2f6b3a'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(cgx,HUD); ctx.lineTo(cgx,cy-30); ctx.stroke();
      const rock=rescued?0:Math.sin(frame*0.05)*(geyserOn()?3:1);
      ctx.save(); ctx.translate(cgx+rock,cy);
      if(!princess){
        // her: pale dress, dark hair, holding a bar with both hands
        ctx.fillStyle='#e8e0d0'; ctx.fillRect(-5,-12,10,16);
        ctx.fillStyle='#efe6c8'; ctx.beginPath(); ctx.arc(0,-17,5,0,7); ctx.fill();
        ctx.fillStyle='#2a2320'; ctx.fillRect(-5,-22,10,4);
        ctx.fillRect(-5,-20,2.5,7); ctx.fillRect(2.5,-20,2.5,7);
      }
      ctx.strokeStyle='#57a35c'; ctx.lineWidth=2.4;
      for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.moveTo(i*7,-30); ctx.lineTo(i*7,10); ctx.stroke(); }
      ctx.strokeStyle='#2f6b3a';
      ctx.beginPath(); ctx.moveTo(-15,-30); ctx.lineTo(15,-30); ctx.moveTo(-15,10); ctx.lineTo(15,10); ctx.stroke();
      if(princess){                                    // door swung open
        ctx.strokeStyle='#57a35c';
        ctx.beginPath(); ctx.moveTo(14,-30); ctx.lineTo(26,-22); ctx.stroke();
      }
      ctx.restore();
    }
    // the winch, past both patrols
    const wx=X(WINCH.x);
    if(wx>-40&&wx<RW+40){
      ctx.fillStyle='#4a3a20'; ctx.fillRect(wx-4,FLOOR_Y+HUD-26,8,26);
      ctx.strokeStyle='#8a6a3a'; ctx.lineWidth=3;
      const wa=(rescueT/RESCUE_NEED)*6.28 + (rescued?frame*0:0);
      ctx.beginPath(); ctx.arc(wx,FLOOR_Y+HUD-26,9,0,7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx,FLOOR_Y+HUD-26);
      ctx.lineTo(wx+Math.cos(wa)*12,FLOOR_Y+HUD-26+Math.sin(wa)*12); ctx.stroke();
      ctx.strokeStyle='rgba(87,163,92,.6)'; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.moveTo(wx,FLOOR_Y+HUD-32); ctx.lineTo(X(CAGE.x),HUD+4); ctx.stroke();
      if(!rescued && Math.abs(pl.x-WINCH.x)<52){
        drawLabel(geyserOn()? 'the works are scalding — wait for the vent'
                            : '[hold SPACE] crank the winch', wx, FLOOR_Y+HUD-46, '#ffe9a0');
        if(rescueT>0){
          ctx.fillStyle='rgba(10,20,16,.7)'; ctx.fillRect(wx-24,FLOOR_Y+HUD-40,48,5);
          ctx.fillStyle='#9adf5c'; ctx.fillRect(wx-24,FLOOR_Y+HUD-40,48*rescueT/RESCUE_NEED,5);
        }
      }
    }
    // the keepers — hooded, torchlit, and after the rescue, kneeling
    for(const k of keepers){
      const kx=X(k.x); if(kx<-30||kx>RW+30) continue;
      const ky=FLOOR_Y+HUD;
      ctx.save(); ctx.translate(kx,ky); if(k.dir<0) ctx.scale(-1,1);
      const tw2=0.6+0.25*Math.sin(frame*0.2+k.x);
      if(rescued){
        ctx.fillStyle='#16302a'; ctx.beginPath();
        ctx.moveTo(-8,0); ctx.lineTo(-6,-14); ctx.lineTo(6,-16); ctx.lineTo(8,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#1e3d34'; ctx.beginPath(); ctx.arc(2,-18,5,0,7); ctx.fill();
        ctx.fillStyle='rgba(255,180,80,'+tw2.toFixed(2)+')';
        ctx.beginPath(); ctx.arc(12,-4,3.5,0,7); ctx.fill();   // torch set down
      } else {
        const bob=Math.abs(Math.sin(frame*0.12+k.x))*1.2;
        ctx.fillStyle='#16302a'; ctx.beginPath();
        ctx.moveTo(-7,0); ctx.lineTo(-5,-24+bob); ctx.lineTo(5,-26+bob); ctx.lineTo(7,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#1e3d34'; ctx.beginPath(); ctx.arc(0,-29+bob,5.5,0,7); ctx.fill();
        ctx.fillStyle='#0b1c16'; ctx.beginPath(); ctx.arc(2,-29+bob,2.6,0,7); ctx.fill();  // hood shadow
        ctx.strokeStyle='#4a3a20'; ctx.lineWidth=2.4;
        ctx.beginPath(); ctx.moveTo(6,-18+bob); ctx.lineTo(13,-30+bob); ctx.stroke();
        ctx.fillStyle='rgba(255,180,80,'+tw2.toFixed(2)+')';
        ctx.beginPath(); ctx.arc(13.5,-32+bob,4,0,7); ctx.fill();
        ctx.fillStyle='rgba(255,230,150,.9)';
        ctx.beginPath(); ctx.arc(13.5,-32+bob,1.6,0,7); ctx.fill();
      }
      ctx.restore();
    }
    // the freed princess, walking out
    if(princess && !princess.gone){
      const px=X(princess.x); const py=FLOOR_Y+HUD;
      const bob=princess.walking? Math.abs(Math.sin(frame*0.2))*1.4 : 0;
      ctx.fillStyle='#e8e0d0'; ctx.fillRect(px-5,py-16-bob,10,16);
      ctx.fillStyle='#efe6c8'; ctx.beginPath(); ctx.arc(px,py-21-bob,5,0,7); ctx.fill();
      ctx.fillStyle='#2a2320'; ctx.fillRect(px-5,py-26-bob,10,4);
      if(princess.sparkleT>0){
        for(let i=0;i<6;i++){
          const sp2=(princess.sparkleT+i*11)%70/70;
          ctx.fillStyle='rgba(207,232,216,'+(1-sp2).toFixed(2)+')';
          ctx.beginPath(); ctx.arc(px-8+((i*7)%17), py-10-sp2*90, 1.6, 0, 7); ctx.fill();
        }
      }
    }
  }

  // idol
  if(!idolGot){
    const ix=X(IDOL.x);
    if(ix>-40&&ix<RW+40){
      const pul=0.5+0.3*Math.sin(frame*0.06);
      const g=ctx.createRadialGradient(ix,IDOL.y+HUD,3,ix,IDOL.y+HUD,34);
      g.addColorStop(0,'rgba(255,224,102,'+pul.toFixed(2)+')'); g.addColorStop(1,'rgba(255,224,102,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ix,IDOL.y+HUD,34,0,7); ctx.fill();
      ctx.fillStyle='#c9a53f';
      ctx.fillRect(ix-8,IDOL.y+HUD-2,16,20);
      ctx.fillStyle='#ffe066';
      ctx.beginPath(); ctx.arc(ix,IDOL.y+HUD-8,9,0,7); ctx.fill();
      ctx.fillStyle='#7a5a1a';
      ctx.beginPath(); ctx.arc(ix-3,IDOL.y+HUD-10,2,0,7); ctx.arc(ix+3,IDOL.y+HUD-10,2,0,7); ctx.fill();
    }
  }
  // exit root
  const ex=X(EXIT_ROOT.x);
  if(ex>-40&&ex<RW+40){
    ctx.strokeStyle='#57a35c'; ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(ex,HUD); ctx.quadraticCurveTo(ex+8,HUD+120,ex,FLOOR_Y+HUD-40); ctx.stroke();
    ctx.strokeStyle='#9adf5c'; ctx.lineWidth=2; ctx.setLineDash([6,5]);
    ctx.beginPath(); ctx.moveTo(ex,HUD); ctx.quadraticCurveTo(ex+8,HUD+120,ex,FLOOR_Y+HUD-40); ctx.stroke();
    ctx.setLineDash([]);
    if(Math.abs(pl.x-EXIT_ROOT.x)<50) drawLabel('[UP] climb home', ex, FLOOR_Y+HUD-52, '#ffe9a0');
  }

  // player
  drawDiver();
  // HUD strip
  const hg=ctx.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#08202a'); hg.addColorStop(1,'#04121c');
  ctx.fillStyle=hg; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle='rgba(87,163,92,.4)'; ctx.fillRect(0,HUD-2,RW,2);
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#9adf5c';
  ctx.fillText(SCR_NAMES[jscr], RW/2, 24);
  ctx.font='11px '+FONT; ctx.fillStyle='#5a8a7a';
  ctx.fillText(onVine? 'LEFT/RIGHT pump · UP/DOWN climb (dodge birds!) · SPACE release' :
               pl.swim? 'swim with arrows · avoid OPEN jaws · SPACE leaps from surface' :
               'jump into a vine to catch it', RW/2, 40);
  if(introT>0){
    ctx.globalAlpha=Math.min(1,introT/30);
    ctx.font='bold 13px '+FONT; ctx.fillStyle='#cfe8d8'; ctx.textAlign='center';
    ctx.fillText('Something BIG stirs below. It turns out to be a whole world.', RW/2, HUD+70);
    ctx.globalAlpha=1;
  }
  // screen-name card on crossing a seam
  if(nameT>0 && introT<=0){
    ctx.globalAlpha=Math.min(1,nameT/25);
    ctx.font='bold 17px '+FONT; ctx.textAlign='center';
    ctx.lineWidth=4; ctx.strokeStyle='rgba(4,14,10,.85)';
    ctx.strokeText(SCR_NAMES[jscr], RW/2, HUD+96);
    ctx.fillStyle='#cfe8d8'; ctx.fillText(SCR_NAMES[jscr], RW/2, HUD+96);
    ctx.globalAlpha=1;
  }
  // the wipe between screens
  if(wipeT>0){
    ctx.globalAlpha=wipeT/16;
    ctx.fillStyle='#020806'; ctx.fillRect(0,HUD,RW,RH);
    ctx.globalAlpha=1;
  }
}
function drawDiver(){
  const x=pl.x-camX, y=pl.y+HUD;
  if(pl.iframes>0 && (frame>>2)%2) return;
  ctx.save();
  // little adventurer — flat two-shade bodies with an ink line so he
  // reads against the canopy instead of dissolving into it
  const SKIN='#e8d9b0', SUIT='#2e6a8a', LEG='#1d4a5e';
  if(onVine){                                                            // arms up, gripping
    GFX.box(ctx, x-2.5, y-35, 5, 10, SKIN, GFX.dim(SKIN,0.78), 2.5);
  }
  if(pl.swim){
    GFX.box(ctx, x-9, y-9.5, 8, 5, LEG, GFX.dim(LEG,0.7), 2.5);          // frog legs
    GFX.box(ctx, x+1, y-7.5, 8, 5, LEG, GFX.dim(LEG,0.7), 2.5);
  } else {
    GFX.box(ctx, x-5, y-7, 4.5, 8, LEG, GFX.dim(LEG,0.7), 1.5);          // legs
    GFX.box(ctx, x+0.5, y-7, 4.5, 8, LEG, GFX.dim(LEG,0.7), 1.5);
  }
  GFX.box(ctx, x-5.5, y-19.5, 11, 13, SUIT, GFX.dim(SUIT,0.68), 3);      // torso
  GFX.body(ctx, x, y-24, 6.2, 6.2, SKIN, GFX.dim(SKIN,0.76));            // head
  ctx.fillStyle='#0b1c16';                                               // eye
  ctx.beginPath(); ctx.arc(x+pl.face*2.2, y-25, 1.3, 0, 7); ctx.fill();
  ctx.restore();
}

/* ---------------- API ---------------- */
window.JungleLayer={
  enter(){
    buildWorld();
    idolGot=!!flags.jungleDone;
    rescued=!!flags.jungleRescue;
    if(rescued){ cageDrop=1; princess={x:EXIT_ROOT.x, walking:false, gone:true, sparkleT:0}; }
    jscr=0; wipeT=0; nameT=0;
    respawnPool(); introT=140; exitLatch=true; spaceWas=true;
    camX=0;
  },
  exitDone(){},
  update, draw
};

})();
