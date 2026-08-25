"use strict";
/* ============================================================
   GRISHNAK — 3D PAC   (Pac-Mania-style raised maze, v4)

   v2 was an oblique extrusion: every row the same size, tops all
   displaced the same way. It read as flat, and the displaced tops
   buried whatever stood behind them. v3 is a real PERSPECTIVE
   projection — a pinhole camera behind and above the player:

       d  = D0 + (camWY - wy)          depth of a world point
       s  = F / d                      scale at that depth
       sx = CX  + (wx - camX) * s
       sy = HOR + (CAMH - wz) * s

   What that buys, all at once:
     - rows near the bottom are LARGE (~47px) and compress toward
       the top (~22px): genuine depth, not extrusion;
     - corridors converge toward the centre line as they recede;
     - side faces flip across the screen centre — blocks left of
       centre show their right face, blocks right show their left,
       exactly like the arcade original;
     - walls are LOW (WZ 15 world units ≈ a third of a near tile),
       so they occlude feet, not faces — and the player carries a
       soft halo drawn above everything, so you can never lose
       yourself behind a wall. The bonus item hovers above wall
       height for the same reason.

   Collision and movement are untouched — still a plain
   rectangular grid; the camera is drawing-only, and the headless
   tests keep driving the real engine.
   ============================================================ */
(function(){

const COLS=19, ROWS=21;
const TW=30, TH=26;                  // world units per tile
const BOARD_W=COLS*TW, BOARD_H=ROWS*TH;

/* ---- the camera ----
   Derived from two choices: scale ~1.05 at the window's south edge,
   ~0.68 at its north edge, ~11 rows in view. v5 pulled the camera CLOSER
   (D0 655->560) so the taper is visible, and added SKEW — a world-space
   shear that drifts the board bottom-left -> top-right, the diagonal the
   arcade original has. Near rows sit square; far rows slide right. */
const D0=560, F=588, CAMH=1021;
const HOR=430-CAMH*F/D0;             // horizon line (far off-screen: gentle tilt)
const CX=RW/2, camX=BOARD_W/2;
const VS=150;                        // window extends this far south of camWY
const WZ=15;                         // wall height in world units
const SKEW=0.27;                     // lateral world-units per unit of depth
const CAM_MIN=153, CAM_MAX=404;
let camWY=CAM_MAX;

const PSTEP=0.075, GSTEP=0.060;
/* 2/3 gravity at the same launch speed = 1.5x height AND 1.5x hang time,
   and since ground speed is unchanged the arc lands 1.5x further too
   (one knob moves all three — Scott's 50% ask, 2026-08-06) */
const JUMP_V=-3.1, JUMP_G=0.15;
const JUMP_PEAK=JUMP_V*JUMP_V/(2*JUMP_G);   // ~32
const ZSCALE=1.15;                   // world-z per game-z; apex clears WZ
const FRIGHT_T=420;
const FRUIT_AT=[0.35,0.70];

/* ---------------- the board ---------------- */
//HIGHMAZE-START
const MAZE=[
'###################',
'#........#........#',
'#o##.###.#.###.##o#',
'#.................#',
'#.##.#.#####.#.##.#',
'#....#...#...#....#',
'###.##.#####.##.###',
'...................',
'#....####-####....#',
'#....#       #....#',
'#....#########....#',
'#.................#',
'#.###.##.#.##.###.#',
'#.#.....#.#.....#.#',
'#.#.###.#.#.###.#.#',
'#....#...P...#....#',
'##.#.#.#####.#.#.##',
'#..#.#...#...#.#..#',
'#o.#.###.#.###.#.o#',
'...................',
'###################'
];
//HIGHMAZE-END

/* THE SAND ROADS has its own board — same pen block (rows 8-10) and start
   tile, completely different corridors. Verified by the same flood-fill. */
const MAZE_EGYPT=[
'###################',
'#o.......#.......o#',
'#.##.###.#.###.##.#',
'#.#.............#.#',
'#.#.##.#####.##.#.#',
'#......#...#......#',
'#.####.#.#.#.####.#',
'...................',
'#....####-####....#',
'#....#       #....#',
'#....#########....#',
'#......#...#......#',
'#.####.#.#.#.####.#',
'#.#.............#.#',
'#...###.#.#.###...#',
'#.#..#...P...#..#.#',
'#.#.####.#.####.#.#',
'#.....#..#..#.....#',
'#o###.#..#..#.###o#',
'...................',
'###################'
];

/* Three feature boards (Scott's parked 3D PAC menu, built 2026-08-08).
   'g' = GAP: an open pit. You JUMP it; falling in grounded costs a life.
   'w' = TIDEWAY: dry, crossable stone at LOW TIDE (with dots worth
         grabbing down there); rising water and death at HIGH TIDE.
         One big slow cycle — cross when the sea allows.
   'L' = STEEL LIFT: stand on it a beat and the gantry hoists you above
         the walls and carries you along its rail to the partner lift.
         Ghosts cannot touch what the crane is carrying.
   'v' = SPEED PILL: grab it for a burst of speed.
   Ghosts treat gaps and tideways as walls — they detour; you don't have to. */
const MAZE_GROVE=[
'###################',
'#........#........#',
'#o##.###.#.###.##o#',
'#....g.......g....#',
'#.##.#.#####.#.##.#',
'#.g..#...#...#..g.#',
'###.##.#####.##.###',
'...................',
'#....####-####....#',
'#....#       #....#',
'#....#########....#',
'#......g...g......#',
'#.###.##.#.##.###.#',
'#.#..g..#.#..g..#.#',
'#.#.###.#.#.###.#.#',
'#....#...P...#....#',
'##.#.#.#####.#.#.##',
'#..#.#...#...#.#..#',
'#o.#.###.#.###.#.o#',
'...................',
'###################'
];
const MAZE_FOUNDRY=[
'###################',
'#o.......#.......o#',
'#.##.###.#.###.##.#',
'#.#..##.....##..#.#',
'#.#.##.#####.##.#.#',
'#......#.v.#......#',
'#.####.#.#.#.####.#',
'...................',
'#....####-####....#',
'#....#       #....#',
'#....#########....#',
'#......#...#......#',
'#.####.#.#.#.####.#',
'#.#......v......#.#',
'#...###.#.#.###...#',
'#.#..#...P...#..#.#',
'#.#.####.#.####.#.#',
'#.....#..#..#.....#',
'#o###.#..#..#.###o#',
'...................',
'###################'
];
const MAZE_CAUSEWAY=[
'###################',
'#........#........#',
'#o##.###.#.###.##o#',
'#.................#',
'#.##.#.#####.#.##.#',
'#.ww.#...#...#.ww.#',
'###.##.#####.##.###',
'...................',
'#....####-####....#',
'#....#       #....#',
'#....#########....#',
'#..www.......www..#',
'#.###.##.#.##.###.#',
'#.#.....#.#.....#.#',
'#.#.###.#.#.###.#.#',
'#....#...P...#....#',
'##.#.#.#####.#.#.##',
'#..#.#...#...#.#..#',
'#o.#.###.#.###.#.o#',
'...................',
'###################'
];

const MAZE_SHIPYARD=[
'###################',
'#...##...#...##...#',
'#o##.###.#.###.##o#',
'#.L.............L.#',
'#.##.#.#####.#.##.#',
'#.##.#...#...#.##.#',
'###.##.#####.##.###',
'...................',
'#....####-####....#',
'#....#       #....#',
'#....#########....#',
'#.................#',
'#.###.##.#.##.###.#',
'#.#.....#.#.....#.#',
'#.#.###.#.#.###.#.#',
'#....#...P...#....#',
'##.#.#.#####.#.#.##',
'#.L#.#...#...#.#L.#',
'#o.#.###.#.###.#.o#',
'...................',
'###################'
];

/* THE HEARTHSIDE — the cozy screen (Scott, 2026-08-09). Cozy-game rules:
   NOTHING on this board hunts and nothing can kill. The four ghosts are
   CATS — they stroll the garden on their own errands, and touching one
   pets it (purr, +100; all four = +500). The power pellets are saucers
   of CREAM: drink one and the cats come trotting to YOU — the exact
   inversion of frightened mode. Pies never spoil. Fireflies, falling
   leaves, chimney smoke from the cottage. Eat when you like. */
const MAZE_HEARTH=[
'###################',
'#o.......#.......o#',
'#.####.#.#.#.####.#',
'#.#..#.......#..#.#',
'#.#.##.##.##.##.#.#',
'#...#...#.#...#...#',
'###.##.#####.##.###',
'...................',
'#....####-####....#',
'#....#       #....#',
'#....#########....#',
'#.......#.#.......#',
'#.#####.#.#.#####.#',
'#.#...#.....#...#.#',
'#.##.#.#####.#.##.#',
'#....#...P...#....#',
'##.#.#.#####.#.#.##',
'#..#.#...#...#.#..#',
'#o.#.###.#.###.#.o#',
'...................',
'###################'
];

/* THE SUMMIT — Scott's hill mechanic, REDESIGNED as a strategy screen
   (2026-08-11): the mountain now has ROUTES whose character comes from
   the physics, not decoration.
   · THE ROAD — a serpentine switchback up the face (in at c14, traverse,
     up at c4, traverse, out at c14). Every traverse is flat, and a flat
     step is a BREATHER — the ghosts' climb ledger clears — so the road
     is ghost-viable the whole way: the summit is defensible, never safe.
     The serpentine has no junctions: a chase up the road is a forced
     march for both sides.
   · THE CHUTES — 1-wide climbs at c2 and c16, walled off from the road,
     six straight ascents with nowhere to stand level. Ghosts tire on the
     4th climb and slide all the way back down; only pac (slow, exposed,
     committed) can top out. The chutes are the escape the road isn't.
   · The pen sits on the mid-mountain SHOULDER (elev 3), the village and
     its two power pellets at the base, and the ridge holds the two
     golden pellets — reachable by road (contested) or chute (earned). */
const MAZE_SUMMIT=[
'###################',
'#o.......#.......o#',
'#.................#',
'##.###########.#.##',
'##.#...........#.##',
'##.#.###########.##',
'##.#...........#.##',
'##.######.####.#.##',
'#....####-####....#',
'#....#       #....#',
'#....#########....#',
'#.................#',
'#.###.###.###.###.#',
'#.#.....#.#.....#.#',
'#.#.###.#.#.###.#.#',
'#....#...P...#....#',
'##.#.#.#####.#.#.##',
'#..#.#...#...#.#..#',
'#o.#.###.#.###.#.o#',
'...................',
'###################'
];
/* elevation per row, in terrace steps: 9 at the peak, 0 at the base.
   The pen sits at 3 — mid-mountain — so fresh ghosts start with a head
   start but still can't climb the last stretch to the top in one go. */
const SUMMIT_ELEV=[9,9,9,8,7,6,5,4,3,3,3,2,2,1,1,0,0,0,0,0,0];
const EH=6;                       // world-z per terrace step
const CLIMB_MAX=4;                // uphill squares a ghost manages before tiring
const HILL_CAM_MIN=93;            // camera may ride further north — the peak is TALL
let elevOn=false;
let vwrapOn=false;                // rows wrap too (THE QUADRANTS only)
const elevOf=r=> elevOn? SUMMIT_ELEV[Math.max(0,Math.min(ROWS-1,r))] : 0;
const EV=r=> elevOf(r)*EH;
/* smooth mid-step elevation — only row moves change height */
function entEV(e){ const e0=EV(e.r), e1=EV(e.r+e.dir.y); return e0+(e1-e0)*e.t; }
/* the struggle: speed multiplier for the tile you're stepping toward */
function slopeMul(e, up, down){
  if(!elevOn || !(e.dir.x||e.dir.y)) return 1;
  const d=elevOf(e.r+e.dir.y)-elevOf(e.r);
  return d>0? up : d<0? down : 1;
}
const camMin=()=> elevOn? HILL_CAM_MIN : CAM_MIN;

const HOUSE=[{r:9,c:7},{r:9,c:8},{r:9,c:10},{r:9,c:11}];
const DOOR={r:8,c:9};
const PEN={r0:8,r1:10,c0:5,c1:13};
const BONUS_TILE={r:11,c:9};

/* ---------------- themes ---------------- */
const THEMES={
  classic:{
    name:'3D WAKA',
    sky:['#0b1030','#171d46'],
    floor:'#241c3a', floorAlt:'#2a2142', floorEdge:'rgba(255,255,255,.035)',
    stud:'rgba(120,110,160,.35)',
    wallTop:'#3f7de8', wallTopLit:'#8fc4ff', wallFace:'#274ba0', wallDark:'#152a63',
    wallRound:7,
    dot:'#ffe9a8', dotGlow:'rgba(255,220,120,.55)',
    pellet:'#fff3c4', pelletGlow:'rgba(255,225,140,.75)',
    bonus:{name:'CHERRY', score:200, draw:drawCherry}
  },
  egypt:{
    name:'THE SAND ROADS',
    sky:['#2a1a10','#5a3418'],
    floor:'#c9a86a', floorAlt:'#d4b478', floorEdge:'rgba(255,255,255,.06)',
    stud:'rgba(120,90,40,.30)',
    wallTop:'#e0c07a', wallTopLit:'#fff0c0', wallFace:'#b8904e', wallDark:'#7a5a2e',
    wallRound:3, wallShape:'pyramid',
    dot:'#fff6d8', dotGlow:'rgba(255,240,190,.55)',
    pellet:'#9fe8ff', pelletGlow:'rgba(140,220,255,.75)',
    bonus:{name:'ANKH', score:300, draw:drawAnkh},
    maze:null   // MAZE_EGYPT — wired right after this table
  }
,
  grove:{
    name:'THE UNDERGROVE',
    sky:['#0a120c','#1a2c1a'],
    floor:'#20301e', floorAlt:'#263826', floorEdge:'rgba(180,255,160,.04)',
    stud:'rgba(140,200,120,.30)',
    wallTop:'#7a5a9a', wallTopLit:'#b490d8', wallFace:'#4c3a68', wallDark:'#2a2040',
    wallRound:7,
    dot:'#c8f0a0', dotGlow:'rgba(170,240,130,.5)',
    pellet:'#eaffc0', pelletGlow:'rgba(200,255,150,.75)',
    bonus:{name:'GLOWCAP', score:250, draw:drawGlowcap},
    maze:null
  },
  foundry:{
    name:'THE FOUNDRY',
    sky:['#180c08','#3a1a0e'],
    floor:'#2c2830', floorAlt:'#332e36', floorEdge:'rgba(255,160,80,.05)',
    stud:'rgba(255,150,60,.35)',
    wallTop:'#6a7484', wallTopLit:'#a8b4c4', wallFace:'#48505e', wallDark:'#262c38',
    wallRound:2,
    dot:'#ffb35a', dotGlow:'rgba(255,150,60,.55)',
    pellet:'#ffdf8a', pelletGlow:'rgba(255,190,90,.8)',
    bonus:{name:'INGOT', score:300, draw:drawIngot},
    maze:null
  },
  causeway:{
    name:'THE CAUSEWAY',
    sky:['#0c1424','#2a3a55'],
    floor:'#3e4a5e', floorAlt:'#465266', floorEdge:'rgba(200,230,255,.05)',
    stud:'rgba(180,220,255,.30)',
    wallTop:'#9aacb8', wallTopLit:'#d8e8ee', wallFace:'#5e7080', wallDark:'#38444e',
    wallRound:5,
    dot:'#e8f0f8', dotGlow:'rgba(220,240,255,.5)',
    pellet:'#ffe9a0', pelletGlow:'rgba(255,220,130,.8)',
    bonus:{name:'BOTTLE', score:250, draw:drawBottle},
    maze:null
  }
};
THEMES.shipyard={
  name:'THE SHIPYARD',
  sky:['#101420','#28303e'],
  floor:'#38404c', floorAlt:'#404854', floorEdge:'rgba(255,255,255,.045)',
  stud:'rgba(255,170,90,.30)',
  wallTop:'#8a5a3a', wallTopLit:'#c88a58', wallFace:'#5e3c26', wallDark:'#38241a',
  wallRound:2,
  dot:'#ffd8a0', dotGlow:'rgba(255,190,120,.5)',
  pellet:'#aef2ff', pelletGlow:'rgba(150,230,255,.8)',
  bonus:{name:'ANCHOR', score:300, draw:drawSmallAnchor},
  maze:null
};
THEMES.summit={
  name:'THE SUMMIT',
  sky:['#1c2c44','#8aa4c0'],
  floor:'#4e5a64', floorAlt:'#56626c', floorEdge:'rgba(255,255,255,.06)',
  stud:'rgba(225,238,246,.35)',
  wallTop:'#7a8a96', wallTopLit:'#cddbe6', wallFace:'#4a565e', wallDark:'#2c343a',
  wallRound:4,
  cliff:'#39434b', cliffLip:'rgba(238,246,252,.28)',
  dot:'#e8f4ff', dotGlow:'rgba(200,230,255,.5)',
  pellet:'#ffe9a0', pelletGlow:'rgba(255,220,130,.8)',
  bonus:{name:'FLAG', score:400, draw:drawFlag},
  hill:true,
  hint:'The road rests them; the chutes break them. Four climbs, no breather — they slide.',
  maze:null
};
THEMES.hearth={
  name:'THE HEARTHSIDE',
  sky:['#241418','#4a2a20'],
  floor:'#3a2c22', floorAlt:'#42332a', floorEdge:'rgba(255,200,120,.05)',
  stud:'rgba(255,190,110,.30)',
  wallTop:'#7a5a40', wallTopLit:'#c89a6a', wallFace:'#54402e', wallDark:'#32261c',
  wallRound:7,
  dot:'#ffd9a0', dotGlow:'rgba(255,190,110,.5)',
  pellet:'#fff2dc', pelletGlow:'rgba(255,235,200,.8)',
  bonus:{name:'PIE', score:300, draw:drawPie},
  cozy:true,
  hint:'Nothing here hunts. Cream calls the cats — pet all four.',
  maze:null
};
/* THE QUADRANTS (Scott, 2026-08-20, "definite"): the board is hard-divided
   by a stone cross — a vertical ridge down c9 and a full wall across r13 —
   into four sealed yards. The ONLY ways between them are the wrap tunnels
   at the edges: the side rows (r4 top half, r16 bottom half) join left and
   right yards, and the top/bottom columns (c4 left half, c14 right half)
   join upper and lower — the first maze where rows wrap like columns.
   The pen is embedded IN the vertical ridge and its mouth (r7c9) opens
   into the top-left yard only — the monsters live inside the dividing
   wall and use the same doors you do. The ridge is drawn TALLER than
   every other wall so the law of the level reads at a glance. */
const MAZE_QUAD=[
'####.#########.####',
'#o.......#.......o#',
'#.##..##.#.##..##.#',
'#........#........#',
'.........#.........',
'#.##.###.#.###.##.#',
'#..#.....#.....#..#',
'#.##.##...#....##.#',
'#....####-####....#',
'#....#       #....#',
'#....#########....#',
'#........#........#',
'#.#####..#..#####.#',
'###################',
'#........#........#',
'#.###.##.#.##.###.#',
'.........#.........',
'#.##.###.#.###.##.#',
'#..#..P..#.....#..#',
'#o.......#.......o#',
'####.#########.####'
];
const RIDGE={c:9, r:13};
const isRidge=(r,c)=> !!th.quad && (c===RIDGE.c || r===RIDGE.r);

THEMES.quad={
  name:'THE QUADRANTS',
  sky:['#0d1618','#1e3230'],
  floor:'#20282a', floorAlt:'#252e30', floorEdge:'rgba(180,240,220,.05)',
  stud:'rgba(140,220,190,.30)',
  wallTop:'#3f8f7a', wallTopLit:'#8fd8c0', wallFace:'#2a5f52', wallDark:'#173830',
  wallRound:4,
  dot:'#ffe9a8', dotGlow:'rgba(255,220,120,.5)',
  pellet:'#c0fff0', pelletGlow:'rgba(150,255,225,.8)',
  bonus:{name:'LODESTONE', score:350, draw:drawLodestone},
  quad:true, vwrap:true,
  bonusTile:{r:7,c:9},   // it spawns at the monsters' own front door
  hint:'Four yards, one law: the only ways across are under the edges — and they use them too.',
  maze:null
};
THEMES.quad.maze=MAZE_QUAD;

/* THE OLD ONE (Scott, 2026-08-22: "a Waka 3D screen with only 1 monster,
   and he's a doozy"). One interpretation of the broad, multiple-face-having
   entity behind all of Grishnak — cosmology, not just a monster.
   THE LAWS OF THE SCREEN:
   · There is ONE of him. He cannot be eaten. Ever.
   · When he has line of sight down a corridor he fires THE OLD LIGHT — a
     beam slower than you are, and it SHATTERS dots as it travels. A dot he
     breaks is CLEARED, never PAID: he helps you finish while robbing you
     blind (Scott: scoring pressure, never a solvability threat).
   · The four power pellets are a lettered toolbelt, not attack mode:
     F FREEZES him (inert — you can walk straight through him),
     E QUAKES the screen and he flees to his den,
     M mirrors your skin — his own beam comes back at him; three returns
       and he is done for the night,
     B blacks the lights out — no sight, no beam, and his eyes go swirly.
   · The maze is built of long straight halls, because the halls are his
     gun barrels: every shortcut is a firing lane. */
const MAZE_OLDONE=[
'###################',
'#o.......#.......o#',
'#.###.###.###.###.#',
'#.................#',
'###.#.##.#.##.#.###',
'#...#....#....#...#',
'#.#####.###.#####.#',
'#.................#',
'#....####-####....#',
'#....#       #....#',
'#....#########....#',
'#.................#',
'#.###.###.###.###.#',
'#...#....#....#...#',
'##.#.#.#####.#.#.##',
'#..#.....P.....#..#',
'#.##.###.#.###.##.#',
'#........#........#',
'#o.###.#.#.#.###.o#',
'#.................#',
'###################'
];
THEMES.oldone={
  name:'THE OLD ONE',
  sky:['#0a0a16','#241a3c'],
  floor:'#241f30', floorAlt:'#2a2438', floorEdge:'rgba(200,170,255,.045)',
  stud:'rgba(150,120,200,.30)',
  wallTop:'#5a4a86', wallTopLit:'#a890d8', wallFace:'#3a3060', wallDark:'#201a38',
  wallRound:5,
  dot:'#ffe9a8', dotGlow:'rgba(255,220,120,.5)',
  pellet:'#e8d8ff', pelletGlow:'rgba(200,170,255,.85)',
  bonus:{name:'RELIC', score:400, draw:drawLodestone},
  oldone:true,
  hint:'One host, four letters. F stops him. E sends him home. M returns to sender. B blinds. What his light breaks is cleared, never paid.',
  maze:null
};
THEMES.oldone.maze=MAZE_OLDONE;

THEMES.egypt.maze=MAZE_EGYPT;
THEMES.grove.maze=MAZE_GROVE;
THEMES.foundry.maze=MAZE_FOUNDRY;
THEMES.causeway.maze=MAZE_CAUSEWAY;
THEMES.shipyard.maze=MAZE_SHIPYARD;
THEMES.summit.maze=MAZE_SUMMIT;
THEMES.hearth.maze=MAZE_HEARTH;
/* --- THE SWAMP (Scott, 2026-08-25) --------------------------------------
   The first theme that changes the VERB rather than the paint. You are a
   frog. When the flies turn blue, any one of them standing within TONGUE_R
   cells on a CLEAR STRAIGHT LINE is taken — no aiming, no button. Blue time
   stops being a chase and becomes a hunt: the question is no longer "can I
   catch one" but "where do I stand so the lanes are full".
   Automatic on purpose. An aimed tongue would be a different game (a skill
   test); automatic keeps the existing fright loop and makes POSITION the
   skill, which is what a maze is already about. */
THEMES.swamp={
  name:'THE SWAMP',
  sky:['#101c14','#223a24'],
  floor:'#1d2c1f', floorAlt:'#243626', floorEdge:'rgba(150,220,140,.05)',
  stud:'rgba(120,180,110,.28)',
  wallTop:'#4e7a4a', wallTopLit:'#86b878', wallFace:'#33512f', wallDark:'#1b2e1a',
  wallRound:9,
  dot:'#cfe8a0', dotGlow:'rgba(190,230,140,.5)',
  pellet:'#a8f0d0', pelletGlow:'rgba(150,240,200,.75)',
  bonus:{name:'DRAGONFLY', score:300, draw:drawDragonfly},
  tongue:true, wet:true,
  hint:'When they turn blue, stand where the lanes are full. The tongue does the rest.'
};
const TONGUE_R=5;          // cells of reach, Scott's number
let tongues=[];            // {r,c,tr,tc,t} — drawn, then forgotten

/* --- THE CARPETS (Scott, 2026-08-25) ------------------------------------
   "Arabic night time purple at top, daytime bazaar at bottom." The sky runs
   the whole day in one screen: deep night at the zenith down to a hot
   market noon at the horizon. Player is a man on a carpet of a clearly
   different colour; the monsters are bare carpets with eyes.
   Everything here is CODE-DRAWN. A carpet is flat, so it needs no facing
   art at all — one shape, rotated by heading, which is the cheapest cast in
   the game and the reason this theme was worth doing early. */
THEMES.carpet={
  name:'THE NIGHT MARKET',
  sky:['#160b32','#f0a64e'],               // night zenith -> bazaar noon, one screen
  floor:'#2a1c44', floorAlt:'#33224f', floorEdge:'rgba(255,210,140,.05)',
  stud:'rgba(255,190,110,.22)',
  wallTop:'#c98a3c', wallTopLit:'#ffd08a', wallFace:'#8a5626', wallDark:'#4e2f14',
  wallRound:5,
  dot:'#ffe0a0', dotGlow:'rgba(255,200,110,.55)',
  pellet:'#9fd8ff', pelletGlow:'rgba(150,210,255,.75)',
  bonus:{name:'LAMP', score:300, draw:drawLamp},
  carpet:true
};

/* the four monster carpets, in GHOST_DEF order so weave matches personality */
const RUGS=[
  {warp:'#b8342c', weft:'#f0a84c', eye:'#fff0c8'},   // ember
  {warp:'#1f6f5a', weft:'#7fd8b0', eye:'#eafff4'},   // verdigris
  {warp:'#3a4a68', weft:'#93a8cc', eye:'#e8f0ff'},   // iron
  {warp:'#6a5a44', weft:'#ddc9a4', eye:'#fffaf0'}    // bone
];
const RUG_PLAYER={warp:'#5a2a8c', weft:'#c89bff'};   // clearly not one of them

/* --- THE MUSHROOM WOOD (Scott, 2026-08-25) ------------------------------
   "like a 5000 point reward with a price to pay." The only pickup in the
   game that costs you: the bonus pays 5000 and then the screen stops
   telling the truth for a while. THE ONE LAW, stated where it cannot be
   missed: distort the PRESENTATION, never the collision grid and never the
   monster AI. The maze stays exactly the maze; the difficulty comes from
   your eyes, not from the rules changing under you. A player who dies to a
   lie stops trusting the game.
   Everything below is the velocity-not-value trick from THE GELATIN: slow
   sines with drifting phase, so the world swims instead of flickering, and
   the whole thing ramps in and out instead of snapping. */
THEMES.shroom={
  name:'THE MUSHROOM WOOD',
  sky:['#170e26','#35204a'],
  floor:'#251a2e', floorAlt:'#2b2036', floorEdge:'rgba(216,170,240,.05)',
  stud:'rgba(200,150,220,.30)',
  wallTop:'#8a5aa8', wallTopLit:'#c99ae0', wallFace:'#5c3a74', wallDark:'#331f44',
  wallRound:8,
  dot:'#ffd9e8', dotGlow:'rgba(255,190,220,.5)',
  pellet:'#d8ffb0', pelletGlow:'rgba(190,255,150,.8)',
  bonus:{name:'MUSHROOM', score:5000, draw:drawMushroom},
  trip:true,
  hint:'The red ones are worth five thousand. There is a reason.'
};
/* the trip: TRIP_T frames from the bite. tripA() is the amount — a ~2.5s
   ramp in (you feel it come on) and a ~2s ramp out (survivable is the
   ramp-out's whole job). */
let tripT=0; const TRIP_T=780;
const tripA=()=> tripT<=0? 0 : Math.min(1, (TRIP_T-tripT)/150, tripT/120);

const THEME_ORDER=['classic','egypt','grove','swamp','shroom','foundry','causeway','shipyard','summit','hearth','quad','carpet','oldone'];
let th=THEMES.classic;

/* ---------------- state ---------------- */
let grid=[], dots=new Set(), pellets=new Set();
let pac={r:0,c:0,t:0,dir:{x:0,y:0},want:null,z:0,vz:0,air:false};
let START={r:15,c:9};
let ghosts=[];
let score=0, lives=10, level=1, frightT=0, chain=0;
let totalDots=0, eaten=0, bonusStage=0, bonuses=[];
let floats=[];                       // in-layer score popups (the global ones only render in the overworld)
let introT=0, dyingT=0, doneT=0, over=false;
let jumpLatch=true, exitLatch=true, savedPos=null, numLatch=[];
let pills=[], speedT=0;                  // 'v' pickups + the burst timer
let lifts=[], ride=null, boardT=0;       // 'L' gantry lifts + the current ride
/* THE OLD ONE's screen: his beam, his letters, his moods */
let oldPellets={}, oldBeam=null;
let oldFreeze=0, oldFlee=0, oldMirror=0, oldBlack=0, oldStun=0, quakeT=0, laserCd=0;
let oldHits=0, oldSulk=false;

const key=(r,c)=>r*COLS+c;
const inb=(r,c)=> r>=0&&r<ROWS&&c>=0&&c<COLS;
/* columns WRAP — walk off one side of a tunnel row and you arrive on the
   other. Rows wrap ONLY on a vwrap maze (THE QUADRANTS: top/bottom tunnels).
   This is why at() is the single source of tile truth. */
const at=(r,c)=>{
  if(r<0||r>=ROWS){ if(!vwrapOn) return '#'; r=((r%ROWS)+ROWS)%ROWS; }
  c=((c%COLS)+COLS)%COLS; return grid[r][c]; };
const isWall=(r,c)=> at(r,c)==='#';
const blocked=(r,c,ghost)=>{ const t=at(r,c); if(t==='#') return true;
  if(t==='-') return !ghost;
  if(ghost && (t==='g'||t==='w')) return true;   // ghosts detour pits + tideways
  return false; };
/* the tide: one big slow cycle. 0 = dry stone, 1 = full sea. */
const TIDE_CYCLE=1200;
function tideFactor(){
  const p=(frame%TIDE_CYCLE)/TIDE_CYCLE;
  if(p<0.42) return 0;
  if(p<0.50) return (p-0.42)/0.08;
  if(p<0.92) return 1;
  return 1-(p-0.92)/0.08;
}
const tideHigh=()=> tideFactor()>0.5;
/* steel lifts */
const LIFT_Z=34, LIFT_SPD=3.4, BOARD_T=16;
const inPen=(r,c)=> r>=PEN.r0 && r<=PEN.r1 && c>=PEN.c0 && c<=PEN.c1;

/* THE CELLAR CATS (Scott, 2026-08-23: "do cellar cats"). The four hunters are
   CATS now — cousins of Stonebreaker's TWO CATS, whose steel eyes never
   break — and they wear valley colours, not the arcade quartet. Names are
   the colours; the modes are the personalities they always had. */
const GHOST_DEF=[
  {name:'ember',     col:'#e0512d', home:HOUSE[0], out:0,   mode:'chase'},
  {name:'verdigris', col:'#55c89a', home:HOUSE[1], out:70,  mode:'ambush'},
  {name:'iron',      col:'#8a96ac', home:HOUSE[2], out:170, mode:'flank'},
  {name:'bone',      col:'#e8dfc8', home:HOUSE[3], out:280, mode:'wander', spdMul:0.5}   // the slow one — half speed, easy meat, worst ambusher
];

function loadLevel(n){
  level=n;
  th=THEMES[THEME_ORDER[(n-1)%THEME_ORDER.length]];
  elevOn=!!th.hill;
  vwrapOn=!!th.vwrap;
  grid=(th.maze||MAZE).map(row=>row.split(''));
  dots=new Set(); pellets=new Set(); pills=[]; speedT=0; lifts=[]; ride=null; boardT=0;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const t=grid[r][c];
    if(t==='.') dots.add(key(r,c));
    else if(t==='o') pellets.add(key(r,c));
    else if(t==='P'){ pac.r=r; pac.c=c; START={r,c}; grid[r][c]=' '; }
    else if(t==='v'){ pills.push({r,c,taken:false}); grid[r][c]=' '; }
    else if(t==='w'){ dots.add(key(r,c)); }      // tide-pool dots: the reward is down there
    else if(t==='L'){ lifts.push({r,c}); }
  }
  /* dots keep their distance from pits — one clear tile around every gap
     (Scott 2026-08-08: no snacks on the lip of a hole) */
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    if(grid[r][c]!=='g') continue;
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++)
      if(inb(r+dr,c+dc)) dots.delete(key(r+dr,c+dc));
  }
  totalDots=dots.size+pellets.size; eaten=0;
  bonuses=[]; floats=[];
  pac.t=0; pac.dir={x:0,y:0}; pac.want=null; pac.z=0; pac.vz=0; pac.air=false;
  ghosts=GHOST_DEF.map((d,i)=>({def:d, r:d.home.r, c:d.home.c, t:0,
    dir:{x:0,y:-1}, penT:d.out, frightened:false, eatenT:0, bob:i*1.7,
    climb:0, tired:false, rest:0, slideTo:0, slideT:0}));
  if(th.oldone){
    /* ONE of him, and the pen is his den */
    ghosts=[{def:{name:'oldone', col:'#7a68b8', home:{r:9,c:9}, out:90, mode:'chase'},
      r:9, c:9, t:0, dir:{x:0,y:-1}, penT:90, frightened:false, eatenT:0, bob:0,
      climb:0, tired:false, rest:0, slideTo:0, slideT:0}];
    /* the toolbelt, lettered in reading order: F, E / M, B on the corners */
    oldPellets={};
    const ks=[...pellets].sort((a,b)=>a-b);
    'FEMB'.split('').forEach((L,i)=>{ if(ks[i]!==undefined) oldPellets[ks[i]]=L; });
  }
  oldBeam=null; oldFreeze=0; oldFlee=0; oldMirror=0; oldBlack=0; oldStun=0;
  quakeT=0; laserCd=150; oldHits=0; oldSulk=false;
  frightT=0; chain=0; bonusStage=0; tongues=[]; tripT=0;
  introT=90; dyingT=0; doneT=0;
  camWY=Math.max(camMin(), Math.min(CAM_MAX, (pac.r+0.5)*TH));
}

