"use strict";
/* ============================================================
   GRISHNAK — CONTRAPTION  (Scott, 2026-08-19, "very rough first pass")

   "player can push around blocks, bumpers, bouncers, bombs (which are the
   only things that can break a wall) and so on, on a screen with a border,
   and some internal walls. Player has to arrange things the way they want,
   then press space bar at a launch icon, and a ball starts moving, bouncing,
   pinging around, with the goal of getting it to a defined exit point -
   screens increase steadily in complexity"

   TWO PHASES. BUILD: you walk the yard and shove the machinery around,
   sokoban-style — nothing is hostile, take all day. FLIGHT: stand by the
   launcher, press SPACE, and the ball is out of your hands — you just watch
   the machine you made either work or teach you something. A failed flight
   costs NOTHING: the ball fizzles, your arrangement stays, launch again.

   PUSH and PULL. Walking into a piece shoves it. Holding SHIFT while
   stepping AWAY from an adjacent piece drags it after you — the un-shove,
   added the day a mirror got pushed flush against a wall and push-only
   sokoban had no way to ever bring it back. While SHIFT is held nothing
   gets pushed: it is the careful hand.

   THE PIECES:
     block   — plain masonry, the ball bounces off it (move it OUT of lanes)
     mirror  — a polished diagonal bar: the ball turns 90° (the real tool)
     ratchet — a brass mirror that ROTATES 90° every time it is struck:
               the first visit turns the ball one way, the second visit the
               other. Consecutive visits differ — loops become little
               programs. (Tier-3 of the mechanism menu, 2026-08-19.)
     bumper  — a round kicker: radial bounce with pep (chaos, mostly decor)
     bomb    — the ONLY thing that opens a cracked wall: the ball touches it,
               it goes up, and every cracked tile beside it goes with it.
               The ball sails on through the new hole.
   Cracked walls ('%') fall only to bombs. Border and plain walls never fall.

   THE LATCH (board furniture, not pushable): a floor PLATE ('x') and its
   GATES ('G' closed / 'g' open). The ball rolling over any plate toggles
   EVERY gate on the board — one circuit per yard, kept readable. Gates
   block ball and walker alike when shut; nothing may be parked on one.
   Gates and ratchets snap back to their authored state at every launch,
   so a failed flight still costs nothing and every flight is repeatable.

   DETERMINISM: zero randomness anywhere in play — same arrangement, same
   flight, every time. That is what makes it a puzzle and what makes the
   suite able to PROVE every level solvable by driving the solution.
   ============================================================ */
