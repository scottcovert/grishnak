"use strict";
/* ============================================================
   GRISHNAK — OMEGA RUN (Omega Race-style bounded-arena minigame)
   Reached by boarding the wrecked ship in the caverns' Treasure
   Vault (kingdom-caves.js). Real momentum flight (thrust/rotate/
   drift) — but unlike Asteroids the field is a WALLED ARENA with a
   solid central block: you and the enemy Death-Ships BOUNCE off the
   walls and circle the barrier. Kill enemies for salvage that feeds
   the shared wood/stone/gold economy (the reward-collection Scott
   liked). Signature mechanic: floating BOMBS carry a 10-second
   countdown — shooting a bomb PUSHES it along your shot, so you herd
   a live bomb into the enemy pack and let it detonate. One wall has a
   YELLOW ESCAPE GATE, sealed until you score enough OR banish a whole
   wave; fly through it to go home. Player health = shared PL.hp.
   ============================================================ */
(function(){

// arena (game coords; HUD added only at draw time)
const AX0=28, AY0=22, AX1=RW-28, AY1=RH-22;         // 28..612 , 22..362
const BX0=246, BY0=150, BX1=394, BY1=234;           // central block
const GATE_Y0=AY0+(AY1-AY0)*0.34, GATE_Y1=AY0+(AY1-AY0)*0.66;
const ACX=(AX0+AX1)/2, ACY=(AY0+AY1)/2;

const SHIP_THRUST=0.13, SHIP_DRAG=0.985, SHIP_ROT=0.09, SHIP_MAXSPD=3.4, SHIP_R=9;
const BULLET_SPD=5.8, BULLET_LIFE=70, FIRE_COOLDOWN=13;
const ENEMY_R=11, ENEMY_HP=2, ENEMY_ACCEL=0.05, ENEMY_MAXSPD=1.95;
const EBULLET_SPD=2.5, EBULLET_LIFE=150;
const BOMB_R=12, BOMB_TIME=600, BOMB_PUSH=1.5, BOMB_MAXSPD=3.2, BLAST_R=70;
const SCORE_GATE=400;

let ship=null, bullets=[], ebullets=[], enemies=[], bombs=[], salvage=[];
let level=1, score=0, fireCooldown=0, introT=0, exitLatch=false, savedPos=null;
let banished=false, waveTimer=0, flash=0, everCollected=false, enemyId=0;

/* ---------------- geometry: walls + central block bounce ---------------- */
function bounceWalls(o, r, damp, allowGate){
  const gateHere = allowGate && gateOpen() && o.y>GATE_Y0 && o.y<GATE_Y1;
  if(o.x<AX0+r){ o.x=AX0+r; if(o.vx<0) o.vx=-o.vx*damp; }
  if(!gateHere && o.x>AX1-r){ o.x=AX1-r; if(o.vx>0) o.vx=-o.vx*damp; }
  if(o.y<AY0+r){ o.y=AY0+r; if(o.vy<0) o.vy=-o.vy*damp; }
  if(o.y>AY1-r){ o.y=AY1-r; if(o.vy>0) o.vy=-o.vy*damp; }
  // central block
  const nx=Math.max(BX0,Math.min(o.x,BX1)), ny=Math.max(BY0,Math.min(o.y,BY1));
  const dx=o.x-nx, dy=o.y-ny, d2=dx*dx+dy*dy;
  if(d2 < r*r){
    if(dx===0 && dy===0){
      const toL=o.x-BX0, toR=BX1-o.x, toT=o.y-BY0, toB=BY1-o.y, m=Math.min(toL,toR,toT,toB);
      if(m===toL){ o.x=BX0-r; if(o.vx>0)o.vx=-o.vx*damp; }
      else if(m===toR){ o.x=BX1+r; if(o.vx<0)o.vx=-o.vx*damp; }
      else if(m===toT){ o.y=BY0-r; if(o.vy>0)o.vy=-o.vy*damp; }
      else { o.y=BY1+r; if(o.vy<0)o.vy=-o.vy*damp; }
    } else {
      const d=Math.hypot(dx,dy)||1, push=r-d, nxr=dx/d, nyr=dy/d;
      o.x+=nxr*push; o.y+=nyr*push;
      const dot=o.vx*nxr+o.vy*nyr;
      if(dot<0){ o.vx-=(1+damp)*dot*nxr; o.vy-=(1+damp)*dot*nyr; }
    }
  }
}
function insideWall(x,y){
  if(x<AX0||x>AX1||y<AY0||y>AY1) return true;
  if(x>BX0&&x<BX1&&y>BY0&&y<BY1) return true;
  return false;
}
function gateOpen(){ return banished || score>=SCORE_GATE; }

/* ---------------- spawning ---------------- */
function trackPoint(minR){
  // a random spot in the arena that isn't inside the central block
  for(let tries=0;tries<40;tries++){
    const x=AX0+20+Math.random()*(AX1-AX0-40), y=AY0+20+Math.random()*(AY1-AY0-40);
    if(!insideWall(x,y) && !(x>BX0-minR&&x<BX1+minR&&y>BY0-minR&&y<BY1+minR)) return {x,y};
  }
  return {x:AX0+30, y:AY1-30};
}
function spawnWave(){
  const n=Math.min(7,2+level);
  for(let i=0;i<n;i++){
    const p=trackPoint(20), dir=Math.random()*6.28;
    enemies.push({id:enemyId++, x:p.x, y:p.y, vx:Math.cos(dir), vy:Math.sin(dir),
      hp:ENEMY_HP, ang:dir, fireT:90+Math.random()*120});
  }
  for(let i=0;i<2;i++){
    const p=trackPoint(24);
    bombs.push({x:p.x, y:p.y, vx:(Math.random()-0.5)*0.4, vy:(Math.random()-0.5)*0.4, t:BOMB_TIME});
  }
}
function dropSalvage(x,y,rich){
  const wasEmpty=salvage.length===0;
  const n=1+(Math.random()<0.5?1:0);
  for(let i=0;i<n;i++){
    let type;
    if(rich) type='gold';
    else { const r=Math.random(); type=r<0.4?'wood':r<0.8?'stone':'gold'; }
    const a=Math.random()*6.28, s=0.6+Math.random()*0.8;
    salvage.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,type,t:600});
  }
  if(wasEmpty) toast('Salvage glinting — fly through it to absorb!');
}