/* score popups live in WORLD space and get projected each frame, so they
   ride the camera correctly instead of sticking to the glass */
function float(wx,wy,txt,col){ floats.push({wx,wy,wz:14+EV(Math.floor(wy/TH)),t:60,txt,col}); }

/* ---------------- movement (unchanged from v2) ---------------- */
function stepEnt(e, spd){
  e.t+=spd;
  while(e.t>=1){
    e.t-=1;
    e.r+=e.dir.y; e.c+=e.dir.x;
    if(e.c<0) e.c=COLS-1; else if(e.c>=COLS) e.c=0;
    if(vwrapOn){ if(e.r<0) e.r=ROWS-1; else if(e.r>=ROWS) e.r=0; }
    return true;
  }
  return false;
}
function canGo(e,d,ghost){ return !blocked(e.r+d.y, e.c+d.x, ghost); }

function pacTick(){
  const want=readDir();
  if(want) pac.want=want;
  if(pac.t===0 || pac.dir.x===0&&pac.dir.y===0){
    if(pac.want && canGo(pac,pac.want,false)){ pac.dir=pac.want; pac.want=null; }
  }
  /* mid-step reversal: commit to the tile ahead first — without that, the
     logical position (and every collision against it) teleports a full tile */
  if(pac.want && pac.t>0 && (pac.dir.x||pac.dir.y) &&
     pac.want.x===-pac.dir.x && pac.want.y===-pac.dir.y){
    pac.r+=pac.dir.y; pac.c+=pac.dir.x;
    if(pac.c<0) pac.c=COLS-1; else if(pac.c>=COLS) pac.c=0;
    if(vwrapOn){ if(pac.r<0) pac.r=ROWS-1; else if(pac.r>=ROWS) pac.r=0; }
    pac.dir=pac.want; pac.want=null; pac.t=1-pac.t;
  }
  if(pac.dir.x||pac.dir.y){
    if(!canGo(pac,pac.dir,false) && pac.t===0){ /* nose to a wall */ }
    else {
      const arrived=stepEnt(pac, PSTEP*(speedT>0?1.55:1)*slopeMul(pac,0.55,1.25));
      if(arrived){
        if(pac.want && canGo(pac,pac.want,false)){ pac.dir=pac.want; pac.want=null; }
        if(!canGo(pac,pac.dir,false)){ pac.t=0; pac.dir={x:0,y:0}; }
        collect();
      }
    }
  }
  if(held[' ']){
    if(!jumpLatch && !pac.air){ pac.air=true; pac.vz=JUMP_V; jumpLatch=true; sfx.jump ? sfx.jump() : (sfx.task&&sfx.task()); }
  } else jumpLatch=false;
  if(pac.air){
    pac.z-=pac.vz; pac.vz+=JUMP_G;
    if(pac.z<=0){ pac.z=0; pac.air=false;
      const p=scrEnt(pac,0); puff(p.x, p.y, '#ffd77a', 4);
    }
  }
}
function readDir(){
  if(held.ArrowLeft) return {x:-1,y:0};
  if(held.ArrowRight) return {x:1,y:0};
  if(held.ArrowUp) return {x:0,y:-1};
  if(held.ArrowDown) return {x:0,y:1};
  return null;
}

function collect(){
  const k=key(pac.r,pac.c);
  if(dots.has(k)){
    dots.delete(k); eaten++; score+=10; res.gold=Math.min(999,res.gold+1);
    sfx.coin && sfx.coin();
  } else if(pellets.has(k)){
    const letter=oldPellets[k];
    pellets.delete(k); eaten++; score+=50; chain=0;
    if(th.oldone){ oldLetter(letter); }
    else {
      frightT=FRIGHT_T;
      /* every screen turns them, unless the screen says otherwise. `cozy` is
         exactly such a screen — the hearth cats come TO you on cream, so
         turning them away would undo the one joke that screen tells. */
      if(!th.noReverse && !th.cozy)
        for(const g of ghosts) if(g.eatenT===0 && !inPen(g.r,g.c)) g.rev=1;
      if(th.cozy){                     // a saucer of cream — the cats come to YOU
        sfx.heart && sfx.heart();
        float((pac.c+0.5)*TW, (pac.r+0.5)*TH, 'cream!', '#fff2dc');
      } else {
        for(const g of ghosts) if(g.eatenT===0) g.frightened=true;
        sfx.heart && sfx.heart();
        float((pac.c+0.5)*TW, (pac.r+0.5)*TH, 'RUN', '#ffe066');
      }
    }
  }
  const frac=eaten/totalDots;
  if(bonusStage<FRUIT_AT.length && frac>=FRUIT_AT[bonusStage]){
    bonusStage++;
    const bt=th.bonusTile||BONUS_TILE;    // quad: r11c9 is inside the ridge
    bonuses.push({r:bt.r, c:bt.c, t:600});
  }
  for(let i=bonuses.length-1;i>=0;i--){
    const b=bonuses[i];
    if(b.r===pac.r && b.c===pac.c){
      score+=th.bonus.score; res.gold=Math.min(999,res.gold+15);
      float((pac.c+0.5)*TW, (pac.r+0.5)*TH, th.bonus.name+' +'+th.bonus.score, '#ffd23f');
      sfx.chest && sfx.chest(); bonuses.splice(i,1);
      /* the other half of the deal. No announcement — the ramp-in IS the
         announcement, which is the whole reason it has one. */
      if(th.trip) tripT=TRIP_T;
    }
  }
  if(dots.size===0 && pellets.size===0) finish();
}

/* THE OLD ONE's toolbelt — four letters, four different verbs, and none of
   them is "eat him". The pellet teaches itself: the letter is ON it. */
function oldLetter(L){
  const cx=(pac.c+0.5)*TW, cy=(pac.r+0.5)*TH;
  sfx.heart && sfx.heart();
  if(L==='F'){ oldFreeze=300; oldBeam=null;
    float(cx,cy,'F — FROZEN. WALK PAST HIM.','#bfe8ff'); }
  else if(L==='E'){ quakeT=46; oldFlee=900; oldFreeze=0;
    float(cx,cy,'E — HE RUNS HOME','#ffb85a'); }
  else if(L==='M'){ oldMirror=480;
    float(cx,cy,'M — MIRROR SKIN','#e8d8ff'); }
  else { oldBlack=480; oldBeam=null;
    float(cx,cy,'B — LIGHTS OUT','#8fd8c0'); }
}