(function(){

const GW=20, GH=12, CT=32;             // the yard: 20x12 tiles of 32px = 640x384
const BALL_R=5, BSPD=4.0;              // ball speed, px per frame, constant
const SUB=3;                           // collision substep ceiling, px
const LIFE=900;                        // frames before a flight fizzles (~15s)
const WON_T=90;                        // banner frames between levels
const MOVE_CD=7;                       // player step cadence while a key is held
/* ...but NOT for the first repeat. A tap of 8 frames still walked two squares,
   because 8 frames is longer than one step and the key was read again at the
   boundary — and 8 frames is 130ms, an ordinary human tap, not a hold. So the
   first step after a clean release waits REPEAT_CD before it will repeat, and
   only then does the cadence drop to MOVE_CD for the glide. This is the
   typematic delay every keyboard has had since the 80s, and it is what makes
   'one square' and 'run across the yard' the same control. Turning a corner
   mid-run does NOT re-arm it: the delay is spent on the first press only, so
   fluid navigation costs nothing. */
const REPEAT_CD=16;
const SAVEK='grishContraption';
/* SMOOTH TRAVEL (Scott, 2026-08-20: "make movement as smooth as actual Digging
   Jim ... smooth, discrete, understandable-in-stages").

   The grid stays ABSOLUTE. step() still commits a whole tile the instant you
   press, so every yard is as deterministic as it ever was and the suite can
   still prove a solution by driving tiles one at a time. What changed is only
   WHEN YOU SEE IT: the sprite is drawn at an offset back toward the tile it
   just left, and that offset walks to zero over exactly MOVE_CD frames. The
   logic teleports; the picture slides. Nothing about the puzzle can tell.

   LINEAR, never eased. A constant velocity is a legible velocity — that is the
   whole "understandable in stages" feel. Easing each tile would make a held
   key read as a limp: fast, slow, fast, slow, once per square.

   The cadence is decrement-THEN-commit (not commit-on-the-next-frame), so the
   frame a slide finishes is the same frame the next one starts. One idle frame
   per tile was the difference between walking and marching. */
function slid(o){                      // pixel offset for anything mid-slide
  if(!o || !o.st) return [0,0];
  const k=o.st/MOVE_CD;
  return [o.sx*k, o.sy*k];
}
function slide(o,dc,dr){ o.sx=-dc*CT; o.sy=-dr*CT; o.st=MOVE_CD; }

/* '#' wall · '%' cracked wall (bombs only) · 'b' block · '/' '\' mirrors ·
   'r' ratchet mirror (starts as '/') · 'o' bumper · '*' bomb ·
   'x' floor plate · 'G' gate (closed) · 'g' gate (open) ·
   'L' launcher · 'E' exit · 'P' you · '.' floor */
/* Yard curve v2 (Scott, 2026-08-19: "start with more complexity — 2 mirrors
   plus a barrier of some sort mid screen — and go from there"). Every yard
   has an internal obstruction; the baseline is a two-turn route. */
const LEVELS=[
 { name:'THE TWO TURNS', dir:[1,0],
   hint:'A wall splits the yard. Two mirrors, two turns — send it over the top.',
   map:[
   "####################",
   "#.................E#",
   "#..................#",
   "#..../....#........#",
   "#.........#........#",
   "#.........#........#",
   "#L........#........#",
   "#.........#........#",
   "#.........#........#",
   "#....../..#........#",
   "#........P.........#",
   "####################"]},
 /* Curve v3 (Scott, 2026-08-19: "definitely want some more complicated levels
    ... pick the 4 easiest (except screen 1) and remove them first ... require
    increasingly more planning"). Removed: THE LONG WAY ROUND, THE POWDER,
    TWO CHARGES, THE LATCH. Kept: TWO TURNS, SWITCHBACK, GAUNTLET, RATCHET,
    CIRCUIT. New: TOLL ROAD (toggle parity), COMBINATION (two doors, one
    circuit), SERPENT (lane maze; a corner only a PULL can place), PROOF
    (everything on one flight, two pulls). */
 { name:'THE SWITCHBACK', dir:[1,0],
   hint:'Clear the lane, climb the yard, and knock on the far ceiling with powder.',
   map:[
   "####################",
   "#./..........%....E#",
   "#............%.....#",
   "#............%.....#",
   "#..................#",
   "#...........*......#",
   "#..../.#...........#",
   "#......#...........#",
   "#......#...........#",
   "#L.b...#...........#",
   "#......#...P.......#",
   "####################"]},
 { name:'THE GAUNTLET', dir:[1,0],
   hint:'Everything you know, on one flight: clear the lane, two turns, two charges.',
   map:[
   "####################",
   "#..................#",
   "#L...b........\\....#",
   "#..................#",
   "#................*.#",
   "#.......o..........#",
   "#..........*...%%%%#",
   "#..................#",
   "#.........%....../.#",
   "#E........%........#",
   "#....P....%........#",
   "####################"]},
 { name:'THE RATCHET', dir:[1,0],
   hint:'The brass mirror turns a different way each strike. Send the ball up, and let it come back.',
   map:[
   "####################",
   "#..................#",
   "#..................#",
   "#...............#..#",
   "#..................#",
   "#............*...%.#",
   "#L....b..........%E#",
   "#................%.#",
   "#..................#",
   "#...............r..#",
   "#.......P..........#",
   "####################"]},
 { name:'THE TOLL ROAD', dir:[1,0],
   hint:'Two plates on one wire make an even number. Cross exactly ONE.',
   map:[
   "####################",
   "#.............#....#",
   "#...........\\.#....#",
   "#.............#....#",
   "#..../........#....#",
   "#.............#....#",
   "#L...x....x...G...E#",
   "#.............#....#",
   "#...........\\.#....#",
   "#......./.....#....#",
   "#..P..........#....#",
   "####################"]},
 { name:'THE CIRCUIT', dir:[1,0],
   hint:'Tap the plate through the ratchet — the door and the powder both answer on one flight.',
   map:[
   "####################",
   "#..................#",
   "#..................#",
   "#..................#",
   "#.........#....*...#",
   "#.........x...#....#",
   "#.............#....#",
   "#.............#.%..#",
   "#L..r.....b...G.%.E#",
   "#.............#.%..#",
   "#.....P.......#....#",
   "####################"]},
 { name:'THE COMBINATION', dir:[1,0],
   hint:'Two doors, one circuit — every plate flips BOTH. Count your crossings.',
   map:[
   "####################",
   "#.......#....#.....#",
   "#.....#.#.#..#.....#",
   "#.....x.#.x..#.....#",
   "#.......#....#.....#",
   "#.......#....#.....#",
   "#L......G....g....E#",
   "#.......#....#.....#",
   "#.......#....#.....#",
   "#.....r...r..#.....#",
   "#..P....#....#.....#",
   "####################"]},
 /* THE SERPENT was UNSOLVABLE as first authored (Scott, 2026-08-21: "contraption
    level 8 - how can it be solved - seem trapped behind a block, cant access bomb
    or launcher"). He was right, and it was worse than a hard puzzle: the cracked
    stone at 9,5 split the middle lane, and that lane was the ONLY road between
    the bottom chamber and everything else. So the player could never reach the
    bomb, the bomb could never open the stone, and the launcher could never be
    reached at all. Proven by flood-fill with every piece treated as thin air —
    the launcher was unreachable even then, so no sequence of shoves could have
    saved it. The fix is a second chimney at cols 16-17: the bottom chamber now
    climbs to the RIGHT half of the middle lane and on up to the top, and the
    cracked stone goes back to being what it was meant to be — an obstacle for
    the BALL, not a wall across the player's only door. */
 { name:'THE SERPENT', dir:[1,0],
   hint:'Three lanes, one thread. The top corner cannot be pushed — it must be PULLED.',
   map:[
   "####################",
   "#.......o........\\.#",
   "#L.................#",
   "################...#",
   "################./.#",
   "#........%...*.....#",
   "#...############..##",
   "#./.############..##",
   "#.................E#",
   "#.\\................#",
   "#....P.............#",
   "####################"]},
 { name:'THE PROOF', dir:[1,0],
   hint:'Everything you have learned, on one flight — and two corners only a pull can place.',
   map:[
   "####################",
   "#................\\.#",
   "#..................#",
   "#........../.......#",
   "#..................#",
   "#.....#............#",
   "#.....x......%%%...#",
   "#.........#.*......#",
   "#.........#........#",
   "#L.r......G......E.#",
   "#...P.....#.../....#",
   "####################"]}
];

let level=0, walls=null, cracked=null, pieces=[], player={c:0,r:0};
let plates=[], gates=[], plateLatch='';   // THE LATCH: one circuit per yard
let launch={c:0,r:0,dir:[1,0]}, exitAt={c:0,r:0};
let phase='build';                     // build | flight | won | alldone
let ball=null, flightT=0, wonT=0, moveCD=0, mirLatch='';
let spaceLatch=false, eLatch=false, rLatch=false, msg='', msgT=0, shake=0;
let flightSnap=null;   // the yard as built, snapshotted at launch — a failed flight costs NOTHING
let parts=[];                          // cosmetic puffs
let flights=0;                         // launches this level (for the fizzle line)
/* THE YARD MENU (Scott, 2026-08-21: "allow level selection in contraption
   similar to stonebreaker"). Same shape as the wall menu next door — Y opens
   it, arrows pick, ENTER goes, ESC closes — because two puzzle games in one
   cabinet should not have two different ways to say the same thing. Digits
   1-9 jump straight there while it is open, which is the whole list. */
let yardUI=false, yardSel=0, yLatch={};
let bufC=0, bufR=0, bufT=0;            // buffered turn: a tap shorter than one slide still counts
let preC=0, preR=0;                    // last frame's ask, so a PRESS can be told from a HOLD
let runT=false;                        // a direction has been held unbroken since the last release
let trail=[];                          // the ball's recent path — you plan by predicting
                                       // straight lines, so the line should be visible

function K(c,r){ return r*64+c; }
function saveLvl(){ try{ localStorage.setItem(SAVEK, String(level)); }catch(e){} }
function loadLvl(n){
  level=n;
  const L=LEVELS[n];
  walls=new Set(); cracked=new Set(); pieces=[]; parts=[];
  plates=[]; gates=[]; plateLatch='';
  phase='build'; ball=null; flightT=0; wonT=0; msg=''; msgT=0; flights=0; mirLatch='';
  trail=[]; bufC=0; bufR=0; bufT=0; preC=0; preR=0; runT=false; moveCD=0; yardUI=false;
  for(let r=0;r<GH;r++) for(let c=0;c<GW;c++){
    const ch=L.map[r][c];
    if(ch==='#') walls.add(K(c,r));
    else if(ch==='%') cracked.add(K(c,r));
    else if(ch==='b') pieces.push({c,r,kind:'block'});
    else if(ch==='/') pieces.push({c,r,kind:'mirA'});
    else if(ch==='\\') pieces.push({c,r,kind:'mirB'});
    else if(ch==='r') pieces.push({c,r,kind:'ratch',or:'A',or0:'A',spin:0});
    else if(ch==='o') pieces.push({c,r,kind:'bump',lit:0});
    else if(ch==='*') pieces.push({c,r,kind:'bomb'});
    else if(ch==='x') plates.push({c,r});
    else if(ch==='G') gates.push({c,r,open:false,init:false,anim:0});
    else if(ch==='g') gates.push({c,r,open:true,init:true,anim:0});
    else if(ch==='L'){ launch={c,r,dir:L.dir.slice()}; }
    else if(ch==='E'){ exitAt={c,r}; }
    /* face: which way the walker is turned · gait: which leg leads this tile
       (flipped every commit, so the scissor is locked to the grid — one full
       stride per square is exactly the Digger read) · heave: frames of push-strain */
    else if(ch==='P'){ player={c,r,sx:0,sy:0,st:0,face:'d',gait:0,heave:0}; }
  }
}
function pieceAt(c,r){ return pieces.find(p=>p.c===c&&p.r===r); }
function gateAt(c,r){ return gates.find(g=>g.c===c&&g.r===r); }
function plateAt(c,r){ return plates.some(q=>q.c===c&&q.r===r); }
function solidTile(c,r){                       // what the BALL bounces off
  if(c<0||c>=GW||r<0||r>=GH) return true;
  if(walls.has(K(c,r))||cracked.has(K(c,r))) return true;
  const g=gateAt(c,r);
  if(g && !g.open) return true;
  const p=pieceAt(c,r);
  return !!(p && p.kind==='block');
}
function walkable(c,r){                        // what the PLAYER may stand on
  if(c<0||c>=GW||r<0||r>=GH) return false;
  if(walls.has(K(c,r))||cracked.has(K(c,r))) return false;
  const g=gateAt(c,r);
  if(g && !g.open) return false;
  if(pieceAt(c,r)) return false;
  return true;
}
/* one attempted player step; pushes a piece if one is in the way.
   Exposed to the suite: a scripted solution is a list of these. */
function step(dc,dr){
  if(phase!=='build') return false;
  const nc=player.c+dc, nr=player.r+dr;
  const p=pieceAt(nc,nr);
  if(p){
    const tc=nc+dc, tr=nr+dr;
    const bad= !walkable(tc,tr)
      || (tc===launch.c&&tr===launch.r)              // nothing parks on the lever
      || (tc===exitAt.c&&tr===exitAt.r)              // or in the doorway
      || !!gateAt(tc,tr);                            // or under a gate, open or shut
    if(bad){
      /* the refused push is the exact moment the pull matters — teach it HERE
         (Scott hit the wall-flush deadlock without ever meeting the header hint) */
      msg='It will not go further that way — hold SHIFT and step AWAY to pull it back.';
      msgT=150;
      return false;
    }
    p.c=tc; p.r=tr;
    player.c=nc; player.r=nr;
    slide(p,dc,dr); slide(player,dc,dr); faceTo(dc,dr);
    player.heave=MOVE_CD;                       // the shove reads in the shoulders
    /* dust at the CONTACT edge, not the middle: it is the stone grinding the
       floor that throws it, and the eye wants to see where the force went */
    puffAt(nc*CT+16-dc*13, nr*CT+16-dr*13, '#8a7458', 3);
    sfx.pick&&sfx.pick();
    return true;
  }
  if(nc<0||nc>=GW||nr<0||nr>=GH) return false;
  if(walls.has(K(nc,nr))||cracked.has(K(nc,nr))) return false;
  player.c=nc; player.r=nr;
  slide(player,dc,dr); faceTo(dc,dr);
  return true;
}
function faceTo(dc,dr){
  player.face = dc>0?'r' : dc<0?'l' : dr<0?'u' : 'd';
  player.gait ^= 1;                             // one stride per square, always
}
/* PULL — the un-shove. Step AWAY from an adjacent piece with SHIFT held:
   you move, and the piece follows into the square you just left. This is
   the escape hatch for the push-only deadlock (a piece shoved flush against
   a wall). With SHIFT held nothing is ever pushed — the careful hand. */
function pull(dc,dr){
  if(phase!=='build') return false;
  const nc=player.c+dc, nr=player.r+dr;
  if(!walkable(nc,nr)) return false;
  const p=pieceAt(player.c-dc, player.r-dr);
  const oc=player.c, orr=player.r;
  player.c=nc; player.r=nr;
  slide(player,dc,dr); faceTo(dc,dr);
  if(p && !(oc===launch.c&&orr===launch.r) && !(oc===exitAt.c&&orr===exitAt.r) && !gateAt(oc,orr)){
    p.c=oc; p.r=orr;                      // nothing gets dragged onto the lever, the doorway, or a gate
    slide(p,dc,dr);                       // it follows you at exactly your pace
    player.heave=MOVE_CD;                 // dragging is work too
    puffAt(oc*CT+16, orr*CT+16, '#8a7458', 3);
    sfx.pick&&sfx.pick();
  }
  return true;
}
function nearLaunch(){
  return Math.abs(player.c-launch.c)<=1 && Math.abs(player.r-launch.r)<=1;
}
function doLaunch(){
  if(phase!=='build') return;
  /* gates and ratchets snap back to their authored state: every flight is
     repeatable, and a failed one still costs nothing */
  for(const g of gates){ g.open=g.init; g.anim=0; }
  for(const p of pieces) if(p.kind==='ratch'){ p.or=p.or0; p.spin=0; }
  plateLatch='';
  /* snapshot the yard as built: a failed flight restores spent bombs AND the
     cracked stone they opened (Scott: "the bombs do not reappear" — a fizzle
     after a detonation used to leave the yard quietly unwinnable) */
  flightSnap={ pieces:pieces.map(p=>Object.assign({},p)), cracked:new Set(cracked) };
  ball={x:launch.c*CT+16, y:launch.r*CT+16,
        vx:launch.dir[0]*BSPD, vy:launch.dir[1]*BSPD, kick:0};
  trail=[];
  phase='flight'; flightT=0; flights++; mirLatch='';
  sfx.task&&sfx.task();
}
function detonate(p){
  pieces.splice(pieces.indexOf(p),1);
  shake=8; sfx.explode&&sfx.explode();
  puffAt(p.c*CT+16, p.r*CT+16, '#ffb04a', 14);
  for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
    const k=K(p.c+dc, p.r+dr);
    if(cracked.has(k)){
      cracked.delete(k);
      puffAt((p.c+dc)*CT+16, (p.r+dr)*CT+16, '#c8b8a0', 8);
    }
  }
}
function fizzle(why){
  ball=null; phase='build';
  if(flightSnap){                        // the flight never happened, materially
    pieces=flightSnap.pieces.map(p=>Object.assign({},p));
    cracked=new Set(flightSnap.cracked);
  }
  msg=why||'The ball gives out. The yard is exactly as you built it — powder and stone restored.';
  msgT=210;
  sfx.denied&&sfx.denied();
}
function ballTick(){
  flightT++;
  /* the whole game is predicting straight lines — so draw the line it just
     took. Purely cosmetic: the trail never touches collision. */
  trail.push(ball.x, ball.y);
  if(trail.length>36) trail.splice(0,2);
  if(flightT>LIFE){ fizzle(); return; }
  let dist=BSPD;
  while(dist>0){
    const d=Math.min(SUB,dist); dist-=d;
    const f=d/BSPD;
    // axis-separated wall collision, same idea as every wall game here
    let nx=ball.x+ball.vx*f;
    if(solidTile(Math.floor((nx+Math.sign(ball.vx)*BALL_R)/CT), Math.floor(ball.y/CT))){
      ball.vx=-ball.vx; nx=ball.x+ball.vx*f; sfx.mine&&sfx.mine();
    }
    ball.x=nx;
    let ny=ball.y+ball.vy*f;
    if(solidTile(Math.floor(ball.x/CT), Math.floor((ny+Math.sign(ball.vy)*BALL_R)/CT))){
      ball.vy=-ball.vy; ny=ball.y+ball.vy*f; sfx.mine&&sfx.mine();
    }
    ball.y=ny;
    const bc=Math.floor(ball.x/CT), br=Math.floor(ball.y/CT);
    // the machinery
    const p=pieceAt(bc,br);
    if(p){
      const cx=bc*CT+16, cy=br*CT+16;
      if((p.kind==='mirA'||p.kind==='mirB'||p.kind==='ratch') && mirLatch!==K(bc,br)+''){
        if(Math.abs(ball.x-cx)<10 && Math.abs(ball.y-cy)<10){
          const vx=ball.vx, vy=ball.vy;
          const asA= p.kind==='mirA' || (p.kind==='ratch' && p.or==='A');
          if(asA){ ball.vx=-vy; ball.vy=-vx; }   // '/'
          else   { ball.vx= vy; ball.vy= vx; }   // '\'
          if(p.kind==='ratch'){                  // ...and the ratchet turns over
            p.or= p.or==='A'? 'B':'A'; p.spin=10;
          }
          ball.x=cx; ball.y=cy;
          mirLatch=K(bc,br)+'';
          sfx.pick&&sfx.pick();
        }
      } else if(p.kind==='bump'){
        const dx=ball.x-cx, dy=ball.y-cy, dd=Math.hypot(dx,dy);
        if(dd<BALL_R+11){
          const sp=Math.hypot(ball.vx,ball.vy);
          ball.vx=dx/(dd||1)*sp; ball.vy=dy/(dd||1)*sp;
          p.lit=10; sfx.mine&&sfx.mine();
        }
      } else if(p.kind==='bomb'){
        detonate(p);                       // the ball is the fuse; it sails on
      }
    }
    {
      const pp=pieceAt(bc,br);
      if(!pp || (pp.kind!=='mirA'&&pp.kind!=='mirB'&&pp.kind!=='ratch'))
        if(mirLatch && mirLatch!==K(bc,br)+'') mirLatch='';
    }
    /* THE LATCH: rolling over a plate toggles every gate — once per visit
       (the latch clears only after the ball leaves the tile, so a plate in
       a one-tile pocket still counts a bounce-on-the-spot as ONE crossing) */
    if(plateAt(bc,br)){
      const pk=K(bc,br)+'';
      if(plateLatch!==pk){
        plateLatch=pk;
        for(const g of gates){ g.open=!g.open; g.anim=10; }
        puffAt(bc*CT+16, br*CT+16, '#e8c15a', 5);
        sfx.task&&sfx.task();
      }
    } else if(plateLatch) plateLatch='';
    // the exit
    if(bc===exitAt.c && br===exitAt.r){
      phase='won'; wonT=WON_T; ball=null;
      sfx.win&&sfx.win();
      return;
    }
  }
}
function update(){
  if(shake>0) shake--;
  if(msgT>0) msgT--;
  if(player.st>0) player.st--;                       // the picture catches up to the grid
  if(player.heave>0) player.heave--;
  if(bufT>0) bufT--; else { bufC=0; bufR=0; }
  for(const p of pieces){ if(p.lit>0) p.lit--; if(p.spin>0) p.spin--; if(p.st>0) p.st--; }
  for(const g of gates) if(g.anim>0) g.anim--;
  for(let i=parts.length-1;i>=0;i--){
    const q=parts[i]; q.x+=q.vx; q.y+=q.vy; q.vy+=0.05;
    if(--q.life<=0) parts.splice(i,1);
  }
  // leaving is always allowed
  /* the menu owns the frame while it is up — the yard holds exactly as the
     wall menu holds Stonebreaker, so nothing slides under a list you are reading */
  if(yardUI){ yardMenuInput(); return; }
  { const yk=held['y']||held['Y'];
    if(yk && !yLatch.open){ yardUI=true; yardSel=level;
      yLatch=seedLatch(['ArrowUp','ArrowDown','Enter','Escape','y','Y']); return; }
    if(!yk) yLatch.open=false; }
  const ek=held['Escape'];
  if(ek && !eLatch){ eLatch=true;
    if(typeof startContraptionTrans==='function') startContraptionTrans('out');
    return; }
  if(!ek) eLatch=false;
  // R resets: in flight it recalls the ball; at rest it resets the pieces
  const rk=held['r']||held['R'];
  if(rk && !rLatch){ rLatch=true;
    if(phase==='flight') fizzle('Recalled. The yard is exactly as you built it.');
    else if(phase==='build') loadLvl(level);
  }
  if(!rk) rLatch=false;

  if(phase==='won'){
    if(--wonT<=0){
      if(level+1>=LEVELS.length){ phase='alldone'; }
      else { loadLvl(level+1); saveLvl(); }
    }
    return;
  }
  if(phase==='alldone'){
    if(held[' '] && !spaceLatch){ spaceLatch=true; loadLvl(0); saveLvl(); }
    if(!held[' ']) spaceLatch=false;
    return;
  }
  if(phase==='flight'){ ballTick(); return; }
  // BUILD: walk and shove
  if(moveCD>0) moveCD--;
  {
    const dc=(held['ArrowRight']||held['d']||held['D']?1:0)-(held['ArrowLeft']||held['a']||held['A']?1:0);
    const dr=(held['ArrowDown']||held['s']||held['S']?1:0)-(held['ArrowUp']||held['w']||held['W']?1:0);
    /* a tap shorter than one slide used to vanish — the yard simply ignored you.
       Remember the last direction asked for and spend it at the next boundary.
       ONLY A FRESH PRESS, AND ONLY DURING A SLIDE (Scott, 2026-08-21: 'it is now
       quite hard to just move one space or arrive at an exact location'). The
       first cut buffered every frame a key was DOWN, so an ordinary tap left an
       ECHO: the press stepped you at once, the next few frames refilled the
       buffer, and when the cooldown ran out the echo spent itself as a SECOND
       square. One tap, two cells — exactly the wrong feel for a game about
       lining things up. A key that is merely still held needs no buffer at all,
       because it gets read again at the boundary anyway. */
    const fresh = (dc && dc!==preC) || (dr && dr!==preR);
    /* the window is the cooldown ACTUALLY LEFT, not a constant: with the
       repeat delay in, a flat MOVE_CD+3 expired before the boundary it was
       waiting for, and a direction tapped mid-slide was silently dropped. */
    if(fresh && moveCD>0){ bufC=dc; bufR=dr; bufT=moveCD+3; }
    preC=dc; preR=dr;
    if(!dc && !dr) runT=false;                       // let go, and the delay re-arms
    /* decrement-THEN-commit: the frame a slide ends is the frame the next
       begins, so a held key produces one unbroken glide across the yard */
    if(moveCD===0){
      const wc = dc||bufC, wr = dr||bufR;
      if(wc||wr){
        const mdc=wc||0, mdr=wc?0:wr;
        if(held['Shift']) pull(mdc,mdr); else step(mdc,mdr);
        moveCD = runT? MOVE_CD : REPEAT_CD;         // see REPEAT_CD: the first one waits
        runT=true;
        bufC=0; bufR=0; bufT=0;
      }
    }
  }
  if(held[' '] && !spaceLatch){
    spaceLatch=true;
    if(nearLaunch()) doLaunch();
    else { msg='The lever is on the launcher — stand beside it and press SPACE.'; msgT=140; }
  }
  if(!held[' ']) spaceLatch=false;
}
function puffAt(x,y,color,n){
  for(let i=0;i<n;i++){
    const a=(i/n)*6.28;
    parts.push({x,y,vx:Math.cos(a)*1.4,vy:Math.sin(a)*1.4-0.4,life:14+(i%5)*3,color});
  }
}
/* ---------------- drawing ---------------- */
function tileXY(c,r){ return [c*CT, r*CT+HUD]; }
/* THE FLASH (Scott, 2026-08-21: "when I click Y key it flashes levels on
   contraption for a split second"). Opening the menu replaced the latch with a
   BARE object, so the very key still under his finger had no 'was down' record
   — and one frame later the menu read it as a brand-new press and closed itself.
   Stonebreaker never had this because its wall menu seeds every key it reads.
   Seed the same way: everything the menu listens for starts marked ALREADY
   DOWN, so nothing held at the moment of opening counts as a fresh press. */
function seedLatch(keys){
  const o={open:true};
  for(let i=1;i<=9;i++) o[String(i)]=1;
  for(const k of keys) o[k]=1;
  return o;
}
/* ---- THE YARD MENU ---- */
function yardMenuInput(){
  const press=k=>{ const d=!!held[k], was=!!yLatch[k]; yLatch[k]=d; return d&&!was; };
  const n=LEVELS.length;
  if(press('ArrowUp'))   yardSel=(yardSel+n-1)%n;
  if(press('ArrowDown')) yardSel=(yardSel+1)%n;
  for(let i=0;i<n && i<9;i++) if(press(String(i+1))) yardSel=i;
  if(press('Enter')){ yardUI=false; yLatch={open:true}; loadLvl(yardSel); saveLvl(); return; }
  /* yLatch.open is left SET on the way out: the same Y that closes the menu
     would otherwise be read as the Y that opens it again on the very next frame */
  /* eLatch too: the ESC that closes the menu is still held next frame, and
     the game's own ESC check would read it as "leave the contraption" */
  if(press('Escape')||press('y')||press('Y')){ yardUI=false; yLatch={open:true}; eLatch=true; }
}
function drawYardMenu(){
  ctx.fillStyle='rgba(6,8,13,.94)'; ctx.fillRect(0,0,RW,RH+HUD);
  ctx.textAlign='center'; ctx.font='bold 16px '+FONT; ctx.fillStyle='#e8c15a';
  ctx.fillText('THE YARDS', RW/2, 52);
  const rowH=30, top=88;
  for(let i=0;i<LEVELS.length;i++){
    const ry=top+i*rowH;
    if(i===yardSel){
      ctx.fillStyle='rgba(232,193,90,.14)';
      ctx.fillRect(RW/2-190, ry-15, 380, 22);
    }
    ctx.font='11px '+FONT; ctx.textAlign='right';
    ctx.fillStyle= i===yardSel? '#e8c15a':'#7a8298';
    ctx.fillText(String(i+1), RW/2-160, ry);
    ctx.textAlign='left'; ctx.font='bold 12px '+FONT;
    ctx.fillStyle= i===level? '#7fe7ff' : i===yardSel? '#f2e2b8' : '#c2c8d8';
    ctx.fillText(LEVELS[i].name + (i===level? '  ·  you are here':''), RW/2-146, ry);
  }
  ctx.textAlign='center'; ctx.font='11px '+FONT; ctx.fillStyle='#9a8f7a';
  ctx.fillText('ARROWS pick   ·   1-9 jump   ·   ENTER go   ·   ESC close', RW/2, RH+HUD-30);
  ctx.fillStyle='#6f7690';
  ctx.fillText('a yard you re-enter starts fresh — the arrangement is never half-saved', RW/2, RH+HUD-14);
}
function draw(){
  if(yardUI){ drawYardMenu(); return; }
  ctx.save();
  if(shake>0) ctx.translate((((frame*7)%5)-2)*shake*0.3, (((frame*13)%5)-2)*shake*0.25);
  const bg=ctx.createLinearGradient(0,HUD,0,HUD+GH*CT);
  bg.addColorStop(0,'#141824'); bg.addColorStop(1,'#0c0e16');
  ctx.fillStyle=bg; ctx.fillRect(0,0,RW,RH+HUD);
  /* THE FLAGSTONES. This is a puzzle you solve by counting squares and sighting
     down lanes, so the grid has to be genuinely visible — not a 2% checker you
     have to squint at. Every cell gets a grout line and a fixed grain value
     (hashed off its coordinates: there is no randomness anywhere in this game,
     including the paint). */
  for(let r=0;r<GH;r++) for(let c=0;c<GW;c++){
    const k=K(c,r);
    if(walls.has(k)||cracked.has(k)) continue;
    const [x,y]=tileXY(c,r), h=(c*7+r*13)%5;
    ctx.fillStyle='rgba(190,205,255,'+(0.012+h*0.005).toFixed(3)+')';
    ctx.fillRect(x,y,CT,CT);
    ctx.strokeStyle='rgba(0,0,0,.20)'; ctx.lineWidth=1;
    ctx.strokeRect(x+0.5,y+0.5,CT-1,CT-1);
    ctx.strokeStyle='rgba(255,255,255,.045)';       // the lit lip of each stone
    ctx.beginPath(); ctx.moveTo(x+1.5,y+1.5); ctx.lineTo(x+CT-1.5,y+1.5); ctx.stroke();
  }
  /* stone casts DOWN-RIGHT onto the floor. Drawn as its own pass before any
     masonry so interior shadows are covered by the next block along, and only
     the exposed faces of a run actually show one. */
  /* three offset passes instead of one flat rectangle: a single hard-edged
     black copy reads as a second block sitting behind the stone, not as light
     falling past it. Stepping the offset builds a cheap penumbra. */
  for(const [dx,dy,a] of [[2,2.5,'.15'],[4,5,'.13'],[6,7.5,'.10']]){
    ctx.fillStyle='rgba(0,0,0,'+a+')';
    for(let r=0;r<GH;r++) for(let c=0;c<GW;c++){
      const k=K(c,r);
      if(!walls.has(k) && !cracked.has(k)) continue;
      const [x,y]=tileXY(c,r);
      ctx.fillRect(x+dx,y+dy,CT,CT);
    }
  }
  // walls
  for(let r=0;r<GH;r++) for(let c=0;c<GW;c++){
    const k=K(c,r), [x,y]=tileXY(c,r);
    if(walls.has(k)){
      /* lifted well clear of the floor's value range — a yard where you cannot
         instantly tell wall from floor is a yard you cannot plan a shot in */
      const g=ctx.createLinearGradient(0,y,0,y+CT);
      g.addColorStop(0,'#59617a'); g.addColorStop(0.55,'#414859'); g.addColorStop(1,'#2b3040');
      ctx.fillStyle=g; ctx.fillRect(x,y,CT,CT);
      ctx.fillStyle='rgba(255,255,255,.16)'; ctx.fillRect(x,y,CT,2);        // top bevel
      ctx.fillStyle='rgba(0,0,0,.35)';      ctx.fillRect(x,y+CT-3,CT,3);    // bottom lip
      ctx.strokeStyle='rgba(10,12,20,.7)'; ctx.lineWidth=1.2;
      ctx.strokeRect(x+0.5,y+0.5,CT-1,CT-1);
      ctx.strokeStyle='rgba(0,0,0,.30)';                                     // one course line
      ctx.beginPath(); ctx.moveTo(x+1,y+CT/2+0.5); ctx.lineTo(x+CT-1,y+CT/2+0.5); ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.06)';
      ctx.beginPath(); ctx.moveTo(x+1,y+CT/2+2.5); ctx.lineTo(x+CT-1,y+CT/2+2.5); ctx.stroke();
    } else if(cracked.has(k)){
      const g=ctx.createLinearGradient(0,y,0,y+CT);
      g.addColorStop(0,'#6a5f4c'); g.addColorStop(1,'#453d30');
      ctx.fillStyle=g; ctx.fillRect(x,y,CT,CT);
      ctx.strokeStyle='rgba(15,12,8,.6)'; ctx.lineWidth=1.2;
      ctx.strokeRect(x+0.5,y+0.5,CT-1,CT-1);
      ctx.strokeStyle='rgba(20,15,8,.75)'; ctx.lineWidth=1.3;   // the cracks
      ctx.beginPath(); ctx.moveTo(x+7,y+3); ctx.lineTo(x+13,y+13); ctx.lineTo(x+8,y+22); ctx.lineTo(x+14,y+29); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+22,y+4); ctx.lineTo(x+18,y+14); ctx.lineTo(x+25,y+24); ctx.stroke();
    }
  }
  // plates (floor furniture — under everything)
  for(const q of plates){
    const [x,y]=tileXY(q.c,q.r), cx=x+16, cy=y+16;
    const p=0.5+0.5*Math.sin(frame*0.07+q.c);
    ctx.fillStyle='#1a1e2c';
    ctx.beginPath(); ctx.arc(cx,cy,11,0,7); ctx.fill();
    ctx.strokeStyle='#3a4258'; ctx.lineWidth=2; ctx.stroke();
    ctx.strokeStyle='rgba(232,193,90,'+(0.35+0.35*p).toFixed(2)+')';
    ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.arc(cx,cy,7,0,7); ctx.stroke();
    ctx.fillStyle='rgba(232,193,90,'+(0.25+0.3*p).toFixed(2)+')';
    ctx.beginPath(); ctx.arc(cx,cy,2.5,0,7); ctx.fill();
    for(let i=0;i<4;i++){                        // rivets
      const a=i*1.5708+0.785;
      ctx.fillStyle='#4a5268';
      ctx.beginPath(); ctx.arc(cx+Math.cos(a)*9.5,cy+Math.sin(a)*9.5,1.3,0,7); ctx.fill();
    }
  }
  // gates (a portcullis in the wall line)
  for(const g of gates){
    const [x,y]=tileXY(g.c,g.r);
    const hot=g.anim>0? g.anim/10:0;
    ctx.fillStyle='#232838'; ctx.fillRect(x,y,CT,4); ctx.fillRect(x,y+CT-4,CT,4);
    ctx.fillStyle='#3a4254'; ctx.fillRect(x+1,y,3,6); ctx.fillRect(x+CT-4,y,3,6);
    ctx.fillRect(x+1,y+CT-6,3,6); ctx.fillRect(x+CT-4,y+CT-6,3,6);
    if(g.open){
      ctx.strokeStyle='rgba(127,219,127,'+(0.25+0.5*hot).toFixed(2)+')';
      ctx.lineWidth=1.2; ctx.strokeRect(x+3.5,y+3.5,CT-7,CT-7);
      ctx.fillStyle='rgba(127,219,127,.5)';
      for(let i=0;i<4;i++){ ctx.fillRect(x+6+i*6,y+2,2.4,4); ctx.fillRect(x+6+i*6,y+CT-6,2.4,4); }
    } else {
      const gl=ctx.createLinearGradient(0,y,0,y+CT);
      gl.addColorStop(0,'#4a4436'); gl.addColorStop(1,'#332e22');
      ctx.fillStyle=gl;
      for(let i=0;i<4;i++) ctx.fillRect(x+5+i*6.4,y+2,3,CT-4);
      ctx.fillStyle='rgba(232,193,90,'+(0.25+0.55*hot).toFixed(2)+')';
      for(let i=0;i<4;i++) ctx.fillRect(x+5+i*6.4,y+2,3,3);
      ctx.strokeStyle='rgba(15,12,8,.6)'; ctx.lineWidth=1;
      ctx.strokeRect(x+0.5,y+0.5,CT-1,CT-1);
    }
  }
  // launcher
  {
    const [x,y]=tileXY(launch.c,launch.r), cx=x+16, cy=y+16;
    const p=0.5+0.5*Math.sin(frame*0.08);
    ctx.fillStyle='#2a2f40'; ctx.beginPath(); ctx.arc(cx,cy,13,0,7); ctx.fill();
    ctx.strokeStyle='#e8c15a'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='rgba(232,193,90,'+(0.5+0.4*p).toFixed(2)+')';
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(Math.atan2(launch.dir[1],launch.dir[0]));
    ctx.beginPath(); ctx.moveTo(-4,-6); ctx.lineTo(8,0); ctx.lineTo(-4,6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // exit
  {
    const [x,y]=tileXY(exitAt.c,exitAt.r), cx=x+16, cy=y+16;
    const p=0.5+0.5*Math.sin(frame*0.06+2);
    const gl=ctx.createRadialGradient(cx,cy,2,cx,cy,20);
    gl.addColorStop(0,'rgba(127,219,127,'+(0.35+0.25*p).toFixed(2)+')');
    gl.addColorStop(1,'rgba(90,200,110,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(cx,cy,20,0,7); ctx.fill();
    ctx.strokeStyle='#7fdb7f'; ctx.lineWidth=2.2;
    ctx.beginPath(); ctx.ellipse(cx,cy,11,13,0,0,7); ctx.stroke();
    ctx.strokeStyle='rgba(127,219,127,'+(0.4+0.3*p).toFixed(2)+')';
    ctx.beginPath(); ctx.ellipse(cx,cy,6,8,0,0,7); ctx.stroke();
  }
  // pieces — each one slides the tile it was just shoved across
  for(const p of pieces){
    const [ox,oy]=slid(p);
    const [tx,ty]=tileXY(p.c,p.r), x=tx+ox, y=ty+oy, cx=x+16, cy=y+16;
    /* a contact shadow is the whole difference between a thing STANDING ON the
       floor and a thing PAINTED ON it. Bombs sit lower and squatter than slabs. */
    ctx.fillStyle='rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(cx+2, cy+12, p.kind==='bomb'? 9:13, p.kind==='bomb'? 3.5:4.5, 0,0,7);
    ctx.fill();
    if(p.kind==='block'){
      const g=ctx.createLinearGradient(0,y+3,0,y+CT-3);
      g.addColorStop(0,'#9a8a6a'); g.addColorStop(1,'#5f5440');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.roundRect? ctx.roundRect(x+3,y+3,CT-6,CT-6,4):ctx.rect(x+3,y+3,CT-6,CT-6); ctx.fill();
      ctx.strokeStyle='rgba(25,20,12,.7)'; ctx.lineWidth=1.4; ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.14)'; ctx.fillRect(x+6,y+6,CT-12,3);
    } else if(p.kind==='mirA'||p.kind==='mirB'){
      ctx.fillStyle='#20242f';
      ctx.beginPath(); ctx.roundRect? ctx.roundRect(x+3,y+3,CT-6,CT-6,4):ctx.rect(x+3,y+3,CT-6,CT-6); ctx.fill();
      ctx.strokeStyle='rgba(10,12,18,.7)'; ctx.lineWidth=1.2; ctx.stroke();
      /* the mirror is the real tool of the game, so it gets the real chrome:
         a five-stop bar (dark core between two bright faces reads as round
         polished metal), pinned end caps so its 45° is unmistakable, and a
         travelling sheen */
      const a= p.kind==='mirA'? -0.785 : 0.785;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(a);
      const mg=ctx.createLinearGradient(0,-4,0,4);
      mg.addColorStop(0,'#f2f7ff'); mg.addColorStop(0.28,'#c3d8ee');
      mg.addColorStop(0.52,'#5d7a99'); mg.addColorStop(0.76,'#bccfe6');
      mg.addColorStop(1,'#eef4ff');
      ctx.fillStyle=mg; ctx.fillRect(-12,-3.5,24,7);
      ctx.strokeStyle='rgba(15,24,38,.85)'; ctx.lineWidth=1; ctx.strokeRect(-12,-3.5,24,7);
      const sh=((frame*0.8)%34)-17;
      ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillRect(sh-1,-3.5,3,7);
      ctx.fillStyle='#6b7488';                          // the pins it pivots on
      ctx.beginPath(); ctx.arc(-12,0,2.2,0,7); ctx.arc(12,0,2.2,0,7); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(-12.6,-0.6,0.9,0,7); ctx.arc(11.4,-0.6,0.9,0,7); ctx.fill();
      ctx.restore();
    } else if(p.kind==='ratch'){
      ctx.fillStyle='#2a2416';
      ctx.beginPath(); ctx.roundRect? ctx.roundRect(x+3,y+3,CT-6,CT-6,4):ctx.rect(x+3,y+3,CT-6,CT-6); ctx.fill();
      ctx.strokeStyle='rgba(18,14,6,.7)'; ctx.lineWidth=1.2; ctx.stroke();
      ctx.strokeStyle='rgba(232,193,90,.35)'; ctx.lineWidth=1;   // the gear ring
      ctx.beginPath(); ctx.arc(cx,cy,12.5,0,7); ctx.stroke();
      for(let i=0;i<8;i++){
        const ga=i*0.785+frame*0.01;
        ctx.fillStyle='rgba(232,193,90,.45)';
        ctx.fillRect(cx+Math.cos(ga)*12.5-1, cy+Math.sin(ga)*12.5-1, 2, 2);
      }
      let a= p.or==='A'? -0.785 : 0.785;         // it swings INTO its new facing
      if(p.spin>0) a += (p.or==='A'? 1:-1)*(p.spin/10)*1.5708;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(a);
      const mg=ctx.createLinearGradient(0,-4,0,4);
      mg.addColorStop(0,'#ffe9a8'); mg.addColorStop(0.5,'#c89b3c'); mg.addColorStop(1,'#ffe9a8');
      ctx.fillStyle=mg; ctx.fillRect(-12,-3,24,6);
      ctx.strokeStyle='rgba(60,40,10,.8)'; ctx.lineWidth=1; ctx.strokeRect(-12,-3,24,6);
      const sh2=((frame*0.8)%34)-17;
      ctx.fillStyle='rgba(255,255,255,.45)'; ctx.fillRect(sh2-1,-3,3,6);
      ctx.restore();
    } else if(p.kind==='bump'){
      const hot=p.lit>0? p.lit/10:0;
      const gl=ctx.createRadialGradient(cx,cy,2,cx,cy,16);
      gl.addColorStop(0,'rgba(255,225,120,'+(0.2+0.4*hot).toFixed(2)+')');
      gl.addColorStop(1,'rgba(255,180,60,0)');
      ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(cx,cy,16,0,7); ctx.fill();
      const g=ctx.createRadialGradient(cx-3,cy-3,2,cx,cy,11);
      g.addColorStop(0, hot? '#fff2b0':'#e8c976'); g.addColorStop(1,'#8a6a28');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,11,0,7); ctx.fill();
      ctx.strokeStyle='rgba(40,28,8,.7)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle= hot? '#ffffff':'#ffe98a';
      ctx.beginPath(); ctx.arc(cx,cy,3.5,0,7); ctx.fill();
    } else if(p.kind==='bomb'){
      /* THE BOMB HAD NO VALUE RANGE (Scott, 2026-08-21: "give the bomb
         highlights or something to make it stand out from the black bg").
         It was a flat #181a20 disc, and the yard floor runs #0c0e16 to #141824
         — so the one piece that decides whether a cracked wall ever opens was
         painted almost exactly the colour of the ground under it. The same
         wall-and-floor-must-never-share-a-value rule, applied to a piece.
         The light in this yard comes from the UPPER LEFT (every shadow in the
         file falls down-right), so: a lit crown, a hard rim along the lit
         edge, a dark rim along the shaded one to keep it off its own shadow,
         and the fuse throwing real warm light onto the top of the iron. It is
         still a black iron ball — it just has a range now. */
      const bx0=cx-1, by0=cy+2;
      const bg2=ctx.createRadialGradient(bx0-4,by0-4,1, bx0,by0,10.5);
      bg2.addColorStop(0,'#6d7686'); bg2.addColorStop(0.45,'#333a48');
      bg2.addColorStop(1,'#0e1016');
      ctx.fillStyle=bg2;
      ctx.beginPath(); ctx.arc(bx0,by0,9,0,7); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,.75)'; ctx.lineWidth=1.4;   // off its own shadow
      ctx.beginPath(); ctx.arc(bx0,by0,9,0.35,2.4); ctx.stroke();
      ctx.strokeStyle='rgba(198,214,245,.62)'; ctx.lineWidth=1.5;   // the lit edge
      ctx.beginPath(); ctx.arc(bx0,by0,8.4,3.5,5.6); ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.34)';                        // specular
      ctx.beginPath(); ctx.ellipse(bx0-3.6,by0-3.8,2.6,1.9,-0.6,0,7); ctx.fill();
      const sp=(frame>>3)%2;
      const gl=ctx.createRadialGradient(cx+12.5,cy-9,0, cx+12.5,cy-9, sp?15:12);
      gl.addColorStop(0,'rgba(255,214,120,'+(sp?0.42:0.30)+')');    // the fuse LIGHTS things
      gl.addColorStop(1,'rgba(255,190,90,0)');
      ctx.fillStyle=gl;
      ctx.beginPath(); ctx.arc(cx+12.5,cy-9, sp?15:12, 0,7); ctx.fill();
      ctx.strokeStyle='#6a6154'; ctx.lineWidth=1.8; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(cx+3,cy-5); ctx.quadraticCurveTo(cx+8,cy-11,cx+12,cy-9); ctx.stroke();
      ctx.fillStyle=sp? '#ffffff':'#ffdc6a';
      ctx.beginPath(); ctx.arc(cx+12.5,cy-9,2.4,0,7); ctx.fill();
    }
  }
  /* YOU, THE ARRANGER.
     One full stride per square, locked to the slide: the legs scissor exactly
     once per tile and the lead leg alternates every commit. That lockstep is
     what makes the walk readable at a glance — you can count squares by
     watching the legs, which is the Digger trick. Standing still, he breathes. */
  {
    const [pox,poy]=slid(player);
    const [tx,ty]=tileXY(player.c,player.r), cx=tx+16+pox, cy=ty+22+poy;
    const moving = player.st>0;
    const ph = moving? (1-player.st/MOVE_CD) : 0;        // 0 → 1 across one square
    const sw = moving? Math.sin(ph*Math.PI)*(player.gait? 1:-1) : 0;   // stride swing
    const rise = moving? Math.abs(Math.sin(ph*Math.PI))*1.6 : 0;       // the body lifts mid-stride
    const bob = moving? 0 : Math.sin(frame*0.06)*0.7;                  // idle breath
    const face = player.face;
    const fx = face==='l'? -1 : 1;                      // which way he is turned
    const back = face==='u';                            // walking away: you see his back
    const hv = player.heave>0? player.heave/MOVE_CD : 0;
    const lean = (face==='l'? -1 : face==='r'? 1 : 0) * (1.5 + hv*2.2);
    const top = cy-13-rise+bob;

    ctx.fillStyle='rgba(0,0,0,.34)';                    // shadow tightens as he lifts
    ctx.beginPath(); ctx.ellipse(cx+1.5,cy+5.5,8.5-rise*0.9,3.2-rise*0.3,0,0,7); ctx.fill();

    // legs, behind the coat
    ctx.strokeStyle='#6d5433'; ctx.lineWidth=3.6; ctx.lineCap='round';
    for(const s of [1,-1]){
      const k=sw*s*(face==='u'||face==='d'? 3.2 : 5.0);
      ctx.beginPath();
      ctx.moveTo(cx-2.2*fx+ (face==='u'||face==='d'? s*3 : 0), cy-2+bob);
      ctx.lineTo(cx-2.2*fx+k + (face==='u'||face==='d'? s*3 : 0), cy+5);
      ctx.stroke();
    }

    // the coat
    const g=ctx.createLinearGradient(0,top,0,cy+4);
    g.addColorStop(0,'#c79a63'); g.addColorStop(0.55,'#9c7444'); g.addColorStop(1,'#6d5130');
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.moveTo(cx-6+lean*0.3, cy+4);
    ctx.quadraticCurveTo(cx-7+lean, top+3, cx-4+lean, top);
    ctx.lineTo(cx+4+lean, top);
    ctx.quadraticCurveTo(cx+7+lean, top+3, cx+6+lean*0.3, cy+4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(30,20,10,.6)'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.fillStyle='rgba(255,240,215,.22)';           // a lit shoulder
    ctx.fillRect(cx-4+lean, top+1, 8, 2);

    // head, turned the way he walks
    const hy=top-3.5;
    ctx.fillStyle='#f6d3a6'; ctx.beginPath(); ctx.arc(cx+lean*1.1,hy,5.2,0,7); ctx.fill();
    ctx.strokeStyle='rgba(30,20,10,.5)'; ctx.lineWidth=1.2; ctx.stroke();
    if(back){                                            // no face, just his hair
      ctx.fillStyle='#4a3a24';
      ctx.beginPath(); ctx.arc(cx+lean*1.1,hy,5,0,7); ctx.fill();
    } else {
      ctx.fillStyle='#1a1a20';
      const ex=(face==='d')? 0 : fx*1.3;
      ctx.beginPath();
      ctx.arc(cx+lean*1.1-1.8+ex, hy-1, 0.95, 0, 7);
      ctx.arc(cx+lean*1.1+1.8+ex, hy-1, 0.95, 0, 7);
      ctx.fill();
    }

    /* the wrench swings counter to the legs — and when he is shoving, both
       hands go forward into the stone instead */
    const aw = hv>0? 0 : -sw*2.2;
    ctx.strokeStyle='#9aa0aa'; ctx.lineWidth=2; ctx.lineCap='round';
    const wx=cx+lean+fx*(6+hv*3), wy=cy-6+aw;
    ctx.beginPath(); ctx.moveTo(wx,wy); ctx.lineTo(wx+fx*5,wy+5+aw*0.4); ctx.stroke();
    ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.arc(wx+fx*6,wy+6+aw*0.4,2.4, 0.6, 4.6); ctx.stroke();
  }
  /* the line it just took. Drawn UNDER the ball, fading back along the path —
     this is a game about predicting straight lines, and seeing the last one
     is how a failed flight teaches you anything. */
  if(ball && trail.length>=4){
    ctx.lineCap='round';
    for(let i=2;i<trail.length;i+=2){
      const a=(i/trail.length)*0.34;
      const jump=Math.abs(trail[i]-trail[i-2])>CT || Math.abs(trail[i+1]-trail[i-1])>CT;
      if(jump) continue;                                  // never bridge a bounce
      ctx.strokeStyle='rgba(190,225,255,'+a.toFixed(3)+')';
      ctx.lineWidth=1+ (i/trail.length)*2.4;
      ctx.beginPath();
      ctx.moveTo(trail[i-2],trail[i-1]+HUD); ctx.lineTo(trail[i],trail[i+1]+HUD);
      ctx.stroke();
    }
  }
  // the ball, mid-flight
  if(ball){
    const gl=ctx.createRadialGradient(ball.x,ball.y+HUD,1,ball.x,ball.y+HUD,10);
    gl.addColorStop(0,'rgba(255,255,255,.5)'); gl.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(ball.x,ball.y+HUD,10,0,7); ctx.fill();
    const g=ctx.createRadialGradient(ball.x-1.5,ball.y+HUD-1.5,0.5,ball.x,ball.y+HUD,BALL_R);
    g.addColorStop(0,'#ffffff'); g.addColorStop(1,'#b8c4d8');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ball.x,ball.y+HUD,BALL_R,0,7); ctx.fill();
  }
  for(const q of parts){
    ctx.globalAlpha=Math.min(1,q.life/10)*0.85;
    ctx.fillStyle=q.color;
    ctx.beginPath(); ctx.arc(q.x,q.y+HUD,2,0,7); ctx.fill();
    ctx.globalAlpha=1;
  }
  // header
  ctx.fillStyle='#0c0a14'; ctx.fillRect(0,0,RW,HUD);
  ctx.strokeStyle='#2a2436'; ctx.beginPath(); ctx.moveTo(0,HUD-0.5); ctx.lineTo(RW,HUD-0.5); ctx.stroke();
  ctx.textAlign='left'; ctx.font='bold 13px '+FONT; ctx.fillStyle='#7fd0e8';
  ctx.fillText('CONTRAPTION', 12, 20);
  ctx.font='11px '+FONT; ctx.fillStyle='#8a8298';
  ctx.fillText('YARD '+(level+1)+'/'+LEVELS.length+' — '+LEVELS[level].name, 12, 38);
  ctx.textAlign='right'; ctx.font='10px '+FONT; ctx.fillStyle='#6f7690';
  ctx.fillText(phase==='flight'? 'the machine is running — R recalls the ball'
             : 'ARROWS shove · SHIFT-ARROWS pull · SPACE launch · Y yards · R reset · ESC leave', RW-12, 30);
  // messages
  if(msgT>0){
    ctx.globalAlpha=Math.min(1,msgT/30);
    ctx.textAlign='center'; ctx.font='11px '+FONT; ctx.fillStyle='#e8dcc0';
    ctx.fillText(msg, RW/2, HUD+18);
    ctx.globalAlpha=1;
  } else if(phase==='build' && flights===0){
    /* the hint used to float loose over the top course of stone at #6f7690 and
       was effectively unreadable. Same fault as the Rose Window whisper: give
       floating text its own plate to sit on and then it can be quiet safely. */
    ctx.textAlign='center'; ctx.font='11px '+FONT;
    const t=LEVELS[level].hint, w=ctx.measureText(t).width;
    ctx.fillStyle='rgba(8,10,18,.82)';
    ctx.beginPath();
    ctx.roundRect? ctx.roundRect(RW/2-w/2-10, HUD+6, w+20, 18, 9)
                 : ctx.rect(RW/2-w/2-10, HUD+6, w+20, 18);
    ctx.fill();
    ctx.strokeStyle='rgba(127,208,232,.22)'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#9aa4bd';
    ctx.fillText(t, RW/2, HUD+19);
  }
  if(phase==='won'){
    ctx.textAlign='center'; ctx.font='bold 26px '+FONT; ctx.fillStyle='#7fdb7f';
    ctx.fillText('THROUGH!', RW/2, 200);
  }
  if(phase==='alldone'){
    ctx.fillStyle='rgba(6,8,13,.8)'; ctx.fillRect(0,0,RW,RH+HUD);
    ctx.textAlign='center'; ctx.font='bold 22px '+FONT; ctx.fillStyle='#e8c15a';
    ctx.fillText('THE CONTRAPTION RESTS', RW/2, 180);
    ctx.font='12px '+FONT; ctx.fillStyle='#c2c8d8';
    ctx.fillText('Every yard ran true. More yards will arrive.', RW/2, 210);
    ctx.fillText('SPACE starts over · ESC returns to the arcade', RW/2, 234);
  }
  ctx.restore();
}
function enter(){
  let n=0;
  try{ n=Math.min(LEVELS.length-1, Math.max(0, +(localStorage.getItem(SAVEK)||0))); }catch(e){}
  loadLvl(n);
}
window.ContraptionLayer={ enter, update, draw,
  _t:{ LEVELS, GW, GH, CT, BALL_R, BSPD, LIFE, WON_T, SAVEK, MOVE_CD, slid,
      REPEAT_CD, get bufC(){return bufC;}, get bufR(){return bufR;}, get runT(){return runT;},
      yardMenuInput, drawYardMenu,
      get yardUI(){return yardUI;}, set yardUI(v){yardUI=v;},
      get yardSel(){return yardSel;}, set yardSel(v){yardSel=v;},
    loadLvl, step, pull, doLaunch, detonate, fizzle, ballTick, update, nearLaunch,
    pieceAt, solidTile, walkable, K, puffAt,
    get level(){return level;}, set level(v){level=v;},
    get phase(){return phase;}, set phase(v){phase=v;},
    get ball(){return ball;}, set ball(v){ball=v;},
    get player(){return player;}, get pieces(){return pieces;},
    get walls(){return walls;}, get cracked(){return cracked;},
    get launch(){return launch;}, get exitAt(){return exitAt;},
    get plates(){return plates;}, get gates(){return gates;}, gateAt, plateAt,
    get flightT(){return flightT;}, set flightT(v){flightT=v;},
    get msg(){return msg;}, get wonT(){return wonT;}, set wonT(v){wonT=v;},
    setPlayer(c,r){ player.c=c; player.r=r; } }
};

})();