/* ---------------- ship + combat ---------------- */
function updateShip(){
  const d=dirHeld();
  if(d.x) ship.ang += d.x*SHIP_ROT;
  if(d.y<0){
    ship.vx += Math.sin(ship.ang)*SHIP_THRUST;
    ship.vy -= Math.cos(ship.ang)*SHIP_THRUST;
    if(frame%4===0) particles.push({x:ship.x-Math.sin(ship.ang)*10, y:ship.y+Math.cos(ship.ang)*10,
      vx:(Math.random()-0.5)*0.6, vy:(Math.random()-0.5)*0.6, life:14, color:'#8ab4ff'});
  }
  const spd=Math.hypot(ship.vx,ship.vy);
  if(spd>SHIP_MAXSPD){ ship.vx=ship.vx/spd*SHIP_MAXSPD; ship.vy=ship.vy/spd*SHIP_MAXSPD; }
  ship.vx*=SHIP_DRAG; ship.vy*=SHIP_DRAG;
  ship.x+=ship.vx; ship.y+=ship.vy;
  bounceWalls(ship, SHIP_R, 0.55, true);

  if(fireCooldown>0) fireCooldown--;
  if(held[' '] && fireCooldown<=0){
    fireCooldown=FIRE_COOLDOWN;
    bullets.push({x:ship.x+Math.sin(ship.ang)*12, y:ship.y-Math.cos(ship.ang)*12,
      vx:ship.vx+Math.sin(ship.ang)*BULLET_SPD, vy:ship.vy-Math.cos(ship.ang)*BULLET_SPD, t:BULLET_LIFE});
    sfx.swing();
  }
}
function updateBullets(){
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    b.x+=b.vx; b.y+=b.vy; b.t--;
    if(b.t<=0 || insideWall(b.x,b.y)){ bullets.splice(i,1); continue; }
    let done=false;
    // bombs: shooting one PUSHES it (the signature mechanic)
    for(const bm of bombs){
      if(Math.hypot(bm.x-b.x,bm.y-b.y)<BOMB_R+2){
        const bl=Math.hypot(b.vx,b.vy)||1;
        bm.vx+=b.vx/bl*BOMB_PUSH; bm.vy+=b.vy/bl*BOMB_PUSH;
        const bs=Math.hypot(bm.vx,bm.vy);
        if(bs>BOMB_MAXSPD){ bm.vx=bm.vx/bs*BOMB_MAXSPD; bm.vy=bm.vy/bs*BOMB_MAXSPD; }
        puff(b.x,b.y,'#ffb199',5); sfx.hit();
        done=true; break;
      }
    }
    if(done){ bullets.splice(i,1); continue; }
    for(let j=enemies.length-1;j>=0;j--){
      const e=enemies[j];
      if(Math.hypot(e.x-b.x,e.y-b.y)<ENEMY_R){
        e.hp--; puff(b.x,b.y,'#ffe9a0',6);
        if(e.hp<=0){ killEnemy(j,false); }
        else sfx.hit();
        done=true; break;
      }
    }
    if(done) bullets.splice(i,1);
  }
}
function killEnemy(idx, byBomb){
  const e=enemies[idx];
  enemies.splice(idx,1);
  score += byBomb?75:50;
  puff(e.x,e.y,'#ff8a6a',13); sfx.coin();
  dropSalvage(e.x,e.y, byBomb || Math.random()<0.25);
  if(byBomb) addFloat(e.x,e.y-12,'+75','#ffd76e'); else addFloat(e.x,e.y-12,'+50','#bfeffc');
  if(!enemies.length) clearWave();
}
function clearWave(){
  banished=true;
  score+=100; res.gold=Math.min(999,res.gold+15);
  toast('WAVE BANISHED! +100 · the yellow gate is open — or press on for more salvage');
  sfx.task();
  waveTimer=210;   // brief calm, then a fresh, harder wave
}