/* ---------------- ghosts (unchanged from v2, incl. the pen-exit fix) --- */
function targetOf(g){
  if(th.oldone){
    if(oldSulk || oldFlee>0) return {r:9,c:9};      // the den
    return {r:pac.r, c:pac.c};                       // there is only ever you
  }
  if(g.eatenT>0) return HOUSE[0];
  if(th.cozy){
    /* cats have their own errands. Cream overrides everything. */
    if(frightT>0) return {r:pac.r, c:pac.c};
    if(!g.cozyTgt || (Math.abs(g.r-g.cozyTgt.r)+Math.abs(g.c-g.cozyTgt.c))<2 || Math.random()<0.01)
      g.cozyTgt={r:1+((Math.random()*(ROWS-2))|0), c:1+((Math.random()*(COLS-2))|0)};
    return g.cozyTgt;
  }
  if(g.frightened) return {r:pac.r + (pac.r<ROWS/2?4:-4), c:pac.c + (pac.c<COLS/2?5:-5)};
  switch(g.def.mode){
    case 'chase':  return {r:pac.r, c:pac.c};
    case 'ambush': return {r:pac.r+pac.dir.y*4, c:pac.c+pac.dir.x*4};
    case 'flank':  return {r:pac.r-pac.dir.y*3, c:pac.c-pac.dir.x*3};
    default: {
      const d=Math.hypot(g.r-pac.r, g.c-pac.c);
      return d>6 ? {r:pac.r,c:pac.c} : {r:ROWS-2,c:1};
    }
  }
}
const DIRS=[{x:0,y:-1},{x:-1,y:0},{x:0,y:1},{x:1,y:0}];
function ghostTick(g){
  if(g.penT>0){ g.penT--; return; }
  if(th.oldone && (oldFreeze>0 || oldStun>0)) return;   // statue with teeth (except no teeth)
  if(g.rest>0){ g.rest--; return; }          // panting at the bottom of the slide
  if(g.tired && --g.slideT<=0){ g.tired=false; g.climb=0; g.rest=50; }
  const spd = th.oldone ? GSTEP*(oldFlee>0?1.5:0.85)            // ancient: the beam is his legs
    : th.cozy ? GSTEP*(frightT>0?0.95:0.55)*(g.def.spdMul||1)   // a stroll; cream = a trot
    : g.tired ? GSTEP*1.9            // sliding downhill is FAST
    : (g.eatenT>0 ? GSTEP*2.1 : (g.frightened ? GSTEP*0.62 : GSTEP*(1+level*0.04)))
      * (g.def.spdMul||1) * slopeMul(g,0.7,1.2);
  const arrived=stepEnt(g,spd);
  if(!arrived) return;
  /* home at last: a fleeing Old One sits out a spell; a sulking one is done */
  if(th.oldone && inPen(g.r,g.c)){
    if(oldSulk){ g.penT=1e9; return; }
    if(oldFlee>0){ g.penT=300; oldFlee=0; return; }
  }
  /* the hill ledger: four squares of climb and a ghost is spent. It turns,
     slides back down the slope, and stands panting before it hunts again.
     Eyes flying home are weightless; the pen doesn't count. */
  if(elevOn && g.eatenT===0 && !inPen(g.r,g.c)){
    const de=elevOf(g.r)-elevOf(g.r-g.dir.y);
    if(g.tired){
      if(elevOf(g.r)<=g.slideTo){ g.tired=false; g.climb=0; g.rest=50; }
    } else if(de>0){
      if(++g.climb>=CLIMB_MAX){
        g.tired=true; g.slideTo=elevOf(g.r)-CLIMB_MAX; g.slideT=240;
        g.dir={x:-g.dir.x, y:-g.dir.y};       // it came up this way; down it goes
        float((g.c+0.5)*TW, (g.r+0.5)*TH, 'tired...', '#bfd8ff');
      }
    } else g.climb=0;   /* any level or downhill step is a BREATHER — the
                           ledger clears. This makes the switchback road
                           ghost-viable and the 1-wide chutes ghost-proof. */
  }
  if(g.tired){
    /* steer for lower ground: straight downhill if a drop is adjacent,
       otherwise coast the flat (never uphill) until the slope resumes */
    const e0=elevOf(g.r);
    const ok=d=> !blocked(g.r+d.y, g.c+d.x, true) && !inPen(g.r+d.y, g.c+d.x);
    let best=null;
    for(const d of DIRS)
      if(ok(d) && elevOf(g.r+d.y)<e0){ best=d; break; }
    if(!best && ok(g.dir) && elevOf(g.r+g.dir.y)<=e0)
      best=g.dir;
    if(!best) for(const d of DIRS)
      if(ok(d) && elevOf(g.r+d.y)<=e0){ best=d; break; }
    if(best){ g.dir=best; return; }
    g.tired=false; g.climb=0; g.rest=50;      // boxed in: the slide is over
    return;
  }
  /* the ember cat is a messy eater: 1-in-50 per tile he crosses, he drops a
     bonus where he stands. Chasing HIM becomes a strategy of its own. */
  if(g.def.name==='ember' && g.eatenT===0 && !g.frightened && !inPen(g.r,g.c)
     && bonuses.length<3 && Math.random()<0.02){
    bonuses.push({r:g.r, c:g.c, t:900});
    float((g.c+0.5)*TW, (g.r+0.5)*TH, 'he dropped something', '#ffb85a');
  }
  if(g.eatenT>0 && g.r===HOUSE[0].r && g.c===HOUSE[0].c){
    g.eatenT=0; g.frightened=false; g.penT=90;
  }
  /* THE ABOUT-FACE (Scott, 2026-08-25: "on all levels have monsters reverse
     when power pellets are eaten unless there are overriding per-screen
     instructions"). The arcade original turned them on the spot; this engine
     decides direction at tile boundaries, so the turn lands at the next one —
     a frame or two later, and far safer than flipping a part-crossed entity.
     Consumed once, and only if the way back is actually open. */
  if(g.rev){
    g.rev=0;
    const back={x:-g.dir.x, y:-g.dir.y};
    if((back.x||back.y) && !blocked(g.r+back.y, g.c+back.x, true) && !inPen(g.r,g.c)){
      g.dir=back; return;
    }
  }
  /* leaving the house is special-cased: greedy no-reverse steering can never
     take the door (v1 shipped that bug — the ghosts paced the pen forever) */
  let tgt, allowReverse=false;
  if(g.eatenT===0 && inPen(g.r,g.c)){
    tgt={r:PEN.r0-1, c:DOOR.c};
    allowReverse=true;
  } else tgt=targetOf(g);
  let best=null, bestD=1e9;
  for(const d of DIRS){
    if(!allowReverse && d.x===-g.dir.x && d.y===-g.dir.y) continue;
    if(blocked(g.r+d.y, g.c+d.x, true)) continue;
    const dd=(g.r+d.y-tgt.r)**2 + (g.c+d.x-tgt.c)**2;
    if(dd<bestD){ bestD=dd; best=d; }
  }
  if(!best){ g.dir={x:-g.dir.x,y:-g.dir.y}; }
  else g.dir=best;
}

/* true mid-step distance in tile units. The old same-tile check missed
   head-on passes (each entity "belongs" to the tile it's leaving until t
   rolls over, so crossing paths swap tiles between frames) and compared
   t-progress along different axes, which means nothing. */
function wdist(a,b){
  let dx=(a.c+a.dir.x*a.t)-(b.c+b.dir.x*b.t);
  let dy=(a.r+a.dir.y*a.t)-(b.r+b.dir.y*b.t);
  if(dx>COLS/2) dx-=COLS; else if(dx<-COLS/2) dx+=COLS;   // tunnel wrap
  if(vwrapOn){ if(dy>ROWS/2) dy-=ROWS; else if(dy<-ROWS/2) dy+=ROWS; }
  return Math.hypot(dx,dy);
}
function rideTick(){
  if(ride.ph==='up'){ ride.z+=1.5; if(ride.z>=LIFT_Z){ ride.z=LIFT_Z; ride.ph='move'; } }
  else if(ride.ph==='move'){
    const dx=ride.tx-ride.wx, dy=ride.ty-ride.wy, d=Math.hypot(dx,dy);
    if(d<=LIFT_SPD){ ride.wx=ride.tx; ride.wy=ride.ty; ride.ph='down'; }
    else { ride.wx+=dx/d*LIFT_SPD; ride.wy+=dy/d*LIFT_SPD; }
  }
  else { ride.z-=1.5; if(ride.z<=0){
    pac.r=ride.tr; pac.c=ride.tc; pac.t=0; pac.dir={x:0,y:0}; pac.z=0; pac.air=false;
    ride=null;
  } }
}
function collisions(){
  if(dyingT>0||doneT>0||ride) return;
  if(th.cozy){
    /* nothing on this board can hurt you. Touching a cat is a PET. */
    for(const g of ghosts){
      if(g.petT>0) g.petT--;
      if(g.penT>0) continue;
      if(wdist(g,pac)>0.6) continue;
      if(!g.pet){
        g.pet=true; g.petT=90; score+=100;
        float((g.c+0.5)*TW, (g.r+0.5)*TH, 'purr', '#ffb6c1');
        sfx.heart && sfx.heart();
        if(ghosts.every(o=>o.pet)){
          score+=500;
          float((pac.c+0.5)*TW, (pac.r+0.5)*TH, 'ALL FOUR PET +500', '#ffd23f');
          sfx.win && sfx.win();
        }
      } else if(g.petT===0){
        g.petT=90;
        float((g.c+0.5)*TW, (g.r+0.5)*TH, 'purr', '#ffb6c1');
      }
    }
    return;
  }
  /* THE TONGUE. Range + clear line, then it is simply taken — the same
     scoring chain as touching one, because it IS eating one; only the reach
     changed. Walls stop it, so a fly two cells away round a corner is safe
     and a fly five cells down an open lane is not. */
  if(th.tongue && frightT>0){
    for(const g of ghosts){
      if(g.eatenT>0 || g.penT>0 || !g.frightened) continue;
      const dr=g.r-pac.r, dc=g.c-pac.c;
      if(dr!==0 && dc!==0) continue;                 // orthogonal lanes only
      const d=Math.abs(dr)+Math.abs(dc);
      if(d===0 || d>TONGUE_R) continue;
      const sr=Math.sign(dr), sc=Math.sign(dc);
      let clear=true;
      for(let i=1;i<d && clear;i++)
        if(isWall(pac.r+sr*i, pac.c+sc*i)) clear=false;
      if(!clear) continue;
      const val=Math.min(1600, 200*Math.pow(2,chain)); chain++;
      score+=val; g.eatenT=1; g.frightened=false;
      g.tired=false; g.rest=0; g.climb=0;
      tongues.push({r:pac.r, c:pac.c, tr:g.r, tc:g.c, t:34});
      float((g.c+0.5)*TW, (g.r+0.5)*TH, '+'+val, val>=800?'#ffe066':'#bfeffc');
      sfx.chest && sfx.chest();
    }
  }
  for(const g of ghosts){
    if(g.eatenT>0 || g.penT>0) continue;
    if(th.oldone && (oldFreeze>0 || oldStun>0)) continue;  // inert: walk straight through
    if(wdist(g,pac)>0.5) continue;
    if(pac.air) continue;
    if(g.frightened){
      const val=Math.min(1600, 200*Math.pow(2,chain)); chain++;
      score+=val; g.eatenT=1; g.frightened=false;
      g.tired=false; g.rest=0; g.climb=0;
      float((g.c+0.5)*TW, (g.r+0.5)*TH, '+'+val, val>=800?'#ffe066':'#bfeffc');
      sfx.chest && sfx.chest();
    } else die();
  }
}
function die(){
  if(dyingT>0) return;
  sfx.hurt && sfx.hurt();
  const p=scrEnt(pac,0);
  puff(p.x, p.y, '#ff5a3c', 14);
  dyingT=110; pac.dir={x:0,y:0}; pac.want=null;
}
function afterDeath(){
  lives--;
  if(lives<=0){ over=true; doneT=150; return; }
  pac.r=START.r; pac.c=START.c; pac.t=0; pac.dir={x:0,y:0}; pac.z=0; pac.air=false;
  for(const g of ghosts){ g.r=g.def.home.r; g.c=g.def.home.c; g.t=0; g.dir={x:0,y:-1};
    g.penT= (th.oldone && oldSulk) ? 1e9 : g.def.out;   // a sulk survives your death
    g.frightened=false; g.eatenT=0;
    g.climb=0; g.tired=false; g.rest=0; }
  oldBeam=null; oldFreeze=0; oldFlee=0; oldMirror=0; oldBlack=0; oldStun=0; quakeT=0; laserCd=150;
  frightT=0; chain=0;
  tripT=0;      // dying mid-trip ends it — the death already collected the price
}
function finish(){
  doneT=150; sfx.win && sfx.win();
  score+=200*level;
}

/* ---------------- update ---------------- */
/* THE SCREENS MENU (Scott, 2026-08-21). Same shape as STONEBREAKER's W walls
   and CONTRAPTION's Y yards — the key is the first letter of whatever that game
   calls its levels, so three cabinets in one arcade do not invent three
   vocabularies. Here they are screens, so it is S.
   The 1-9 instant jump still works and always did; what was missing was any way
   to SEE what you were jumping to. */
let scrUI=false, scrSel=0, sLatch={};
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
function armGameKeys(){ exitLatch=true; for(let i=1;i<=9;i++) numLatch[i]=true; }
function scrMenuInput(){
  const press=k=>{ const d=!!held[k], was=!!sLatch[k]; sLatch[k]=d; return d&&!was; };
  const n=THEME_ORDER.length;
  if(press('ArrowUp'))   scrSel=(scrSel+n-1)%n;
  if(press('ArrowDown')) scrSel=(scrSel+1)%n;
  for(let i=0;i<n && i<9;i++) if(press(String(i+1))) scrSel=i;
  if(press('Enter')){ scrUI=false; sLatch={open:true}; armGameKeys();
    if(dyingT===0 && doneT===0) loadLevel(scrSel+1); return; }
  /* sLatch.open is left SET on the way out, or the same S that closes the menu
     is read as the S that opens it again on the very next frame */
  /* exitLatch + the digits: this game jumps screens on 1-9 during PLAY too,
     so a digit still held when the menu closes would jump a second time */
  if(press('Escape')||press('s')||press('S')){ scrUI=false; sLatch={open:true}; armGameKeys(); }
}
function drawScrMenu(g){
  g.fillStyle='rgba(8,6,18,.94)'; g.fillRect(0,0,RW,HUD+RH);
  g.textAlign='center'; g.font='bold 16px '+FONT; g.fillStyle='#8fc4ff';
  g.fillText('THE SCREENS', RW/2, 54);
  const rowH=Math.min(30, Math.floor((RH-70)/THEME_ORDER.length)), top=92;
  for(let i=0;i<THEME_ORDER.length;i++){
    const t=THEMES[THEME_ORDER[i]], ry=top+i*rowH;
    if(i===scrSel){ g.fillStyle='rgba(143,196,255,.15)';
      g.fillRect(RW/2-200, ry-15, 400, 22); }
    g.font='11px '+FONT; g.textAlign='right';
    g.fillStyle= i===scrSel? '#8fc4ff':'#6f6690';
    g.fillText(String(i+1), RW/2-166, ry);
    g.textAlign='left'; g.font='bold 12px '+FONT;
    g.fillStyle= (i+1)===level? '#ffe9a8' : i===scrSel? '#dce8ff' : '#b9b2cc';
    g.fillText(t.name + ((i+1)===level? '  ·  you are here':''), RW/2-152, ry);
  }
  g.textAlign='center'; g.font='11px '+FONT; g.fillStyle='#9a86b8';
  g.fillText('ARROWS pick  ·  1-9 jump  ·  ENTER go  ·  ESC close', RW/2, HUD+RH-26);
  g.textAlign='left';
}
function update(){
  if(scrUI){ scrMenuInput(); return; }
  { const sk=held['s']||held['S'];
    if(sk && !sLatch.open){ scrUI=true; scrSel=Math.max(0,Math.min(THEME_ORDER.length-1, level-1));
      sLatch=seedLatch(['ArrowUp','ArrowDown','Enter','Escape','s','S']); return; }
    if(!sk) sLatch.open=false; }
  if(introT>0) introT--;
  if(held.Escape){ if(!exitLatch){ exitLatch=true; startHighTrans('out'); return; } } else exitLatch=false;
  // number keys jump straight to that screen
  for(let n=1;n<=THEME_ORDER.length;n++){
    const nk=held[String(n)];
    if(nk && !numLatch[n]){ numLatch[n]=true;
      if(n!==level && dyingT===0 && doneT===0){ loadLevel(n); sfx.pick&&sfx.pick(); } }
    if(!nk) numLatch[n]=false;
  }

  if(doneT>0){
    if(--doneT===0){
      if(over){ startHighTrans('out'); return; }
      loadLevel(level+1); lives=Math.min(5,lives+1);
    }
    return;
  }
  if(dyingT>0){ if(--dyingT===0) afterDeath(); return; }
  if(introT>0) return;

  if(frightT>0){ frightT--; if(frightT===0) for(const g of ghosts) g.frightened=false; }
  if(tripT>0) tripT--;
  for(let i=tongues.length-1;i>=0;i--) if(--tongues[i].t<=0) tongues.splice(i,1);
  if(th.oldone){
    if(oldFreeze>0)oldFreeze--; if(oldMirror>0)oldMirror--; if(oldBlack>0)oldBlack--;
    if(oldStun>0)oldStun--; if(quakeT>0)quakeT--; if(oldFlee>0)oldFlee--;
    if(laserCd>0)laserCd--;
    oldLaserTick();
  }
  if(!th.cozy)                          // a cozy pie never spoils
    for(let i=bonuses.length-1;i>=0;i--) if(--bonuses[i].t<=0) bonuses.splice(i,1);
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.wz+=0.5; if(--f.t<=0) floats.splice(i,1); }

  if(ride){ rideTick(); }
  else {
  pacTick();
  /* boarding a lift: stand on it a beat and the gantry takes you */
  if(dyingT===0 && !pac.air && pac.t===0 && at(pac.r,pac.c)==='L'){
    if(++boardT>=BOARD_T){
      const partner=lifts.find(l=>l.c===pac.c && l.r!==pac.r)
                 || lifts.find(l=>l.r===pac.r && l.c!==pac.c);
      if(partner){
        ride={wx:(pac.c+0.5)*TW, wy:(pac.r+0.5)*TH, z:0, ph:'up',
              tx:(partner.c+0.5)*TW, ty:(partner.r+0.5)*TH, tr:partner.r, tc:partner.c};
        pac.dir={x:0,y:0}; pac.want=null; boardT=0;
        sfx.task&&sfx.task();
      }
    }
  } else boardT=0;
  /* the ground itself: gaps swallow, tides drown, pills burn */
  if(dyingT===0 && doneT===0 && !pac.air){
    const gt=at(pac.r,pac.c);
    if(gt==='g' || (gt==='w' && tideHigh())){
      const p=scrEnt(pac,0);
      puff(p.x, p.y, '#8ab4ff', 10);
      float((pac.c+0.5)*TW, (pac.r+0.5)*TH, gt==='g'? 'down you go':'the tide takes you', '#8ab4ff');
      die();
    }
  }
  if(dyingT===0) for(const sp of pills){
    if(!sp.taken && sp.r===pac.r && sp.c===pac.c){
      sp.taken=true; speedT=480; sfx.chest&&sfx.chest();
      float((sp.c+0.5)*TW, (sp.r+0.5)*TH, 'SPEED!', '#7fe7ff');
    }
  }
  if(speedT>0) speedT--;
  }
  for(const g of ghosts) ghostTick(g);
  collisions();

  const want=Math.max(camMin(), Math.min(CAM_MAX, ride? ride.wy : (pac.r+pac.dir.y*pac.t+0.5)*TH));
  camWY += (want-camWY)*0.10;
}

/* ---------------- THE OLD LIGHT ----------------
   His weapon and his signature: a beam slower than your feet, fired the
   moment a corridor lines you up. It shatters every dot it crosses —
   CLEARED, never PAID — so hesitation costs score, not the level. Mirror
   skin sends it back down the barrel; his own light is the only thing
   that has ever hurt him. */
