"use strict";
/* ============================================================
   GRISHNAK — SQUIRREL EVA (a.k.a. "spACecORNS")
   Loaded by newgame2.html after the main engine + other layers.
   You're an 8-bit squirrel in a tiny astronaut suit, tethered by
   a carabiner to a fixed anchor point. Arrow keys fire tiny jets;
   a gentle bungee pulls you back if you thrust past tether range
   (never a hard wall). Thrust close to a NEW anchor and press
   SPACE to unclip/reclip, extending your reach across the hull.
   Collect every spacecorn; drifting debris just knocks you around
   (no real damage) — this one's a breather room, not a gauntlet.
   ============================================================ */
(function(){

const TETHER_LEN=130, RECLIP_R=30;
const THRUST=0.11, DRAG=0.975, MAXSPD=2.8, PULL_K=0.03;
const CORN_R=12, DEBRIS_R=14, DEBRIS_KNOCK=3.2;
const EXIT_R=40;

const ANCHORS=[
  {x:90,  y:300},
  {x:210, y:230},
  {x:330, y:170},
  {x:460, y:230},
  {x:560, y:300}
];
const CORN_DEF=[
  {x:90,  y:190},
  {x:210, y:120},
  {x:330, y:280},
  {x:460, y:120},
  {x:560, y:190}
];

let anchorIdx=0, px=0, py=0, vx=0, vy=0;
let corns=[], collected=0, debris=[], savedPos=null, exitLatch=false, reclipLatch=false, done=false;

function resetRoom(){
  anchorIdx=0;
  px=ANCHORS[0].x; py=ANCHORS[0].y+TETHER_LEN*0.6; vx=0; vy=0;
  corns=CORN_DEF.map((c,i)=>({...c, id:i, got:false, bob:Math.random()*6.28}));
  collected=0; done=false;
  debris=[
    {x:250,y:300,vx:0.32,vy:-0.16,ang:0,spin:0.03},
    {x:400,y:150,vx:-0.26,vy:0.21,ang:0,spin:-0.025},
    {x:150,y:120,vx:0.18,vy:0.24,ang:0,spin:0.02}
  ];
}

function tetherPoint(){ return ANCHORS[anchorIdx]; }

/* ---------------- UPDATE ---------------- */
function update(){
  const d=dirHeld();
  if(d.x){ vx+=d.x*THRUST; }
  if(d.y){ vy+=d.y*THRUST; }
  const spd=Math.hypot(vx,vy);
  if(spd>MAXSPD){ vx=vx/spd*MAXSPD; vy=vy/spd*MAXSPD; }
  vx*=DRAG; vy*=DRAG;
  px+=vx; py+=vy;

  // gentle bungee: only pulls once past the tether radius, never a hard wall
  const anc=tetherPoint();
  const dx=px-anc.x, dy=py-anc.y, dist=Math.hypot(dx,dy)||1;
  if(dist>TETHER_LEN){
    const over=dist-TETHER_LEN;
    const pull=Math.min(0.9, over*PULL_K);
    vx-=(dx/dist)*pull; vy-=(dy/dist)*pull;
    px-=(dx/dist)*pull*2; py-=(dy/dist)*pull*2;
  }
  px=Math.max(6,Math.min(RW-6,px)); py=Math.max(6,Math.min(RH-6,py));

  // reclip to a nearby different anchor
  const jump=held[' '];
  if(jump && !reclipLatch){
    for(let i=0;i<ANCHORS.length;i++){
      if(i===anchorIdx) continue;
      if(Math.hypot(px-ANCHORS[i].x,py-ANCHORS[i].y)<RECLIP_R){ anchorIdx=i; sfx.pick(); reclipLatch=true; break; }
    }
  }
  if(!jump) reclipLatch=false;

  // debris drift + gentle knockback (no PL.hp cost — breather room)
  for(const b of debris){
    b.x+=b.vx; b.y+=b.vy; b.ang+=b.spin;
    if(b.x<DEBRIS_R||b.x>RW-DEBRIS_R) b.vx*=-1;
    if(b.y<DEBRIS_R||b.y>RH-DEBRIS_R) b.vy*=-1;
    const bd=Math.hypot(px-b.x,py-b.y);
    if(bd<DEBRIS_R+8){
      const nx=(px-b.x)/(bd||1), ny=(py-b.y)/(bd||1);
      vx+=nx*DEBRIS_KNOCK*0.2; vy+=ny*DEBRIS_KNOCK*0.2;
      px+=nx*2; py+=ny*2;
      puff(px,py+HUD,'#a8a2b8',5); sfx.hurt();
    }
  }

  // collect
  for(const c of corns){
    if(c.got) continue;
    if(Math.hypot(px-c.x,py-c.y)<CORN_R+6){
      c.got=true; collected++;
      addFloat(c.x,c.y-10,'+1 spacecorn','#ffcc33'); puff(c.x,c.y,'#ffcc33',10); sfx.coin();
      if(collected>=corns.length && !done){
        done=true; flags.squirrelDone=true;
        res.gold=Math.min(999,res.gold+25);
        toast('Every spacecorn gathered — the suit AI chirps happily. +25 gold');
        sfx.task(); saveGame();
      }
    }
  }

  // exit near the home anchor
  if(Math.hypot(px-ANCHORS[0].x,py-ANCHORS[0].y)<EXIT_R){
    if(held[' '] && !exitLatch && !reclipLatch){ exitLatch=true; startSquirrelTrans('out'); }
  }
  if(!held[' ']) exitLatch=false;

  PL.fx = vx>=0?1:-1;
}

/* ---------------- DRAW ---------------- */
function drawAnchor(a,i){
  const x=a.x, y=a.y+HUD, active=i===anchorIdx;
  const near = !active && Math.hypot(px-a.x,py-a.y)<RECLIP_R;
  ctx.fillStyle='#3a3a48'; ctx.beginPath(); ctx.arc(x,y,7,0,7); ctx.fill();
  ctx.strokeStyle= active? '#7fdb7f' : near? '#ffd76e' : 'rgba(200,200,220,.5)';
  ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,10,0,7); ctx.stroke();
  if(near) drawLabel('[SPACE] reclip', x, y-20, '#ffe9a0');
}
function drawTether(){
  const anc=tetherPoint(), x0=anc.x, y0=anc.y+HUD, x1=px, y1=py+HUD;
  const mx=(x0+x1)/2, my=(y0+y1)/2+6;
  ctx.strokeStyle='rgba(170,200,255,.55)'; ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.quadraticCurveTo(mx,my,x1,y1); ctx.stroke();
}
function drawCorn(c){
  if(c.got) return;
  const bob=Math.sin(frame*0.08+c.bob)*3;
  const x=c.x, y=c.y+HUD+bob;
  const gl=ctx.createRadialGradient(x,y,1,x,y,13);
  gl.addColorStop(0,'rgba(255,204,51,.5)'); gl.addColorStop(1,'rgba(255,204,51,0)');
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(x,y,13,0,7); ctx.fill();
  ctx.fillStyle='#8a6a3a'; ctx.beginPath(); ctx.ellipse(x,y-5,6,3.4,0,0,7); ctx.fill();
  const bg=ctx.createLinearGradient(x-6,y,x+6,y+9);
  bg.addColorStop(0,'#e8b84a'); bg.addColorStop(1,'#b8802a');
  ctx.fillStyle=bg; ctx.beginPath(); ctx.ellipse(x,y+3,6,7,0,0,7); ctx.fill();
  ctx.strokeStyle='rgba(80,50,10,.5)'; ctx.lineWidth=1; ctx.stroke();
}
function drawDebris(b){
  const x=b.x, y=b.y+HUD;
  ctx.save(); ctx.translate(x,y); ctx.rotate(b.ang);
  ctx.fillStyle='#6b6474';
  ctx.beginPath();
  for(let i=0;i<6;i++){
    const a=i/6*6.28, r=DEBRIS_R*(0.7+hash2(i,7)*0.4);
    const xx=Math.cos(a)*r, yy=Math.sin(a)*r;
    if(i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(10,8,14,.5)'; ctx.lineWidth=1.2; ctx.stroke();
  ctx.restore();
}
function drawSquirrel(){
  const x=px, y=py+HUD;
  const ang=Math.atan2(vy,vx);
  // bushy tail (trails opposite of velocity)
  ctx.save(); ctx.translate(x,y); ctx.rotate(ang+Math.PI);
  ctx.fillStyle='#c9743a';
  ctx.beginPath(); ctx.ellipse(10,0,9,5,0,0,7); ctx.fill();
  ctx.fillStyle='#e0925a'; ctx.beginPath(); ctx.ellipse(11,0,5,2.6,0,0,7); ctx.fill();
  ctx.restore();
  // suit body
  const bg=ctx.createLinearGradient(x,y-9,x,y+9);
  bg.addColorStop(0,'#f2efe6'); bg.addColorStop(1,'#cfc8b8');
  ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(x,y,9,0,7); ctx.fill();
  ctx.strokeStyle='rgba(80,70,50,.4)'; ctx.lineWidth=1.2; ctx.stroke();
  // helmet bubble
  ctx.fillStyle='rgba(160,210,255,.35)'; ctx.beginPath(); ctx.arc(x,y-2,6.5,0,7); ctx.fill();
  ctx.strokeStyle='rgba(200,230,255,.6)'; ctx.lineWidth=1; ctx.stroke();
  // squirrel face
  ctx.fillStyle='#1a1410';
  ctx.beginPath(); ctx.arc(x-2.2,y-3,1,0,7); ctx.arc(x+2.2,y-3,1,0,7); ctx.fill();
  ctx.fillStyle='#3a2a10'; ctx.beginPath(); ctx.arc(x,y,1,0,7); ctx.fill();
  // little ears
  ctx.fillStyle='#c9743a';
  ctx.beginPath(); ctx.arc(x-5,y-8,2,0,7); ctx.arc(x+5,y-8,2,0,7); ctx.fill();
  // thrust flame
  if((dirHeld().x||dirHeld().y)){
    const fa=Math.atan2(dirHeld().y,dirHeld().x)+Math.PI;
    const fx=x+Math.cos(fa)*11, fy=y+Math.sin(fa)*11;
    ctx.fillStyle='rgba(255,170,80,.85)';
    ctx.beginPath(); ctx.arc(fx,fy,3+Math.random()*2,0,7); ctx.fill();
  }
}
function drawBar(){
  const hg=ctx.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#141a2e'); hg.addColorStop(1,'#0a0d1a');
  ctx.fillStyle=hg; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle='rgba(255,204,51,.3)'; ctx.fillRect(0,HUD-2,RW,2);
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#ffe9a0';
  ctx.fillText('SQUIRREL EVA', RW/2, 24);
  ctx.font='11px '+FONT; ctx.fillStyle='#c8ddff';
  ctx.fillText(done? 'All spacecorns gathered — fly home to the first clip and press SPACE' : 'spacecorns '+collected+'/'+corns.length+' · ARROWS jets · SPACE reclip / exit near start', RW/2, 38);
}
function draw(){
  const g=ctx;
  g.fillStyle='#04050c'; g.fillRect(0,HUD,RW,RH);
  for(let i=0;i<60;i++){
    const hv=hash2(i*13,i*7);
    g.fillStyle='rgba(200,210,255,'+(0.03+hv*0.05).toFixed(3)+')';
    g.beginPath(); g.arc(hv*RW, HUD+hash2(i,5)*RH, 1+hv, 0, 7); g.fill();
  }
  // ship hull silhouette in the corner for flavor
  g.fillStyle='rgba(60,68,90,.5)';
  g.beginPath(); g.moveTo(0,HUD+RH); g.lineTo(0,HUD+RH-60); g.quadraticCurveTo(40,HUD+RH-40,70,HUD+RH); g.closePath(); g.fill();

  for(let i=0;i<ANCHORS.length;i++) drawAnchor(ANCHORS[i],i);
  drawTether();
  for(const c of corns) drawCorn(c);
  for(const b of debris) drawDebris(b);
  drawSquirrel();

  const ex=ANCHORS[0].x, ey=ANCHORS[0].y+HUD;
  if(Math.hypot(px-ANCHORS[0].x,py-ANCHORS[0].y)<EXIT_R) drawLabel('[SPACE] fly home', ex, ey-24, '#ffe9a0');

  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.life--;
    if(p.life<=0){ particles.splice(i,1); continue; }
    ctx.globalAlpha=Math.min(1,p.life/15)*0.85; ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y+HUD,2,0,7); ctx.fill(); ctx.globalAlpha=1;
  }
  ctx.font='bold 12px '+FONT; ctx.textAlign='center'; ctx.lineJoin='round';
  for(let i=floats.length-1;i>=0;i--){
    const f=floats[i]; f.y-=0.4; f.life--;
    if(f.life<=0){ floats.splice(i,1); continue; }
    ctx.globalAlpha=Math.min(1,f.life/20);
    ctx.lineWidth=3; ctx.strokeStyle='rgba(4,4,10,.85)'; ctx.strokeText(f.text,f.x,f.y+HUD);
    ctx.fillStyle=f.color||'#fff'; ctx.fillText(f.text,f.x,f.y+HUD); ctx.globalAlpha=1;
  }
  drawBar();
}

/* ---------------- API ---------------- */
window.SquirrelLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    resetRoom();
    PL.iframes=0; PL.kb.x=0; PL.kb.y=0;
    toast('Tiny jets online. ARROWS to thrust — the tether will bungee you back, never a hard stop.');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; } else loadScreen(12);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw
};

})();
