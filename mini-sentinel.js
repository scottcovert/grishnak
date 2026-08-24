"use strict";
/* ============================================================
   GRISHNAK — THE SENTINEL'S NEST
   SCREEN 1: THE HATCHERY   (Manic Miner x Mappy)

   Five of the Sentinel's eggs rolled out of the nest and down
   the hollow. Gather them and carry them home before dawn.

   The Manic Miner half: one hand-built screen, patrolling
   WARDENS on fixed routes, a draining DAWN meter, collect
   everything THEN the exit (the nest) lights up.
   The Mappy half: leaf TRAMPOLINES. Consecutive bounces climb
   higher (3 stages), and while you're AIRBORNE the wardens
   cannot touch you — they only see what walks. Walking a
   platform between their passes is the whole game.

   Look brief (Scott): better than original C64 — Bruce Lee
   silhouettes + Williams saturation. Ink outlines, moonlight,
   moss-topped branch beams, glow discipline.

   ARROWS move · SPACE small hop · E leaves · P/R global.
   ============================================================ */
(function(){

const W=RW, H=RH+HUD;
const TOPBAR=46;
const GRAV=0.42, MOVE=2.4, HOP=-5.2, MAXFALL=9.5;
const BOUNCE=[-8.6,-10.4,-12.2];     // Mappy: consecutive bounces climb
const PW=14, PH=20;
const DAWN_T=4500;                   // 75s of night
const LIVES0=10;

/* ---------------- the screen ---------------- */
let plats=[], tramps=[], wardens=[], eggs=[];
const NEST={x:320, y:96, w:140};     // ledge holding the nest, top centre
function buildLevel(){
  // platform tops {x,y,w}; the floor is plats[0]
  plats=[
    {x:0,   y:392, w:640},           // hollow floor
    {x:20,  y:312, w:170},           // tier 1
    {x:250, y:312, w:160},
    {x:470, y:312, w:150},
    {x:70,  y:232, w:180},           // tier 2
    {x:330, y:232, w:220},
    {x:30,  y:152, w:150},           // tier 3
    {x:250, y:152, w:140},
    {x:460, y:152, w:150},
    {x:250, y:96,  w:140}            // nest ledge
  ];
  // trampolines sit ON a platform: {x centre, y = platform top}
  tramps=[
    {x:215, y:392, sag:0, st:0},     // under the tier-1 left gap
    {x:435, y:392, sag:0, st:0},     // under the tier-1 right gap
    {x:350, y:232, sag:0, st:0}      // tier 2 — the road to tier 3 + nest
  ];
  // fixed patrol routes {x0,x1,y platform top, spd, x, dir}
  wardens=[
    {x0:255, x1:400, y:312, spd:1.05},
    {x0:340, x1:540, y:232, spd:1.25},
    {x0:35,  x1:170, y:152, spd:0.95},
    {x0:465, x1:600, y:152, spd:1.45}
  ];
  for(const wd of wardens){ wd.x=wd.x0; wd.dir=1; wd.bob=Math.random()*6; }
  // the five strays {x, y platform top, got}
  eggs=[
    {x:44,  y:392}, {x:600, y:312}, {x:92,  y:232},
    {x:305, y:152}, {x:585, y:152}
  ];
  for(const e of eggs) e.got=false;
}

/* ---------------- state ---------------- */
let P={x:60, y:392, vx:0, vy:0, dir:1, air:false, walkT:0, sq:0};
let lives=LIVES0, dawn=DAWN_T, got=0, won=false, deadT=0, doneT=0, over=false;
let introT=0, exitLatch=true, spaceLatch=true, shake=0, iframes=0;
let parts=[], flashT=0, savedPos=null;

function respawn(){
  P.x=60; P.y=392; P.vx=0; P.vy=0; P.dir=1; P.air=false; P.sq=0;
  iframes=90;
}
function puffAt(x,y,col,n){ for(let i=0;i<n;i++) parts.push({x,y,vx:(Math.random()-.5)*3,vy:(Math.random()-.5)*2.6-0.8,life:20+Math.random()*12,col}); }

function die(){
  if(deadT>0||doneT>0) return;
  sfx.hurt && sfx.hurt();
  puffAt(P.x, P.y-10, '#ff6a4a', 14);
  shake=7; deadT=50;
}
function afterDeath(){
  lives--;
  if(lives<=0){ over=true; doneT=160; sfx.denied&&sfx.denied(); return; }
  dawn=Math.min(DAWN_T, dawn+600);   // a little night back — kindness
  respawn();
}

/* ---------------- update ---------------- */
function platUnder(x, y){
  // the platform whose top is at y (within snap) under x
  for(const p of plats){ if(x>=p.x-2 && x<=p.x+p.w+2 && Math.abs(y-p.y)<1) return p; }
  return null;
}
function update(){
  if(introT>0){ introT--; }
  if(typeof clickQueue!=='undefined') clickQueue.length=0;

  const ek=held['e']||held['E'];
  if(ek && !exitLatch){ exitLatch=true; startSentinelTrans('out'); return; }
  if(!ek) exitLatch=false;

  if(deadT>0){ if(--deadT===0) afterDeath(); return; }
  if(doneT>0){ if(--doneT===0 && !over && !won){} return; }
  if(won||over){
    const sp=held[' '];
    if(sp && !spaceLatch){ spaceLatch=true; startSentinelTrans('out'); }
    if(!sp) spaceLatch=false;
    return;
  }

  // dawn drains
  if(introT<=0 && --dawn<=0){ dawn=0; die(); return; }
  if(iframes>0) iframes--;

  // walk
  const L=held['ArrowLeft']||held['a']||held['A'], R=held['ArrowRight']||held['d']||held['D'];
  P.vx = L&&!R? -MOVE : R&&!L? MOVE : 0;
  if(P.vx) P.dir=Math.sign(P.vx);
  if(P.vx && !P.air) P.walkT++;

  // small hop
  const sp=held[' '];
  if(sp && !spaceLatch){ spaceLatch=true;
    if(!P.air){ P.air=true; P.vy=HOP; P.sq=6; sfx.jump? sfx.jump() : (sfx.task&&sfx.task()); }
  }
  if(!sp) spaceLatch=false;

  const wasY=P.y;
  P.x=Math.max(PW/2+2, Math.min(W-PW/2-2, P.x+P.vx));
  if(P.air){
    P.vy=Math.min(MAXFALL, P.vy+GRAV);
    P.y+=P.vy;
    if(P.vy>0){                                  // falling: land on a top we crossed
      for(const p of plats){
        if(P.x>p.x-2 && P.x<p.x+p.w+2 && wasY<=p.y && P.y>=p.y){
          P.y=p.y; P.vy=0; P.air=false; P.sq=5;
          puffAt(P.x, P.y, '#8fce6a', 3);
          break;
        }
      }
    }
    if(P.y>H+20){ die(); }                       // fell out of the hollow
  } else {
    // walked off an edge?
    if(!platUnder(P.x, P.y)){ P.air=true; P.vy=0.5; }
  }

  // trampolines: land ON one and it throws you — stage grows per quick reuse
  for(const t of tramps){
    if(t.sag>0) t.sag--;
    if(!P.air && Math.abs(P.x-t.x)<26 && Math.abs(P.y-t.y)<1){
      if(frame-(t.last||0)>210) t.st=0;          // stale streak resets
      P.air=true; P.vy=BOUNCE[t.st]; t.sag=10; t.last=frame;
      t.st=Math.min(2, t.st+1);
      P.sq=8; puffAt(P.x, P.y, '#c8f07a', 6);
      sfx.pick&&sfx.pick();
    }
  }

  // wardens: eased fixed routes; they only see what WALKS
  for(const wd of wardens){
    wd.x+=wd.spd*wd.dir;
    if(wd.x>wd.x1){ wd.x=wd.x1; wd.dir=-1; }
    if(wd.x<wd.x0){ wd.x=wd.x0; wd.dir=1; }
    if(!P.air && iframes<=0 && Math.abs(P.y-wd.y)<4 &&
       Math.abs(P.x-wd.x)<PW/2+11){ die(); return; }
  }

  // eggs: gathered by touch (grounded or not — reaching them is the work)
  for(const e of eggs){
    if(!e.got && Math.abs(P.x-e.x)<14 && Math.abs(P.y-e.y)<26){
      e.got=true; got++;
      puffAt(e.x, e.y-10, '#ffe9b0', 8);
      sfx.chest&&sfx.chest();
      if(got>=eggs.length){ flashT=26; toast('All five. The nest is waiting, up top.'); }
    }
  }
  if(flashT>0) flashT--;

  // the nest takes them home
  if(got>=eggs.length && !won &&
     P.x>NEST.x-56 && P.x<NEST.x+56 && Math.abs(P.y-NEST.y)<6){
    won=true; doneT=40; shake=4; sfx.win&&sfx.win();
    if(!flags.sentinelDone){
      flags.sentinelDone=true;
      res.gold=Math.min(999, res.gold+45);
      toast('The Sentinel settles over her eggs. +45 gold, and a deed remembered.');
      if(typeof saveGame==='function') saveGame();
    } else toast('The nest is whole again.');
  }

  for(let i=parts.length-1;i>=0;i--){ const q=parts[i]; q.x+=q.vx; q.y+=q.vy; q.vy+=0.07; if(--q.life<=0) parts.splice(i,1); }
  if(shake>0) shake--;
  if(P.sq>0) P.sq--;
}

/* ---------------- draw ---------------- */
function drawBG(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#0a0c1e'); g.addColorStop(0.6,'#141028'); g.addColorStop(1,'#1c1030');
  ctx.fillStyle=g; ctx.fillRect(-8,-8,W+16,H+16);
  // the moon through the hollow's mouth
  const mg=ctx.createRadialGradient(112,108,6,112,108,86);
  mg.addColorStop(0,'rgba(230,238,255,.95)'); mg.addColorStop(0.25,'rgba(180,200,255,.30)');
  mg.addColorStop(1,'rgba(150,180,255,0)');
  ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(112,108,86,0,7); ctx.fill();
  ctx.fillStyle='#dde6ff'; ctx.beginPath(); ctx.arc(112,108,26,0,7); ctx.fill();
  ctx.fillStyle='rgba(160,180,230,.35)';
  ctx.beginPath(); ctx.arc(104,100,5,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(120,116,3.4,0,7); ctx.fill();
  // hollow walls: two great root arcs, pure silhouette
  ctx.fillStyle='#0d0a1c';
  ctx.beginPath(); ctx.moveTo(-8,H); ctx.quadraticCurveTo(60,220,10,-8); ctx.lineTo(-8,-8); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(W+8,H); ctx.quadraticCurveTo(W-70,240,W-16,-8); ctx.lineTo(W+8,-8); ctx.closePath(); ctx.fill();
  // fireflies
  for(let i=0;i<9;i++){
    const fx=(i*173+((frame*(0.2+i*0.03))%40))%W, fy=90+(i*67)%260+Math.sin(frame*0.02+i)*8;
    ctx.fillStyle='rgba(200,255,140,'+(0.25+0.25*Math.sin(frame*0.06+i*2)).toFixed(2)+')';
    ctx.fillRect(fx,fy,2,2);
  }
}
function drawPlat(p){
  const x=p.x, y=p.y, w=p.w;
  ctx.fillStyle='rgba(0,0,0,.30)'; ctx.fillRect(x+3,y+13,w-6,4);       // drop shadow
  // branch body
  const g=ctx.createLinearGradient(0,y,0,y+12);
  g.addColorStop(0,'#4a3626'); g.addColorStop(1,'#2c1e14');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y,w,12,5):ctx.rect(x,y,w,12); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=2; ctx.stroke();
  // moss cap with a lit edge
  ctx.fillStyle='#3e6a2e';
  ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y-3,w,6,3):ctx.rect(x,y-3,w,6); ctx.fill();
  ctx.fillStyle='#8fce6a'; ctx.fillRect(x+2,y-3,w-4,1.6);
  // moss tufts
  for(let i=x+10;i<x+w-8;i+=34){
    ctx.fillStyle='#4e7a3a';
    ctx.beginPath(); ctx.arc(i,y-3,3,Math.PI,0); ctx.fill();
  }
}
function drawTramp(t){
  const sag=t.sag>0? 6:0;
  ctx.fillStyle='#241a12';
  ctx.fillRect(t.x-26,t.y-14,5,14); ctx.fillRect(t.x+21,t.y-14,5,14);   // stub posts
  ctx.strokeStyle='#9fdc5a'; ctx.lineWidth=3.4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(t.x-23,t.y-12);
  ctx.quadraticCurveTo(t.x, t.y-12+sag+2, t.x+23, t.y-12); ctx.stroke();
  ctx.strokeStyle='rgba(220,255,160,.5)'; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(t.x-20,t.y-13.5);
  ctx.quadraticCurveTo(t.x, t.y-13.5+sag+2, t.x+20, t.y-13.5); ctx.stroke();
  if(t.st>0){                                     // streak stage glints
    for(let i=0;i<t.st;i++){ ctx.fillStyle='#c8f07a'; ctx.fillRect(t.x-6+i*6, t.y-22, 3,3); }
  }
}
function drawEgg(x,y,glow){
  if(glow){
    const g=ctx.createRadialGradient(x,y-8,1,x,y-8,16);
    g.addColorStop(0,'rgba(255,225,150,.5)'); g.addColorStop(1,'rgba(255,225,150,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y-8,16,0,7); ctx.fill();
  }
  ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x,y-0.5,7,2.2,0,0,7); ctx.fill();
  const g2=ctx.createLinearGradient(x-6,y-16,x+6,y);
  g2.addColorStop(0,'#fff6e0'); g2.addColorStop(1,'#e8c894');
  ctx.fillStyle=g2;
  ctx.beginPath(); ctx.ellipse(x,y-8,6.4,8.4,0,0,7); ctx.fill();
  ctx.strokeStyle='rgba(60,40,20,.55)'; ctx.lineWidth=1.4; ctx.stroke();
  ctx.fillStyle='#caa06a';
  ctx.fillRect(x-2.5,y-11,2,2); ctx.fillRect(x+1,y-7,1.8,1.8); ctx.fillRect(x-1,y-4.5,1.6,1.6);
  ctx.fillStyle='rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(x-2,y-11.5,1.8,2.6,-0.5,0,7); ctx.fill();
}
function drawWarden(wd){
  const x=wd.x, y=wd.y-11+Math.sin((frame+wd.bob*10)*0.09)*1.6;
  ctx.fillStyle='rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(wd.x,wd.y-0.5,9,2.4,0,0,7); ctx.fill();
  // wings: two-frame flicker
  const wf=(frame>>2)%2;
  ctx.fillStyle='rgba(200,220,255,'+(wf?'.55':'.30')+')';
  ctx.beginPath(); ctx.ellipse(x-3,y-8,7,3.4,-0.6+(wf?0.25:0),0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x+3,y-8,7,3.4,0.6-(wf?0.25:0),0,7); ctx.fill();
  // banded body, ink outline
  const g=ctx.createLinearGradient(x-10,y,x+10,y);
  g.addColorStop(0,'#f0b83a'); g.addColorStop(1,'#c8901e');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.ellipse(x,y,10,6.4,0,0,7); ctx.fill();
  ctx.strokeStyle='rgba(10,6,2,.8)'; ctx.lineWidth=1.6; ctx.stroke();
  ctx.fillStyle='#241a10';
  ctx.fillRect(x-6.5,y-5.5,3.4,11); ctx.fillRect(x-0.5,y-6,3.4,12);
  // head + hot eye toward travel
  ctx.fillStyle='#2c2418'; ctx.beginPath(); ctx.arc(x+wd.dir*10,y-1,4.4,0,7); ctx.fill();
  ctx.fillStyle='#ff4a3a'; ctx.beginPath(); ctx.arc(x+wd.dir*11.5,y-2,1.7,0,7); ctx.fill();
  ctx.fillStyle='rgba(255,90,60,.35)'; ctx.beginPath(); ctx.arc(x+wd.dir*11.5,y-2,3.6,0,7); ctx.fill();
  // stinger
  ctx.fillStyle='#e8e0d0';
  ctx.beginPath(); ctx.moveTo(x-wd.dir*10,y); ctx.lineTo(x-wd.dir*14,y+1); ctx.lineTo(x-wd.dir*10,y+2.4); ctx.closePath(); ctx.fill();
}
function drawPlayer(){
  if(iframes>0 && (frame>>2)%2) return;          // respawn flicker
  const sq=P.sq>0? P.sq/8 : 0;
  const w=PW*(1+sq*0.35), h=PH*(1-sq*0.3);
  const x=P.x, y=P.y;
  ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x,y-0.5,8,2.4,0,0,7); ctx.fill();
  ctx.save(); ctx.translate(x,y); if(P.dir<0) ctx.scale(-1,1);
  // the tail — a proud curl behind
  ctx.strokeStyle='#a85a28'; ctx.lineWidth=5.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-w*0.4,-h*0.35);
  ctx.quadraticCurveTo(-w*1.1,-h*0.7,-w*0.75,-h*1.05); ctx.stroke();
  ctx.strokeStyle='#d67d3e'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(-w*0.4,-h*0.38);
  ctx.quadraticCurveTo(-w*1.0,-h*0.7,-w*0.72,-h*1.0); ctx.stroke();
  // legs (2-frame walk)
  const step=P.air? 2 : (P.walkT>>3)%2? 2.5:-2.5;
  ctx.fillStyle='#8a4820';
  ctx.fillRect(-4,-4+ (step>0?0:1), 3.4,5); ctx.fillRect(1,-4+(step>0?1:0),3.4,5);
  // body with cream belly
  const g=ctx.createLinearGradient(0,-h,0,0);
  g.addColorStop(0,'#e08a48'); g.addColorStop(1,'#b05f28');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.ellipse(0,-h*0.5,w*0.5,h*0.5,0,0,7); ctx.fill();
  ctx.strokeStyle='rgba(20,10,4,.8)'; ctx.lineWidth=1.8; ctx.stroke();
  ctx.fillStyle='#ffe9c8'; ctx.beginPath(); ctx.ellipse(w*0.12,-h*0.38,w*0.26,h*0.3,0,0,7); ctx.fill();
  // head: ears, eye, cheek
  ctx.fillStyle='#d67d3e';
  ctx.beginPath(); ctx.arc(w*0.18,-h*0.86,5.4,0,7); ctx.fill();
  ctx.strokeStyle='rgba(20,10,4,.8)'; ctx.lineWidth=1.6; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w*0.0,-h*1.05); ctx.lineTo(w*0.1,-h*1.3); ctx.lineTo(w*0.25,-h*1.06); ctx.closePath();
  ctx.fillStyle='#b05f28'; ctx.fill();
  ctx.fillStyle='#1c0e06'; ctx.beginPath(); ctx.arc(w*0.3,-h*0.9,1.7,0,7); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.9)'; ctx.fillRect(w*0.3,-h*0.95,1,1);
  ctx.restore();
}
function drawNest(){
  const active=got>=eggs.length && !won;
  const x=NEST.x, y=NEST.y;
  if(active){
    const p=0.5+0.5*Math.sin(frame*0.1);
    const g=ctx.createRadialGradient(x,y-10,4,x,y-10,52);
    g.addColorStop(0,'rgba(255,225,140,'+(0.35+0.25*p).toFixed(2)+')');
    g.addColorStop(1,'rgba(255,225,140,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y-10,52,0,7); ctx.fill();
  }
  // woven bowl
  ctx.fillStyle='#3a2a1c';
  ctx.beginPath(); ctx.ellipse(x,y-8,34,13,0,0,Math.PI); ctx.fill();
  for(let i=0;i<3;i++){
    ctx.strokeStyle=['#7a5c3e','#5c4228','#8a6a44'][i]; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.ellipse(x,y-8-i*0.5,34-i*3,12-i*2,0,0.15,Math.PI-0.15); ctx.stroke();
  }
  if(won){                                        // the eggs, home; the Sentinel above
    for(let i=0;i<5;i++) drawEgg(x-22+i*11, y-9, true);
    ctx.fillStyle='rgba(20,14,34,.9)';
    ctx.beginPath(); ctx.ellipse(x,y-46,26,15,0,0,7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x-24,y-52,16,6,-0.5,0,7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+24,y-52,16,6,0.5,0,7); ctx.fill();
    ctx.fillStyle='#ffd76e'; ctx.beginPath(); ctx.arc(x-7,y-48,2.2,0,7); ctx.fill();
    ctx.beginPath(); ctx.arc(x+7,y-48,2.2,0,7); ctx.fill();
  }
}
function draw(){
  ctx.save();
  if(shake>0) ctx.translate((Math.random()-.5)*shake*1.8,(Math.random()-.5)*shake*1.4);
  drawBG();
  for(const p of plats) drawPlat(p);
  drawNest();
  for(const t of tramps) drawTramp(t);
  for(const e of eggs) if(!e.got) drawEgg(e.x, e.y, true);
  drawPlayer();
  for(const wd of wardens) drawWarden(wd);
  for(const q of parts){ ctx.globalAlpha=Math.min(1,q.life/14); ctx.fillStyle=q.col; ctx.fillRect(q.x-1.5,q.y-1.5,3,3); ctx.globalAlpha=1; }

  // top bar
  ctx.fillStyle='rgba(8,10,20,.92)'; ctx.fillRect(-8,-8,W+16,TOPBAR+8);
  ctx.fillStyle='rgba(159,220,90,.4)'; ctx.fillRect(0,TOPBAR-2,W,2);
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#c9a5ff';
  ctx.fillText("THE SENTINEL'S NEST", W/2, 18);
  ctx.font='10px '+FONT; ctx.fillStyle='#8a90b0';
  ctx.fillText('SCREEN 1 · THE HATCHERY — bouncing is safe; walking is seen', W/2, 34);
  // eggs
  ctx.textAlign='left'; ctx.font='bold 12px '+FONT; ctx.fillStyle='#ffe9b0';
  ctx.fillText('EGGS', 14, 18);
  for(let i=0;i<eggs.length;i++){
    ctx.fillStyle= i<got? '#ffe9b0':'#3a3450';
    ctx.beginPath(); ctx.ellipse(58+i*13, 14, 4,5.4,0,0,7); ctx.fill();
  }
  // dawn meter
  const dw=120, dx=14, dy=28;
  ctx.fillStyle='#8a90b0'; ctx.font='9px '+FONT; ctx.fillText('DAWN', dx, dy+7);
  ctx.fillStyle='rgba(255,255,255,.12)'; ctx.fillRect(dx+34, dy, dw, 7);
  const fr=dawn/DAWN_T;
  ctx.fillStyle= fr>0.35? '#ffd76e' : '#ff6a4a';
  ctx.fillRect(dx+34, dy, dw*fr, 7);
  // lives
  ctx.textAlign='right';
  for(let i=0;i<LIVES0;i++){ ctx.fillStyle= i<lives? '#ff5a5a':'#342838';
    ctx.beginPath(); ctx.arc(W-14-i*13,14,4.2,0,7); ctx.fill(); }
  ctx.font='10px '+FONT; ctx.fillStyle='#8a90b0';
  ctx.fillText('E leave', W-14, 36);
  if(flashT>0 && (frame>>2)%2){
    ctx.textAlign='center'; ctx.font='bold 12px '+FONT; ctx.fillStyle='#c8f07a';
    ctx.fillText('THE NEST IS LIT — GO UP', W/2, TOPBAR+14);
  }
  if(introT>0){
    ctx.fillStyle='rgba(8,6,18,'+Math.min(0.72,introT/50).toFixed(2)+')';
    ctx.fillRect(-8,TOPBAR,W+16,H);
    ctx.textAlign='center'; ctx.font='bold 17px '+FONT; ctx.fillStyle='#ffe9b0';
    ctx.fillText('Five eggs rolled down the hollow.', W/2, 200);
    ctx.font='13px '+FONT; ctx.fillStyle='#c9a5ff';
    ctx.fillText('Bring them home before dawn. The wardens only see what walks.', W/2, 226);
  }
  if(won||over){
    ctx.fillStyle='rgba(4,4,12,.66)'; ctx.fillRect(-8,-8,W+16,H+16);
    ctx.textAlign='center'; ctx.font='bold 26px '+FONT;
    ctx.fillStyle= won? '#ffd76e':'#ff8a8a';
    ctx.fillText(won? 'THE NEST IS WHOLE':'DAWN CAME FIRST', W/2, H/2-14);
    ctx.font='13px '+FONT; ctx.fillStyle='#d8d2e4';
    ctx.fillText('SPACE to leave', W/2, H/2+14);
  }
  ctx.restore();
}

/* ---------------- API ---------------- */
window.SentinelLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    buildLevel();
    lives=LIVES0; dawn=DAWN_T; got=0; won=false; over=false;
    deadT=0; doneT=0; parts=[]; shake=0; flashT=0;
    respawn(); iframes=0;
    exitLatch=true; spaceLatch=true; introT=110;
    PL.kb.x=0; PL.kb.y=0;
    toast("THE HATCHERY. Trampolines throw you higher each quick bounce. Wardens only see what walks.");
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; } else loadScreen(12);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw,
  _t:{ get plats(){return plats;}, get tramps(){return tramps;}, get wardens(){return wardens;},
       get eggs(){return eggs;}, get P(){return P;}, get lives(){return lives;},
       get dawn(){return dawn;}, set dawn(v){dawn=v;}, get got(){return got;},
       get won(){return won;}, get over(){return over;}, get deadT(){return deadT;},
       get iframes(){return iframes;}, set iframes(v){iframes=v;},
       skipIntro(){ introT=0; },
       BOUNCE, NEST, LIVES0, DAWN_T, buildLevel, respawn, update }
};

})();
