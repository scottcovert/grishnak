"use strict";
/* ============================================================
   GRISHNAK — CHESS BLITZ (chess-threat puzzle room)
   A full-screen 20x12 board with irregular petrified walls.
   Enemy pieces stand frozen but project visible threat lanes
   along their legal chess moves — lanes respect occlusion (walls,
   pieces, and YOUR placed pawns all block sight). Linger in a
   lane and the piece actually charges down it; dodge and it lies
   spent — the only moment it can be captured. The King cannot be
   touched while any other piece's lane defends his square: win by
   position, not damage. Ally pawns = deeds echoed from the rest
   of Grishnak (Battlefield relic + arcade-room completions).
   ============================================================ */
(function(){

const PSPD=2.6;
const TELEGRAPH=66, CHARGE_SPD=3.8, REST_T=150, KNIGHT_REST=115;   // slower + longer warning while Scott learns it
const ENTRY={r:10,c:1};

//CHESSMAP-START  ('#' petrified wall, '.' open board)
const BOARD_ROWS=[
"####################",
"#........#.....#...#",
"#.##.....#.........#",
"#..........####..#.#",
"#....##..........#.#",
"#..........##.....##",
"#..##..#...........#",
"#..........##......#",
"#....#.............#",
"#.........#....##..#",
"#..................#",
"####################"
];
//CHESSMAP-END

/* enemy set — king pocket top-right, layered defense */
const PIECE_DEF=[
  {type:'rook',   r:3,  c:3},
  {type:'rook',   r:2,  c:11},   // guards the King along the top row
  {type:'bishop', r:5,  c:14},   // guards the King up the diagonal
  {type:'bishop', r:8,  c:3},
  {type:'queen',  r:5,  c:8},
  {type:'knight', r:8,  c:15},
  {type:'king',   r:2,  c:17}
];
const PIECE_COL={rook:'#ff8a6a', bishop:'#8ab4ff', queen:'#e070ff', knight:'#7ac74f', king:'#ffd76e'};

let bgrid=[], pieces=[], pawns=[];       // pawns: placed {r,c}
let PR=ENTRY.r, PC=ENTRY.c, PT=0, PDIR={x:0,y:0}, bufferedDir=null, bufTTL=0;
let pawnsHeld=0, lives=3, over=false, won=false, doneT=0;
let threat=new Map();                    // 'r,c' -> [pieceIdx,...]
let savedPos=null, spaceLatch=false;

function key(r,c){ return r+','+c; }
function open(r,c){ return r>=0&&r<ROWS&&c>=0&&c<COLS&&bgrid[r][c]!=='#'; }
function occupied(r,c){
  if(pawns.some(p=>p.r===r&&p.c===c)) return 'pawn';
  const pi=pieces.findIndex(p=>p.alive&&p.r===r&&p.c===c);
  return pi>=0? pi : null;
}

function allyPawnCount(){
  let n=1;                                  // one loyal pawn always
  if(flags.stonePawn) n++;                  // Petrified Battlefield relic
  if(flags.sentinelDone) n++;               // deeds echo as allies
  if(flags.robotronDone) n++;
  if(flags.squirrelDone) n++;
  return n;
}
function allySources(){
  const s=['1 loyal pawn'];
  if(flags.stonePawn) s.push('battlefield relic');
  if(flags.sentinelDone) s.push("sentinel's deed");
  if(flags.robotronDone) s.push('rescue-grid deed');
  if(flags.squirrelDone) s.push('EVA deed');
  return s;
}

/* ---------------- THREAT MAP (chess-true occlusion) ---------------- */
const DIRS={
  rook:[[0,1],[0,-1],[1,0],[-1,0]],
  bishop:[[1,1],[1,-1],[-1,1],[-1,-1]],
  queen:[[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]
};
const KNIGHT_J=[[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
function computeThreat(){
  threat=new Map();
  const add=(r,c,i)=>{ const k=key(r,c); if(!threat.has(k)) threat.set(k,[]); threat.get(k).push(i); };
  pieces.forEach((p,i)=>{
    if(!p.alive || p.state!=='home') return;
    if(p.type==='king'){
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        if(!dr&&!dc) continue;
        if(open(p.r+dr,p.c+dc)) add(p.r+dr,p.c+dc,i);
      }
    } else if(p.type==='knight'){
      for(const [dr,dc] of KNIGHT_J) if(open(p.r+dr,p.c+dc)) add(p.r+dr,p.c+dc,i);
    } else {
      for(const [dr,dc] of DIRS[p.type]){
        let r=p.r+dr, c=p.c+dc;
        while(open(r,c)){
          add(r,c,i);
          if(occupied(r,c)!==null) break;   // pawns AND pieces block the ray past themselves
          r+=dr; c+=dc;
        }
      }
    }
  });
}
function kingDefended(){
  const ki=pieces.findIndex(p=>p.type==='king');
  const k=pieces[ki];
  const t=threat.get(key(k.r,k.c))||[];
  return t.some(i=>i!==ki);
}

/* ---------------- PIECE BEHAVIOR ---------------- */
function stepPieces(){
  const meK=key(PR,PC);
  pieces.forEach((p,i)=>{
    if(!p.alive) return;
    if(p.state==='home'){
      if(p.type==='king') return;
      const t=threat.get(meK)||[];
      if(t.includes(i)){
        p.tele++;
        if(p.tele>=TELEGRAPH){
          p.state='charge'; p.px=p.c*T+16; p.py=p.r*T+16;
          if(p.type==='knight'){ p.tr=PR; p.tc=PC; p.hopT=0; }
          else {
            const dr=Math.sign(PR-p.r), dc=Math.sign(PC-p.c);
            p.dr=dr; p.dc=dc;
            // slide destination: as far along the ray as legal (wall/blocker), through the player's square
            let r=p.r, c=p.c;
            while(open(r+dr,c+dc)){
              const occ=occupied(r+dr,c+dc);
              r+=dr; c+=dc;
              if(occ!==null) { r-=dr; c-=dc; break; }
            }
            p.tr=r; p.tc=c;
          }
          sfx.mine();
        }
      } else if(p.tele>0) p.tele=Math.max(0,p.tele-2);
    }
    else if(p.state==='charge'){
      if(p.type==='knight'){
        p.hopT+=0.028;
        const t0={x:p.c*T+16,y:p.r*T+16}, t1={x:p.tc*T+16,y:p.tr*T+16};
        p.px=t0.x+(t1.x-t0.x)*p.hopT; p.py=t0.y+(t1.y-t0.y)*p.hopT - Math.sin(p.hopT*Math.PI)*46;
        if(p.hopT>=1){ p.r=p.tr; p.c=p.tc; landPiece(p); }
      } else {
        const tx=p.tc*T+16, ty=p.tr*T+16;
        const dx=tx-p.px, dy=ty-p.py, d=Math.hypot(dx,dy);
        if(d<=CHARGE_SPD){ p.px=tx; p.py=ty; p.r=p.tr; p.c=p.tc; landPiece(p); }
        else { p.px+=dx/d*CHARGE_SPD; p.py+=dy/d*CHARGE_SPD; }
      }
      // hit check while moving
      if(PL.iframes<=0 && Math.hypot(p.px-PL.x,p.py-PL.y)<17) hitPlayer(p);
    }
    else if(p.state==='rest'){
      p.restT--;
      if(p.restT<=0){ p.state='return'; }
    }
    else if(p.state==='return'){
      const tx=p.home.c*T+16, ty=p.home.r*T+16;
      const dx=tx-p.px, dy=ty-p.py, d=Math.hypot(dx,dy);
      const spd=2.2;
      if(d<=spd){ p.px=tx; p.py=ty; p.r=p.home.r; p.c=p.home.c; p.state='home'; p.tele=0; }
      else { p.px+=dx/d*spd; p.py+=dy/d*spd; }
    }
  });
}
function landPiece(p){
  p.state='rest';
  p.restT= p.type==='knight'? KNIGHT_REST : REST_T;
  puff(p.px,p.py+HUD,PIECE_COL[p.type],8);
  sfx.chop();
}
function hitPlayer(p){
  PL.iframes=70; lives--;
  sfx.hurt(); puff(PL.x,PL.y+HUD,'#ff5a3c',10);
  toast(lives>0? 'Struck by the '+p.type+'! '+lives+' left.' : 'The board claims you...');
  if(lives<=0){ resetBoard(true); }
}
function resetBoard(full){
  pieces=PIECE_DEF.map(d=>({...d, home:{r:d.r,c:d.c}, alive:true, state:'home', tele:0,
    px:d.c*T+16, py:d.r*T+16, restT:0}));
  pawns=[]; pawnsHeld=allyPawnCount();
  PR=ENTRY.r; PC=ENTRY.c; PT=0; PDIR={x:0,y:0}; bufferedDir=null;
  PL.x=PC*T+16; PL.y=PR*T+16; PL.iframes=80;
  if(full){ lives=3; toast('The pieces grind back to their squares. Again.'); }
}

/* ---------------- PLAYER (grid-locked, Digging-Jim blocky) ---------------- */
function stepPlayer(){
  const dh=dirHeld();
  const want=(dh.x||dh.y)? (Math.abs(dh.x)>=Math.abs(dh.y)? {x:Math.sign(dh.x),y:0}:{x:0,y:Math.sign(dh.y)}) : null;
  if(want){ bufferedDir=want; bufTTL=8; }        // short buffer so an early turn still registers
  else if(bufTTL>0) bufTTL--;
  const blocked=(r,c)=>!open(r,c) || pawns.some(p=>p.r===r&&p.c===c);
  // decide the next step: a live-held key, or a very-recent buffered press — else STOP.
  const chooseDir=()=>{
    const cand = want || (bufTTL>0? bufferedDir : null);
    if(cand && !blocked(PR+cand.y,PC+cand.x)) return cand;
    return {x:0,y:0};
  };
  if(PT===0) PDIR=chooseDir();
  if(PDIR.x||PDIR.y){
    PT+=PSPD/T;
    if(PT>=1){
      PR+=PDIR.y; PC+=PDIR.x; PT=0;
      onEnterTile();
      PDIR=chooseDir();                          // keep going only if a key is (still) held
    }
    PL.fx=PDIR.x||PL.fx; PL.fy=PDIR.y||PL.fy; PL.walkT+=0.25;
  } else PL.walkT=0;
  PL.x=(PC+PDIR.x*PT)*T+16; PL.y=(PR+PDIR.y*PT)*T+16;
}
function onEnterTile(){
  // capture resting pieces by stepping onto them; capture the King if undefended
  const occ=occupied(PR,PC);
  if(typeof occ==='number'){
    const p=pieces[occ];
    if(p.type==='king'){
      if(!kingDefended()){
        p.alive=false; winGame();
      } else {
        // shoved back by royal guard magic
        toast('The King is DEFENDED — break every lane that covers him first.');
        sfx.denied();
        PR=Math.max(1,PR+ (PDIR.y? -PDIR.y : 1)); PC=PC-(PDIR.x||0); PT=0; PDIR={x:0,y:0};
        PL.x=PC*T+16; PL.y=PR*T+16;
      }
    } else if(p.state==='rest'){
      p.alive=false;
      toast('The '+p.type+' shatters — captured!');
      puff(PL.x,PL.y+HUD,PIECE_COL[p.type],14);
      res.gold=Math.min(999,res.gold+5); addFloat(PL.x,PL.y-14,'+5 gold','#ffe066');
      sfx.explode?sfx.explode():sfx.boss();
    } else if(p.state==='home' && PL.iframes<=0){
      hitPlayer(p);   // walking into an armed piece hurts
    }
  }
}
function winGame(){
  won=true; over=true; doneT=200;
  const first=!flags.chessDone;
  flags.chessDone=true;
  if(first){ res.gold=Math.min(999,res.gold+60); addFloat(PL.x,PL.y-16,'+60 gold','#ffe066'); }
  toast('CHECKMATE. The Frozen Game thaws — the board is yours.');
  sfx.win(); saveGame();
}

/* ---------------- UPDATE ---------------- */
function update(){
  if(PL.iframes>0) PL.iframes--;
  if(over){ if(doneT>0){ doneT--; if(doneT<=0) startChessTrans('out'); } return; }
  computeThreat();
  stepPlayer();
  stepPieces();

  const space=held[' '];
  if(space && !spaceLatch){
    spaceLatch=true;
    if(PR===ENTRY.r && PC===ENTRY.c){ startChessTrans('out'); }
    else {
      const mine=pawns.findIndex(p=>p.r===PR&&p.c===PC);
      if(mine>=0){ pawns.splice(mine,1); pawnsHeld++; toast('Pawn recalled. ('+pawnsHeld+' in hand)'); sfx.pick(); }
      else if(occupied(PR,PC)===null){
        if(pawnsHeld>0){ pawnsHeld--; pawns.push({r:PR,c:PC}); toast('Pawn planted — it blocks every lane through this square.'); sfx.build(); }
        else { toast('No pawns left in hand. Deeds elsewhere in Grishnak earn more.'); sfx.denied(); }
      }
    }
  }
  if(!space) spaceLatch=false;
}

/* ---------------- DRAW ---------------- */
function drawBoardTile(r,c){
  const x=c*T, y=r*T+HUD;
  if(bgrid[r][c]==='#'){
    // WALL: a bright, raised petrified block — unmistakably solid
    ctx.fillStyle='#726b88'; ctx.fillRect(x,y,T,T);
    ctx.fillStyle='#938bb0'; ctx.fillRect(x,y,T,4); ctx.fillRect(x,y,4,T);      // light top/left bevel
    ctx.fillStyle='#3c3750'; ctx.fillRect(x,y+T-4,T,4); ctx.fillRect(x+T-4,y,4,T); // dark bottom/right bevel
    const g=ctx.createLinearGradient(x,y+4,x,y+T-4);
    g.addColorStop(0,'#615a78'); g.addColorStop(1,'#4a4462');
    ctx.fillStyle=g; ctx.fillRect(x+5,y+5,T-10,T-10);                            // inset face
    ctx.strokeStyle='rgba(15,12,24,.7)'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,T-1,T-1);
  } else {
    // OPEN: a dark, flat, gridded floor — clearly walkable
    ctx.fillStyle=(r+c)%2? '#121020' : '#191630';
    ctx.fillRect(x,y,T,T);
    ctx.strokeStyle='rgba(130,120,175,.12)'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,T-1,T-1);
  }
}
function drawThreat(){
  const meK=key(PR,PC);
  for(const [k,list] of threat){
    const [r,c]=k.split(',').map(Number);
    const x=c*T, y=r*T+HUD;
    const isMe=k===meK;
    const col=PIECE_COL[pieces[list[0]].type];
    if(isMe){
      const p=0.35+Math.sin(frame*0.3)*0.2;
      ctx.fillStyle='rgba(255,60,40,'+p.toFixed(2)+')';
      ctx.fillRect(x+1,y+1,T-2,T-2);
    } else {
      ctx.fillStyle=col+'22';
      ctx.fillRect(x+2,y+2,T-4,T-4);
    }
  }
  if(threat.has(meK)){
    const p=(frame>>3)%2;
    if(p){ ctx.font='bold 16px '+FONT; ctx.textAlign='center'; ctx.fillStyle='#ff7a6a';
      ctx.fillText('CHECK!', PL.x, PL.y+HUD-26); }
  }
}
function drawPiece(p,i){
  if(!p.alive) return;
  const x=p.state==='home'? p.c*T+16 : p.px;
  const y=(p.state==='home'? p.r*T+16 : p.py)+HUD;
  const col=PIECE_COL[p.type], dark=shade(col,0.5);
  const resting=p.state==='rest';
  const teleFrac=p.tele/TELEGRAPH;
  ctx.save();
  if(resting){ ctx.globalAlpha=0.75; ctx.translate(x,y); ctx.rotate(Math.sin(frame*0.1)*0.12); ctx.translate(-x,-y); }
  if(p.state==='home' && teleFrac>0 && (frame>>2)%2) ctx.globalAlpha=0.55;   // telegraph flicker
  const g=ctx.createLinearGradient(x,y-16,x,y+10);
  g.addColorStop(0,col); g.addColorStop(1,dark);
  ctx.fillStyle=g; ctx.strokeStyle='rgba(10,8,16,.7)'; ctx.lineWidth=1.6;
  // base
  ctx.beginPath(); ctx.ellipse(x,y+8,10,4,0,0,7); ctx.fill(); ctx.stroke();
  if(p.type==='rook'){
    ctx.fillRect(x-7,y-10,14,17); ctx.strokeRect(x-7,y-10,14,17);
    for(let k=0;k<3;k++) ctx.fillRect(x-8+k*6,y-15,4,6);
  } else if(p.type==='bishop'){
    ctx.beginPath(); ctx.moveTo(x-6,y+7); ctx.quadraticCurveTo(x-7,y-8,x,y-15);
    ctx.quadraticCurveTo(x+7,y-8,x+6,y+7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x,y-16,2.6,0,7); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.5)';
    ctx.beginPath(); ctx.moveTo(x-2,y-12); ctx.lineTo(x+3,y-7); ctx.stroke();
  } else if(p.type==='queen'){
    ctx.beginPath(); ctx.moveTo(x-8,y+7); ctx.lineTo(x-5,y-10); ctx.lineTo(x-2,y-4);
    ctx.lineTo(x,y-13); ctx.lineTo(x+2,y-4); ctx.lineTo(x+5,y-10); ctx.lineTo(x+8,y+7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff'; for(const dx of [-5,0,5]) { ctx.beginPath(); ctx.arc(x+dx,y-(dx?10:13),1.6,0,7); ctx.fill(); }
  } else if(p.type==='knight'){
    ctx.beginPath(); ctx.moveTo(x-6,y+7); ctx.lineTo(x-5,y-4); ctx.quadraticCurveTo(x-4,y-13,x+4,y-14);
    ctx.quadraticCurveTo(x+9,y-14,x+8,y-9); ctx.lineTo(x+2,y-7); ctx.lineTo(x+6,y+7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#1a1410'; ctx.beginPath(); ctx.arc(x+3,y-11,1.4,0,7); ctx.fill();
  } else { // king
    ctx.beginPath(); ctx.moveTo(x-7,y+7); ctx.lineTo(x-5,y-9); ctx.lineTo(x+5,y-9); ctx.lineTo(x+7,y+7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(x-1.6,y-17,3.2,8); ctx.fillRect(x-4.5,y-14.6,9,3);
    if(kingDefended()){
      const pl=0.4+Math.sin(frame*0.12)*0.2;
      ctx.strokeStyle='rgba(255,215,110,'+pl.toFixed(2)+')'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y-4,15,0,7); ctx.stroke();
    } else if((frame>>4)%2){
      drawLabel('UNDEFENDED!', x, y-28, '#7fdb7f');
    }
  }
  ctx.restore();
  // telegraph bar
  if(p.state==='home' && teleFrac>0){
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(x-11,y-24,22,4);
    ctx.fillStyle='#ff7a5a'; ctx.fillRect(x-11,y-24,22*teleFrac,4);
  }
}
function drawPawn(p){
  const x=p.c*T+16, y=p.r*T+16+HUD;
  const g=ctx.createLinearGradient(x,y-12,x,y+8);
  g.addColorStop(0,'#e8e4d8'); g.addColorStop(1,'#a8a294');
  ctx.fillStyle=g; ctx.strokeStyle='rgba(40,36,30,.7)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.ellipse(x,y+7,8,3.4,0,0,7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x-6,y+5); ctx.quadraticCurveTo(x-5,y-3,x,y-4);
  ctx.quadraticCurveTo(x+5,y-3,x+6,y+5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x,y-8,4.4,0,7); ctx.fill(); ctx.stroke();
}
function drawBar(){
  const hg=ctx.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#211f2e'); hg.addColorStop(1,'#131119');
  ctx.fillStyle=hg; ctx.fillRect(0,0,RW,HUD);
  ctx.fillStyle='rgba(220,214,240,.3)'; ctx.fillRect(0,HUD-2,RW,2);
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#dcd6f0';
  ctx.fillText('CHESS BLITZ', RW/2, 20);
  ctx.textAlign='left'; ctx.font='10px '+FONT; ctx.fillStyle='#98a58c';
  ctx.fillText('PAWNS IN HAND '+pawnsHeld, 10, 20);
  for(let i=0;i<3;i++){ ctx.fillStyle= i<lives? '#ff5a3c':'#3a2c28'; ctx.beginPath(); ctx.arc(14+i*16,32,5,0,7); ctx.fill(); }
  ctx.textAlign='right'; ctx.font='10px '+FONT; ctx.fillStyle='#8a957e';
  ctx.fillText('SPACE plant/recall pawn · bait a charge, then strike the spent piece', RW-10, 20);
  ctx.fillText(kingDefended()? 'the King is defended — cut his cover' : 'the King stands ALONE', RW-10, 36);
  ctx.textAlign='center'; ctx.font='bold 13px '+FONT; ctx.fillStyle='#c9b8ff';
  ctx.fillText(pieces.filter(p=>p.alive&&p.type!=='king').length+' pieces stand', RW/2, 38);
}
function draw(){
  ctx.fillStyle='#0e0c16'; ctx.fillRect(0,HUD,RW,RH);
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) drawBoardTile(r,c);
  drawThreat();
  // exit marker
  const ex=ENTRY.c*T+16, ey=ENTRY.r*T+16+HUD;
  const pul=0.5+Math.sin(frame*0.08)*0.25;
  ctx.strokeStyle='rgba(232,193,90,'+pul.toFixed(2)+')'; ctx.lineWidth=2.2;
  ctx.beginPath(); ctx.ellipse(ex,ey,14,7,0,0,7); ctx.stroke();
  if(PR===ENTRY.r&&PC===ENTRY.c) drawLabel('[SPACE] leave', ex, ey-20, '#ffe9a0');
  for(const p of pawns) drawPawn(p);
  pieces.forEach((p,i)=>drawPiece(p,i));
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
  drawBar();
  if(won){
    ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(0,HUD,RW,RH);
    ctx.font='bold 26px '+FONT; ctx.textAlign='center'; ctx.fillStyle='#ffd76e';
    ctx.fillText('CHECKMATE', RW/2, HUD+RH/2);
  }
}

/* ---------------- API ---------------- */
window.ChessLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    bgrid=BOARD_ROWS.map(r=>r.split(''));
    over=false; won=false; doneT=0; lives=3; spaceLatch=false;
    resetBoard(false);
    PL.swing=0; PL.kb.x=0; PL.kb.y=0;
    toast('Allies in hand: '+allySources().join(' + ')+'. The lanes are the law — stay out of the light.');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; } else loadScreen(12);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw
};

})();
