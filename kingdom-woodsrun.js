"use strict";
/* ============================================================
   GRISHNAK — THE WOODS RUN  (Scott, 2026-08-13; softened 2026-08-15)
   A side-view woodland path between two overworld screens —
   Bruce-Lee rules: run, jump, DUCK under low branches, KICK the
   wolves off you, hop the logs over the bog.
   World 1600px, camera-follow. SOUTH DOOR on the left (to the
   Lakeside), EAST DOOR on the right (to the North Woods).
     1. south shore + first wolf          x   40..300
     2. bog #1 — stumps and logs          x  300..640
     3. the low branches + second wolf    x  640..900
     4. bog #2 — bobbing logs, the swing  x  900..1240
        (+ the chest ledge, once)
     5. east shore — a wolf and an owl    x 1240..1560

   IT IS A CORRIDOR, NOT A TOLL GATE (Scott 2026-08-15: "it feels
   demandingly tricky, not cosy enough - cant figure it out - and
   since it's part of the main matrix of screens it should be
   exitable to the right"). Three rules follow from that, and they
   are the whole character of the room:
     BOTH DOORS ARE EXITS. Walk out either end and you arrive on
       that side. You are never required to beat the room to leave
       it, and you are never sent back where you did not want to go.
     A SPLASH COSTS A MOMENT, NOT A SECTION. Falling puts you on
       the nearest static footing BEHIND you — the log you just left
       — instead of all the way back to the bank.
     NOTHING IN THE WOODS IS FASTER THAN YOU. Every wolf lunge is
       capped below the player's run, so a wolf is a nuisance to be
       stepped around, never a chase you can lose.
   Every bog has a line of STATIC footings across it, so there is
   always a way over without waiting on anything. The moving logs
   are the quick road, not the only road.
   No HP, no lives, no deaths. The clock is kept (flags.woodsBest)
   for anyone who wants to race it, and ignored by everyone else.
   ============================================================ */
