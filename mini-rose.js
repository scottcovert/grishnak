"use strict";
/* ============================================================
   GRISHNAK — THE ROSE WINDOW  (The OA tribute)
   A chapel with no enemies, standing in three dimensions at once.
   Kneel at the altar to leave your body: a starfield, a choice —
   go back, or go on. "Going on" wakes you in the SAME chapel in
   the next dimension: same bones, different truth. One candle is
   reachable in each dimension; light all three across realities.
   The Five Movements are learned across the whole game family —
   including one that can only be learned inside a DIFFERENT GAME
   (Covert's Revenge — the First Dimension — via shared memory).
   Perform all five at the lit altar with perfect feeling, and the
   window opens: you travel to the First Dimension for real.
   Dimension 3 renders as the game's own wireframe — the place the
   game is made from. Something in dimension 2 watches the HUD.
   ============================================================ */
(function(){

const SPD=2.2;
const ENTRY={x:9.5*32+16, y:10*32+4};
const ALTAR={x:9.5*32+16, y:3*32+16};
const CANDLE_POS=[{x:3*32+16,y:2*32+16},{x:16*32+16,y:2*32+16},{x:9.5*32+16,y:8*32+16}];

/* three layouts of the same chapel — pews shift between dimensions,
   opening exactly one candle's aisle per reality */
const DIMS=[
{ // D1 — candlelight
  pal:{bg:'#161018', wall:'#5e5078', floor:'#191220', glow:'#ffb56e', text:'#e8c8a8', win:['#e05070','#ffb56e','#e8c15a']},
  map:[
  "####################",
  "#..................#",
  "#..................#",
  "#....##......##....#",
  "#..................#",
  "#.####.#PP#.####...#",
  "#..................#",
  "#.PPPP.#..#.PPPP...#",
  "#......#..#........#",
  "#.PPPP......PPPP...#",
  "#..................#",
  "####################"]},
{ // D2 — moonlight
  pal:{bg:'#0c1220', wall:'#4a6292', floor:'#0d1422', glow:'#8ab4ff', text:'#b8ccf0', win:['#5070e0','#8ab4ff','#bfeffc']},
  map:[
  "####################",
  "#..................#",
  "#..................#",
  "#....##......##....#",
  "#..................#",
  "#...####.PP.####.#.#",
  "#..................#",
  "#...PPPP.#..#.PPPP.#",
  "#........#..#......#",
  "#...PPPP......PPPP.#",
  "#..................#",
  "####################"]},
{ // D3 — the wireframe (where the game is made)
  pal:{bg:'#060608', wall:'#1a3a1a', floor:'#0a0e0a', glow:'#7fdb7f', text:'#7fdb7f', win:['#2a6a2a','#7fdb7f','#bfffbf']},
  map:[
  "####################",
  "#..................#",
  "#..................#",
  "#....##......##....#",
  "#..................#",
  "#.####.####.####...#",
  "#..................#",
  "#.PP.P.#..#.P.PP...#",
  "#......#..#........#",
  "#.PP.P......P.PP...#",
  "#..................#",
  "####################"]}
];

const MOVES=[
  {name:'The Circle',  keys:['U','L','D','R'],     src:()=>!!flags.stonePawn,   hint:'sleeps where stone pawns finished an ancient game'},
  {name:'The Breath',  keys:['U','U','D','D'],     src:()=>!!flags.chessDone,   hint:'sleeps where a frozen King finally fell'},
  {name:'The Water',   keys:['L','R','L','R','U'], src:()=>!!flags.kt_sky,      hint:'sleeps with the sky-colored key beneath the earth'},
  {name:'The Burial',  keys:['D','D','U'],         src:()=>!!flags.wardstone,   hint:'sleeps at the end of the drowned Archive\'s tale'},
  {name:'The Climb',   keys:['R','U','L','U'],     src:()=>{ try{ return !!localStorage.getItem('cr_treasure'); }catch(e){ return false; } },
                                                    hint:'sleeps in the First Dimension — the game before this one'}
];

let dim=0, px=ENTRY.x, py=ENTRY.y, mode='walk';
let lit=[false,false,false];
let ndeSel=0, spaceLatch=false;
let perfIdx=0, perfPos=0, feeling=100, lastInput=0, arrowLatch={};
let departT=0, savedPos=null;
let oldNightT=0, oldNightLine='';
const OLD_NIGHT=[ 'WHO LIT THE SECOND CANDLE', 'I CAN SEE YOU THROUGH THE GLASS',
  'YOU HAVE DIED BEFORE. YOU WERE BRAVE', 'THE WINDOW IS NOT A WINDOW', 'KEEP GOING' ];

function grid(){ return DIMS[dim].map; }
function solidAt(x,y){
  const c=Math.floor(x/32), r=Math.floor(y/32);
  if(r<0||r>=12||c<0||c>=20) return true;
  const ch=grid()[r][c];
  return ch==='#'||ch==='P';
}
function boxFree(x,y){ return !solidAt(x-6,y-4)&&!solidAt(x+6,y-4)&&!solidAt(x-6,y+6)&&!solidAt(x+6,y+6); }
function knownCount(){ return MOVES.filter(m=>m.src()).length; }
function allCandles(){ return lit.every(Boolean); }
function ready(){ return knownCount()===5 && allCandles(); }

/* ---------------- UPDATE ---------------- */
function update(){
  if(mode==='walk') updateWalk();
  else if(mode==='nde') updateNDE();
  else if(mode==='perform') updatePerform();
  else if(mode==='depart'){
    departT++;
    if(departT===90){
      try{ localStorage.setItem('rose_jump','1'); }catch(e){}
      location.href='/newgame.html';
    }
  }
  // Old Night stirs only in dimension 2
  if(dim===1 && mode==='walk'){
    if(oldNightT>0) oldNightT--;
    else if(Math.random()<0.0012){ oldNightLine=OLD_NIGHT[Math.floor(Math.random()*OLD_NIGHT.length)]; oldNightT=210; sfx.boss(); }
  } else oldNightT=0;
}
function updateWalk(){
  const d=dirHeld();
  const dn=Math.hypot(d.x,d.y)||1;
  if(d.x||d.y){
    const nx=px+(d.x/dn)*SPD, ny=py+(d.y/dn)*SPD;
    if(boxFree(nx,py)) px=nx;
    if(boxFree(px,ny)) py=ny;
    PL.fx=d.x||PL.fx; PL.fy=d.y||PL.fy; PL.walkT+=0.22;
  } else PL.walkT=0;
  PL.x=px; PL.y=py;

  const space=held[' '];
  if(space && !spaceLatch){
    spaceLatch=true;
    // exit at the entrance
    if(Math.hypot(px-ENTRY.x,py-ENTRY.y)<40){ startRoseTrans('out'); return; }
    // candle of THIS dimension
    const c=CANDLE_POS[dim];
    if(!lit[dim] && Math.hypot(px-c.x,py-c.y)<34){
      lit[dim]=true; puff(c.x,c.y+HUD,DIMS[dim].pal.glow,12); sfx.heart();
      toast('A candle lit in dimension '+(dim+1)+' — '+lit.filter(Boolean).length+' of 3 flames burn across realities.');
      return;
    }
    // altar
    if(Math.hypot(px-ALTAR.x,py-ALTAR.y)<40){
      if(ready()){ mode='perform'; perfIdx=0; perfPos=0; feeling=100; lastInput=frame; toast('Begin. Smoothly — the feeling matters more than the speed.'); sfx.start(); }
      else { mode='nde'; ndeSel=0; sfx.boss(); }
      return;
    }
  }
  if(!space) spaceLatch=false;
}
function updateNDE(){
  const d=dirHeld();
  if(d.x<0) ndeSel=0; else if(d.x>0) ndeSel=1;
  const space=held[' '];
  if(space && !spaceLatch){
    spaceLatch=true;
    if(ndeSel===0){ mode='walk'; toast('You return to your body.'); }
    else {
      dim=(dim+1)%3;
      px=ENTRY.x; py=ENTRY.y; mode='walk';
      sfx.win();
      toast(dim===2? 'You wake where the game is MADE.' : 'You wake in the same chapel. It is not the same chapel.');
      if(dim===2) setTimeout(()=>{},0);
    }
  }
  if(!space) spaceLatch=false;
}
function arrowPressed(){
  const map={ArrowUp:'U',ArrowDown:'D',ArrowLeft:'L',ArrowRight:'R',w:'U',s:'D',a:'L',d:'R',W:'U',S:'D',A:'L',D:'R'};
  for(const k in map){
    if(held[k] && !arrowLatch[k]){ arrowLatch[k]=true; return map[k]; }
    if(!held[k]) arrowLatch[k]=false;
  }
  return null;
}
function updatePerform(){
  // feeling drains during hesitation
  if(frame-lastInput>45) feeling-=0.35;
  if(feeling<=0){
    mode='walk'; toast('The feeling faltered. Breathe. Begin again.'); sfx.denied();
    return;
  }
  const a=arrowPressed();
  if(!a) return;
  lastInput=frame;
  const mv=MOVES[perfIdx];
  if(a===mv.keys[perfPos]){
    perfPos++;
    sfx.pick();
    puff(px+(Math.random()*40-20),py+HUD-20,DIMS[dim].pal.glow,3);
    if(perfPos>=mv.keys.length){
      perfIdx++; perfPos=0;
      addFloat(ALTAR.x,ALTAR.y-30,mv.name,'#ffffff');
      sfx.task();
      if(perfIdx>=MOVES.length){
        mode='depart'; departT=0;
        flags.roseDone=true;
        res.gold=Math.min(999,res.gold+100);
        toast('The window opens. You are travelling.');
        sfx.win(); saveGame();
      }
    }
  } else {
    perfPos=0; feeling-=8;
    sfx.denied();
  }
}

/* ---------------- DRAW ---------------- */
function drawChapel(){
  const P=DIMS[dim].pal, g=grid();
  ctx.fillStyle=P.bg; ctx.fillRect(0,HUD,RW,RH);
  for(let r=0;r<12;r++) for(let c=0;c<20;c++){
    const ch=g[r][c], x=c*32, y=r*32+HUD;
    if(dim===2){
      // wireframe dimension: the game shows its bones
      ctx.strokeStyle='rgba(127,219,127,.25)'; ctx.lineWidth=0.7; ctx.strokeRect(x+0.5,y+0.5,31,31);
      if(ch==='#'||ch==='P'){
        ctx.strokeStyle='#7fdb7f'; ctx.lineWidth=1.2; ctx.strokeRect(x+2,y+2,28,28);
        ctx.font='10px monospace'; ctx.fillStyle='rgba(160,255,160,.85)'; ctx.textAlign='center';
        ctx.fillText(ch, x+16, y+19);
      }
    } else {
      if(ch==='#'){
        const wg=ctx.createLinearGradient(x,y,x,y+32);
        wg.addColorStop(0,P.wall); wg.addColorStop(1,shade(P.wall,0.65));
        ctx.fillStyle=wg; ctx.fillRect(x,y,32,32);
        ctx.strokeStyle='rgba(0,0,0,.3)'; ctx.strokeRect(x+0.5,y+0.5,31,31);
      } else if(ch==='P'){
        ctx.fillStyle=P.floor; ctx.fillRect(x,y,32,32);
        const pg=ctx.createLinearGradient(x,y+8,x,y+26);
        pg.addColorStop(0,shade(P.wall,1.15)); pg.addColorStop(1,shade(P.wall,0.75));
        ctx.fillStyle=pg; rr(ctx,x+2,y+8,28,18,3); ctx.fill();
        ctx.strokeStyle='rgba(0,0,0,.4)'; rr(ctx,x+2,y+8,28,18,3); ctx.stroke();
      } else {
        ctx.fillStyle=(r+c)%2? P.floor : shade(P.floor,1.12);
        ctx.fillRect(x,y,32,32);
      }
    }
  }
}
function drawWindow(){
  const P=DIMS[dim].pal;
  const x=ALTAR.x, y=HUD+34, R=26;
  const known=knownCount();
  ctx.save();
  ctx.translate(x,y);
  if(dim===2){ ctx.strokeStyle='#7fdb7f'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(0,0,R,0,7); ctx.stroke(); }
  else {
    const gl=ctx.createRadialGradient(0,0,2,0,0,R+14);
    gl.addColorStop(0,P.win[2]+'66'); gl.addColorStop(1,P.win[0]+'00');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,R+14,0,7); ctx.fill();
    ctx.strokeStyle=shade(P.wall,0.7); ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(0,0,R,0,7); ctx.stroke();
  }
  for(let i=0;i<5;i++){
    const a=-Math.PI/2 + i*(Math.PI*2/5);
    const litP=i<known;
    ctx.rotate(0);
    ctx.fillStyle= litP? P.win[1] : 'rgba(120,120,140,.25)';
    ctx.beginPath();
    ctx.ellipse(Math.cos(a)*13, Math.sin(a)*13, 6, 10, a+Math.PI/2, 0, 7);
    ctx.fill();
    if(litP && dim!==2){ ctx.strokeStyle=P.win[2]; ctx.lineWidth=1; ctx.stroke(); }
  }
  ctx.fillStyle= known===5? P.win[2] : 'rgba(160,160,180,.4)';
  ctx.beginPath(); ctx.arc(0,0,4.5,0,7); ctx.fill();
  ctx.restore();
}
function drawAltar(){
  const P=DIMS[dim].pal, x=ALTAR.x, y=ALTAR.y+HUD;
  if(dim===2){
    ctx.strokeStyle='#7fdb7f'; ctx.lineWidth=1.4; ctx.strokeRect(x-16,y-10,32,18);
    ctx.font='8px monospace'; ctx.fillStyle='#7fdb7f'; ctx.textAlign='center'; ctx.fillText('ALTAR{}', x, y+1);
  } else {
    const ag=ctx.createLinearGradient(x,y-12,x,y+8);
    ag.addColorStop(0,shade(P.wall,1.3)); ag.addColorStop(1,shade(P.wall,0.8));
    ctx.fillStyle=ag; rr(ctx,x-16,y-10,32,18,3); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.4)'; rr(ctx,x-16,y-10,32,18,3); ctx.stroke();
    ctx.fillStyle=P.glow+'55'; ctx.beginPath(); ctx.ellipse(x,y-12,10,4,0,0,7); ctx.fill();
  }
  if(Math.hypot(px-ALTAR.x,py-ALTAR.y)<44){
    drawLabel(ready()? '[SPACE] perform the Five Movements' : '[SPACE] kneel — leave your body', x, y-26, '#ffffff');
  }
}
function drawCandles(){
  const P=DIMS[dim].pal;
  for(let i=0;i<3;i++){
    const c=CANDLE_POS[i];
    const here=i===dim;
    const x=c.x, y=c.y+HUD;
    if(!here && !lit[i]) continue;              // unlit candles of other dimensions are invisible
    ctx.globalAlpha= here? 1 : 0.35;            // lit ones from elsewhere show as ghosts
    ctx.fillStyle= dim===2? '#7fdb7f' : '#e8e0d0';
    ctx.fillRect(x-3,y-10,6,14);
    if(lit[i]){
      const fh=7+Math.sin(frame*0.3+i)*2.5;
      const gl=ctx.createRadialGradient(x,y-14,1,x,y-14,fh+6);
      gl.addColorStop(0,P.glow); gl.addColorStop(1,P.glow+'00');
      ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(x,y-14,fh+6,0,7); ctx.fill();
      ctx.fillStyle='#ffe9a0'; ctx.beginPath();
      ctx.moveTo(x-3,y-11); ctx.quadraticCurveTo(x,y-11-fh,x+3,y-11); ctx.quadraticCurveTo(x,y-13,x-3,y-11); ctx.fill();
    }
    ctx.globalAlpha=1;
    if(here && !lit[i] && Math.hypot(px-c.x,py-c.y)<40) drawLabel('[SPACE] light it', x, y-26, '#ffe9a0');
  }
}
function drawEditorCursor(){
  if(dim!==2) return;
  const t=frame*0.008;
  const cx=320+Math.sin(t*1.7)*220, cy=HUD+180+Math.cos(t*2.3)*120;
  ctx.strokeStyle='#bfffbf'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy+11); ctx.lineTo(cx+3,cy+8); ctx.lineTo(cx+5,cy+13); ctx.lineTo(cx+7,cy+12); ctx.lineTo(cx+5,cy+7); ctx.lineTo(cx+9,cy+7); ctx.closePath(); ctx.stroke();
  if((frame>>6)%5===0){
    ctx.font='10px monospace'; ctx.fillStyle='rgba(191,255,191,.85)'; ctx.textAlign='left';
    ctx.fillText('// he is standing right there', cx+14, cy+6);
  }
}
function drawNDE(){
  ctx.fillStyle='rgba(2,2,8,.94)'; ctx.fillRect(0,0,RW,RH+HUD);
  for(let i=0;i<90;i++){
    const hv=hash2(i*7,i*13);
    const tw=0.3+Math.sin(frame*0.03+i)*0.3;
    ctx.fillStyle='rgba(220,225,255,'+(hv*tw).toFixed(2)+')';
    ctx.beginPath(); ctx.arc(hv*RW, hash2(i,5)*(RH+HUD), 0.8+hv, 0, 7); ctx.fill();
  }
  const y=170;
  ctx.font='16px '+FONT; ctx.textAlign='center'; ctx.fillStyle='#d8dcff';
  ctx.fillText('You are out of your body.', RW/2, y-46);
  ctx.font='13px '+FONT; ctx.fillStyle='#a8b0d8';
  ctx.fillText('A presence, warm and enormous, waits without hurrying you.', RW/2, y-24);
  ctx.font='bold 15px '+FONT;
  ctx.fillStyle= ndeSel===0? '#ffe9a0':'#666a80'; ctx.fillText('go back', RW/2-80, y+26);
  ctx.fillStyle= ndeSel===1? '#ffe9a0':'#666a80'; ctx.fillText('go on', RW/2+80, y+26);
  ctx.font='11px '+FONT; ctx.fillStyle='#8a90b0';
  ctx.fillText('LEFT / RIGHT to choose · SPACE to accept', RW/2, y+56);
}
function drawPerform(){
  ctx.fillStyle='rgba(4,4,12,.55)'; ctx.fillRect(0,HUD,RW,RH);
  const mv=MOVES[perfIdx];
  ctx.font='bold 17px '+FONT; ctx.textAlign='center'; ctx.fillStyle='#ffffff';
  ctx.fillText('Movement '+(perfIdx+1)+' of 5 — '+mv.name, RW/2, HUD+120);
  const AR={U:'↑',D:'↓',L:'←',R:'→'};
  ctx.font='bold 30px '+FONT;
  const w=44, x0=RW/2-(mv.keys.length-1)*w/2;
  mv.keys.forEach((k,i)=>{
    ctx.fillStyle= i<perfPos? DIMS[dim].pal.glow : i===perfPos? '#ffffff' : 'rgba(160,160,180,.35)';
    ctx.fillText(AR[k], x0+i*w, HUD+170);
  });
  const bw=200, bx=RW/2-bw/2;
  ctx.fillStyle='rgba(255,255,255,.12)'; rr(ctx,bx,HUD+200,bw,10,5); ctx.fill();
  ctx.fillStyle= feeling>50? '#e070ff' : '#ff7a5a';
  rr(ctx,bx,HUD+200,bw*(feeling/100),10,5); ctx.fill();
  ctx.font='11px '+FONT; ctx.fillStyle='#c8b8e0';
  ctx.fillText('FEELING', RW/2, HUD+226);
}
function drawDepart(){
  const t=departT/90;
  ctx.fillStyle='rgba(255,255,255,'+Math.min(1,t*1.2).toFixed(2)+')';
  ctx.fillRect(0,0,RW,RH+HUD);
  if(t>0.3){
    ctx.fillStyle='rgba(40,30,60,'+Math.min(1,(t-0.3)).toFixed(2)+')';
    ctx.font='bold 16px '+FONT; ctx.textAlign='center';
    ctx.fillText('travelling to the First Dimension...', RW/2, 200);
  }
}
function drawBar(){
  const P=DIMS[dim].pal;
  const hg=ctx.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,shade(P.bg,1.25)); hg.addColorStop(1,P.bg);
  ctx.fillStyle=hg; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle=P.glow+'44'; ctx.fillRect(0,HUD-2,RW,2);
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle=P.text;
  ctx.fillText('THE ROSE WINDOW', RW/2, 20);
  ctx.font='10px '+FONT;
  if(oldNightT>0){
    // Old Night possesses the status line
    const flick=(frame>>2)%7!==0;
    ctx.fillStyle='#e070ff';
    ctx.fillText(flick? oldNightLine : '', RW/2, 38);
  } else {
    ctx.fillStyle=shade(P.text,0.8);
    const known=knownCount();
    let line='DIMENSION '+(dim+1)+' of 3 · movements '+known+'/5 · flames '+lit.filter(Boolean).length+'/3';
    if(known<5){
      const missing=MOVES.find(m=>!m.src());
      if((frame>>8)%2) line='a movement '+missing.hint;
    }
    ctx.fillText(line, RW/2, 38);
  }
  ctx.textAlign='left'; ctx.font='10px '+FONT; ctx.fillStyle=shade(P.text,0.65);
  ctx.fillText(dim===2? '// this is where it is made' : '', 10, 38);
}
function draw(){
  drawChapel();
  drawWindow();
  drawAltar();
  drawCandles();
  drawEditorCursor();
  // exit glow at entrance
  const P=DIMS[dim].pal;
  const pul=0.5+Math.sin(frame*0.08)*0.25;
  ctx.strokeStyle='rgba(232,193,90,'+pul.toFixed(2)+')'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.ellipse(ENTRY.x,ENTRY.y+HUD+8,15,6,0,0,7); ctx.stroke();
  if(Math.hypot(px-ENTRY.x,py-ENTRY.y)<42) drawLabel('[SPACE] return to the valley', ENTRY.x, ENTRY.y+HUD-18, '#ffe9a0');
  drawPlayerSprite();
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.03; p.life--;
    if(p.life<=0){ particles.splice(i,1); continue; }
    ctx.globalAlpha=Math.min(1,p.life/15)*0.85; ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y+HUD,2,0,7); ctx.fill(); ctx.globalAlpha=1;
  }
  ctx.font='bold 12px '+FONT; ctx.textAlign='center'; ctx.lineJoin='round';
  for(let i=floats.length-1;i>=0;i--){
    const f=floats[i]; f.y-=0.4; f.life--;
    if(f.life<=0){ floats.splice(i,1); continue; }
    ctx.globalAlpha=Math.min(1,f.life/20);
    ctx.lineWidth=3; ctx.strokeStyle='rgba(6,6,14,.85)'; ctx.strokeText(f.text,f.x,f.y+HUD);
    ctx.fillStyle=f.color||'#fff'; ctx.fillText(f.text,f.x,f.y+HUD); ctx.globalAlpha=1;
  }
  drawBar();
  if(mode==='nde') drawNDE();
  else if(mode==='perform') drawPerform();
  else if(mode==='depart') drawDepart();
}

/* ---------------- API ---------------- */
window.RoseLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    dim=0; px=ENTRY.x; py=ENTRY.y; mode='walk'; lit=[false,false,false];
    spaceLatch=true; arrowLatch={}; oldNightT=0; departT=0;
    PL.x=px; PL.y=py; PL.swing=0; PL.iframes=0; PL.kb.x=0; PL.kb.y=0;
    toast(knownCount()===5? 'The chapel knows every movement you carry. Light the flames.' :
      'No enemies here. Only a window, an altar, and everything you have not learned yet.');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; } else loadScreen(1);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw
};

})();