function updateEnemies(){
  for(const e of enemies){
    // homing blended with a swirl around the central block → they circle, not stall
    const hx=ship.x-e.x, hy=ship.y-e.y, hl=Math.hypot(hx,hy)||1;
    const ox=e.x-ACX, oy=e.y-ACY, ol=Math.hypot(ox,oy)||1;
    const swx=-oy/ol, swy=ox/ol;
    e.vx += (hx/hl*0.62 + swx*0.5)*ENEMY_ACCEL;
    e.vy += (hy/hl*0.62 + swy*0.5)*ENEMY_ACCEL;
    const sp=Math.hypot(e.vx,e.vy);
    if(sp>ENEMY_MAXSPD){ e.vx=e.vx/sp*ENEMY_MAXSPD; e.vy=e.vy/sp*ENEMY_MAXSPD; }
    e.vx*=0.99; e.vy*=0.99;
    e.x+=e.vx; e.y+=e.vy; e.ang=Math.atan2(e.vy,e.vx);
    bounceWalls(e, ENEMY_R, 0.85, false);
    // enemy fire (gentle, level 2+)
    if(level>=2){
      e.fireT--;
      if(e.fireT<=0){
        e.fireT=140+Math.random()*120;
        const a=Math.atan2(ship.y-e.y, ship.x-e.x);
        ebullets.push({x:e.x, y:e.y, vx:Math.cos(a)*EBULLET_SPD, vy:Math.sin(a)*EBULLET_SPD, t:EBULLET_LIFE});
      }
    }
  }
}
function updateEBullets(){
  for(let i=ebullets.length-1;i>=0;i--){
    const b=ebullets[i]; b.x+=b.vx; b.y+=b.vy; b.t--;
    if(b.t<=0 || insideWall(b.x,b.y)){ ebullets.splice(i,1); continue; }
    if(PL.iframes<=0 && Math.hypot(b.x-ship.x,b.y-ship.y)<SHIP_R+2){ ebullets.splice(i,1); shipHit(); }
  }
}
function updateBombs(){
  for(let i=bombs.length-1;i>=0;i--){
    const bm=bombs[i];
    bm.x+=bm.vx; bm.y+=bm.vy; bm.vx*=0.992; bm.vy*=0.992;
    bounceWalls(bm, BOMB_R, 0.85, false);
    bm.t--;
    // nudged (not shot) by the ship's nose too
    if(Math.hypot(bm.x-ship.x,bm.y-ship.y)<BOMB_R+SHIP_R){
      const dx=bm.x-ship.x, dy=bm.y-ship.y, dl=Math.hypot(dx,dy)||1;
      bm.vx+=dx/dl*0.3; bm.vy+=dy/dl*0.3;
      ship.vx-=dx/dl*0.2; ship.vy-=dy/dl*0.2;
    }
    if(bm.t<=0){ bombs.splice(i,1); detonate(bm.x,bm.y); }
  }
}
function detonate(x,y){
  flash=9; sfx.boss(); puff(x,y,'#ffb347',22);
  for(let k=0;k<14;k++) particles.push({x, y, vx:(Math.random()-0.5)*6, vy:(Math.random()-0.5)*6, life:22, color:'#ff8a3c'});
  for(let j=enemies.length-1;j>=0;j--){
    if(Math.hypot(enemies[j].x-x,enemies[j].y-y)<BLAST_R) killEnemy(j,true);
  }
  for(const b2 of bombs){ if(Math.hypot(b2.x-x,b2.y-y)<BLAST_R) b2.t=Math.min(b2.t,10); }   // chain
  if(PL.iframes<=0 && Math.hypot(ship.x-x,ship.y-y)<BLAST_R){ shipHit(); }
}
function updateSalvage(){
  for(let i=salvage.length-1;i>=0;i--){
    const p=salvage[i];
    p.x+=p.vx; p.y+=p.vy; p.vx*=0.96; p.vy*=0.96; p.t--;
    if(p.x<AX0+4||p.x>AX1-4) p.vx*=-0.6;
    if(p.y<AY0+4||p.y>AY1-4) p.vy*=-0.6;
    const dx=ship.x-p.x, dy=ship.y-p.y, dist=Math.hypot(dx,dy);
    if(dist<34 && dist>0){ p.x-=dx/dist*2.4; p.y-=dy/dist*2.4; }   // magnet toward ship
    if(dist<12 || p.t<=0){
      if(dist<12){
        if(p.type==='wood') res.wood=Math.min(99,res.wood+1);
        else if(p.type==='stone') res.stone=Math.min(99,res.stone+1);
        else res.gold=Math.min(999,res.gold+1);
        everCollected=true; sfx.pick();
      }
      salvage.splice(i,1);
    }
  }
}
function checkShipCollisions(){
  if(PL.iframes>0){ PL.iframes--; return; }
  for(const e of enemies){
    if(Math.hypot(e.x-ship.x,e.y-ship.y)<ENEMY_R+SHIP_R){
      const dx=e.x-ship.x, dy=e.y-ship.y, dl=Math.hypot(dx,dy)||1;
      e.vx+=dx/dl*1.4; e.vy+=dy/dl*1.4;   // knock the rammer back
      shipHit(); return;
    }
  }
}
function shipHit(){
  PL.hp--; PL.iframes=90; sfx.hurt();
  puff(ship.x,ship.y,'#ff5a3c',14);
  ship.vx*=-0.4; ship.vy*=-0.4;
  if(PL.hp<=0){ if(typeof playerDown==='function') playerDown(); else startAsteroidsTrans('out'); }
}