(function(){

const WW=1600;
const GRAV=0.5, JUMP=-8.2, MOVE=2.7, CROUCH_MOVE=1.5, MAXFALL=9;
/* a jump buys 33 frames of air and ~89px of ground, so every STATIC gap in
   this room is kept at 62px or less: comfortably clearable without timing a
   moving platform, which is what "cosy" has to mean in a room with bogs. */
const LUNGE_MULT=1.9;                        // capped so no wolf outruns MOVE
const FLOOR_Y=344, BOG_Y=352;
const DOOR_S=52, DOOR_E=1548;                 // door thresholds
const BOG1=[300,640], BOG2=[900,1240];

let side='east';                              // which door we came IN by
let goingRight=true;                          // travel direction of THIS run
let result='back';                            // 'crossed' | 'back' — read by exitDone
let pl={x:0,y:FLOOR_Y,vx:0,vy:0,onGround:true,face:1,iframes:0,duck:false,stun:0,kick:0};
let camX=0, introT=0, eLatch=true, spaceWas=false, kickWas=false;
let runT=0, running=false, doneT=0, newBest=false, crossed=false;
let wolves=[], stumps=[], movers=[], branches=[], fireflies=[];
let swing=null, owl=null, chestGot=false, splashT=0;
let foots=[];                                 // every static footing, left to right

function buildWorld(){
  wolves=[
    /* pace their span; LUNGE when you share their ground. A kick sends
       them yelping back — they do not die; these are the woods' wolves.
       Speeds are chosen so spd*LUNGE_MULT stays under MOVE: a wolf can
       harry you, and can never run you down. */
    {x0:140,  x1:296,  x:220,  dir: 1, spd:0.80, stun:0, lunge:0},
    {x0:646,  x1:894,  x:820,  dir:-1, spd:0.95, stun:0, lunge:0},
    {x0:1262, x1:1520, x:1300, dir: 1, spd:1.05, stun:0, lunge:0}
  ];
  /* STATIC footings. The two original stumps plus three logs added 2026-08-15
     so that each bog has a walkable line across it — largest gap 62px against
     an 89px jump. Bog #1 used to be stump, WAIT FOR THE SLIDER, stump, which
     is a Frogger puzzle sitting in the middle of a corridor. */
  stumps=[ {x:318,y:330,w:42}, {x:422,y:330,w:52}, {x:526,y:330,w:44},
           {x:588,y:330,w:44},
           {x:1010,y:312,w:56} ];
  movers=[
    /* the manoeuvring Scott asked for: platforms that MOVE.
       slider ping-pongs across bog #1; bobbers breathe over bog #2 */
    /* the slider rides a course ABOVE the new logs now — a quick road across
       bog #1 for anyone who wants it, rather than the only one */
    {kind:'slide', x:392, y:286, w:78, x0:372, x1:556, dir:1, spd:0.9, dx:0},
    /* the bobbers breathe much more gently than they did: at ±26-30px you had
       to land on a target that had moved half a body height since you jumped */
    {kind:'bob',  x:938,  y:306, w:62, base:306, amp:13, ph:0.0, dy:0},
    {kind:'bob',  x:1084, y:300, w:62, base:300, amp:15, ph:2.1, dy:0},
    {kind:'bob',  x:1180, y:308, w:58, base:308, amp:11, ph:4.2, dy:0},
    {kind:'bob',  x:952,  y:232, w:56, base:232, amp:8,  ph:1.0, dy:0}   // chest ledge
  ];
  branches=[
    /* low boughs across the mid bank: DUCK or bonk */
    {x0:700, x1:762, y:FLOOR_Y-24},
    {x0:806, x1:856, y:FLOOR_Y-24}
  ];
  swing={ anchorX:1120, anchorY:56, len:158, amp:0.80, ph:0.6 };  // the pendulum log
  owl={ x:1400, y:88, state:'perch', t:0, dx:0, dy:0, cool:0 };
  fireflies=[];
  for(let i=0;i<34;i++) fireflies.push({x:hash2(i,5)*WW, y:80+hash2(i,11)*240, ph:hash2(i,23)*7});
  /* the bank edges and every static log, so a splash always has somewhere
     sensible and CLOSE to put you back down */
  foots=[{x:BOG1[0]-26,y:FLOOR_Y}, {x:BOG1[1]+26,y:FLOOR_Y},
         {x:BOG2[0]-26,y:FLOOR_Y}, {x:BOG2[1]+26,y:FLOOR_Y}];
  for(const s of stumps) foots.push({x:s.x+s.w/2, y:s.y});
  foots.sort((a,b)=>a.x-b.x);
}

function spawnAtDoor(){
  pl.x= goingRight? DOOR_S+14 : DOOR_E-14;
  pl.y=FLOOR_Y; pl.vx=0; pl.vy=0; pl.onGround=true; pl.duck=false;
  pl.face= goingRight?1:-1; pl.stun=0; pl.iframes=60;
}
/* A splash puts you back on the nearest STATIC footing behind you — the log
   you just left, not the bank you left five jumps ago. Losing a whole section
   to one mistimed hop is the single thing that made this room feel punishing
   rather than gentle, and it is a corridor between two overworld screens: the
   cost of a miss should be a moment, never the crossing. */
function backToFooting(){
  const behind = foots.filter(f => goingRight? f.x < pl.x-8 : f.x > pl.x+8);
  const f = behind.length
    ? behind.reduce((best,c)=> Math.abs(c.x-pl.x)<Math.abs(best.x-pl.x)? c : best)
    : foots[goingRight? 0 : foots.length-1];
  pl.x=f.x; pl.y=f.y; pl.vx=0; pl.vy=0; pl.onGround=true; pl.duck=false;
  pl.stun=0; pl.iframes=70; splashT=16;
}

function groundAt(x){
  if(x<BOG1[0]) return FLOOR_Y;
  if(x>=BOG1[1] && x<BOG2[0]) return FLOOR_Y;
  if(x>=BOG2[1]) return FLOOR_Y;
  return null;                                 // over a bog
}
function inBog1(x){ return x>=BOG1[0] && x<BOG1[1]; }

function swingTip(){
  const w=Math.sqrt(GRAV/swing.len);
  const ang=swing.amp*Math.sin(frame*w+swing.ph);
  return {x:swing.anchorX+Math.sin(ang)*swing.len,
          y:swing.anchorY+Math.cos(ang)*swing.len, ang};
}

/* ---------------- wolves ---------------- */
function stepWolf(wf){
  if(wf.stun>0){ wf.stun--; return; }
  const near = pl.onGround && groundAt(pl.x)!==null &&
               pl.x>wf.x0-10 && pl.x<wf.x1+10 && Math.abs(pl.x-wf.x)<95 && pl.stun<=0;
  if(near && wf.lunge<=0) wf.lunge=34;         // wind up and GO
  if(wf.lunge>0){
    wf.lunge--;
    const d=Math.sign(pl.x-wf.x)||wf.dir;
    wf.dir=d; wf.x+=d*wf.spd*LUNGE_MULT;
  } else {
    wf.x+=wf.dir*wf.spd*0.55;
  }
  if(wf.x<wf.x0){ wf.x=wf.x0; wf.dir=1; }
  if(wf.x>wf.x1){ wf.x=wf.x1; wf.dir=-1; }
}
function wolfHit(wf){
  return pl.iframes<=0 && Math.abs(pl.x-wf.x)<17 &&
         pl.y>FLOOR_Y-26 && wf.stun<=0;
}

/* ---------------- the owl ---------------- */
function stepOwl(){
  if(owl.cool>0) owl.cool--;
  if(owl.state==='perch'){
    if(owl.cool<=0 && pl.x>1280 && pl.x<1520 && pl.onGround){
      owl.state='tele'; owl.t=32; sfx.crow ? sfx.crow() : (sfx.denied&&sfx.denied());
    }
  } else if(owl.state==='tele'){
    if(--owl.t<=0){
      owl.state='dive'; owl.t=0;
      owl.tx=pl.x; owl.sy=owl.y; owl.sx=owl.x;
    }
  } else if(owl.state==='dive'){
    owl.t++;
    const T2=46, k=Math.min(1,owl.t/T2);
    owl.x=owl.sx+(owl.tx-owl.sx)*k;
    /* dive bottom clears a DUCKED head with real margin — ducking must
       always work; standing (head 9px higher) must always get clipped */
    owl.y=owl.sy+Math.sin(k*Math.PI)*(FLOOR_Y-22-owl.sy);
    if(k>=1){ owl.state='rise'; owl.t=0; }
  } else if(owl.state==='rise'){
    owl.t++;
    owl.y=Math.max(88, owl.y-2.6);
    owl.x+=(1400-owl.x)*0.02;
    if(owl.y<=88 && Math.abs(owl.x-1400)<8){ owl.state='perch'; owl.cool=240; }
  }
}
function owlHit(){
  if(pl.iframes>0 || owl.state!=='dive') return false;
  const top= pl.duck? pl.y-13 : pl.y-26;       // DUCK is the whole trick
  return Math.abs(pl.x-owl.x)<15 && owl.y>top-6 && owl.y<pl.y+2;
}

/* ---------------- update ---------------- */
function hurtBy(fromX,msg){
  const d=Math.sign(pl.x-fromX)||-pl.face;
  /* softened 2026-08-15: it was a 4.2px shove with 26 frames of no control,
     which reads as being bullied. Smaller push, half the stun, MORE mercy
     afterwards — you get the controls back quickly and keep them a while. */
  pl.vx=d*2.8; pl.vy=-2.6; pl.onGround=false;
  pl.stun=13; pl.iframes=85; sfx.hurt && sfx.hurt();
  puff(pl.x,pl.y-12,'#cfd8d2',10);
  if(msg) toast(msg);
}
function update(){
  if(introT>0) introT--;
  if(pl.iframes>0) pl.iframes--;
  if(splashT>0) splashT--;
  if(doneT>0){
    if(--doneT<=0) startWoodsRunTrans('out');
    return;
  }
  for(const wf of wolves) stepWolf(wf);
  for(const m of movers){
    if(m.kind==='slide'){
      const ox=m.x; m.x+=m.dir*m.spd;
      if(m.x<m.x0){ m.x=m.x0; m.dir=1; } if(m.x>m.x1){ m.x=m.x1; m.dir=-1; }
      m.dx=m.x-ox;
    } else {
      const oy=m.y; m.y=m.base+Math.sin(frame*0.026+m.ph)*m.amp; m.dy=m.y-oy;
    }
  }
  stepOwl();
  if(running) runT++;

  // E backs out — no toll paid, no crossing made
  const ek=held['e']||held['E'];
  if(ek && !eLatch){ eLatch=true; result='back'; startWoodsRunTrans('out'); return; }
  if(!ek) eLatch=false;

  const sp=held[' ']||held.ArrowUp, spEdge=sp&&!spaceWas; spaceWas=sp;
  const kk=held['x']||held['X']||held['z']||held['Z'], kEdge=kk&&!kickWas; kickWas=kk;
  if(pl.kick>0) pl.kick--;

  const stunned=pl.stun>0;
  if(stunned) pl.stun--;

  pl.duck = !stunned && pl.onGround && !!held.ArrowDown;

  // THE KICK — Bruce Lee's contribution: short, sharp, settles arguments
  if(kEdge && !stunned && pl.kick<=0 && !pl.duck){
    pl.kick=14; sfx.swing ? sfx.swing() : (sfx.jump&&sfx.jump());
    for(const wf of wolves){
      const dx=wf.x-pl.x;
      if(Math.sign(dx)===pl.face && Math.abs(dx)<34 && Math.abs(pl.y-FLOOR_Y)<30){
        wf.stun=110; wf.lunge=0; wf.x+=pl.face*46;
        wf.x=Math.max(wf.x0,Math.min(wf.x1,wf.x));
        puff(wf.x,FLOOR_Y-12,'#b0a890',8);
        addFloat(wf.x,FLOOR_Y-30,'YELP!','#ffb35a');
      }
    }
  }

  // movement
  if(pl.onGround){
    if(stunned) pl.vx*=0.8;
    else if(held.ArrowLeft){ pl.vx= pl.duck? -CROUCH_MOVE : -MOVE; pl.face=-1; }
    else if(held.ArrowRight){ pl.vx= pl.duck? CROUCH_MOVE : MOVE; pl.face=1; }
    else pl.vx*=0.6;
  } else {
    if(!stunned){
      if(held.ArrowLeft){ pl.vx-=0.14; pl.face=-1; }
      else if(held.ArrowRight){ pl.vx+=0.14; pl.face=1; }
    }
    pl.vx*=0.995; pl.vx=Math.max(-9,Math.min(9,pl.vx));
  }
  if(spEdge && pl.onGround && !stunned && !pl.duck){ pl.vy=JUMP; pl.onGround=false; sfx.jump && sfx.jump(); }

  pl.vy=Math.min(MAXFALL, pl.vy+GRAV);
  const oldY=pl.y;
  pl.x+=pl.vx; pl.y+=pl.vy;
  const wasGround=pl.onGround;
  pl.onGround=false;

  const g=groundAt(pl.x);
  if(g!==null && pl.vy>=0 && pl.y>=g && oldY<=g+10){ pl.y=g; pl.vy=0; pl.onGround=true; }
  for(const s of stumps){
    if(pl.vy>=0 && pl.x>s.x-6 && pl.x<s.x+s.w+6 && oldY<=s.y+2 && pl.y>=s.y){
      pl.y=s.y; pl.vy=0; pl.onGround=true;
    }
  }
  for(const m of movers){
    if(pl.vy>=0 && pl.x>m.x-6 && pl.x<m.x+m.w+6 && oldY<=m.y+2 && pl.y>=m.y){
      pl.y=m.y; pl.vy=0; pl.onGround=true;
      pl.x+=m.dx||0;                             // the log carries you
      if(m.dy) pl.y=m.y;
    }
  }

  /* low branches: stand into one and it stands you down.
     Cameron, beta 2026-08-15: "A combination of jumping then ducking in Woods
     Run causes the character to rapidly vibrate." Two things made that a loop.
     This was the only hazard in the room with NO iframe guard — the wolves and
     the owl both have one — so it could fire again the instant you landed; and
     hurtBy() sets pl.stun while pl.duck requires !stunned, so once it started
     you could not duck your way out of it. Bonk, launch, land in the same span,
     bonk, for as long as you stayed there.
     It also assumed the head was always at FLOOR_Y-26. It reads the player's
     ACTUAL head now, which is the same number on the flat ground the boughs
     hang over today and stays honest if a stump or a log ever moves there. */
  if(pl.onGround && !pl.duck && pl.iframes<=0){
    const head=pl.y-26;
    for(const br of branches){
      if(pl.x>br.x0-4 && pl.x<br.x1+4 && head<br.y+8){
        hurtBy(pl.x+pl.face*10,'BONK. The bough suggests ducking.');
        pl.vx=-pl.face*3.6;
        break;
      }
    }
  }

  // the swinging log — time it or wear it
  { const tip=swingTip();
    if(pl.iframes<=0 && Math.hypot(pl.x-tip.x, (pl.y-12)-tip.y)<20){
      /* it knocks you off; where you land is the bog's business, not its own.
         Resetting the section from up in the air was two punishments for one
         mistake. */
      puff(pl.x,pl.y-10,'#9a8f7a',10);
      hurtBy(tip.x, 'The swinging log wins the exchange.');
    }
  }

  // wolves + owl
  for(const wf of wolves){
    if(wolfHit(wf)){ hurtBy(wf.x,'Teeth! Kick (X) or jump — the wolves work this path.'); break; }
  }
  if(owlHit()){ hurtBy(owl.x,'The owl collects its toll. DUCK next time.'); }

  // bogs swallow the unwary
  if(g===null && pl.y>BOG_Y-6){
    puff(pl.x,BOG_Y,'#5c7c8a',12); sfx.hurt && sfx.hurt();
    toast('The bog accepts your donation and puts you back on the last log.');
    backToFooting();
    camFollow(); return;
  }
  pl.x=Math.max(14,Math.min(WW-14,pl.x));
  if(pl.y>RH+60){ spawnAtDoor(); camFollow(); return; }

  // the chest ledge — once, forever
  if(!chestGot){
    const cl=movers[4];
    if(Math.abs(pl.x-(cl.x+cl.w/2))<24 && Math.abs(pl.y-cl.y)<8){
      chestGot=true; flags.woodsRunChest=true;
      res.gold=Math.min(999,res.gold+12);
      addFloat(cl.x+cl.w/2,cl.y-16,'THE WOODS CHEST  +12 gold','#ffe066');
      puff(cl.x+cl.w/2,cl.y-8,'#ffe066',12);
      sfx.chest && sfx.chest(); saveGame();
    }
  }

  /* THE DOORS — BOTH of them are exits (Scott 2026-08-15). The run sits in
     the main matrix of screens, so it has to behave like a corridor: walk out
     of either end and you arrive on that side. Nobody is ever made to beat the
     room in order to leave it, and turning round is a legitimate answer.
     The clock still only counts a real CROSSING — out of the door you did not
     come in by — so the best time stays worth something. */
  const leftBy = pl.x>=DOOR_E? 'east' : pl.x<=DOOR_S? 'south' : null;
  if(leftBy && doneT<=0){
    result=leftBy; running=false;
    crossed = leftBy!==side;
    if(crossed){
      newBest = !flags.woodsBest || runT<flags.woodsBest;
      if(newBest){ flags.woodsBest=runT; saveGame(); }
    }
    doneT=80; sfx.win && sfx.win();
  }
  camFollow();
}
function camFollow(){ camX=Math.max(0,Math.min(WW-RW,pl.x-RW/2)); }

/* ---------------- draw ---------------- */
const secs=f=>(f/60).toFixed(1);
function draw(){
  const X=x=>x-camX;
  // cold moonlit forest — deep blue night, nothing biolumes up here
  const bg=ctx.createLinearGradient(0,HUD,0,RH+HUD);
  bg.addColorStop(0,'#0a1020'); bg.addColorStop(0.6,'#101a2c'); bg.addColorStop(1,'#0c1622');
  ctx.fillStyle=bg; ctx.fillRect(0,HUD,RW,RH);
  // moon shafts through the canopy
  for(let i=0;i<5;i++){
    const sx=X(i*340+120)*0.9; if(sx<-120||sx>RW+40) continue;
    ctx.fillStyle='rgba(170,190,230,.05)';
    ctx.beginPath(); ctx.moveTo(sx,HUD); ctx.lineTo(sx+46,HUD);
    ctx.lineTo(sx+110,RH+HUD); ctx.lineTo(sx+30,RH+HUD); ctx.closePath(); ctx.fill();
  }
  // parallax trunks, two layers
  for(const L of [{sp:150,para:0.82,w:14,col:'#141a2a'},{sp:210,para:1,w:20,col:'#0d1322'}]){
    const off=camX*L.para;
    ctx.fillStyle=L.col;
    for(let i=Math.floor(off/L.sp)-1;i<(off+RW)/L.sp+1;i++){
      const tx=i*L.sp-off+hash2(i,L.sp)*40;
      ctx.fillRect(tx,HUD,L.w+hash2(i,7)*8,RH);
      ctx.beginPath(); ctx.ellipse(tx+L.w/2,HUD+18,L.w*2.2,14,0,0,7); ctx.fill();
    }
  }
  // canopy
  ctx.fillStyle='#0a0f1d'; ctx.fillRect(0,HUD,RW,26);
  for(let i=Math.floor(camX/34)-1;i<(camX+RW)/34+1;i++){
    const sx=i*34-camX;
    ctx.beginPath(); ctx.arc(sx,HUD+24,10+hash2(i,3)*10,0,7); ctx.fill();
  }
  // fireflies
  for(const f of fireflies){
    const fx=X(f.x); if(fx<-8||fx>RW+8) continue;
    const tw=0.25+0.3*Math.abs(Math.sin(frame*0.02+f.ph));
    ctx.fillStyle='rgba(255,230,140,'+tw.toFixed(2)+')';
    ctx.beginPath(); ctx.arc(fx+Math.sin(frame*0.008+f.ph)*8, f.y+HUD+Math.sin(frame*0.011+f.ph)*5, 1.6, 0, 7); ctx.fill();
  }
  // ground banks
  const bank=(x0,x1)=>{
    const a=Math.max(0,X(x0)), b=Math.min(RW,X(x1)); if(b<=a) return;
    ctx.fillStyle='#1c2416'; ctx.fillRect(a,FLOOR_Y+HUD,b-a,RH+HUD-FLOOR_Y);
    ctx.fillStyle='#2c3a20'; ctx.fillRect(a,FLOOR_Y+HUD,b-a,5);
  };
  bank(0,BOG1[0]); bank(BOG1[1],BOG2[0]); bank(BOG2[1],WW);
  // bogs — black water, pale mist
  const bog=(x0,x1)=>{
    const a=Math.max(0,X(x0)), b=Math.min(RW,X(x1)); if(b<=a) return;
    ctx.fillStyle='#0a1418'; ctx.fillRect(a,BOG_Y+HUD,b-a,RH+HUD-BOG_Y);
    ctx.strokeStyle='rgba(140,170,190,.25)'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(a,BOG_Y+HUD+1); ctx.lineTo(b,BOG_Y+HUD+1); ctx.stroke();
    for(let i=0;i<10;i++){
      const mx=x0+((i*97)%(x1-x0)), sx=X(mx); if(sx<a||sx>b) continue;
      const mw=26+hash2(i,x0)*22, my=BOG_Y+HUD-4-hash2(i,13)*8;
      ctx.fillStyle='rgba(150,170,200,'+(0.05+0.05*Math.sin(frame*0.02+i)).toFixed(3)+')';
      ctx.beginPath(); ctx.ellipse(sx,my,mw,7,0,0,7); ctx.fill();
    }
  };
  bog(BOG1[0],BOG1[1]); bog(BOG2[0],BOG2[1]);
  // stumps
  for(const s of stumps){
    const sx=X(s.x); if(sx<-60||sx>RW+20) continue;
    ctx.fillStyle='#3a2c1c'; ctx.fillRect(sx,s.y+HUD,s.w,BOG_Y-s.y+8);
    ctx.fillStyle='#5a4630'; ctx.fillRect(sx,s.y+HUD,s.w,4);
    ctx.strokeStyle='#241a10'; ctx.lineWidth=1.4; ctx.strokeRect(sx+0.5,s.y+HUD+0.5,s.w-1,BOG_Y-s.y+7);
  }
  // moving logs
  for(const m of movers){
    const mx=X(m.x); if(mx<-90||mx>RW+20) continue;
    const chestLedge= m===movers[4];
    ctx.fillStyle= chestLedge? '#4a3a22' : '#4a3826';
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(mx,m.y+HUD,m.w,12,5):ctx.rect(mx,m.y+HUD,m.w,12); ctx.fill();
    ctx.strokeStyle='#241a10'; ctx.lineWidth=1.6; ctx.stroke();
    ctx.strokeStyle='rgba(200,190,160,.35)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(mx+5,m.y+HUD+4); ctx.lineTo(mx+m.w-5,m.y+HUD+4); ctx.stroke();
    if(m.kind==='bob' && !chestLedge){                      // ripples under the bobbers
      ctx.strokeStyle='rgba(140,170,190,.2)';
      ctx.beginPath(); ctx.ellipse(mx+m.w/2,BOG_Y+HUD+2,m.w*0.7,4,0,0,7); ctx.stroke();
    }
  }
  // chest on its ledge
  if(!chestGot){
    const cl=movers[4], cx2=X(cl.x+cl.w/2);
    if(cx2>-40&&cx2<RW+40){
      const pul=0.4+0.25*Math.sin(frame*0.06);
      const g2=ctx.createRadialGradient(cx2,cl.y+HUD-8,2,cx2,cl.y+HUD-8,26);
      g2.addColorStop(0,'rgba(255,224,102,'+pul.toFixed(2)+')'); g2.addColorStop(1,'rgba(255,224,102,0)');
      ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(cx2,cl.y+HUD-8,26,0,7); ctx.fill();
      ctx.fillStyle='#7a5a26'; ctx.fillRect(cx2-9,cl.y+HUD-12,18,12);
      ctx.fillStyle='#c9a53f'; ctx.fillRect(cx2-9,cl.y+HUD-12,18,4);
      ctx.fillStyle='#ffe066'; ctx.fillRect(cx2-2,cl.y+HUD-9,4,6);
    }
  }
  // low branches
  for(const br of branches){
    const a=X(br.x0), b=X(br.x1); if(b<-40||a>RW+40) continue;
    ctx.strokeStyle='#2e2416'; ctx.lineWidth=9; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(a-14,br.y+HUD-6);
    ctx.quadraticCurveTo((a+b)/2,br.y+HUD+4,b+14,br.y+HUD-4); ctx.stroke();
    ctx.lineCap='butt';
    ctx.fillStyle='#1d2c18';
    for(let i=0;i<4;i++){
      const lx=a+(b-a)*(i/3);
      ctx.beginPath(); ctx.ellipse(lx,br.y+HUD-8,8,5,0.4,0,7); ctx.fill();
    }
  }
  // the swinging log
  { const tip=swingTip(), ax=X(swing.anchorX), tx=X(tip.x);
    if(!(tx<-60&&ax<-60)&&!(tx>RW+60&&ax>RW+60)){
      ctx.strokeStyle='#57503e'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(ax,swing.anchorY+HUD); ctx.lineTo(tx,tip.y+HUD); ctx.stroke();
      ctx.save(); ctx.translate(tx,tip.y+HUD); ctx.rotate(tip.ang);
      ctx.fillStyle='#4a3826';
      ctx.beginPath(); ctx.roundRect? ctx.roundRect(-9,-16,18,34,7):ctx.rect(-9,-16,18,34); ctx.fill();
      ctx.strokeStyle='#241a10'; ctx.lineWidth=1.8; ctx.stroke();
      ctx.restore();
    }
  }
  // wolves
  for(const wf of wolves){
    const wx=X(wf.x); if(wx<-50||wx>RW+50) continue;
    const y=FLOOR_Y+HUD, lung=wf.lunge>0;
    ctx.save(); ctx.translate(wx,y); ctx.scale(wf.dir,1);
    if(wf.stun>0 && (frame>>2)%2) ctx.globalAlpha=0.55;
    ctx.fillStyle= wf.spd>1.2? '#6a6f7c' : '#80868f';       // the east wolf runs darker
    ctx.beginPath(); ctx.ellipse(0,-8,16,7.5,0,0,7); ctx.fill();          // body
    ctx.beginPath(); ctx.ellipse(11,-13,7,5,lung?-0.25:0,0,7); ctx.fill();// head
    ctx.beginPath(); ctx.moveTo(8,-17); ctx.lineTo(10,-22); ctx.lineTo(13,-17); ctx.closePath(); ctx.fill();  // ear
    ctx.beginPath(); ctx.moveTo(-14,-10); ctx.quadraticCurveTo(-22,-16,-20,-8); ctx.quadraticCurveTo(-18,-4,-14,-6); ctx.fill(); // tail
    ctx.fillStyle='#2c3038';                                              // legs
    for(const lx of [-9,-3,4,10]){
      const kick2=lung? Math.sin(frame*0.6+lx)*3 : Math.sin(frame*0.25+lx)*1.6;
      ctx.fillRect(lx,-3,3,8+kick2*0.4);
    }
    ctx.fillStyle= wf.stun>0? '#8ab4ff' : '#ffb35a';                       // the eye
    ctx.beginPath(); ctx.arc(13,-14,1.6,0,7); ctx.fill();
    if(lung){ ctx.fillStyle='#e8f0f4'; ctx.fillRect(14,-11,3.4,1.6); }     // teeth out
    ctx.restore();
  }
  // owl
  { const ox=X(owl.x); if(ox>-40&&ox<RW+40){
      ctx.save(); ctx.translate(ox,owl.y+HUD);
      if(owl.state==='tele' && (frame>>2)%2){ ctx.fillStyle='rgba(255,179,90,.5)';
        ctx.beginPath(); ctx.arc(0,0,15,0,7); ctx.fill(); }
      ctx.fillStyle='#5c5648';
      ctx.beginPath(); ctx.ellipse(0,0,9,11,0,0,7); ctx.fill();
      const wf2=(owl.state==='dive'||owl.state==='rise')? Math.sin(frame*0.5)*10 : 2;
      ctx.beginPath(); ctx.ellipse(-11,-2-wf2*0.3,9,4,-0.5,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse( 11,-2-wf2*0.3,9,4, 0.5,0,7); ctx.fill();
      ctx.fillStyle='#e8d9a0';
      ctx.beginPath(); ctx.arc(-3,-6,2.2,0,7); ctx.arc(3,-6,2.2,0,7); ctx.fill();
      ctx.fillStyle='#241a10';
      ctx.beginPath(); ctx.arc(-3,-6,1,0,7); ctx.arc(3,-6,1,0,7); ctx.fill();
      ctx.restore();
  } }
  // the doors
  const door=(dx,label)=>{
    const sx=X(dx); if(sx<-70||sx>RW+70) return;
    ctx.fillStyle='#101828';
    ctx.beginPath(); ctx.ellipse(sx,FLOOR_Y+HUD-30,26,44,0,0,7); ctx.fill();
    ctx.strokeStyle='#3a4a5e'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.ellipse(sx,FLOOR_Y+HUD-30,26,44,0,0,7); ctx.stroke();
    ctx.fillStyle='rgba(200,220,255,.10)';
    ctx.beginPath(); ctx.ellipse(sx,FLOOR_Y+HUD-30,18,34,0,0,7); ctx.fill();
    drawLabel(label, sx, FLOOR_Y+HUD-84, '#9ab8d8');
  };
  door(DOOR_S-10,'SOUTH DOOR');
  door(DOOR_E+10,'EAST DOOR');

  drawRunner();

  // HUD strip
  const hg=ctx.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#0c1424'); hg.addColorStop(1,'#080e1a');
  ctx.fillStyle=hg; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle='rgba(122,150,190,.4)'; ctx.fillRect(0,HUD-2,RW,2);
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#9ab8d8';
  ctx.fillText('THE WOODS RUN', RW/2, 20);
  ctx.font='11px '+FONT; ctx.fillStyle='#5a7090';
  ctx.fillText('ARROWS run · SPACE jump · DOWN duck under a bough · X kick a wolf'
    +' · ESC back out', RW/2, 36);
  ctx.textAlign='right'; ctx.font='bold 12px '+FONT; ctx.fillStyle='#cfe0f4';
  ctx.fillText('RUN '+secs(runT)+'s', RW-14, 20);
  if(flags.woodsBest){ ctx.fillStyle='#ffe066'; ctx.fillText('BEST '+secs(flags.woodsBest)+'s', RW-14, 36); }
  ctx.textAlign='left'; ctx.font='11px '+FONT; ctx.fillStyle='#9ab8d8';
  ctx.fillText('BOTH DOORS LEAD SOMEWHERE', 14, 20);
  ctx.fillStyle='#5a7090';
  ctx.fillText(goingRight? 'east = North Woods  ·  back west = Lakeside'
                         : 'west = Lakeside  ·  back east = North Woods', 14, 36);

  if(introT>0){
    ctx.globalAlpha=Math.min(1,introT/30); ctx.textAlign='center';
    ctx.font='bold 13px '+FONT; ctx.fillStyle='#cfe0f4';
    ctx.fillText('Both doors are open. Take your time.', RW/2, HUD+70);
    ctx.globalAlpha=1;
  }
  if(doneT>0){
    ctx.textAlign='center'; ctx.font='bold 20px '+FONT; ctx.fillStyle='#9adf8c';
    ctx.fillText(crossed? 'THE WOODS LET YOU PASS — '+secs(runT)+'s'
                        : 'BACK THE WAY YOU CAME', RW/2, HUD+150);
    if(crossed && newBest){ ctx.font='bold 13px '+FONT; ctx.fillStyle='#ffe066';
      ctx.fillText('NEW BEST', RW/2, HUD+172); }
  }
}
function drawRunner(){
  const x=pl.x-camX, y=pl.y+HUD;
  if(pl.iframes>0 && (frame>>2)%2) return;
  const SKIN='#e8d9b0', SUIT='#3e7c4a', LEG='#2a5a36';
  if(pl.duck){
    GFX.box(ctx, x-5, y-6, 4.5, 7, LEG, GFX.dim(LEG,0.7), 1.5);
    GFX.box(ctx, x+0.5, y-6, 4.5, 7, LEG, GFX.dim(LEG,0.7), 1.5);
    GFX.box(ctx, x-5.5, y-12, 11, 8, SUIT, GFX.dim(SUIT,0.68), 3);
    GFX.body(ctx, x+pl.face*2, y-15, 5.6, 5.6, SKIN, GFX.dim(SKIN,0.76));
    ctx.fillStyle='#0b1c16';
    ctx.beginPath(); ctx.arc(x+pl.face*4, y-16, 1.2, 0, 7); ctx.fill();
    return;
  }
  if(pl.kick>8){                                 // the kick frame: leg out flat
    GFX.box(ctx, x-4, y-7, 4.5, 8, LEG, GFX.dim(LEG,0.7), 1.5);
    GFX.box(ctx, x+pl.face*3, y-13, pl.face*12, 4.5, LEG, GFX.dim(LEG,0.7), 1.5);
  } else {
    GFX.box(ctx, x-5, y-7, 4.5, 8, LEG, GFX.dim(LEG,0.7), 1.5);
    GFX.box(ctx, x+0.5, y-7, 4.5, 8, LEG, GFX.dim(LEG,0.7), 1.5);
  }
  GFX.box(ctx, x-5.5, y-19.5, 11, 13, SUIT, GFX.dim(SUIT,0.68), 3);
  GFX.body(ctx, x, y-24, 6.2, 6.2, SKIN, GFX.dim(SKIN,0.76));
  ctx.fillStyle='#0b1c16';
  ctx.beginPath(); ctx.arc(x+pl.face*2.2, y-25, 1.3, 0, 7); ctx.fill();
  if(pl.stun>0){ ctx.fillStyle='#ffe066';
    for(let i=0;i<3;i++){ const a=frame*0.3+i*2.1;
      ctx.beginPath(); ctx.arc(x+Math.cos(a)*8, y-32+Math.sin(a)*3, 1.2, 0, 7); ctx.fill(); } }
}

/* ---------------- API ---------------- */
window.WoodsRunLayer={
  enter(){
    side = window.woodsRunSide==='south'? 'south':'east';
    /* east door is on the RIGHT; entering by it you travel LEFT.
       the south door is on the LEFT; entering by it you travel RIGHT. */
    goingRight = side==='south';
    result='back'; crossed=false;
    buildWorld();
    chestGot=!!flags.woodsRunChest;
    spawnAtDoor(); camFollow();
    runT=0; running=true; doneT=0; newBest=false;
    introT=140; eLatch=true; spaceWas=true; kickWas=true;
  },
  exitDone(){
    /* `result` is the DOOR you left by, not whether you "won" — the room has
       no win. ESC backs out, which means the door you came in by. Geography:
       east door <-> NORTH WOODS (scr 1, west edge, rows 5-7)
       south door <-> LAKESIDE  (scr 4, top edge, cols 9-11) */
    const door = result==='back'? side : result;
    if(door==='south'){ loadScreen(4); PL.x=10*32+16; PL.y=10; }
    else { loadScreen(1); PL.x=8; PL.y=6*32+8; }
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
    saveGame();
  },
  update, draw,
  _t:{ get pl(){return pl;}, get wolves(){return wolves;}, get movers(){return movers;},
       get owl(){return owl;}, get swing(){return swing;}, swingTip,
       get branches(){return branches;}, get stumps(){return stumps;},
       get side(){return side;}, get goingRight(){return goingRight;},
       get result(){return result;}, set result(v){result=v;},
       get crossed(){return crossed;}, get foots(){return foots;},
       backToFooting, LUNGE_MULT, MOVE,
       get runT(){return runT;}, set runT(v){runT=v;},
       get doneT(){return doneT;}, get chestGot(){return chestGot;},
       groundAt, WW, FLOOR_Y, BOG_Y, BOG1, BOG2, DOOR_S, DOOR_E,
       spawnAtDoor, backToFooting }
};

})();