function oldLaserTick(){
  const g0=ghosts[0];
  if(!oldBeam && laserCd===0 && dyingT===0 && doneT===0
     && g0.penT<=0 && oldFreeze===0 && oldStun===0 && oldBlack===0
     && !oldSulk && oldFlee===0 && !inPen(g0.r,g0.c)){
    let dir=null;
    if(g0.r===pac.r && g0.c!==pac.c){
      const s=Math.sign(pac.c-g0.c); let ok=true;
      for(let c=g0.c+s;c!==pac.c;c+=s){ const t=at(g0.r,c); if(t==='#'||t==='-'){ok=false;break;} }
      if(ok) dir={x:s,y:0};
    } else if(g0.c===pac.c && g0.r!==pac.r){
      const s=Math.sign(pac.r-g0.r); let ok=true;
      for(let r=g0.r+s;r!==pac.r;r+=s){ const t=at(r,g0.c); if(t==='#'||t==='-'){ok=false;break;} }
      if(ok) dir={x:0,y:s};
    }
    if(dir){
      oldBeam={fr:g0.r, fc:g0.c, dir, refl:false, lr:g0.r, lc:g0.c};
      laserCd=300;
      sfx.ray ? sfx.ray() : (sfx.task&&sfx.task());
      float((g0.c+0.5)*TW,(g0.r+0.5)*TH,'the old light','#e8d8ff');
    }
  }
  if(!oldBeam) return;
  const b=oldBeam, S=0.055;                       // slower than your feet, always
  b.fr+=b.dir.y*S; b.fc+=b.dir.x*S;
  if(b.fr<0||b.fr>=ROWS||b.fc<0||b.fc>=COLS){ oldBeam=null; return; }
  const tr=Math.round(b.fr), tc=Math.round(b.fc);
  if(tr!==b.lr||tc!==b.lc){
    b.lr=tr; b.lc=tc;
    const t=at(tr,tc);
    if(t==='#'||t==='-'){ oldBeam=null; return; }
    const k2=key(tr,tc);
    if(dots.has(k2)){
      dots.delete(k2); eaten++;                   // cleared, never paid
      const p=proj(tileWX(tc)+TW/2, tileWY(tr)+TH/2, 4);
      puff(p.x, p.y, '#cbb8ff', 6);
      if(dots.size===0 && pellets.size===0) finish();
    }
  }
  if(dyingT===0 && !pac.air){
    const px=pac.c+pac.dir.x*pac.t, py=pac.r+pac.dir.y*pac.t;
    if(Math.hypot(px-b.fc, py-b.fr)<0.5){
      if(oldMirror>0 && !b.refl){
        b.refl=true; b.dir={x:-b.dir.x, y:-b.dir.y};
        float((pac.c+0.5)*TW,(pac.r+0.5)*TH,'RETURNED','#ffe066');
        sfx.task&&sfx.task();
      } else {
        float((pac.c+0.5)*TW,(pac.r+0.5)*TH,'the light finds you','#cbb8ff');
        oldBeam=null; die(); return;
      }
    }
  }
  if(b.refl && Math.hypot(g0.c-b.fc, g0.r-b.fr)<0.6 && g0.penT<=0){
    oldBeam=null; oldHits++;
    sfx.chest&&sfx.chest();
    if(oldHits>=3){ oldSulk=true; oldStun=0; oldFlee=0;
      float((g0.c+0.5)*TW,(g0.r+0.5)*TH,'THAT IS ENOUGH. HE GOES HOME.','#ffe066');
    } else {
      oldStun=420;
      float((g0.c+0.5)*TW,(g0.r+0.5)*TH,'HIS OWN LIGHT ('+oldHits+'/3)','#ffe066');
    }
  }
}
function drawBeam(g){
  if(!oldBeam) return;
  const b=oldBeam;
  for(let i=0;i<6;i++){
    const t2=i*0.32;
    const wx=(b.fc - b.dir.x*t2 + 0.5)*TW, wy=(b.fr - b.dir.y*t2 + 0.5)*TH;
    const p=proj(wx,wy,6);
    const core=b.refl?'#fff3c4':'#f4ecff', halo=b.refl?'rgba(255,220,120,':'rgba(170,130,255,';
    const r=(6-i)*1.1*p.s;
    const gl=g.createRadialGradient(p.x,p.y,0.5,p.x,p.y,r*3);
    gl.addColorStop(0,halo+(0.5-i*0.07)+')'); gl.addColorStop(1,halo+'0)');
    g.fillStyle=gl; g.beginPath(); g.arc(p.x,p.y,r*3,0,7); g.fill();
    g.fillStyle=core; g.globalAlpha=Math.max(0,0.9-i*0.14);
    g.beginPath(); g.arc(p.x,p.y,r,0,7); g.fill(); g.globalAlpha=1;
  }
}

/* ---------------- the projection ---------------- */
function depth(wy){ return D0 + (camWY + VS - wy); }
/* the flip line for side faces leans WITH the skew — a wall shows the face
   that points at this world-x, which drifts right as rows recede */
function flipX(wy){ return camX - (camWY + VS - wy)*SKEW; }
function proj(wx, wy, wz){
  const d=depth(wy), s=F/d;
  let x= CX + ((wx-camX) + (camWY + VS - wy)*SKEW)*s;
  let y= HOR + (CAMH-(wz||0))*s;
  /* THE TRIP warps here, at the single throat every drawn point passes
     through — floor corners, wall tops, dots, monsters, you — so the whole
     world bends as ONE jelly and nothing detaches from anything else.
     World-anchored (keyed on wx,wy), two sines per axis at unrelated
     frequencies, all of them slow. The GAME's positions never touch this:
     collision, targeting and camera run on world coordinates upstream. */
  const A=tripA();
  if(A>0){
    x += (Math.sin(wy*0.021+frame*0.031) + 0.5*Math.sin(wx*0.017-frame*0.023))*9*A;
    y += (Math.sin(wx*0.019+frame*0.027) + 0.5*Math.sin(wy*0.023-frame*0.021))*7*A;
  }
  return { x, y, s };
}
/* an entity's smooth (mid-step) world position, projected */
function scrEnt(e, wz){
  if(e===pac && ride) return proj(ride.wx, ride.wy, (wz||0)+ride.z);
  const wx=(e.c + e.dir.x*e.t + 0.5)*TW;
  const wy=(e.r + e.dir.y*e.t + 0.5)*TH;
  return proj(wx, wy, (wz||0)+entEV(e));
}
const tileWX=c=>c*TW, tileWY=r=>r*TH;

/* ---------------- art ---------------- */
function drawGlowcap(g,x,y,s){
  g.save(); g.translate(x,y); g.scale(s,s);
  g.fillStyle='#e8e0c8'; g.fillRect(-2.5,-2,5,10);
  const cg=g.createRadialGradient(0,-6,1,0,-6,12);
  cg.addColorStop(0,'#d8a0ff'); cg.addColorStop(1,'#7a4a9a');
  g.fillStyle=cg;
  g.beginPath(); g.arc(0,-4,10,Math.PI,0); g.closePath(); g.fill();
  g.strokeStyle='rgba(30,10,40,.6)'; g.lineWidth=1.4; g.stroke();
  g.fillStyle='rgba(255,240,255,.8)';
  for(const [dx,dy] of [[-5,-7],[1,-10],[5,-6]]){ g.beginPath(); g.arc(dx,dy,1.6,0,7); g.fill(); }
  g.restore();
}
function drawIngot(g,x,y,s){
  g.save(); g.translate(x,y); g.scale(s,s);
  const ig=g.createLinearGradient(-10,0,10,0);
  ig.addColorStop(0,'#ffe9a0'); ig.addColorStop(0.5,'#e8b83a'); ig.addColorStop(1,'#a87a1e');
  g.fillStyle=ig;
  g.beginPath(); g.moveTo(-11,4); g.lineTo(-7,-5); g.lineTo(7,-5); g.lineTo(11,4); g.closePath(); g.fill();
  g.strokeStyle='rgba(60,40,0,.6)'; g.lineWidth=1.3; g.stroke();
  g.fillStyle='rgba(255,255,255,.55)'; g.fillRect(-5,-3.5,7,1.6);
  g.restore();
}
function drawBottle(g,x,y,s){
  g.save(); g.translate(x,y); g.scale(s,s); g.rotate(-0.35);
  g.fillStyle='rgba(150,220,210,.75)';
  g.beginPath(); g.roundRect? g.roundRect(-4,-8,8,15,3):g.rect(-4,-8,8,15); g.fill();
  g.strokeStyle='rgba(30,60,55,.7)'; g.lineWidth=1.2; g.stroke();
  g.fillStyle='#caa06a'; g.fillRect(-2,-11,4,4);
  g.fillStyle='#f4ecd8'; g.fillRect(-2.5,-3,5,7);
  g.strokeStyle='rgba(120,90,50,.7)'; g.lineWidth=0.8;
  g.beginPath(); g.moveTo(-1.5,-1); g.lineTo(1.5,-1); g.moveTo(-1.5,1); g.lineTo(1.5,1); g.stroke();
  g.restore();
}
function drawCherry(g,x,y,s){
  g.save(); g.translate(x,y); g.scale(s,s);
  g.strokeStyle='#6cc24a'; g.lineWidth=2.2; g.lineCap='round';
  g.beginPath(); g.moveTo(0,-11); g.quadraticCurveTo(6,-16,9,-5); g.stroke();
  g.beginPath(); g.moveTo(0,-11); g.quadraticCurveTo(-6,-16,-8,-4); g.stroke();
  for(const [cx,cy] of [[9,-1],[-8,0]]){
    GFX.body(g,cx,cy,5.6,5.6,'#ff4d5a','#a81028');
    g.fillStyle='rgba(255,255,255,.6)';
    g.beginPath(); g.ellipse(cx-2,cy-2.2,1.8,1.2,-0.5,0,7); g.fill();
  }
  g.restore();
}
/* THE LAMP — the night market's bonus. Brass body, a flame that never sits
   still, and no face on it. */
function drawLamp(g,x,y,s){
  const f=Math.sin(frame*0.22)*0.5+0.5;
  g.save(); g.translate(x,y); g.scale(s,s);
  const bg=g.createLinearGradient(-9,-4,9,6);
  bg.addColorStop(0,'#ffd98a'); bg.addColorStop(1,'#a86a1e');
  g.fillStyle=bg;
  g.beginPath();
  g.moveTo(-9,3); g.quadraticCurveTo(-8,-5,0,-5); g.quadraticCurveTo(8,-5,9,3);
  g.quadraticCurveTo(0,7,-9,3); g.closePath(); g.fill();
  g.strokeStyle='#4e2f14'; g.lineWidth=1.2; g.stroke();
  g.beginPath(); g.moveTo(9,1); g.lineTo(15,-2); g.lineTo(15,1); g.lineTo(9,3);
  g.closePath(); g.fill(); g.stroke();
  g.strokeStyle='#a86a1e'; g.lineWidth=1.6;
  g.beginPath(); g.arc(-7,-1,4.2,-0.4,2.6); g.stroke();
  g.fillStyle='rgba(255,220,140,'+(0.45+0.35*f).toFixed(2)+')';
  g.beginPath(); g.ellipse(15,-4-f*1.6,2.4,4.2+f*1.8,0,0,7); g.fill();
  g.restore();
}
/* THE DRAGONFLY — the swamp's bonus. Wings beat, so it reads as alive at a
   glance even at sprite size; the body is the only still thing on it. */
function drawDragonfly(g,x,y,s){
  const w=Math.sin(frame*0.55)*0.55+0.45;
  g.save(); g.translate(x,y); g.scale(s,s);
  g.strokeStyle='rgba(190,240,255,.85)'; g.lineWidth=1.1;
  g.fillStyle='rgba(180,235,255,.42)';
  for(const sgn of [-1,1]){
    g.save(); g.scale(sgn,1);
    g.beginPath(); g.ellipse(5.5,-2.5,6.4,2.0*w+0.8,-0.35,0,7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(5.0, 1.4,5.6,1.7*w+0.7, 0.30,0,7); g.fill(); g.stroke();
    g.restore();
  }
  const bg=g.createLinearGradient(-8,0,9,0);
  bg.addColorStop(0,'#7fe8b0'); bg.addColorStop(1,'#2f8f6a');
  g.fillStyle=bg;
  g.beginPath(); g.roundRect? g.roundRect(-9,-1.6,17,3.2,1.6) : g.rect(-9,-1.6,17,3.2);
  g.fill();
  g.strokeStyle='#123024'; g.lineWidth=1; g.stroke();
  g.fillStyle='#bff0d4';
  g.beginPath(); g.arc(8.4,0,2.9,0,7); g.fill();
  g.strokeStyle='#123024'; g.lineWidth=1; g.stroke();
  g.fillStyle='#123024';
  g.beginPath(); g.arc(9.4,-1,0.9,0,7); g.fill();
  g.restore();
}
/* THE MUSHROOM — red cap, white spots, and a slow breath. It is the most
   money on any bonus in the game and it looks exactly like what it is;
   nothing on this screen ever says the other half of the deal out loud. */
function drawMushroom(g,x,y,s){
  const br=1+0.06*Math.sin(frame*0.05);
  g.save(); g.translate(x,y); g.scale(s*br,s*br);
  g.fillStyle='#eee2c8';
  g.beginPath();
  g.moveTo(-3,-2); g.quadraticCurveTo(-2.4,6,-3.4,9);
  g.lineTo(3.4,9); g.quadraticCurveTo(2.4,6,3,-2); g.closePath(); g.fill();
  g.strokeStyle='rgba(60,30,20,.5)'; g.lineWidth=1; g.stroke();
  const cg=g.createRadialGradient(-3,-8,1,0,-6,13);
  cg.addColorStop(0,'#ff7a62'); cg.addColorStop(0.55,'#e03a2a'); cg.addColorStop(1,'#8e1812');
  g.fillStyle=cg;
  g.beginPath(); g.moveTo(-11,-3);
  g.quadraticCurveTo(-11,-13,0,-13); g.quadraticCurveTo(11,-13,11,-3);
  g.quadraticCurveTo(0,1,-11,-3); g.closePath(); g.fill();
  g.strokeStyle='rgba(60,10,10,.6)'; g.lineWidth=1.3; g.stroke();
  g.fillStyle='rgba(255,246,235,.92)';
  for(const [dx,dy,rr] of [[-6,-7,1.7],[0,-10,2.1],[6,-6,1.6],[-2,-5,1.2],[4,-9.5,1.1]]){
    g.beginPath(); g.ellipse(dx,dy,rr,rr*0.8,0,0,7); g.fill();
  }
  g.restore();
}
function drawAnkh(g,x,y,s){
  g.save(); g.translate(x,y); g.scale(s,s);
  g.strokeStyle='#ffd23f'; g.lineWidth=3.8; g.lineCap='round';
  g.beginPath(); g.arc(0,-6,4.4,Math.PI*0.15,Math.PI*0.85,true); g.stroke();
  g.beginPath(); g.moveTo(0,-2); g.lineTo(0,10); g.stroke();
  g.beginPath(); g.moveTo(-6,1); g.lineTo(6,1); g.stroke();
  g.strokeStyle='rgba(255,255,255,.5)'; g.lineWidth=1.2;
  g.beginPath(); g.moveTo(-1,-1); g.lineTo(-1,7); g.stroke();
  g.restore();
}

function quad(g,a,b,c2,d){
  g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y);
  g.lineTo(c2.x,c2.y); g.lineTo(d.x,d.y); g.closePath();
}

/* a GAP ('g') or a PLANK run ('b'): the floor simply is not there */
function drawPit(g,r,c,isPlank){
  const x0=tileWX(c), x1=x0+TW, yN=tileWY(r), yS=yN+TH;
  const a=proj(x0,yN,0), b=proj(x1,yN,0), c2=proj(x1,yS,0), d=proj(x0,yS,0);
  quad(g,a,b,c2,d);
  g.fillStyle= isPlank? '#0c1826' : '#08060e';
  g.fill();
  // depth: a dim inner floor far below
  const ia=proj(x0+4,yN+4,-26), ib=proj(x1-4,yN+4,-26), ic=proj(x1-4,yS-4,-26), id=proj(x0-4+8,yS-4,-26);
  quad(g,ia,ib,ic,id);
  g.fillStyle= isPlank? 'rgba(60,110,160,.25)' : 'rgba(40,30,60,.35)';
  g.fill();
  g.strokeStyle='rgba(255,255,255,.08)'; g.lineWidth=1;
  quad(g,a,b,c2,d); g.stroke();
  if(isPlank){
    /* THE TIDE: one slow cycle. Water rises from the deep to above the lip. */
    const f=tideFactor();
    const wz=-24+f*28;                            // -24 deep .. +4 over the stone
    const wa=proj(x0+1,yN+1,wz), wb=proj(x1-1,yN+1,wz), wc=proj(x1-1,yS-1,wz), wd=proj(x0+1,yS-1,wz);
    quad(g,wa,wb,wc,wd);
    const shimmer=0.30+0.10*Math.sin(frame*0.08+c*1.7+r);
    g.fillStyle='rgba(90,160,220,'+(f>0? (0.35+0.35*f).toFixed(2) : shimmer.toFixed(2))+')';
    g.fill();
    if(f>0 && f<1 && (frame>>3)%2){               // foam while it moves
      g.strokeStyle='rgba(230,250,255,.6)'; g.lineWidth=1.2;
      quad(g,wa,wb,wc,wd); g.stroke();
    }
    if(f>=1){                                     // full sea: moving glints
      const gl=proj(x0+6+((frame*0.4+c*9)%16), yN+8+((frame*0.25+r*7)%9), wz);
      g.fillStyle='rgba(220,245,255,.5)'; g.fillRect(gl.x, gl.y, 3*gl.s, 1.2*gl.s);
    }
  }
}
function drawLiftPad(g,r,c){
  const x0=tileWX(c)+3, x1=x0+TW-6, yN=tileWY(r)+3, yS=yN+TH-6;
  const a=proj(x0,yN,1), b=proj(x1,yN,1), c2=proj(x1,yS,1), d=proj(x0,yS,1);
  quad(g,a,b,c2,d);
  const pg=g.createLinearGradient(0,a.y,0,d.y);
  pg.addColorStop(0,'#7a8494'); pg.addColorStop(1,'#4a525e');
  g.fillStyle=pg; g.fill();
  g.strokeStyle='rgba(10,12,18,.7)'; g.lineWidth=1.4; g.stroke();
  g.fillStyle='#c8d0dc';
  for(const [fx,fy] of [[x0+3,yN+3],[x1-3,yN+3],[x0+3,yS-3],[x1-3,yS-3]]){
    const p=proj(fx,fy,1); g.beginPath(); g.arc(p.x,p.y,1.3*p.s,0,7); g.fill();
  }
  const hp=proj((x0+x1)/2,(yN+yS)/2,1);
  g.strokeStyle='rgba(255,190,90,'+(0.35+0.25*Math.sin(frame*0.08+c)).toFixed(2)+')';
  g.lineWidth=1.4;
  g.beginPath(); g.arc(hp.x,hp.y,5*hp.s,0,7); g.stroke();
}
function drawRails(g){
  const seen=new Set();
  for(const l of lifts){
    const p=lifts.find(o=>o.c===l.c && o.r!==l.r) || lifts.find(o=>o.r===l.r && o.c!==l.c);
    if(!p) continue;
    const k=[l.r+','+l.c, p.r+','+p.c].sort().join('|');
    if(seen.has(k)) continue; seen.add(k);
    const a=proj((l.c+0.5)*TW,(l.r+0.5)*TH,LIFT_Z+4), b=proj((p.c+0.5)*TW,(p.r+0.5)*TH,LIFT_Z+4);
    g.strokeStyle='rgba(200,210,225,.28)'; g.lineWidth=2;
    g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.stroke();
    g.strokeStyle='rgba(200,210,225,.15)'; g.lineWidth=5;
    g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.stroke();
  }
}
function drawRidePlatform(g){
  const a=proj(ride.wx-12, ride.wy-9, ride.z), b=proj(ride.wx+12, ride.wy-9, ride.z),
        c2=proj(ride.wx+12, ride.wy+9, ride.z), d=proj(ride.wx-12, ride.wy+9, ride.z);
  quad(g,a,b,c2,d);
  const pg=g.createLinearGradient(0,a.y,0,d.y);
  pg.addColorStop(0,'#8a94a4'); pg.addColorStop(1,'#525a66');
  g.fillStyle=pg; g.fill();
  g.strokeStyle='rgba(10,12,18,.8)'; g.lineWidth=1.6; g.stroke();
  const top=proj(ride.wx, ride.wy, LIFT_Z+4);
  const hook=proj(ride.wx, ride.wy, ride.z+2);
  g.strokeStyle='rgba(220,225,235,.55)'; g.lineWidth=1.4;
  g.beginPath(); g.moveTo(top.x,top.y); g.lineTo(hook.x,hook.y); g.stroke();
  const sh=proj(ride.wx, ride.wy, 0);
  GFX.shadow(g, sh.x, sh.y, 10*sh.s, 0.30*(1-ride.z/(LIFT_Z*1.6)));
}
function drawSmallAnchor(g,x,y,s){
  g.save(); g.translate(x,y); g.scale(s,s);
  g.strokeStyle='#b8c4d4'; g.lineWidth=2.6; g.lineCap='round';
  g.beginPath(); g.moveTo(0,-9); g.lineTo(0,7); g.stroke();
  g.beginPath(); g.arc(0,-9,2.8,0,7); g.stroke();
  g.beginPath(); g.moveTo(-6,-4); g.lineTo(6,-4); g.stroke();
  g.beginPath(); g.arc(0,3,6,0.35,Math.PI-0.35); g.stroke();
  g.restore();
}
function drawFlag(g,x,y,s){
  g.save(); g.translate(x,y); g.scale(s,s);
  g.strokeStyle='#d8dde4'; g.lineWidth=2; g.lineCap='round';
  g.beginPath(); g.moveTo(0,10); g.lineTo(0,-10); g.stroke();
  const wave=Math.sin(frame*0.15)*1.5;
  g.fillStyle='#ff4d4d';
  g.beginPath(); g.moveTo(0,-10);
  g.quadraticCurveTo(6,-9+wave,11,-7+wave);
  g.quadraticCurveTo(6,-5+wave,0,-3); g.closePath(); g.fill();
  g.strokeStyle='rgba(120,20,20,.6)'; g.lineWidth=1; g.stroke();
  g.fillStyle='#eef4f8'; g.beginPath(); g.arc(0,10,2.4,0,7); g.fill();
  g.restore();
}
function drawLodestone(g,x,y,s){
  /* THE QUADRANTS bonus: a compass-stone — a dark lode with a quivering
     needle, because the whole level is about which way you can't go */
  g.save(); g.translate(x,y); g.scale(s,s);
  g.fillStyle='#22303a';
  g.beginPath(); g.arc(0,0,9,0,7); g.fill();
  g.strokeStyle='#8fd8c0'; g.lineWidth=1.4;
  g.beginPath(); g.arc(0,0,9,0,7); g.stroke();
  g.fillStyle='rgba(192,255,240,.25)';
  g.beginPath(); g.arc(-3,-3,3.4,0,7); g.fill();
  const a=-Math.PI/2 + Math.sin(frame*0.11)*0.35;
  g.strokeStyle='#ffd23e'; g.lineWidth=2;
  g.beginPath(); g.moveTo(-Math.cos(a)*5,-Math.sin(a)*5); g.lineTo(Math.cos(a)*7,Math.sin(a)*7); g.stroke();
  g.fillStyle='#ffd23e'; g.beginPath(); g.arc(0,0,1.6,0,7); g.fill();
  g.restore();
}
function drawPie(g,x,y,s){
  g.save(); g.translate(x,y); g.scale(s,s);
  g.fillStyle='#a86a30';
  g.beginPath(); g.ellipse(0,3,11,4.5,0,0,7); g.fill();
  const cg=g.createLinearGradient(0,-7,0,4);
  cg.addColorStop(0,'#f0c078'); cg.addColorStop(1,'#c8903e');
  g.fillStyle=cg;
  g.beginPath(); g.ellipse(0,-1,10,5,0,0,7); g.fill();
  g.strokeStyle='rgba(90,50,10,.5)'; g.lineWidth=1.2; g.stroke();
  g.fillStyle='rgba(255,238,190,.6)';
  for(let i=0;i<7;i++){ const a=i/7*Math.PI*2;
    g.beginPath(); g.arc(Math.cos(a)*8, -1+Math.sin(a)*3.6, 1.2, 0, 7); g.fill(); }
  g.strokeStyle='rgba(255,255,255,'+(0.25+0.2*Math.sin(frame*0.09)).toFixed(2)+')';
  g.lineWidth=1.1; g.lineCap='round';
  for(const dx of [-3,2]){
    g.beginPath(); g.moveTo(dx,-6);
    g.quadraticCurveTo(dx+2,-10,dx,-13); g.stroke();
  }
  g.restore();
}
/* the Hearthside cats — same souls, different bodies */
const CAT_COLS=['#e8945a','#9a9aa8','#4a4a54','#f0e0c8'];
/* A CARPET. One shape, rotated by heading — a rug has no front, so this is
   the only cast in the game that needs no facing variants at all. It ripples
   along its length as it flies; `rider` puts a man on it. */