/* ---------------- update ---------------- */
function update(){
  if(flash>0) flash--;
  if(introT>0){ introT--; return; }
  updateShip(); updateBullets(); updateEnemies(); updateEBullets(); updateBombs(); updateSalvage();
  checkShipCollisions();
  if(waveTimer>0){ waveTimer--; if(waveTimer===0){ level++; spawnWave(); } }
  // escape through the open yellow gate
  if(gateOpen() && ship.x>AX1-2 && ship.y>GATE_Y0 && ship.y<GATE_Y1){
    if(!exitLatch){ exitLatch=true; startAsteroidsTrans('out'); }
  }
}

/* ---------------- draw ---------------- */
function drawArena(){
  const open=gateOpen();
  ctx.strokeStyle='rgba(138,180,255,.7)'; ctx.lineWidth=2.5;
  // outer walls, drawn as 4 edges so the gate segment can differ
  ctx.beginPath();
  ctx.moveTo(AX0,AY0+HUD); ctx.lineTo(AX1,AY0+HUD);                    // top
  ctx.moveTo(AX0,AY1+HUD); ctx.lineTo(AX1,AY1+HUD);                    // bottom
  ctx.moveTo(AX0,AY0+HUD); ctx.lineTo(AX0,AY1+HUD);                    // left
  ctx.moveTo(AX1,AY0+HUD); ctx.lineTo(AX1,GATE_Y0+HUD);               // right (above gate)
  ctx.moveTo(AX1,GATE_Y1+HUD); ctx.lineTo(AX1,AY1+HUD);               // right (below gate)
  ctx.stroke();
  // the gate segment
  if(open){
    const pul=0.55+Math.sin(frame*0.14)*0.35;
    ctx.strokeStyle='rgba(255,214,64,'+pul.toFixed(2)+')'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(AX1,GATE_Y0+HUD); ctx.lineTo(AX1,GATE_Y1+HUD); ctx.stroke();
    // outward arrows
    ctx.fillStyle='rgba(255,214,64,'+pul.toFixed(2)+')';
    const my=(GATE_Y0+GATE_Y1)/2+HUD;
    for(let a=0;a<2;a++){ const ax=AX1+6+a*10; ctx.beginPath(); ctx.moveTo(ax,my-6); ctx.lineTo(ax+7,my); ctx.lineTo(ax,my+6); ctx.closePath(); ctx.fill(); }
    drawLabel('ESCAPE', AX1-2, GATE_Y0+HUD-8, '#ffd76e');
  } else {
    ctx.strokeStyle='rgba(120,120,140,.8)'; ctx.lineWidth=4;
    for(let y=GATE_Y0; y<GATE_Y1; y+=7){ ctx.beginPath(); ctx.moveTo(AX1-3,y+HUD); ctx.lineTo(AX1+3,y+3+HUD); ctx.stroke(); }
    drawLabel('SEALED', AX1-2, GATE_Y0+HUD-8, '#8a8fa5');
  }
  // central block
  const bg=ctx.createLinearGradient(0,BY0+HUD,0,BY1+HUD);
  bg.addColorStop(0,'#3a3550'); bg.addColorStop(1,'#211d34');
  ctx.fillStyle=bg; rr(ctx,BX0,BY0+HUD,BX1-BX0,BY1-BY0,5); ctx.fill();
  ctx.strokeStyle='rgba(150,160,220,.5)'; ctx.lineWidth=1.6; rr(ctx,BX0,BY0+HUD,BX1-BX0,BY1-BY0,5); ctx.stroke();
  ctx.fillStyle='rgba(150,160,220,.18)';
  ctx.fillRect(BX0+8,BY0+8+HUD,6,6); ctx.fillRect(BX1-14,BY0+8+HUD,6,6);
  ctx.fillRect(BX0+8,BY1-14+HUD,6,6); ctx.fillRect(BX1-14,BY1-14+HUD,6,6);
}
function drawShipSprite(){
  const x=ship.x, y=ship.y+HUD;
  ctx.save(); ctx.translate(x,y); ctx.rotate(ship.ang);
  if(PL.iframes>0 && (frame>>2)%2) ctx.globalAlpha=0.4;
  const hg=ctx.createLinearGradient(0,-12,0,10);
  hg.addColorStop(0,'#dfe6ff'); hg.addColorStop(1,'#7a8ac0');
  ctx.fillStyle=hg;
  ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(8,10); ctx.lineTo(0,5); ctx.lineTo(-8,10); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(20,20,40,.6)'; ctx.lineWidth=1.4; ctx.stroke();
  if(dirHeld().y<0){
    const fl=6+Math.random()*6;
    ctx.fillStyle='rgba(255,170,80,.85)';
    ctx.beginPath(); ctx.moveTo(-4,9); ctx.lineTo(0,9+fl); ctx.lineTo(4,9); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawEnemy(e){
  const x=e.x, y=e.y+HUD;
  ctx.save(); ctx.translate(x,y); ctx.rotate(e.ang+Math.PI/2);
  const g=ctx.createLinearGradient(0,-10,0,10);
  g.addColorStop(0,'#ff9a6a'); g.addColorStop(1,'#a83820');
  ctx.fillStyle=g; ctx.strokeStyle='rgba(30,10,6,.6)'; ctx.lineWidth=1.4;
  // angular death-ship: two swept wings
  ctx.beginPath();
  ctx.moveTo(0,-11); ctx.lineTo(10,8); ctx.lineTo(3,4); ctx.lineTo(0,9); ctx.lineTo(-3,4); ctx.lineTo(-10,8);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  const pul=0.6+Math.sin(frame*0.2+e.id)*0.4;
  ctx.fillStyle='rgba(255,230,120,'+pul.toFixed(2)+')';
  ctx.beginPath(); ctx.arc(0,-2,2.2,0,7); ctx.fill();
  ctx.restore();
}
function drawBomb(bm){
  const x=bm.x, y=bm.y+HUD;
  const secs=Math.ceil(bm.t/60);
  const urgent=bm.t<180;
  const blink=urgent && (frame>>2)%2;
  const pul=0.5+Math.sin(frame*0.2)*0.3;
  const gl=ctx.createRadialGradient(x,y,1,x,y,BOMB_R+8);
  gl.addColorStop(0,(urgent?'rgba(255,90,60,':'rgba(255,180,80,')+(pul*0.5).toFixed(2)+')');
  gl.addColorStop(1,'rgba(255,120,60,0)');
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(x,y,BOMB_R+8,0,7); ctx.fill();
  ctx.fillStyle= blink? '#ff5a3c' : '#2a2028';
  ctx.beginPath(); ctx.arc(x,y,BOMB_R,0,7); ctx.fill();
  ctx.strokeStyle= urgent? '#ff5a3c':'#ffb347'; ctx.lineWidth=2; ctx.stroke();
  // fuse spikes
  for(let i=0;i<8;i++){ const a=i/8*6.28; ctx.beginPath(); ctx.moveTo(x+Math.cos(a)*BOMB_R,y+Math.sin(a)*BOMB_R); ctx.lineTo(x+Math.cos(a)*(BOMB_R+3),y+Math.sin(a)*(BOMB_R+3)); ctx.stroke(); }
  // countdown number
  ctx.font='bold 11px '+FONT; ctx.textAlign='center'; ctx.fillStyle= urgent?'#ffdede':'#ffe9a0';
  ctx.fillText(secs, x, y+4);
}
function drawSalvage(p){
  const x=p.x, y=p.y+HUD;
  const col=p.type==='wood'?'#96713d':p.type==='stone'?'#9a9488':'#ffd23e';
  const gl=ctx.createRadialGradient(x,y,1,x,y,10);
  gl.addColorStop(0,col+'aa'); gl.addColorStop(1,col+'00');
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(x,y,10,0,7); ctx.fill();
  ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,y,3.6,0,7); ctx.fill();
}
function drawBar(){
  const hg=ctx.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#141a2e'); hg.addColorStop(1,'#0a0d1a');
  ctx.fillStyle=hg; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle='rgba(138,180,255,.3)'; ctx.fillRect(0,HUD-2,RW,2);
  for(let i=0;i<PL.maxhp/2;i++){
    const hx=16+i*19, hy=13, full=PL.hp>=(i+1)*2, half=PL.hp===i*2+1;
    drawHeartShape(hx,hy,7, full||half? '#ff4a5a':'#3a2a2c');
  }
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#c8ddff';
  ctx.fillText('OMEGA RUN', RW/2, 22);
  ctx.font='11px '+FONT; ctx.fillStyle='#98a0c0';
  const hint = !everCollected
    ? 'Bounce the walls · shoot enemies for salvage · SHOOT a bomb to shove it into them'
    : (gateOpen()? 'GATE OPEN — fly the yellow gap (right wall) to go home · or hunt more'
                 : 'wave '+level+' · enemies '+enemies.length+' · score '+score+'/'+SCORE_GATE+' to open the gate');
  ctx.fillText(hint, RW/2, 38);
  ctx.textAlign='right'; ctx.font='10px '+FONT; ctx.fillStyle='#8a957e';
  ctx.fillText('SCORE '+score+'  ·  W'+res.wood+' S'+res.stone+' G'+res.gold, RW-16, 20);
  ctx.fillStyle= gateOpen()? '#ffd76e':'#8a8fa5';
  ctx.fillText(gateOpen()? 'GATE OPEN' : 'GATE SEALED', RW-16, 34);
}
function draw(){
  const g=ctx;
  g.fillStyle='#03040a'; g.fillRect(0,HUD,RW,RH);
  for(let i=0;i<60;i++){
    const hv=hash2(i*13,i*7);
    g.fillStyle='rgba(200,210,255,'+(0.04+hv*0.06).toFixed(3)+')';
    g.beginPath(); g.arc(hv*RW, HUD+hash2(i,5)*RH, 1+hv, 0, 7); g.fill();
  }
  drawArena();
  for(const s of salvage) drawSalvage(s);
  for(const bm of bombs) drawBomb(bm);
  for(const e of enemies) drawEnemy(e);
  for(const b of bullets){ g.fillStyle='#ffe9a0'; g.beginPath(); g.arc(b.x,b.y+HUD,2.2,0,7); g.fill(); }
  for(const b of ebullets){ g.fillStyle='#ff7a6a'; g.beginPath(); g.arc(b.x,b.y+HUD,2.4,0,7); g.fill(); }
  drawShipSprite();
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.life--;
    if(p.life<=0){ particles.splice(i,1); continue; }
    g.globalAlpha=Math.min(1,p.life/15)*0.85; g.fillStyle=p.color;
    g.beginPath(); g.arc(p.x,p.y+HUD,2,0,7); g.fill(); g.globalAlpha=1;
  }
  g.font='bold 12px '+FONT; g.textAlign='center'; g.lineJoin='round';
  for(let i=floats.length-1;i>=0;i--){
    const f=floats[i]; f.y-=0.4; f.life--;
    if(f.life<=0){ floats.splice(i,1); continue; }
    g.globalAlpha=Math.min(1,f.life/20);
    g.lineWidth=3; g.strokeStyle='rgba(4,4,10,.85)'; g.strokeText(f.text,f.x,f.y+HUD);
    g.fillStyle=f.color||'#fff'; g.fillText(f.text,f.x,f.y+HUD); g.globalAlpha=1;
  }
  if(flash>0){ g.fillStyle='rgba(255,220,160,'+(flash/9*0.4).toFixed(2)+')'; g.fillRect(0,HUD,RW,RH); }
  drawBar();
  if(introT>0 && (frame>>3)%2){
    ctx.font='bold 20px '+FONT; ctx.textAlign='center'; ctx.fillStyle='#c8ddff';
    ctx.fillText('ENGINES ONLINE', RW/2, HUD+RH/2);
  }
}

window.AsteroidsLayer={
  enter(){
    savedPos={x:PL.x, y:PL.y};
    ship={x:ACX, y:AY1-30, vx:0, vy:0, ang:0};
    bullets=[]; ebullets=[]; enemies=[]; bombs=[]; salvage=[];
    level=1; score=0; fireCooldown=0; introT=60; exitLatch=false;
    banished=false; waveTimer=0; flash=0; everCollected=false;
    PL.iframes=60;
    spawnWave();
    toast('Ancient engines flicker to life. ARROWS fly & bounce, SPACE fire. Herd the bombs into them.');
  },
  exitDone(){
    if(savedPos){ PL.x=savedPos.x-50; PL.y=savedPos.y; }
    PL.iframes=45;
  },
  update, draw
};

})();
