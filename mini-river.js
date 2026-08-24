"use strict";
/* ============================================================
   GRISHNAK — RIVER RUN  (Scott, 2026-08-18 filing; built 2026-08-20:
   "let's get that river rafting stored idea going today, on the river in
   the east side of the main grishnak maze - enter boat, switches to
   different gameplay screen")

   His control spec, verbatim and implemented exactly: "up to thrust, accel
   over 3 seconds to max speed, finger off up arrow slows player down to min
   speed, left and right for fine course adjustments." This is the saved
   game-feel pattern — held momentum + micro-steering — so the tuning rules
   are Moonwalk's: speed is EARNED and KEPT, steering is a nudge not a dart.

   The raft is a bouncy round colorful blowup ring that tilts into its
   steering and squashes on impact. You always travel downstream; the
   current carries you at min speed even with hands off, which means the
   water itself is doing the floor of the work — thrust only buys you the
   margin. The flow streaks are drawn RELATIVE to that margin: drift with
   the current and the water around you goes still, paddle hard and it
   slides past. That one relative motion is what sells "floating".

   Cosy rules apply (this is the valley, not an arcade death run):
   a mishap costs a moment, not the run — rocks bonk you slow, branches
   tangle you briefly, banks shrug you off. Nothing ends the ride. The
   course is FIXED, so the river is learnable and the reward for knowing
   it is a better time. First arrival at the dock pays gold once; the
   clock and your best time carry the replay.
   ============================================================ */