function drawRug(g,x,y,s,ang,rug,fr,rider){
  g.save(); g.translate(x,y); g.scale(s,s); g.rotate(ang);
  const L=17, W=11;
  const rip=i=>Math.sin(frame*0.16 + i*0.9)*1.5;
  g.beginPath();
  g.moveTo(-L, -W+rip(0));
  g.quadraticCurveTo(0, -W+rip(1)-2, L, -W+rip(2));
  g.lineTo(L, W+rip(3));
  g.quadraticCurveTo(0, W+rip(4)+2, -L, W+rip(5));
  g.closePath();
  const cg=g.createLinearGradient(-L,0,L,0);
  cg.addColorStop(0, fr? '#2a3f8c' : rug.warp);
  cg.addColorStop(1, fr? '#5f78d8' : rug.weft);
  g.fillStyle=cg; g.fill();
  g.strokeStyle='rgba(20,12,34,.9)'; g.lineWidth=1.4; g.stroke();
  // the weave: a few cross-threads and a centre medallion
  g.strokeStyle= fr? 'rgba(200,220,255,.5)' : 'rgba(255,240,200,.42)';
  g.lineWidth=1;
  for(let i=-2;i<=2;i++){
    g.beginPath(); g.moveTo(i*6, -W+2+rip(i+2)*0.5); g.lineTo(i*6, W-2+rip(i+3)*0.5); g.stroke();
  }
  g.fillStyle= fr? 'rgba(190,215,255,.55)' : 'rgba(255,235,190,.5)';
  g.beginPath(); g.ellipse(0,0,4.2,2.6,0,0,7); g.fill();
  // tassels, both short ends
  g.strokeStyle= fr? '#9fb4ff' : rug.weft;
  g.lineWidth=1.2;
  for(let e of [-1,1]) for(let i=-2;i<=2;i++){
    g.beginPath(); g.moveTo(e*L, i*4); g.lineTo(e*(L+3.5), i*4+rip(i)*0.4); g.stroke();
  }
  if(rug.eye){                       // bare carpets watch you; the rider's does not
    const ex= fr? 4 : 6;
    g.fillStyle= fr? '#dfe8ff' : rug.eye;
    g.beginPath(); g.arc(ex,-3.4,2.5,0,7); g.fill();
    g.beginPath(); g.arc(ex, 3.4,2.5,0,7); g.fill();
    g.fillStyle='#140c22';
    const lk= fr? 0 : 1;
    g.beginPath(); g.arc(ex+lk,-3.4,1.2,0,7); g.fill();
    g.beginPath(); g.arc(ex+lk, 3.4,1.2,0,7); g.fill();
  }
  g.restore();
  if(rider){                         // drawn UNROTATED: he always sits upright
    g.save(); g.translate(x, y-9*s); g.scale(s,s);
    g.fillStyle='#e8c9a0';
    g.beginPath(); g.arc(0,-7,4.6,0,7); g.fill();
    g.strokeStyle='#3a2418'; g.lineWidth=1.2; g.stroke();
    g.fillStyle='#f4f0e6';           // turban
    g.beginPath(); g.ellipse(0,-10.4,5.6,3.4,0,0,7); g.fill(); g.stroke();
    g.fillStyle='#c89bff';           // robe
    g.beginPath();
    g.moveTo(-5,0); g.quadraticCurveTo(-4.5,-4.4,0,-4.4);
    g.quadraticCurveTo(4.5,-4.4,5,0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle='#3a2418';
    g.beginPath(); g.arc(-1.6,-7.2,0.9,0,7); g.fill();
    g.beginPath(); g.arc( 1.6,-7.2,0.9,0,7); g.fill();
    g.restore();
  }
}
/* THE FLIES (Scott, 2026-08-25: "make those cats flies"). The swamp's four
   hunters are flies now — small, quick-winged, easy meat, exactly what a
   frog level wants. Personality lives in the COMPOUND EYES: each fly's eye
   colour is its GHOST_DEF colour, so ember still reads as ember at a
   glance. Blue time GROUNDS them — wings fold, they sit low on the road —
   which is why a tongue can take them. */
function drawFly(g,gh){
  const p=scrEnt(gh,2);
  const fr=gh.frightened;
  const flash= fr && frightT<120 && (frame>>3)%2;      // the classic warning
  const down= fr && !flash;
  const R=10.5*p.s;
  const bz= down? 1.5 : 6+Math.sin(frame*0.23+gh.bob)*2.4;
  const y=p.y-bz*p.s-R*0.4;
  GFX.shadow(g, p.x, p.y, (down?7:4.5)*p.s, down?0.26:0.18);
  // wings first, behind the body: a beat-blur airborne, folded flat when blue
  const wb= down? 0.1 : Math.abs(Math.sin(frame*0.9+gh.bob));
  g.fillStyle= down? 'rgba(150,170,215,.4)' : 'rgba(225,235,245,.32)';
  for(const s2 of [-1,1]){
    g.beginPath();
    g.ellipse(p.x+s2*R*0.6, y-R*0.45, R*0.9, R*(0.16+0.34*wb),
              s2*(down?1.1:0.45), 0, 7);
    g.fill();
  }
  // dangling legs (tucked when grounded)
  g.strokeStyle='rgba(18,14,10,.65)'; g.lineWidth=Math.max(0.8,1*p.s); g.lineCap='round';
  if(!down) for(const s2 of [-1,1]) for(let i=0;i<2;i++){
    const lx=p.x+s2*R*(0.25+i*0.3);
    g.beginPath(); g.moveTo(lx, y+R*0.5);
    g.lineTo(lx+s2*R*0.18, y+R*(0.85+0.1*Math.sin(frame*0.3+i+gh.bob)));
    g.stroke();
  }
  // the body
  const body= down? '#4a5a88' : '#2e2a26';
  const bg=g.createRadialGradient(p.x-R*0.3, y-R*0.35, 1, p.x, y, R);
  bg.addColorStop(0, GFX.lift(body,1.6));
  bg.addColorStop(1, GFX.dim(body,0.6));
  g.fillStyle=bg;
  g.beginPath(); g.ellipse(p.x, y, R*0.85, R*0.68, 0, 0, 7); g.fill();
  g.strokeStyle='rgba(8,6,4,.5)'; g.lineWidth=1; g.stroke();
  g.strokeStyle='rgba(0,0,0,.30)';                      // abdomen bands
  for(const bx of [0.05,0.35]){
    g.beginPath(); g.arc(p.x-R*bx, y, R*0.62, Math.PI*0.6, Math.PI*1.4); g.stroke();
  }
  // compound eyes — the personality, one colour per hunter
  const ec= down? '#9fb4ff' : gh.def.col;
  for(const s2 of [-1,1]){
    g.fillStyle=ec;
    g.beginPath(); g.arc(p.x+s2*R*0.42, y-R*0.34, R*0.36, 0, 7); g.fill();
    g.strokeStyle='rgba(8,6,4,.45)'; g.lineWidth=0.8; g.stroke();
    g.fillStyle='rgba(255,255,255,.75)';
    g.beginPath(); g.arc(p.x+s2*R*0.34, y-R*0.44, R*0.11, 0, 7); g.fill();
  }
}
function drawCat(g,gh){
  /* the photographed flies win once loaded; the code fly is the fallback,
     exactly as the rugs and the rider are on the night market */
  if(th.tongue && !(CASTS.swamp && castImage(CASTS.swamp.src)))
    return drawFly(g,gh);
  const p=scrEnt(gh,2);
  /* the code-drawn rugs are the FALLBACK now — Scott's photographed sheet
     wins the moment it has loaded, and this keeps the screen playable on the
     first frame and on a browser that never fetches the atlas at all. */
  if(th.carpet && !(CASTS.carpet && castImage(CASTS.carpet.src))){
    const bob2=Math.sin(frame*0.07+gh.bob)*2.0*p.s;
    const idx2=Math.max(0, GHOST_DEF.indexOf(gh.def));
    const a2 = gh.dir.x>0? 0 : gh.dir.x<0? Math.PI : gh.dir.y>0? Math.PI/2 : gh.dir.y<0? -Math.PI/2 : 0;
    GFX.shadow(g, p.x, p.y, 12*p.s, 0.22);
    drawRug(g, p.x, p.y-10*p.s+bob2, p.s, a2, RUGS[idx2], gh.frightened, false);
    return;
  }
  const bob=Math.sin(frame*0.06+gh.bob)*1.4*p.s;
  const y=p.y-6*p.s+bob;
  GFX.shadow(g, p.x, p.y, 10*p.s, 0.26);
  const idx=Math.max(0, GHOST_DEF.indexOf(gh.def));
  const fr=gh.frightened && !th.cozy;           // a hearth cat is never hunted
  const cast=monsterCast();
  if(cast && cast.def.m && cast.def.m[idx]){
    /* Anchoring note (checked 2026-08-24 against Scott's "center on their
       squares"): the sprite is already bottom-CENTRE anchored on the tile's
       own projected point, the same point its shadow is drawn at — so feet
       and shadow agree and the figure is centred on its cell by construction.
       What was off was SCALE, handled by the per-cell k values in CASTS. */
    /* per-monster fright art when the cast carries it; near the end of the
       fright the sprite flickers back to true colours every 8 frames — the
       classic warning, told in paint instead of palette */
    const flash= fr && frightT<120 && (frame>>3)%2;
    const cells= (fr && !flash && cast.def.fm)? cast.def.fm[idx] : cast.def.m[idx];
    if(drawCastCell(g,cast,cells,p.x,p.y,p.s,(gh.dir.x||1)<0, fr && !cast.def.fm)) return;
  }
  const body= fr? ((frightT<120 && (frame>>3)%2)? '#cdd6ea' : '#4a5a88')
    : th.cozy? CAT_COLS[idx] : gh.def.col;
  const R=12*p.s;
  // the tail: a swish behind — puffed to a bottlebrush when he's the prey
  const sw=Math.sin(frame*(fr?0.14:0.05)+gh.bob)*4*p.s;
  g.strokeStyle=GFX.dim(body,0.8); g.lineWidth=(fr?4.4:2.6)*p.s; g.lineCap='round';
  g.beginPath(); g.moveTo(p.x-R*0.8, y+R*0.5);
  g.quadraticCurveTo(p.x-R*1.6, y+R*0.2+sw, p.x-R*1.25, y-R*0.7+sw); g.stroke();
  // ears (behind the head) — flattened back when frightened
  g.fillStyle=body;
  for(const s2 of [-1,1]){
    g.beginPath();
    g.moveTo(p.x+s2*R*0.30, y-R*0.55);
    g.lineTo(p.x+s2*R*(fr?0.95:0.72), y-R*(fr?0.62:1.15));
    g.lineTo(p.x+s2*R*0.82, y-R*0.35);
    g.closePath(); g.fill();
  }
  g.fillStyle='#e8a0a8';
  for(const s2 of [-1,1]){
    g.beginPath();
    g.moveTo(p.x+s2*R*0.44, y-R*0.62);
    g.lineTo(p.x+s2*R*0.66, y-R*0.95);
    g.lineTo(p.x+s2*R*0.70, y-R*0.48);
    g.closePath(); g.fill();
  }
  // the body blob
  const bg=g.createRadialGradient(p.x-R*0.3, y-R*0.4, 1, p.x, y, R+3*p.s);
  bg.addColorStop(0, GFX.lift(body,1.3));
  bg.addColorStop(0.4, body);
  bg.addColorStop(1, GFX.dim(body,0.6));
  g.beginPath(); g.ellipse(p.x, y, R, R*0.92, 0, 0, 7);
  g.fillStyle=bg; g.fill();
  g.strokeStyle='rgba(30,15,8,.4)'; g.lineWidth=1.3; g.stroke();
  // face
  if(gh.pet){                                   // happy closed eyes
    g.strokeStyle='#2a1c12'; g.lineWidth=1.6*p.s; g.lineCap='round';
    for(const s2 of [-1,1]){
      g.beginPath(); g.arc(p.x+s2*4.2*p.s, y-1.5*p.s, 2.2*p.s, Math.PI*1.15, Math.PI*1.85);
      g.stroke();
    }
  } else if(fr){                                // hunted: eyes huge, all white
    g.fillStyle='#f4f8ff';
    g.beginPath(); g.arc(p.x-4.2*p.s, y-2*p.s, 2.8*p.s, 0, 7);
    g.arc(p.x+4.2*p.s, y-2*p.s, 2.8*p.s, 0, 7); g.fill();
    g.fillStyle='#1a2230';
    g.beginPath(); g.arc(p.x-4.2*p.s, y-2*p.s, 0.9*p.s, 0, 7);
    g.arc(p.x+4.2*p.s, y-2*p.s, 0.9*p.s, 0, 7); g.fill();
  } else {
    g.fillStyle='#2a1c12';
    g.beginPath(); g.arc(p.x-4.2*p.s, y-2*p.s, 2*p.s, 0, 7);
    g.arc(p.x+4.2*p.s, y-2*p.s, 2*p.s, 0, 7); g.fill();
    g.fillStyle='rgba(255,255,255,.7)';
    g.beginPath(); g.arc(p.x-4.8*p.s, y-2.7*p.s, 0.7*p.s, 0, 7);
    g.arc(p.x+3.6*p.s, y-2.7*p.s, 0.7*p.s, 0, 7); g.fill();
  }
  g.fillStyle='#d88090';                        // nose
  g.beginPath(); g.moveTo(p.x, y+1.5*p.s); g.lineTo(p.x-1.3*p.s, y+0.2*p.s);
  g.lineTo(p.x+1.3*p.s, y+0.2*p.s); g.closePath(); g.fill();
  g.strokeStyle='rgba(255,255,255,.45)'; g.lineWidth=0.9; g.lineCap='round';
  for(const s2 of [-1,1]) for(let w=0;w<3;w++){  // whiskers
    g.beginPath(); g.moveTo(p.x+s2*3*p.s, y+1*p.s);
    g.lineTo(p.x+s2*(R+3*p.s), y+(w-1)*2.4*p.s); g.stroke();
  }
  if(gh.tired || gh.rest>0){                    // sweat: the hill won this round
    const sw2=((frame>>3)%2)? 1.5 : -1.5;
    g.fillStyle='rgba(160,220,255,.85)';
    g.beginPath(); g.ellipse(p.x-R-2*p.s, y-4*p.s+sw2, 1.5*p.s, 2.3*p.s, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(p.x+R+2*p.s, y-2*p.s-sw2, 1.3*p.s, 2.1*p.s, 0, 0, 7); g.fill();
  }
  // a petted cat loves you: a little heart now and then
  if(gh.pet && ((frame+((gh.bob*37)|0))%110)<26){
    const hy=y-R-5*p.s - ((frame%110)*0.15*p.s);
    g.fillStyle='rgba(255,150,170,.85)';
    g.beginPath();
    g.arc(p.x-1.6*p.s, hy, 1.7*p.s, 0, 7); g.arc(p.x+1.6*p.s, hy, 1.7*p.s, 0, 7);
    g.moveTo(p.x-3.2*p.s, hy+0.6*p.s); g.lineTo(p.x, hy+4.4*p.s);
    g.lineTo(p.x+3.2*p.s, hy+0.6*p.s); g.closePath(); g.fill();
  }
}
/* the cozy air: fireflies drifting, leaves falling, smoke from the cottage */
function drawCozyAir(g){
  for(let i=0;i<7;i++){                          // fireflies
    const wx=((i*83)%(COLS*TW)) + Math.sin(frame*0.011+i*1.7)*34;
    const wy=((i*137)%(ROWS*TH)) + Math.cos(frame*0.013+i*2.3)*40;
    const wz=16+6*Math.sin(frame*0.05+i);
    const p=proj(wx,wy,wz);
    const pu=0.35+0.35*Math.sin(frame*0.11+i*2.1);
    if(pu<0.42) continue;                        // they blink
    const gl=g.createRadialGradient(p.x,p.y,0.3,p.x,p.y,7*p.s);
    gl.addColorStop(0,'rgba(220,255,140,'+pu.toFixed(2)+')');
    gl.addColorStop(1,'rgba(220,255,140,0)');
    g.fillStyle=gl; g.beginPath(); g.arc(p.x,p.y,7*p.s,0,7); g.fill();
    g.fillStyle='rgba(240,255,190,'+pu.toFixed(2)+')';
    g.beginPath(); g.arc(p.x,p.y,1.4*p.s,0,7); g.fill();
  }
  for(let i=0;i<6;i++){                          // falling leaves
    const wy=((frame*0.35 + i*173)%(ROWS*TH));
    const wx=((i*211)%(COLS*TW)) + Math.sin(frame*0.02+i*2.1)*26;
    const wz=30-((frame*0.12+i*31)%30);
    const p=proj(wx,wy,wz);
    g.save(); g.translate(p.x,p.y); g.rotate(Math.sin(frame*0.03+i)*0.9);
    g.fillStyle=['#c87a3a','#b85a30','#d8983a'][i%3];
    g.beginPath(); g.ellipse(0,0,3.2*p.s,1.8*p.s,0,0,7); g.fill();
    g.restore();
  }
  for(let i=0;i<3;i++){                          // chimney smoke over the cottage
    const ph=(frame*0.35+i*46)%140;
    const p=proj((9.5)*TW + Math.sin((ph+i*40)*0.05)*8, 9.2*TH, WZ+8+ph*0.5);
    const al=Math.max(0, 0.26-ph*0.0019);
    if(al<=0) continue;
    g.fillStyle='rgba(220,210,200,'+al.toFixed(2)+')';
    g.beginPath(); g.arc(p.x, p.y, (4+ph*0.09)*p.s, 0, 7); g.fill();
  }
}
function drawBoltPill(g,sp){
  const hover=Math.sin(frame*0.09+sp.c)*2;
  const p=proj(tileWX(sp.c)+TW/2, tileWY(sp.r)+TH/2, 8);
  const f=proj(tileWX(sp.c)+TW/2, tileWY(sp.r)+TH/2, 0);
  GFX.shadow(g,f.x,f.y,6*f.s,0.25);
  const y=p.y+hover, x=p.x, s2=p.s;
  const gl=g.createRadialGradient(x,y,1,x,y,13*s2);
  gl.addColorStop(0,'rgba(140,240,255,.5)'); gl.addColorStop(1,'rgba(140,240,255,0)');
  g.fillStyle=gl; g.beginPath(); g.arc(x,y,13*s2,0,7); g.fill();
  g.fillStyle='#7fe7ff';
  g.beginPath();
  g.moveTo(x+2*s2,y-8*s2); g.lineTo(x-4*s2,y+1*s2); g.lineTo(x-0.5*s2,y+1*s2);
  g.lineTo(x-2*s2,y+8*s2); g.lineTo(x+4*s2,y-1*s2); g.lineTo(x+0.5*s2,y-1*s2);
  g.closePath(); g.fill();
  g.strokeStyle='rgba(10,30,50,.6)'; g.lineWidth=1; g.stroke();
}
function drawFloor(g,r,c){
  const x0=tileWX(c), x1=x0+TW, yN=tileWY(r), yS=yN+TH;
  const E=EV(r);
  /* terrace riser: when the next row south sits lower, this tile's south
     edge is a little cliff face — the mountain is made of these */
  const Es=EV(r+1);
  if(E>Es){
    quad(g, proj(x0,yS,E), proj(x1,yS,E), proj(x1,yS,Es), proj(x0,yS,Es));
    g.fillStyle=th.cliff||th.wallDark; g.fill();
    const l0=proj(x0,yS,E), l1=proj(x1,yS,E);
    g.strokeStyle=th.cliffLip||'rgba(255,255,255,.15)'; g.lineWidth=1.3;
    g.beginPath(); g.moveTo(l0.x,l0.y); g.lineTo(l1.x,l1.y); g.stroke();
  }
  const a=proj(x0,yN,E), b=proj(x1,yN,E), c2=proj(x1,yS,E), d=proj(x0,yS,E);
  quad(g,a,b,c2,d);
  g.fillStyle=((r+c)&1) ? th.floor : th.floorAlt;
  g.fill();
  if(elevOn){                                  // the higher you go, the whiter
    const sn=Math.max(0,(elevOf(r)-4))*0.09;
    if(sn>0){ g.fillStyle='rgba(238,246,252,'+sn.toFixed(2)+')'; g.fill(); }
  }
  /* MOIST ROADS — the floor half of the cozy-cell method. Same three rules:
     hash-keyed so a cell is stable and its neighbour differs; the puddle is
     allowed to cross the tile edge so the checkerboard stops reading as a
     checkerboard; and the wet is a soft sheen PLUS one hard glint, because
     one alone reads as fog and the pair reads as water. */
  if(th.wet){
    const pw=hash2(c*19+7, r*23+5);
    if(pw>0.58){
      const cx2=(a.x+c2.x)/2, cy2=(a.y+c2.y)/2;
      const wpx=Math.abs(b.x-a.x)*(0.34+0.34*pw), hpx=Math.abs(d.y-a.y)*(0.30+0.26*pw);
      const pg2=g.createRadialGradient(cx2,cy2,1,cx2,cy2,Math.max(2,wpx));
      pg2.addColorStop(0,'rgba(120,170,150,.34)');
      pg2.addColorStop(0.65,'rgba(90,140,125,.18)');
      pg2.addColorStop(1,'rgba(90,140,125,0)');
      g.fillStyle=pg2;
      g.beginPath(); g.ellipse(cx2,cy2,Math.max(2,wpx),Math.max(1.2,hpx),0,0,7); g.fill();
      g.fillStyle='rgba(220,255,240,.5)';
      g.beginPath();
      g.ellipse(cx2-wpx*0.22, cy2-hpx*0.25, Math.max(0.8,wpx*0.16), Math.max(0.5,hpx*0.2), 0,0,7);
      g.fill();
    }
    if(pw<0.14){                       // a few wet leaves down in the road
      const lx=(a.x+c2.x)/2 + (hash2(c*3,r*5)-0.5)*Math.abs(b.x-a.x)*0.5;
      const ly=(a.y+c2.y)/2 + (hash2(c*9,r*7)-0.5)*Math.abs(d.y-a.y)*0.5;
      g.fillStyle='rgba(96,132,72,.55)';
      g.beginPath(); g.ellipse(lx,ly,Math.abs(b.x-a.x)*0.10+1, Math.abs(d.y-a.y)*0.09+0.8,
                               hash2(c,r)*3,0,7); g.fill();
    }
  }
  g.strokeStyle=th.floorEdge; g.lineWidth=1; g.stroke();
  const hv=hash2(c*7+3, r*11+1);
  if(hv>0.82){
    const p=proj(x0+6+hv*16, yN+6+((hv*57)%14), E);
    g.fillStyle=th.stud;
    g.beginPath(); g.arc(p.x, p.y, 1.6*p.s, 0, 7); g.fill();
  }
}

/* one wall block in perspective. The side face FLIPS across the screen
   centre — that flip is what makes the view read as a camera, not a skew. */
function drawWall(g,r,c){
  const x0=tileWX(c), x1=x0+TW, yN=tileWY(r), yS=yN+TH;
  const E=EV(r);
  /* the wall's front face reaches down to the SOUTH neighbour's ground, so
     terrace steps never open a gap under a wall */
  const Eb=Math.min(E, EV(r+1));
  const bNW=proj(x0,yN,E), bNE=proj(x1,yN,E), bSE=proj(x1,yS,Eb), bSW=proj(x0,yS,Eb);
  /* the QUADRANTS ridge stands near-double height — the level's one law,
     visible from anywhere on the board */
  const WZt=isRidge(r,c)? WZ*1.85 : WZ;
  const tNW=proj(x0,yN,E+WZt), tNE=proj(x1,yN,E+WZt), tSE=proj(x1,yS,E+WZt), tSW=proj(x0,yS,E+WZt);
  const cxw=(x0+x1)/2, fx=flipX((yN+yS)/2);
  if(th.wallShape==='pyramid'){
    const ap=proj(cxw,(yN+yS)/2,WZ*1.5);
    // the slope facing the camera
    quad(g,bSW,bSE,ap,ap);
    const pg=g.createLinearGradient(0,ap.y,0,bSW.y);
    pg.addColorStop(0,th.wallTopLit); pg.addColorStop(1,th.wallFace);
    g.fillStyle=pg; g.fill();
    // the slope facing the centre line
    if(cxw<fx){ quad(g,bSE,bNE,ap,ap); } else { quad(g,bNW,bSW,ap,ap); }
    g.fillStyle=th.wallDark; g.fill();
    g.strokeStyle='rgba(60,40,10,.35)'; g.lineWidth=1;
    g.beginPath(); g.moveTo(bSW.x,bSW.y); g.lineTo(ap.x,ap.y); g.lineTo(bSE.x,bSE.y); g.stroke();
    return;
  }
  // side face toward the centre line (perspective exposes exactly one)
  if(cxw<fx && !isWall(r,c+1)){
    quad(g,bNE,bSE,tSE,tNE);
    g.fillStyle=th.wallDark; g.fill();
  } else if(cxw>fx && !isWall(r,c-1)){
    quad(g,bNW,bSW,tSW,tNW);
    g.fillStyle=th.wallDark; g.fill();
  }
  // front face — south side, always toward the camera. Also drawn when the
  // south neighbour is a LOWER wall (terrace step OR a non-ridge wall under
  // the tall ridge): the step exposes it.
  if(!isWall(r+1,c) || EV(r+1)<E || (isRidge(r,c)&&!isRidge(r+1,c))){
    quad(g,bSW,bSE,tSE,tSW);
    const fg=g.createLinearGradient(0,tSW.y,0,bSW.y);
    fg.addColorStop(0,th.wallFace); fg.addColorStop(1,th.wallDark);
    g.fillStyle=fg; g.fill();
  }
  // top face — a true trapezoid now (near edge wider than far edge)
  quad(g,tNW,tNE,tSE,tSW);
  const tg=g.createLinearGradient(0,tNW.y,0,tSW.y);
  tg.addColorStop(0,th.wallTop); tg.addColorStop(1,th.wallTopLit);
  g.fillStyle=tg; g.fill();
  /* --- WET VEGETATION (Scott, 2026-08-25) -------------------------------
     "walls that look more like wet vegetation cells that tile pretty well,
     moist roads." The COZY-CELL METHOD, and it is worth stating plainly
     because the other games are going to reuse it:
       1. Everything is keyed off hash2(c,r), so a cell looks the same every
          frame and its NEIGHBOUR looks different. No noise texture, no
          per-frame randomness, nothing to load.
       2. Growth is drawn OVER the seam, hanging past the tile edge, which is
          what stops a grid of identical squares reading as a grid.
       3. The wet look is two highlights, not one: a broad soft sheen for the
          damp, and a couple of small hard specks for standing droplets.
     Cheap enough to run on every visible wall every frame. */
  if(th.wet){
    const h1=hash2(c*3+1, r*7+2), h2b=hash2(c*5+9, r*3+4), h3=hash2(c*11+5, r*13+7);
    const cw2=(tSE.x-tSW.x), s2=tSW.s;
    if(cw2>6){
      // mossy clumps on the top face — three per cell, placed by hash
      for(let i=0;i<3;i++){
        const hx=hash2(c*7+i*31, r*5+i*17), hy=hash2(c*13+i*11, r*19+i*23);
        const px=tSW.x+cw2*(0.16+0.68*hx);
        const py=tNW.y+(tSW.y-tNW.y)*(0.18+0.64*hy);
        const rr=(2.2+2.6*hash2(c+i*3, r+i*5))*s2;
        g.fillStyle= i===1? 'rgba(150,196,110,.55)' : 'rgba(96,150,84,.5)';
        g.beginPath(); g.ellipse(px,py,rr,rr*0.62,hx*3,0,7); g.fill();
      }
      // fronds breaking the SOUTH seam — the thing that kills the grid
      g.strokeStyle='rgba(74,122,66,.85)'; g.lineWidth=Math.max(1,1.5*s2);
      g.lineCap='round';
      for(let i=0;i<4;i++){
        const hx=hash2(c*17+i*7, r*23+i*13);
        const bx=tSW.x+cw2*(0.10+0.80*hx), by=tSW.y;
        const len=(4+5*hash2(c*5+i, r*7+i))*s2;
        const lean=(hash2(c*29+i, r*31+i)-0.5)*7*s2;
        g.beginPath(); g.moveTo(bx,by);
        g.quadraticCurveTo(bx+lean*0.5, by+len*0.6, bx+lean, by+len);
        g.stroke();
      }
      // the damp: one broad sheen...
      const sg=g.createLinearGradient(tNW.x,tNW.y,tSW.x,tSW.y);
      sg.addColorStop(0,'rgba(210,255,220,'+(0.06+0.10*h1).toFixed(3)+')');
      sg.addColorStop(1,'rgba(210,255,220,0)');
      g.fillStyle=sg; quad(g,tNW,tNE,tSE,tSW); g.fill();
      // ...and two hard droplets, which is what actually reads as WET
      g.fillStyle='rgba(235,255,245,.7)';
      for(let i=0;i<2;i++){
        const dx=tSW.x+cw2*(0.25+0.5*(i?h2b:h3));
        const dy=tNW.y+(tSW.y-tNW.y)*(0.3+0.4*(i?h3:h2b));
        g.beginPath(); g.arc(dx,dy,Math.max(0.7,1.1*s2),0,7); g.fill();
      }
    }
  }
  // gloss + exposed-edge lines, scaled by depth
  if(!isWall(r+1,c)||!isWall(r,c+1)||!isWall(r,c-1)){
    g.fillStyle='rgba(255,255,255,.22)';
    const gw=(tSE.x-tSW.x)-10*tSW.s;
    if(gw>4) g.fillRect(tSW.x+5*tSW.s, tSW.y-(tSW.y-tNW.y)*0.35, gw*0.55, 2.6*tSW.s);
  }
  g.strokeStyle='rgba(0,0,0,.22)'; g.lineWidth=1;
  quad(g,tNW,tNE,tSE,tSW); g.stroke();
  if(!isWall(r+1,c)){
    g.strokeStyle='rgba(255,255,255,.30)'; g.lineWidth=1.4;
    g.beginPath(); g.moveTo(tSW.x,tSW.y); g.lineTo(tSE.x,tSE.y); g.stroke();
  }
}
function drawDoor(g,r,c){
  const yM=tileWY(r)+TH/2;
  const a=proj(tileWX(c)+2,yM,EV(r)), b=proj(tileWX(c)+TW-2,yM,EV(r));
  g.strokeStyle='rgba(190,210,255,.55)'; g.lineWidth=4*a.s;
  g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.stroke();
}
function drawDot(g,r,c){
  const p=proj(tileWX(c)+TW/2, tileWY(r)+TH/2, 3+EV(r));
  g.fillStyle='rgba(0,0,0,.25)';
  g.beginPath(); g.ellipse(p.x,p.y+3*p.s,3.2*p.s,1.5*p.s,0,0,7); g.fill();
  const gl=g.createRadialGradient(p.x,p.y,0.5,p.x,p.y,8*p.s);
  gl.addColorStop(0,th.dotGlow); gl.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=gl; g.beginPath(); g.arc(p.x,p.y,8*p.s,0,7); g.fill();
  /* under the influence, every dot is a five-petalled flower, and the whole
     field of them turns together, very slowly. Presentation only — the tile
     underneath is the same dot it always was. */
  const A=tripA();
  if(A>0.25){
    g.fillStyle=th.dot;
    const spin=frame*0.013+(r*7+c*13)*0.6;
    for(let i=0;i<5;i++){
      const a2=i/5*Math.PI*2+spin;
      g.beginPath();
      g.ellipse(p.x+Math.cos(a2)*3.2*p.s*A, p.y+Math.sin(a2)*3.2*p.s*A,
                2.1*p.s*A, 1.2*p.s*A, a2, 0, 7);
      g.fill();
    }
    g.fillStyle='#ffd23f';
    g.beginPath(); g.arc(p.x,p.y,1.9*p.s,0,7); g.fill();
  } else {
    g.fillStyle=th.dot; g.beginPath(); g.arc(p.x,p.y,2.8*p.s,0,7); g.fill();
  }
}
function drawPellet(g,r,c){
  const p=proj(tileWX(c)+TW/2, tileWY(r)+TH/2, 4+EV(r));
  const pu=0.6+0.4*Math.sin(frame*(0.13+0.09*tripA())+c);
  const gl=g.createRadialGradient(p.x,p.y,1,p.x,p.y,17*p.s);
  gl.addColorStop(0,th.pelletGlow); gl.addColorStop(1,'rgba(0,0,0,0)');
  g.globalAlpha=pu; g.fillStyle=gl; g.beginPath(); g.arc(p.x,p.y,17*p.s,0,7); g.fill(); g.globalAlpha=1;
  g.fillStyle=th.pellet;
  g.beginPath(); g.arc(p.x,p.y,(5+pu*1.6)*p.s,0,7); g.fill();
  /* THE OLD ONE's screen: the letter is ON the pellet — the first bite is
     the lesson, and there is no second copy of any letter */
  if(th.oldone){
    const L=oldPellets[key(r,c)];
    if(L){
      g.fillStyle='#3a2a58'; g.textAlign='center';
      g.font='bold '+Math.max(7,Math.round(9*p.s))+'px '+FONT;
      g.fillText(L, p.x, p.y+3*p.s);
    }
  }
}
/* ---------------- PER-THEME CASTS (Scott, 2026-08-23) ----------------
   "bespoke themed player and 4 monsters per level to match whatever the theme
   is - like on sandstone level, have mummy + sand whirling + ankh... 2, 3 max
   cells would be enough for each sprite."
   Register a theme when its sheet lands (bullring atlas pipeline):
     CASTS.egypt={src:'images/waka-cast-egypt.png',
       player:[{x,y,w,h},...], m:[[cells],[cells],[cells],[cells]], fright:[cells?]}
   Cells face RIGHT, bottom-anchored, 2-3 per sprite, alternated every 16
   frames. Optional per cell: k (height multiplier — the squat beetle must
   not render as tall as the mummy). Optional fm:[[cells]x4] = PER-MONSTER
   fright art (pre-tinted at pack time); shared `fright` remains for casts
   that go classic-identical when hunted. Any theme with no entry falls back
   to the CELLAR CATS below — the rat and the four steel-eyed cats are the
   valley's default company. */
const CASTS={};
/* THE HOUSE CATS — the valley's default hunters, worn by every theme that
   does not ship its own. Sheet order matches GHOST_DEF exactly (ember chases,
   verdigris ambushes, iron flanks, bone wanders at half speed), so the paint
   and the personality agree. Frozen-blue fright cells are tinted at pack time.
   KEYING NOTE, learned here and worth keeping: verdigris is a GREEN cat on a
   green screen. A hue test punches holes straight through her face; the
   separator that works is BRIGHTNESS — the screen is g=177, every part of her
   is g<=140 — plus flood-fill connectivity from the border. */
const CAT_CAST={src:'images/waka-cast-cats.png?v=2026082404',
 m:[
  [{x:2,y:2,w:122,h:150,k:0.95},{x:126,y:2,w:124,h:150,k:0.95}],      // ember
  [{x:376,y:2,w:121,h:150,k:0.95},{x:499,y:2,w:121,h:150,k:0.95}],    // verdigris
  [{x:745,y:2,w:125,h:150,k:0.95},{x:872,y:2,w:125,h:150,k:0.95}],    // iron
  [{x:1126,y:2,w:127,h:150,k:0.95},{x:1255,y:2,w:134,h:150,k:0.95}]   // bone
 ],
 fm:[[{x:252,y:2,w:122,h:150,k:0.95}],[{x:622,y:2,w:121,h:150,k:0.95}],
     [{x:999,y:2,w:125,h:150,k:0.95}],[{x:1391,y:2,w:127,h:150,k:0.95}]]};
/* Scott's photographed carpets. Sliced by CONNECTED COMPONENT, not on the
   usual 4x2 grid: these are posed on a diagonal, so carpet 1's lower-right
   and carpet 2's upper-left share x-range without ever touching — measured,
   only ONE clear vertical gap per row — and a rigid W//4 cut halves two of
   the four. Blob boxes do not care how a thing leans.
   Monsters only; the rider stays code-drawn, so castFor() finds no `player`
   here and drawPac falls through to the rug it already draws. */
CASTS.carpet={src:'images/waka-cast-market.png?v=2026082507',
 m:[
  [{x:2,y:2,w:179,h:150,k:1.0},{x:183,y:2,w:182,h:150,k:1.0}],
  [{x:548,y:2,w:164,h:150,k:1.0},{x:714,y:2,w:182,h:150,k:1.0}],
  [{x:1064,y:2,w:169,h:150,k:1.0},{x:1235,y:2,w:187,h:150,k:1.0}],
  [{x:1595,y:2,w:170,h:150,k:1.0},{x:1767,y:2,w:188,h:150,k:1.0}]
 ],
 fm:[[{x:367,y:2,w:179,h:150,k:1.0}],[{x:898,y:2,w:164,h:150,k:1.0}],
     [{x:1424,y:2,w:169,h:150,k:1.0}],[{x:1957,y:2,w:170,h:150,k:1.0}]],
 /* THE RIDER, packed into the SAME sheet because castFor() resolves one
    `src` per theme. His side pair is stored facing RIGHT and the engine
    mirrors it for leftward travel — which cost three passes to get right,
    because a 150px strip is unreadable and the eye simply guesses. Check a
    facing by rendering the PACKED cell at zoom, never from the source sheet
    and never from the strip. */
 player:      [{x:2131,y:2,w:148,h:150,k:1.1},{x:2281,y:2,w:145,h:150,k:1.1}],
 playerFront: [{x:2428,y:2,w:143,h:150,k:1.1},{x:2573,y:2,w:149,h:150,k:1.1}],
 playerBack:  [{x:2724,y:2,w:146,h:150,k:1.1}]};
/* THE FLIES, photographed (Scott, 2026-08-25: "bigger and clearer... like a
   top down view of a house fly. Sprites would be fine, non animated cool").
   FIRST FULLY-INTERNAL CAST: prompt written, generated via nano banana,
   examined, keyed and packed with no human in the loop. Non-animated by
   Scott's word — one cell per fly, one blue cell each for fright. Keying
   note: flood-fill from the border over green-dominance, because the teal
   fly's eyes are the verdigris lesson in a new hat — enclosed by the head,
   so connectivity saves what a bare hue test would eat. */
CASTS.swamp={src:'images/waka-cast-swamp.png?v=2026082510',
 m:[[{x:2,y:2,w:143,h:150,k:0.9}],[{x:147,y:2,w:143,h:150,k:0.9}],
    [{x:292,y:2,w:143,h:150,k:0.9}],[{x:437,y:2,w:141,h:150,k:0.9}]],
 fm:[[{x:580,y:2,w:143,h:150,k:0.9}],[{x:725,y:2,w:143,h:150,k:0.9}],
     [{x:870,y:2,w:142,h:150,k:0.9}],[{x:1014,y:2,w:141,h:150,k:0.9}]]};
/* THE BOY (Scott's head sheet, 2026-08-24) — the valley's player on the
   CLASSIC screen, on trial against the rat that still runs every other theme.
   Just a head, which is the honest form for a maze-chase: the original ghosts
   were heads too, and a body at 30px is mush. Side pair walks (mirrored for
   left), front pair when he comes down-screen, back of the head when he goes
   up — so you can read his heading, which the rat could never tell you. */
CASTS.classic={src:'images/waka-cast-classic.png?v=2026082403',
  player:      [{x:2,y:2,w:133,h:150,k:1.05},{x:137,y:2,w:133,h:150,k:1.05}],
  playerFront: [{x:272,y:2,w:134,h:150,k:1.05},{x:408,y:2,w:134,h:150,k:1.05}],
  playerBack:  [{x:544,y:2,w:134,h:150,k:1.05}]};
/* THE DESERT SET (Scott's sheets, 2026-08-23 — "realistic little shiny
   plastic toys"): HOUND chases, WRAP ambushes, SHELL flanks, DUST — a
   drifting storm — wanders at half speed. Personalities cast the toys. */
/* k = height multiplier. Scott, 2026-08-24: "try making them 25% taller and
   wider" — so every k below is its original value x1.25, in one place, which
   keeps the whole cast in proportion and makes the trial one number to undo.
   Originals were hound 1.05 / wrap 1.10 / shell 0.62 / dust 0.95. */
CASTS.egypt={src:'images/waka-cast-egypt.png?v=2026082310',
 m:[
  [{x:2,y:2,w:194,h:140,k:1.3125},{x:198,y:2,w:177,h:140,k:1.3125}],  // hound
  [{x:556,y:2,w:87,h:140,k:1.375},{x:645,y:2,w:89,h:140,k:1.375}],    // wrap
  [{x:825,y:2,w:242,h:140,k:0.775},{x:1069,y:2,w:245,h:140,k:0.775}], // shell
  [{x:1560,y:2,w:103,h:140,k:1.1875},{x:1665,y:2,w:114,h:140,k:1.1875}] // dust
 ],
 fm:[[{x:377,y:2,w:177,h:140,k:1.3125}],[{x:736,y:2,w:87,h:140,k:1.375}],
     [{x:1316,y:2,w:242,h:140,k:0.775}],[{x:1781,y:2,w:104,h:140,k:1.1875}]]};
const castImgs={};
/* keyed by SRC, not by theme, so the house cats load ONCE and every theme
   that falls back to them shares the same Image */
function castImage(src){
  let im=castImgs[src];
  if(!im){ try{ im=new Image(); im.src=src; castImgs[src]=im; }catch(e){ return null; } }
  return (im.complete && im.naturalWidth)? im : null;
}
function castFor(){
  const name=THEME_ORDER.find(k=>THEMES[k]===th);
  const c=name && CASTS[name];
  if(!c) return null;
  const im=castImage(c.src);
  return im? {img:im, def:c} : null;
}
/* THE HOUSE CATS (Scott, 2026-08-24: "implement the round cat heads as main
   monsters across all non-bespoke levels"). A theme that ships its OWN
   monsters keeps them — egypt's desert set is untouched — and everything else
   now wears these four heads instead of the code-drawn cats. One sheet
   re-dresses nine screens. The code cats stay as the last fallback, for a
   browser that never loads the atlas. */
function monsterCast(){
  const c=castFor();
  if(c && c.def.m) return c;                     // the theme brought its own
  const im=castImage(CAT_CAST.src);
  return im? {img:im, def:CAT_CAST} : null;
}
function drawCastCell(g,cast,cells,x,y,s,flip,fr){
  if(!cast) return false;
  const use= fr && cast.def.fright && cast.def.fright.length? cast.def.fright : cells;
  const c=use[(frame>>4)%use.length];
  const SC=(30*(c.k||1)*s)/c.h, w=c.w*SC, h=c.h*SC;
  g.save(); g.translate(x,y); if(flip) g.scale(-1,1);
  if(fr && !(cast.def.fright&&cast.def.fright.length)) g.globalAlpha*=0.75;
  g.drawImage(cast.img,c.x,c.y,c.w,c.h,-w/2,-h,w,h); g.restore();
  return true;
}
/* the player, under the influence: googly eyes whose pupils orbit on two
   UNRELATED clocks — the disagreement is what reads as googly — and a
   slightly downturned mouth. He is having a time. Drawn unrotated over
   whatever body the theme gave him, because the face is the state, not
   the costume. */
function tripFace(g,x,y,s){
  const A=tripA(); if(A<=0.05) return;
  for(const sg2 of [-1,1]){
    const ex=x+sg2*5.4*s, ey=y-19*s;
    g.fillStyle='#fff';
    g.beginPath(); g.arc(ex,ey,4.4*s,0,7); g.fill();
    g.strokeStyle='rgba(24,12,32,.75)'; g.lineWidth=1.1; g.stroke();
    const a2=frame*(sg2<0?0.083:0.059)+sg2*1.7;
    g.fillStyle='#1a1024';
    g.beginPath(); g.arc(ex+Math.cos(a2)*2.2*s*A, ey+Math.sin(a2)*2.2*s*A, 1.8*s, 0, 7); g.fill();
  }
  g.strokeStyle='#2a1626'; g.lineWidth=1.7*s; g.lineCap='round';
  g.beginPath(); g.arc(x, y-8*s, 3.6*s, Math.PI*1.16, Math.PI*1.84); g.stroke();
}
/* THE FROG (Scott, 2026-08-25: "build the frog player sprites"). Code-drawn
   like the rat, and for the rat's reason: it rotates to its heading, so one
   drawing covers four directions. The hop cycle is the character — a frog
   does not walk, so while moving the body stretches along its axis and the
   big rear legs kick out behind; at rest it sits tall and folded. */
function drawFrogPlayer(g,p,a,jf){
  const R=13*p.s*(1+0.35*jf);
  const moving=(pac.dir.x||pac.dir.y);
  const hop= moving? Math.abs(Math.sin(frame*0.32)) : 0;
  const y=p.y-R*0.42-hop*3*p.s;
  g.save(); g.translate(p.x,y); g.rotate(a);
  const st=1+0.22*hop, sw=1-0.12*hop;          // stretch to hop, thin to match
  // rear legs — folded Z at rest, kicked straight back mid-hop
  g.strokeStyle='#3f7a2e'; g.lineWidth=3.2*p.s; g.lineCap='round';
  for(const s2 of [-1,1]){
    const hipX=-R*0.55*st, hipY=s2*R*0.42*sw;
    g.beginPath(); g.moveTo(hipX,hipY);
    if(hop>0.3){
      g.lineTo(hipX-R*0.55*hop, hipY+s2*R*0.18);
      g.lineTo(hipX-R*(0.55*hop+0.4), hipY+s2*R*0.05);
    } else {
      g.lineTo(hipX-R*0.15, hipY+s2*R*0.30);
      g.lineTo(hipX+R*0.10, hipY+s2*R*0.42);
    }
    g.stroke();
  }
  // body — dark olive back over a pale belly edge
  const bg=g.createRadialGradient(-R*0.2,-R*0.25,1,0,0,R*1.15);
  bg.addColorStop(0,'#8cc85a'); bg.addColorStop(0.5,'#5a9c3c'); bg.addColorStop(1,'#33641f');
  g.fillStyle=bg;
  g.beginPath(); g.ellipse(0,0,R*0.95*st,R*0.72*sw,0,0,7); g.fill();
  g.strokeStyle='rgba(20,40,12,.55)'; g.lineWidth=1.3; g.stroke();
  g.fillStyle='rgba(232,240,192,.5)';                    // belly showing at the jaw
  g.beginPath(); g.ellipse(R*0.45*st,0,R*0.42,R*0.40*sw,0,0,7); g.fill();
  g.fillStyle='rgba(30,60,18,.4)';                       // back spots
  for(const [dx,dy,rr] of [[-R*0.35,-R*0.22,0.14],[-R*0.05,R*0.25,0.11],[R*0.1,-R*0.3,0.10]]){
    g.beginPath(); g.arc(dx,dy,R*rr,0,7); g.fill();
  }
  // front feet, planted wide
  g.strokeStyle='#3f7a2e'; g.lineWidth=2.2*p.s;
  for(const s2 of [-1,1]){
    g.beginPath(); g.moveTo(R*0.5*st, s2*R*0.35*sw);
    g.lineTo(R*(0.72+0.1*hop), s2*R*0.55); g.stroke();
  }
  // the eyes — two bulbs on top, pupils forward. This is the whole face.
  for(const s2 of [-1,1]){
    g.fillStyle='#5a9c3c';
    g.beginPath(); g.arc(R*0.55*st, s2*R*0.46*sw, R*0.30, 0, 7); g.fill();
    g.strokeStyle='rgba(20,40,12,.5)'; g.lineWidth=1; g.stroke();
    g.fillStyle='#f2f6da';
    g.beginPath(); g.arc(R*0.60*st, s2*R*0.46*sw, R*0.20, 0, 7); g.fill();
    g.fillStyle='#1c2410';
    g.beginPath(); g.ellipse(R*0.66*st, s2*R*0.46*sw, R*0.09, R*0.13, 0, 0, 7); g.fill();
    g.fillStyle='rgba(255,255,255,.8)';
    g.beginPath(); g.arc(R*0.62*st, s2*R*0.51*sw, R*0.05, 0, 7); g.fill();
  }
  // mouth line along the jaw
  g.strokeStyle='rgba(20,40,12,.6)'; g.lineWidth=1.1;
  g.beginPath(); g.arc(R*0.3*st, 0, R*0.55, -0.5, 0.5); g.stroke();
  g.restore();
  tripFace(g,p.x,p.y,p.s);
}
function drawPac(g){
  const gz=pac.z*ZSCALE;
  const p=scrEnt(pac, gz);
  const pf=scrEnt(pac, 0);                       // floor point, for the shadow
  const jf=pac.air ? Math.min(1, pac.z/JUMP_PEAK) : 0;   // 0 ground → 1 apex
  const sh=pac.air ? Math.max(0.08, 0.34*(1-jf)) : 0.34;
  GFX.shadow(g, pf.x, pf.y, (pac.air?9:12)*pf.s, sh);
  let a=0;
  if(pac.dir.x>0) a=0; else if(pac.dir.x<0) a=Math.PI;
  else if(pac.dir.y>0) a=Math.PI/2; else if(pac.dir.y<0) a=-Math.PI/2;
  /* the code-drawn rider is the FALLBACK now, exactly as the rugs are: the
     photographed sheet wins once it has loaded, and this keeps the screen
     playable on frame one and on a browser that never fetches the atlas. */
  if(th.carpet && !(CASTS.carpet && castImage(CASTS.carpet.src))){
    const bobP=Math.sin(frame*0.07)*1.6*p.s;
    drawRug(g, p.x, p.y-10*p.s+bobP-gz*0.6, p.s*(1+0.25*jf), a, RUG_PLAYER, false, true);
    return;
  }
  if(th.tongue){ drawFrogPlayer(g,p,a,jf); return; }
  const R=14*p.s*(1+0.4*jf);                   // swells toward the apex
  const y=p.y-R*0.5;
  if(jf>0.04){                                  // and glows on the way up
    const gg=g.createRadialGradient(p.x,y,2,p.x,y,R+16*jf);
    gg.addColorStop(0,'rgba(255,242,150,'+(0.45*jf).toFixed(2)+')');
    gg.addColorStop(1,'rgba(255,242,150,0)');
    g.fillStyle=gg; g.beginPath(); g.arc(p.x,y,R+16*jf,0,7); g.fill();
  }
  const cast=castFor();
  if(cast && cast.def.player){
    /* A HEAD can face the way it is going, which a mirrored side view cannot.
       When the cast supplies playerFront/playerBack, a player travelling
       DOWN-screen shows his face and one travelling UP shows the back of his
       head; sideways still uses the side pair, mirrored. Casts without those
       lists fall back to the side pair for everything, so this is additive. */
    let cells=cast.def.player, flip=pac.dir.x<0;
    if(!pac.dir.x && pac.dir.y>0 && cast.def.playerFront){ cells=cast.def.playerFront; flip=false; }
    else if(!pac.dir.x && pac.dir.y<0 && cast.def.playerBack){ cells=cast.def.playerBack; flip=false; }
    if(drawCastCell(g,cast,cells,p.x,p.y,p.s*(1+0.4*jf),flip,false)){ tripFace(g,p.x,p.y,p.s); return; }
  }
  /* THE RAT (Scott, 2026-08-23: "do cellar cats"). The wedge-mouthed disc is
     gone: the valley's player is a larder rat — quick, low, unglamorous, and
     exactly the thing four cellar cats would organise an evening around. */
  g.save(); g.translate(p.x,y);
  g.rotate(a); if(Math.cos(a)<-0.5) g.scale(1,-1);   // face the heading, never belly-up
  const scur=(pac.dir.x||pac.dir.y)? Math.sin(frame*0.4)*0.9*p.s : 0;
  // tail, trailing the run
  g.strokeStyle='#c88a94'; g.lineWidth=1.8*p.s; g.lineCap='round';
  g.beginPath(); g.moveTo(-R*0.85,0);
  g.quadraticCurveTo(-R*1.6, -2*p.s+scur*2.4, -R*2.05, 1.2*p.s-scur*2.4); g.stroke();
  // body — grey-brown, low-slung
  const bg=g.createRadialGradient(-R*0.25,-R*0.3,1,0,0,R*1.15);
  bg.addColorStop(0,'#c4b49c'); bg.addColorStop(0.45,'#9a8a74'); bg.addColorStop(1,'#6a5c4c');
  g.fillStyle=bg;
  g.beginPath(); g.ellipse(0,0,R*1.05,R*0.66,0,0,7); g.fill();
  g.strokeStyle='rgba(40,28,18,.5)'; g.lineWidth=1.4; g.stroke();
  // haunch
  g.fillStyle='rgba(90,76,60,.5)';
  g.beginPath(); g.ellipse(-R*0.45,R*0.06,R*0.48,R*0.42,0,0,7); g.fill();
  // head, nosing forward
  g.fillStyle='#a89880';
  g.beginPath(); g.ellipse(R*0.78,-R*0.06,R*0.5,R*0.36,-0.12,0,7); g.fill();
  g.strokeStyle='rgba(40,28,18,.4)'; g.lineWidth=1.1; g.stroke();
  // ear — round, lined pink
  g.fillStyle='#a89880'; g.beginPath(); g.arc(R*0.52,-R*0.44,R*0.24,0,7); g.fill();
  g.fillStyle='#d8a0a8'; g.beginPath(); g.arc(R*0.54,-R*0.44,R*0.13,0,7); g.fill();
  // eye + glint
  g.fillStyle='#241a10'; g.beginPath(); g.arc(R*0.88,-R*0.14,2*p.s,0,7); g.fill();
  g.fillStyle='rgba(255,255,255,.8)'; g.beginPath(); g.arc(R*0.84,-R*0.2,0.7*p.s,0,7); g.fill();
  // nose + whiskers
  g.fillStyle='#d8848e'; g.beginPath(); g.arc(R*1.28,-R*0.02,1.5*p.s,0,7); g.fill();
  g.strokeStyle='rgba(255,255,255,.5)'; g.lineWidth=0.9;
  for(let w2=0;w2<3;w2++){
    g.beginPath(); g.moveTo(R*1.18,-R*0.02);
    g.lineTo(R*1.55,(w2-1)*3.2*p.s); g.stroke();
  }
  // feet — scurrying nubs
  g.fillStyle='#6a5c4c';
  g.beginPath(); g.ellipse(R*0.35+scur*1.4,R*0.6,2.2*p.s,1.4*p.s,0,0,7); g.fill();
  g.beginPath(); g.ellipse(-R*0.5-scur*1.4,R*0.62,2.2*p.s,1.4*p.s,0,0,7); g.fill();
  g.restore();
  tripFace(g,p.x,p.y,p.s);
}
function drawOldOne(g,gh){
  const p=scrEnt(gh, 2);
  const frozen=oldFreeze>0, stunned=oldStun>0;
  const bob=(frozen||stunned)? 0 : Math.sin(frame*0.07)*2.2*p.s;
  const R=17*p.s;                                   // a size up from the little ones
  const y=p.y-R*0.5+bob;
  GFX.shadow(g, p.x, p.y, 14*p.s, 0.3);
  if(stunned && (frame>>3)%2){ g.globalAlpha=0.55; }
  const body= frozen? '#9fc8e8' : gh.def.col;
  const bg=g.createRadialGradient(p.x-R*0.3,y-R*0.45,1,p.x,y,R+4*p.s);
  bg.addColorStop(0, GFX.lift(body,1.3));
  bg.addColorStop(0.35, body);
  bg.addColorStop(1, GFX.dim(body,0.5));
  g.beginPath();
  g.arc(p.x,y-1,R,Math.PI,0);
  g.lineTo(p.x+R,y+R*0.72);
  for(let i=0;i<4;i++){
    const w=(2*R)/4;
    g.quadraticCurveTo(p.x+R-w*(i+0.5), y+R*0.72-6*p.s, p.x+R-w*(i+1), y+R*0.72);
  }
  g.closePath();
  g.fillStyle=bg; g.fill();
  g.strokeStyle='rgba(0,0,0,.4)'; g.lineWidth=1.6; g.stroke();
  /* the other faces: two dim pairs of eyes at his edges. He is one
     interpretation of a thing with many — the others never quite open. */
  g.globalAlpha*=0.28;
  g.fillStyle='#e8d8ff';
  for(const off of [-0.72,0.72]){
    g.beginPath();
    g.ellipse(p.x+R*off-2*p.s,y+2*p.s,1.7*p.s,2*p.s,0,0,7);
    g.ellipse(p.x+R*off+2*p.s,y+2*p.s,1.7*p.s,2*p.s,0,0,7);
    g.fill();
  }
  g.globalAlpha= stunned&&(frame>>3)%2 ? 0.55 : 1;
  if(oldBlack>0){
    /* blackout: his eyes go SWIRLY (Scott) — he can't see a thing */
    g.strokeStyle='#f4ecff'; g.lineWidth=1.3*p.s; g.lineCap='round';
    for(const ex of [-4.6,4.6]){
      g.save(); g.translate(p.x+ex*p.s, y-2); g.rotate(frame*0.15*(ex<0?1:-1));
      g.beginPath();
      for(let a2=0;a2<Math.PI*4.5;a2+=0.35){
        const rr2=(0.4+a2*0.32)*p.s;
        const px2=Math.cos(a2)*rr2, py2=Math.sin(a2)*rr2;
        a2===0? g.moveTo(px2,py2) : g.lineTo(px2,py2);
      }
      g.stroke(); g.restore();
    }
  } else drawEyes(g,p.x,y,gh,p.s*1.25);
  if(frozen){                                       // rimed over, briefly a statue
    g.strokeStyle='rgba(210,240,255,.8)'; g.lineWidth=1.2;
    g.beginPath(); g.arc(p.x,y-1,R+1.5,Math.PI*1.1,Math.PI*1.9); g.stroke();
    g.fillStyle='rgba(230,248,255,.9)';
    for(let i=0;i<3;i++){
      const sx2=p.x+(-R*0.5+i*R*0.5), sy2=y+R*0.72+2*p.s;
      g.beginPath(); g.moveTo(sx2,sy2); g.lineTo(sx2-1.5*p.s,sy2+4*p.s); g.lineTo(sx2+1.5*p.s,sy2+4*p.s); g.closePath(); g.fill();
    }
  }
  g.globalAlpha=1;
}
function drawGhost(g,gh){
  if(th.oldone && gh.def.name==='oldone') return drawOldOne(g,gh);
  /* THE CELLAR CATS: every hunter on every screen is a cat now — the dome-and-
     skirt silhouette is gone from the game. Eaten, what races home is not a
     cartoon gaze but the TWO CATS' law from next door: steel eyes never break. */
  if(gh.eatenT>0){
    const p=scrEnt(gh, 2);
    const y=p.y-13*p.s*0.5+Math.sin(frame*0.09+gh.bob)*1.8*p.s;
    GFX.shadow(g, p.x, p.y, 7*p.s, 0.18);
    drawSteelEyes(g,p.x,y,gh,p.s);
    return;
  }
  /* THE TRIP, on the monsters — Scott: "especially monsters". THE GELATIN's
     area-conserving squash (one axis stretched, the other pinched by the
     same factor, so mass reads as conserved and it looks like flesh, not a
     glitch) plus a slow lean, all phased off gh.bob so no two of them ever
     agree. Wrapped around the WHOLE draw: sprite cast and code cat alike. */
  const A=tripA();
  if(A>0){
    const p=scrEnt(gh, 2);
    const w1=Math.sin(frame*0.045+gh.bob*2.1), w2=Math.sin(frame*0.037+gh.bob*3.3);
    const sq=1+0.22*A*w1;
    g.save(); g.translate(p.x,p.y);
    g.rotate(w2*0.16*A);
    g.scale(sq, 1/sq);
    g.translate(-p.x,-p.y);
    drawCat(g,gh);
    g.restore();
    return;
  }
  return drawCat(g,gh);
}
function drawSteelEyes(g,x,y,gh,s){
  for(const off of [-4.2,4.2]){
    const sg2=g.createRadialGradient(x+off*s-1.2,y-3.2,0.4,x+off*s,y-2,3.6*s);
    sg2.addColorStop(0,'#eef4fc'); sg2.addColorStop(0.5,'#9aa8c0'); sg2.addColorStop(1,'#3e4658');
    g.fillStyle=sg2; g.beginPath(); g.arc(x+off*s,y-2,3.1*s,0,7); g.fill();
    g.strokeStyle='rgba(10,14,22,.6)'; g.lineWidth=1; g.stroke();
  }
  const lx=gh.dir.x*1.4*s, ly=gh.dir.y*1.4*s;   // they still look where they go
  g.fillStyle='#1b2230';
  g.beginPath(); g.arc(x-4.2*s+lx,y-2+ly,1.2*s,0,7); g.arc(x+4.2*s+lx,y-2+ly,1.2*s,0,7); g.fill();
}
function drawEyes(g,x,y,gh,s){
  g.fillStyle='#fff';
  g.beginPath(); g.ellipse(x-4.2*s,y-2,3.5*s,4*s,0,0,7); g.ellipse(x+4.2*s,y-2,3.5*s,4*s,0,0,7); g.fill();
  g.fillStyle='#1b2a6a';
  const lx=gh.dir.x*1.7*s, ly=gh.dir.y*1.8*s;
  g.beginPath(); g.arc(x-4.2*s+lx,y-2+ly,1.7*s,0,7); g.arc(x+4.2*s+lx,y-2+ly,1.7*s,0,7); g.fill();
}

/* ---------------- draw ---------------- */
function rowVisible(r){
  const n=proj(camX, tileWY(r), WZ+EV(r)).y, s2=proj(camX, tileWY(r)+TH, EV(r)).y;
  /* the trip warp can push a row's projected edge ~16px either way; widen
     the cull by the warp's worst case so rows never pop at the screen edge */
  const m=40*tripA();
  return s2>HUD-10-m && n<HUD+RH+30+m;
}
function draw(){
  const g=ctx;
  if(scrUI){ drawScrMenu(g); return; }
  const sg=g.createLinearGradient(0,HUD,0,HUD+RH);
  sg.addColorStop(0,th.sky[0]); sg.addColorStop(1,th.sky[1]);
  g.fillStyle=sg; g.fillRect(0,HUD,RW,RH);

  g.save();
  g.beginPath(); g.rect(0,HUD,RW,RH); g.clip();
  /* E — the whole screen objects */
  if(quakeT>0){
    const q=quakeT/46;
    g.translate((Math.random()*2-1)*5*q, (Math.random()*2-1)*3.5*q);
  }

  // floors first — flat, cannot occlude anything
  for(let r=0;r<ROWS;r++){
    if(!rowVisible(r)) continue;
    for(let c=0;c<COLS;c++){
      const t=at(r,c);
      if(t==='#') continue;
      if(t==='g'||t==='w') drawPit(g,r,c,t==='w');
      else { drawFloor(g,r,c); if(t==='L') drawLiftPad(g,r,c); }
    }
  }
  /* then BACK TO FRONT (far rows first). Within a row, columns go from the
     screen edges toward the centre, so the side faces that lean toward the
     centre line always land on top of the block behind them. */
  for(let r=0;r<ROWS;r++){
    if(!rowVisible(r)) continue;
    /* outside-in toward the LEANING centre line, so the side faces always
       land on top of the block behind them — per row, because the flip
       line drifts with depth under the skew */
    const fx=flipX(tileWY(r)+TH/2);
    const colOrder=[...Array(COLS).keys()].sort((a,b)=>
      Math.abs(b*TW+TW/2-fx)-Math.abs(a*TW+TW/2-fx));
    for(const c of colOrder){
      const t=at(r,c);
      if(t==='#') drawWall(g,r,c);
      else if(t==='-') drawDoor(g,r,c);
    }
    for(let c=0;c<COLS;c++){
      const k=key(r,c);
      if(dots.has(k)){ if(at(r,c)==='w' && tideFactor()>0.3){} else drawDot(g,r,c); }
      else if(pellets.has(k)) drawPellet(g,r,c);
    }
    for(const sp of pills) if(!sp.taken && sp.r===r) drawBoltPill(g,sp);
    for(const b of bonuses) if(b.r===r){
      /* bonuses hover ABOVE wall height so they can never be buried — but
         WZ+8 was overshoot (walls are only WZ=15 tall), which read as the
         ankh and cherry floating well off their cell. WZ+2 keeps the
         never-buried invariant and sits the prize back on its square.
         (Scott, 2026-08-24: "the ankhs and cherries appear a little too high") */
      const hover=Math.sin(frame*0.07+b.c)*2.5;
      const blink=b.t<120 && (frame>>3)%2;
      if(blink) continue;
      const bp=proj(tileWX(b.c)+TW/2, tileWY(b.r)+TH/2, WZ+2+EV(b.r));
      const bf=proj(tileWX(b.c)+TW/2, tileWY(b.r)+TH/2, EV(b.r));
      GFX.shadow(g,bf.x,bf.y,9*bf.s,0.3);
      th.bonus.draw(g,bp.x,bp.y+hover,bp.s);
    }
    for(const gh of ghosts) if(gh.r===r && gh.penT<=0) drawGhost(g,gh);
    if(pac.r===r && !ride && (dyingT===0 || (frame>>2)%2)) drawPac(g);
  }
  for(const gh of ghosts) if(gh.penT>0) drawGhost(g,gh);
  if(lifts.length) drawRails(g);
  if(ride){ drawRidePlatform(g); drawPac(g); }
  if(th.cozy) drawCozyAir(g);
  if(th.oldone){
    drawBeam(g);
    if(oldBlack>0){
      /* B — the dark, with a pool of your own around you */
      const pp=scrEnt(pac, 10);
      const a=Math.min(1, oldBlack>420 ? (480-oldBlack)/60 : oldBlack<60 ? oldBlack/60 : 1);
      const dg=g.createRadialGradient(pp.x,pp.y,26,pp.x,pp.y,140);
      dg.addColorStop(0,'rgba(3,4,12,0)');
      dg.addColorStop(1,'rgba(3,4,12,'+(0.74*a).toFixed(2)+')');
      g.fillStyle=dg; g.fillRect(0,HUD,RW,RH);
    }
  }

  /* the you-are-here halo: drawn above EVERYTHING, so even with your feet
     behind a wall you always know exactly where you are */
  if(dyingT===0){
    const p=scrEnt(pac, pac.z*ZSCALE);
    const gl=g.createRadialGradient(p.x,p.y-6,2,p.x,p.y-6,20*p.s);
    gl.addColorStop(0,'rgba(255,235,140,.20)');
    gl.addColorStop(1,'rgba(255,235,140,0)');
    g.fillStyle=gl; g.beginPath(); g.arc(p.x,p.y-6,20*p.s,0,7); g.fill();
  }
  /* THE TONGUE, animated (Scott, 2026-08-25: "animate the (thick) tongue").
     The STRIKE is still resolved before you see anything — that stays, it is
     how a frog's tongue works — but the drawing now plays it back: out in 5
     frames, held for 5, reeled in over 12, with a slight sag under its own
     weight. Thick pink over a darker rim, a wet highlight down the middle,
     and a blob of a tip. The point is that the credit now LOOKS earned. */
  for(const tg of tongues){
    const age=34-tg.t;
    const ext= age<5? age/5 : tg.t>14? 1 : tg.t/14;    // out fast, HELD, reel back
    /* proj(), NOT scrEnt(): a tongue record is {r,c,timer} — scrEnt reads
       e.dir and e.t off it, and there IS no dir while t is the TIMER, so it
       threw on the first strike, the tongue never rendered, and the skipped
       g.restore() leaked this frame's CLIP onto the shared canvas — which is
       what blacked out Stonebreaker's HUD two cabinets later. One bad call,
       two games' bugs. */
    const A=proj((tg.c+0.5)*TW, (tg.r+0.5)*TH, EV(tg.r)),
          B=proj((tg.tc+0.5)*TW, (tg.tr+0.5)*TH, EV(tg.tr));
    const sc=A.s, my=A.y-8;
    const tx=A.x+(B.x-A.x)*ext, ty=my+((B.y-8)-my)*ext;
    const sag=7*sc*ext;                                 // it droops when long
    const mx=(A.x+tx)/2, cy=(my+ty)/2+sag;
    if(tg.t<5) g.globalAlpha=tg.t/5;
    g.lineCap='round';
    /* Scott, 2026-08-25: "tongue needs to stand out way more." A soft glow
       under it, then a fat crimson rim, then the tongue, then the wet — the
       one hot pink thing on an all-green screen, unmissable on purpose. */
    g.strokeStyle='rgba(255,200,225,.30)'; g.lineWidth=16*sc;   // the glow
    g.beginPath(); g.moveTo(A.x,my); g.quadraticCurveTo(mx,cy,tx,ty); g.stroke();
    g.strokeStyle='#8e1838'; g.lineWidth=11*sc;         // the rim
    g.beginPath(); g.moveTo(A.x,my); g.quadraticCurveTo(mx,cy,tx,ty); g.stroke();
    g.strokeStyle='#ff5c8a'; g.lineWidth=7.5*sc;        // the tongue
    g.beginPath(); g.moveTo(A.x,my); g.quadraticCurveTo(mx,cy,tx,ty); g.stroke();
    g.strokeStyle='rgba(255,224,236,.9)'; g.lineWidth=2.8*sc;   // the wet
    g.beginPath(); g.moveTo(A.x,my); g.quadraticCurveTo(mx,cy-2*sc,tx,ty-1.5*sc); g.stroke();
    g.fillStyle='#ff7aa0';                              // the tip
    g.beginPath(); g.arc(tx,ty,6.5*sc,0,7); g.fill();
    g.strokeStyle='#8e1838'; g.lineWidth=1.6; g.stroke();
    g.fillStyle='rgba(255,235,242,.85)';
    g.beginPath(); g.arc(tx-1.6*sc,ty-1.8*sc,1.8*sc,0,7); g.fill();
    g.globalAlpha=1;
  }
  /* THE TRIP's colour, over everything at once: a slow-crawling rainbow
     composited in 'hue' mode, which replaces what colour things ARE while
     leaving how BRIGHT they are alone. That one property is the safety
     line — the maze stays readable by luminance while every hue on the
     screen lies. Floats and HUD draw after this, so the score always tells
     the truth in its own colours. */
  { const A=tripA();
    if(A>0){
      const ph=frame*0.4;
      const rg=g.createLinearGradient(0,HUD,RW,HUD+RH);
      for(let i=0;i<=6;i++)
        rg.addColorStop(i/6,'hsl('+((ph+i*60)%360)+',85%,55%)');
      g.globalCompositeOperation='hue';
      g.globalAlpha=0.55*A;
      g.fillStyle=rg; g.fillRect(0,HUD,RW,RH);
      g.globalCompositeOperation='source-over'; g.globalAlpha=1;
    } }
  /* score popups — drawn above everything, faded out on their timer */
  for(const f of floats){
    const p=proj(f.wx, f.wy, f.wz);
    g.globalAlpha=Math.min(1, f.t/20);
    g.textAlign='center'; g.font='bold '+Math.round(13*p.s)+'px '+FONT;
    g.lineWidth=3; g.strokeStyle='rgba(10,8,18,.8)';
    g.strokeText(f.txt, p.x, p.y);
    g.fillStyle=f.col; g.fillText(f.txt, p.x, p.y);
    g.globalAlpha=1;
  }
  g.restore();

  drawHUD(g);
}
function drawHUD(g){
  const hg=g.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#221a3a'); hg.addColorStop(1,'#120c20');
  g.fillStyle=hg; g.fillRect(0,0,RW,HUD);
  g.fillStyle='rgba(140,190,255,.35)'; g.fillRect(0,HUD-2,RW,2);
  g.textAlign='left'; g.font='bold 14px '+FONT; g.fillStyle='#8fc4ff';
  g.fillText(th.name, 12, 20);
  g.font='11px '+FONT; g.fillStyle='#9a86b8';
  g.fillText('LEVEL '+level+'  ·  SPACE hop  ·  S screens  ·  1-'+Math.min(9,THEME_ORDER.length)+' jump  ·  ESC leave', 12, 37);
  g.textAlign='right'; g.font='bold 16px '+FONT; g.fillStyle='#ffe9a8';
  g.fillText(String(score).padStart(5,'0'), RW-12, 22);
  g.font='11px '+FONT; g.fillStyle='#ffd23f';
  g.fillText('LIVES '+lives, RW-12, 38);

  if(introT>0){
    g.globalAlpha=Math.min(1,introT/40); g.textAlign='center';
    g.font='bold 20px '+FONT; g.fillStyle='#ffd23f';
    g.fillText(th.name, RW/2, HUD+RH/2-8);
    g.font='12px '+FONT; g.fillStyle='#d8cfe8';
    g.fillText(th.hint||'Arrows to run. SPACE hops clean over them.', RW/2, HUD+RH/2+14);
    g.globalAlpha=1;
  }
  if(doneT>0){
    g.fillStyle='rgba(8,6,14,.72)'; g.fillRect(0,HUD,RW,RH);
    g.textAlign='center'; g.font='bold 22px '+FONT;
    g.fillStyle= over? '#ff9a9a' : '#ffd23f';
    g.fillText(over?'THE ROADS TAKE YOU':'ROAD CLEAR', RW/2, HUD+RH/2-6);
    g.font='12px '+FONT; g.fillStyle='#d8cfe8';
    g.fillText(over? 'Score '+score : 'Next: '+THEMES[THEME_ORDER[level%THEME_ORDER.length]].name,
               RW/2, HUD+RH/2+18);
  }
}

/* ---------------- API ---------------- */
window.HighMazeLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    score=0; lives=10; over=false;
    jumpLatch=true; exitLatch=true; scrUI=false; sLatch={};
    loadLevel(1);
    toast('3D WAKA. Jump with SPACE. The orange one is slow; the red one litters.');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; }
    else loadScreen(5);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw,
  /* exposed so the headless test drives the real engine, not a copy */
  _t:{ scrMenuInput, drawScrMenu, loadLevel,
       get scrUI(){return scrUI;}, set scrUI(v){scrUI=v;},
       get scrSel(){return scrSel;}, set scrSel(v){scrSel=v;},
       get grid(){return grid;}, get dots(){return dots;}, get pellets(){return pellets;},
       get pac(){return pac;}, get ghosts(){return ghosts;}, get score(){return score;},
       get lives(){return lives;}, get level(){return level;}, get theme(){return th;},
       get camWY(){return camWY;},
       COLS, ROWS, TW, TH, WZ, D0, F, CAMH, CAM_MIN, CAM_MAX,
       MAZE, MAZE_EGYPT, MAZE_GROVE, MAZE_FOUNDRY, MAZE_CAUSEWAY,
       THEMES, THEME_ORDER, HOUSE, DOOR, PEN, BONUS_TILE, CASTS, CAT_CAST, GHOST_DEF,
       TONGUE_R, isWall, RUGS, RUG_PLAYER, get tongues(){return tongues;},
       get tripT(){return tripT;}, set tripT(v){tripT=v;}, TRIP_T, tripA,
       get frightT(){return frightT;}, set frightT(v){frightT=v;},
       get ghosts(){return ghosts;}, get chain(){return chain;},
       get pills(){return pills;}, get speedT(){return speedT;},
       tideFactor, tideHigh, TIDE_CYCLE,
       get lifts(){return lifts;}, get ride(){return ride;}, LIFT_Z, BOARD_T,
       MAZE_SHIPYARD, MAZE_SUMMIT, MAZE_HEARTH, MAZE_QUAD, RIDGE, isRidge,
       SUMMIT_ELEV, EH, CLIMB_MAX,
       MAZE_OLDONE, oldLaserTick, oldLetter,
       get oldPellets(){return oldPellets;},
       get oldBeam(){return oldBeam;}, set oldBeam(v){oldBeam=v;},
       get oldFreeze(){return oldFreeze;}, set oldFreeze(v){oldFreeze=v;},
       get oldMirror(){return oldMirror;}, set oldMirror(v){oldMirror=v;},
       get oldBlack(){return oldBlack;}, set oldBlack(v){oldBlack=v;},
       get oldStun(){return oldStun;}, set oldStun(v){oldStun=v;},
       get oldFlee(){return oldFlee;}, set oldFlee(v){oldFlee=v;},
       get oldHits(){return oldHits;}, set oldHits(v){oldHits=v;},
       get oldSulk(){return oldSulk;}, get quakeT(){return quakeT;},
       get laserCd(){return laserCd;}, set laserCd(v){laserCd=v;},
       get eaten(){return eaten;},
       elevOf, EV, get elevOn(){return elevOn;}, get vwrapOn(){return vwrapOn;},
       skipIntro(){ introT=0; },
       get bonuses(){return bonuses;}, get floats(){return floats;},
       loadLevel, pacTick, ghostTick, collisions, isWall, blocked, key, at,
       proj, depth, scrEnt, inPen, flipX, SKEW,
       setPac(r,c){ pac.r=r; pac.c=c; pac.t=0; },
       get frightT(){return frightT;}, set frightT(v){frightT=v;},
       get dying(){return dyingT;}, get done(){return doneT;} }
};

})();
