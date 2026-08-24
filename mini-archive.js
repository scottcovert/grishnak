"use strict";
/* ============================================================
   GRISHNAK — ADVENTURE! (THE SUNKEN ARCHIVE)
   C64-styled text-adventure client for archive/engine.php.
   Full-screen blue terminal drawn on the game canvas. The player
   types real sentences; each turn POSTs {command, state} and the
   LLM Dungeon Master answers within the hand-authored world spec.
   Progress persists in localStorage. Finishing the game writes
   flags.wardstone back into the main engine's shared state — the
   first true cross-scope completion hook.
   ============================================================ */
(function(){

// Which game the cabinet is running. Default = the shipped Sunken Archive.
// The Adventure Architect (tools/archive-architect.py) can drop additional
// <slug>-design.json games at the site root; set this in the console to test one:
//   localStorage.setItem('grishnak_archive_active','<slug>'); location.reload()
const GAME=(function(){try{return localStorage.getItem('grishnak_archive_active')||'sunken-archive';}catch(e){return 'sunken-archive';}})();
// Keep the original save key for the default game (continuity); namespace the rest
// so generated games don't clobber each other's progress.
const AKEY=(GAME==='sunken-archive')?'grishnak_archive_v1':('grishnak_archive_'+GAME);
const ENDPOINT='/archive/engine.php';   // absolute — the PHP backend stays at site root (manually-placed config.php lives there)
const CBORDER='#7C70DA', CSCREEN='#40318D', CTEXT='#9a8fe8', CINPUT='#cfc7ff',
      CSYS='#7fdb7f', CKEEPER='#ffd76e', CERR='#ff8a7a';
const WRAP=64, LINE_H=15, VIS_ROWS=21, TYPE_SPD=3;

let room='stair', inv=[], aflags={}, score=0, turns=0, ended=null;
let lines=[], typing=null, inputBuf='', busy=false, savedPos=null, cursorOn=true;
let keyHandlerInstalled=false, exiting=false, fullscreen=false;
const FS_BTN={x:RW-128, y:RH+HUD-30, w:116, h:20};
const EXIT_BTN={x:RW-128-84, y:RH+HUD-30, w:76, h:20};   // sits to the LEFT of FULL SCREEN

/* This is a canvas terminal — there is no DOM to render markup, so a stray
   <p> from the model would print as the literal characters "<p>". The server
   strips it too; this is the second net, because saved transcripts in
   localStorage predate that fix and would otherwise still show the tag. */
function plainText(t){
  return String(t)
    .replace(/<\s*\/?\s*(?:p|br|div|li|ul|ol|h[1-6])\s*\/?\s*>/gi, '\n\n')
    .replace(/<[^>]{0,200}>/g, '')
    .replace(/&nbsp;/gi,' ').replace(/&mdash;/gi,'—').replace(/&hellip;/gi,'…')
    .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"').replace(/&#0?39;|&apos;/gi,"'")
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
/* Restored scrollback is stored ALREADY WRAPPED, so it never passes through
   wrapText() again — a <p> printed before the fix would sit in the saved log
   forever. Clean each stored line in place instead: strip markup, decode
   entities, but never introduce a newline into an already-wrapped line. */
function sanitizeLine(t){
  return String(t)
    .replace(/<[^>]{0,200}>/g, '')
    .replace(/&nbsp;/gi,' ').replace(/&mdash;/gi,'—').replace(/&hellip;/gi,'…')
    .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"').replace(/&#0?39;|&apos;/gi,"'")
    .replace(/[ \t]{2,}/g,' ');
}
function wrapText(t){
  const out=[];
  for(const raw of plainText(t).split('\n')){
    let s=raw;
    while(s.length>WRAP){
      let cut=s.lastIndexOf(' ',WRAP);
      if(cut<WRAP*0.5) cut=WRAP;
      out.push(s.slice(0,cut)); s=s.slice(cut).replace(/^ /,'');
    }
    out.push(s);
  }
  return out;
}
function say(t,c){ typingQueuePush(wrapText(t).map(s=>({t:s,c:c||CTEXT}))); }
function sayNow(t,c){ for(const s of wrapText(t)) lines.push({t:s,c:c||CTEXT}); trim(); }
function typingQueuePush(ls){
  if(!typing) typing={q:ls,li:0,ci:0};
  else typing.q.push(...ls);
}
function trim(){ if(lines.length>220) lines=lines.slice(-180); }

function saveLocal(){
  try{ localStorage.setItem(AKEY, JSON.stringify({room,inv,aflags,score,turns,ended,lines:lines.slice(-60)})); }catch(e){}
}
function loadLocal(){
  try{ return JSON.parse(localStorage.getItem(AKEY)); }catch(e){ return null; }
}

function intro(){
  if(GAME!=='sunken-archive'){
    const disp=GAME.replace(/-/g,' ').toUpperCase();
    sayNow('**** '+disp+' ****','#ffffff');
    sayNow('a tale spun beneath the valley','#ffffff');
    sayNow('');
    say('The last Keeper\'s rings part like curtains of light, and the '+
      'cabinet swallows you into another story entirely.', CTEXT);
    say('');
    say('(type LOOK to begin — full sentences work. LEAVE, bottom right, '+
      'goes back anytime; your place is kept.)', CSYS);
    return;
  }
  sayNow('**** THE SUNKEN ARCHIVE ****','#ffffff');
  sayNow('an adventure beneath the valley','#ffffff');
  sayNow('');
  say('The last Keeper\'s rings part like curtains of light, and the '+
    'cabinet swallows you whole. Stone steps descend into dark that '+
    'smells of wet paper and old candles. Your caverns lantern, ever '+
    'faithful, flares to meet it.', CTEXT);
  say('');
  say('You stand at the top of a cracked stair, spiraling down beneath '+
    'the valley itself. Far below, something vast and patient is '+
    'sleeping. The Keeper\'s voice follows you down: "Read everything. '+
    'Take nothing lightly. And mind the water."', CKEEPER);
  say('');
  say('(type LOOK to begin — full sentences work. LEAVE, bottom right, '+
    'goes back anytime; your place is kept.)', CSYS);
}

function applyTurn(d){
  if(d.roomChange) room=d.roomChange;
  for(const o of (d.addInventory||[])) if(!inv.includes(o)) inv.push(o);
  inv=inv.filter(o=>!(d.removeInventory||[]).includes(o));
  if(d.setFlags) for(const k in d.setFlags) aflags[k]=d.setFlags[k];
  score+=d.scoreDelta||0;
  turns++;
  say('');
  say(d.narration, CTEXT);
  if(d.scoreDelta>0) say('[+'+d.scoreDelta+' points]', CSYS);
  if(d.endingTriggered && !ended){
    ended=d.endingTriggered;
    /* ---- the cross-scope hook: write back into the main game ---- */
    flags.wardstone=ended;
    if(!flags.archiveRewarded){
      flags.archiveRewarded=true;
      res.gold=Math.min(999,res.gold+50);
      say('');
      say('Somewhere above, the valley shifts in its sleep. (+50 gold '+
        'waits for you outside — the Keeper\'s gratitude.)', CKEEPER);
    }
    say('');
    say('*** The tale is told. Your choice — "'+ended+'" — is now part '+
      'of Grishnak\'s history. LEAVE returns you to the Arcade. ***', '#ffffff');
    saveGame();
  }
  saveLocal();
}

function submit(){
  const cmd=inputBuf.trim(); inputBuf='';
  if(!cmd) return;
  sayNow('');
  sayNow('> '+cmd, CINPUT);
  const low=cmd.toLowerCase();
  if(low==='quit'||low==='exit'||low==='leave'){ leaveArchive(); return; }
  if(ended){ say('The tale is already told. LEAVE returns you to the Arcade — or type RESTART to hear it again.', CSYS); return; }
  if(low==='restart'){
    try{ localStorage.removeItem(AKEY); }catch(e){}
    room='stair'; inv=[]; aflags={}; score=0; turns=0; ended=null; lines=[]; typing=null;
    intro(); return;
  }
  busy=true;
  fetch(ENDPOINT,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({game:GAME, command:cmd, state:{room, inventory:inv, flags:aflags, score, turns}})
  })
  .then(r=>r.json())
  .then(d=>{
    busy=false;
    if(d && d.narration) applyTurn(d);
    else say('(the archive\'s magic stutters — nothing happens. try rephrasing.)', CERR);
  })
  .catch(()=>{
    busy=false;
    say('(the lantern gutters — the archive cannot hear you just now. '+
      'check your connection and try that again.)', CERR);
  });
}

function setFullscreen(on){
  fullscreen=on;
  const cvEl=document.getElementById('cv');
  if(cvEl){ if(on) cvEl.classList.add('fullterm'); else cvEl.classList.remove('fullterm'); }
}
function onClick(e){
  if(state!=='archive') return;
  const cvEl=document.getElementById('cv');
  const rect=cvEl.getBoundingClientRect();
  // letterbox-aware mapping (object-fit:contain in fullscreen mode)
  const ar=cvEl.width/cvEl.height;
  let cw=rect.width, ch=rect.height, ox=0, oy=0;
  if(cw/ch>ar){ cw=ch*ar; ox=(rect.width-cw)/2; }
  else { ch=cw/ar; oy=(rect.height-ch)/2; }
  const lx=(e.clientX-rect.left-ox)/cw*RW;
  const ly=(e.clientY-rect.top-oy)/ch*(RH+HUD);
  if(lx>=FS_BTN.x && lx<=FS_BTN.x+FS_BTN.w && ly>=FS_BTN.y && ly<=FS_BTN.y+FS_BTN.h){
    setFullscreen(!fullscreen);
    return;
  }
  if(lx>=EXIT_BTN.x && lx<=EXIT_BTN.x+EXIT_BTN.w && ly>=EXIT_BTN.y && ly<=EXIT_BTN.y+EXIT_BTN.h){
    leaveArchive();
  }
}
/* one exit path for the button and the ESC key, so they can never drift */
function leaveArchive(){
  if(exiting) return;
  exiting=true;
  if(fullscreen) setFullscreen(false);
  saveLocal();
  startArchiveTrans('out');
}
function onKey(e){
  if(state!=='archive' || exiting) return;
  const k=e.key;
  if(k==='Escape'){ e.preventDefault(); leaveArchive(); return; }
  if(busy) { e.preventDefault(); return; }
  if(k==='Enter'){ e.preventDefault(); submit(); return; }
  if(k==='Backspace'){ e.preventDefault(); inputBuf=inputBuf.slice(0,-1); return; }
  if(k.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey){
    e.preventDefault();
    if(inputBuf.length<80) inputBuf+=k;
  }
}

/* ---------------- UPDATE ---------------- */
function update(){
  if(typing){
    for(let n=0;n<TYPE_SPD;n++){
      const cur=typing.q[typing.li];
      if(!cur){ typing=null; trim(); break; }
      typing.ci++;
      if(typing.ci>=cur.t.length){ lines.push(cur); typing.li++; typing.ci=0; }
    }
  }
  cursorOn=(frame>>4)%2===0;
}

/* ---------------- DRAW ---------------- */
function draw(){
  const W=RW, H=RH+HUD;
  ctx.fillStyle=CBORDER; ctx.fillRect(0,0,W,H);
  ctx.fillStyle=CSCREEN; ctx.fillRect(20,20,W-40,H-40);
  ctx.font='bold 12px "Courier New",monospace'; ctx.textAlign='left';

  // status bar (inverse, like a real Infocom interpreter)
  ctx.fillStyle=CTEXT; ctx.fillRect(20,20,W-40,18);
  ctx.fillStyle=CSCREEN;
  ctx.fillText(' THE SUNKEN ARCHIVE', 26, 33);
  ctx.textAlign='right';
  ctx.fillText('SCORE '+score+'  TURNS '+turns+' ', W-26, 33);
  ctx.textAlign='left';

  // transcript: fully-revealed lines + partial typing line
  const shown=[];
  for(const L of lines) shown.push(L);
  if(typing && typing.q[typing.li]){
    const cur=typing.q[typing.li];
    shown.push({t:cur.t.slice(0,typing.ci)+'█', c:cur.c});
  }
  const start=Math.max(0, shown.length-VIS_ROWS);
  let y=56;
  for(let i=start;i<shown.length;i++){
    ctx.fillStyle=shown[i].c; ctx.fillText(shown[i].t, 30, y); y+=LINE_H;
  }

  // input line (hidden while the DM is thinking)
  if(busy){
    const dots='.'.repeat(1+((frame>>4)%3));
    ctx.fillStyle=CKEEPER;
    ctx.fillText('* the keeper consults the tomes'+dots+' *', 30, y+6);
  } else if(!typing){
    ctx.fillStyle=CINPUT;
    ctx.fillText('> '+inputBuf+(cursorOn?'█':''), 30, y+6);
  }

  ctx.fillStyle='rgba(255,255,255,.45)'; ctx.font='10px "Courier New",monospace';
  ctx.fillText('ENTER send · progress auto-saves', 30, H-27);

  // bottom-right button pair: LEAVE, then the full/partial screen toggle
  ctx.font='bold 10px "Courier New",monospace'; ctx.textAlign='center';
  for(const b of [{r:EXIT_BTN, label:'LEAVE'},
                  {r:FS_BTN,   label:fullscreen?'EXIT FULL SCREEN':'FULL SCREEN'}]){
    ctx.fillStyle='rgba(30,22,80,.85)';
    ctx.fillRect(b.r.x,b.r.y,b.r.w,b.r.h);
    ctx.strokeStyle=CTEXT; ctx.lineWidth=1.2;
    ctx.strokeRect(b.r.x,b.r.y,b.r.w,b.r.h);
    ctx.fillStyle=CINPUT;
    ctx.fillText(b.label, b.r.x+b.r.w/2, b.r.y+13.5);
  }
  ctx.textAlign='left';
}

/* ---------------- API ---------------- */
window.ArchiveLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    if(!keyHandlerInstalled){ addEventListener('keydown', onKey, true); addEventListener('click', onClick); keyHandlerInstalled=true; }
    inputBuf=''; busy=false; typing=null; exiting=false;
    const s=loadLocal();
    if(s && s.lines && s.lines.length){
      room=s.room||'stair'; inv=s.inv||[]; aflags=s.aflags||{}; score=s.score||0;
      turns=s.turns||0; ended=s.ended||null;
      lines=s.lines.map(L=>({t:sanitizeLine(L&&L.t||''), c:(L&&L.c)||CTEXT}));
      sayNow(''); say('(the archive remembers you — '+(ended?'your tale is told':'your place was kept')+'.)', CSYS);
    } else {
      room='stair'; inv=[]; aflags={}; score=0; turns=0; ended=null; lines=[];
      intro();
    }
  },
  exitDone(){
    setFullscreen(false);
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; } else loadScreen(12);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw
};

})();
