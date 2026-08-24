"use strict";
/* ============================================================
   GRISHNAK — MR. ROBOT (Robotron-tribute arcade room, wave build)
   Proper Robotron structure: every wave MATERIALIZES its whole
   robot population at once around you in an EMPTY arena, and you
   survive it or you don't. One touch = one life (3 lives).
   You fire constantly in the direction you walk (single-stick
   compromise: positioning IS aiming).
   The cast, per the original's logic:
     GRUNTS   converge on YOU, in jerky bursts. Shootable. 100.
     HULKS    cannot be destroyed — bolts only shove them back.
              They lumber after the family. Green. Worth nothing.
     HUNTERS  fast diamonds that home on you smoothly. 300.
   The family respawns every wave; walking into them rescues:
   1000 x chain (chain caps x5, resets each wave). Save ALL of a
   wave's family for a 5000 perfect bonus. Waves are endless and
   scale; the score is the point. E leaves any time.
   ============================================================ */
(function(){

const PSPD=2.6;
const PLAYER_R=9, RESCUE_R=18, KILL_R=13, HIT_R=12;
const SHOT_CD=8, SHOT_SPD=8, SHOT_R=4;
const CHAIN_MAX=5, LIVES0=3;

const ROBOT_DEF={
  grunt: {r:10, pts:100, body:'#c23b2e', edge:'#5a1610', eye:'#7fe7ff'},
  hulk:  {r:14, pts:0,   body:'#5a8a4a', edge:'#243420', eye:'#ffd76e'},
  hunter:{r:9,  pts:300, body:'#7a3a9a', edge:'#2a1034', eye:'#e070ff'}
};
const HUMAN_KINDS=[
  {kind:'mommy', body:'#ff70b8', hair:'#e8c15a'},
  {kind:'daddy', body:'#5a8aff', hair:'#6a4a2a'},
  {kind:'mikey', body:'#6ee06e', hair:'#3a2a1a'}
];

let px=320, py=192;
let humans=[], robots=[], shots=[], warps=[], rid=0;
let lastDir={x:0,y:-1}, shotT=0;
let wave=0, lives=LIVES0, waveBanner=0;
let rescued=0, saved=0, lost=0, chain=0, score=0, borderFlash=0;
let ended='';                       // '' or 'over'
let savedPos=null, spaceLatch=true, eLatch=true;

function clampArena(x,y,r){ return {x:Math.max(r,Math.min(RW-r,x)), y:Math.max(r,Math.min(RH-r,y))}; }
function farSpot(minD){
  for(let tries=0;tries<40;tries++){
    const x=20+Math.random()*(RW-40), y=20+Math.random()*(RH-40);
    if(Math.hypot(x-px,y-py)>=minD) return {x,y};
  }
  return {x:20,y:20};
}
function nearestHuman(x,y){
  let best=null, bd=Infinity;
  for(const h of humans){ if(!h.alive) continue; const d=Math.hypot(x-h.x,y-h.y); if(d<bd){ bd=d; best=h; } }
  return best;
}

/* ---- wave construction: the whole population at once ---- */
function waveCounts(n){
  return {
    grunt:  Math.min(30, 8+(n-1)*4),
    hulk:   n>=2? Math.min(5, 1+((n-2)>>1)) : 0,
    hunter: n>=3? Math.min(6, n-2) : 0,
    family: Math.min(6, 3+((n-1)>>1))
  };
}
function startWave(n){
  wave=n; robots=[]; shots=[]; warps=[]; chain=0; saved=0; lost=0;
  px=RW/2; py=RH/2; PL.iframes=100;
  const c=waveCounts(n);
  humans=[];
  for(let i=0;i<c.family;i++){
    const s=farSpot(90), K=HUMAN_KINDS[i%3];
    humans.push({...K, id:i, x:s.x, y:s.y, tx:s.x, ty:s.y, wt:Math.random()*200, alive:true});
  }
  let delay=0;
  const add=(type,count)=>{ for(let i=0;i<count;i++){
    const s=farSpot(130);
    warps.push({x:s.x, y:s.y, type, t:26+delay}); delay+=2;
  }};
  add('grunt',c.grunt); add('hulk',c.hulk); add('hunter',c.hunter);
  waveBanner=80;
  if(n>1) sfx.task&&sfx.task();
}
function killable(){ return robots.filter(r=>r.type!=='hulk').length + warps.filter(w=>w.type!=='hulk').length; }

function killPlayer(){
  sfx.die(); puff(px,py+HUD,'#8ab4ff',14); puff(px,py+HUD,'#fff',8);
  lives--;
  if(lives<=0){ ended='over'; sfx.denied(); return; }
  /* respawn centre, shove the swarm to a ring — Robotron's mercy */
  px=RW/2; py=RH/2; PL.iframes=110;
  for(const r of robots){
    if(Math.hypot(r.x-px,r.y-py)<150){
      const s=farSpot(150); r.x=s.x; r.y=s.y;
      warps.push({x:r.x, y:r.y, type:null, t:18});
    }
  }
}

/* ---------------- UPDATE ---------------- */
function update(){
  if(PL.iframes>0) PL.iframes--;

  const ek=held['e']||held['E'];
  if(ek && !eLatch){ eLatch=true; startRobotronTrans('out'); return; }
  if(!ek) eLatch=false;
  const sp=held[' '];
  if(sp && !spaceLatch && ended){ startRobotronTrans('out'); return; }
  if(!sp) spaceLatch=false; else spaceLatch=true;
  if(ended) return;

  const d=dirHeld();
  const dn=Math.hypot(d.x,d.y)||1;
  if(d.x||d.y){
    px+=(d.x/dn)*PSPD; py+=(d.y/dn)*PSPD;
    lastDir={x:d.x/dn, y:d.y/dn};
    PL.fx=d.x||PL.fx; PL.fy=d.y||PL.fy; PL.walkT+=0.22;
  } else PL.walkT=0;
  ({x:px,y:py}=clampArena(px,py,PLAYER_R));

  // materialize the wave
  for(let i=warps.length-1;i>=0;i--){
    const w=warps[i];
    if(--w.t<=0){
      warps.splice(i,1);
      if(w.type){
        const def=ROBOT_DEF[w.type];
        robots.push({id:rid++, type:w.type, def, x:w.x, y:w.y, jerk:0, jdx:0, jdy:0, stag:0});
      }
    }
  }
  if(waveBanner>0){ waveBanner--; PL.x=px; PL.y=py; return; }   // breathe before the storm

  /* civilians wander OBLIVIOUSLY — the original's tragedy. They flail
     (panic is animation only) but never outrun anything; if a hulk wants
     one, only you can get there first. */
  for(const h of humans){
    if(!h.alive) continue;
    if(--h.wt<=0){ h.wt=90+Math.random()*140; const s=farSpot(0); h.tx=s.x; h.ty=s.y; }
    const vx=h.tx-h.x, vy=h.ty-h.y, vd=Math.hypot(vx,vy)||1;
    h.panic=0;
    for(const r of robots){ if(Math.hypot(r.x-h.x,r.y-h.y)<90){ h.panic=8; break; } }
    if(vd>2){ h.x+=vx/vd*0.5; h.y+=vy/vd*0.5; }
    ({x:h.x,y:h.y}=clampArena(h.x,h.y,8));
    if(Math.hypot(px-h.x,py-h.y)<RESCUE_R){
      h.alive=false; rescued++; saved++;
      chain=Math.min(CHAIN_MAX,chain+1);
      const bonus=1000*chain; score+=bonus;
      addFloat(h.x,h.y-10,''+bonus,'#bfeffc'); puff(h.x,h.y+HUD,'#7fdb7f',12);
      borderFlash=20; sfx.rescue();
    }
  }

  /* robot AI — per the original: grunts jerk toward YOU, hulks lumber
     after the family, hunters glide at you */
  const ramp=1+Math.min(0.6, wave*0.05);
  for(const r of robots){
    if(r.stag>0){ r.stag--; continue; }
    if(r.type==='grunt'){
      if(--r.jerk<=0){                        // move in bursts, slightly off-true
        r.jerk=14+Math.random()*10;
        const a=Math.atan2(py-r.y,px-r.x)+(Math.random()*0.7-0.35);
        r.jdx=Math.cos(a); r.jdy=Math.sin(a);
      }
      r.x+=r.jdx*1.15*ramp; r.y+=r.jdy*1.15*ramp;
    } else if(r.type==='hulk'){
      const t=nearestHuman(r.x,r.y);
      if(t){ const dx=t.x-r.x, dy=t.y-r.y, dd=Math.hypot(dx,dy)||1; r.x+=dx/dd*0.6; r.y+=dy/dd*0.6; }
      else { const dx=px-r.x, dy=py-r.y, dd=Math.hypot(dx,dy)||1; r.x+=dx/dd*0.4; r.y+=dy/dd*0.4; }
      r.tread=(r.tread||0)+0.05;
      for(const h of humans){
        if(!h.alive) continue;
        if(Math.hypot(r.x-h.x,r.y-h.y)<KILL_R+3){
          h.alive=false; lost++; chain=0;
          puff(h.x,h.y+HUD,'#ff5a3c',10); sfx.die();
          addFloat(h.x,h.y-10,'lost...','#ff8a7a');
        }
      }
    } else {                                   // hunter
      const dx=px-r.x, dy=py-r.y, dd=Math.hypot(dx,dy)||1;
      r.x+=dx/dd*1.9*ramp; r.y+=dy/dd*1.9*ramp;
      r.trail=r.trail||[]; r.trail.unshift({x:r.x,y:r.y}); if(r.trail.length>6) r.trail.length=6;
    }
    ({x:r.x,y:r.y}=clampArena(r.x,r.y,r.def.r));
    if(PL.iframes<=0 && Math.hypot(r.x-px,r.y-py)<HIT_R+(r.def.r-10)){
      killPlayer();
      if(ended) break;
    }
  }

  // constant fire
  if(--shotT<=0){
    shotT=SHOT_CD;
    shots.push({x:px+lastDir.x*12, y:py+lastDir.y*12, dx:lastDir.x*SHOT_SPD, dy:lastDir.y*SHOT_SPD});
  }
  for(let i=shots.length-1;i>=0;i--){
    const sh=shots[i];
    sh.x+=sh.dx; sh.y+=sh.dy;
    if(sh.x<4||sh.x>RW-4||sh.y<4||sh.y>RH-4){ shots.splice(i,1); continue; }
    for(const r of robots){
      if(Math.hypot(sh.x-r.x,sh.y-r.y)<=r.def.r+SHOT_R){
        if(r.type==='hulk'){
          /* the original's most honest mechanic: you cannot kill a hulk,
             only push it — one bolt = one shove along the bolt's line */
          const n=Math.hypot(sh.dx,sh.dy)||1;
          r.x+=sh.dx/n*10; r.y+=sh.dy/n*10; r.stag=8;
          ({x:r.x,y:r.y}=clampArena(r.x,r.y,r.def.r));
          puff(sh.x,sh.y+HUD,'#9ab88a',4); sfx.mine();
        } else {
          robots.splice(robots.indexOf(r),1);
          score+=r.def.pts; addFloat(r.x,r.y-14,''+r.def.pts,'#ffdc60');
          puff(r.x,r.y+HUD,'#bfeffc',9); sfx.explode();
        }
        shots.splice(i,1); break;
      }
    }
  }

  // wave cleared: every killable robot down (hulks never block it)
  if(!waveBanner && killable()===0){
    if(saved>0 && lost===0 && humans.every(h=>!h.alive)){
      score+=5000; borderFlash=40;
      addFloat(px,py-20,'PERFECT FAMILY +5000','#ffd23e'); sfx.win();
      if(!flags.robotronDone){
        flags.robotronDone=true; res.gold=Math.min(999,res.gold+35);
        toast('THE WHOLE FAMILY MADE IT. +35 gold, once — the rest is for the score.');
        saveGame();
      }
    }
    startWave(wave+1);
  }
  PL.x=px; PL.y=py;
}

/* ---------------- DRAW ---------------- */
function drawFloor(){
  ctx.strokeStyle='rgba(120,80,160,.12)'; ctx.lineWidth=1;
  for(let x=0;x<=RW;x+=32){ ctx.beginPath(); ctx.moveTo(x,HUD); ctx.lineTo(x,HUD+RH); ctx.stroke(); }
  for(let y=0;y<=RH;y+=32){ ctx.beginPath(); ctx.moveTo(0,y+HUD); ctx.lineTo(RW,y+HUD); ctx.stroke(); }
  if(borderFlash>0){
    borderFlash--;
    const hue=(frame*40)%360;
    ctx.strokeStyle='hsla('+hue+',100%,70%,.9)'; ctx.lineWidth=4;
    ctx.strokeRect(3,HUD+3,RW-6,RH-6);
    ctx.strokeStyle='hsla('+((hue+120)%360)+',100%,65%,.5)'; ctx.lineWidth=2;
    ctx.strokeRect(7,HUD+7,RW-14,RH-14);
  } else {
    const pul=0.25+Math.sin(frame*0.05)*0.1;
    ctx.strokeStyle='rgba(255,90,60,'+pul.toFixed(2)+')'; ctx.lineWidth=2.5;
    ctx.strokeRect(3,HUD+3,RW-6,RH-6);
  }
}
function drawWarp(w){
  const a=Math.min(1,w.t/26);
  const x=w.x, y=w.y+HUD;
  ctx.strokeStyle='rgba(255,120,80,'+(0.9-a*0.5).toFixed(2)+')'; ctx.lineWidth=2;
  const r=3+a*16;
  ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.stroke();
  ctx.strokeStyle='rgba(255,220,180,.6)';
  ctx.beginPath(); ctx.moveTo(x,y-r-4); ctx.lineTo(x,y+r+4); ctx.moveTo(x-r-4,y); ctx.lineTo(x+r+4,y); ctx.stroke();
}
function drawHuman(h){
  if(!h.alive) return;
  const x=h.x, y=h.y+HUD;
  const step=Math.sin(frame*0.25+h.id*2);
  const small=h.kind==='mikey', sc=small?0.75:1;
  if(h.panic>0){
    const p=0.22+Math.sin(frame*0.3)*0.12;
    ctx.fillStyle='rgba(255,90,60,'+p.toFixed(2)+')';
    ctx.beginPath(); ctx.arc(x,y-2,14,0,7); ctx.fill();
  }
  ctx.strokeStyle=h.body; ctx.lineWidth=small?2:2.6; ctx.lineCap='round';
  ctx.beginPath();                                  // legs, alternating
  ctx.moveTo(x,y+4*sc); ctx.lineTo(x-4*sc,y+11*sc+step*1.5);
  ctx.moveTo(x,y+4*sc); ctx.lineTo(x+4*sc,y+11*sc-step*1.5);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x,y-6*sc); ctx.lineTo(x,y+4*sc); ctx.stroke();   // torso
  if(h.kind==='mommy'){
    ctx.fillStyle=h.body;
    ctx.beginPath(); ctx.moveTo(x,y-2); ctx.lineTo(x-5,y+5); ctx.lineTo(x+5,y+5); ctx.closePath(); ctx.fill();
  }
  const wave2=h.panic>0? Math.sin(frame*0.5)*4 : step*1.2;
  ctx.beginPath();                                  // arms — swing, or flail
  ctx.moveTo(x,y-3*sc); ctx.lineTo(x-6*sc,y-9*sc-wave2);
  ctx.moveTo(x,y-3*sc); ctx.lineTo(x+6*sc,y-9*sc+wave2);
  ctx.stroke();
  ctx.fillStyle='#ffdcb8';                          // head + hair
  ctx.beginPath(); ctx.arc(x,y-10*sc,4*sc,0,7); ctx.fill();
  ctx.fillStyle=h.hair;
  ctx.beginPath(); ctx.arc(x,y-11.4*sc,3.6*sc,Math.PI,0); ctx.fill();
  if(Math.hypot(px-h.x,py-h.y)<50) drawLabel('reach them!', x, y-24, '#7fdb7f');
}
function drawRobot(r){
  const x=r.x, y=r.y+HUD, R=r.def.r;
  if(r.type==='grunt'){
    /* the classic: blocky red biped, visor strip, jerky walk */
    const ph=Math.sin(frame*0.3+r.id);
    ctx.fillStyle=r.def.edge;                       // legs
    ctx.fillRect(x-6,y+3+ph*1.5,4,8-ph*1.5); ctx.fillRect(x+2,y+3-ph*1.5,4,8+ph*1.5);
    const g=ctx.createLinearGradient(0,y-10,0,y+6);
    g.addColorStop(0,'#d84a3a'); g.addColorStop(1,'#8a2418');
    ctx.fillStyle=g; rr(ctx,x-8,y-6,16,11,2); ctx.fill();          // torso
    ctx.fillStyle=r.def.edge; ctx.fillRect(x-10,y-5,3,7); ctx.fillRect(x+7,y-5,3,7);  // shoulders
    ctx.fillStyle='#a83226'; rr(ctx,x-6,y-14,12,9,2); ctx.fill();  // head
    ctx.fillStyle=r.def.eye;                                        // visor
    ctx.fillRect(x-4.5,y-11.5,9,2.6);
    ctx.strokeStyle=r.def.edge; ctx.lineWidth=1.2;                  // antenna
    ctx.beginPath(); ctx.moveTo(x,y-14); ctx.lineTo(x,y-18); ctx.stroke();
    ctx.fillStyle='#ffdc60'; ctx.beginPath(); ctx.arc(x,y-19,1.5,0,7); ctx.fill();
  } else if(r.type==='hulk'){
    const sway=Math.sin((r.tread||0)*4)*1.5;
    ctx.fillStyle='#243420'; rr(ctx,x-12,y+6,24,7,2); ctx.fill();   // tread base
    ctx.fillStyle='rgba(255,255,255,.12)';
    for(let i=0;i<4;i++) ctx.fillRect(x-10+i*6+((r.tread*8)|0)%6, y+8, 2, 3);
    const g=ctx.createLinearGradient(0,y-14,0,y+8);
    g.addColorStop(0,'#6a9a58'); g.addColorStop(1,'#3a5a30');
    ctx.fillStyle=g; rr(ctx,x-13,y-12+sway*0.3,26,20,3); ctx.fill(); // slab body
    ctx.strokeStyle=r.def.edge; ctx.lineWidth=2; rr(ctx,x-13,y-12+sway*0.3,26,20,3); ctx.stroke();
    ctx.fillStyle='#4a6a3c';                                         // arm slabs
    rr(ctx,x-18+sway,y-8,6,14,2); ctx.fill(); rr(ctx,x+12-sway,y-8,6,14,2); ctx.fill();
    ctx.fillStyle='#7ab868'; rr(ctx,x-5,y-17+sway*0.3,10,7,2); ctx.fill();  // small head
    ctx.fillStyle=r.def.eye; ctx.fillRect(x-3,y-15+sway*0.3,2,2); ctx.fillRect(x+1,y-15+sway*0.3,2,2);
  } else {
    /* hunter — gliding diamond with afterimages */
    if(r.trail) for(let i=r.trail.length-1;i>=1;i--){
      const tpos=r.trail[i], a=0.10*(r.trail.length-i)/r.trail.length+0.03;
      ctx.fillStyle='rgba(224,112,255,'+a.toFixed(2)+')';
      ctx.save(); ctx.translate(tpos.x,tpos.y+HUD); ctx.rotate(frame*0.1+i);
      ctx.fillRect(-R*0.7,-R*0.7,R*1.4,R*1.4); ctx.restore();
    }
    ctx.save(); ctx.translate(x,y); ctx.rotate(frame*0.1);
    const g=ctx.createLinearGradient(-R,-R,R,R);
    g.addColorStop(0,'#9a5ac0'); g.addColorStop(1,'#5a2a7a');
    ctx.fillStyle=g; ctx.fillRect(-R*0.85,-R*0.85,R*1.7,R*1.7);
    ctx.strokeStyle=r.def.edge; ctx.lineWidth=1.6; ctx.strokeRect(-R*0.85,-R*0.85,R*1.7,R*1.7);
    ctx.restore();
    const p=0.7+Math.sin(frame*0.35)*0.3;
    ctx.fillStyle=r.def.eye; ctx.globalAlpha=p;
    ctx.beginPath(); ctx.arc(x,y,2.8,0,7); ctx.fill(); ctx.globalAlpha=1;
  }
}
function drawShot(sh){
  const y=sh.y+HUD;
  const gl=ctx.createRadialGradient(sh.x,y,0.5,sh.x,y,7);
  gl.addColorStop(0,'rgba(191,239,252,.8)'); gl.addColorStop(1,'rgba(140,200,255,0)');
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(sh.x,y,7,0,7); ctx.fill();
  ctx.strokeStyle='#dff6ff'; ctx.lineWidth=2.4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(sh.x-sh.dx*0.9, y-sh.dy*0.9); ctx.lineTo(sh.x,y); ctx.stroke();
}
function drawBar(){
  const hg=ctx.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#241616'); hg.addColorStop(1,'#140c0c');
  ctx.fillStyle=hg; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle='rgba(255,90,60,.3)'; ctx.fillRect(0,HUD-2,RW,2);
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#ffb199';
  ctx.fillText('MR. ROBOT', RW/2, 20);
  ctx.font='10px '+FONT; ctx.fillStyle='#8a957e';
  ctx.fillText('ARROWS move · you fire where you walk · green HULKS only shove · E leave', RW/2, 36);
  ctx.textAlign='left'; ctx.font='bold 12px '+FONT; ctx.fillStyle='#bfeffc';
  ctx.fillText('SCORE '+score+(chain>1?'  x'+chain:''), 10, 20);
  ctx.font='10px '+FONT; ctx.fillStyle='#98a58c';
  ctx.fillText('WAVE '+wave+'  ·  SAVED '+rescued, 10, 36);
  ctx.textAlign='right';
  for(let i=0;i<LIVES0;i++){ ctx.fillStyle= i<lives? '#ff5a5a':'#3a2c30'; ctx.beginPath(); ctx.arc(RW-14-i*15,16,5,0,7); ctx.fill(); }
  ctx.fillStyle='#8a957e'; ctx.font='10px '+FONT;
  ctx.fillText('ROBOTS '+robots.length, RW-10, 36);
}
function draw(){
  ctx.fillStyle='#0a0c14'; ctx.fillRect(0,HUD,RW,RH);
  drawFloor();
  for(const w of warps) drawWarp(w);
  for(const h of humans) drawHuman(h);
  for(const r of robots) drawRobot(r);
  for(const sh of shots) drawShot(sh);
  drawPlayerSprite();

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
  if(waveBanner>0){
    ctx.globalAlpha=Math.min(1,waveBanner/20);
    ctx.font='bold 30px '+FONT; ctx.textAlign='center';
    ctx.fillStyle='#ffb199'; ctx.fillText('WAVE '+wave, RW/2, HUD+RH/2-40);
    ctx.globalAlpha=1;
  }
  if(ended){
    ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(0,0,RW,RH+HUD);
    ctx.textAlign='center'; ctx.font='bold 26px '+FONT; ctx.fillStyle='#ff8a8a';
    ctx.fillText('THE ROBOTS PREVAIL', RW/2, HUD+RH/2-16);
    ctx.font='13px '+FONT; ctx.fillStyle='#d8d2c4';
    ctx.fillText('WAVE '+wave+' · SCORE '+score+' · SAVED '+rescued+' · SPACE to leave', RW/2, HUD+RH/2+12);
  }
  drawBar();
}

/* ---------------- API ---------------- */
window.RobotronLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    lives=LIVES0; score=0; rescued=0; ended=''; rid=0;
    lastDir={x:0,y:-1}; shotT=0; spaceLatch=true; eLatch=true;
    PL.swing=0; PL.kb.x=0; PL.kb.y=0;
    startWave(1);
    PL.x=px; PL.y=py;
    toast('MR. ROBOT. Every wave arrives at once. Grunts want YOU; green hulks want the family and cannot die — only be shoved.');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; } else loadScreen(12);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw,
  _t:{get robots(){return robots;}, get humans(){return humans;}, get warps(){return warps;},
      get wave(){return wave;}, get lives(){return lives;}, get score(){return score;},
      get chain(){return chain;}, get ended(){return ended;}, get pos(){return {px,py};},
      set pos(v){ px=v.px; py=v.py; },
      startWave, waveCounts, killable, killPlayer, update, ROBOT_DEF, LIVES0}
};

})();