(function(){

const RY=272;                 // raft's fixed screen row — world scrolls past
const RAFT_R=13;
const MIN=1.15, MAX=3.5;      // px/frame downstream
const ACC=(MAX-MIN)/180;      // 3 seconds of held UP to reach MAX
const DEC=(MAX-MIN)/95;       // hands off: back to MIN in ~1.6s
const RAPID_CUR=1.3;          // extra current inside white water
const SAVEK='grishRiverBest';
const LEN=5600;

/* ---- the course: one river, hand-shaped, always the same ---- */
const STRETCH=[
  {d0:0,    d1:700,  t:'calm'},
  {d0:700,  d1:1500, t:'bends'},
  {d0:1500, d1:2100, t:'narrows'},
  {d0:2100, d1:2900, t:'rocks'},
  {d0:2900, d1:3600, t:'rapids'},
  {d0:3600, d1:4300, t:'branches'},
  {d0:4300, d1:5200, t:'gauntlet'},
  {d0:5200, d1:5600, t:'calm'}
];
function stretchAt(d){
  for(const s of STRETCH) if(d>=s.d0&&d<s.d1) return s.t;
  return 'calm';
}
function smooth(a){ return a*a*(3-2*a); }                 // eased 0..1
function zoneMix(d,d0,d1,fade){                            // 1 inside, eased edges
  if(d<d0-fade||d>d1+fade) return 0;
  if(d<d0) return smooth((d-(d0-fade))/fade);
  if(d>d1) return smooth(((d1+fade)-d)/fade);
  return 1;
}
function center(d){
  let c=320 + 78*Math.sin(d/430) + 40*Math.sin(d/187+1.7);
  c += 46*Math.sin(d/128+0.6)*zoneMix(d,700,1500,180);     // the bends stretch
  c += 34*Math.sin(d/97+2.2)*zoneMix(d,4300,5200,160);     // the gauntlet writhes
  return c;
}
function halfw(d){
  let w=130;                                               // v2: a properly wide river
  w -= 46*zoneMix(d,1500,2100,200);                        // the narrows
  w -= 38*zoneMix(d,4300,5200,180);                        // gauntlet is tight too
  w -= 14*zoneMix(d,2900,3600,150);                        // rapids pinch a little
  return Math.max(64,w);
}
/* rocks: {d, o} — o is -1..1 across the channel. Placed so the free gap at
   every rock is generous; the suite proves it. */
const ROCKS=[
  {d:2160,o:-0.55},{d:2240,o:0.5},{d:2330,o:-0.2},{d:2410,o:0.65},
  {d:2495,o:-0.6},{d:2560,o:0.15},{d:2650,o:-0.45},{d:2720,o:0.6},
  {d:2810,o:-0.1},{d:2870,o:0.55},
  {d:3050,o:-0.5},{d:3260,o:0.45},{d:3470,o:-0.35},
  {d:4360,o:0.5},{d:4450,o:-0.5},{d:4540,o:0.25},{d:4640,o:-0.6},
  {d:4730,o:0.55},{d:4820,o:-0.2},{d:4910,o:0.6},{d:5000,o:-0.55},{d:5090,o:0.3}
];
/* branches overhang from a bank partway across; pass on the OTHER side */
const BRANCHES=[
  {d:3660,side:-1,reach:0.52},{d:3800,side:1,reach:0.55},
  {d:3950,side:-1,reach:0.5},{d:4100,side:1,reach:0.58},{d:4230,side:-1,reach:0.5}
];

let d=0, x=320, vx=0, spd=MIN, tilt=0;
let squash=0, tangle=0, bonkT=0, spin=0;
let frame=0, runT=0, phase='run', introT=190, doneT=0;
let parts=[], hitMarks=new Set();
let paidOut=false, best=null;
let eLatch=false, spaceLatch=true;
let camX=320;                 // eased camera follow — the river pans, the raft leads

function rockX(rk){ return center(rk.d)+rk.o*(halfw(rk.d)-26); }
function curCurrent(){ return stretchAt(d)==='rapids'? RAPID_CUR : 0; }

function puffAt(px_,py_,col,n){
  /* v2: inputs were world-ish; particles live at the raft's SCREEN spot */
  const sx=RW/2+(px_-camX)*0.86, sy=HUD+318-10;
  for(let i=0;i<n;i++) parts.push({x:sx,y:sy,vx:(Math.random()-0.5)*2.2,
    vy:(Math.random()-0.5)*2.2-0.6, life:14+Math.random()*12, color:col});
}

function tick(){
  frame++;
  camX+=(x-camX)*0.08;
  if(introT>0) introT--;
  if(squash>0) squash--;
  if(bonkT>0) bonkT--;
  for(let i=parts.length-1;i>=0;i--){
    const q=parts[i]; q.x+=q.vx; q.y+=q.vy; if(--q.life<=0) parts.splice(i,1);
  }
  const ek=held['Escape'];
  if(ek&&!eLatch){ eLatch=true;
    if(typeof startRiverTrans==='function') startRiverTrans('out');
    return; }
  if(!ek) eLatch=false;

  if(phase==='done'){
    doneT++;
    const sp=held[' '];
    if(sp&&!spaceLatch){ spaceLatch=true;
      if(typeof startRiverTrans==='function') startRiverTrans('out'); }
    if(!sp) spaceLatch=false;
    return;
  }
  runT++;

  // his spec: UP accelerates over 3s, release decays to MIN. Current is free.
  if(held['ArrowUp']||held['w']||held['W']) spd=Math.min(MAX,spd+ACC);
  else spd=Math.max(MIN,spd-DEC);
  if(tangle>0){ tangle--; spd=Math.min(spd,MIN*0.7); }
  const fwd=spd+curCurrent();
  d+=fwd;

  // fine course adjustments — a nudge with drift, never a dart
  const st=(held['ArrowLeft']||held['a']||held['A']?-1:0)+(held['ArrowRight']||held['d']||held['D']?1:0);
  vx=(vx+st*0.24)*0.90;
  vx=Math.max(-2.8,Math.min(2.8,vx));
  x+=vx;
  tilt+=((vx/2.8)-tilt)*0.15;

  // banks shrug you off
  const c=center(d), hw=halfw(d);
  const lo=c-hw+RAFT_R, hi=c+hw-RAFT_R;
  if(x<lo){ x=lo; if(vx<0) vx=-vx*0.45; squash=Math.max(squash,8); spd=Math.max(MIN,spd*0.9); }
  if(x>hi){ x=hi; if(vx>0) vx=-vx*0.45; squash=Math.max(squash,8); spd=Math.max(MIN,spd*0.9); }

  // rocks bonk — cost is speed and dignity, never the run
  for(const rk of ROCKS){
    const dy=(rk.d-d);
    if(Math.abs(dy)<RAFT_R+13){
      const rx=rockX(rk);
      if(Math.abs(x-rx)<RAFT_R+12){
        const away=x<rx?-1:1;
        x=rx+away*(RAFT_R+13); vx=away*1.7;
        spd=Math.max(MIN,spd*0.45);
        squash=16; bonkT=22; spin=18;
        puffAt(x,RY,'#dcecf6',8);
        sfx.denied&&sfx.denied();
      }
    }
  }
  // branches tangle — once each, briefly
  for(let i=0;i<BRANCHES.length;i++){
    const b=BRANCHES[i];
    if(hitMarks.has(i)) continue;
    if(Math.abs(b.d-d)<12){
      const bc=center(b.d), bw=halfw(b.d);
      const edge= b.side<0 ? bc-bw+bw*2*b.reach : bc+bw-bw*2*b.reach;
      const covered= b.side<0 ? x<edge : x>edge;
      if(covered){ hitMarks.add(i); tangle=40; spin=26; squash=10;
        puffAt(x,RY-10,'#7fae5e',10); sfx.denied&&sfx.denied(); }
    }
  }
  if(spin>0) spin--;

  if(d>=LEN){
    phase='done'; doneT=0; spaceLatch=true;
    const t=Math.round(runT/60*10)/10;
    let saved=null;
    try{ saved=+(localStorage.getItem(SAVEK)||0)||null; }catch(e){}
    best= saved && saved<=t ? saved : t;
    try{ localStorage.setItem(SAVEK,String(best)); }catch(e){}
    if(!paidOut && typeof flags!=='undefined' && !flags.riverRun){
      flags.riverRun=true; paidOut=true;
      if(typeof res!=='undefined'){ res.gold+=60; }
      if(typeof saveGame==='function') saveGame();
    }
    sfx.win&&sfx.win();
  }
}

/* ---------------- DRAW (v2, 2026-08-20: Scott — "more perspectived pov,
   wider space for river, work on water and stone graphic quality").
   The course and physics are untouched; only the eye moved. An OutRun-style
   projection: the river ahead converges toward a horizon, strips get smaller
   and darker with distance, and the camera eases after the raft so bends
   sweep across the frame. Downstream is AWAY from the camera — rocks grow
   out of the horizon as you ride at them. ---------------- */
const HOR=HUD+58;               // the horizon line
const RYs=HUD+318;              // the raft's screen row (near plane)
const PK=0.0040;                // perspective strength
const XS=0.86;                  // lateral squeeze
function pscale(dd){ return 1/(1+Math.max(-70,dd)*PK); }
function py(dd){ return HOR+(RYs-HOR)*pscale(dd); }
function pxx(wx,s){ return RW/2+(wx-camX)*s*XS; }

/* the water itself: seeded streaks that live in WORLD space and ride the
   current downstream — paddle harder than the river and they slide back
   past you; drift with it and they hold station. The float, projected. */
const STREAKS=[];
for(let i=0;i<44;i++) STREAKS.push({s:i*127.3, o:(i*61)%100/100});

function drawScene(){
  // sky above the horizon — dawn band, pale over the water
  const sg=ctx.createLinearGradient(0,HUD,0,HOR+6);
  sg.addColorStop(0,'#cfe3d8'); sg.addColorStop(1,'#eef4e4');
  ctx.fillStyle=sg; ctx.fillRect(0,HUD,RW,HOR-HUD+6);
  // far treeline sitting on the horizon
  ctx.fillStyle='#5d7a4c';
  for(let i=0;i<24;i++){
    const h=hash2(i*17,3), tx=(i/24)*RW+((h*20)|0)-10;
    ctx.beginPath(); ctx.ellipse(tx,HOR+2,16+h*14,7+h*6,0,Math.PI,0); ctx.fill();
  }
  // the ground plane, in perspective strips (far to near so paint layers)
  for(let y=HOR+2;y<HUD+RH+4;y+=3){
    const s=(y-HOR)/(RYs-HOR);
    const dd=(1/Math.max(0.02,s)-1)/PK;
    const wd=d+dd;
    const cx=center(wd), hw=halfw(wd);
    const xl=pxx(cx-hw,s), xr=pxx(cx+hw,s);
    const fog=Math.min(1,Math.max(0,dd/1400));        // distance greying
    // banks: meadow green, greyed by distance
    ctx.fillStyle='rgb('+(77+40*fog|0)+','+(122+20*fog|0)+','+(58+50*fog|0)+')';
    if(xl>0) ctx.fillRect(0,y,xl,3);
    if(xr<RW) ctx.fillRect(xr,y,RW-xr,3);
    // wet dirt lip, thinner with distance
    const lip=Math.max(1,4*s);
    ctx.fillStyle='rgba(150,122,80,'+(0.9-0.5*fog)+')';
    ctx.fillRect(xl-lip,y,lip,3); ctx.fillRect(xr,y,lip,3);
    // water: lively near, hazing toward the sky at distance — never a black snake
    const rap=stretchAt(wd)==='rapids';
    const fw=Math.min(1,fog*1.9);
    const wr=((30+83*s)*(1-fw)+152*fw)|0, wg=((72+62*s)*(1-fw)+178*fw)|0, wb=((102+77*s)*(1-fw)+172*fw)|0;
    ctx.fillStyle='rgb('+wr+','+wg+','+wb+')';
    ctx.fillRect(xl,y,xr-xl,3);
    if(rap){
      ctx.fillStyle='rgba(232,244,250,'+(0.10+0.10*Math.sin(wd*0.11+frame*0.3))+')';
      ctx.fillRect(xl,y,xr-xl,3);
    }
    // bank-edge foam licks
    ctx.fillStyle='rgba(226,240,248,'+(0.20*(1-fog))+')';
    if(((wd/9)|0)%3===0){ ctx.fillRect(xl,y,3.5*s+1,2); ctx.fillRect(xr-3.5*s-1,y,3.5*s+1,2); }
  }
  // sparkle pass — sun catching the surface
  for(let i=0;i<26;i++){
    const h=hash2(i*29,7);
    const dd=((h*900)+(i*137))%900;
    const wd=d+dd;
    const s=pscale(dd), yy=py(dd);
    const cx=center(wd), hw=halfw(wd);
    const sx=pxx(cx-hw+((h*613)%(hw*2)),s);
    const tw=0.5+0.5*Math.sin(frame*0.13+i*2.4);
    ctx.fillStyle='rgba(255,255,240,'+(0.28*tw*s).toFixed(2)+')';
    ctx.fillRect(sx,yy,2.6*s+0.6,1.2);
  }
  // the streaks that sell the current
  ctx.strokeStyle='rgba(214,236,248,.30)'; ctx.lineCap='round';
  for(const st of STREAKS){
    const flow=(st.s + frame*(MIN+curCurrent())*0.96);
    let dd=((flow-d)%1000+1000)%1000 - 60;                 // -60..940 ahead
    if(dd<-50||dd>900) continue;
    const s=pscale(dd), yy=py(dd);
    const wd=d+dd, cx=center(wd), hw=halfw(wd);
    const sx=pxx(cx-hw+st.o*2*hw*0.94+hw*0.03,s);
    ctx.lineWidth=1.6*s+0.3;
    ctx.beginPath(); ctx.moveTo(sx,yy); ctx.lineTo(sx-0.6,yy+7*s+1.5); ctx.stroke();
  }
  // bank dressing: reeds near the lips, the odd tree
  for(let i=0;i<30;i++){
    const h=hash2(i*13,19);
    const dd=((h*1400)+(i*97))%1100;
    const wd=d+dd;
    if(wd<0||wd>LEN) continue;
    const s=pscale(dd), yy=py(dd);
    const cx=center(wd), hw=halfw(wd);
    const side=h>0.5?1:-1;
    const bx=pxx(cx+side*(hw+14+((h*211)%70)),s);
    if(bx<-20||bx>RW+20) continue;
    if(h>0.82){                                            // a tree
      ctx.fillStyle='rgba(52,72,40,'+(0.9-0.4*Math.min(1,dd/1000))+')';
      ctx.fillRect(bx-1.6*s,yy-10*s,3.2*s,10*s);
      ctx.beginPath(); ctx.ellipse(bx,yy-13*s,9*s,8*s,0,0,7); ctx.fill();
    } else {                                               // reeds
      ctx.strokeStyle='rgba(74,110,54,'+(0.8-0.4*Math.min(1,dd/1000))+')';
      ctx.lineWidth=1.1*s+0.3;
      for(let k=0;k<3;k++){
        ctx.beginPath(); ctx.moveTo(bx+k*2.2*s,yy);
        ctx.lineTo(bx+k*2.2*s+Math.sin(frame*0.05+i+k)*2*s, yy-7*s-k*1.5*s); ctx.stroke();
      }
    }
  }
}
function drawRocks(){
  for(const rk of ROCKS){
    const dd=rk.d-d;
    if(dd<-40||dd>900) continue;
    const s=pscale(dd), yy=py(dd);
    const rx=pxx(rockX(rk),s);
    const R=14*s;
    // the wake: two short foam lines diverging downstream, low and quiet
    ctx.strokeStyle='rgba(230,244,250,'+(0.32*s).toFixed(2)+')'; ctx.lineWidth=1.2*s+0.3;
    ctx.beginPath(); ctx.moveTo(rx-R*0.8,yy-R*0.1); ctx.lineTo(rx-R*1.25,yy-R*0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx+R*0.8,yy-R*0.1); ctx.lineTo(rx+R*1.25,yy-R*0.9); ctx.stroke();
    // foam collar on the near face
    ctx.fillStyle='rgba(236,246,252,'+(0.75*Math.min(1,s+0.2)).toFixed(2)+')';
    ctx.beginPath(); ctx.ellipse(rx,yy+R*0.42,R*1.25,R*0.4,0,0,7); ctx.fill();
    // the stone: a real boulder — cool gradient, sun side, cracks, wet base
    const g=ctx.createRadialGradient(rx-R*0.45,yy-R*0.75,R*0.15,rx,yy-R*0.2,R*1.35);
    g.addColorStop(0,'#c7d2d8'); g.addColorStop(0.45,'#8a969e');
    g.addColorStop(0.8,'#59646c'); g.addColorStop(1,'#3a444c');
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.moveTo(rx-R,yy+R*0.35);
    ctx.quadraticCurveTo(rx-R*1.08,yy-R*0.45,rx-R*0.5,yy-R*0.85);
    ctx.quadraticCurveTo(rx-R*0.1,yy-R*1.12,rx+R*0.4,yy-R*0.9);
    ctx.quadraticCurveTo(rx+R*1.05,yy-R*0.5,rx+R*0.95,yy+R*0.3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(24,32,38,.45)'; ctx.lineWidth=Math.max(0.6,1.1*s); ctx.stroke();
    if(s>0.45){                                            // cracks earn their draw near
      ctx.strokeStyle='rgba(30,38,44,.5)'; ctx.lineWidth=0.8*s;
      ctx.beginPath(); ctx.moveTo(rx-R*0.3,yy-R*0.8); ctx.lineTo(rx-R*0.05,yy-R*0.3); ctx.lineTo(rx-R*0.25,yy+R*0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx+R*0.45,yy-R*0.6); ctx.lineTo(rx+R*0.3,yy-R*0.15); ctx.stroke();
    }
    ctx.fillStyle='rgba(255,255,255,'+(0.20*s).toFixed(2)+')';   // sun kiss
    ctx.beginPath(); ctx.ellipse(rx-R*0.4,yy-R*0.72,R*0.3,R*0.16,-0.5,0,7); ctx.fill();
  }
}
function drawBranches(){
  for(let i=0;i<BRANCHES.length;i++){
    const b=BRANCHES[i];
    const dd=b.d-d;
    if(dd<-40||dd>900) continue;
    const s=pscale(dd), yy=py(dd);
    const bc=center(b.d), bw=halfw(b.d);
    const from=pxx(b.side<0? bc-bw-8 : bc+bw+8, s);
    const to=pxx(b.side<0? bc-bw+bw*2*b.reach : bc+bw-bw*2*b.reach, s);
    const lift=9*s;
    // shadow on the water first
    ctx.strokeStyle='rgba(10,26,20,.25)'; ctx.lineWidth=4.5*s;
    ctx.beginPath(); ctx.moveTo(from,yy+2); ctx.quadraticCurveTo((from+to)/2,yy+2,to,yy+2); ctx.stroke();
    // the bough
    ctx.strokeStyle='#4e3a26'; ctx.lineWidth=4.5*s; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(from,yy-lift*0.4); ctx.quadraticCurveTo((from+to)/2,yy-lift,to,yy-lift*0.55); ctx.stroke();
    ctx.fillStyle='rgba(92,138,70,.92)';
    for(let k=0;k<6;k++){
      const t=k/5, lx=from+(to-from)*t, ly=yy-lift*(0.4+0.6*Math.sin(t*2.6));
      ctx.beginPath(); ctx.ellipse(lx,ly-2*s,7*s,4.4*s,0,0,7); ctx.fill();
      ctx.fillStyle='rgba(116,164,88,.85)';
    }
  }
}
function drawDock(){
  const dd=LEN-d-24;
  if(dd>950) return;
  const s=pscale(Math.max(0,dd)), yy=py(Math.max(0,dd));
  const cx=pxx(center(LEN),s);
  ctx.fillStyle='#6e5334';
  ctx.fillRect(cx-72*s,yy-4*s,144*s,10*s);
  ctx.fillStyle='#57402a';
  for(let i=0;i<6;i++) ctx.fillRect(cx-66*s+i*24*s,yy+6*s,5*s,8*s);
  ctx.fillStyle='#eadfa8'; ctx.font='bold '+Math.max(9,(12*s)|0)+'px '+FONT; ctx.textAlign='center';
  ctx.fillText('THE LANDING', cx, yy-8*s);
}
function drawRaft(){
  const sx=pxx(x,1), sy=RYs+Math.sin(frame*0.08)*1.6;
  const sq=1-Math.min(0.3,squash*0.02);
  ctx.save(); ctx.translate(sx,sy);
  ctx.rotate(tilt*0.4 + (spin>0?Math.sin(spin*0.6)*0.25:0));
  ctx.scale(1/sq,sq);
  // wake behind the raft (toward the camera)
  ctx.strokeStyle='rgba(232,244,250,.5)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(-RAFT_R-2,6); ctx.quadraticCurveTo(-RAFT_R-8,14,-RAFT_R-14,22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(RAFT_R+2,6); ctx.quadraticCurveTo(RAFT_R+8,14,RAFT_R+14,22); ctx.stroke();
  ctx.fillStyle='rgba(8,18,24,.28)';
  ctx.beginPath(); ctx.ellipse(0,6,RAFT_R+5,RAFT_R*0.5,0,0,7); ctx.fill();
  // the blowup ring, seen mostly from behind — a fat ellipse of color wedges
  const cols=['#d8433a','#ffd23e','#3f8fd0','#f3f0e6'];
  for(let i=0;i<10;i++){
    ctx.fillStyle=cols[i%4];
    const a0=Math.PI*(i/10*2-0.03), a1=Math.PI*((i+1)/10*2+0.03);
    ctx.beginPath();
    ctx.ellipse(0,0,RAFT_R+4,RAFT_R*0.62,0,a0,a1);
    ctx.ellipse(0,0,(RAFT_R+4)*0.55,RAFT_R*0.62*0.5,0,a1,a0,true);
    ctx.closePath(); ctx.fill();
  }
  // tube shine + seam
  ctx.strokeStyle='rgba(40,30,20,.4)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.ellipse(0,0,RAFT_R+4,RAFT_R*0.62,0,0,7); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.ellipse(0,-RAFT_R*0.14,(RAFT_R+2.4)*0.92,RAFT_R*0.44,0,Math.PI*1.15,Math.PI*1.85); ctx.stroke();
  // rider from behind: back, shoulders, head, cap — and a working paddle
  ctx.fillStyle='#3b5a74';
  ctx.beginPath(); ctx.ellipse(0,-3,6,7,0,0,7); ctx.fill();
  ctx.fillStyle='#2e4a62'; ctx.fillRect(-6,-4,12,3);
  ctx.fillStyle='#e8c8a0'; ctx.beginPath(); ctx.arc(0,-10,3.8,0,7); ctx.fill();
  ctx.fillStyle='#6b4e2e'; ctx.fillRect(-4,-14.6,8,2.6);
  const paddling=(held['ArrowUp']||held['w']||held['W'])&&phase==='run';
  const pk=Math.sin(frame*0.22);
  const side=pk>0?1:-1, amp=paddling?1:0.3;
  ctx.strokeStyle='#8a6a3e'; ctx.lineWidth=2.6; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-side*10*amp, -6);
  ctx.lineTo(side*11*amp, 2+Math.abs(pk)*4*amp);
  ctx.stroke();
  ctx.fillStyle='#7a5c38';
  ctx.beginPath(); ctx.ellipse(side*11*amp, 3+Math.abs(pk)*4*amp, 3.4,2,0.4*side,0,7); ctx.fill();
  if(paddling){                                             // dig spray
    ctx.fillStyle='rgba(236,246,252,.7)';
    ctx.beginPath(); ctx.arc(side*12*amp, 5+Math.abs(pk)*4*amp, 1.6+Math.abs(pk)*1.2,0,7); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle='#eef6fb';
  for(const q of parts){
    ctx.globalAlpha=Math.min(1,q.life/12)*0.8;
    ctx.fillStyle=q.color; ctx.beginPath(); ctx.arc(q.x,q.y,1.8,0,7); ctx.fill();
  }
  ctx.globalAlpha=1;
}
function drawBar(){
  const g=ctx.createLinearGradient(0,0,0,HUD);
  g.addColorStop(0,'#173142'); g.addColorStop(1,'#0e2130');
  ctx.fillStyle=g; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle='rgba(120,190,235,.3)'; ctx.fillRect(0,HUD-2,RW,2);
  ctx.textAlign='left'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#bfe0f2';
  ctx.fillText('RIVER RUN', 12, 20);
  ctx.font='10px '+FONT; ctx.fillStyle='#8fb4c9';
  ctx.fillText('UP paddle · LEFT/RIGHT steer · ESC bank out', 12, 36);
  const bx=RW-232, bw=160;                                   // the river ribbon
  ctx.fillStyle='rgba(255,255,255,.14)'; ctx.fillRect(bx,14,bw,7);
  ctx.fillStyle='#7fd4ff'; ctx.fillRect(bx,14,bw*Math.min(1,d/LEN),7);
  ctx.fillStyle='#eadfa8'; ctx.fillRect(bx+bw*Math.min(1,d/LEN)-1,12,3,11);
  ctx.textAlign='right'; ctx.font='11px '+FONT; ctx.fillStyle='#cfe6f4';
  ctx.fillText((runT/60).toFixed(1)+'s', RW-12, 21);
  let saved=null; try{ saved=+(localStorage.getItem(SAVEK)||0)||null; }catch(e){}
  if(saved){ ctx.fillStyle='#8fb4c9'; ctx.fillText('best '+saved.toFixed(1)+'s', RW-12, 36); }
  const sp=(spd-MIN)/(MAX-MIN);                              // paddle gauge
  ctx.fillStyle='rgba(255,255,255,.14)'; ctx.fillRect(bx,28,60,6);
  ctx.fillStyle= sp>0.85?'#ffd23e':'#9fd489'; ctx.fillRect(bx,28,60*sp,6);
}
function draw(){
  drawScene(); drawRocks(); drawDock(); drawRaft(); drawBranches();
  drawBar();
  if(introT>0&&phase==='run'){
    ctx.globalAlpha=Math.min(1,introT/40);
    ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#173142';
    ctx.fillText('The current has you. Ride it to THE LANDING.', RW/2, HUD+40);
    ctx.globalAlpha=1;
  }
  if(bonkT>0){
    ctx.textAlign='center'; ctx.font='bold 12px '+FONT; ctx.fillStyle='#ffd8b0';
    ctx.fillText('BONK', pxx(x,1), RYs-34);
  }
  if(tangle>0){
    ctx.textAlign='center'; ctx.font='bold 11px '+FONT; ctx.fillStyle='#cfe8b8';
    ctx.fillText('tangled...', pxx(x,1), RYs-34);
  }
  if(phase==='done'){
    ctx.fillStyle='rgba(8,16,24,.6)'; ctx.fillRect(0,HUD+90,RW,150);
    ctx.textAlign='center'; ctx.font='bold 22px '+FONT; ctx.fillStyle='#ffd23e';
    ctx.fillText('THE LANDING', RW/2, HUD+130);
    ctx.font='13px '+FONT; ctx.fillStyle='#e8f2f8';
    const t=(runT/60).toFixed(1);
    ctx.fillText(t+'s down the river'+(best&&+t<=best?' — best run yet':best?' · best '+best.toFixed(1)+'s':''), RW/2, HUD+156);
    if(paidOut&&doneT<300){ ctx.fillStyle='#ffe9a0'; ctx.fillText('+60 gold for the first landing', RW/2, HUD+176); }
    ctx.fillStyle='#c2c8d8'; ctx.font='12px '+FONT;
    ctx.fillText('SPACE or ESC — back to the bank', RW/2, HUD+202);
  }
}

function enter(){
  d=0; x=center(0); camX=x; vx=0; spd=MIN; tilt=0;
  squash=0; tangle=0; bonkT=0; spin=0;
  runT=0; phase='run'; introT=190; doneT=0;
  parts=[]; hitMarks=new Set(); paidOut=false; best=null;
  eLatch=false; spaceLatch=true;
}

window.RiverLayer={ enter, update:tick, draw,
  exitDone(){
    if(typeof loadScreen==='function'){ loadScreen(6); PL.x=14*T+16; PL.y=8*T+20;
      unstick(PL); PL.iframes=30; PL.kb.x=0; PL.kb.y=0; }
  },
  _t:{ LEN, MIN, MAX, ACC, DEC, RAPID_CUR, SAVEK, STRETCH, ROCKS, BRANCHES,
    center, halfw, rockX, stretchAt, tick, enter,
    get d(){return d;}, set d(v){d=v;},
    get x(){return x;}, set x(v){x=v;},
    get vx(){return vx;}, set vx(v){vx=v;},
    get spd(){return spd;}, set spd(v){spd=v;},
    get phase(){return phase;}, set phase(v){phase=v;},
    get runT(){return runT;}, get tangle(){return tangle;},
    get paidOut(){return paidOut;}, get hitMarks(){return hitMarks;} }
};

})();
