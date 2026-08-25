"use strict";
/* ============================================================
   GRISHNAK — STONEBREAKER (Breakout arcade room)
   Classic brick-breaker with the valley's material language:
   1/2/3-hit masonry tiers + STEEL plates that never break
   (same riveted-square grammar as MINER THREAT). The skill is
   paddle english — where the ball meets the slab decides its
   angle; speed ramps gently with bricks broken and per level.
   Powerups fall from broken stone: WIDE (slab doubles, timed),
   +2 BALLS, SLOW (timed), LASER (timed twin bolts — bolts
   cannot break steel either). 34 walls and the Warlord, 10 lives.
   LEFT/RIGHT move · UP bumps the slab · SPACE launch · ESC leaves.
   Y wallpapers a wall · Z opens the wall builder · ? lists the lot.
   THE BUMP (Funkiball's one great idea): UP lunges the slab upward. Meet the
   ball on the RISE and it leaves SPIKED — faster, and hard enough to crack
   iron-capped DRIVEN STONE, which an ordinary ball only rings off. Miss the
   timing and the slab overshoots below its rest line on the way back and
   cannot bump again until it settles. Position is the old skill; this one is
   TIMING, which is the whole reason to add it.
   ============================================================ */
(function(){

const W=RW, H=RH+HUD;
const TOP=52;                                  // play area under the HUD bar
/* PER-WALL BRICK METRICS (Scott, 2026-08-19: "a more granular and frenetic
   stonebreaker screen? need separate engine?"). No separate engine: the board
   geometry becomes per-wall state. A wall carrying the 'fine' feature plays
   on 26 columns of half-size brick; everything downstream — bx/by, collision,
   drawing, blasts — already reads these globals at call time, so ONE setter
   is the whole mechanism. Custom walls never get 'fine' (the builder's grid
   and the server whitelist both stay 15-wide/standard). */
const GAP=2;
let COLS=13, BW=44, BH=16, LEFT=(W-COLS*(BW+GAP)+GAP)/2;
/* SQUARE BRICKS (Scott, 2026-08-23): 'sqr' makes the cell a square — chunky
   32x32 blocks on the standard pitch, or 14x14 tiles when combined with
   'fine'. Same single-setter mechanism as 'fine': every consumer reads these
   globals at call time. Naming law: every square-brick wall answers to a name
   carrying BLOCK or SQUARE (BLOCKHEAD, SQUARE ONE, ...). */
function setMetrics(fine, sqr, mix){
  /* 'mix' (2026-08-23): a 49-column lattice of 10x4 cells that every other
     size is WELDED from — see genMixWall. On this lattice a 1x1 cell is the
     extra-granular chip, 2x2 is the granular brick, 4x3 is the standard
     (46x16), 2x10 is a vertical block, 8x6 and up are boulders. */
  if(mix){ COLS=49; BW=10; BH=4; }
  else if(sqr){ COLS= fine? 37:17; BW=BH= fine? 14:32; }
  else        { COLS= fine? 26:13; BW= fine? 21:44; BH= fine? 8:16; }
  LEFT=(W-COLS*(BW+GAP)+GAP)/2;
}
const PH=10, PY=H-30, PSPD=6.8, PW0=76;
/* THE PADDLE BUMP. The slab lunges up over BUMP_UP frames, falls back through
   its rest line and overshoots BUMP_DIP below it, then settles — so a wasted
   bump really does leave you low and out of charge for a moment, which is the
   only thing that keeps it from being a free upgrade. A ball met during the
   RISE is spiked. PY stays the rest line and every speed rule keeps measuring
   from it; padY() is where the slab actually is. */
const BUMP_RISE=15, BUMP_UP=6, BUMP_FALL=10, BUMP_SETTLE=14, BUMP_DIP=8, BUMP_CD=14;
const BUMP_LEN=BUMP_UP+BUMP_FALL+BUMP_SETTLE;
const SPIKE_T=90, SPIKE_MULT=1.45;
const BALL_R=5, SPD0=3.9, SPD_RAMP=0.022, SPD_MAX=6.4;
/* SUB-STEPPED INTEGRATION — the thing the granular wall was blocked on. One
   step per frame tunnels: a max-pace ball moves ~10px and a fine brick is 8px
   tall, so the ball could cross a whole brick between two looks. The ball now
   advances in sub-steps no longer than SUBMAX, running the full collision
   pass each sub-step. On the standard walls this almost always resolves to
   the single step it always was. */
const SUBMAX=6;
/* THE WARLORD — the boss, and he is always the LAST wall (see LEVELS.push).
   The eye opens EYE_OPEN of every EYE_CYC frames; hits land only then. He
   rebuilds one shield brick every REGEN_T, lobs an ember every ATK_T, and a
   caught ember scorches the slab short for BURN_T frames. */
const BOSS_HP=18, BOSS_W=136, BOSS_H=26, BOSS_Y=TOP+18, BOSS_SPD=1.1;
const EYE_CYC=360, EYE_OPEN=120, REGEN_T=300, ATK_T=280, EMBER_SPD=2.4, BURN_T=300;
/* HEIGHT GRADIENT (Scott 2026-08-13): the ball flies 50% FASTER than the
   old pace up at the wall, fading to only 60% of it down at the slab —
   frantic in the bricks, catchable at the paddle. Per-ball, per-frame,
   layered on every other speed rule (ramp, level, SLOW). */
const SPD_HI=1.5, SPD_LO=0.6;
/* POCKET SHOTS (Scott 2026-08-13): at the start of the game, of every
   wall, and after every lost ball, the slab carries TWO charges. While
   the ball is in flight, SPACE fires a single laser bolt straight up.
   The LASER powerup suppresses manual fire (bolts already raining). */
const SHOTS=2;
const PUP_FALL=1.7, PUP_CHANCE=0.16, LASER_CD=22;
const WIDE_T=720, SLOW_T=480, LASER_T=480;     // 12s / 8s / 8s
const BOLIDE_T=300, BOLIDE_R=36;               // 5s of flaming bolide; smash radius (px)

/* '.'=air  1/2/3=masonry tiers  '#'=STEEL (never breaks, doesn't count)
   'T'=TUNNEL CHARGE — break it and a drill bores BOTH WAYS along its row,
   eating every brick to the edge (steel stops a bore).
   'K'=POWDER KEG — fizzing. Touch it and it BLOWS the surrounding bricks
   apart (steel excepted). Kegs chain.
   EVERY wall keeps its top row EMPTY: punch through (or slip a funnel) and
   the ball gets trapped up there, pinballing across the brick tops.
   Wall 1 — THE CHIMNEY (Scott 2026-08-15): a steel pillar stands in
   column 2, running from three courses below the ceiling down to the
   dead-halfway line, and from its foot a steel floor runs out to the
   right wall. Above that floor the field is a comb — blank column,
   brick column, blank, and on across. Everything is sealed except one
   thing: the single-column lane at the far LEFT, between the pillar and
   the wall, which the floor deliberately does not cover. Thread the ball
   up that lane, over the pillar's head, and it drops into the comb and
   rattles down the slots with the steel floor holding it in.
   Wall 2 — THE KEG COVES: two round-shouldered brick cups, mouths open to
   the sky, each with a fizzing keg in its hollow and a steel plate
   underneath. Drop the ball into a cup and it bangs around the bowl
   until it finds the keg. Then the cove opens.
   Wall 3: four columns INTERWOVEN with staggered ribs — the pockets between
   them are ricochet chambers; the show is watching the ball rattle.
   (Mixed masonry since 2026-08-23: the columns are 2x15 vertical blocks,
   each rib is ONE 6x2 slab, and granular chips rattle in the chambers.
   Extended DOWN 4 rows same day — one more stagger of ribs and pockets.)
   Wall 4 — THE SHELF (cube dome, Scott 2026-08-23): the steel border
   still runs dead-halfway down from the left edge to ~81% across —
   ONE seamless 41x2 span on the mix lattice, top face at y214 — but
   the staircase above it is gone. In its place THE DOME: 173 of the
   smallest cubes the game can cut (1x2 span = 10x10 px) in a filled
   semicircle, flat side over the shelf, one cube at the crown. Two
   tier-3 courses of standard cuts below. The right lane is still the
   only road over.
   Wall 5 — THE GALLERIES: a steel chimney climbs the right edge. Thread
   the ball into its mouth and it ricochets UP the shaft to the open
   sky-strip, then chews DOWN through three hollow galleries stratified
   between full brick floors — kegs chaining, powerups raining (drop
   chance 30% here, up to 4 falling at once). Mixed masonry since
   2026-08-23: the floors are single wide slabs, each gallery exhibits a
   tier-3 standard cut among 2x2 kegs, granular pieces and loose chips,
   and the chimney is four seamless steel spans.
   Wall 6: TWO CATS, three columns apart — real silhouettes: gapped ears,
   a narrow head on wide shoulders, a leg gap, a tail nub swept outward.
   Their steel eyes never break — break the cats and the eyes stay,
   watching. */
//LEVELS-START
const LEVELS_SRC=[
 /* wall 1 — THE CHIMNEY, mixed masonry (Scott, 2026-08-23: "replace level 1
    3 middle columns of bricks with same shapes but made of smallest size
    bricks - it's very cool when the ball bounces around rapidly amongst
    those"). Same geometry as ever — pillar at x63, floor top at y214, the
    one uncovered lane on the far left — but the comb's THREE MIDDLE COLUMNS
    are now packed with 36 smallest cubes each (1x2 span = 10x10 px), while
    the outer two keep the old standard cut. The floor is SEGMENTED with a
    steel anchor under every cube column: a 1-wide cube's vertical scan can
    only be stopped by an anchor in its own column (the parser's law). */
 ["...................................................",
  "...................................................",
  "...................................................",
  "...................................................",
  "...................................................",
  "...................................................",
  "...................................................",
  "...................................................",
  "...................................................",
  "....#+++....1+++....1111....1111....1111....1+++...",
  "....++++....++++....++++....++++....++++....++++...",
  "....++++....++++....1111....1111....1111....++++...",
  "....++++....1+++....++++....++++....++++....1+++...",
  "....++++....++++....1111....1111....1111....++++...",
  "....++++....++++....++++....++++....++++....++++...",
  "....++++....1+++....1111....1111....1111....1+++...",
  "....++++....++++....++++....++++....++++....++++...",
  "....++++....++++....1111....1111....1111....++++...",
  "....++++....1+++....++++....++++....++++....1+++...",
  "....++++....++++....1111....1111....1111....++++...",
  "....++++....++++....++++....++++....++++....++++...",
  "....++++....1+++....1111....1111....1111....1+++...",
  "....++++....++++....++++....++++....++++....++++...",
  "....++++....++++....1111....1111....1111....++++...",
  "....++++....1+++....++++....++++....++++....1+++...",
  "....++++....++++....1111....1111....1111....++++...",
  "....++++....++++....++++....++++....++++....++++...",
  "....#+++++++#+++++++#####+++#####+++#####+++#+++++.",
  "....++++++++++++++++++++++++++++++++++++++++++++++."],
 /* wall 2 — THE COOPERAGE (Scott, 2026-08-24: "decide for me about stonebreaker
    wall 2"). The two shallow cups are gone; the wall is now a pun on its own
    trade. Three barrels on a rack: 2-wide vertical blocks are the STAVES,
    granular pairs band them as HOOPS top and bottom, and a keg sits as the
    BUNG at each heart. The MIDDLE barrel is sealed — staves capped across its
    mouth — so its keg cannot be struck directly and is only reached by
    CHAINING a blast from a neighbour, which is the wall's whole lesson.
    Three authoring laws visible at once: the bung keeps a '.' gutter each side
    (width-scan absorb), the cap is two 2-wide pieces on the hoops' own pitch
    (vertical absorb), and the rack is segmented one plate per hoop column
    (a scan only stops on an anchor in its OWN column — the wall-1 lesson). */
 ["...................................................",
  "...................................................",
  "..1+1+1+1+1+1+....1+1+1+1+1+1+....1+1+1+1+1+1+.....",
  "..++++++++++++....++++++++++++....++++++++++++.....",
  "..2+2+....2+2+....2+2+2+2+2+2+....2+2+....2+2+.....",
  "..++++....++++....++++++++++++....++++....++++.....",
  "..++++.K+.++++....++++.K+.++++....++++.K+.++++.....",
  "..++++.++.++++....++++.++.++++....++++.++.++++.....",
  "..++++....++++....++++....++++....++++....++++.....",
  "..1+1+1+1+1+1+....1+1+1+1+1+1+....1+1+1+1+1+1+.....",
  "..++++++++++++....++++++++++++....++++++++++++.....",
  "..#+#+#+#+#+#+....#+#+#+#+#+#+....#+#+#+#+#+#+.....",
  "..++++++++++++....++++++++++++....++++++++++++.....",
  "...................................................",
  "..................................................."],
 /* wall 3 — THE RIBS, remade in MIXED MASONRY (Scott, 2026-08-23: "add some
    of this brick mixing on levels 3, 5..."). Same wall, truer to its name:
    the four columns are now real 2x15 VERTICAL BLOCKS, the ribs are single
    6x2 slabs woven between them at staggered heights, and loose granular
    chips rattle in the ricochet chambers. Funnel rows 0-2 stay open, no
    steel, no tunnels — the pockets are still the whole show. Extended down
    4 rows (Scott 2026-08-23): the outer ribs get a third course at r14-15,
    the chambers a fourth at r16-17, six more chips in the new pockets. */
 ["...................................................",
  "...................................................",
  "...................................................",
  "........2+.........2+.........2+.........2+........",
  "........++1+++++...++..1+++++.++1+++++...++..1.....",
  "........++++++++...++..++++++.++++++++...++........",
  ".1+++++.++.........++.1.......++.......1.++.1+++++.",
  ".++++++.++1........++......1..++.........++.++++++.",
  "........++..1+++++.++1+++++...++..1+++++.++........",
  "........++..++++++.++++++++...++..++++++.++........",
  ".1+++++.++.1....1+.++.........++.1.......++1+++++..",
  ".++++++.++......++.++.........++.........++++++++..",
  "........++1+++++...++..1+++++.++1+++++...++........",
  "........++++++++...++..++++++.++++++++...++........",
  ".1+++++.++...1.....++.....1...++..1......++.1+++++.",
  ".++++++.++1........++.......1.++1........++.++++++.",
  "........++..1+++++.++1+++++...++..1+++++.++........",
  "........++..++++++.++++++++...++..++++++.++........"],
 /* wall 4 — THE SHELF, remade in MIXED MASONRY (Scott, 2026-08-23:
    "replace stonebreaker level 4 blocks above the steel wall with smallest
    size cubic bricks, in a filled-in semicircle type shape"). THE DOME:
    173 of the smallest cube the game can cut — a 1x2 span on the mix
    lattice is EXACTLY 10x10 px — stacked as a filled semicircle, flat side
    resting one air row above the shelf, one lone cube at the crown. The
    shelf itself is now ONE seamless 41x2 steel span whose top face sits at
    y=214, the same halfway line the old 11 plates held, and the two tier-3
    courses below are standard 4x3 cuts. The right lane stays the only
    road over. */
 ["...................................................",
  "...................................................",
  "...................................................",
  "...................................................",
  ".....................1.............................",
  ".....................+.............................",
  ".................111111111.........................",
  ".................+++++++++.........................",
  "...............1111111111111.......................",
  "...............+++++++++++++.......................",
  "..............111111111111111......................",
  "..............+++++++++++++++......................",
  ".............11111111111111111.....................",
  ".............+++++++++++++++++.....................",
  ".............11111111111111111.....................",
  ".............+++++++++++++++++.....................",
  "............1111111111111111111....................",
  "............+++++++++++++++++++....................",
  "............1111111111111111111....................",
  "............+++++++++++++++++++....................",
  "...........111111111111111111111...................",
  "...........+++++++++++++++++++++...................",
  "...........111111111111111111111...................",
  "...........+++++++++++++++++++++...................",
  "...........111111111111111111111...................",
  "...........+++++++++++++++++++++...................",
  "...................................................",
  ".#++++++++++++++++++++++++++++++++++++++++.........",
  ".+++++++++++++++++++++++++++++++++++++++++.........",
  "...................................................",
  ".3+++3+++3+++3+++3+++3+++3+++3+++3+++..............",
  ".++++++++++++++++++++++++++++++++++++..............",
  ".++++++++++++++++++++++++++++++++++++..............",
  ".3+++3+++3+++3+++3+++3+++3+++3+++3+++3+++..........",
  ".++++++++++++++++++++++++++++++++++++++++..........",
  ".++++++++++++++++++++++++++++++++++++++++.........."],
 /* wall 5 — THE GALLERIES, remade in MIXED MASONRY (same Scott ask). The
    steel chimney still climbs the right side — four segmented 2-wide steel
    spans whose anchor rows COINCIDE with the floor anchor rows, so the
    floor runs read '#' and stop (the parser's absorb law) — with the open
    shaft beside it. Three hollow galleries between full slab floors, each
    an exhibition of cuts: a tier-3 standard piece, 2x2 kegs (eight, as
    ever), granular exhibits and loose chips. One air row above every
    floor: a gallery piece touching a floor's top gets absorbed by the
    vertical scan, which is the other authoring law this map teaches. */
 ["...................................................",
  "...................................................",
  ".....3+++....K+....1+..........1.....K+......#+....",
  ".....++++.1..++....++....K+......1+..++....1.++....",
  ".....++++................++......++..........++....",
  ".............................................++....",
  ".2++++++++++++++2+++++++++++++2++++++++++++++#+....",
  ".++++++++++++++++++++++++++++++++++++++++++++++....",
  ".....K+.........1+.........1..3+++......K+...++....",
  "..1..++.........++...K+.......++++..1+..++.1.++....",
  "...........1.........++.......++++..++.......++....",
  ".............................................++....",
  ".2++++++++++++++2+++++++++++++2++++++++++++++#+....",
  ".++++++++++++++++++++++++++++++++++++++++++++++....",
  "....1+..1..K+....1..3+++...1+..K+..1..1+...1.++....",
  "....++.....++.......++++...++..++.....++.....++....",
  ".............................................++....",
  ".2++++++++++++++2+++++++++++++2++++++++++++++#+....",
  ".++++++++++++++++++++++++++++++++++++++++++++++...."],
 ["...............",
  "..1.1.....1.1..",
  "..111.....111..",
  "..#1#.....#1#..",
  "..111.....111..",
  ".22222...22222.",
  ".23332...23332.",
  ".23332...23332.",
  ".22.22...22.22.",
  ".1...........1."],
 ["...............",
  ".2.2.2.2.2.2.2.",
  ".#3.3.3.3.3.3#.",
  ".2.2.2.2.2.2.2.",
  "..1.1.1.1.1.1..",
  ".1..1..1..1..1."],
 ["..............."],                            // wall 8 is GENERATED, see genRandomWall
 ["...............",
  ".1233321..121..",
  ".2333332..1231.",
  ".1233321.#1231.",
  "..12321..#.12..",
  "..11111....11.."],
 ["...............",
  ".122.......221.",
  ".2332.....2332.",
  ".1221.....1221.",
  "...............",
  "...............",
  "......232......",
  ".....13331....."],
 ["...............",
  ".111111K111111.",
  ".1#111#111#111.",
  ".222222T222222.",
  ".222#222#222#2.",
  "...K.3.3.3.K...",
  "..#...#...#....",
  "..#.#.#.#.#.#..",
  "..#.#.#.#.#.#..",
  "..#.#.#.#.#.#..",
  "..#.#.#.#.#.#..",
  "..............."],
 ["...............",
  ".#11111111111#.",
  ".1...........1.",
  ".1.#222.222#.1.",
  ".1.2.......2.1.",
  ".1.2.33K33.2.1.",
  ".1.2.3K3K3.2.1.",
  ".1.2.......2.1.",
  ".1.#2222222#.1.",
  ".1...........1.",
  ".#11111.11111#.",
  "..............."],
 /* wall 13 — THE APPROACH: perspective runway. Steel pylons flank the
    lane in world-parallel pairs (the render converges them toward the
    far wall), advancing V-squadrons hold the middle with kegs at the
    formation hearts, a tunnel charge rides the near rank. */
 ["...............",
  ".....33333.....",
  "...#.33K33.#...",
  ".....33.33.....",
  "...............",
  "...#..111..#...",
  "..22.11T11.22..",
  "...2.......2...",
  "...#K.....K#...",
  "..11.......11..",
  "...............",
  "..............."],
 /* wall 14 — THE DESCENT: the whole wall creeps DOWN, lurching at random,
    and any masonry that touches the landing line costs a life. 'G' bricks
    GESTATE and hatch loose — they come at you on their own, early. The
    strategy inverts breakout: shoot the BOTTOM row to buy time, because
    the lowest brick owns the clock. */
 ["...............",
  ".3.3.3.3.3.3.3.",
  ".2222222222222.",
  "..#.G.....G.#..",
  ".1111111111111.",
  "...2.2.2.2.2...",
  ".....11111....."],
 /* wall 15 — THE BUMPERS: a pinball table, rebuilt 2026-08-15 after Scott
    called it unreadable. Every 'O' bumper now lives in the TOP half, where
    chaos belongs — the old pair down at row 10 fired the ball at the slab
    from mid-screen with nothing in between, which is not difficulty, it is a
    coin flip. Down at the flanks instead sit two 'S' SLINGSHOTS: the same
    unbreakable stone, but a fixed, learnable shot — always up, always inboard,
    never boosted. The steel-ended band across the middle is the support: while
    it holds, the whole ricochet stays above it and you play a normal wall. */
 ["...............",
  ".333.......333.",
  ".322.......223.",
  ".311.......113.",
  "....O.....O....",
  ".......O.......",
  "..O.........O..",
  ".....O...O.....",
  "..#222222222#..",
  "...............",
  ".S...........S.",
  "....1.1.1.1...."],
 /* wall 16 — THE GRANITE (Scott: "granite blocks, each hit makes them lighter
    then they turn yellow, finally become dripping lava, then I dunno what
    happens next"). What happens next is that lava RUNS. A granite brick does
    not break — at zero it turns MOLTEN, stops counting against you, and starts
    dripping onto whatever is underneath. A drip melts two hits off the brick
    below, so grinding one column HEAD buys the rest of that column for free:
    the chore becomes an investment with a visible dividend, and the shape of
    the wall starts to matter (tall columns are worth attacking; strays are
    not). The same drip costs you a life if you catch it on the slab, and a
    ball that falls through one comes out HOT and melts what it touches.
    Four columns in a steel furnace, standing on a masonry floor the lava
    will do for you, with two kegs underneath for the impatient. */
 ["...............",
  "...............",
  "..#.........#..",
  "..#.A.A.A.A.#..",
  "..#.A.A.A.A.#..",
  "..#.A.A.A.A.#..",
  "..#.A.A.A.A.#..",
  "..#.A.A.A.A.#..",
  "..#.A.A.A.A.#..",
  "..#.........#..",
  "..22222222222..",
  "...............",
  "....K...K......"],
 /* wall 17 — THE GREENWOOD (Scott: "blocks that need to be turned gradually
    from dark green to light green, then vanish in a puff of smoke"). Shipped
    as specified this would have been THE GRANITE twice — both are colour-ramp
    multi-hit bricks — so it is the OPPOSITE wall instead: green left alone
    RE-DARKENS. Granite rewards spreading damage, because the chains finish
    the job; greenwood punishes it and rewards finishing what you started.
    Same visual language, opposite strategy, and between them they teach the
    player something. Six one-wide plots with steel caps — the lanes between
    ONE contiguous band, not the six one-wide plots it started as: those made
    individual bricks hard to reach, and regrow turns hard-to-reach into never-
    finishes — a bot left alone for sixteen minutes still could not close the
    last one out. Reachability has to be free here, so that DISCIPLINE is the
    only thing the wall is actually testing. */
 ["...............",
  "...............",
  "...............",
  "...............",
  "..ggggggggggg..",
  "....ggggggg....",
  "...............",
  ".#2.2.2.2.2.2#.",
  "...............",
  "....K.....K...."],
 /* wall 18 — THE COOLING HOUSE (Scott: "a level involving something about
    water and cooling/brittleness" + "pooled water where the ball slows down,
    but how do we justify it speeding up again?"). The answer is not to justify
    it: speed is not tied to the water at all, it is tied to BALL TEMPERATURE.
    Water COOLS — it does not slow — so leaving the pool never has to explain
    anything, because leaving the pool does nothing. A hot ball is fast and
    skids straight off brittle stone; a cold ball is slow and shatters it
    outright. The ball reheats by WORKING: every brick it breaks warms it back
    toward fast. So the pool is a decision, not a physics rule — dunk to go
    cold and brittle-break the core, then earn your speed back through the
    masonry on the way out. The ball's colour IS the temperature; no HUD.
    Lava heats on wall 16, water cools on wall 18: one mechanic, both ends. */
 ["...............",
  "....bbbbbbb....",
  "...bbbbbbbbb...",
  "...bb#####bb...",
  "...bbbbbbbbb...",
  "....bbbbbbb....",
  "...............",
  "..2.2.2.2.2.2..",
  "..1.1.1.1.1.1..",
  "..............."],
 /* wall 19 — THE ANVIL: the wall the bump is for. The vault sits LOW, right in
    front of the slab, because a spiked ball is at its hardest the instant it
    leaves — so the thing you have to smash is the thing directly in front of
    you, which is the most legible place a designer can put it. Its iron-capped
    DRIVEN STONE rings off an ordinary ball and cracks only under a drive.
    Open lanes down both flanks (with steel kickers at the bottom) carry normal
    play up to the terraces; two one-wide chimneys through the tier-2 band are
    the other road to the treasure. Every driven stone in the valley glints
    while a spike is live, so the wall tells you your window is open. */
 ["...............",
  "...............",
  "..3.3.3.3.3.3..",
  "...............",
  ".22222.2.22222.",
  "...............",
  "..1.1.1.1.1.1..",
  "...............",
  "...DDDDDDDDD...",
  ".#.D3333333D.#.",
  "...DDDDDDDDD..."],
 /* 20 — THE ZING. Three rotors, and everything under them is a straight run of
    ordinary brick, because the point of the wall is that the ordinary run stops
    behaving ordinarily the moment you clip a rotor. The two high ones turn
    OPPOSITE ways (the sign follows the column, so they alternate), which stops
    the wall being a single bias you learn once; the low one sits dead centre
    where a returning ball meets it whether you wanted that or not. Steel at the
    shoulders gives a skewed ricochet something worth hitting. */
 ["...............",
  ".#...........#.",
  "..22222222222..",
  "...............",
  "....@.....@....",
  "...............",
  "..3.3.3.3.3.3..",
  "...............",
  ".......@.......",
  "...............",
  "..11111111111.."],
 /* 21 — THE CRUCIBLE (Scott: "a more granular and frenetic stonebreaker
    screen"). 26 columns of half-size brick, nested boxes of masonry with a
    keg pair, twin rotors, and a greenwood picket regrowing along the floor.
    Speed runs 18% hot (the 'frenzy' feature). The map is 28 wide: margin
    column each side, same clamp rule as the 15-wide walls. */
 ["............................",
  ".11111111111111111111111111.",
  ".1........................1.",
  ".1.2222222222222222222222.1.",
  ".1.2....................2.1.",
  ".1.2.33333333..33333333.2.1.",
  ".1.2.3................3.2.1.",
  ".1.2.3..K..........K..3.2.1.",
  ".1.2.3...@......@.....3.2.1.",
  ".1.2.3................3.2.1.",
  ".1.2.333333333333333333.2.1.",
  ".1.2....................2.1.",
  ".1.2222222222222222222222.1.",
  ".1........................1.",
  ".g..g..g..g..g..g..g..g..g..",
  ".#........................#."],
 /* 22 — THE MURMURATION (Scott, 2026-08-18: "a granular bird-murmuration-ish
    stonebreaker screen... in the granular format, mathematically moving
    bricks"). GENERATED, see genMurmurWall — a flock of fine-brick starlings
    that wheels, breathes and ripples as one animal. No steel, no kegs:
    the moving target IS the wall. */
 ["............................"],
 /* 23 — THE STARFALL (Scott, 2026-08-18: "some kind of meteor storm level").
    A mountain-top observatory under a sky that has turned against it: the
    storm comes in TELEGRAPHED WAVES — calm, a warning burn along the sky,
    then meteors streaking down. Meteors smash masonry for free, shatter on
    steel, SCORCH the slab if you stand under one, and a ball met mid-air
    shatters the rock for a fat bounty — the skill move of the wall. */
 ["...............",
  "...............",
  "......232......",
  "....23#3#32....",
  "...233333332...",
  "..11.11111.11..",
  "..1#.......#1..",
  "..1.........1..",
  "..1.........1.."],
 /* 24 — THE LODGE (Scott, 2026-08-19: "a general transition methodology...
    a leads to b"). The Warlord was a mason (his men said so at the dig) and
    this is his lodge: a wall that performs its RITES as you break it. Three
    a→b transitions, one of each effect the engine offers — see WALL_RITES:
    8 bricks broken → the masonry courses SETTLE one row (glide, not teleport);
    the tier-3 heart cleared → a second course is LAID above (reveal, keg in
    the keystone); both runes broken → the steel remembers being stone (swap).
    The 'R' glyphs are the runes — breakable, and the wall cannot end without
    them, so the third rite always gets its moment. */
 ["...............",
  "...............",
  ".#R.3333333.R#.",
  "...............",
  ".2222222222222.",
  ".1111111111111."],
 /* 25 — THE COLONY (Scott, 2026-08-19: "a Game Of Life type stonebreaker
    screen in the granular format"). GENERATED, see genLifeWall — a random
    soup of living cells on the fine grid, evolving by Conway's B3/S23 every
    LIFE_STEP frames. Births glow in, deaths fade out (no score — only YOUR
    kills pay), and a cell fading means the rules already condemned it: the
    doomed dim a step ahead, so the wall teaches its own law. Breaking a cell
    changes its neighbours' fate — the wall is an opponent that answers. */
 ["............................"],
 /* wall 26 — THE PLAYSET. A toy fortress: crenellated parapet, two tower
    shafts, a hollow keep with something rattling inside it, and a steel
    gate lintel you cannot break. The shape is a castle a child would
    recognise, because that is exactly what it is. */
 ["...............",
  "..1.1.1.1.1.1..",
  "..11111111111..",
  "..2.........2..",
  "..2..33333..2..",
  "..2..3...3..2..",
  "..2..3.K.3..2..",
  "..22233#33222..",
  "..2....#....2..",
  "..333.....333.."],
 /* wall 27 — THE LOOM. The courses are HUNG, not laid: each one rides a line
    between two iron ANCHOR PINS, and the line answers to what you do to it.
    Chip a course and it DROOPS (a catenary, closed form, nothing integrated).
    Cut both its pins and it goes SLACK and comes down — resting on whatever
    course is still standing under it, or, with nothing left below, onto the
    floor, where it shatters and costs you a life.
    Which makes the whole wall one lesson: CLEAR THE COURSE, THEN THE PINS.
    A course whose stone is already gone has nothing left to fall. */
 ["...............",
  "...............",
  "..N111111111N..",
  "...............",
  "..N222222222N..",
  "...............",
  "..N333333333N..",
  "...............",
  "..N222222222N..",
  "...............",
  ".#N111111111N#."],
 /* wall 28 — THE TOLLHOUSE. The first wall in the game about MONEY. Every
    brick you break drops a coin worth its tier; the slab catches them. LOCKED
    STONE carries a price on its face — hit it holding the price and it simply
    opens and pays a bounty; hit it broke and it chips like six-deep masonry.
    So a toll is a DISCOUNT, never a gate: there is no arrangement of misses
    that can seal the wall, which is the whole reason it is built this way.
    Cheap course in front funds the dear one behind it. */
 ["...............",
  "....3333333....",
  "...............",
  "..yyyyyyyyyyy..",
  "...............",
  "..2.2.2.2.2.2..",
  "...............",
  "..xxxxxxxxxxx..",
  "...............",
  ".#.111111111.#.",
  "..1.1.1.1.1.1.."],
 /* wall 29 — THE CEILING. There is a second gutter, and it is above you. A
    second slab guards it and MIRRORS the one in your hands — you go left, it
    goes right — so one control defends both ends and the whole wall is
    learning to think in the mirror. The flanks are left open on purpose: the
    roof is live from the first serve, not a surprise saved for the endgame.
    Losing the ball off the top costs exactly what losing it down does. */
 ["...............",
  "...............",
  "...............",
  "...222222222...",
  "...............",
  "...111#1#111...",
  "...............",
  "...333333333...",
  "...............",
  "..2.2.2.2.2.2..",
  "..............."],
 /* wall 30 — THE UNSEEN (Scott, 2026-08-23: "invisibricks - when hit, it
    disappears, and the ones within 2 cells of it become 1% less invisible -
    start with weird unintuitive dense pattern(s)"). Fine grid, 142 bricks of
    plain stone, and NONE of them draw. The pattern is a moire interference
    field — (c²+r²) mod 7 crossed with (3c+5r) mod 11 — so the channels and
    clumps follow no instinct you own. You play it by SONAR: every strike
    pings a brief outline, every break gives its neighbours within 2 cells
    +1% of visible (the literal spec), and the map assembles in your head a
    ghost at a time. No steel, no kegs — the dark is the whole opponent. */
 ["............................",
  ".111...11.1....1.1..1.1.11..",
  ".11.1...11.....1............",
  "...1..1...1......11......1..",
  ".1...1.111..1.1.1..111.1....",
  "..11.1.1.1111.1.1.11.111.11.",
  "..1..11111..1.111....1111...",
  ".1....1.1.1..1...1..11..1.1.",
  ".11..1.111....1111...11.1...",
  "..1.11.111.11..11.1...11....",
  "..1...11.11..11..1..1...1...",
  ".1..1..11..11.11...1.111..1.",
  "...1.11..11.111.11.1.1.1111."],
 /* wall 31 — THE GRIN (Scott, 2026-08-23: "skull formation with steel teeth -
    granular design method"). A fine-grid skull: tier-3 cranium in a tier-2
    shell, hollow eye sockets each holding a powder-keg glint (shoot the eye,
    the eye answers), a nose you can thread, and TWO OFFSET ROWS OF STEEL
    TEETH. Steel never breaks and never counts — clear the whole skull and
    the teeth stay hanging in the dark. The grin is the part you can't kill. */
 ["............................",
  ".........2222222222.........",
  ".......22333333333322.......",
  "......2333333333333332......",
  ".....233333333333333332.....",
  ".....2333...3333...3332.....",
  ".....2333.K.3333.K.3332.....",
  ".....2333...3333...3332.....",
  ".....22333333..33333322.....",
  ".......11222222222211.......",
  ".......1............1.......",
  ".......1.#.#.#.#.#..1.......",
  ".......1..#.#.#.#.#.1.......",
  "........111111111111........"],
 /* wall 32 — BLOCKHEAD (Scott, 2026-08-23: square bricks, "names that
    include block or square"). The first SQUARE wall: 32x32 blocks, 17 to a
    row. A big dumb head in cut stone — keg eyes in hollow sockets (shoot the
    eye, the eye shoots back), a tier-3 nose, and a tier-3 jaw that takes
    three hits a block because of course it does. No steel: everything on a
    blockhead breaks eventually, even the jaw. Row 0 stays open — the trap
    channel over the wall is a law every wall keeps. */
 ["...................",
  "....22222222222....",
  "...2111111111112...",
  "...21.K.111.K.12...",
  "...2111113111112...",
  "...2113333333112..."],
 /* wall 33 — SQUARE ONE (square + fine: 14x14 tiles, 37 to a row). Back to
    square one: a checkerboard the whole width of the board — every tile
    diagonal-adjacent only, so the ball THREADS the lattice instead of
    grinding a face — with a big tier-3 numeral 1 chalked on the seam where
    the wall came down wrong. A moat of bare board keeps the numeral legible
    until you erase it yourself. */
 [".......................................",
  ".1.1.1.1.1.1.1.1.......1.1.1.1.1.1.1.1.",
  "..1.1.1.1.1.1.....333.1.1.1.1.1.1.1.1..",
  ".1.1.1.1.1.1.1.333333..1.1.1.1.1.1.1.1.",
  "..1.1.1.1.1.1...33333.1.1.1.1.1.1.1.1..",
  ".1.1.1.1.1.1.1....333..1.1.1.1.1.1.1.1.",
  "..1.1.1.1.1.1.1.1.333.1.1.1.1.1.1.1.1..",
  ".1.1.1.1.1.1.1.1..333..1.1.1.1.1.1.1.1.",
  "..1.1.1.1.1.1.1.1.333.1.1.1.1.1.1.1.1..",
  ".1.1.1.1.1.1.1....333....1.1.1.1.1.1.1.",
  "..1.1.1.1.1.1..333333333..1.1.1.1.1.1..",
  ".1.1.1.1.1.1.1...........1.1.1.1.1.1.1."],
 /* wall 34 — THE MASON'S YARD (the 'mix' wall: every cut of stone in one
    yard). 49-column lattice of 10x4 cells; anchor+'+' welds rectangles into
    single bricks — see genMixWall. Two VERTICAL BLOCKS (2x10 pillars) on
    steel feet, a tier-3 keystone flanked by four standard-cut bricks, a
    granular 2x2 field around a court holding two 2x2 kegs, a dithered band
    of extra-granular 1x1 chips, and two 6x4 boulders on the low flanks. */
 ["...................................................",
  "...................................................",
  "........2+...2+++2+++3+++++++2+++2+++...2+.........",
  "........++...++++++++++++++++++++++++...++.........",
  "........++...++++++++++++++++++++++++...++.........",
  "........++..............................++.........",
  "........++..1+1+1+1+1+......1+1+1+1+1+..++.........",
  "........++..++++++++++.K+K+.++++++++++..++.........",
  "........++..1+1+1+1+1+.++++.1+1+1+1+1+..++.........",
  "........++..++++++++++......++++++++++..++.........",
  "........++..............................++.........",
  "........++..............................++.........",
  "........#+..1.1.1.1.1.1.1.1.1.1.1.1.1...#+.........",
  "........++...1.1.1.1.1.1.1.1.1.1.1.1.1..++.........",
  "..3+++++....1.1.1.1.1.1.1.1.1.1.1.1.1......3+++++..",
  "..++++++...................................++++++..",
  "..++++++...................................++++++..",
  "..++++++...................................++++++.."]
];
/* THE FINAL WALL IS ALWAYS THE FINAL WALL. New walls go INSIDE the literal
   above — the Warlord is appended after it, so anything added simply shifts
   him up a key. loadLevel keys his features off LEVELS.length-1, never off a
   number that could go stale. */
const BOSS_WALL=[
  "...............",
  ".#...........#.",
  "...............",
  "...............",
  ".2222222222222.",
  ".1111111111111.",
  "..............."];
LEVELS_SRC.push(BOSS_WALL);

/* ============ THE PLAY ORDER (Scott, 2026-08-25) =========================
   "reorder the stonebreaker walls: 6 first, then 8, 4, 10, then the rest as
   they were, re-numbered accordingly."

   Done as ONE PERMUTATION rather than by moving 35 map literals around and
   hand-remapping four index-keyed tables after them. WALL_FIRST is written
   in the numbers Scott used (1-based, minus one); everything downstream —
   LEVELS, WALL_NAMES, FEATS, WALL_CARDS, LODGE_LVL — is derived. Reordering
   again is a one-line edit to WALL_FIRST, not a refactor.

   THIS MUST SIT BELOW THE BOSS PUSH. The literal above holds 34 walls and
   the Warlord is appended after it — exactly as its own comment warns. Built
   above the push, the permutation covered 34 walls while LEVELS ended up
   with 35, and WALL_NAMES came out one short of the map list.

   Authoring stays in the ORIGINAL order: new walls still go inside the
   LEVELS_SRC literal, the Warlord is still pushed after it, and because
   nothing promotes his index he stays last in play. */
const WALL_FIRST=[5,7,3,9];              // TWO CATS · THE QUARRY FIELD · THE SHELF · THE HEAVY STAR
const WALL_ORDER=WALL_FIRST.concat(
  LEVELS_SRC.map((_,i)=>i).filter(i=>WALL_FIRST.indexOf(i)<0));
const OLD_TO_NEW=[]; WALL_ORDER.forEach((o,n)=>{ OLD_TO_NEW[o]=n; });
const LEVELS=WALL_ORDER.map(i=>LEVELS_SRC[i]);
/* remap any {oldIndex: value} table onto the play order */
const reindex=src=>{ const out={};
  for(const k in src){ const n=OLD_TO_NEW[+k]; if(n!==undefined) out[n]=src[k]; }
  return out; };
/* wall 11 — THE PACHINKO DECK: seven one-lane tunnels between steel
   walls at the bottom — pick one, thread the ball up it — opening into
   a stud room and a dense pin-field above: staggered steel studs whose
   bounce-jitter IS the pinball, a keg at each flank, a tunnel charge
   dead centre. Wall 12 — THE VAULT: two concentric brick rings with
   OFFSET mouths (outer opens at the bottom, inner at the top — no
   straight shot), steel kicker corners, open one-wide gap circuits to
   rattle around, and a tier-3 keg core waiting in the middle. */
/* walls past 9 answer to LETTER keys — A, B, C, D, E... in an UNBROKEN
   sequence. 'e' used to be skipped here because it was the exit key, which
   meant wall 14 answered to 'f' and anyone counting on their fingers hit
   EXIT instead (Scott, 2026-08-15). ESC is the exit now and 'e' is just a
   wall. WASD paddle aliases were retired earlier (Scott 2026-08-13):
   arrows are the documented controls. */
/* fifteen walls past nine — the alphabet is FULL: the Starfall took the last
   spare and the boss now rides 'o'. The string may NEVER grow to 'p' (P is
   the pause key, the trap 'g' sprang once already), which means letter jumps
   are CLOSED to new walls — the wall menu (W) is the road from here on. */
const WALL_KEYS='abcdefghijklmno';
/* THE WALL MENU (Scott, 2026-08-18: "we need a little screen selection menu —
   M mutes, doesn't go to murmuration"). The shell's global mute key eats 'm'
   before this layer ever sees it, so wall 22's letter is dead on arrival —
   the 'g'-trap class again, sprung from OUTSIDE the file this time, where the
   tool-key pin can't see. The menu (W) is the durable fix: every wall, by
   name, arrows + ENTER — no letter can ever be stolen from it. */
const WALL_NAMES_SRC=['THE CHIMNEY','THE COOPERAGE','THE RIBS','THE SHELF',
 'THE GALLERIES','TWO CATS','THE CLUTCH','THE QUARRY FIELD','THE TELL',
 'THE HEAVY STAR','THE PACHINKO DECK','THE VAULT','THE APPROACH','THE DESCENT',
 'THE BUMPERS','THE GRANITE','THE GREENWOOD','THE COOLING HOUSE','THE ANVIL',
 'THE ZING','THE CRUCIBLE','THE MURMURATION','THE STARFALL','THE LODGE',
 'THE COLONY','THE PLAYSET','THE LOOM','THE TOLLHOUSE','THE CEILING',
 'THE UNSEEN','THE GRIN','BLOCKHEAD','SQUARE ONE',"THE MASON'S YARD",'THE WARLORD'];
const WALL_NAMES=WALL_ORDER.map(i=>WALL_NAMES_SRC[i]);
/* wall 10 — THE HEAVY STAR: an ultra dense sphere hangs near top middle
   and WARPS every ball path — constant pull toward it, applied before the
   speed renormalise, so gravity bends trajectories without ever changing
   pace. The core itself is a solid mirror: dead-centre shots ricochet off
   it. Side towers are easy prey for curved shots; the treasure row sits
   directly BENEATH the star, where straight shots can't live. */
const GRAV_LVL=OLD_TO_NEW[9];
const STAR_X=W/2, STAR_Y=116, STAR_R=15, STAR_G=3400;
/* THE BLACK HOLE MOVES (Scott, 2026-08-17 — he asked for it in the builder).
   starX/starY were baked into ten call sites, so the well could only ever
   sit dead centre at y116. They are the DEFAULT now; a '*' in the map puts one
   wherever you like. Same for teeters, which were two hard-coded pivots that
   existed only on the egg wall — the physics loop never cared where they were,
   loadLevel just never offered a choice. */
let starX=STAR_X, starY=STAR_Y;
/* wall 9 — THE TELL: bricks are STACKED up to 3 deep (digits = depth).
   The ball only ever touches the base layer; kill it and the layer above
   CRASHES DOWN to base level (tier 1, then 2, then 3 — the mound gets
   harder as it settles). Two steel pillars split the mounds. */
const STACK_LVL=OLD_TO_NEW[8];
/* wall 5 — THE GALLERIES: the spectacle wall. Powerup drops are nearly
   doubled and up to 4 pills may fall at once — the rain IS the show. */
const SHELF_LVL=OLD_TO_NEW[3];                             // wall 4 — gets the gutter-sealing plate
const GALL_LVL=OLD_TO_NEW[4], GALL_PUP=0.30, GALL_CAP=4;
/* Wall 13 — THE APPROACH (Scott 2026-08-13): rendered in PERSPECTIVE, the
   field narrowing toward the top like an aerial shooter's runway. Physics
   stay in plain board space; only the drawing leans — every element is
   squeezed toward the centreline by its own depth. */
const PERSP_LVL=OLD_TO_NEW[12], PERSP_TOP=0.55;            // horizontal scale up at the far wall
/* wall 7 — THE CLUTCH: every brick is a wide oval EGG. Eggs GESTATE
   (wobble, sprout wing nubs), and a fully-gestated egg flies up to the
   belt, rides it into the PORTAL, and is re-laid at a random empty spot —
   stall and the clutch rearranges itself. Two TEETER-TOTTER branches
   below the eggs cycle balls back up through real angled ricochets.
   The two steel '#' are STONES someone slipped into the clutch. */
const EGG_LVL=OLD_TO_NEW[6];
const BELT_Y=62, TEET_L=52, TEET_MAX=0.5;
/* wall 8 — THE QUARRY FIELD: randomized every visit. Top 2 brick rows stay
   empty; the space below divides into SIX square areas (3 across, 2 down).
   Odds of a brick peak at each area's heart and fall off to 45% at its
   edge — six dense hearts with ragged rims, never the same twice. */
const RAND_LVL=OLD_TO_NEW[7];
const RAND_R0=2, RAND_ROWS=10, RAND_CB=[0,4,9,13];   // area col boundaries
/* wall 14 — THE DESCENT (Scott's "sinking wall", 2026-08-08): the wall
   drifts down as ONE piece — a shared offset, so every brick stays welded
   to its neighbours and the seam guard below still holds — and LURCHES a
   random distance at random intervals on top of the drift. Masonry that
   crosses SINK_FLOOR has landed: ONE life per landing event however many
   bricks touch down together (a whole row arriving must not cost thirteen),
   the landed bricks shatter, and the wall recoils back up. Steel lands
   without charge — it isn't yours to lose.
   The 'G' bricks pair Scott's gestation idea with this one, his own note:
   "a brick that finishes gestating hatches into something." They hatch
   LOOSE and fall on their own, well ahead of the wall. */
const SINK_LVL=OLD_TO_NEW[13];
const SINK_FLOOR=PY-30, SINK_BASE=0.055, SINK_RECOIL=40;
const LURCH_MIN=300, LURCH_VAR=400, LURCH_D=8, LURCH_DV=10;
const HATCH_V=1.15;
/* wall 15 — THE BUMPERS (Scott's "bumper bricks"): a brick kind that bumps
   the ball hard instead of breaking or being harmless. The ball leaves
   RADIALLY — away from the bumper's heart, never along the face it came in
   on — carrying a boost that decays over KICK_T frames, so a bumper cluster
   throws real pinball chaos without permanently changing the pace. */
const BUMP_LVL=OLD_TO_NEW[14];
const KICK_T=26, KICK_MULT=1.5, KICK_RADIAL=0.62;
/* the boost is a reward for chaos up at the wall, not a punishment on the way
   down: a kick that leaves steeper than KICK_DOWN below horizontal keeps the
   honest pace. SLING_A is the slingshot's fixed exit, radians off straight up. */
const KICK_DOWN=0.35, SLING_A=0.62;
/* anti-orbit: paddle returns since a brick was last touched, and how far
   the return angle may wander once a rally is clearly going nowhere */
const DRY_GRACE=6, DRY_STEP=0.035, DRY_MAX=0.30;
/* wall 16 — THE GRANITE. GRAN_HP sits at the bottom of Scott's 6-10 range on
   purpose: the HEAD of a column is the only brick you should ever have to pay
   full price for, because MOLT_LIFE/DRIP_EVERY drips at DRIP_BITE hits each
   comfortably melt the brick below it and start the chain over. */
const GRAN_LVL=OLD_TO_NEW[15];
const GRAN_HP=6, MOLT_LIFE=260, DRIP_EVERY=52, DRIP_BITE=2;
const DRIP_V=1.5, DRIP_VMAX=4.2;
const HOT_T=90, HOT_BITE=3;                    // a ball that fell through lava
/* wall 17 — THE GREENWOOD. GRN_COOL is the whole design: a brick you chipped
   and abandoned starts coming back after fifteen seconds and is whole again
   forty-five seconds later. Finish what you start and you never see it.
   It was 300 (five seconds) first, and that made the wall a TREADMILL rather
   than a lesson: a bot playing for sixteen straight minutes could not close
   out a single green brick, because regrow beat any rally that was not aimed.
   At 900 the wall costs about as much as walls 9, 11, 12 and 15 do — mid-pack,
   not an outlier — and the punishment still lands where it should, on the
   scattered leftovers at the tail. */
const GRN_LVL=OLD_TO_NEW[16];
const GRN_MAX=3, GRN_COOL=900;
/* wall 18 — THE COOLING HOUSE. Below TEMP_COLD brittle stone shatters whole;
   above TEMP_HOT the ball skids off it without a mark; between, it chips like
   anything else. TEMP_HEAT is what a broken brick puts back, so the wall is a
   loop rather than a one-way trip to the pool. */
const TEMP_LVL=OLD_TO_NEW[17];
const TEMP_START=0.6, TEMP_COLD=0.35, TEMP_HOT=0.65;
const TEMP_COOL=0.04, TEMP_HEAT=0.10;
const TEMP_SLOW=0.78, TEMP_FAST=1.22;
const POOL_X0=LEFT+4*(BW+GAP), POOL_X1=LEFT+9*(BW+GAP)-GAP;
const POOL_Y0=TOP+11*(BH+GAP), POOL_Y1=POOL_Y0+46;
/* wall 19 — THE ANVIL. Driven stone is the only brick in the game whose
   breakability depends on an INPUT rather than on the board: one spiked hit
   kills it, an ordinary ball rings off it for ever. Bombs, kegs, bolides and
   the death ray still take it, deliberately — a player who cannot find the
   timing must never be sealed out of the wall entirely. */
const DRIV_LVL=OLD_TO_NEW[18];
/* THE THUMP CARD (Scott, 2026-08-21). Driven stone is the one brick in the
   game that answers to an INPUT instead of to position, and a player who has
   spent eighteen walls learning to AIM has no reason on earth to guess that.
   So the wall says it out loud, once, for a second and a half, on an iron
   plate cut from the same stock as the stone it is about. Keyed to the
   FEATURE and not to the level number, so a custom wall carrying driven
   stone gets told too. It never takes the frame — play runs on underneath. */
const THUMP_T=90, THUMP_IN=10, THUMP_OUT=22;
/* ...and once four walls had a rule of their own the card became a TABLE. A
   wall that adds a rule names it; every other wall says nothing, because a
   card on a wall you already understand is just noise. */
const CARDS={driv:'You Gotta THUMP It', loom:'Cut the Pins LAST',
             toll:'Some Of It You BUY', ceil:"There's a Gutter UP There",
             unseen:'The Wall Is Still There'};
/* Per-WALL cards, for a wall whose lesson is about ITS OWN shape rather than
   a feature it shares. Keyed on wall index; a feature card would be wrong here
   because 'mix' now rides six walls and the warning belongs to exactly one.
   Wall 1 (Scott, 2026-08-24): the ball really does leak through the segmented
   floor's seams, and being told once beats discovering it as a betrayal. */
const WALL_CARDS=reindex({0:'Mind The Gaps In The Steel'});
/* THE UNSEEN — every brick starts at vis 0 and draws NOTHING. A strike pings
   a brief outline (the sonar's voice); a BREAK gives every brick within 2
   cells +1% visible, permanently. The literal 1% is Scott's spec: the wall
   never becomes clear, it becomes a rumour you slowly learn to trust. */
const UNSEEN_PING=14, UNSEEN_STEP=0.01, UNSEEN_R=2;
let thumpT=0, thumpMsg='';
/* ---------------- THE LOOM ----------------
   wall 27. Every course is HUNG on a line strung between two iron ANCHOR
   PINS, and the line answers to what you do to the stone on it:
     - chip a course and it DROOPS. A catenary evaluated closed-form off the
       column, never integrated, so it cannot drift or blow up. Both pins
       standing caps the droop at a hint; one pin gone lets it hang properly.
     - cut BOTH pins and the course goes SLACK and TRAVELS. It comes to rest
       on whatever course is still standing beneath it — the wall COMPACTS
       downward as you cut it — and with nothing left below it reaches the
       floor line, shatters, and costs a life.
   Which is the whole lesson in one sentence: CLEAR THE COURSE, THEN THE PINS.
   A course whose stone is already gone has nothing left to fall, so the
   penalty is entirely avoidable and entirely your own doing.
   It rides b.my, which the murmuration and the Lodge's shift already proved
   safe for the seam guard — LOOM_FALL is under half of what those move. */
/* ---------------- THE TOLLHOUSE ----------------
   wall 28, and the first wall in the game about MONEY rather than physics.
   Every brick you break drops a COIN worth its tier; the slab catches them
   the way it catches pills. LOCKED STONE wears a price on its face — hit it
   while you hold the price and it OPENS, taking the coins and paying a
   bounty; hit it broke and it chips like six-deep masonry.
   The eight-deep fallback is the entire safety argument. A toll is a
   DISCOUNT, never a gate, so no run of dropped coins can seal the wall and
   there is no arrangement of misses that makes it unfinishable. It also
   means the lock is a CHOICE — spend the coins here or save them for the
   dearer course behind — which is the only reason an economy is worth
   having in a game about hitting a ball. */
const TOLL_LVL=OLD_TO_NEW[27];
const TOLL_HP=6;                      // what a toll costs in WORK, if you will not pay
const TOLL_PRICE={x:1, y:2};          // ...and what it costs in COIN
const COIN_FALL=1.9, COIN_R=6;
let purse=0, coins=[];
/* ---------------- THE CEILING ----------------
   wall 29. There is a second gutter and it is above you, guarded by a slab
   that MIRRORS the one in your hands: you go left, it goes right. One
   control, both ends. It sounds unfair and is not — the ball is only ever
   at one end at a time, so the wall is really asking you to think in the
   mirror and alternate, and the position that saves you below is the same
   position that saves you above.
   The flanks of the layout are left open on purpose: the roof has to be
   live from the first serve, or it is a surprise saved for the endgame
   rather than a rule. */
const CEIL_LVL=OLD_TO_NEW[28];
const CEIL_Y=TOP+8;                   // the upper slab's line
const CEIL_KILL=TOP-10;               // past this, it is gone — same as the floor
/* The slab gets a faster rail here, and it HAS to. The mirror asks it to cross
   the board in the time the ball takes to fall: 640px at PSPD is 94 frames
   against a descent of about 57. Measured, not guessed — at plain PSPD a
   predictive bot lost all ten lives in 4 runs out of 4 and never cleared it,
   and widening the roof beam barely helped (2/4 even at THREE times the slab).
   So the beam stays exactly the width of your slab, which keeps the mirror
   rule pure, and the RAIL is what changes. At 1.55x the same bot clears 6 of 6
   for about a life and a half — hard, never a wipeout, which is what the wall
   before the Warlord ought to be. */
const CEIL_SPD=1.55;
const ceilX=()=>W-pad.x;              // the mirror, and the whole mechanic
const LOOM_LVL=OLD_TO_NEW[26];
const SAG_HELD=9;         // droop allowed while both pins hold: a warning, not a threat
const SAG_ONE=19;         // ...with one pin gone
const SAG_MAX=32;         // ...with the line cut, before it starts to travel
const LOOM_EASE=0.055;    // how fast the droop follows the damage
const LOOM_FALL=1.6;      // px/frame a slack course descends
const LOOM_FLOOR=PY-46;   // the line a fallen course cannot cross
let loomRows=null;        // per row: {orig, droop, fall}
const loomShape=c=>Math.sin(Math.PI*(c+0.5)/COLS);
/* ---------------- ZING ----------------
   Scott, 2026-08-17: "a ball somehow gets a wicked spin to it which affects
   its bounces, maybe by hitting a rapidly rotating oval brick."
   The ROTOR is that brick: an oval spinning fast enough to read as dangerous
   before you touch it. Contact leaves the ball ZINGED, and spin does two
   separate things, which is what makes it worth having rather than a reskinned
   bumper:
     - it CURVES the ball in flight. A real Magnus drift perpendicular to
       travel, so a zinged ball does not go where you aimed it and you have to
       lead it like a thrown thing.
     - it SKEWS every bounce afterwards. The outgoing angle is rotated by the
       spin still on the ball, so a zinged ricochet off steel is not the
       ricochet you have spent nineteen walls learning.
   It DECAYS. A zinged ball is a state you have to spend before it runs out,
   not a permanent upgrade — the same reason the paddle bump has a cooldown.
   Which way the rotor is turning decides the sign, so a rotor is readable:
   watch it, and you know which way your ball is about to bend. */
const ZING_MAX=0.85;        // hardest spin a ball can carry
const ZING_DECAY=0.988;     // ~4s to fade from full
const ZING_CURVE=0.085;     // sideways drift per frame at full spin
const ZING_BITE=0.30;       // radians a full-spin bounce is skewed by
const ZING_GIVE=0.62;       // spin handed over per rotor touch
const ROTOR_SPD=0.34;       // radians/frame — fast enough to blur
/* ---------------- THE MURMURATION ----------------
   Scott, 2026-08-18: "a granular bird-murmuration-ish stonebreaker screen —
   in the granular format, mathematically moving bricks."
   The flock is ~100-150 fine bricks generated as a starling cloud (dense
   core, ragged rim, a trailing arm — never the same flock twice), and the
   motion is ONE closed-form field, nothing random and nothing integrated
   per frame, so it can never drift, jitter or blow up: the cloud's centre
   WANDERS (two incommensurate sines per axis), the whole formation WHEELS
   about its centroid, BREATHES (x and y scales swing out of phase, so it
   smears wide and then balloons), and a slow vertical ripple travels along
   it. Every brick keeps its grid neighbours through all of it — the
   transform is shared — so the seam guard stays honest and the flock reads
   as one animal, which is the entire point of a murmuration.
   Amplitudes are derived AT LOAD from the flock's measured extents: the
   worst-case wheel+breathe+ripple pose is boxed first, and whatever room is
   left over is what the wander gets — so the flock can never leave the
   board or come below MURM_FLOOR into the player's air. A small flock
   therefore ranges FARTHER than a big one, which is true of the real thing. */
const MURM_LVL=OLD_TO_NEW[21];
const MURM_FLOOR=308;                 // the sky's floor — the slab's air starts here
/* 0.16 rad, not more: the wheel couples WIDTH into HEIGHT (a wide flock's
   wingtips swing vertically as it banks), and past ~0.16 a full-width flock's
   worst-case bank no longer fits between the HUD and MURM_FLOOR */
const MURM_ROT=0.16;                  // wheel amplitude, radians
const MURM_SQ=0.26;                   // breathe amplitude — real flocks STRETCH
const MURM_RIP=6, MURM_RIPK=0.016;    // ripple: px amplitude, spatial frequency
const MURM_RIPW=0.055;                // ...and how fast it travels
/* v2 (Scott: "more like real world bird murmuration dynamics and speed,
   including the way they overlap, compress and expand"): a COMPRESSION WAVE
   travels the flock's long axis — a fixed-amplitude displacement field, so
   neighbouring birds converge and genuinely OVERLAP at the wave's crest and
   pull apart in its trough. That is the density wave a real murmuration reads
   by. Plus a per-bird wingbeat BOB on a private phase, which breaks the last
   of the lattice look. All still closed-form off t — no dice per frame. */
const MURM_CA=12, MURM_CK=0.024, MURM_CW=0.05;
const MURM_BOB=2.5;
/* six frequencies with no small common multiple — the combined pose takes the
   best part of an hour to come anywhere near repeating. v2 runs ~2.6x the
   first cut's pace: worst-case simultaneous drift is ~3.9px/frame, still far
   under the 8px a brick-height of tunnelling would need. */
const MURM_W=[0.0122,0.0081,0.0060,0.0096,0.0138,0.0153];
/* every bird wears ONE of these for life — [full, chipped, tired] shades of
   the same hue, so damage still reads as fading without losing the bird's
   colour. v3 (Scott: "stand out better from the background... each one gets
   a randomly assigned 2 color design"): shades lifted well clear of the
   #10-14 night sky, and every bird ALSO draws a random ACCENT for its wings
   and head — body x accent = 30 different birds from two small lists. */
const BIRD_PALS=[
  ['#4a5878','#5d6c90','#7381a6'],   // slate
  ['#5e4478','#755a90','#8c72a8'],   // plum
  ['#2e6a62','#3f8478','#579c8f'],   // teal
  ['#7a4a34','#94604a','#ad7a60'],   // rust
  ['#464090','#5a54ac','#7069c4'],   // indigo
  ['#71643a','#8a7c4e','#a49668']    // olive-gold
];
const BIRD_ACC=['#ffd23f','#7fe7ff','#ff9ecf','#9fffb0','#ffb07a'];
let murm=null;                        // {t,ax,ay,cy} while a flock is flying
let roost=null;                       // where hit birds GO — nobody dies here
/* ---------------- THE STARFALL ----------------
   The storm breathes in three phases so it is ALWAYS readable: CALM (play
   normal breakout), WARN (the sky burns along the top — the anticipation
   cue), STORM (rocks fall). A meteor smashes masonry outright, shatters on
   steel, scorches the slab short for a while (BURN_T, the Warlord's own
   penalty — a mishap costs a moment, not a life), and pays METEOR_PTS to a
   ball that meets it mid-air. */
const STORM_CALM=540, STORM_WARN=100, STORM_LEN=300, STORM_EVERY=14;
const METEOR_R=9, METEOR_PTS=60;
let meteors=[], stormT=0;             // stormT counts through calm->warn->storm
const stormPhase=()=>{
  const t=stormT%(STORM_CALM+STORM_WARN+STORM_LEN);
  return t<STORM_CALM? 'calm' : t<STORM_CALM+STORM_WARN? 'warn' : 'storm';
};
//LEVELS-END

let bricks=[], balls=[], pups=[], bolts=[], parts=[], bores=[], rays=[];
let zLatch=false, yLatch=false, hLatch=false, helpUI=false;
let wallUI=false, wallSel=0, wLatch=false, wmLatch={};
let teeters=[], travelers=[], portalT=0;       // wall 7: pivots + eggs in transit
let drips=[];                                  // wall 16: lava on its way down
let sinkY=0, sinkT=0, sinkers=[], landT=0;     // wall 14: the descent + what hatched loose
let dryRally=0;                                // paddle returns since a brick was touched
let bombArmed=false;                           // Da Bomb: next brick contact detonates
let pad={x:W/2, w:PW0};
let boss=null, bossSlots=[], embers=[], bossIntro=false, padBurnT=0;
/* THE OTHER FACE (Scott, 2026-08-19). When the FINAL wall falls, before the
   win screen: another of Grishnak's faces rises from the rubble in silence —
   the plastic-toy god from Scott's generated ladder — looks at you, loses its
   color, turns to stone, and shatters. No words. It confuses, enlightens, or
   hints, depending on how much the player has pieced together. The images
   preload when the boss wall loads; if they never arrive the sequence plays
   with a drawn silhouette instead — the WIN never waits on art. */
const FACE_T=430;
const FACE_SRC=['face-1.png','face-2.png','face-3.png','face-4.png','face-5.png'];
let faceImgs=null, faceT=0;
function faceLoad(){
  if(faceImgs || typeof Image==='undefined') return;
  try{
    faceImgs=FACE_SRC.map(s=>{
      const im=new Image(); im._ok=false;
      im.onload=()=>{ im._ok=true; };
      im.src='images/'+s; return im;
    });
  }catch(e){ faceImgs=null; }
}
/* THE LORE BETWEEN WALLS (Scott, 2026-08-20: "walls often end too fast when
   a death ray clears everything... lore clues could be cool - a series of
   somewhat-better-than-8-bit images, one after each wall taken down").
   Every cleared wall now holds a beat: fade to dark, one fragment of the
   stone's story, fade on. SPACE skips it — the impatient lose nothing but
   the reading. IMAGE SLOTS: drop art at images/lore/lore-<n>.png (n = the
   wall just cleared, 1-based) and it appears above its fragment
   automatically; until then the fragment stands alone. The FINAL wall keeps
   its own rite — THE OTHER FACE — untouched. */
const LORE_T=175;
let loreT=0, loreWall=0, loreSkipLatch=true;
/* Rewritten 2026-08-20 — Scott: "the sentences between stonebreaker walls are
   way too obscure and unnatural."

   He was right, and the fault was mechanical: nearly all 26 were the same
   shape, a flat clause followed by an inverted twist. "The masons never signed
   their work. The wall signed them." "The stone does not lose. It archives."
   One of those is a good line. Twenty-six in a row is a machine doing a trick,
   and you feel the trick long before you finish the game.

   These are concrete and mostly ordinary: a quarry opening, a foreman writing
   things down, chisels wearing out, a priest going home early. The eerie ones
   land harder for sitting among chores. Sentence shapes vary on purpose —
   ledger entries, complaints, plain reports — instead of one cadence repeated.

   They also now agree with the valley: the coins, the warm stone, the shovels
   taken away and the mason who knew what the walls were for are the SAME facts
   the Surrendered mention in the camp, so the two mysteries are one story.

   ORDER MATTERS. Fragment n plays after wall n is cleared, so 26 lands on THE
   PLAYSET — which is why the toy line is last. Keep them under ~72 characters:
   drawLore prints one centred line with no wrap. */
const LORE=[
  'The quarry opened in the spring. Good stone, and plenty of it.',
  "Foreman's note: the men say the stone hums. I told them to work.",
  'It only hums in the deep seam. Not every block. About one in ten.',
  'Cutting it thin makes it louder. So we cut it thick.',
  'A mason lost his hearing down there. He says it was worth it.',
  'The chisels wore out twice as fast. The stone never marked.',
  'They built the outer wall from it. It was the stone we had.',
  'Ledger, year two: forty courses laid. Thirty-eight paid for.',
  'Two courses nobody laid. The foreman wrote it down and said nothing.',
  'The wall is warm on the north side. The north side gets no sun.',
  'Birds will not land on it. They land on everything else.',
  'A child put her ear to it and would not say what she heard.',
  'They buried the loudest block under the gate. It got louder.',
  'The priest came out, looked at the wall, and went home early.',
  'Nobody works the deep seam now. The quarry pays better than ever.',
  'A guard fell asleep at his post. They found him standing up.',
  'Someone carved his name in it. By morning the name was gone.',
  'The town voted to pull the wall down. The vote was never counted.',
  'Chronicle: we came to tear it out. We laid four more courses.',
  'The Warlord did not build this place. He moved into it.',
  'He paid his men in old coins. Nobody knew the faces on them.',
  'He never slept inside the walls. He said they breathed at night.',
  'He kept diggers in the yard for years. He wanted the floor.',
  'They struck something warm down there. He took their shovels away.',
  'The rubble was carted off. Within a month the wall was back.',
  'Chronicle: it wears a face for every age. This one got a toy.',
  'The top courses were hung, not laid. They still move in a wind.',
  'A tollhouse stood at the gap. Someone kept collecting long after.',
  'They roofed the yard to keep the weather out. It kept other things in.',
  'The survey missed one wall. The surveyor walked into it twice.',
  'They found teeth in the deep seam. Iron ones. Nobody claimed them.',
  "Someone cut a course of square block. The foreman's face, the men said.",
  'A wall came down wrong. They chalked a 1 on the seam and started over.',
  'Every cut in one yard. The apprentice sorted them by feel, in the dark.'
];const loreImgs={};
/* JPG first, PNG second. These became full-bleed paintings in splash style
   (Scott, 2026-08-20) and a 1280x864 painting is ~200KB as JPG and several MB
   as PNG — but flat/graphic plates are still better served by PNG, so try one
   and quietly fall back to the other rather than making him care. */
function loreLoad(n){
  if(loreImgs[n]!==undefined || typeof Image==='undefined') return;
  loreImgs[n]=null;
  const tryExt=(exts)=>{
    if(!exts.length) return;                       // no art for this wall: the words stand
    try{
      const im=new Image();
      im.onload=()=>{ loreImgs[n]=im; };
      im.onerror=()=>tryExt(exts.slice(1));
      im.src='images/lore/lore-'+n+'.'+exts[0];
    }catch(e){}
  };
  tryExt(['jpg','png']);
}
let lives=10, level=0, score=0, broken=0;
let tw=0, ts=0, tl=0, tb=0, laserT=0;          // powerup timers (tb = bolide)
let shots=0;                                   // pocket shots left this life
let ended='';                                  // '', 'win', 'lose'
let spaceLatch=true, eLatch=true, upLatch=true, shake=0, numLatch=[];
let bumpT=0, bumpCD=0;                         // the slab's lunge, and its charge
let spiked=0;                                  // is a drive live? the iron glints if so
let savedPos=null;

function freshGest(){ return 900+Math.random()*2100; }   // 15-50s to maturity
/* normalized distance from a cell to its area's heart (0 centre, 1 edge) */
function areaDist(r,c){
  const ar=Math.floor(r/(RAND_ROWS/2));
  let ac=0; while(c>=RAND_CB[ac+1]) ac++;
  const r0=ar*(RAND_ROWS/2), rh=RAND_ROWS/2;
  const c0=RAND_CB[ac], cw=RAND_CB[ac+1]-c0;
  const dy=Math.abs(r-(r0+rh/2-0.5))/(rh/2-0.5);   // outermost CELL = 1
  const dx=Math.abs(c-(c0+cw/2-0.5))/(cw/2-0.5);
  return Math.min(1, Math.max(dx,dy));
}
function genRandomWall(){
  do {
    bricks=[];
    for(let r=0;r<RAND_ROWS;r++) for(let c=0;c<COLS;c++){
      const d=areaDist(r,c);
      const p=0.45+(0.95-0.45)*(1-d);
      if(Math.random()>p) continue;
      const tier= d<0.34? 3 : d<0.67? 2 : 1;     // hearts are hardest
      bricks.push({c, r:r+RAND_R0, hp:tier, max:tier, tun:false, gest:0});
    }
    /* a steel boulder may sit at an area's heart; guarantee at least one */
    let steel=0;
    for(let ar=0;ar<2;ar++) for(let ac=0;ac<3;ac++){
      if(Math.random()>=0.35) continue;
      const hr=RAND_R0+ar*(RAND_ROWS/2)+Math.floor(RAND_ROWS/4);
      const hc=Math.floor((RAND_CB[ac]+RAND_CB[ac+1])/2);
      const old=bricks.find(b=>b.r===hr&&b.c===hc);
      if(old) bricks.splice(bricks.indexOf(old),1);
      bricks.push({c:hc, r:hr, hp:Infinity, max:0, tun:false, gest:0}); steel++;
    }
    if(!steel){
      const hr=RAND_R0+Math.floor(RAND_ROWS/4), hc=Math.floor((RAND_CB[1]+RAND_CB[2])/2);
      const old=bricks.find(b=>b.r===hr&&b.c===hc);
      if(old) bricks.splice(bricks.indexOf(old),1);
      bricks.push({c:hc, r:hr, hp:Infinity, max:0, tun:false, gest:0});
    }
  } while(!breakable());
}
/* ---- wall 22: THE MURMURATION — the flock, and the field that flies it ---- */
function genMurmurWall(){
  let ew=0, eh=0;
  do {
    bricks=[];
    const bc=10+Math.random()*6, br=5.8+Math.random()*1.4;    // body heart (cols, rows)
    const ba=5.5+Math.random()*1.5, bb=3.2+Math.random()*0.8; // body semi-axes
    const arm=Math.random()<0.5? -1:1;                        // which wing trails
    for(let r=2;r<=11;r++) for(let c=0;c<COLS;c++){
      const dx=(c-bc)/ba, dy=(r-br)/bb;
      let d=Math.sqrt(dx*dx+dy*dy);                           // 0 heart, 1 rim
      const ax2=(c-(bc+arm*ba*1.15))/(ba*0.6), ay2=(r-(br+1.1))/(bb*0.55);
      d=Math.min(d, Math.sqrt(ax2*ax2+ay2*ay2)*1.15);         // the trailing arm
      if(d>1) continue;
      if(Math.random()>0.62+0.38*(1-d)) continue;             // ragged rim, dense heart
      const tier= d<0.35? 3 : d<0.7? 2 : 1;                   // hearts are hardest
      /* sc/sr: each bird sits OFF the lattice by a fixed personal offset —
         a real flock has no rows. ph: a private phase for wingbeat and bob. */
      bricks.push({c, r, hp:tier, max:tier, tun:false, gest:0, bird:true,
                   sc:Math.random()*12-6, sr:Math.random()*8-4,
                   ph:(Math.random()*628)|0, dir:Math.random()<0.5?-1:1,
                   pal:(Math.random()*BIRD_PALS.length)|0,
                   acc:(Math.random()*BIRD_ACC.length)|0});
    }
    if(bricks.length<80 || !breakable()){ ew=1e9; continue; }
    /* centroid and extents measured off the REAL flock; the amplitudes below
       are derived from them, so the worst-case pose still fits the sky. A
       draw whose wingtip reaches past 230px of half-span is thrown back —
       a flock that fills the board has no room left to fly. */
    let cx0=0, cy0=0;
    for(const b of bricks){ cx0+=LEFT+b.c*(BW+GAP)+BW/2; cy0+=TOP+b.r*(BH+GAP)+BH/2; }
    cx0/=bricks.length; cy0/=bricks.length;
    ew=0; eh=0;
    for(const b of bricks){
      b.hx=LEFT+b.c*(BW+GAP)+BW/2-cx0+b.sc;
      b.hy=TOP+b.r*(BH+GAP)+BH/2-cy0+b.sr;
      ew=Math.max(ew, Math.abs(b.hx)+BW/2);
      eh=Math.max(eh, Math.abs(b.hy)+BH/2);
    }
  } while(ew>230);
  const cth=Math.cos(MURM_ROT), sth=Math.sin(MURM_ROT), gr=1+MURM_SQ;
  let hw=(ew*cth+eh*sth)*gr+MURM_CA+2;
  /* belt and braces: if a legal draw still poses wider than 288px of half-span,
     the FORMATION packs tighter instead of trusting the wander to luck. This is
     what makes "it never leaves the board" a theorem rather than an
     observation. (Packed birds may overlap — since v2 they are SUPPOSED to.) */
  const k=Math.min(1, 288/hw);
  if(k<1){
    for(const b of bricks){ b.hx*=k; b.hy*=k; }
    ew*=k; eh*=k; hw=(ew*cth+eh*sth)*gr+MURM_CA+2;
  }
  const hh=(ew*sth+eh*cth)*gr+MURM_RIP+MURM_BOB+2;
  const yLo=TOP+10+hh, yHi=MURM_FLOOR-hh;
  murm={ t:(Math.random()*9000)|0,                 // a fresh flock joins mid-flight
         ax:Math.max(0, W/2-8-hw),
         cy:(yLo+yHi)/2, ay:Math.max(0,(yHi-yLo)/2) };
  /* THE ROOST — Scott: "I don't want to kill birds." Every bird knocked out
     of the sky flies down to sit the wall out: two sagging telephone wires
     strung between poles on the right, and a tree in the bottom-left corner
     for the overflow. The filling roost IS the progress bar. */
  roost={fly:[], wire:[], tree:[], wireSlots:[], treeSlots:[]};
  for(const wy of [344,358]){
    for(let x=410; x<=624; x+=8){
      const u=(x-402)/(632-402);
      roost.wireSlots.push({x, y:wy+9*4*u*(1-u), taken:false, tree:false});
    }
  }
  for(let i=0;i<60;i++){
    const a=Math.random()*6.283, rr2=Math.sqrt(Math.random());
    roost.treeSlots.push({x:44+Math.cos(a)*rr2*26, y:346+Math.sin(a)*rr2*20,
                          taken:false, tree:true});
  }
  murmurTick();                                    // pose the flock before first draw
}
/* one pose per frame, every brick from the same field. mx/my land in bx()/by(),
   so collision, bolts, blasts and the draw all see the moved flock for free —
   the same trick the descent's sinkY bought, per-brick this time. */
function murmurTick(){
  if(!murm) return;
  const t=++murm.t, w=MURM_W;
  const cx=W/2   + murm.ax*(0.62*Math.sin(t*w[0])     + 0.38*Math.sin(t*w[1]+1.7));
  const cy=murm.cy+murm.ay*(0.62*Math.sin(t*w[2]+0.9) + 0.38*Math.sin(t*w[3]+2.6));
  const th=MURM_ROT*Math.sin(t*w[4]);
  const gx=1+MURM_SQ*Math.sin(t*w[5]+0.4);
  const gy=1+MURM_SQ*Math.sin(t*w[5]*1.31+2.2);
  const cth=Math.cos(th), sth=Math.sin(th);
  for(const b of bricks){
    const hx=b.hx*gx, hy=b.hy*gy;
    const ox=b.mx||0;
    b.mx=cx + hx*cth - hy*sth - (LEFT+b.c*(BW+GAP)+BW/2)
        + MURM_CA*Math.sin(b.hx*MURM_CK - t*MURM_CW);      // the density wave
    b.my=cy + hx*sth + hy*cth - (TOP+b.r*(BH+GAP)+BH/2)
        + MURM_RIP*Math.sin(b.hx*MURM_RIPK + t*MURM_RIPW)
        + MURM_BOB*Math.sin(t*0.09 + b.ph);                // the private wingbeat
    /* which way is this bird going? hysteresis so the sprite never flickers */
    const dx=b.mx-ox;
    if(dx>0.12) b.dir=1; else if(dx<-0.12) b.dir=-1;
  }
}
/* a bird knocked out of the sky is NOT broken — it flies down to the roost.
   Called at every place a bird would otherwise be spliced away. */
function birdOff(b){
  if(!roost) return;
  const wFree=roost.wireSlots.filter(s=>!s.taken);
  const tFree=roost.treeSlots.filter(s=>!s.taken);
  let s;
  if(wFree.length && (!tFree.length || Math.random()<0.62))
    s=wFree[(Math.random()*wFree.length)|0];
  else if(tFree.length) s=tFree[(Math.random()*tFree.length)|0];
  if(s) s.taken=true;
  const tx= s? s.x : 44+Math.random()*40-20, ty= s? s.y : 346+Math.random()*24-12;
  const x=bx(b)+BW/2, y=by(b)+BH/2;
  roost.fly.push({x0:x, y0:y, x, y, tx, ty, tree: s? s.tree : true,
                  t:0, T:Math.round(26+Math.hypot(tx-x,ty-y)/7),
                  dir: tx>x? 1:-1, ph:b.ph||0, pal:b.pal||0, acc:b.acc||0});
  sfx.task&&sfx.task();
}
function roostTick(){
  if(!roost) return;
  for(let i=roost.fly.length-1;i>=0;i--){
    const f=roost.fly[i];
    if(++f.t>=f.T){
      roost.fly.splice(i,1);
      (f.tree? roost.tree : roost.wire).push(
        {x:f.tx, y:f.ty, tree:f.tree, ph:f.ph, dir:f.dir, pal:f.pal, acc:f.acc,
         anim:0, at:20+Math.random()*60});
      continue;
    }
    /* a swoop, not a slide: quadratic through a point lifted above the chord */
    const u=f.t/f.T, v=1-u;
    const mx2=(f.x0+f.tx)/2, my2=Math.min(f.y0,f.ty)-34;
    f.x=v*v*f.x0 + 2*v*u*mx2 + u*u*f.tx;
    f.y=v*v*f.y0 + 2*v*u*my2 + u*u*f.ty;
    f.dir= (f.tx>f.x0)? 1:-1;
  }
  for(const p of [...roost.wire, ...roost.tree]){
    if(--p.at>0) continue;
    if(p.anim){ p.anim=0; p.at=30+Math.random()*140; continue; }  // settle again
    const roll=Math.random();                    // a little life, now and then
    p.anim= roll<0.30? 1 : roll<0.55? 2 : roll<0.80? 3 : 4;
    if(p.anim===3) p.dir=-p.dir;                 // the head-turn really turns
    p.at= p.anim===1? 10 : p.anim===4? 8 : 20;
  }
}
/* the bird itself: body, head into the wind, and a three-pose wingbeat.
   Vague on purpose — at murmuration distance a starling is a beat, not a
   portrait. Chipped birds fade a tier at a time (they are tiring, not dying). */
function drawBirdSprite(x, y, dir, pose, hp, s, pal, acc){
  const shades=BIRD_PALS[pal||0];
  const col= hp>=3? shades[0] : hp===2? shades[1] : shades[2];
  const ac=BIRD_ACC[acc||0];
  /* a whisper of dark under the body so the bird pops off ANY sky */
  ctx.fillStyle='rgba(4,6,10,.55)';
  ctx.beginPath(); ctx.ellipse(x, y+0.8*s, 5.2*s, 3.0*s, 0, 0, 7); ctx.fill();
  ctx.strokeStyle=ac; ctx.lineCap='round'; ctx.lineWidth=2.4*s;   // wings wear the accent
  const wy= pose===0? -5.5 : pose===1? -1 : 3.5;      // up / level / down
  ctx.beginPath();
  ctx.moveTo(x-6*s, y+wy*s); ctx.quadraticCurveTo(x-2*s, y+(pose===1?-2:wy*0.3)*s, x, y);
  ctx.quadraticCurveTo(x+2*s, y+(pose===1?-2:wy*0.3)*s, x+6*s, y+wy*s);
  ctx.stroke();
  ctx.fillStyle=col;
  ctx.beginPath(); ctx.ellipse(x, y, 4.2*s, 2.3*s, 0, 0, 7); ctx.fill();
  ctx.fillStyle=ac;                                   // ...and so does the head
  ctx.beginPath(); ctx.arc(x+dir*4.6*s, y-0.9*s, 1.7*s, 0, 7); ctx.fill();
}
function drawPerched(p){
  const hop= p.anim===1? -2 : 0;
  const y=p.y+hop;
  /* v3 (Scott: "make them not disappear quite as much when relocated...
     actually make them 50% bigger, I don't care if they overlap anywhere at
     any time"): perched birds run HALF AGAIN the original size, keep their
     full flock plumage AND accent head, and sit on a whisper of dark so
     they read against wire, canopy and sky alike. Crowding is the point —
     a loaded wire is the trophy shelf. */
  const P=1.5;
  const col=BIRD_PALS[p.pal||0][0], belly=BIRD_PALS[p.pal||0][2];
  const ac=BIRD_ACC[p.acc||0];
  ctx.fillStyle='rgba(4,6,10,.5)';
  ctx.beginPath(); ctx.ellipse(p.x, y-3*P, 5.6*P, 3.6*P, 0, 0, 7); ctx.fill();
  ctx.fillStyle=col;
  if(!p.tree){                                   // little legs onto the wire
    ctx.strokeStyle=col; ctx.lineWidth=1.3;
    ctx.beginPath(); ctx.moveTo(p.x-1.6,y-1); ctx.lineTo(p.x-1.6,p.y+1);
    ctx.moveTo(p.x+1.6,y-1); ctx.lineTo(p.x+1.6,p.y+1); ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(p.x, y-2.4*P, 3.4*P, 2.4*P, 0, 0, 7); ctx.fill();
  ctx.fillStyle=belly;
  ctx.beginPath(); ctx.ellipse(p.x, y-1.7*P, 2.1*P, 1.2*P, 0, 0, 7); ctx.fill();
  ctx.fillStyle=ac;                              // the accent head, kept for life
  ctx.beginPath(); ctx.arc(p.x+p.dir*2.9*P, y-4.2*P, 1.5*P, 0, 7); ctx.fill();
  const tb= p.anim===2? Math.sin(frame*0.5+p.ph)*2 : 0;     // the tail bob
  ctx.strokeStyle=col; ctx.lineWidth=1.9;
  ctx.beginPath(); ctx.moveTo(p.x-p.dir*3*P, y-2.4*P); ctx.lineTo(p.x-p.dir*5.6*P, y-3.6*P+tb); ctx.stroke();
  if(p.anim===4){                                // a wing-flick, half a heartbeat
    ctx.strokeStyle=ac;
    ctx.beginPath(); ctx.moveTo(p.x, y-3.2*P); ctx.lineTo(p.x-p.dir*2*P, y-6.6*P); ctx.stroke();
  }
}
function drawRoost(){
  if(!roost) return;
  /* the tree, bottom-left — moonlit so it POPS off the night: warmer trunk
     with a lit edge, brighter canopy, and a pale rim of light along each
     blob's upper-left where the moon catches it */
  const tg=ctx.createLinearGradient(40,0,49,0);
  tg.addColorStop(0,'#6a4a30'); tg.addColorStop(1,'#3a2c20');
  ctx.strokeStyle=tg; ctx.lineWidth=6; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(44, H-32); ctx.lineTo(44, 356); ctx.stroke();
  ctx.strokeStyle='#553d28'; ctx.lineWidth=2.8;
  ctx.beginPath(); ctx.moveTo(44,372); ctx.lineTo(30,356); ctx.moveTo(44,364); ctx.lineTo(58,350); ctx.stroke();
  for(const [ox,oy,rr2,col] of [[-13,5,17,'#2c4a2e'],[13,3,17,'#31532f'],[0,-8,19,'#3c6338']]){
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.arc(44+ox, 346+oy, rr2, 0, 7); ctx.fill();
    ctx.strokeStyle='rgba(180,220,170,.35)'; ctx.lineWidth=1.6;    // the moon rim
    ctx.beginPath(); ctx.arc(44+ox, 346+oy, rr2-1, Math.PI*0.85, Math.PI*1.55); ctx.stroke();
  }
  /* the poles and the two sagging wires — warm posts, glinting lines,
     insulator caps on the crossarms so the silhouette reads at a glance */
  for(const px2 of [402,632]){
    const pg=ctx.createLinearGradient(px2-2,0,px2+3,0);
    pg.addColorStop(0,'#6e5236'); pg.addColorStop(1,'#3a2e1e');
    ctx.strokeStyle=pg; ctx.lineWidth=5; ctx.lineCap='butt';
    ctx.beginPath(); ctx.moveTo(px2, H-30); ctx.lineTo(px2, 334); ctx.stroke();
    ctx.strokeStyle='#5a4630'; ctx.lineWidth=3.4;
    ctx.beginPath(); ctx.moveTo(px2-10, 340); ctx.lineTo(px2+10, 340); ctx.stroke();
    ctx.fillStyle='#9fb6cf';                     // the little glass insulators
    for(const ix of [px2-8, px2+8]){ ctx.beginPath(); ctx.arc(ix, 338, 1.8, 0, 7); ctx.fill(); }
  }
  for(const wy of [344,358]){
    ctx.strokeStyle='rgba(96,104,128,.95)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(402, wy);
    ctx.quadraticCurveTo((402+632)/2, wy+18, 632, wy);
    ctx.stroke();
    ctx.strokeStyle='rgba(200,214,238,.4)'; ctx.lineWidth=0.8;   // moon glint
    ctx.beginPath(); ctx.moveTo(402, wy-0.8);
    ctx.quadraticCurveTo((402+632)/2, wy+17.2, 632, wy-0.8);
    ctx.stroke();
  }
  for(const p of roost.tree) drawPerched(p);
  for(const p of roost.wire) drawPerched(p);
  for(const f of roost.fly)
    drawBirdSprite(f.x, f.y, f.dir, ((frame+f.ph)/4|0)%3, 3, 1.25, f.pal, f.acc);
}
/* ---- wall 23: THE STARFALL — the storm, and everything a rock can meet ---- */
function stormTick(){
  stormT++;
  const ph=stormPhase();
  if(ph==='storm' && stormT%STORM_EVERY===0 && meteors.length<9){
    meteors.push({x:24+Math.random()*(W-48), y:TOP-16,
                  vx:(Math.random()-0.5)*2.6, vy:2.2+Math.random()*1.3, spin:Math.random()*6.28});
    sfx.task&&sfx.task();
  }
  for(let i=meteors.length-1;i>=0;i--){
    const m=meteors[i];
    m.x+=m.vx; m.y+=m.vy; m.vy+=0.045; m.spin+=0.13;
    if(frame%2===0) parts.push({x:m.x-m.vx*2, y:m.y-m.vy*2,
      vx:(Math.random()-.5)*0.8, vy:-0.4-Math.random()*0.6,
      life:10+Math.random()*8, col:Math.random()<0.5?'#ffd23f':'#ff8a3a'});
    let dead=false;
    // masonry is smashed outright; steel shatters the rock instead
    for(const b of bricks){
      const x0=bx(b), y0=by(b);
      if(m.x+METEOR_R>x0 && m.x-METEOR_R<x0+BW && m.y+METEOR_R>y0 && m.y-METEOR_R<y0+BH){
        if(b.hp===Infinity){ dead=true; puffAt(m.x,m.y,'#8a94ac',8); sfx.mine&&sfx.mine(); break; }
        broken++; score+=b.max*5;                // half rate: the sky did the work
        bricks.splice(bricks.indexOf(b),1);
        if(b.bird) birdOff(b);
        if(b.keg) kegBlast(b);
        if(b.tun) bores.push({r:b.r, c:b.c-1, dir:-1, t:0}, {r:b.r, c:b.c+1, dir:1, t:0});
        puffAt(m.x,m.y,'#e8c15a',7); shake=Math.max(shake,2); sfx.hit&&sfx.hit();
        dead=true; break;                        // one rock, one brick — it spends itself
      }
    }
    // a ball met mid-air shatters the rock and pays for the nerve
    if(!dead) for(const bl of balls){
      if(bl.stuck) continue;
      if(Math.hypot(bl.x-m.x, bl.y-m.y)<METEOR_R+BALL_R){
        const d=Math.hypot(bl.x-m.x, bl.y-m.y)||1, sp=Math.hypot(bl.vx,bl.vy);
        bl.vx=(bl.x-m.x)/d*sp; bl.vy=(bl.y-m.y)/d*sp;   // bounce radially off the rock
        bounced(bl);
        score+=METEOR_PTS; puffAt(m.x,m.y,'#ffd23f',12); puffAt(m.x,m.y,'#ff8a3a',8);
        shake=Math.max(shake,4); sfx.chest&&sfx.chest();
        dead=true; break;
      }
    }
    // the slab: a rock on your roof scorches it short — dodge the shadows
    if(!dead && m.y+METEOR_R>padY()-PH && m.y-METEOR_R<padY()+PH &&
       Math.abs(m.x-pad.x)<pad.w/2+METEOR_R){
      padBurnT=BURN_T; dead=true;
      puffAt(m.x,padY(),'#ff8a3a',14); shake=Math.max(shake,7); sfx.explode&&sfx.explode();
    }
    if(!dead && m.y>H+14){ dead=true; puffAt(m.x,H-6,'#9aa4c0',5); shake=Math.max(shake,1); }
    if(dead) meteors.splice(i,1);
  }
}
function drawStorm(){
  const ph=stormPhase();
  if(ph!=='calm'){                     // the sky burns before and while it throws
    const t=stormT%(STORM_CALM+STORM_WARN+STORM_LEN);
    const a= ph==='warn'? (t-STORM_CALM)/STORM_WARN*0.30
           : 0.30*(1-(t-STORM_CALM-STORM_WARN)/STORM_LEN)+0.08;
    const g=ctx.createLinearGradient(0,TOP,0,TOP+90);
    g.addColorStop(0,'rgba(255,110,40,'+a.toFixed(2)+')');
    g.addColorStop(1,'rgba(255,80,30,0)');
    ctx.fillStyle=g; ctx.fillRect(0,TOP,W,90);
    if(ph==='warn' && (frame>>3)%2){
      ctx.textAlign='center'; ctx.font='bold 13px '+FONT; ctx.fillStyle='#ffb07a';
      ctx.fillText('METEOR STORM', W/2, TOP+26);
    }
  }
  for(const m of meteors){
    const gl=ctx.createRadialGradient(m.x,m.y,1,m.x,m.y,METEOR_R*2.4);
    gl.addColorStop(0,'rgba(255,190,90,.55)'); gl.addColorStop(1,'rgba(255,120,40,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(m.x,m.y,METEOR_R*2.4,0,7); ctx.fill();
    ctx.save(); ctx.translate(m.x,m.y); ctx.rotate(m.spin);
    ctx.fillStyle='#6a5548';
    ctx.beginPath();                             // a jagged little rock, not a ball
    ctx.moveTo(-METEOR_R,2); ctx.lineTo(-4,-METEOR_R); ctx.lineTo(5,-6);
    ctx.lineTo(METEOR_R,-1); ctx.lineTo(6,METEOR_R-1); ctx.lineTo(-3,METEOR_R);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(30,20,14,.7)'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.fillStyle='rgba(255,170,80,.5)';
    ctx.beginPath(); ctx.arc(-2,-2,2.6,0,7); ctx.fill();
    ctx.restore();
  }
}
/* ---------------- WALL FEATURES ----------------
   Until 2026-08-17 every mechanic in this game was gated on the LEVEL INDEX —
   level===GRAN_LVL, level===EGG_LVL, twenty-five of them across the file. That
   was fine while walls could only ever be authored in this file, and it is
   exactly what Scott asked about when he wanted a builder: "not sure how much
   of that stuff is coded per screen instead of pluggable into a wall". All of
   it was per-screen. None of it was pluggable.
   A wall carries a SET of features now. The built-in walls declare the ones
   they always had, so nothing about any of them changes — this is a rename of
   the condition, not a change to it. A custom wall may ask for any combination
   it likes. The _LVL constants stay: they are still the built-in wall numbers
   and a good many pins name them. */
/* ---------------- THE RITES (Scott, 2026-08-19) ----------------
   "current or future walls need a mechanism where a leads to b."
   A general transition methodology, declared per wall in WALL_RITES.

   TRIGGERS (when) — all STATE-OBSERVED, never event-hooked: riteTick just
   looks at the board, so every way a brick can die (ball, bolt, keg chain,
   death ray, bomb, bore, meteor) counts for free, and no splice site ever
   needs to know rites exist:
     {kind:'count', n}   — n bricks broken on this wall (any kind)
     {kind:'frac',  f}   — that fraction of the wall's breakables gone
     {kind:'tier',  n}   — the LAST tier-n brick is gone (only if some existed)
     {kind:'rune'}       — the last rune brick ('R' on the map) is gone
   A reveal/swap that re-adds tier-n bricks after its rite fired does NOT
   re-arm it — each rite fires exactly once.

   EFFECTS (then):
     {do:'shift', dc, dr}          — the plain masonry GLIDES to new homes
        (logical move now, mx/my tween pays it back — the sinkY trick again).
        Fixtures hold their ground: steel, runes, kegs, tunnels, rotors and
        every special stone stay put. The whole slide is refused if any
        mover would leave the board, land on a fixture, or crowd the paddle.
     {do:'reveal', at:{c,r}, rows:[...]} — stamp a formation into the board
        (INTERNAL 0-based columns). Occupied cells are skipped; a cell the
        ball is flying through is skipped too — nothing materialises on it.
        Chars: 1-9 tiers, '#' steel, 'K' keg, 'T' tunnel, 'R' rune.
     {do:'swap', from:{...}, to:{...}} — 1:1 in-place replacement:
        from: {steel:true} | {keg:true} | {rune:true} | {tier:n}
        to:   {steel:true} | {keg:true} | {rune:true} | {tier:n}
   Every rite may carry banner:'TEXT' — a telegraph line mid-screen.
   (Builder walls don't carry rites yet — a future 'rites page' if wanted.) */
const RITE_BORN=26;                  // frames of arrival glow on a placed/changed brick
const LODGE_LVL=OLD_TO_NEW[23];          // THE LODGE, wherever the play order puts it
const WALL_RITES={
  [LODGE_LVL]:[
    {when:{kind:'count', n:8},
     then:{do:'shift', dr:1}, banner:'THE LODGE SETTLES'},
    {when:{kind:'tier', n:3},
     then:{do:'reveal', at:{c:3, r:0}, rows:['222K222']},
     banner:'A SECOND COURSE IS LAID'},
    {when:{kind:'rune'},
     then:{do:'swap', from:{steel:true}, to:{tier:1}},
     banner:'THE STEEL REMEMBERS BEING STONE'}
  ]
};
let rites=[], riteBase=0, riteTotal=1, riteHad={tier:{},rune:false}, riteBanner=null;
function riteInit(n){
  rites=(WALL_RITES[n]||[]).map(rt=>({when:rt.when, then:rt.then, banner:rt.banner, done:false}));
  riteBase=broken; riteTotal=Math.max(1,breakable()); riteBanner=null;
  riteHad={tier:{}, rune:bricks.some(b=>b.rune)};
  for(const b of bricks) if(b.hp!==Infinity && b.max>0 && !b.rune) riteHad.tier[b.max]=true;
}
function riteMet(w){
  if(w.kind==='count') return broken-riteBase>=w.n;
  if(w.kind==='frac')  return (broken-riteBase)/riteTotal>=w.f;
  if(w.kind==='tier')  return riteHad.tier[w.n] && !bricks.some(b=>b.max===w.n && b.hp!==Infinity && !b.rune);
  if(w.kind==='rune')  return riteHad.rune && !bricks.some(b=>b.rune);
  return false;
}
/* a brick no rite may move or transmute — it has a job already */
function riteFixture(b){
  return b.rotor||b.bump||b.sling||b.driv||b.gran||b.green||b.brittle||
         b.hatch||b.molt||b.stack||b.bird||b.cell;
}
function riteFire(rt){
  const e=rt.then;
  if(rt.banner) riteBanner={text:rt.banner, t:170};
  sfx.explode&&sfx.explode(); shake=Math.max(shake,5);
  if(e.do==='shift'){
    const dc=e.dc||0, dr=e.dr||0;
    const movers=bricks.filter(b=>b.hp!==Infinity && !b.keg && !b.tun && !b.rune && !riteFixture(b));
    const stay=new Set(bricks.filter(b=>!movers.includes(b)).map(b=>b.r*64+b.c));
    const bad=movers.some(b=> b.c+dc<0 || b.c+dc>=COLS || b.r+dr<0 ||
      TOP+(b.r+dr)*(BH+GAP)+BH > PY-90 || stay.has((b.r+dr)*64+b.c+dc));
    if(bad) return;                              // an illegal slide is refused whole
    for(const b of movers){
      b.c+=dc; b.r+=dr;
      b.mx=(b.mx||0)-dc*(BW+GAP); b.my=(b.my||0)-dr*(BH+GAP); b.slide=true;
    }
  }
  if(e.do==='reveal'){
    const occ=new Set(bricks.map(b=>b.r*64+b.c));
    for(let rr=0;rr<e.rows.length;rr++) for(let cc=0;cc<e.rows[rr].length;cc++){
      const ch=e.rows[rr][cc];
      if(ch==='.'||ch===' ') continue;
      const c=e.at.c+cc, r=e.at.r+rr;
      if(c<0||c>=COLS||r<0||occ.has(r*64+c)) continue;
      const px2=LEFT+c*(BW+GAP)+BW/2, py2=TOP+r*(BH+GAP)+BH/2;
      if(balls.some(bl=>Math.abs(bl.x-px2)<BW && Math.abs(bl.y-py2)<BH*1.5)) continue;
      const nb= ch==='#'? {c,r,hp:Infinity,max:0,tun:false,gest:0}
        : ch==='K'? {c,r,hp:1,max:1,tun:false,keg:true,gest:0}
        : ch==='T'? {c,r,hp:1,max:1,tun:true,gest:0}
        : ch==='R'? {c,r,hp:2,max:2,tun:false,rune:true,gest:0}
        : {c,r,hp:+ch||1,max:+ch||1,tun:false,gest:0};
      nb.born=RITE_BORN;
      bricks.push(nb);
      puffAt(px2,py2,'#e8c15a',3);
    }
  }
  if(e.do==='swap'){
    const f=e.from, t=e.to;
    for(const b of bricks){
      if(riteFixture(b)) continue;
      const m= f.steel? b.hp===Infinity
        : f.keg? !!b.keg
        : f.rune? !!b.rune
        : f.tier!==undefined? (b.max===f.tier && b.hp!==Infinity && !b.keg && !b.rune && !b.tun)
        : false;
      if(!m) continue;
      delete b.keg; delete b.rune; delete b.tun;
      if(t.steel){ b.hp=Infinity; b.max=0; }
      else if(t.keg){ b.keg=true; b.hp=1; b.max=1; }
      else if(t.rune){ b.rune=true; b.hp=2; b.max=2; }
      else { b.hp=t.tier; b.max=t.tier; }
      b.born=RITE_BORN;
      puffAt(bx(b)+BW/2, by(b)+BH/2, '#e8c15a', 2);
    }
  }
}
/* runs ONCE per tick, immediately BEFORE the clear check — so a rite whose
   trigger was the wall's last breakable (the Lodge's rune swap) fires in the
   same frame instead of losing the race to level++ */
function riteTick(){
  if(riteBanner && --riteBanner.t<=0) riteBanner=null;
  for(const rt of rites){
    if(rt.done) continue;
    if(riteMet(rt.when)){ rt.done=true; riteFire(rt); }
  }
}

/* ---------------- THE COLONY (Scott, 2026-08-19) ----------------
   Conway's Game of Life on the fine grid: B3/S23, a step every LIFE_STEP
   frames, hard board boundary. Deaths score NOTHING and drop nothing — the
   rules killed them, not you; only player kills pay. Births glow in and are
   REFUSED on any cell the ball currently occupies (a brick materialising on
   the ball would be a wall the physics never agreed to). LIFE_CAP refuses a
   whole step's births when the board would overcrowd — soup almost never
   runs away under B3/S23, but 'almost' is not a rule. After every step each
   surviving cell is marked doomed if the rules would take it NEXT step: the
   doomed dim, so a patient player can read the law. The marks are a hint,
   not a contract — your own kills between steps redraw everyone's fate. */
/* the field spans rows 1..LIFE_ROWS — row 0 stays EMPTY, and births are
   bounded out of it, so the open trap channel every wall keeps above its
   bricks survives here too: a ball threaded over the colony rebounds along
   the roof, exactly the payoff that channel exists for */
const LIFE_LVL=OLD_TO_NEW[24], LIFE_STEP=88, LIFE_ROWS=12, LIFE_CAP=150, LIFE_SEED=0.34;
let lifeT=0, lifeGen=0;
function lifeNeighbours(occ,c,r){
  let n=0;
  for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
    if(!dr&&!dc) continue;
    if(occ.has((r+dr)*64+c+dc)) n++;
  }
  return n;
}
function lifeDoomMarks(){
  const occ=new Set(); for(const b of bricks) if(b.cell) occ.add(b.r*64+b.c);
  for(const b of bricks) if(b.cell){
    const n=lifeNeighbours(occ,b.c,b.r);
    b.doom=(n<2||n>3);
  }
}
function genLifeWall(){
  for(let r=1;r<=LIFE_ROWS;r++) for(let c=0;c<COLS;c++)
    if(Math.random()<LIFE_SEED)
      bricks.push({c,r,hp:1,max:1,tun:false,cell:true,gest:0});
  lifeT=0; lifeGen=0;
  lifeDoomMarks();
}
function lifeTick(){
  if(++lifeT<LIFE_STEP) return;
  lifeT=0; lifeGen++;
  const occ=new Set(); for(const b of bricks) if(b.cell) occ.add(b.r*64+b.c);
  const deaths=[], births=[], seen=new Set();
  for(const b of bricks) if(b.cell){
    const n=lifeNeighbours(occ,b.c,b.r);
    if(n<2||n>3) deaths.push(b);
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
      const c=b.c+dc, r=b.r+dr, k=r*64+c;
      if(c<0||c>=COLS||r<1||r>LIFE_ROWS||occ.has(k)||seen.has(k)) continue;
      seen.add(k);
      if(lifeNeighbours(occ,c,r)===3) births.push({c,r});
    }
  }
  for(const b of deaths){
    puffAt(bx(b)+BW/2, by(b)+BH/2, '#3a6a58', 2);
    bricks.splice(bricks.indexOf(b),1);          // the rules, not the player: no score
  }
  if(occ.size-deaths.length+births.length<=LIFE_CAP){
    for(const p of births){
      const px2=LEFT+p.c*(BW+GAP)+BW/2, py2=TOP+p.r*(BH+GAP)+BH/2;
      if(balls.some(bl=>Math.abs(bl.x-px2)<BW*1.2 && Math.abs(bl.y-py2)<BH*2)) continue;
      bricks.push({c:p.c,r:p.r,hp:1,max:1,tun:false,cell:true,gest:0,born:RITE_BORN});
    }
  }
  lifeDoomMarks();
}

/* keyed in AUTHORING order (the LEVELS_SRC literal), then permuted onto the
   play order by reindex() — so these comments stay true to the map above
   them and never have to be renumbered when Scott reorders. */
const FEATS=reindex({
  0:['mix'],             //  0 = THE CHIMNEY: cube-packed comb, 2026-08-23
  1:['mix'],             //  1 = THE COOPERAGE: barrels on a rack, 2026-08-24
  2:['mix'],             //  2 = THE RIBS: remade in mixed masonry 2026-08-23
  3:['shelf','mix'],     //  3 = THE SHELF: cube dome over the steel, 2026-08-23
  4:['gall','mix'], 6:['egg'], 7:['rand'], 8:['stack'], 9:['grav'],
  12:['persp'], 13:['sink'], 14:['bump'], 15:['gran'], 16:['green'],
  17:['temp'], 18:['driv'],
  20:['fine','frenzy'],  // 20 = THE CRUCIBLE. The boss is NOT here: his features ride the LAST index, wherever that lands.
  21:['fine','murmur'],  // 21 = THE MURMURATION: granular, and the flock flies
  22:['storm'],          // 22 = THE STARFALL: the sky throws rocks
                         // 23 = THE LODGE: no feature — its RITES live in WALL_RITES
  24:['fine','life'],    // 24 = THE COLONY: granular, and the wall breeds
  25:['gloss'],          // 25 = THE PLAYSET: the one wall shot in a studio
  26:['loom'],           // 26 = THE LOOM: the courses hang, and they come down
  27:['toll'],           // 27 = THE TOLLHOUSE: some stone is bought, not broken
  28:['ceil'],           // 28 = THE CEILING: the roof is a gutter too
  29:['fine','unseen'],  // 29 = THE UNSEEN: the wall is there. Play by sonar.
  30:['fine'],           // 30 = THE GRIN: a skull; the steel teeth outlive it
  31:['sqr'],            // 31 = BLOCKHEAD: square blocks, 32 on a side
  32:['sqr','fine'],     // 32 = SQUARE ONE: a lattice of 14px square tiles
  33:['mix']             // 33 = THE MASON'S YARD: every cut of stone at once
});
/* every feature a custom wall is allowed to switch on. 'rand' is deliberately
   absent — it GENERATES its wall, so it would throw away whatever was drawn. */
const FEAT_LIST=['shelf','gall','egg','stack','grav','persp','sink','bump',
                 'gran','green','temp','driv','gloss','loom','toll','ceil'];
const FEAT_NAME={shelf:'GUTTER SHELF', gall:'GALLERY (more drops)', egg:'HATCHING EGGS',
  stack:'STACKED SLABS', grav:'GRAVITY WELL', persp:'PERSPECTIVE', sink:'THE DESCENT',
  bump:'BUMPERS LIGHT UP', gran:'GRANITE MELTS', green:'GREENWOOD REGROWS',
  temp:'COOLING POOL', driv:'DRIVEN STONE', gloss:'MOULDED PLASTIC',
  loom:'HUNG COURSES', toll:'COIN TOLLS', ceil:'GUTTER OVERHEAD'};
let featSet=new Set();
let customWall=null;                 // {name, rows, feats} while a custom wall is up
function feat(f){ return featSet.has(f); }

/* MIXED MASONRY (Scott, 2026-08-23: "regular size bricks, possibly bigger
   ones, and the granular/extra-granular ones" — combined on one wall, with
   nothing existing allowed to break). A 'mix' map welds any RECTANGLE of
   lattice cells into one brick: the anchor cell carries the kind (1/2/3 tier,
   '#' steel, 'K' keg) and '+' cells extend it — width first along the anchor
   row, then downward while every cell across that width is still '+'. Only
   plain stone, steel and kegs may span; the mechanic bricks (runes, bumpers,
   tunnels...) keep their own walls, the same deal 'fine' cut with the
   custom-wall builder. Spanned bricks carry cw/ch (cells) and w/h (px); every
   engine reader falls back to the wall globals when those are absent. */
function genMixWall(map){
  const at=(r,c)=> (map[r]&&map[r][c])||'.';
  for(let r=0;r<map.length;r++) for(let c=1;c<=COLS;c++){
    const ch=at(r,c);
    if(ch==='.'||ch==='+') continue;
    const keg=ch==='K';
    let cw=1; while(c+cw<=COLS && at(r,c+cw)==='+') cw++;
    let chh=1;
    outer: for(;;){
      for(let k=0;k<cw;k++) if(at(r+chh,c+k)!=='+') break outer;
      chh++;
    }
    bricks.push({c:c-1, r, hp: ch==='#'? Infinity : keg? 1 : +ch,
                 max: ch==='#'? 0 : keg? 1 : +ch, tun:false,
                 gest: (feat('egg') && ch!=='#' && !keg)? freshGest() : 0, keg,
                 cw, ch:chh, w:cw*(BW+GAP)-GAP, h:chh*(BH+GAP)-GAP});
  }
}
function loadLevel(n){
  loreT=0;                 // any direct load cancels a pending lore beat
  bricks=[]; pups=[]; bolts=[]; bores=[]; rays=[]; bombArmed=false;
  drips=[]; boss=null; bossSlots=[]; embers=[]; padBurnT=0;
  /* teeters was declared on the same line as travelers (846) and travelers made
     it into this reset list; teeters did not. So every wall containing a '^'
     pivot APPENDED more, forever — retries included — and every one of them kept
     being simulated and drawn on every later wall. Cumulative, so it only became
     visible late, which is why THE COLONY looked like the culprit and wasn't.
     (Scott, 2026-08-21: "stonebreaker seems to have bogged down - very jittery".) */
  teeters=[]; travelers=[]; portalT=0;
  sinkY=0; sinkers=[]; landT=0; murm=null; roost=null;
  meteors=[]; stormT=0;
  rites=[]; riteBanner=null; lifeT=0; lifeGen=0; loomRows=null; purse=0; coins=[];
  starX=STAR_X; starY=STAR_Y;
  const cw = n<0? customWall : null;
  featSet = new Set(cw? (cw.feats||[]) : (FEATS[n]||[]));
  if(!cw && n===LEVELS.length-1) featSet.add('boss');   // the LAST wall is his, whatever its number
  setMetrics(feat('fine'), feat('sqr'), feat('mix'));
  thumpMsg=''; for(const k in CARDS) if(feat(k)) thumpMsg=CARDS[k];
  if(WALL_CARDS[n]) thumpMsg=WALL_CARDS[n];   // a wall's own card wins over a feature's
  thumpT = thumpMsg? THUMP_T : 0;      // a wall with a new rule introduces itself
  sinkT= feat('sink')? LURCH_MIN+Math.random()*LURCH_VAR : 0;
  /* teeters sit HIGH (Scott 2026-08-10): at 270 a downward ricochet left
     ~130px to react before the paddle; at 212 there's a fair 190px */
  teeters = feat('egg')?
    [{cx:180, cy:212, th:0.22, w:0}, {cx:460, cy:212, th:-0.22, w:0}] : [];
  /* a '*' drawn on the wall IS the gravity well — asking the builder to draw
     one and then remember to tick a box as well would be a trap. Same for a
     teeter: drawing one is the whole declaration. */
  const rawMap = n<0? (customWall&&customWall.rows) : LEVELS[n];
  if(rawMap && rawMap.some(row=>row.indexOf('*')>=0)) featSet.add('grav');
  if(feat('rand')){ genRandomWall(); serve(); return; }
  if(feat('murmur')){ genMurmurWall(); serve(); return; }
  if(feat('life')){ genLifeWall(); serve(); return; }
  if(feat('mix')){
    genMixWall(LEVELS[n]);
    /* the gen branches return early, so post-parse features must be handled
       here. THE SHELF's gutter seal is the only one a mix wall carries: a
       3-cell steel span reaching to x=-9 welds the shelf to the wall. */
    if(feat('shelf')) bricks.push({c:-3, r:27, hp:Infinity, max:0, tun:false, gest:0,
      cw:3, ch:2, w:3*(BW+GAP)-GAP, h:2*(BH+GAP)-GAP});
    serve(); return;
  }
  const map = cw? cw.rows : LEVELS[n];
  if(!map){ bricks=[]; serve(); return; }
  for(let r=0;r<map.length;r++) for(let c=0;c<COLS+2;c++){
    const ch=map[r][c];
    if(ch===undefined||ch==='.') continue;
    /* maps are 15 wide for authoring ease; clamp into the 13-col board */
    if(c<1||c>COLS) continue;
    const tun=ch==='T';
    if(ch==='@'){                                // THE ROTOR: it hands out spin
      bricks.push({c:c-1, r, hp:Infinity, max:0, tun:false, rotor:true,
                   ang:Math.random()*6.28, spin:(c%2?1:-1)*ROTOR_SPD, lit:0, gest:0});
      continue;
    }
    if(ch==='^'){                                // A TEETER: a bistable pivot
      teeters.push({cx:LEFT+(c-1)*(BW+GAP)+BW/2, cy:TOP+r*(BH+2)+BH/2,
                    th:(c%2? 0.22:-0.22), w:0});
      continue;
    }
    if(ch==='*'){                                // THE BLACK HOLE, wherever you put it
      starX=LEFT+(c-1)*(BW+GAP)+BW/2; starY=TOP+r*(BH+2)+BH/2;
      continue;
    }
    if(ch==='K'){
      bricks.push({c:c-1, r, hp:1, max:1, tun:false, keg:true, gest:0});
      continue;
    }
    if(ch==='R'){                                // a RUNE: the rites read these
      bricks.push({c:c-1, r, hp:2, max:2, tun:false, rune:true, gest:0});
      continue;
    }
    if(ch==='O'){                                // a bumper: unbreakable, and it kicks
      bricks.push({c:c-1, r, hp:Infinity, max:0, tun:false, bump:true, lit:0, gest:0});
      continue;
    }
    if(ch==='S'){                                // a slingshot: a bumper you can read
      bricks.push({c:c-1, r, hp:Infinity, max:0, tun:false, bump:true, sling:true,
                   lit:0, gest:0});
      continue;
    }
    if(ch==='G'){                                // gestating — it will hatch loose
      bricks.push({c:c-1, r, hp:2, max:2, tun:false, hatch:true,
                   gest:600+Math.random()*900});
      continue;
    }
    if(TOLL_PRICE[ch]){                          // LOCKED STONE: a price, or eight hits
      bricks.push({c:c-1, r, hp:TOLL_HP, max:TOLL_HP, tun:false,
                   toll:TOLL_PRICE[ch], gest:0});
      continue;
    }
    if(ch==='N'){                                // an ANCHOR PIN: the line hangs off it
      bricks.push({c:c-1, r, hp:3, max:3, tun:false, anch:true, gest:0});
      continue;
    }
    if(ch==='D'){                                // DRIVEN STONE: only a drive cracks it
      bricks.push({c:c-1, r, hp:1, max:1, tun:false, driv:true, ring:0, gest:0});
      continue;
    }
    if(ch==='A'){                                // GRANITE: it melts, it never breaks
      bricks.push({c:c-1, r, hp:GRAN_HP, max:GRAN_HP, tun:false, gran:true,
                   molt:0, gest:0});
      continue;
    }
    if(ch==='g'){                                // GREENWOOD: it grows back on you
      bricks.push({c:c-1, r, hp:GRN_MAX, max:GRN_MAX, tun:false, green:true,
                   cool:GRN_COOL, gest:0});
      continue;
    }
    if(ch==='b'){                                // BRITTLE: it answers to temperature
      bricks.push({c:c-1, r, hp:2, max:2, tun:false, brittle:true, gest:0});
      continue;
    }
    if(feat('stack') && ch>='1' && ch<='3'){
      bricks.push({c:c-1, r, hp:1, max:1, tun:false, gest:0,
                   stack:[2,3].slice(0,+ch-1), crash:0});
      continue;
    }
    bricks.push({c:c-1, r, hp: ch==='#'? Infinity : tun? 1 : +ch,
                 max: ch==='#'? 0 : tun? 1 : +ch, tun,
                 gest: (feat('egg') && ch!=='#')? freshGest() : 0});
  }
  /* THE SHELF runs FROM THE LEFT EDGE — but the grid starts 20px in, and
     balls drained down that gutter, under the shelf. One off-grid plate
     (c=-1, mostly offscreen) welds the shelf to the wall. */
  if(feat('unseen')) for(const b of bricks) if(b.hp!==Infinity){ b.vis=0; b.ping=0; }
  /* a mix wall's seal is pushed in the genMixWall branch above — this line
     only ever serves a shelf wall on the standard 13-col board */
  if(feat('shelf')) bricks.push({c:-1, r:9, hp:Infinity, max:0, tun:false, gest:0});
  if(feat('loom')) loomInit();
  if(feat('boss')){
    boss={x:LEFT+10, dir:1, hp:BOSS_HP, eyeT:0, regenT:0, atkT:0, flash:0,
          stage:0, stageFlash:0};   // stage = which of Scott's face cells he wears
    bossSlots=bricks.filter(b=>b.hp!==Infinity).map(b=>({c:b.c, r:b.r, hp:b.max}));
    faceLoad();                     // the OTHER FACE starts loading now, quietly
    if(!bossIntro){ bossIntro=true;
      if(typeof toast==='function') toast('THE WARLORD holds the final wall. The eye opens — strike THEN.'); }
  }
  /* the rites arm AFTER the whole wall stands — riteHad snapshots what the
     wall opened with, and that is the truth the triggers measure against */
  riteInit(cw? -999 : n);
  serve();
}
/* span-aware since 2026-08-23: a re-laid egg needs a free cw x ch REGION,
   not just a cell. With no arguments this is exactly the old free-cell scan
   (the overlap test against 1x1 bricks IS the old occupancy set). */
function freeCell(cw,ch){
  cw=cw||1; ch=ch||1;
  const opts=[];
  for(let r=1;r<=5;r++) for(let c=0;c+cw<=COLS;c++){
    let ok=true;
    for(const b of bricks)
      if(c<b.c+cw1(b) && b.c<c+cw && r<b.r+ch1(b) && b.r<r+ch){ ok=false; break; }
    if(ok) opts.push({r,c});
  }
  return opts.length? opts[(Math.random()*opts.length)|0] : null;
}
/* ---- THE WALL MENU: navigation while it is up; the game is held ---- */
/* ---------------- FAVOURITES + PLAY FAVORITES (Scott, 2026-08-24) ----------
   "player can heart/unheart each wall, and there's a 'Play Favorites' button."
   THE ONE RULE THAT MATTERS: hearts are keyed on the wall's NAME, never its
   index. Indices move the moment a wall is inserted — and at 35 walls that
   will happen again — which would silently re-point every heart at the wrong
   wall. Names are unique and the naming law keeps them stable.
   A favourites run is its own advance path: instead of level+1 it walks the
   queue, so it visits exactly what was hearted, in wall order, and stops. */
const FAV_KEY='sb_favs_v1';
let favs={}, favQueue=null, favPos=0;
function favLoad(){ try{ favs=JSON.parse(localStorage.getItem(FAV_KEY)||'{}')||{}; }catch(e){ favs={}; } }
function favSave(){ try{ localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }catch(e){} }
function favName(i){ return WALL_NAMES[i] || ('WALL '+(i+1)); }
function favHas(i){ return !!favs[favName(i)]; }
function favToggle(i){
  const k=favName(i);
  if(favs[k]) delete favs[k]; else favs[k]=1;
  favSave();
}
function favList(){ const out=[]; for(let i=0;i<LEVELS.length;i++) if(favHas(i)) out.push(i); return out; }
function favStart(){
  const q=favList();
  if(!q.length) return false;
  favQueue=q; favPos=0;
  level=q[0]; loadLevel(level);
  return true;
}
function favStop(){ favQueue=null; favPos=0; }

function wallMenuInput(){
  const press=k=>{ const d=!!held[k], was=!!wmLatch[k]; wmLatch[k]=d; return d&&!was; };
  const n=LEVELS.length, HALF=Math.ceil(n/2);
  if(press('h')||press('H')){ favToggle(wallSel); return; }
  if(press('f')||press('F')){
    if(favStart()){ wallUI=false; sfx.pick&&sfx.pick(); }
    else if(typeof toast==='function') toast('Heart a wall first — H on any row.');
    return;
  }
  if(press('ArrowUp'))    wallSel=(wallSel+n-1)%n;
  if(press('ArrowDown'))  wallSel=(wallSel+1)%n;
  if(press('ArrowLeft')||press('ArrowRight'))
    wallSel= wallSel>=HALF? wallSel-HALF : Math.min(n-1, wallSel+HALF);
  if(press('Enter')){
    wallUI=false;
    /* picking a wall by hand leaves a favourites run — you have stepped off
       the queue on purpose, and silently continuing it later would surprise */
    if(!ended && wallSel!==level){ favStop(); level=wallSel; loadLevel(wallSel); sfx.pick&&sfx.pick(); }
    return;
  }
  /* eLatch: without it, the ESC that closed the menu is still held next
     frame and the game's own ESC check would read it as "leave the game" */
  if(press('Escape')||press('w')||press('W')){ wallUI=false; eLatch=true; }
}
function drawWallMenu(){
  ctx.fillStyle='rgba(6,8,13,.93)'; ctx.fillRect(0,0,W,H);
  ctx.textAlign='center'; ctx.font='bold 16px '+FONT; ctx.fillStyle='#e8c15a';
  ctx.fillText('THE WALLS', W/2, 44);
  const n=LEVELS.length, HALF=Math.ceil(n/2);
  /* rowH was a flat 24 and the last row of a 14-deep column already sat ON the
     footer line. Three more walls would have printed straight through it, so
     the pitch is derived from the column depth and simply tightens as the game
     grows — 24 while it fits, less when it does not. */
  const top=76, rowH=Math.min(24, Math.floor((H-52-top)/Math.max(1,HALF-1)));
  for(let i=0;i<n;i++){
    const col=i<HALF?0:1, row=i%HALF;
    const cx2= col? W*0.73 : W*0.27, ry=top+row*rowH;
    if(i===wallSel){
      ctx.fillStyle='rgba(232,193,90,.14)';
      ctx.fillRect(cx2-140, ry-14, 280, 20);
    }
    /* the jump key, where one exists that actually WORKS — 'm' belongs to
       the valley's mute and never reaches this layer, so its row shows a
       dash instead of a lie */
    let key= i<9? String(i+1) : (WALL_KEYS[i-9]||'').toUpperCase();
    if(key==='M'||!key) key='—';                 // stolen by mute, or past the full alphabet
    ctx.font='11px '+FONT;
    ctx.fillStyle= i===wallSel? '#e8c15a':'#7a8298'; ctx.textAlign='right';
    ctx.fillText(key, cx2-118, ry);
    ctx.textAlign='left'; ctx.font='bold 12px '+FONT;
    ctx.fillStyle= i===level? '#7fe7ff' : i===wallSel? '#f2e2b8' : '#c2c8d8';
    ctx.fillText((WALL_NAMES[i]||('WALL '+(i+1))) + (i===level? '  ·  you are here':''), cx2-104, ry);
    /* the heart rides the row it belongs to, on the far side of the name so
       a long name never collides with it */
    if(favHas(i)){
      ctx.textAlign='left'; ctx.font='12px '+FONT; ctx.fillStyle='#e2607a';
      ctx.fillText('♥', cx2+118, ry);
    }
  }
  ctx.textAlign='center'; ctx.font='11px '+FONT; ctx.fillStyle='#9a8f7a';
  ctx.fillText('ARROWS pick   ·   ENTER go   ·   H heart   ·   F play favourites   ·   ESC close', W/2, H-40);
  ctx.fillStyle='#6f7690';
  const nf=favList().length;
  ctx.fillText(nf? (nf+' hearted — F plays them in order')
                 : "(M is the valley's mute key — the murmuration answers here instead)", W/2, H-22);
}
/* Where the slab actually IS this frame. Everything that touches the paddle —
   collision, catching pills, firing bolts, the death ray's muzzle, molten rock
   landing on the stone — asks this instead of PY, so the bump moves the whole
   idea of the paddle and not just its picture. With no bump running it returns
   PY exactly, so every deterministic rule in the game is untouched. */
function padY(){
  if(bumpT<=0) return PY;
  const e=BUMP_LEN-bumpT;
  if(e<BUMP_UP) return PY - BUMP_RISE*(e/BUMP_UP);            // the lunge
  if(e<BUMP_UP+BUMP_FALL){                                    // down through rest...
    const w=(e-BUMP_UP)/BUMP_FALL;
    return PY - BUMP_RISE + (BUMP_RISE+BUMP_DIP)*w;
  }
  const w=(e-BUMP_UP-BUMP_FALL)/BUMP_SETTLE;                  // ...and back up to it
  return PY + BUMP_DIP*(1-w);
}
function bumpRising(){ return bumpT>0 && (BUMP_LEN-bumpT)<BUMP_UP; }
/* the descent (sinkY, shared) and the murmuration (mx/my, per brick) ride HERE
   so every consumer — collision, bores, blasts, the death ray, the draw —
   sees the moved wall without knowing about it */
function bx(b){ return LEFT+b.c*(BW+GAP)+(b.mx||0); }
function by(b){ return TOP+b.r*(BH+GAP)+sinkY+(b.my||0); }
/* SPANS (Scott, 2026-08-23: mix "regular size bricks, possibly bigger ones,
   and the granular/extra-granular ones" on one wall). A brick may span a
   cw x ch RECTANGLE of cells; w/h are its pixel size, stamped at load by
   genMixWall. Every reader falls back to the wall globals, so a brick
   without a span — every brick on every pre-existing wall — behaves to the
   byte as it always did. */
function bw2(b){ return b.w||BW; }
function bh2(b){ return b.h||BH; }
function cw1(b){ return b.cw||1; }
function ch1(b){ return b.ch||1; }
/* Chebyshev distance between two bricks' cell rectangles — collapses to the
   old |a.c-b.c| / |a.r-b.r| pair when both bricks are 1x1, so the blast
   radii on the old walls cannot move. */
function cellGap(a,b){
  const cg=Math.max(0, a.c-(b.c+cw1(b)-1), b.c-(a.c+cw1(a)-1));
  const rg=Math.max(0, a.r-(b.r+ch1(b)-1), b.r-(a.r+ch1(a)-1));
  return Math.max(cg,rg);
}
function breakable(){ return bricks.filter(b=>b.hp!==Infinity).length; }
function speed(y){
  const fz=feat('frenzy')? 1.18 : 1;   // the crucible runs hot
  const base=Math.min(SPD_MAX*fz, (SPD0+broken*SPD_RAMP+level*0.35)*fz * (ts>0?0.6:1));
  if(y===undefined) return base;
  const t=Math.max(0, Math.min(1, (y-TOP)/(PY-TOP)));
  return base*(SPD_HI-(SPD_HI-SPD_LO)*t);
}
/* one place that says "a bounce just happened", so no surface can forget */
function bounced(bl){ zingSkew(bl); }
function serve(){
  dryRally=0;
  balls=[{x:pad.x, y:PY-BALL_R-2, vx:0, vy:0, stuck:true, zing:0, spinA:0}];
  shots=SHOTS;                                 // fresh life, fresh charges
  bumpT=0; bumpCD=0; spiked=0;                 // and the slab back on its rest line
}
function launch(bl){
  bl.stuck=false;
  const a=-Math.PI/2 + (Math.random()*0.5-0.25), s=speed(bl.y);
  bl.vx=Math.cos(a)*s; bl.vy=Math.sin(a)*s;
}
function puffAt(x,y,col,n){ for(let i=0;i<n;i++) parts.push({x,y,vx:(Math.random()-.5)*2.6,vy:(Math.random()-.5)*2.2-0.6,life:18+Math.random()*10,col}); }
function hitBrick(b, x, y, noDrop){
  dryRally=0;                                  // the rally is doing something again
  if(b.vis!==undefined) b.ping=UNSEEN_PING;    // the sonar's voice
  /* molten rock is still rock: it turns the ball and hisses, and it is checked
     BEFORE steel because a melted granite brick carries hp===Infinity so that
     breakable() stops counting it — lava is dealt with, by Scott's rule. */
  if(b.molt){ sfx.mine&&sfx.mine(); puffAt(x,y,'#ff8a3a',5); return; }
  if(b.hp===Infinity){ sfx.mine(); puffAt(x,y,'#8a94ac',3); return; }
  /* the lock turns the moment you can afford it. Checked BEFORE the chip, so
     a stone you could have bought is never accidentally paid for twice. */
  if(b.toll && purse>=b.toll){ tollPay(b,x,y); return; }
  b.hp--;
  if(b.green) b.cool=GRN_COOL;                 // touched — the regrow clock restarts
  if(b.hp<=0){
    if(b.gran){                                // GRANITE does not shatter, it pours
      b.hp=Infinity; b.molt=MOLT_LIFE;
      broken++; score+=GRAN_HP*10; shake=Math.max(shake,6);
      puffAt(x,y,'#ffd23f',14); puffAt(x,y,'#ff8a3a',8);
      sfx.explode&&sfx.explode();
      return;
    }
    if(b.stack && b.stack.length){             // the layer above CRASHES DOWN
      broken++; score+=b.max*10; shake=Math.max(shake,4);
      const nt=b.stack.shift();
      b.hp=nt; b.max=nt; b.crash=12;
      sfx.mine? sfx.mine():sfx.hit(); puffAt(x,y,'#c8b8a0',8);
      return;
    }
    bricks.splice(bricks.indexOf(b),1);
    broken++; score+=b.max*10; shake=3;
    /* THE UNSEEN: a death teaches the neighbourhood — +1% visible within 2
       cells, permanently, plus a momentary outline flash of those same
       bricks: the flash is the sonar, the 1% is the map you're earning. */
    if(b.vis!==undefined)
      for(const nb of bricks) if(nb.vis!==undefined &&
        Math.abs(nb.c-b.c)<=UNSEEN_R && Math.abs(nb.r-b.r)<=UNSEEN_R){
        nb.vis=Math.min(1, nb.vis+UNSEEN_STEP); nb.ping=UNSEEN_PING; }
    /* a bird is never broken — it gives up the sky and flies to the roost,
       leaving two feathers where masonry would have left rubble */
    if(b.bird){ birdOff(b); sfx.hit(); puffAt(x,y,'#8a94b4',2); }
    else { sfx.hit(); puffAt(x,y,brickCol(b)[0],6); }
    if(b.green) puffAt(x,y,'#cfe3cf',10);      // green goes in a puff of smoke
    if(b.brittle) puffAt(x,y,'#dff2ff',10);
    if(b.rune) puffAt(x,y,'#ffd76e',10);       // a rune goes out like a lamp
    if(b.tun){                                 // the charge fires BOTH ways
      sfx.explode(); shake=7;
      bores.push({r:b.r, c:b.c-1, dir:-1, t:0}, {r:b.r, c:b.c+1, dir:1, t:0});
    }
    /* THE TOLLHOUSE pays for work: every brick is worth its tier in coin.
       A toll broken the hard way pays nothing — you spent the effort instead
       of the money, and the wall does not reward you twice for it. */
    if(feat('toll') && !b.toll) coins.push({x:bx(b)+bw2(b)/2, y:by(b)+bh2(b)/2, v:Math.max(1,b.max||1)});
    if(b.keg) kegBlast(b);                     // the fizz finally mattered
    const pc= feat('gall')? GALL_PUP : PUP_CHANCE;
    const cap= feat('gall')? GALL_CAP : 2;
    if(!noDrop && Math.random()<pc && pups.length<cap){
      const roll=Math.random();
      let type;
      /* Da Bomb enters the table from wall 4 on (the kegs ARE wall 2's bomb) */
      if(level>=3 && roll<0.18) type='bomb';
      else {
        const r2=Math.random();
        type= r2<0.22?'wide' : r2<0.40?'ball' : r2<0.55?'slow' : r2<0.72?'laser'
            : r2<0.86?'fire' : 'ray';
      }
      pups.push({x:bx(b)+bw2(b)/2, y:by(b)+bh2(b)/2, type});
    }
  } else { sfx.pick(); puffAt(x,y,'#d8d2c4',2); }
}
/* one place that spends a life. `wipe` is for a drained ball, where the
   powerups die with it; a brick landing on you costs the life but leaves
   what you were carrying, since the ball is still up there in play. */
function loseLife(wipe){
  lives--; sfx.explode(); shake=Math.max(shake,6);
  if(wipe){ tw=0; ts=0; tl=0; tb=0; bolts=[]; bombArmed=false; }
  if(lives<=0){ ended='lose'; sfx.denied(); }
}
/* a hatched brick, killed in mid-fall — worth half again, you earned it */
function hitSinker(sk, x, y){
  if(--sk.hp>0){ sfx.pick(); puffAt(x,y,'#d8d2c4',2); return; }
  sinkers.splice(sinkers.indexOf(sk),1);
  broken++; score+=sk.max*15; shake=Math.max(shake,4);
  sfx.hit(); puffAt(x,y,TIER_COL[sk.max][0],8);
}
/* a POWDER KEG going up: everything within 2 bricks — steel excepted.
   A keg caught in the blast goes up too. */
function kegBlast(center){
  shake=Math.max(shake,8); sfx.explode();
  const cx2=bx(center)+bw2(center)/2, cy2=by(center)+bh2(center)/2;
  puffAt(cx2,cy2,'#ffb04a',16); puffAt(cx2,cy2,'#ffe98a',10);
  for(const b of [...bricks]){
    if(!bricks.includes(b)) continue;          // a chained keg may have taken it
    if(cellGap(b,center)<=2 && b.hp!==Infinity){
      broken++; score+=b.max*10;
      puffAt(bx(b)+bw2(b)/2, by(b)+bh2(b)/2, '#ffb04a', 3);
      if(b.stack && b.stack.length){ const nt=b.stack.shift(); b.hp=nt; b.max=nt; b.crash=12; continue; }
      bricks.splice(bricks.indexOf(b),1);
      if(b.bird) birdOff(b);                     // even a blast only scares a bird
      if(b.tun) bores.push({r:b.r, c:b.c-1, dir:-1, t:0}, {r:b.r, c:b.c+1, dir:1, t:0});
      if(b.keg) kegBlast(b);
    }
  }
}
/* DEATH RAY (Scott 2026-08-09): WHERE the pill lands on the slab aims it,
   paddle-english style — then a 35° cone blasts out and destroys
   everything that isn't nailed down. Steel is nailed down. */
const RAY_HALF=Math.PI*35/360;                   // half of a 35° cone, in radians
function fireDeathRay(cx2){
  const off=Math.max(-1,Math.min(1,(cx2-pad.x)/(pad.w/2)));
  const a=-Math.PI/2 + off*1.05;
  rays.push({x:cx2, y:padY()-4, a, t:26});
  shake=Math.max(shake,10); sfx.explode();
  for(const b of [...bricks]){
    if(!bricks.includes(b)) continue;            // a chained keg may have taken it
    if(b.hp===Infinity) continue;
    const dx=bx(b)+bw2(b)/2-cx2, dy=by(b)+bh2(b)/2-(padY()-4);
    if(dy>=0) continue;                          // it only ever fires upward
    let d=Math.atan2(dy,dx)-a;
    while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
    if(Math.abs(d)>RAY_HALF) continue;
    broken++; score+=b.max*10;
    puffAt(bx(b)+bw2(b)/2, by(b)+bh2(b)/2, '#d8a0ff', 4);
    if(b.stack && b.stack.length){ const nt=b.stack.shift(); b.hp=nt; b.max=nt; b.crash=12; continue; }
    bricks.splice(bricks.indexOf(b),1);
    if(b.bird) birdOff(b);                       // the ray parts around feathers
    if(b.tun) bores.push({r:b.r, c:b.c-1, dir:-1, t:0}, {r:b.r, c:b.c+1, dir:1, t:0});
    if(b.keg) kegBlast(b);
  }
}
/* Da Bomb: everything within 3 bricks in all directions — steel excepted,
   steel never breaks in this valley */
function detonate(center){
  bombArmed=false; shake=9; sfx.explode();
  const cx2=bx(center)+bw2(center)/2, cy2=by(center)+bh2(center)/2;
  puffAt(cx2,cy2,'#ff8a5a',18); puffAt(cx2,cy2,'#ffd76e',12);
  for(const b of [...bricks]){
    if(cellGap(b,center)<=3 && b.hp!==Infinity){
      broken++; score+=b.max*10;
      puffAt(bx(b)+bw2(b)/2, by(b)+bh2(b)/2, '#ff8a5a', 3);
      if(b.stack && b.stack.length){           // one layer per blast
        const nt=b.stack.shift(); b.hp=nt; b.max=nt; b.crash=12; continue;
      }
      bricks.splice(bricks.indexOf(b),1);
      if(b.bird) birdOff(b);                     // bombs scatter birds, not feathers
      if(b.tun) bores.push({r:b.r, c:b.c-1, dir:-1, t:0}, {r:b.r, c:b.c+1, dir:1, t:0});
      if(b.keg) kegBlast(b);
    }
  }
}

function tick(){
  if(bgUI){ bgTick(); return; }
  if(edit){ edTick(); return; }
  if(wallUI){ wallMenuInput(); return; }   // the menu owns the frame — game holds
  if(faceT>0){                             // THE OTHER FACE owns the frame — in silence
    faceT--;
    const e=FACE_T-faceT;
    if(e===160||e===218) shake=Math.max(shake,3);      // each change of face shudders
    if(e===360){ shake=12; sfx.explode&&sfx.explode(); } // the shatter is the only sound
    if(shake>0) shake--;
    if(faceT===0){ ended='win'; sfx.win&&sfx.win(); }
    return;
  }
  if(loreT>0){                             // the lore beat owns the frame
    loreT--;
    const sk=held[' '];
    if(sk && !loreSkipLatch){ loreSkipLatch=true; loreT=0; }
    if(!sk) loreSkipLatch=false;
    if(loreT===0){ spaceLatch=true; loadLevel(level); }
    return;
  }
  if(thumpT>0) thumpT--;
  // paddle
  const L=held['ArrowLeft'], R=held['ArrowRight'];   // arrows only — letters pick walls now
  const psp=PSPD*(feat('ceil')? CEIL_SPD : 1);   // see CEIL_SPD — the mirror needs the rail
  if(L) pad.x-=psp;
  if(R) pad.x+=psp;
  const pw=(tw>0? PW0*2 : PW0)*(padBurnT>0? 0.62 : 1);   // a caught ember scorches the slab short
  pad.w=pw;
  pad.x=Math.max(pw/2+4, Math.min(W-pw/2-4, pad.x));
  if(tw>0)tw--; if(ts>0)ts--; if(tl>0)tl--; if(tb>0)tb--;

  // launch / exit
  const sp=held[' '];
  if(sp && !spaceLatch){
    spaceLatch=true;
    if(ended){ startBreakoutTrans('out'); return; }
    let launched=false;
    for(const bl of balls) if(bl.stuck){ launch(bl); launched=true; }
    if(!launched && shots>0 && tl<=0){         // mid-flight: a pocket shot
      shots--;
      bolts.push({x:pad.x, y:padY()-6});
      sfx.pick && sfx.pick();
    }
  }
  if(!sp) spaceLatch=false;
  /* UP lunges the slab. It can only start from rest and only once the charge
     is back, so the cost of a mistimed bump is real: you spend the frames
     falling and overshooting BELOW your rest line with no way to bump out of
     it. Blocked while a ball is still stuck to the slab — bumping the serve
     would be a free spike every single life. */
  const up=held['ArrowUp'];
  if(up && !upLatch && !ended && bumpT<=0 && bumpCD<=0 && !balls.some(b=>b.stuck)){
    upLatch=true; doBump();
  }
  if(!up) upLatch=false;
  if(bumpT>0) bumpT--; else if(bumpCD>0) bumpCD--;
  /* ESC and ONLY esc leaves. 'e' is a wall key now — a letter that both
     picks a level and quits the game is a trap, and it caught Scott. */
  const ek=held['Escape'];
  if(ek && !eLatch && helpUI){ eLatch=true; helpUI=false; return; }
  if(ek && !eLatch){ eLatch=true; startBreakoutTrans('out'); return; }
  if(!ek) eLatch=false;
  /* Z opens THE WALL BUILDER. It sits after the escape check on purpose, so
     it still works on a wall you have just lost — the commonest moment to
     want to change something is the moment it beat you. 'z' is outside
     WALL_KEYS ('a'..'n'), so it cannot also be a level jump. */
  /* TOOL KEYS LIVE OUTSIDE THE WALL ALPHABET. Walls 9+ answer to WALL_KEYS,
     'a' through 'n', so every letter in that range is spoken for — 'g' is wall
     15, THE GRANITE. The background picker was bound to 'g' on 2026-08-17 and
     swallowed it, which is precisely the trap 'e' caught Scott with before.
     Y, Z and ? are past the end of the alphabet the walls can ever reach. */
  const yk=held['y']||held['Y'];
  if(yk && !yLatch){ yLatch=true; edLatch={}; bgOpen(); return; }
  if(!yk) yLatch=false;
  const hk=held['?']||held['/'];
  if(hk && !hLatch){ hLatch=true; helpUI=!helpUI; return; }
  if(!hk) hLatch=false;
  /* W opens THE WALL MENU — outside the wall alphabet (a-o), and it works on
     a wall you have just lost, same reasoning as the builder below. */
  const wk2=held['w']||held['W'];
  if(wk2 && !wLatch){ wLatch=true;
    wallUI=true; wallSel=Math.max(0, Math.min(LEVELS.length-1, level));
    wmLatch={ArrowUp:1,ArrowDown:1,ArrowLeft:1,ArrowRight:1,Enter:1,Escape:1,w:1,W:1};
    return; }
  if(!wk2) wLatch=false;
  const zk=held['z']||held['Z'];
  if(zk && !zLatch){ zLatch=true; edLatch={}; openBuilder(); return; }
  if(!zk) zLatch=false;
  // number keys jump straight to that wall; walls past 9 answer to letters
  for(let n=0;n<LEVELS.length;n++){
    let nk;
    if(n<9) nk=held[String(n+1)];
    /* the alphabet is FULL: walls past 'o' have NO key at all — without this
       guard, kk.toUpperCase() on undefined would crash the tick the moment a
       25th wall existed. The menu (W) is their only road, as documented. */
    else { const kk=WALL_KEYS[n-9]; nk=kk? (held[kk]||held[kk.toUpperCase()]) : false; }
    if(nk && !numLatch[n]){ numLatch[n]=true;
      if(!ended && n!==level){ level=n; loadLevel(n); sfx.pick&&sfx.pick(); } }
    if(!nk) numLatch[n]=false;
  }
  if(ended) return;

  // laser
  if(tl>0 && --laserT<=0){
    laserT=LASER_CD;
    bolts.push({x:pad.x-pad.w/2+6, y:padY()-6},{x:pad.x+pad.w/2-6, y:padY()-6});
    sfx.pick();
  }
  for(let i=bolts.length-1;i>=0;i--){
    const bo=bolts[i]; bo.y-=7;
    let dead=bo.y<TOP-10;
    for(const b of bricks){
      if(bo.x>bx(b)&&bo.x<bx(b)+bw2(b)&&bo.y>by(b)&&bo.y<by(b)+bh2(b)){
        if(b.bump){ b.lit=12; score+=25; sfx.mine(); puffAt(bo.x,bo.y,'#ffd23f',4); }
        /* a bolt is not a DRIVE. Driven stone answers to the slab meeting the
           ball, and to nothing you can hold a button for — otherwise LASER
           would quietly solve wall 19 and the timing would never be learned. */
        else if(b.driv){ b.ring=10; puffAt(bo.x,bo.y,'#9aa4b8',3); sfx.mine&&sfx.mine(); }
        else hitBrick(b,bo.x,bo.y);
        dead=true; break;
      }
    }
    if(!dead) for(const sk of sinkers){          // you can shoot the loose ones down
      if(Math.abs(bo.x-sk.x)<BW/2 && Math.abs(bo.y-sk.y)<BH/2){ hitSinker(sk,bo.x,bo.y); dead=true; break; }
    }
    if(dead) bolts.splice(i,1);
  }

  /* the bores: a drill head eats one column every 2 frames, through gaps,
     to the edge — only steel stops a side */
  for(let i=bores.length-1;i>=0;i--){
    const bo=bores[i];
    if(++bo.t%2) continue;
    if(bo.c<0||bo.c>=COLS){ bores.splice(i,1); continue; }
    const b=bricks.find(b2=>b2.r===bo.r && b2.c===bo.c);
    if(b){
      if(b.hp===Infinity){ puffAt(bx(b)+BW/2,by(b)+BH/2,'#8a94ac',4); sfx.mine(); bores.splice(i,1); continue; }
      bricks.splice(bricks.indexOf(b),1); broken++; score+=b.max*10;
      puffAt(bx(b)+BW/2, by(b)+BH/2, '#e8c15a', 5); sfx.hit();
      if(b.tun) bores.push({r:b.r, c:b.c-bo.dir, dir:-bo.dir, t:0});
      if(b.keg) kegBlast(b);
    }
    bo.c+=bo.dir;
  }

  if(feat('egg')) eggTick();
  if(feat('sink')) sinkTick();
  if(feat('murmur')){ murmurTick(); roostTick(); }
  if(feat('storm')) stormTick();
  if(feat('life')) lifeTick();
  /* rite housekeeping runs for EVERY wall: born glow fades, slid masonry
     glides home (mx/my decay — murmur birds never carry .slide, so the two
     users of mx/my cannot fight) */
  for(const b of bricks){
    if(b.born>0) b.born--;
    if(b.slide){
      b.mx*=0.86; b.my*=0.86;
      if(Math.abs(b.mx)<0.4 && Math.abs(b.my)<0.4){ b.mx=0; b.my=0; delete b.slide; }
    }
  }
  if(feat('gran')) granTick();
  if(feat('green')) greenTick();
  if(feat('loom')) loomTick();
  if(feat('toll')) coinTick();
  if(feat('bump')) for(const b of bricks) if(b.lit>0) b.lit--;
  if(feat('driv')) for(const b of bricks) if(b.ring>0) b.ring--;
  /* rotors always turn — they are not gated on a feature, because a rotor you
     can SEE and cannot be zinged by would be a lie */
  for(const b of bricks) if(b.rotor){ b.ang+=b.spin; if(b.lit>0) b.lit--; }
  if(feat('stack')) for(const b of bricks) if(b.crash>0) b.crash--;

  // balls
  for(let i=balls.length-1;i>=0;i--){
    const bl=balls[i];
    if(bl.stuck){ bl.x=pad.x; bl.y=PY-BALL_R-2; continue; }
    /* the height gradient, live per frame — plus whatever a bumper just
       put into the ball, decaying back to the honest pace */
    if(bl.kick>0) bl.kick--;
    if(bl.hot>0) bl.hot--;
    if(bl.spike>0) bl.spike--;
    let spd=speed(bl.y)*(bl.kick>0? KICK_MULT : 1)*(bl.spike>0? SPIKE_MULT : 1);
    /* THE COOLING HOUSE: the pool COOLS, it does not slow — speed follows
       TEMPERATURE, and temperature is earned back by breaking things. That is
       why leaving the water never has to justify a speed-up: leaving the water
       does nothing at all. */
    if(feat('temp')){
      if(bl.temp===undefined) bl.temp=TEMP_START;
      if(inPool(bl.x,bl.y) && bl.temp>0){
        bl.temp=Math.max(0, bl.temp-TEMP_COOL);
        if(!(frame%4)) puffAt(bl.x,bl.y,'#bfe8ff',1);
      }
      spd*=TEMP_SLOW+bl.temp*(TEMP_FAST-TEMP_SLOW);
    }
    /* THE HEAVY STAR: pull applied BEFORE the renormalise below, so the
       warp is pure curvature — the ball bends, it never runs away */
    if(feat('grav')){
      const dxs=starX-bl.x, dys=starY-bl.y;
      const d2=dxs*dxs+dys*dys, rr=Math.sqrt(d2)||1;
      /* the floor tames the ACCEL only — rr must stay the true distance,
         or the core collision below can never fire */
      const a=Math.min(0.42, STAR_G/Math.max(d2,900));
      bl.vx+=a*dxs/rr; bl.vy+=a*dys/rr;
      if(rr<STAR_R+BALL_R){                      // the core is a solid mirror
        const nx2=-dxs/rr, ny2=-dys/rr;
        const vns=bl.vx*nx2+bl.vy*ny2;
        if(vns<0){ bl.vx-=2*vns*nx2; bl.vy-=2*vns*ny2; }
        bl.x=starX+nx2*(STAR_R+BALL_R+0.5); bl.y=starY+ny2*(STAR_R+BALL_R+0.5);
        puffAt(bl.x,bl.y,'#b09aff',3); sfx.task&&sfx.task();
      }
    }
    const n=Math.hypot(bl.vx,bl.vy)||1;
    bl.vx*=spd/n; bl.vy*=spd/n;
    /* THE CURVE. Spin pushes the ball sideways to its own travel, which is
       what a curve IS — applied before the step, so the arc is smooth rather
       than a kink at each bounce. */
    if(bl.zing){
      const sp2=Math.hypot(bl.vx,bl.vy)||1;
      bl.vx += (-bl.vy/sp2)*bl.zing*ZING_CURVE;
      bl.vy += ( bl.vx/sp2)*bl.zing*ZING_CURVE*0.35;   // less vertical, or it loops
      bl.zing*=ZING_DECAY;
      if(Math.abs(bl.zing)<0.02) bl.zing=0;
      bl.spinA=(bl.spinA||0)+bl.zing*0.4;
    }
    const _stepN=Math.max(1, Math.ceil(Math.hypot(bl.vx,bl.vy)/SUBMAX));
    for(let _s=0;_s<_stepN;_s++){
    bl.x+=bl.vx/_stepN; bl.y+=bl.vy/_stepN;
    /* wall bounces speak in the PADDLE's voice (Scott, 2026-08-23: "use same
       sound as paddle hitting ball, for wall bounces") — one voice for every
       clean return, whichever surface made it. */
    if(bl.x<BALL_R+2){ bl.x=BALL_R+2; bl.vx=Math.abs(bl.vx); bounced(bl); sfx.pick&&sfx.pick(); }
    if(bl.x>W-BALL_R-2){ bl.x=W-BALL_R-2; bl.vx=-Math.abs(bl.vx); bounced(bl); sfx.pick&&sfx.pick(); }
    /* THE CEILING replaces the roof with a second slab and a second gutter.
       English is the paddle's, mirrored: the far edge of the upper slab is
       the far edge of the lower one seen in a mirror, so the skill already
       learned transfers instead of having to be relearned upside down. */
    if(feat('ceil')){
      const cxc=ceilX();
      if(bl.vy<0 && bl.y<CEIL_Y+PH+BALL_R && bl.y>CEIL_Y-BALL_R
         && Math.abs(bl.x-cxc)<pad.w/2+BALL_R){
        const offc=Math.max(-1,Math.min(1,(bl.x-cxc)/(pad.w/2)));
        let ac=Math.PI/2 - offc*1.05;
        ac=Math.max(Math.PI/2-1.25, Math.min(Math.PI/2+1.25, ac));
        bl.vx=Math.cos(ac)*spd; bl.vy=Math.abs(Math.sin(ac)*spd);
        bl.y=CEIL_Y+PH+BALL_R;
        bounced(bl); sfx.pick&&sfx.pick(); puffAt(bl.x,CEIL_Y+PH,'#c4bca8',2);
      }
    }
    else if(bl.y<TOP-14){ bl.y=TOP-14; bl.vy=Math.abs(bl.vy); bounced(bl); sfx.pick&&sfx.pick(); }
    // paddle — english: WHERE it lands decides the angle
    const py=padY();
    if(bl.vy>0 && bl.y>py-BALL_R && bl.y<py+PH && Math.abs(bl.x-pad.x)<pad.w/2+BALL_R){
      const off=Math.max(-1,Math.min(1,(bl.x-pad.x)/(pad.w/2)));
      let a=-Math.PI/2 + off*1.05;
      /* Cameron, beta 2026-08-15: "Stonebreaker has spots that can go back
         and forth infinitely using the paddle without changing angle."
         True, and inevitable: the return angle is a pure function of where
         the ball lands, so a ball returning to the same spot repeats for
         ever. The fix must NOT be random jitter on every hit -- paddle
         english is the whole skill of this game and has to stay predictable.
         So only a rally that is ACHIEVING NOTHING gets perturbed: dryRally
         counts paddle returns since the last brick contact, and past
         DRY_GRACE the angle wanders, further every hit, until the loop
         breaks. Normal play touches a brick every few hits and never sees
         this happen. */
      dryRally++;
      if(dryRally>DRY_GRACE){
        const wob=Math.min(DRY_MAX,(dryRally-DRY_GRACE)*DRY_STEP);
        a += (Math.random()*2-1)*wob;
      }
      a=Math.max(-Math.PI/2-1.25, Math.min(-Math.PI/2+1.25, a));   // never horizontal
      bl.vx=Math.cos(a)*spd; bl.vy=Math.sin(a)*spd;
      bl.y=py-BALL_R;
      /* met on the RISE — the slab is travelling into the ball, and that is a
         DRIVE. Angle still belongs to paddle english; the bump only ever adds
         power, so the old skill is never overwritten by the new one. */
      if(bumpRising()){
        bl.spike=SPIKE_T; score+=30; shake=Math.max(shake,4);
        /* on THIS frame too, not just the next one — spd was computed before
           the slab was known to be swinging, and a drive that arrives a frame
           late is a drive the player cannot feel */
        bl.vx*=SPIKE_MULT; bl.vy*=SPIKE_MULT;
        puffAt(bl.x,py,'#ffffff',9); puffAt(bl.x,py,'#8ad8ff',7);
        sfx.chest&&sfx.chest();
      }
      sfx.pick(); puffAt(bl.x,py,'#c4bca8',2);
    }
    /* BOLIDE: a flaming ball smashes straight THROUGH everything breakable
       within its halo — only steel still turns it */
    if(tb>0){
      for(const b of [...bricks]){
        /* driven stone stands with the steel here. A bolide is five free
           seconds of bulldozer; letting it eat the vault deletes the only
           wall in the game built around a control rather than a layout. */
        if(b.hp===Infinity || b.driv) continue;
        /* span bricks measure to their nearest FACE — a boulder's centre can
           be a full halo away while the ball burns against its side. 1x1
           bricks keep the centre test, so no old wall moves an inch. */
        let dxb, dyb;
        if(b.w){ const x0=bx(b), y0=by(b);
          dxb=bl.x-Math.max(x0,Math.min(bl.x,x0+b.w));
          dyb=bl.y-Math.max(y0,Math.min(bl.y,y0+b.h)); }
        else { dxb=bl.x-(bx(b)+BW/2); dyb=bl.y-(by(b)+BH/2); }
        if(dxb*dxb+dyb*dyb>BOLIDE_R*BOLIDE_R) continue;
        broken++; score+=b.max*10;
        puffAt(bx(b)+bw2(b)/2, by(b)+bh2(b)/2, '#ffb43a', 5);
        if(b.stack && b.stack.length){           // burns one layer at a time
          const nt=b.stack.shift(); b.hp=nt; b.max=nt; b.crash=12; continue;
        }
        bricks.splice(bricks.indexOf(b),1);
        if(b.bird) birdOff(b);                   // a fireball is VERY convincing
        if(b.tun) bores.push({r:b.r, c:b.c-1, dir:-1, t:0}, {r:b.r, c:b.c+1, dir:1, t:0});
        if(b.keg) kegBlast(b);
      }
      parts.push({x:bl.x-bl.vx*1.5, y:bl.y-bl.vy*1.5,
        vx:(Math.random()-.5)*1.4, vy:(Math.random()-.5)*1.4-0.3,
        life:12+Math.random()*8, col:Math.random()<0.5?'#ffd23f':'#ff8a3a'});
    }
    // bricks — nearest-axis reflection (a bolide ignores everything but steel)
    for(const b of bricks){
      if(tb>0 && b.hp!==Infinity && !b.driv) continue;   // ...so it still turns the ball
      const x0=bx(b), y0=by(b), w0=bw2(b), h0=bh2(b);
      if(bl.x+BALL_R>x0 && bl.x-BALL_R<x0+w0 && bl.y+BALL_R>y0 && bl.y-BALL_R<y0+h0){
        /* SEAM GUARD: the 2px gap between touching bricks is thinner than
           the ball, yet min-overlap resolution could side-shove the ball INTO
           it — falling balls threaded whole columns (and the steel shelf) at
           speed. A face shared with a neighbour is not a real face: never
           resolve toward it. Adjacency is measured between CELL RECTANGLES;
           on 1x1 bricks the four tests collapse to the exact comparisons
           that always stood here. */
        let nL=false,nR=false,nU=false,nD=false;
        for(const q of bricks){
          if(q===b || (tb>0 && q.hp!==Infinity && !q.driv)) continue;
          const cOv = q.c<b.c+cw1(b) && b.c<q.c+cw1(q);
          const rOv = q.r<b.r+ch1(b) && b.r<q.r+ch1(q);
          if(rOv){ if(q.c+cw1(q)===b.c) nL=true; else if(b.c+cw1(b)===q.c) nR=true; }
          if(cOv){ if(q.r+ch1(q)===b.r) nU=true; else if(b.r+ch1(b)===q.r) nD=true; }
        }
        const oxl=nL?1e9:bl.x+BALL_R-x0, oxr=nR?1e9:x0+w0-(bl.x-BALL_R);
        const oyt=nU?1e9:bl.y+BALL_R-y0, oyb=nD?1e9:y0+h0-(bl.y-BALL_R);
        const m=Math.min(oxl,oxr,oyt,oyb);
        if(m>1e8) continue;              // boxed in on all sides — a neighbour owns the real face
        if(m===oxl){ bl.vx=-Math.abs(bl.vx); bl.x=x0-BALL_R; }
        else if(m===oxr){ bl.vx=Math.abs(bl.vx); bl.x=x0+w0+BALL_R; }
        else if(m===oyt){ bl.vy=-Math.abs(bl.vy); bl.y=y0-BALL_R; }
        else { bl.vy=Math.abs(bl.vy); bl.y=y0+h0+BALL_R; }
        bounced(bl);
        if(b.hp===Infinity && !b.bump){          // jitter off steel — periodic orbits can't survive
          const j=(Math.random()-.5)*0.24, cj=Math.cos(j), sj=Math.sin(j);
          const nx=bl.vx*cj-bl.vy*sj; bl.vy=bl.vx*sj+bl.vy*cj; bl.vx=nx;
        }
        if(b.rotor) zingBall(bl, b);             // a rotor hands over spin
        else if(b.bump) bumperKick(bl, b);       // a bumper aims it itself
        else if(bombArmed) detonate(b);
        else if(b.driv) drivenHit(bl, b);
        else if(b.brittle) brittleHit(bl, b);
        else {
          hitBrick(b, bl.x, bl.y);
          /* a ball that fell through a lava drip carries the heat for a
             moment: it MELTS what it touches instead of chipping it */
          if(bl.hot>0) for(let k=1;k<HOT_BITE && bricks.includes(b);k++)
            hitBrick(b, bl.x, bl.y, true);
        }
        /* work is what warms the ball back up — steel and molten rock are not
           work, so leaning on the furniture never buys you speed */
        if(feat('temp') && b.hp!==Infinity && !bricks.includes(b))
          bl.temp=Math.min(1,(bl.temp===undefined?TEMP_START:bl.temp)+TEMP_HEAT);
        break;
      }
    }
    /* the loose ones — free of the grid, so no seam to guard */
    for(const sk of sinkers){
      const x0=sk.x-BW/2, y0=sk.y-BH/2;
      if(bl.x+BALL_R<x0 || bl.x-BALL_R>x0+BW || bl.y+BALL_R<y0 || bl.y-BALL_R>y0+BH) continue;
      const oxl=bl.x+BALL_R-x0, oxr=x0+BW-(bl.x-BALL_R);
      const oyt=bl.y+BALL_R-y0, oyb=y0+BH-(bl.y-BALL_R);
      const m=Math.min(oxl,oxr,oyt,oyb);
      if(m===oxl){ bl.vx=-Math.abs(bl.vx); bl.x=x0-BALL_R; }
      else if(m===oxr){ bl.vx=Math.abs(bl.vx); bl.x=x0+BW+BALL_R; }
      else if(m===oyt){ bl.vy=-Math.abs(bl.vy); bl.y=y0-BALL_R; }
      else { bl.vy=Math.abs(bl.vy); bl.y=y0+BH+BALL_R; }
      bounced(bl);
      hitSinker(sk, bl.x, bl.y);
      break;
    }
    /* THE WARLORD's hull — solid everywhere, mortal only through the eye */
    if(boss && boss.hp>0){
      const x0=boss.x, y0=BOSS_Y;
      if(bl.x+BALL_R>x0 && bl.x-BALL_R<x0+BOSS_W && bl.y+BALL_R>y0 && bl.y-BALL_R<y0+BOSS_H){
        const oxl=bl.x+BALL_R-x0, oxr=x0+BOSS_W-(bl.x-BALL_R);
        const oyt=bl.y+BALL_R-y0, oyb=y0+BOSS_H-(bl.y-BALL_R);
        const m=Math.min(oxl,oxr,oyt,oyb);
        if(m===oxl){ bl.vx=-Math.abs(bl.vx); bl.x=x0-BALL_R; }
        else if(m===oxr){ bl.vx=Math.abs(bl.vx); bl.x=x0+BOSS_W+BALL_R; }
        else if(m===oyt){ bl.vy=-Math.abs(bl.vy); bl.y=y0-BALL_R; }
        else { bl.vy=Math.abs(bl.vy); bl.y=y0+BOSS_H+BALL_R; }
        bounced(bl);
        if(boss.eyeT%EYE_CYC<EYE_OPEN){
          boss.hp--; boss.flash=10; score+=40;
          shake=Math.max(shake,3);
          puffAt(bl.x,bl.y,'#ffd23f',6); sfx.chest&&sfx.chest();
          if(boss.hp<=0){
            /* the fall of the Warlord clears his wall with him */
            for(const b of bricks) puffAt(bx(b)+BW/2,by(b)+BH/2,'#ff8a3a',3);
            bricks=bricks.filter(b=>b.hp===Infinity); drips=[]; embers=[];
            score+=1500; shake=14; sfx.win&&sfx.win();
          }
        } else {
          puffAt(bl.x,bl.y,'#8a94a4',2); sfx.task&&sfx.task();
        }
      }
    }
    }   // end sub-steps
    if(Math.abs(bl.vy)<1.4) bl.vy=(bl.vy<0?-1.4:1.4);   // no endless horizontals
    if(Math.abs(bl.vx)<0.7){                             // ...and no endless verticals
      const s=bl.vx!==0? Math.sign(bl.vx) : (Math.random()<0.5?-1:1);
      bl.vx=0.7*s;
    }
    if(bl.y>H+10 || (feat('ceil') && bl.y<CEIL_KILL)){
      const up=bl.y<CEIL_KILL;                   // lost off the ROOF, which costs the same
      balls.splice(i,1); puffAt(bl.x, up? CEIL_KILL+6 : H-8, '#9ab0d0', 5);
      if(!balls.length){ loseLife(true); if(!ended) serve(); }
    }
  }

  // powerups
  for(let i=pups.length-1;i>=0;i--){
    const p=pups[i]; p.y+=PUP_FALL;
    if(p.y>padY()-6 && p.y<padY()+PH+8 && Math.abs(p.x-pad.x)<pad.w/2+10){
      pups.splice(i,1); sfx.chest(); score+=25;
      if(p.type==='wide') tw=WIDE_T;
      else if(p.type==='fire'){ tb=BOLIDE_T; sfx.explode&&sfx.explode(); }
      else if(p.type==='slow') ts=SLOW_T;
      else if(p.type==='laser'){ tl=LASER_T; laserT=1; }
      else if(p.type==='bomb'){ bombArmed=true; }
      else if(p.type==='ray'){ fireDeathRay(p.x); }
      else if(p.type==='ball'){
        const src=balls.find(b=>!b.stuck)||balls[0];
        if(src) for(const da of [-0.5,0.5]){
          const a=Math.atan2(src.vy||-1,src.vx||0)+da, s2=speed(src.y);
          /* a split ball inherits HALF the parent's spin — a multiball off a zinged
             ball should feel zinged, but three balls at full bite is chaos */
          balls.push({x:src.x,y:src.y,vx:Math.cos(a)*s2,vy:Math.sin(a)*s2,stuck:false,
                      zing:(src.zing||0)*0.5, spinA:src.spinA||0});
        }
      }
    }
    else if(p.y>H+10) pups.splice(i,1);
  }

  spiked = balls.some(b=>b.spike>0)? 1 : 0;    // the wall tells you your window is open
  for(let i=parts.length-1;i>=0;i--){ const q=parts[i]; q.x+=q.vx; q.y+=q.vy; q.vy+=0.05; if(--q.life<=0) parts.splice(i,1); }
  for(let i=rays.length-1;i>=0;i--) if(--rays[i].t<=0) rays.splice(i,1);
  // THE WARLORD's turn
  if(boss && boss.hp>0 && !ended){
    boss.eyeT++;
    if(boss.flash>0) boss.flash--;
    /* SCOTT'S ORIGINAL VISION (2026-08-23): the Warlord WEARS the face ladder.
       A few hits per cell, then the next cell — state-observed off hp so every
       damage source counts, and a stage never goes backward. */
    { const st=Math.min(FACE_SRC.length-1,
        Math.floor((BOSS_HP-Math.max(0,boss.hp))*FACE_SRC.length/BOSS_HP));
      if(st>boss.stage){ boss.stage=st; boss.stageFlash=26;
        shake=Math.max(shake,8); sfx.explode&&sfx.explode(); } }
    boss.x+=boss.dir*BOSS_SPD;
    const lo=LEFT, hi=LEFT+COLS*(BW+GAP)-GAP-BOSS_W;
    if(boss.x<lo){ boss.x=lo; boss.dir=1; }
    if(boss.x>hi){ boss.x=hi; boss.dir=-1; }
    if(++boss.regenT>=REGEN_T){
      boss.regenT=0;
      const missing=bossSlots.filter(s=>!bricks.some(b=>b.c===s.c && b.r===s.r));
      if(missing.length){
        const s=missing[(Math.random()*missing.length)|0];
        bricks.push({c:s.c, r:s.r, hp:s.hp, max:s.hp, tun:false, gest:0});
        puffAt(LEFT+s.c*(BW+GAP)+BW/2, TOP+s.r*(BH+GAP)+BH/2, '#b06a58', 4);
      }
    }
    if(++boss.atkT>=ATK_T){
      boss.atkT=0;
      embers.push({x:boss.x+BOSS_W/2, y:BOSS_Y+BOSS_H+4});
    }
  }
  for(let i=embers.length-1;i>=0;i--){
    const e=embers[i]; e.y+=EMBER_SPD;
    if(e.y>padY()-4 && e.y<padY()+PH+8 && Math.abs(e.x-pad.x)<pad.w/2+7){
      embers.splice(i,1); padBurnT=BURN_T; shake=Math.max(shake,6);
      puffAt(e.x,padY(),'#ff8a3a',8); sfx.hurt&&sfx.hurt();
    } else if(e.y>H+8) embers.splice(i,1);
  }
  if(padBurnT>0) padBurnT--;

  if(shake>0) shake--;

  /* the rites judge the board ONCE per tick, HERE — after every collision has
     resolved and before the clear check, so a rite triggered by the wall's
     last breakable (the Lodge's rune swap) lands in the same frame instead
     of losing the race to level++ */
  if(rites.length) riteTick();

  // level cleared (eggs in transit and anything still falling count as alive)
  /* lava counts as dealt with (Scott's rule) — breakable() already stops
     counting a molten brick. But the wall stays open until the pour finishes,
     because watching your chain work its way down IS the payoff, and cutting
     to the next wall mid-drip reads as a bug. */
  if(!breakable() && !travelers.length && !sinkers.length
     && !drips.length && !bricks.some(b=>b.molt)
     && !(boss && boss.hp>0)){   // shields down is not the win — HE is the win
    /* a CUSTOM wall has nowhere to advance to — it goes back to the bench it
       came from, which is what you want when you are iterating on one. */
    if(level<0){ sfx.win(); edLatch={}; openBuilder();
                 edit.msg='Cleared, in '+score+' points. Your wall works.'; return; }
    /* A FAVOURITES RUN walks its own queue. It ENDS when the queue does —
       a finite set of chosen walls that finishes is the whole point, and it
       is also the honest reading of "play favorites": it is not the campaign. */
    if(favQueue){
      favPos++;
      if(favPos<favQueue.length){
        level=favQueue[favPos];
        sfx.win(); loreWall=level; loreT=LORE_T; loreSkipLatch=true; loreLoad(level);
      } else {
        favStop();
        sfx.win(); faceT=FACE_T; faceLoad();
      }
      return;
    }
    level++;
    if(level>=LEVELS.length){ faceT=FACE_T; faceLoad(); }   // the OTHER FACE first; the win after
    else { sfx.win(); loreWall=level; loreT=LORE_T; loreSkipLatch=true; loreLoad(level); }
  }
}

/* ---- wall 15: the bumper kick, and the slingshot save ---- */
/* THE SKEW. Every bounce a zinged ball makes comes off rotated, so the angle
   you learned on nineteen walls is not the angle you get. Called by whoever
   resolved the bounce, AFTER it has set the clean reflection. */
function zingSkew(bl){
  if(!bl.zing) return;
  const a=bl.zing*ZING_BITE, ca=Math.cos(a), sa=Math.sin(a);
  const nx=bl.vx*ca-bl.vy*sa; bl.vy=bl.vx*sa+bl.vy*ca; bl.vx=nx;
}
function zingBall(bl, b){
  /* the rotor's rim is going one way. Take its sign, and take MORE of it the
     closer you clipped the ends of the oval, where a real rotor would bite. */
  const cx2=bx(b)+BW/2;
  const off=Math.max(-1,Math.min(1,(bl.x-cx2)/(BW/2)));
  const give=ZING_GIVE*(0.55+0.45*Math.abs(off));
  bl.zing=Math.max(-ZING_MAX, Math.min(ZING_MAX,
            (bl.zing||0)*0.3 + (b.spin>0? give : -give)));
  b.lit=14; score+=20; shake=Math.max(shake,3);
  puffAt(bl.x,bl.y, b.spin>0? '#ffb03a':'#3ad0ff', 8);
  sfx.mine && sfx.mine();
}
function bumperKick(bl, b){
  const cx2=bx(b)+BW/2, cy2=by(b)+BH/2;
  const s=Math.hypot(bl.vx,bl.vy)||1;
  /* A SLINGSHOT is the honest half of the table. It sits low at a flank and
     always fires the same shot: up, and inboard, away from the wall it guards.
     No radial blend, no boost, no randomness — one hit teaches it, which is the
     whole point of putting an unbreakable down where a surprise costs a life. */
  if(b.sling){
    const inward = cx2 < W/2 ? 1 : -1;
    const a = -Math.PI/2 + inward*SLING_A;
    bl.vx=Math.cos(a)*s; bl.vy=Math.sin(a)*s;
    bl.kick=0;
    b.lit=12; score+=25; shake=Math.max(shake,3);
    puffAt(bl.x,bl.y,'#8ad8ff',6); sfx.task&&sfx.task();
    return;
  }
  let dx=bl.x-cx2, dy=bl.y-cy2;
  const d=Math.hypot(dx,dy)||1; dx/=d; dy/=d;
  /* blend the clean reflection the resolver just produced with a shove
     straight out of the heart: pure radial can pin a ball to a flat face,
     pure reflection makes a bumper feel like an ordinary wall */
  const vx=bl.vx/s*(1-KICK_RADIAL)+dx*KICK_RADIAL;
  const vy=bl.vy/s*(1-KICK_RADIAL)+dy*KICK_RADIAL;
  const n=Math.hypot(vx,vy)||1;
  bl.vx=vx/n*s; bl.vy=vy/n*s;
  /* a bumper that fires the ball AT the slab half again faster than it arrived
     is the unreadable part; a downward exit now leaves at the honest pace and
     the height gradient slows it further all the way down */
  bl.kick = bl.vy < s*KICK_DOWN ? KICK_T : 0;
  b.lit=12; score+=50; shake=Math.max(shake,4);
  puffAt(bl.x,bl.y,'#ffd23f',7); sfx.chest&&sfx.chest();
}

/* ---- the bump, and the stone it exists for ---- */
function doBump(){
  bumpT=BUMP_LEN; bumpCD=BUMP_CD;
  puffAt(pad.x, PY-4, '#cfe0ff', 5);
  sfx.task&&sfx.task();
}
/* An ordinary ball rings off the iron cap and nothing happens — no chip, no
   progress, no ambiguity. A DRIVEN ball cracks it in one. That is the entire
   contract, and it is the first brick in the game whose fate depends on what
   the player's hands did rather than on where the ball was. */
function drivenHit(bl, b){
  if(!(bl.spike>0)){
    b.ring=10; puffAt(bl.x,bl.y,'#9aa4b8',3); sfx.mine&&sfx.mine();
    return;
  }
  shake=Math.max(shake,6); score+=40;
  puffAt(bl.x,bl.y,'#ffffff',8); puffAt(bl.x,bl.y,'#9aa4b8',7);
  hitBrick(b, bl.x, bl.y);
}

/* ---- wall 16: the granite, and the lava that runs out of it ---- */
function granTick(){
  for(const b of [...bricks]){
    if(!b.molt) continue;
    if(--b.molt<=0){                             // the pour is spent; it drains away
      bricks.splice(bricks.indexOf(b),1);
      puffAt(bx(b)+BW/2, by(b)+BH/2, '#ff8a3a', 12);
      score+=25; sfx.hit&&sfx.hit();
      continue;
    }
    if(b.molt%DRIP_EVERY===0)
      drips.push({x:bx(b)+BW/2+(Math.random()-0.5)*10, y:by(b)+BH, vy:DRIP_V});
  }
  for(let i=drips.length-1;i>=0;i--){
    const dp=drips[i];
    dp.vy=Math.min(DRIP_VMAX, dp.vy+0.05); dp.y+=dp.vy;
    let dead=false;
    /* it eats DOWNWARD. This is the whole reason the wall is worth building:
       melt the head of a column and the column melts itself. */
    for(const b of bricks){
      if(b.molt) continue;                       // lava does not eat lava
      const x0=bx(b), y0=by(b);
      if(dp.x<x0 || dp.x>x0+BW || dp.y<y0 || dp.y>y0+BH) continue;
      if(b.hp===Infinity){ puffAt(dp.x,dp.y,'#ff8a3a',5); sfx.mine&&sfx.mine(); }
      else for(let k=0;k<DRIP_BITE && bricks.includes(b);k++)
        hitBrick(b, dp.x, dp.y, true);           // no powerup farming off lava
      dead=true; break;
    }
    /* and it is a hazard in the same object it is a reward in: catch molten
       rock on the slab and it costs you the life, ball still in play */
    if(!dead && dp.y>padY()-4 && dp.y<padY()+PH+6 && Math.abs(dp.x-pad.x)<pad.w/2+4){
      puffAt(dp.x,padY(),'#ff8a3a',14); shake=Math.max(shake,7);
      loseLife(false); dead=true;
    }
    if(dead || dp.y>H+8) drips.splice(i,1);
  }
  for(const bl of balls){                        // through the drip = a hot ball
    if(bl.stuck) continue;
    for(const dp of drips){
      if(Math.abs(bl.x-dp.x)<BALL_R+3 && Math.abs(bl.y-dp.y)<BALL_R+6){
        if(!bl.hot) puffAt(bl.x,bl.y,'#ffd23f',6);
        bl.hot=HOT_T; break;
      }
    }
  }
}

/* ---- wall 17: the greenwood, which grows back on you ---- */
/* ---- THE TOLLHOUSE ---- */
/* the bounty is deliberately better than the 10-a-tier a broken brick pays:
   buying is the clever line and it should feel like it, or nobody will ever
   choose to save up when they could simply keep hitting the thing. */
function tollPay(b,x,y){
  purse-=b.toll;
  bricks.splice(bricks.indexOf(b),1);
  broken++; score+=60*b.toll;
  shake=Math.max(shake,4); sfx.chest&&sfx.chest();
  puffAt(x,y,'#ffd23f',12); puffAt(x,y,'#e8c15a',6);
}
function coinTick(){
  for(let i=coins.length-1;i>=0;i--){
    const q=coins[i]; q.y+=COIN_FALL;
    if(q.y>padY()-6 && q.y<padY()+PH+8 && Math.abs(q.x-pad.x)<pad.w/2+10){
      coins.splice(i,1); purse+=q.v; score+=q.v*5; sfx.pick&&sfx.pick();
    } else if(q.y>H+10) coins.splice(i,1);
  }
}
function drawCoins(){
  for(const q of coins){
    ctx.fillStyle='rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.arc(q.x+1,q.y+2,COIN_R,0,7); ctx.fill();
    const g=ctx.createLinearGradient(q.x-COIN_R,q.y-COIN_R,q.x+COIN_R,q.y+COIN_R);
    g.addColorStop(0,'#ffe9a8'); g.addColorStop(0.5,'#e8b93c'); g.addColorStop(1,'#8a6512');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(q.x,q.y,COIN_R,0,7); ctx.fill();
    ctx.strokeStyle='rgba(90,62,10,.75)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(q.x,q.y,COIN_R-1.4,0,7); ctx.stroke();
    ctx.fillStyle='#5a3e0a'; ctx.font='bold 8px '+FONT; ctx.textAlign='center';
    ctx.fillText(''+q.v, q.x, q.y+3);
  }
}
/* ---- THE LOOM ---- */
function loomInit(){
  loomRows={};
  for(const b of bricks){
    if(b.hp===Infinity) continue;               // the wall's own stone does not hang
    (loomRows[b.r]=loomRows[b.r]||{orig:0, droop:0, fall:0}).orig++;
  }
}
function loomTick(){
  if(!loomRows) return;
  const stand={}, pins={};
  for(const b of bricks){
    if(b.hp===Infinity) continue;
    stand[b.r]=(stand[b.r]||0)+1;
    if(b.anch) pins[b.r]=(pins[b.r]||0)+1;
  }
  /* BOTTOM-UP, so a course settling this frame rests on where the course
     below it IS this frame, not on where it was last frame */
  const rows=Object.keys(loomRows).map(Number).sort((a,b)=>b-a);
  for(const r of rows){
    const L=loomRows[r];
    if(!stand[r]){ L.fall=0; L.droop=0; continue; }   // nothing left to hang
    const p=pins[r]||0;
    /* with the line CUT there is no catenary left to hang in — the course
       comes down flat. Probe-rendered before shipping: keeping the droop on a
       slack course sagged it straight THROUGH the course it settled onto. */
    const cap= p>=2? SAG_HELD : p===1? SAG_ONE : 0;
    L.droop += (Math.min(cap, SAG_MAX*(1-stand[r]/L.orig)) - L.droop)*LOOM_EASE;
    if(p) continue;                                   // the line still holds it up
    let restY=LOOM_FLOOR-BH, below=false;
    for(let r2=r+1;r2<24;r2++) if(stand[r2]){
      const y2=TOP+r2*(BH+GAP)+(loomRows[r2]? loomRows[r2].fall : 0);
      if(y2-(BH+2)<restY) restY=y2-(BH+2);
      below=true; break;
    }
    const want=restY-(TOP+r*(BH+GAP));
    if(L.fall<want) L.fall=Math.min(want, L.fall+LOOM_FALL);
    if(!below && L.fall>=want-0.5) loomLand(r);
  }
  for(const b of bricks){
    if(b.hp===Infinity) continue;
    const L=loomRows[b.r];
    if(L) b.my = L.fall + (b.anch? 0 : L.droop*loomShape(b.c));
  }
}
/* the course reached the floor. It shatters — and it is DEALT WITH, not
   EARNED: broken++ so the wall can still be finished, but no score, because
   you did not break it, you dropped it. One life for the event, the Descent's
   rule, and `false` because the ball is still up there with your powerups. */
function loomLand(r){
  const doomed=bricks.filter(b=>b.r===r && b.hp!==Infinity);
  if(!doomed.length) return;
  for(const b of doomed){
    puffAt(bx(b)+BW/2, by(b)+BH/2, brickCol(b)[0], 7);
    bricks.splice(bricks.indexOf(b),1);
    broken++;
  }
  loomRows[r].fall=0; loomRows[r].droop=0;
  shake=Math.max(shake,9); sfx.explode&&sfx.explode();
  loseLife(false);
}
/* ---- THE CEILING ---- */
function drawCeilSlab(){
  const cxc=ceilX(), w2=pad.w/2;
  ctx.fillStyle='rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.roundRect? ctx.roundRect(cxc-w2, CEIL_Y+3, pad.w, PH, 4)
                                : ctx.rect(cxc-w2, CEIL_Y+3, pad.w, PH); ctx.fill();
  const g=ctx.createLinearGradient(0,CEIL_Y,0,CEIL_Y+PH);
  g.addColorStop(0,'#3a4152'); g.addColorStop(0.55,'#6d7688'); g.addColorStop(1,'#8e97ab');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.roundRect? ctx.roundRect(cxc-w2, CEIL_Y, pad.w, PH, 4)
                                : ctx.rect(cxc-w2, CEIL_Y, pad.w, PH); ctx.fill();
  ctx.fillStyle='rgba(226,236,255,.30)'; ctx.fillRect(cxc-w2+3, CEIL_Y+PH-3, pad.w-6, 2);
  /* the mirror, drawn once so the rule is visible rather than deduced: two
     faint verticals joining the slabs, and the centreline they fold about */
  ctx.strokeStyle='rgba(140,152,180,.16)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(W/2, CEIL_Y+PH+4); ctx.lineTo(W/2, PY-4); ctx.stroke();
  ctx.strokeStyle='rgba(140,152,180,.10)';
  ctx.beginPath(); ctx.moveTo(cxc, CEIL_Y+PH); ctx.lineTo(pad.x, PY); ctx.stroke();
}
function drawLoom(){
  ctx.save();
  ctx.strokeStyle='rgba(232,140,90,.30)'; ctx.lineWidth=1;
  if(ctx.setLineDash) ctx.setLineDash([6,6]);
  ctx.beginPath(); ctx.moveTo(8,LOOM_FLOOR); ctx.lineTo(W-8,LOOM_FLOOR); ctx.stroke();
  if(ctx.setLineDash) ctx.setLineDash([]);
  ctx.restore();
  if(!loomRows) return;
  for(const k in loomRows){
    const r=+k, L=loomRows[k];
    if(!bricks.some(b=>b.r===r && b.hp!==Infinity)) continue;
    const slack=!bricks.some(b=>b.r===r && b.anch);
    const y0=TOP+r*(BH+GAP)+L.fall+BH/2;
    ctx.strokeStyle= slack? 'rgba(236,150,96,.60)':'rgba(152,164,190,.42)';
    ctx.lineWidth= slack? 1.7:1.2;
    ctx.beginPath(); ctx.moveTo(6, y0);
    for(let c=0;c<COLS;c++) ctx.lineTo(LEFT+c*(BW+GAP)+BW/2, y0+L.droop*loomShape(c));
    ctx.lineTo(W-6, y0); ctx.stroke();
  }
}
function greenTick(){
  for(const b of bricks){
    if(!b.green || b.hp>=b.max) continue;
    if(--b.cool>0) continue;
    b.hp++; b.cool=GRN_COOL;                     // left alone, the stone darkens
    puffAt(bx(b)+BW/2, by(b)+BH/2, '#3f7a44', 4);
  }
}

/* ---- wall 18: brittle stone answers to temperature, not to force ---- */
function inPool(x,y){ return x>POOL_X0 && x<POOL_X1 && y>POOL_Y0 && y<POOL_Y1; }
function brittleHit(bl, b){
  const t = bl.temp===undefined? TEMP_START : bl.temp;
  if(t>TEMP_HOT){                                // too hot to bite — it skids off
    puffAt(bl.x,bl.y,'#ffb43a',4); sfx.mine&&sfx.mine();
    return;
  }
  if(t<TEMP_COLD){                               // cold: the whole stone lets go
    shake=Math.max(shake,5); puffAt(bl.x,bl.y,'#bfe8ff',12);
    b.hp=1; hitBrick(b, bl.x, bl.y);
    return;
  }
  hitBrick(b, bl.x, bl.y);                       // warm: chips like anything else
}

/* ---- wall 14: the descent, and what hatches out of it ---- */
function sinkTick(){
  sinkY+=SINK_BASE;
  if(--sinkT<=0){                                // the lurch — the wall settles
    sinkT=LURCH_MIN+Math.random()*LURCH_VAR;
    sinkY+=LURCH_D+Math.random()*LURCH_DV;
    shake=Math.max(shake,3); sfx.mine&&sfx.mine();
  }
  if(landT>0) landT--;
  /* ONE life per landing event, however many bricks touch down together */
  const landed=bricks.filter(b=>by(b)+BH>=SINK_FLOOR);
  if(landed.length){
    let cost=false;
    for(const b of landed){
      if(b.hp!==Infinity) cost=true;
      puffAt(bx(b)+BW/2, SINK_FLOOR, b.hp===Infinity?'#8a94ac':'#c8a86a', 7);
      bricks.splice(bricks.indexOf(b),1);
    }
    sinkY=Math.max(0, sinkY-SINK_RECOIL);        // and the wall shudders back up
    shake=Math.max(shake,9); landT=40;
    if(cost) loseLife(false); else sfx.mine&&sfx.mine();
  }
  // gestation matures: the brick breaks loose and comes for you on its own
  for(const b of [...bricks]){
    if(!b.hatch || --b.gest>0) continue;
    bricks.splice(bricks.indexOf(b),1);
    sinkers.push({x:bx(b)+BW/2, y:by(b)+BH/2, hp:b.hp, max:b.max, sp:0});
    puffAt(bx(b)+BW/2, by(b)+BH/2, '#e8d0a0', 9);
    sfx.task&&sfx.task();
  }
  for(let i=sinkers.length-1;i>=0;i--){
    const sk=sinkers[i];
    sk.sp+=0.004; sk.y+=HATCH_V+sk.sp;
    if(sk.y+BH/2>=SINK_FLOOR){
      puffAt(sk.x, SINK_FLOOR, '#c8a86a', 10);
      sinkers.splice(i,1); shake=Math.max(shake,8); landT=40; loseLife(false);
    }
  }
}

/* ---- wall 7: gestation, the belt + portal, and the teeter-totters ---- */
function eggTick(){
  // gestation: a mature egg grows wings and flies for the belt
  for(const b of [...bricks]){
    if(b.hp===Infinity) continue;
    if(--b.gest>0) continue;
    bricks.splice(bricks.indexOf(b),1);
    travelers.push({x:bx(b)+bw2(b)/2, y:by(b)+bh2(b)/2, max:b.max, ph:'rise', t:0,
                    cw:b.cw, ch:b.ch, w:b.w, h:b.h});   // a span egg is re-laid its own size
    puffAt(bx(b)+bw2(b)/2, by(b)+bh2(b)/2, '#fff0c0', 4);
    sfx.pick&&sfx.pick();
  }
  // travelers ride to the portal and are re-laid somewhere new
  for(let i=travelers.length-1;i>=0;i--){
    const tv=travelers[i];
    if(tv.ph==='rise'){ tv.y-=1.7; if(tv.y<=BELT_Y){ tv.y=BELT_Y; tv.ph='belt'; } }
    else if(tv.ph==='belt'){ tv.x+=2.3; if(tv.x>=W-44){ tv.ph='pop'; tv.t=16; portalT=22; sfx.chest&&sfx.chest(); } }
    else if(--tv.t<=0){
      travelers.splice(i,1);
      const spot=freeCell(tv.cw, tv.ch);
      if(spot){
        const nb={c:spot.c, r:spot.r, hp:tv.max, max:tv.max, tun:false, gest:freshGest()};
        if(tv.cw){ nb.cw=tv.cw; nb.ch=tv.ch; nb.w=tv.w; nb.h=tv.h; }
        bricks.push(nb);
        puffAt(bx(nb)+bw2(nb)/2, by(nb)+bh2(nb)/2, '#c9a5ff', 8);
      }
    }
  }
  if(portalT>0) portalT--;
  // teeters: bistable pivots; every ball strike torques them
  for(const te of teeters){
    te.w += (te.th>=0?1:-1)*0.0012;              // falls toward its stops
    te.th += te.w; te.w*=0.985;
    if(te.th> TEET_MAX){ te.th= TEET_MAX; te.w*=-0.35; }
    if(te.th<-TEET_MAX){ te.th=-TEET_MAX; te.w*=-0.35; }
    const ux=Math.cos(te.th), uy=Math.sin(te.th), nx=-uy, ny=ux;
    for(const bl of balls){
      if(bl.stuck) continue;
      const dx=bl.x-te.cx, dy=bl.y-te.cy;
      const a=dx*ux+dy*uy, p=dx*nx+dy*ny;
      if(Math.abs(a)<TEET_L && Math.abs(p)<BALL_R+4){
        const vn=bl.vx*nx+bl.vy*ny;
        if(vn*p<0){                              // moving INTO the plank
          bl.vx-=2*vn*nx; bl.vy-=2*vn*ny;
          const push=(BALL_R+4.5-Math.abs(p))*Math.sign(p);
          bl.x+=nx*push; bl.y+=ny*push;
          te.w += a*vn*0.00014;                  // the strike tips the lever
          puffAt(bl.x, bl.y, '#c8b08a', 2);
          sfx.task&&sfx.task();
        }
      }
    }
  }
}

/* ---------------- draw ---------------- */
const TIER_COL={1:['#c8a86a','#8a6f3e'], 2:['#a0b4c4','#5c7086'], 3:['#c47a8a','#7a3c50']};
/* TIER_COL only knows masonry tiers 1-3. Granite and greenwood carry their own
   ramps, indexed by REMAINING hits, so every hit visibly pays — which is the
   only thing that makes a six-hit brick bearable. One place answers 'what
   colour is this brick', so every puff, crack and shard agrees. */
const GRAN_RAMP=[['#f8c65a','#c07a1a'],['#e0a848','#9c6418'],['#c89058','#84582c'],
                 ['#ac8870','#6a5238'],['#948288','#524a48'],['#767884','#3e4048']];
const GRN_RAMP=[['#8fe08a','#4f9a52'],['#5fb862','#357a3e'],['#2f8c42','#1c5230']];
const BRIT_COL=['#cfe6f2','#7d9ab0'];
function brickCol(b){
  if(b.gran)  return GRAN_RAMP[Math.max(0,Math.min(GRAN_RAMP.length-1,b.hp-1))];
  if(b.green) return GRN_RAMP[Math.max(0,Math.min(GRN_RAMP.length-1,b.hp-1))];
  if(b.brittle) return BRIT_COL;
  return TIER_COL[b.max]||TIER_COL[3];
}
/* wall 10: the ultra dense sphere — dark heart, white-hot rim, field rings */
function drawStar(){
  const pu=0.5+0.5*Math.sin(frame*0.06);
  // field rings — the warp made visible
  for(const [rr,al] of [[60,0.16],[110,0.09],[170,0.05]]){
    ctx.strokeStyle='rgba(176,154,255,'+(al*(0.6+pu*0.4)).toFixed(3)+')';
    ctx.lineWidth=1.2; ctx.setLineDash([3,7]); ctx.lineDashOffset=-frame*0.15;
    ctx.beginPath(); ctx.arc(starX,starY,rr,0,7); ctx.stroke();
  }
  ctx.setLineDash([]);
  // in-falling motes
  for(let i=0;i<5;i++){
    const a=frame*0.02+i*1.256, rr=170-((frame*0.9+i*34)%150);
    ctx.fillStyle='rgba(200,180,255,'+(0.15+(1-rr/170)*0.4).toFixed(2)+')';
    ctx.fillRect(starX+Math.cos(a)*rr-1, starY+Math.sin(a)*rr*0.92-1, 2, 2);
  }
  const gl=ctx.createRadialGradient(starX,starY,STAR_R*0.4,starX,starY,STAR_R*3.4);
  gl.addColorStop(0,'rgba(210,190,255,'+(0.35+pu*0.25).toFixed(2)+')');
  gl.addColorStop(1,'rgba(120,90,220,0)');
  ctx.fillStyle=gl;
  ctx.beginPath(); ctx.arc(starX,starY,STAR_R*3.4,0,7); ctx.fill();
  ctx.fillStyle='#1c1230';
  ctx.beginPath(); ctx.arc(starX,starY,STAR_R,0,7); ctx.fill();
  ctx.strokeStyle='rgba(238,230,255,'+(0.75+pu*0.25).toFixed(2)+')';
  ctx.lineWidth=2.2;
  ctx.beginPath(); ctx.arc(starX,starY,STAR_R,0,7); ctx.stroke();
  ctx.fillStyle='rgba(238,230,255,.8)';
  ctx.fillRect(starX-3,starY-STAR_R+3,2.4,2.4);
}
/* wall 7 eggs: wide ovals with speckles; wobble + wing nubs near maturity */
function drawEggShape(cx2,cy2,c1,c2,seed,w,h){
  const W2=w||BW, H2=h||BH;                     // span eggs come in their own size
  const g=ctx.createLinearGradient(0,cy2-11,0,cy2+11);
  g.addColorStop(0,c1); g.addColorStop(1,c2);
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.ellipse(cx2,cy2,W2/2-2,H2/2+3,0,0,7); ctx.fill();
  ctx.strokeStyle='rgba(20,12,8,.5)'; ctx.lineWidth=1.4; ctx.stroke();
  ctx.fillStyle='rgba(60,40,20,.35)';
  for(let i=0;i<4;i++){
    const sx=cx2-12+((seed*31+i*53)%25), sy=cy2-5+((seed*17+i*29)%11);
    ctx.fillRect(sx,sy,2,1.6);
  }
  ctx.fillStyle='rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.ellipse(cx2-7,cy2-4,5,2.6,-0.4,0,7); ctx.fill();
}
function drawEgg(b){
  const W2=b.w||BW, H2=b.h||BH;                 // the clutch mixes egg SIZES now
  const x=bx(b), y=by(b), cx2=x+W2/2, cy2=y+H2/2, seed=b.c*7+b.r*13;
  if(b.hp===Infinity){                          // a STONE in the clutch
    const g=ctx.createLinearGradient(0,y,0,y+H2);
    g.addColorStop(0,'#8a8ea0'); g.addColorStop(1,'#4a4e60');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cx2,cy2,W2/2-2,H2/2+2,0,0,7); ctx.fill();
    ctx.strokeStyle='rgba(10,10,18,.6)'; ctx.lineWidth=1.6; ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(cx2-10,cy2-3); ctx.lineTo(cx2-2,cy2+2); ctx.stroke();
    return;
  }
  const near=b.gest<300;
  ctx.save(); ctx.translate(cx2,cy2);
  if(near) ctx.rotate(Math.sin(frame*0.42+seed)*0.10);
  ctx.translate(-cx2,-cy2);
  if(b.gest<700){                               // maturing: a warm pulse
    const p=0.5+0.5*Math.sin(frame*0.15+seed);
    const gr=Math.max(26, W2*0.7);
    const gl=ctx.createRadialGradient(cx2,cy2,2,cx2,cy2,gr);
    gl.addColorStop(0,'rgba(255,220,140,'+(0.16+0.18*p).toFixed(2)+')');
    gl.addColorStop(1,'rgba(255,220,140,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(cx2,cy2,gr,0,7); ctx.fill();
  }
  if(near){                                     // wing nubs, flapping
    const wf=(frame>>3)%2? 3:0;
    ctx.fillStyle='rgba(255,255,255,.8)';
    ctx.beginPath(); ctx.ellipse(cx2-W2/2+1,cy2-4-wf,6,3,-0.7,0,7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx2+W2/2-1,cy2-4-wf,6,3,0.7,0,7); ctx.fill();
  }
  const [c1,c2]=TIER_COL[b.max];
  drawEggShape(cx2,cy2, b.hp===b.max? c1:c2, c2, seed, W2, H2);
  if(b.hp<b.max){                               // cracks
    ctx.strokeStyle='rgba(20,10,10,.6)'; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.moveTo(cx2-6,cy2-8); ctx.lineTo(cx2-2,cy2-2); ctx.lineTo(cx2-7,cy2+3); ctx.stroke();
    if(b.hp<b.max-1){ ctx.beginPath(); ctx.moveTo(cx2+8,cy2-6); ctx.lineTo(cx2+4,cy2); ctx.lineTo(cx2+9,cy2+5); ctx.stroke(); }
  }
  ctx.restore();
}
function drawClutchGear(){
  // the belt: two rails + travelling dashes, ending at the portal
  ctx.strokeStyle='rgba(200,180,220,.35)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(16,BELT_Y-8); ctx.lineTo(W-44,BELT_Y-8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(16,BELT_Y+8); ctx.lineTo(W-44,BELT_Y+8); ctx.stroke();
  ctx.strokeStyle='rgba(200,180,220,.55)'; ctx.lineWidth=2; ctx.setLineDash([7,9]);
  ctx.lineDashOffset=-(frame*0.8)%16;
  ctx.beginPath(); ctx.moveTo(16,BELT_Y); ctx.lineTo(W-44,BELT_Y); ctx.stroke();
  ctx.setLineDash([]);
  // the portal: a pulsing violet swirl
  const p=0.5+0.5*Math.sin(frame*0.09), kick=portalT>0? portalT/5 : 0;
  const pr=13+3*p+kick;
  const g=ctx.createRadialGradient(W-38,BELT_Y,2,W-38,BELT_Y,pr+12);
  g.addColorStop(0,'rgba(220,180,255,.9)'); g.addColorStop(0.5,'rgba(150,90,220,.5)');
  g.addColorStop(1,'rgba(120,60,200,0)');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(W-38,BELT_Y,pr+12,0,7); ctx.fill();
  ctx.strokeStyle='rgba(230,200,255,.85)'; ctx.lineWidth=2.2;
  ctx.beginPath(); ctx.ellipse(W-38,BELT_Y,pr,pr*0.62,frame*0.05,0,7); ctx.stroke();
  ctx.strokeStyle='rgba(180,130,250,.6)'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.ellipse(W-38,BELT_Y,pr*0.6,pr*0.95,-frame*0.07,0,7); ctx.stroke();
}
function drawTeeter(te){
  const ux=Math.cos(te.th), uy=Math.sin(te.th);
  // pivot mount
  ctx.fillStyle='#4a3626';
  ctx.beginPath(); ctx.moveTo(te.cx-9,te.cy+12); ctx.lineTo(te.cx+9,te.cy+12); ctx.lineTo(te.cx,te.cy); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.5)'; ctx.lineWidth=1.5; ctx.stroke();
  // the plank: a moss-topped branch
  ctx.save(); ctx.translate(te.cx,te.cy); ctx.rotate(te.th);
  const g=ctx.createLinearGradient(0,-5,0,5);
  g.addColorStop(0,'#7a5c3e'); g.addColorStop(1,'#3a2c1e');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.roundRect? ctx.roundRect(-TEET_L,-4.5,TEET_L*2,9,4):ctx.rect(-TEET_L,-4.5,TEET_L*2,9); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=1.6; ctx.stroke();
  ctx.fillStyle='#6a9a4a'; ctx.fillRect(-TEET_L+3,-4.5,TEET_L*2-6,2);
  ctx.restore();
  ctx.fillStyle='#e8c15a'; ctx.beginPath(); ctx.arc(te.cx,te.cy,2.6,0,7); ctx.fill();
}
/* THE ROTOR. An oval turning fast enough to blur, with its rim marked so the
   DIRECTION is readable at a glance — you should be able to tell which way
   your ball is about to bend before you commit to the shot. Warm for one
   direction, cold for the other, matching the puff it throws on contact. */
function drawRotor(b){
  const x=bx(b)+BW/2, y=by(b)+BH/2;
  const warm=b.spin>0;
  const glow=ctx.createRadialGradient(x,y,2,x,y,24);
  glow.addColorStop(0, warm? 'rgba(255,176,58,.34)':'rgba(58,208,255,.34)');
  glow.addColorStop(1, warm? 'rgba(255,176,58,0)':'rgba(58,208,255,0)');
  ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(x,y,24,0,7); ctx.fill();
  ctx.save(); ctx.translate(x,y); ctx.rotate(b.ang);
  const g=ctx.createLinearGradient(-BW/2,0,BW/2,0);
  g.addColorStop(0,'#2d3340'); g.addColorStop(0.5, warm? '#8a5a20':'#1f5670'); g.addColorStop(1,'#2d3340');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.ellipse(0,0,BW/2-2,BH/2+1,0,0,7); ctx.fill();
  ctx.strokeStyle= b.lit>0? '#ffffff' : (warm? '#e8a13c':'#5ec8ee');
  ctx.lineWidth= b.lit>0? 2.4 : 1.6; ctx.stroke();
  // rim marks — three, so the spin reads as rotation and not as a wobble
  ctx.strokeStyle= warm? '#ffd08a':'#9fe4ff'; ctx.lineWidth=2;
  for(let i=0;i<3;i++){
    const a=i*2.094;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*(BW/2-8), Math.sin(a)*(BH/2-2));
    ctx.lineTo(Math.cos(a)*(BW/2-3), Math.sin(a)*(BH/2+0.5));
    ctx.stroke();
  }
  ctx.fillStyle= warm? '#ffe0a8':'#cdf1ff';
  ctx.beginPath(); ctx.ellipse(0,0,3.2,2.4,0,0,7); ctx.fill();
  ctx.restore();
  // which way it turns, drawn as a little arc arrow that never spins with it
  ctx.strokeStyle= warm? 'rgba(255,208,138,.75)':'rgba(159,228,255,.75)';
  ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.arc(x, y, BW/2+4, warm? -0.9:2.24, warm? 0.9:4.04); ctx.stroke();
}
/* ============ THE PLAYSET (Scott, 2026-08-20) ============
   "I see a move in indie games towards radical pixelization. I'm wondering
   about an opposite tact, specifically a stonebreaker screen that feels as
   realistic as possible, all shiny and plastic."

   The opposite tack taken literally: no pixels at all, a product photograph.
   Seamless studio sweep, injection-moulded ABS, one key light high and left,
   a bounce card underneath. It is the only BRIGHT wall in the game, which is
   most of why it lands — the shock is contrast, not fidelity.

   LORE LAW holds: this is not a filter laid over the fortress, it IS a moulded
   toy of the fortress, and the chronicle warned you twenty walls ago —
   "it wears a face for every age. Ours got a toy."

   NOT A FORK. Everything below is one feature flag and four render branches.
   The bricks, hitboxes, tiers, kegs, powerups and physics are the same objects
   every other wall uses, so a fix to the engine is still a fix everywhere. */
const GLOSS_COL={
  1:['#ff7a6a','#e6362c','#8e1410'],       // hot red ABS
  2:['#7cc4ff','#2472dc','#0d3a82'],       // blue
  3:['#ffdc74','#f2ac1c','#8a5806']        // yellow
};
const GLOSS_STEEL=['#fbfdff','#aebbd0','#4c5568'];
function drawStudio(){
  /* the HUD keeps its dark bezel — you are looking at a lit SET through the
     cabinet, and the light text up there still has to be readable */
  const d=ctx.createLinearGradient(0,0,0,H);
  d.addColorStop(0,'#141824'); d.addColorStop(1,'#0c0e16');
  ctx.fillStyle=d; ctx.fillRect(-8,-8,W+16,H+16);
  ctx.save();
  ctx.beginPath(); ctx.rect(0,HUD,W,H-HUD); ctx.clip();
  const g=ctx.createLinearGradient(0,HUD,0,H);
  g.addColorStop(0,'#f2f5fa'); g.addColorStop(0.5,'#e0e6f0'); g.addColorStop(1,'#b6c0d2');
  ctx.fillStyle=g; ctx.fillRect(0,HUD,W,H-HUD);
  const k=ctx.createRadialGradient(W*0.30,HUD-30,10,W*0.30,HUD-30,H*1.02);
  k.addColorStop(0,'rgba(255,255,255,.80)'); k.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=k; ctx.fillRect(0,HUD,W,H-HUD);
  const v=ctx.createRadialGradient(W/2,H*0.44,H*0.28,W/2,H*0.54,H*0.98);
  v.addColorStop(0,'rgba(120,132,155,0)'); v.addColorStop(1,'rgba(88,98,120,.40)');
  ctx.fillStyle=v; ctx.fillRect(0,HUD,W,H-HUD);
  ctx.restore();
}
function drawGloss(b){
  const x=bx(b), y=by(b), steel=(b.hp===Infinity);
  const c= steel? GLOSS_STEEL : (GLOSS_COL[b.max]||GLOSS_COL[3]);
  const r=Math.min(4.5, BH*0.36);
  const RR=(xx,yy,ww,hh,rr)=>{ ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(xx,yy,ww,hh,rr); else ctx.rect(xx,yy,ww,hh); };
  ctx.fillStyle='rgba(44,52,68,.20)';                 // contact shadow on the sweep
  RR(x+2,y+3,BW,BH,r); ctx.fill();
  const g=ctx.createLinearGradient(0,y,0,y+BH);       // the moulded body:
  g.addColorStop(0,c[0]);                             //   light crown,
  g.addColorStop(0.46,c[1]);                          //   saturated belly,
  g.addColorStop(1,c[2]);                             //   dark foot
  ctx.fillStyle=g; RR(x,y,BW,BH,r); ctx.fill();
  const sp=ctx.createLinearGradient(0,y+1,0,y+BH*0.46);
  sp.addColorStop(0,'rgba(255,255,255,.88)'); sp.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sp; RR(x+2,y+1.5,BW*0.60,BH*0.42,r*0.7); ctx.fill();
  /* the bounce card. Cheap plastic renders skip this and always look like
     flat shapes — light coming back UP off the sweep is what seats an object
     on it. */
  ctx.strokeStyle='rgba(255,255,255,.36)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x+3.5,y+BH-1.3); ctx.lineTo(x+BW-3.5,y+BH-1.3); ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,.12)'; ctx.lineWidth=1;   // it came out of a tool:
  ctx.beginPath(); ctx.moveTo(x+1,y+BH*0.63); ctx.lineTo(x+BW-1,y+BH*0.63); ctx.stroke();
  if(BW>30){                                            // ...ejector-pin witness
    ctx.strokeStyle='rgba(0,0,0,.10)';
    ctx.beginPath(); ctx.arc(x+BW-9,y+BH*0.61,2.6,0,7); ctx.stroke();
  }
  ctx.strokeStyle='rgba(22,28,42,.30)'; ctx.lineWidth=1;
  RR(x+0.5,y+0.5,BW-1,BH-1,r); ctx.stroke();
  /* damage: plastic does not crack like stone, it STRESS-WHITENS — forced
     polymer crazes pale. It reads far better than a crack at this size, and
     it is the honest material behaviour. */
  if(!steel && b.hp<b.max){
    ctx.strokeStyle='rgba(255,255,255,.60)'; ctx.lineWidth=1.5; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(x+7,y+BH-3); ctx.lineTo(x+11,y+3.5);
    ctx.moveTo(x+12,y+BH-4); ctx.lineTo(x+15,y+5);
    ctx.stroke();
    if(b.hp<b.max-1){
      ctx.beginPath();
      ctx.moveTo(x+BW-13,y+2.5); ctx.lineTo(x+BW-9,y+BH-3);
      ctx.moveTo(x+BW-8,y+3.5); ctx.lineTo(x+BW-5,y+BH-5);
      ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.34)';            // a chip off the top edge
      ctx.beginPath();
      ctx.moveTo(x+BW*0.42,y); ctx.lineTo(x+BW*0.54,y); ctx.lineTo(x+BW*0.48,y+3.5);
      ctx.closePath(); ctx.fill();
    }
  }
  if(b.ring>0){                                         // an ordinary ball rang off it
    const a=b.ring/10;
    ctx.strokeStyle='rgba(255,255,255,'+(0.85*a).toFixed(2)+')';
    ctx.lineWidth=1+2*a;
    RR(x-1.5,y-1.5,BW+3,BH+3,r+1); ctx.stroke();
  }
}
function drawBrick(b){
  const W2=b.w||BW, H2=b.h||BH;   // span bricks carry their own size
  /* THE UNSEEN: vis is the brick's earned opacity, the ping a fading strike
     outline. At zero-plus-nothing the brick draws NOTHING — it is only there
     when the ball says so. Recursion guard paints the normal art dimmed. */
  if(b.vis!==undefined && !b._vzn){
    const ping= b.ping>0? (b.ping/UNSEEN_PING)*0.85 : 0;
    if(b.ping>0) b.ping--;
    const a=Math.min(1, b.vis+ping);
    if(a<=0.005) return;
    ctx.save(); ctx.globalAlpha*=a;
    b._vzn=1; drawBrick(b); b._vzn=0;
    ctx.restore(); return;
  }
  /* the plastic is a MATERIAL, not a mode. Anything carrying a mechanic — a
     keg, a rune, a bumper, a bird — keeps its own art, because its art is the
     only way you read the mechanic; a keg that looked like every other brick
     would be a trap. Steel is structure, not mechanic, so it gets moulded
     along with the rest of the set. The one real thing inside the toy castle
     is therefore the powder in its keep, which is the whole joke. */
  if(feat('gloss') && !b.keg && !b.rune && !b.cell && !b.tun && !b.bird
     && !b.sling && !b.rotor && !b.bump && !b.molt && !b.hatch) return drawGloss(b);
  if(feat('egg')) return drawEgg(b);
  /* a rite-placed or rite-changed brick ARRIVES — a gold bloom that fades
     over RITE_BORN frames. Cells carry their own arrival tint instead. */
  if(b.born>0 && !b.cell){
    const a=b.born/RITE_BORN, bcx=bx(b)+W2/2, bcy=by(b)+H2/2;
    const gl=ctx.createRadialGradient(bcx,bcy,1,bcx,bcy,W2*0.85);
    gl.addColorStop(0,'rgba(255,220,120,'+(0.55*a).toFixed(2)+')');
    gl.addColorStop(1,'rgba(255,200,80,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(bcx,bcy,W2*0.85,0,7); ctx.fill();
  }
  if(b.cell){                                   // a LIVING CELL of the colony
    const x2=bx(b), y2=by(b), ccx=x2+W2/2, ccy=y2+H2/2;
    /* the doomed dim and gutter — the rules have already spoken */
    const dim= b.doom? 0.42+0.12*Math.sin(frame*0.24+b.c*1.1+b.r*0.7) : 1;
    const nb= b.born>0? b.born/RITE_BORN : 0;
    const gl=ctx.createRadialGradient(ccx,ccy,1,ccx,ccy,W2*0.7);
    gl.addColorStop(0,'rgba(110,235,190,'+(0.22*dim+0.35*nb).toFixed(2)+')');
    gl.addColorStop(1,'rgba(60,200,150,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(ccx,ccy,W2*0.7,0,7); ctx.fill();
    const g=ctx.createLinearGradient(0,y2,0,y2+H2);
    g.addColorStop(0, b.doom? '#3f6a5c':'#5fd8a8'); g.addColorStop(1, b.doom? '#2a4a40':'#2e8a66');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(ccx,ccy,W2/2-1.5,H2/2+0.5,0,0,7); ctx.fill();
    ctx.strokeStyle='rgba(8,30,24,.6)'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='rgba(220,255,240,'+(b.doom? 0.25 : 0.55).toFixed(2)+')';   // nucleus
    ctx.beginPath(); ctx.ellipse(ccx-1,ccy-1,2.2,1.4,0,0,7); ctx.fill();
    return;
  }
  if(b.rune){                                   // a RUNE — the lodge's carved law
    const x2=bx(b), y2=by(b), rcx=x2+W2/2, rcy=y2+H2/2;
    const p=0.5+0.5*Math.sin(frame*0.09+b.c*1.3+b.r);
    const hurt=b.hp<b.max;
    const gl=ctx.createRadialGradient(rcx,rcy,2,rcx,rcy,W2*0.75);
    gl.addColorStop(0,'rgba(255,205,90,'+((hurt?0.10:0.18)+0.14*p).toFixed(2)+')');
    gl.addColorStop(1,'rgba(255,180,60,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(rcx,rcy,W2*0.75,0,7); ctx.fill();
    const g=ctx.createLinearGradient(0,y2,0,y2+H2);
    g.addColorStop(0,'#4a4456'); g.addColorStop(1,'#292433');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(x2,y2,W2,H2,3):ctx.rect(x2,y2,W2,H2); ctx.fill();
    ctx.strokeStyle='rgba(10,8,16,.6)'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.strokeStyle='rgba(255,215,110,'+((hurt?0.45:0.75)+0.25*p).toFixed(2)+')';
    ctx.lineWidth=1.8; ctx.lineCap='round';     // the glyph: an angular stave
    ctx.beginPath();
    ctx.moveTo(rcx-6,y2+H2-3); ctx.lineTo(rcx-6,y2+3); ctx.lineTo(rcx+5,y2+H2/2);
    ctx.lineTo(rcx-6,y2+H2/2+1); ctx.stroke();
    if(hurt){                                    // cracked: the light leaks
      ctx.strokeStyle='rgba(255,235,170,.5)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x2+4,y2+2); ctx.lineTo(x2+9,y2+H2-2); ctx.stroke();
    }
    return;
  }
  const x=bx(b), y=by(b) - (b.crash? b.crash*1.4 : 0);   // a landing layer slams down
  /* stacked layers rise behind the base, offset up-right, dimmed with height */
  if(b.stack && b.stack.length){
    ctx.fillStyle='rgba(0,0,0,.30)';                     // stack ground shadow
    ctx.fillRect(x+4, by(b)+H2-1, W2-4, 3);
    for(let i=b.stack.length-1;i>=0;i--){
      const t2=b.stack[i], ox=x+(i+1)*5, oy=by(b)-(i+1)*7;
      const [c1,c2]=TIER_COL[t2];
      ctx.fillStyle='rgba(10,8,6,.55)';                  // side lip: the depth read
      ctx.fillRect(ox-3, oy+3, W2, H2);
      const g=ctx.createLinearGradient(0,oy,0,oy+H2);
      g.addColorStop(0,c1); g.addColorStop(1,c2);
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.roundRect? ctx.roundRect(ox,oy,W2,H2,3):ctx.rect(ox,oy,W2,H2); ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.lineWidth=1; ctx.stroke();
      ctx.fillStyle='rgba(0,0,0,'+(0.10+i*0.10)+')';     // higher = hazier
      ctx.fillRect(ox,oy,W2,H2);
    }
  }
  if(b.keg){                                    // POWDER KEG — fizzing since you arrived
    const p=0.5+0.5*Math.sin(frame*0.18+b.c);
    const gl=ctx.createRadialGradient(x+W2/2,y+H2/2,2,x+W2/2,y+H2/2,26);
    gl.addColorStop(0,'rgba(255,170,70,'+(0.20+0.18*p).toFixed(2)+')');
    gl.addColorStop(1,'rgba(255,170,70,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(x+W2/2,y+H2/2,26,0,7); ctx.fill();
    const g=ctx.createLinearGradient(0,y,0,y+H2);
    g.addColorStop(0,'#8a5a30'); g.addColorStop(0.5,'#6a4322'); g.addColorStop(1,'#4a2e16');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(x+6,y,W2-12,H2,5):ctx.rect(x+6,y,W2-12,H2); ctx.fill();
    ctx.strokeStyle='rgba(20,10,4,.6)'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.strokeStyle='#2e2a30'; ctx.lineWidth=2;              // iron hoops
    ctx.beginPath(); ctx.moveTo(x+7,y+4); ctx.lineTo(x+W2-7,y+4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+7,y+H2-4); ctx.lineTo(x+W2-7,y+H2-4); ctx.stroke();
    ctx.strokeStyle='rgba(0,0,0,.30)'; ctx.lineWidth=1;      // staves
    for(const sx of [x+14,x+W2/2,x+W2-14]){ ctx.beginPath(); ctx.moveTo(sx,y+1); ctx.lineTo(sx,y+H2-1); ctx.stroke(); }
    ctx.strokeStyle='#c8b090'; ctx.lineWidth=1.6;            // the fuse
    ctx.beginPath(); ctx.moveTo(x+W2/2,y); ctx.quadraticCurveTo(x+W2/2+4,y-5,x+W2/2+7,y-7); ctx.stroke();
    for(let i=0;i<3;i++){                                    // the fizz
      const a=Math.random()*7, rr=2+Math.random()*4;
      ctx.fillStyle=Math.random()<0.5? '#ffe98a':'#ff9a4a';
      ctx.fillRect(x+W2/2+7+Math.cos(a)*rr, y-7+Math.sin(a)*rr, 1.6, 1.6);
    }
    return;
  }
  if(b.sling){                                  // SLINGSHOT — the kicker you can read
    const cx2=x+W2/2, cy2=y+H2/2, hot=b.lit>0? b.lit/12 : 0;
    const inward = cx2 < W/2 ? 1 : -1;
    const gl=ctx.createRadialGradient(cx2,cy2,2,cx2,cy2,W2*0.6);
    gl.addColorStop(0,'rgba(150,225,255,'+(0.16+0.34*hot).toFixed(2)+')');
    gl.addColorStop(1,'rgba(90,180,255,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.ellipse(cx2,cy2,W2*0.6,H2*1.4,0,0,7); ctx.fill();
    const g=ctx.createLinearGradient(0,y,0,y+H2);
    g.addColorStop(0, hot>0? '#dff4ff':'#7fa8c4'); g.addColorStop(1,'#2b4256');
    ctx.fillStyle=g;
    ctx.beginPath();                            // a wedge, pointing the way it fires
    ctx.moveTo(cx2-inward*(W2/2-2), y+H2-1);
    ctx.lineTo(cx2+inward*(W2/2-2), y+H2-1);
    ctx.lineTo(cx2+inward*(W2/2-2), y+1);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(12,26,38,.7)'; ctx.lineWidth=1.6; ctx.stroke();
    ctx.strokeStyle='rgba(190,240,255,'+(0.5+0.5*hot).toFixed(2)+')'; ctx.lineWidth=2;
    ctx.beginPath();                            // the rubber band, along the striking face
    ctx.moveTo(cx2-inward*(W2/2-4), y+H2-3); ctx.lineTo(cx2+inward*(W2/2-4), y+3);
    ctx.stroke();
    return;
  }
  if(b.rotor) return drawRotor(b);
  if(b.bump){                                   // BUMPER — a lit kicker, seen from above
    const cx2=x+W2/2, cy2=y+H2/2, p=0.5+0.5*Math.sin(frame*0.11+b.c*1.3);
    const hot=b.lit>0? b.lit/12 : 0;
    const gl=ctx.createRadialGradient(cx2,cy2,2,cx2,cy2,W2*0.62);
    gl.addColorStop(0,'rgba(255,225,120,'+(0.22+0.30*hot+0.10*p).toFixed(2)+')');
    gl.addColorStop(1,'rgba(255,180,60,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.ellipse(cx2,cy2,W2*0.62,H2*1.5,0,0,7); ctx.fill();
    const g=ctx.createLinearGradient(0,y,0,y+H2);
    g.addColorStop(0, hot>0? '#fff2b0':'#d8b45a'); g.addColorStop(1,'#7a5a20');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(cx2,cy2,W2/2-1,H2/2,0,0,7); ctx.fill();
    ctx.strokeStyle='rgba(30,18,4,.65)'; ctx.lineWidth=1.6; ctx.stroke();
    ctx.strokeStyle='rgba(255,245,200,'+(0.35+0.5*hot).toFixed(2)+')'; ctx.lineWidth=1.3;
    ctx.beginPath(); ctx.ellipse(cx2,cy2,W2/2-7,H2/2-3,0,0,7); ctx.stroke();
    ctx.fillStyle= hot>0? '#ffffff':'#ffe98a';
    ctx.beginPath(); ctx.ellipse(cx2,cy2,5,3.2,0,0,7); ctx.fill();
    return;
  }
  if(b.molt){                                   // MOLTEN — granite that gave up
    const p=0.5+0.5*Math.sin(frame*0.2+b.c*1.7);
    const gl=ctx.createRadialGradient(x+W2/2,y+H2/2,2,x+W2/2,y+H2/2,30);
    gl.addColorStop(0,'rgba(255,150,40,'+(0.30+0.20*p).toFixed(2)+')');
    gl.addColorStop(1,'rgba(255,90,20,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(x+W2/2,y+H2/2,30,0,7); ctx.fill();
    const g=ctx.createLinearGradient(0,y,0,y+H2);
    g.addColorStop(0,'#fff0a0'); g.addColorStop(0.5,'#ff9a2a'); g.addColorStop(1,'#c23c10');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y,W2,H2,3):ctx.rect(x,y,W2,H2); ctx.fill();
    ctx.fillStyle='rgba(255,250,200,.45)';       // the skin cracking over the melt
    for(let i=0;i<3;i++)
      ctx.fillRect(x+5+i*13, y+3+((i+((frame>>4)%2))%2)*8, 4+((b.c*7+i*11)%7), 1.6);
    /* the bead swelling on the underside, so the next drip is telegraphed */
    const q=1-((b.molt%DRIP_EVERY)/DRIP_EVERY);
    ctx.fillStyle='#ffb43a';
    ctx.beginPath(); ctx.ellipse(x+W2/2, y+H2+q*3, 2+q*2, 2+q*3.5, 0,0,7); ctx.fill();
    return;
  }
  if(b.hp===Infinity){                          // STEEL — Miner Threat grammar
    const g=ctx.createLinearGradient(0,y,0,y+H2);
    g.addColorStop(0,'#5a6478'); g.addColorStop(1,'#333a4a');
    ctx.fillStyle=g; ctx.fillRect(x,y,W2,H2);
    ctx.strokeStyle='#222836'; ctx.lineWidth=1.5; ctx.strokeRect(x+0.5,y+0.5,W2-1,H2-1);
    ctx.fillStyle='#8a94ac';
    for(const [dx,dy] of [[4,4],[W2-4,4],[4,H2-4],[W2-4,H2-4]]){ ctx.beginPath(); ctx.arc(x+dx,y+dy,1.4,0,7); ctx.fill(); }
    return;
  }
  if(b.toll){                                   // LOCKED STONE — a price on its face
    const rich=purse>=b.toll;                   // affordable: it GLINTS. Hit it now.
    const g=ctx.createLinearGradient(0,y,0,y+H2);
    g.addColorStop(0,'#7d7466'); g.addColorStop(1,'#4b4338');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y,W2,H2,2):ctx.rect(x,y,W2,H2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.lineWidth=1; ctx.stroke();
    const wear=b.hp/b.max;                      // chipping it the hard way still shows
    ctx.fillStyle='rgba(20,16,10,'+(0.32*(1-wear)).toFixed(2)+')';
    ctx.fillRect(x+1,y+1,W2-2,H2-2);
    const p2=rich? 0.5+0.5*Math.sin(frame*0.14+b.c*0.7) : 0;
    const lg=ctx.createLinearGradient(0,y+3,0,y+H2-3);   // the lock plate
    lg.addColorStop(0, rich? '#ffe9a8':'#5e5c66'); lg.addColorStop(1, rich? '#b8860f':'#2c2b33');
    ctx.fillStyle=lg; ctx.fillRect(x+W2/2-13,y+3,26,H2-6);
    if(rich){
      ctx.fillStyle='rgba(255,240,190,'+(0.18+0.26*p2).toFixed(2)+')';
      ctx.fillRect(x+W2/2-13,y+3,26,H2-6);
    }
    ctx.fillStyle= rich? '#3a2a06':'#c8ccd8';
    ctx.font='bold 10px '+FONT; ctx.textAlign='center';
    ctx.fillText(''+b.toll, x+W2/2, y+H2/2+3.5);
    return;
  }
  if(b.anch){                                   // AN ANCHOR PIN — the line hangs off it
    const g=ctx.createLinearGradient(x,y,x,y+H2);
    g.addColorStop(0,'#6a7284'); g.addColorStop(1,'#333a48');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y,W2,H2,2):ctx.rect(x,y,W2,H2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.5)'; ctx.lineWidth=1; ctx.stroke();
    const wear=b.hp/b.max;                      // a worn pin is visibly about to go
    ctx.fillStyle='rgba(226,236,255,'+(0.30+0.45*wear).toFixed(2)+')';
    ctx.fillRect(x+5,y+H2/2-1,W2-10,2);
    ctx.strokeStyle='rgba(226,236,255,'+(0.25+0.55*wear).toFixed(2)+')'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x+W2/2,y+H2/2,4.5,0,7); ctx.stroke();
    return;
  }
  if(b.driv){                                   // DRIVEN STONE — iron over stone
    const g=ctx.createLinearGradient(0,y,0,y+H2);
    g.addColorStop(0,'#8e8578'); g.addColorStop(1,'#584f44');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y,W2,H2,2):ctx.rect(x,y,W2,H2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.lineWidth=1; ctx.stroke();
    const ig=ctx.createLinearGradient(0,y+3,0,y+H2-3);   // the cap it is named for
    ig.addColorStop(0, spiked? '#e8f2ff':'#6e7a90'); ig.addColorStop(1,'#2e3646');
    ctx.fillStyle=ig; ctx.fillRect(x+2,y+3,W2-4,H2-6);
    ctx.fillStyle= spiked? '#ffffff':'#95a2b8';         // rivets
    for(const dx of [7,W2/2,W2-7]){ ctx.beginPath(); ctx.arc(x+dx,y+H2/2,1.5,0,7); ctx.fill(); }
    if(spiked){                                          // a drive is live: it glints
      const p=0.5+0.5*Math.sin(frame*0.22+b.c*0.9+b.r*1.7);
      const gl=ctx.createLinearGradient(x,y,x+W2,y+H2);
      gl.addColorStop(0,'rgba(255,255,255,0)');
      gl.addColorStop(Math.max(0.05,Math.min(0.95,p)),'rgba(220,242,255,'+(0.30+0.25*p).toFixed(2)+')');
      gl.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=gl; ctx.fillRect(x+2,y+3,W2-4,H2-6);
    }
    if(b.ring>0){                                        // an ordinary ball rang off it
      const a=b.ring/10;
      ctx.strokeStyle='rgba(200,215,240,'+(0.7*a).toFixed(2)+')';
      ctx.lineWidth=1+2*a;
      ctx.strokeRect(x-1.5, y-1.5, W2+3, H2+3);
    }
    return;
  }
  if(b.tun){                                    // the tunnel mouth
    ctx.fillStyle='#3a3026';
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y,W2,H2,3) : ctx.rect(x,y,W2,H2); ctx.fill();
    const p=0.5+0.5*Math.sin(frame*0.12);
    ctx.fillStyle='#0c0806';
    ctx.beginPath(); ctx.ellipse(x+W2/2,y+H2/2,14,6,0,0,7); ctx.fill();
    ctx.strokeStyle='rgba(255,180,90,'+(0.4+0.4*p).toFixed(2)+')'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(x+W2/2,y+H2/2,14,6,0,0,7); ctx.stroke();
    ctx.fillStyle='rgba(255,200,120,'+(0.5*p).toFixed(2)+')';
    ctx.fillRect(x+W2/2-1.5, y+H2/2-1.5, 3, 3);
    return;
  }
  if(b.bird){                                   // a STARLING, seen at wheeling distance
    const cx2=x+W2/2, cy2=y+H2/2;
    /* a real wingbeat: three poses on the bird's private phase, facing the
       way it is actually moving. Sheen wave rides its place in the flock. */
    /* 1.5x sprites on unchanged hitboxes (Scott: "50% bigger, I don't care
       if they overlap anywhere at any time") — a flock overlaps, that's
       what makes it a flock */
    drawBirdSprite(cx2, cy2, b.dir||1, ((frame+(b.ph||0))/4|0)%3, b.hp, 1.5, b.pal, b.acc);
    const ph=Math.sin((b.hx||0)*0.012 + (b.hy||0)*0.02 + frame*0.045);
    const sh=0.5+0.5*ph;                        // green-violet, starling grammar
    ctx.fillStyle='rgba('+(ph>0?'110,215,165':'165,135,225')+','+(0.06+0.16*sh).toFixed(2)+')';
    ctx.beginPath(); ctx.ellipse(cx2, cy2, 4.4, 2.4, 0, 0, 7); ctx.fill();
    return;
  }
  const [c1,c2]=brickCol(b);
  const g=ctx.createLinearGradient(0,y,0,y+H2);
  /* granite and greenwood carry the ramp in c1 itself, so the top face reads
     the CURRENT state rather than only 'untouched vs touched' */
  g.addColorStop(0, (b.gran||b.green||b.hp===b.max)? c1 : c2); g.addColorStop(1,c2);
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y,W2,H2,3) : ctx.rect(x,y,W2,H2); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.22)'; ctx.fillRect(x+2,y+2,W2-4,2.5);
  if(b.gran && b.hp<=2){                        // about to go: it starts to glow
    const p=0.5+0.5*Math.sin(frame*0.16+b.c*1.1), a=(b.hp<=1?0.32:0.16)+0.12*p;
    const hg=ctx.createRadialGradient(x+W2/2,y+H2/2,1,x+W2/2,y+H2/2,26);
    hg.addColorStop(0,'rgba(255,190,70,'+a.toFixed(2)+')');
    hg.addColorStop(1,'rgba(255,140,40,0)');
    ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(x+W2/2,y+H2/2,26,0,7); ctx.fill();
  }
  if(b.brittle){                                // frost-shot stone: facets, not grain
    ctx.strokeStyle='rgba(255,255,255,.40)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(x+6,y+H2-2); ctx.lineTo(x+15,y+3); ctx.lineTo(x+24,y+H2-2);
    ctx.moveTo(x+26,y+2); ctx.lineTo(x+34,y+H2-3);
    ctx.stroke();
  }
  if(b.green && b.hp<b.max && b.cool<60){       // it is about to come back
    ctx.strokeStyle='rgba(120,240,140,'+(0.25+0.45*(1-b.cool/60)).toFixed(2)+')';
    ctx.lineWidth=1.4;
    ctx.strokeRect(x+1.5,y+1.5,W2-3,H2-3);
  }
  if(b.hp<b.max){                               // cracks show damage
    ctx.strokeStyle='rgba(20,10,10,.55)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x+8,y+2); ctx.lineTo(x+14,y+8); ctx.lineTo(x+10,y+14); ctx.stroke();
    if(b.hp<b.max-1){ ctx.beginPath(); ctx.moveTo(x+30,y+3); ctx.lineTo(x+26,y+9); ctx.lineTo(x+33,y+13); ctx.stroke(); }
  }
  if(b.hatch){                                  // gestating: the seam is opening
    const rip=Math.max(0, 1-b.gest/900), p=0.5+0.5*Math.sin(frame*(0.08+rip*0.22));
    const gl=ctx.createRadialGradient(x+W2/2,y+H2/2,1,x+W2/2,y+H2/2,W2*0.55);
    gl.addColorStop(0,'rgba(255,230,160,'+(0.10+0.34*rip*p).toFixed(2)+')');
    gl.addColorStop(1,'rgba(255,200,90,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.ellipse(x+W2/2,y+H2/2,W2*0.55,H2,0,0,7); ctx.fill();
    ctx.strokeStyle='rgba(255,240,190,'+(0.35+0.55*rip).toFixed(2)+')';
    ctx.lineWidth=1+1.4*rip;
    ctx.beginPath();
    ctx.moveTo(x+5,y+H2/2);
    for(let i=1;i<=5;i++) ctx.lineTo(x+5+i*(W2-10)/5, y+H2/2+(i%2?-3:3)*(0.4+rip));
    ctx.stroke();
  }
}
/* bomb and ray carry no text — their names never fit the 28px pill (DEATH
   RAY showed as ATH); the draw loop gives them icons instead. BOLIDE→FIRE
   for the same reason, one size smaller. */
const PUP_LOOK={wide:['#7fdbc8','WIDE'], ball:['#ffd23f','+2'], slow:['#8ab4ff','SLOW'], laser:['#ff8a6a','LASER'], bomb:['#ff4a3a','icon'], fire:['#ffb43a','FIRE'], ray:['#d8a0ff','icon']};
/* THE APPROACH's lean: horizontal squeeze toward the centreline, scaled by
   depth. perS(y) is the squeeze at height y (PERSP_TOP at the far wall, 1 at
   the slab). perIn/perOut wrap a draw call in that squeeze — a no-op on
   every other wall. */
function perS(y){
  const t=Math.max(0,Math.min(1,(y-TOP)/(PY-TOP)));
  return PERSP_TOP+(1-PERSP_TOP)*t;
}
function perIn(y){
  if(!feat('persp')) return false;
  const s=perS(y);
  ctx.save(); ctx.translate(W/2,0); ctx.scale(s,1); ctx.translate(-W/2,0);
  return true;
}
function perOut(on){ if(on) ctx.restore(); }
function drawApproachFloor(){
  // runway edges converge exactly onto the physics walls (ball centre 7 / W-7)
  ctx.strokeStyle='rgba(200,170,90,.30)'; ctx.lineWidth=2;
  for(const ex of [7, W-7]){
    ctx.beginPath();
    ctx.moveTo(W/2+(ex-W/2)*perS(TOP), TOP);
    ctx.lineTo(ex, PY+PH); ctx.stroke();
  }
  ctx.strokeStyle='rgba(160,140,120,.10)'; ctx.lineWidth=1;  // cross-ties
  for(let r=0;r<12;r+=2){
    const y=TOP+r*(BH+GAP)+BH/2, s=perS(y);
    ctx.beginPath();
    ctx.moveTo(W/2-(W/2-7)*s, y); ctx.lineTo(W/2+(W/2-7)*s, y); ctx.stroke();
  }
}
/* wall 18: the cooling pool. It is drawn ON the board, not in the HUD, so a
   cold ball near the drain is always a danger the player chose. */
function drawPool(){
  const g=ctx.createLinearGradient(0,POOL_Y0,0,POOL_Y1);
  g.addColorStop(0,'rgba(120,200,255,.30)'); g.addColorStop(1,'rgba(30,90,170,.52)');
  ctx.fillStyle=g; ctx.fillRect(POOL_X0,POOL_Y0,POOL_X1-POOL_X0,POOL_Y1-POOL_Y0);
  ctx.strokeStyle='rgba(150,215,255,.20)'; ctx.lineWidth=1;
  for(let i=0;i<3;i++){
    const y2=POOL_Y0+12+i*12;
    ctx.beginPath(); ctx.moveTo(POOL_X0+5,y2); ctx.lineTo(POOL_X1-5,y2); ctx.stroke();
  }
  ctx.strokeStyle='rgba(190,240,255,.60)'; ctx.lineWidth=1.8;   // the surface
  ctx.beginPath();
  for(let x2=POOL_X0;x2<=POOL_X1;x2+=6){
    const y2=POOL_Y0+Math.sin(x2*0.06+frame*0.05)*1.8;
    if(x2===POOL_X0) ctx.moveTo(x2,y2); else ctx.lineTo(x2,y2);
  }
  ctx.stroke();
  ctx.fillStyle='rgba(150,215,255,.55)'; ctx.font='bold 9px '+FONT; ctx.textAlign='center';
  ctx.fillText('COLD', (POOL_X0+POOL_X1)/2, POOL_Y1-7);
}
/* wall 14: the line the wall is coming for, and the ratchet rails it rides */
function drawDescent(){
  let low=TOP;
  for(const b of bricks) low=Math.max(low, by(b)+BH);
  for(const sk of sinkers) low=Math.max(low, sk.y+BH/2);
  const near=Math.max(0, Math.min(1, 1-(SINK_FLOOR-low)/110));
  ctx.strokeStyle='rgba(140,150,175,.20)'; ctx.lineWidth=6;   // the rails
  for(const rx of [10, W-10]){
    ctx.beginPath(); ctx.moveTo(rx,TOP-14); ctx.lineTo(rx,SINK_FLOOR); ctx.stroke();
  }
  ctx.strokeStyle='rgba(140,150,175,.35)'; ctx.lineWidth=2;   // teeth, riding down
  for(let ty=TOP-14+((sinkY*3)%14); ty<SINK_FLOOR; ty+=14){
    ctx.beginPath(); ctx.moveTo(4,ty); ctx.lineTo(16,ty+4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W-4,ty); ctx.lineTo(W-16,ty+4); ctx.stroke();
  }
  const flash=landT>0? landT/40 : 0;
  const a=(0.22+0.5*near+0.6*flash)*(landT>0||near>0.55? (0.6+0.4*Math.sin(frame*0.25)) : 1);
  ctx.strokeStyle='rgba(255,'+(90-40*near|0)+',70,'+Math.min(1,a).toFixed(2)+')';
  ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.moveTo(0,SINK_FLOOR); ctx.lineTo(W,SINK_FLOOR); ctx.stroke();
  ctx.strokeStyle='rgba(255,120,80,'+Math.min(0.7,a*0.55).toFixed(2)+')'; ctx.lineWidth=1.2;
  for(let hx=-10;hx<W+10;hx+=14){                              // hazard hatching
    ctx.beginPath(); ctx.moveTo(hx,SINK_FLOOR+9); ctx.lineTo(hx+10,SINK_FLOOR); ctx.stroke();
  }
}
function drawSinker(sk){
  const [c1,c2]=TIER_COL[sk.max];
  const wob=Math.sin(frame*0.14+sk.x)*0.16;
  ctx.save(); ctx.translate(sk.x,sk.y); ctx.rotate(wob);
  ctx.fillStyle='rgba(255,210,140,.16)';
  ctx.beginPath(); ctx.ellipse(0,-10,BW*0.42,10,0,0,7); ctx.fill();   // the dust it trails
  const g=ctx.createLinearGradient(0,-BH/2,0,BH/2);
  g.addColorStop(0,c1); g.addColorStop(1,c2);
  ctx.fillStyle=g;
  ctx.beginPath();
  ctx.roundRect? ctx.roundRect(-BW/2,-BH/2,BW,BH,4) : ctx.rect(-BW/2,-BH/2,BW,BH);
  ctx.fill();
  ctx.strokeStyle='rgba(255,240,190,.75)'; ctx.lineWidth=1.6; ctx.stroke();
  ctx.fillStyle='rgba(0,0,0,.35)';                                   // the split it came out of
  ctx.fillRect(-BW/2+4,-1,BW-8,2);
  ctx.restore();
}
function draw(){
  if(edit){ edDraw(); return; }
  if(bgUI){ bgDrawUI(); return; }
  if(helpUI){ drawHelp(); return; }
  if(wallUI){ drawWallMenu(); return; }
  ctx.save();
  if(shake>0) ctx.translate((Math.random()-.5)*shake*1.6,(Math.random()-.5)*shake*1.2);
  if(feat('gloss')) drawStudio();   // the lit set replaces sky AND wallpaper
  else {
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#141824'); bg.addColorStop(1,'#0c0e16');
    ctx.fillStyle=bg; ctx.fillRect(-8,-8,W+16,H+16);
    bgDraw();                    // wallpaper, under everything that matters
  }
  if(feat('egg')) drawClutchGear();
  if(feat('grav')) drawStar();
  if(feat('persp')) drawApproachFloor();
  if(feat('sink')) drawDescent();
  if(feat('temp')) drawPool();
  if(feat('murmur')) drawRoost();
  if(feat('loom')) drawLoom();                   // the lines, under the stone they carry
  if(feat('ceil')) drawCeilSlab();               // the other slab, over the open flanks
  for(const b of bricks){ const on=perIn(by(b)+BH/2); drawBrick(b); perOut(on); }
  if(feat('storm')) drawStorm();
  if(riteBanner){                                // a rite announces itself
    /* mid-air between wall and slab — at 168 it printed straight across the
       masonry courses (probe-rendered before shipping) */
    const a=Math.min(1, riteBanner.t/40);
    ctx.globalAlpha=a; ctx.textAlign='center'; ctx.font='bold 19px '+FONT;
    ctx.fillStyle='#e8c15a';
    ctx.fillText(riteBanner.text, W/2, 252);
    ctx.font='10px '+FONT; ctx.fillStyle='#b8a874';
    ctx.fillText('a rite of the wall', W/2, 268);
    ctx.globalAlpha=1;
  }
  if(feat('life')){                              // the colony census
    const alive=bricks.filter(b=>b.cell).length;
    ctx.textAlign='right'; ctx.font='10px '+FONT;
    ctx.fillStyle= lifeT<10? '#9fe8c8' : '#5a8a78';   // the step pulses the ink
    ctx.fillText('GEN '+lifeGen+'  ·  '+alive+' ALIVE', W-16, TOP-6);
  }
  if(boss && boss.hp>0){
    /* THE WARLORD, no longer a sidewinding box (Scott, 2026-08-18): an iron
       war-barge that hovers, breathes and watches. EVERYTHING here is
       cosmetic — the hitbox is still (x,BOSS_Y,BOSS_W,BOSS_H) and the eye's
       clock is untouched; the bob is ±2px of drawing, not of collision. */
    const x0=boss.x, y0=BOSS_Y, open=boss.eyeT%EYE_CYC<EYE_OPEN;
    const soon=!open && boss.eyeT%EYE_CYC>EYE_CYC-40;      // telegraph: about to open
    const bob=Math.sin(frame*0.055)*2, yb=y0+bob;
    const lean=boss.dir*2.2;                               // he heels into his drift
    /* SCOTT'S ORIGINAL VISION: the boss IS the cthulhu ladder. The current
       stage's face hangs where the war-barge was — hit it and it GLOWS, hurt
       it enough and the next cell takes over (arrival strobe), kill it and
       the wall goes with him. The hitbox is UNTOUCHED — (x, BOSS_Y, BOSS_W,
       BOSS_H), the eye keeps its clock and is drawn on the face so the
       strike-when-open read survives. War-barge below is the load fallback. */
    const fimg= faceImgs && faceImgs[boss.stage] && faceImgs[boss.stage]._ok?
                faceImgs[boss.stage] : null;
    if(fimg){
      const hgt=96+boss.stage*7, wid=fimg.width/fimg.height*hgt;
      const fx=x0+BOSS_W/2, fbot=yb+BOSS_H+8, fcy=fbot-hgt/2;
      const tr= open? Math.sin(frame*0.31)*1.4 : 0;        // lit, he trembles
      if(boss.flash>0 || boss.stageFlash>0){               // the glow around him
        const a=Math.max(boss.flash/10*0.55, boss.stageFlash/26*0.8);
        const g=ctx.createRadialGradient(fx,fcy,10,fx,fcy,hgt*0.95);
        g.addColorStop(0,'rgba(232,193,90,'+a.toFixed(2)+')');
        g.addColorStop(1,'rgba(232,193,90,0)');
        ctx.fillStyle=g; ctx.fillRect(fx-hgt,fcy-hgt,hgt*2,hgt*2);
      }
      ctx.save();
      ctx.globalAlpha= boss.stageFlash>0? 0.55+0.45*Math.abs(Math.sin(frame*0.8)) : 1;
      ctx.drawImage(fimg, fx-wid/2+tr, fbot-hgt, wid, hgt);
      ctx.restore();
      if(boss.stageFlash>0) boss.stageFlash--;
      // THE EYE — same clock, drawn as his one honest light
      const ex=fx, ey=yb+BOSS_H/2;
      ctx.fillStyle= open? '#ffd23f' : soon? '#8a6a2a' : 'rgba(28,34,48,.85)';
      ctx.beginPath(); ctx.ellipse(ex+tr,ey,12,6,0,0,7); ctx.fill();
      ctx.strokeStyle='#0c0920'; ctx.lineWidth=1.5; ctx.stroke();
      if(open){
        let ix=0, iy=0;
        const tgt=balls.find(b=>!b.stuck);
        if(tgt){ const dd=Math.hypot(tgt.x-ex,tgt.y-ey)||1;
          ix=(tgt.x-ex)/dd*5; iy=(tgt.y-ey)/dd*2.2; }
        ctx.fillStyle='#2a1c08'; ctx.beginPath(); ctx.ellipse(ex+tr+ix,ey+iy,3.2,2.8,0,0,7); ctx.fill();
      } else if(soon && (frame>>2)%2){
        ctx.strokeStyle='rgba(255,210,63,.5)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(ex+tr-9,ey); ctx.lineTo(ex+tr+9,ey); ctx.stroke();
      }
      const chg=boss.atkT/ATK_T;                           // the lob still telegraphs
      if(chg>0.6){
        ctx.fillStyle='rgba(255,140,50,'+((chg-0.6)*1.8).toFixed(2)+')';
        ctx.beginPath(); ctx.arc(ex, yb+BOSS_H-3, 3.5+chg*2, 0, 7); ctx.fill();
      }
      for(let i=0;i<BOSS_HP;i++){                          // health, counted in the open
        ctx.fillStyle= i<boss.hp? '#c85a4a' : 'rgba(60,50,60,.5)';
        ctx.fillRect(x0+4+i*(BOSS_W-8)/BOSS_HP, yb-12, (BOSS_W-8)/BOSS_HP-2, 3);
      }
    } else {
    // furnace wash under the hull — his engine, flickering
    const fw=0.5+0.5*Math.sin(frame*0.21)+ (boss.atkT/ATK_T)*0.8;
    const fg=ctx.createRadialGradient(x0+BOSS_W/2, yb+BOSS_H+4, 3, x0+BOSS_W/2, yb+BOSS_H+4, 44);
    fg.addColorStop(0,'rgba(255,150,50,'+(0.16+0.12*fw).toFixed(2)+')');
    fg.addColorStop(1,'rgba(255,90,20,0)');
    ctx.fillStyle=fg; ctx.beginPath(); ctx.ellipse(x0+BOSS_W/2, yb+BOSS_H+4, 44, 14, 0, 0, 7); ctx.fill();
    // the war-banner, trailing his movement, rippling
    const bx0= boss.dir>0? x0+3 : x0+BOSS_W-3;
    ctx.fillStyle='rgba(140,44,40,.9)';
    ctx.beginPath(); ctx.moveTo(bx0, yb+4);
    for(let i=1;i<=4;i++){
      const wx=bx0 - boss.dir*i*9, wy=yb+4+Math.sin(frame*0.2-i*1.1)*(1.5+i*0.8);
      ctx.lineTo(wx, wy);
    }
    for(let i=4;i>=1;i--){
      const wx=bx0 - boss.dir*i*9, wy=yb+11+Math.sin(frame*0.2-i*1.1+0.6)*(1.5+i*0.8);
      ctx.lineTo(wx, wy);
    }
    ctx.closePath(); ctx.fill();
    // hull — leaning, riveted, crenellated along the top
    ctx.save();
    ctx.translate(x0+BOSS_W/2, yb+BOSS_H/2); ctx.rotate(lean*0.012);
    ctx.translate(-(x0+BOSS_W/2), -(yb+BOSS_H/2));
    const hg=ctx.createLinearGradient(0,yb,0,yb+BOSS_H);
    hg.addColorStop(0, boss.flash>0? '#dce6f4':'#4a5468');
    hg.addColorStop(1, boss.flash>0? '#aebdd4':'#262d3c');
    ctx.fillStyle=hg; ctx.fillRect(x0,yb,BOSS_W,BOSS_H);
    ctx.fillStyle= boss.flash>0? '#eef4fc':'#59647a';
    for(let i=0;i<7;i++) ctx.fillRect(x0+2+i*(BOSS_W-4)/7, yb-4, (BOSS_W-4)/7-4, 5);  // battlements
    ctx.strokeStyle='#141824'; ctx.lineWidth=2; ctx.strokeRect(x0+1,yb+1,BOSS_W-2,BOSS_H-2);
    for(let i=1;i<4;i++){ ctx.strokeStyle='rgba(20,24,36,.6)'; ctx.beginPath();
      ctx.moveTo(x0+i*BOSS_W/4,yb+2); ctx.lineTo(x0+i*BOSS_W/4,yb+BOSS_H-2); ctx.stroke(); }
    ctx.fillStyle='rgba(160,175,200,.55)';                 // rivet studs
    for(let i=0;i<8;i++){ ctx.beginPath(); ctx.arc(x0+9+i*(BOSS_W-18)/7, yb+4, 1.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x0+9+i*(BOSS_W-18)/7, yb+BOSS_H-4, 1.3, 0, 7); ctx.fill(); }
    /* battle damage: cracks spread as he weakens */
    const dmg=1-boss.hp/BOSS_HP;
    if(dmg>0.25){ ctx.strokeStyle='rgba(255,140,60,'+(0.3+0.4*dmg).toFixed(2)+')'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(x0+18,yb+3); ctx.lineTo(x0+26,yb+12); ctx.lineTo(x0+21,yb+20); ctx.stroke(); }
    if(dmg>0.55){ ctx.beginPath(); ctx.moveTo(x0+BOSS_W-16,yb+22); ctx.lineTo(x0+BOSS_W-27,yb+13); ctx.lineTo(x0+BOSS_W-20,yb+5); ctx.stroke(); }
    // THE EYE — the lid keeps its clock; the iris HUNTS the nearest ball
    const ex=x0+BOSS_W/2, ey=yb+BOSS_H/2;
    ctx.fillStyle= open? '#ffd23f' : soon? '#8a6a2a' : '#1c2230';
    ctx.beginPath(); ctx.ellipse(ex,ey,14,7,0,0,7); ctx.fill();
    ctx.strokeStyle='#0c0920'; ctx.lineWidth=1.5; ctx.stroke();
    if(open){
      let ix=0, iy=0;
      const tgt=balls.find(b=>!b.stuck);
      if(tgt){ const dd=Math.hypot(tgt.x-ex,tgt.y-ey)||1;
        ix=(tgt.x-ex)/dd*6; iy=(tgt.y-ey)/dd*2.4; }
      ctx.fillStyle='#2a1c08'; ctx.beginPath(); ctx.ellipse(ex+ix,ey+iy,3.4,3.0,0,0,7); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.arc(ex+ix-1,ey+iy-1,0.9,0,7); ctx.fill();
    } else if(soon && (frame>>2)%2){                        // the lid trembles first
      ctx.strokeStyle='rgba(255,210,63,.5)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(ex-10,ey); ctx.lineTo(ex+10,ey); ctx.stroke();
    }
    /* the ember port glows as his next lob charges — a readable countdown */
    const chg=boss.atkT/ATK_T;
    if(chg>0.6){
      ctx.fillStyle='rgba(255,140,50,'+((chg-0.6)*1.8).toFixed(2)+')';
      ctx.beginPath(); ctx.arc(ex, yb+BOSS_H-3, 3.5+chg*2, 0, 7); ctx.fill();
    }
    ctx.restore();
    // lanterns swing on chains beneath, lagging his motion
    for(const side of [-1,1]){
      const lx=x0+BOSS_W/2+side*(BOSS_W/2-14);
      const sw=Math.sin(frame*0.07+side)*0.35 - boss.dir*0.18;
      const cx2=lx+Math.sin(sw)*10, cy2=yb+BOSS_H+Math.cos(sw)*10;
      ctx.strokeStyle='rgba(120,130,150,.7)'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(lx, yb+BOSS_H-2); ctx.lineTo(cx2, cy2); ctx.stroke();
      const lp=0.6+0.4*Math.sin(frame*0.17+side*2);
      ctx.fillStyle='rgba(255,190,80,'+(0.5+0.3*lp).toFixed(2)+')';
      ctx.beginPath(); ctx.arc(cx2, cy2+2, 2.6, 0, 7); ctx.fill();
      ctx.strokeStyle='#3a3244'; ctx.lineWidth=1;
      ctx.strokeRect(cx2-2.6, cy2-1, 5.2, 6);
    }
    // smoke, sighing off the battlements and drifting astern
    ctx.fillStyle='rgba(150,150,165,.14)';
    for(let i=0;i<3;i++){
      const st=(frame*0.8+i*37)%110;
      ctx.beginPath();
      ctx.arc(x0+BOSS_W*0.22+i*BOSS_W*0.28 - boss.dir*st*0.35,
              yb-6-st*0.28, 2+st*0.06, 0, 7);
      ctx.fill();
    }
    // his health, counted in the open
    for(let i=0;i<BOSS_HP;i++){
      ctx.fillStyle= i<boss.hp? '#c85a4a' : 'rgba(60,50,60,.5)';
      ctx.fillRect(x0+4+i*(BOSS_W-8)/BOSS_HP, yb-12, (BOSS_W-8)/BOSS_HP-2, 3);
    }
    }                                          // end war-barge fallback
  }
  for(const e of embers){
    ctx.fillStyle='#ff8a3a'; ctx.beginPath(); ctx.arc(e.x,e.y,4,0,7); ctx.fill();
    ctx.fillStyle='#ffd23f'; ctx.beginPath(); ctx.arc(e.x,e.y-2,1.8,0,7); ctx.fill();
  }
  for(const sk of sinkers) drawSinker(sk);
  for(const dp of drips){                        // lava, on its way down
    const g=ctx.createRadialGradient(dp.x,dp.y,0.5,dp.x,dp.y,10);
    g.addColorStop(0,'rgba(255,240,180,.90)'); g.addColorStop(0.45,'rgba(255,140,40,.60)');
    g.addColorStop(1,'rgba(255,90,20,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(dp.x,dp.y,10,0,7); ctx.fill();
    ctx.fillStyle='rgba(255,120,40,.5)';         // the thread it strings out behind
    ctx.beginPath(); ctx.ellipse(dp.x,dp.y-7,1.4,5.5,0,0,7); ctx.fill();
    ctx.fillStyle='#ffd23f';
    ctx.beginPath(); ctx.ellipse(dp.x,dp.y,2.6,4.6,0,0,7); ctx.fill();
  }
  if(feat('egg')){
    for(const te of teeters) drawTeeter(te);
    for(const tv of travelers){                  // winged eggs in transit
      const wf=(frame>>2)%2? 4:0;
      ctx.fillStyle='rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.ellipse(tv.x-16,tv.y-3-wf,7,3.4,-0.7,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(tv.x+16,tv.y-3-wf,7,3.4,0.7,0,7); ctx.fill();
      const [c1,c2]=TIER_COL[tv.max];
      const g2=ctx.createLinearGradient(0,tv.y-10,0,tv.y+10);
      g2.addColorStop(0,c1); g2.addColorStop(1,c2);
      ctx.fillStyle=g2;
      ctx.beginPath(); ctx.ellipse(tv.x,tv.y,15,9,0,0,7); ctx.fill();
      ctx.strokeStyle='rgba(20,12,8,.5)'; ctx.lineWidth=1.3; ctx.stroke();
    }
  }
  for(const ry of rays){                         // the death ray, fading
    const al=ry.t/26, len=560;
    const grd=ctx.createRadialGradient(ry.x,ry.y,8,ry.x,ry.y,len);
    grd.addColorStop(0,'rgba(240,205,255,'+(0.75*al).toFixed(2)+')');
    grd.addColorStop(0.5,'rgba(200,120,255,'+(0.35*al).toFixed(2)+')');
    grd.addColorStop(1,'rgba(160,60,255,0)');
    ctx.fillStyle=grd;
    ctx.beginPath(); ctx.moveTo(ry.x,ry.y);
    ctx.arc(ry.x,ry.y,len,ry.a-RAY_HALF,ry.a+RAY_HALF); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,'+(0.6*al).toFixed(2)+')'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(ry.x,ry.y);
    ctx.lineTo(ry.x+Math.cos(ry.a)*len, ry.y+Math.sin(ry.a)*len); ctx.stroke();
  }
  if(feat('toll')) drawCoins();                 // coins fall with the pills
  for(const p of pups){
    const on=perIn(p.y);
    ctx.fillStyle=PUP_LOOK[p.type][0];
    ctx.beginPath(); ctx.roundRect? ctx.roundRect(p.x-14,p.y-8,28,16,4):ctx.rect(p.x-14,p.y-8,28,16); ctx.fill();
    /* Scott, 2026-08-19: "the Death Ray pill just shows as ATH". The pill is
       28px and dark ink is invisible off it, so any name longer than ~5
       characters showed only its middle — DEATH RAY read as ATH, DA BOMB as
       A BOM. The long-named pair draw ICONS instead: the ray is its own cone
       in miniature, the bomb is a bomb. Short names keep their letters. */
    if(p.type==='ray'){
      ctx.fillStyle='#10141c';                   // the 35° cone, in miniature
      ctx.beginPath(); ctx.moveTo(p.x,p.y+5);
      ctx.lineTo(p.x-5.5,p.y-5); ctx.lineTo(p.x+5.5,p.y-5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#f4eaff'; ctx.lineWidth=1.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(p.x,p.y+4); ctx.lineTo(p.x,p.y-4.5); ctx.stroke();
      ctx.fillStyle='#f4eaff';
      for(const [dx,dy] of [[-8,-4],[8,-4]]){ ctx.beginPath(); ctx.arc(p.x+dx,p.y+dy,1.1,0,7); ctx.fill(); }
    } else if(p.type==='bomb'){
      ctx.fillStyle='#10141c';                   // the bomb: ball, fuse, spark
      ctx.beginPath(); ctx.arc(p.x-1,p.y+1.5,4.6,0,7); ctx.fill();
      ctx.strokeStyle='#10141c'; ctx.lineWidth=1.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(p.x+1,p.y-2.5); ctx.quadraticCurveTo(p.x+4,p.y-5.5,p.x+7,p.y-4.5); ctx.stroke();
      ctx.fillStyle=(frame>>3)%2? '#fff2b0':'#ffdc6a';
      ctx.beginPath(); ctx.arc(p.x+7.5,p.y-4.5,1.5,0,7); ctx.fill();
    } else {
      ctx.fillStyle='#10141c'; ctx.font='bold 9px '+FONT; ctx.textAlign='center';
      ctx.fillText(PUP_LOOK[p.type][1], p.x, p.y+3);
    }
    perOut(on);
  }
  for(const bo of bolts){
    const on=perIn(bo.y);
    ctx.strokeStyle='#ffd8b0'; ctx.lineWidth=2.4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(bo.x,bo.y+7); ctx.lineTo(bo.x,bo.y-4); ctx.stroke();
    perOut(on);
  }
  // paddle: a stone slab; cannons when lasing; and it LUNGES
  const pw=pad.w, py2=padY();
  ctx.fillStyle='rgba(0,0,0,.28)';               // its own shadow on the rest line,
  ctx.fillRect(pad.x-pw/2+3, PY+PH-1, pw-6, 2);  // so the lunge reads as height
  if(bumpRising()){                              // the drive, mid-swing
    const gl=ctx.createLinearGradient(0, py2-14,0, py2+PH);
    gl.addColorStop(0,'rgba(170,225,255,0)'); gl.addColorStop(1,'rgba(170,225,255,.45)');
    ctx.fillStyle=gl; ctx.fillRect(pad.x-pw/2, py2-14, pw, 14+PH);
  }
  const pg=ctx.createLinearGradient(0, py2,0, py2+PH);
  const up2=bumpRising();
  if(feat('gloss')){               // the slab is moulded from the same tool
    pg.addColorStop(0, up2? '#ffffff':'#f2f6fc');
    pg.addColorStop(0.45, up2? '#bcd6f0':'#94a2ba');
    pg.addColorStop(1, up2? '#5c7a92':'#454f66');
  } else {
  pg.addColorStop(0, up2? '#eaf4ff':'#b8b0a0'); pg.addColorStop(1, up2? '#7d8ea6':'#6e6656');
  }
  ctx.fillStyle=pg;
  ctx.beginPath(); ctx.roundRect? ctx.roundRect(pad.x-pw/2, py2,pw,PH,5):ctx.rect(pad.x-pw/2, py2,pw,PH); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.25)'; ctx.fillRect(pad.x-pw/2+3, py2+1.5,pw-6,2);
  if(bumpT<=0 && bumpCD>0){                      // charge still coming back
    ctx.fillStyle='rgba(120,132,155,.55)';
    ctx.fillRect(pad.x-pw/2+3, py2+PH-2.5, (pw-6)*(1-bumpCD/BUMP_CD), 2);
  }
  if(tl>0){ ctx.fillStyle='#ff8a6a'; ctx.fillRect(pad.x-pw/2+3, py2-4,5,5); ctx.fillRect(pad.x+pw/2-8, py2-4,5,5); }
  for(const bl of balls){ const on=perIn(bl.y); drawBall(bl); perOut(on); }
  for(const bo of bores){                       // drill heads, mid-bore
    const hx=LEFT+bo.c*(BW+GAP)+BW/2, hy=TOP+bo.r*(BH+GAP)+BH/2;
    const on=perIn(hy);
    const g=ctx.createRadialGradient(hx,hy,0.5,hx,hy,10);
    g.addColorStop(0,'#fff0b0'); g.addColorStop(1,'rgba(255,180,80,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(hx,hy,10,0,7); ctx.fill();
    perOut(on);
  }
  for(const q of parts){
    const on=perIn(q.y);
    ctx.globalAlpha=Math.min(1,q.life/14); ctx.fillStyle=q.col;
    ctx.fillRect(q.x-1.5,q.y-1.5,3,3); ctx.globalAlpha=1;
    perOut(on);
  }
  drawHUD();
  ctx.restore();
}
function drawBall(bl){
    /* ZINGED — drawn UNDER everything else the ball might also be, so spin
       composes with fire, cold, the bolide and the bomb instead of replacing
       them. Two marks: a banked arc on the side the ball is curving TOWARDS,
       and a spinning tick on the ball itself. You need to be able to see which
       way it will bend without doing the arithmetic. */
    if(bl.zing){
      const k=Math.min(1,Math.abs(bl.zing)/ZING_MAX);
      const warm=bl.zing>0;
      const a=Math.atan2(bl.vy,bl.vx);
      const side=a+(warm? Math.PI/2 : -Math.PI/2);
      ctx.strokeStyle=(warm? 'rgba(255,176,58,':'rgba(58,208,255,')+(0.45*k).toFixed(2)+')';
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.arc(bl.x+Math.cos(side)*9, bl.y+Math.sin(side)*9, 8+4*k,
              a-1.1, a+1.1, !warm);
      ctx.stroke();
      ctx.strokeStyle=(warm? 'rgba(255,224,168,':'rgba(205,241,255,')+(0.9*k).toFixed(2)+')';
      ctx.lineWidth=1.6;
      const t=bl.spinA||0;
      ctx.beginPath();
      ctx.moveTo(bl.x+Math.cos(t)*1.5, bl.y+Math.sin(t)*1.5);
      ctx.lineTo(bl.x+Math.cos(t)*(BALL_R+1.5), bl.y+Math.sin(t)*(BALL_R+1.5));
      ctx.stroke();
    }
    if(bl.spike>0){                             // the drive still in it — drawn UNDER
      const a=Math.atan2(bl.vy,bl.vx)+Math.PI;  // whatever else the ball is, so it
      const k=Math.min(1,bl.spike/SPIKE_T);     // composes with fire, cold and bombs
      for(let i=1;i<=4;i++){
        ctx.fillStyle='rgba(185,228,255,'+(0.36*k/i).toFixed(2)+')';
        ctx.beginPath();
        ctx.arc(bl.x+Math.cos(a)*i*5, bl.y+Math.sin(a)*i*5, Math.max(0.6,BALL_R-i*0.7), 0, 7);
        ctx.fill();
      }
    }
    if(bombArmed){                              // the ball IS the bomb now
      const p=0.5+0.5*Math.sin(frame*0.35);
      const g=ctx.createRadialGradient(bl.x,bl.y,0.5,bl.x,bl.y,BALL_R+6+p*3);
      g.addColorStop(0,'#fff0c0'); g.addColorStop(0.4,'#ff8a3a'); g.addColorStop(1,'rgba(255,80,40,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(bl.x,bl.y,BALL_R+6+p*3,0,7); ctx.fill();
      ctx.fillStyle= p>0.5? '#ff5a3a':'#2c1c18';
      ctx.beginPath(); ctx.arc(bl.x,bl.y,BALL_R,0,7); ctx.fill();
      return;
    }
    if(tb>0){                                   // the BOLIDE: bigger, yellow, on fire
      const p=0.5+0.5*Math.sin(frame*0.5);
      const fg=ctx.createRadialGradient(bl.x,bl.y,1,bl.x,bl.y,BALL_R+11+p*3);
      fg.addColorStop(0,'#fffbe0'); fg.addColorStop(0.35,'#ffd23f');
      fg.addColorStop(0.7,'rgba(255,120,40,.55)'); fg.addColorStop(1,'rgba(255,90,20,0)');
      ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(bl.x,bl.y,BALL_R+11+p*3,0,7); ctx.fill();
      // licks of flame trailing the motion
      const ang=Math.atan2(bl.vy,bl.vx)+Math.PI;
      for(let i=0;i<3;i++){
        const a2=ang+(i-1)*0.5+Math.sin(frame*0.7+i)*0.2, d2=BALL_R+6+((frame*3+i*7)%8);
        ctx.fillStyle=i===1?'#ffd23f':'rgba(255,140,50,.8)';
        ctx.beginPath(); ctx.arc(bl.x+Math.cos(a2)*d2, bl.y+Math.sin(a2)*d2, 2.6-i*0.5, 0, 7); ctx.fill();
      }
      ctx.fillStyle='#ffe66e'; ctx.beginPath(); ctx.arc(bl.x,bl.y,BALL_R+2.5,0,7); ctx.fill();
      ctx.fillStyle='#fff8d0'; ctx.beginPath(); ctx.arc(bl.x-1.5,bl.y-1.5,BALL_R-1,0,7); ctx.fill();
      return;
    }
    /* THE COOLING HOUSE: the ball's colour IS the thermometer — blue and slow,
       white and honest, orange and fast. A ball that fell through a lava drip
       on THE GRANITE reads as fully hot for as long as the heat lasts. */
    if(bl.hot>0 || feat('temp')){
      const t=bl.hot>0? 1 : Math.max(0,Math.min(1,
                bl.temp===undefined? TEMP_START : bl.temp));
      const col='rgb('+Math.round(110+145*t)+','
                     +Math.round(210-70*Math.abs(t-0.5)*2)+','
                     +Math.round(255-195*t)+')';
      const hg=ctx.createRadialGradient(bl.x,bl.y,0.5,bl.x,bl.y,BALL_R+5+t*4);
      hg.addColorStop(0, t>0.5? 'rgba(255,244,200,.95)':'rgba(226,246,255,.95)');
      hg.addColorStop(0.45, col); hg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(bl.x,bl.y,BALL_R+5+t*4,0,7); ctx.fill();
      ctx.fillStyle=col; ctx.beginPath(); ctx.arc(bl.x,bl.y,BALL_R,0,7); ctx.fill();
      ctx.fillStyle= t>0.5? 'rgba(255,255,230,.85)':'rgba(240,252,255,.85)';
      ctx.beginPath(); ctx.arc(bl.x-1.5,bl.y-1.5,BALL_R-2,0,7); ctx.fill();
      return;
    }
    if(feat('gloss')){
      /* a chrome bearing on a lit sweep: body gradient, a hot clipped
         specular up-left, and a RIM of bounce light on the lower-right —
         the rim is the tell that makes a circle read as a sphere */
      ctx.fillStyle='rgba(44,52,68,.22)';
      ctx.beginPath(); ctx.ellipse(bl.x+2,bl.y+4,BALL_R*0.95,BALL_R*0.5,0,0,7); ctx.fill();
      const bg2=ctx.createRadialGradient(bl.x-2,bl.y-2.4,0.4,bl.x,bl.y,BALL_R);
      bg2.addColorStop(0,'#ffffff'); bg2.addColorStop(0.42,'#cfd9e8');
      bg2.addColorStop(0.82,'#7e8ca4'); bg2.addColorStop(1,'#38415a');
      ctx.fillStyle=bg2; ctx.beginPath(); ctx.arc(bl.x,bl.y,BALL_R,0,7); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.lineWidth=1.1;
      ctx.beginPath(); ctx.arc(bl.x,bl.y,BALL_R-0.6,0.35,2.0); ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.95)';
      ctx.beginPath(); ctx.ellipse(bl.x-1.7,bl.y-2.1,1.7,1.2,-0.6,0,7); ctx.fill();
      return;
    }
    const g=ctx.createRadialGradient(bl.x-1.5,bl.y-1.5,0.5,bl.x,bl.y,BALL_R+3);
    g.addColorStop(0,'#ffffff'); g.addColorStop(0.5,'#d8e8ff'); g.addColorStop(1,'rgba(150,190,255,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(bl.x,bl.y,BALL_R+3,0,7); ctx.fill();
    ctx.fillStyle='#eef4ff'; ctx.beginPath(); ctx.arc(bl.x,bl.y,BALL_R,0,7); ctx.fill();
}
/* the controls, on demand. One row per thing, so adding the next mechanic
   costs a row here instead of ten more pixels of a line that already collides. */
const HELP=[
  ['LEFT / RIGHT', 'move the slab'],
  ['UP',           'bump it — hit the ball on the RISE for a DRIVE'],
  ['SPACE',        'launch, and fire a pocket shot'],
  ['1 - 9',        'jump to a wall'],
  ['A - N',        'jump to the walls past nine (M is MUTE — use the menu)'],
  ['W',            'the wall menu — every wall, by name'],
  ['Y',            'wallpaper for this wall'],
  ['Z',            'the wall builder'],
  ['?',            'this page'],
  ['ESC',          'leave the game']
];
function drawHelp(){
  ctx.fillStyle='rgba(6,8,13,.93)'; ctx.fillRect(0,0,W,H);
  ctx.textAlign='center'; ctx.font='bold 16px '+FONT; ctx.fillStyle='#e8c15a';
  ctx.fillText('STONEBREAKER', W/2, 46);
  ctx.font='11px '+FONT; ctx.fillStyle='#8a94a4';
  ctx.fillText('The slab is stone. Where the ball meets it decides the angle.', W/2, 68);
  ctx.textAlign='left';
  for(let i=0;i<HELP.length;i++){
    const y=108+i*26;
    ctx.font='bold 12px '+FONT; ctx.fillStyle='#ffe9a0';
    ctx.textAlign='right'; ctx.fillText(HELP[i][0], 210, y);
    ctx.textAlign='left';  ctx.font='12px '+FONT; ctx.fillStyle='#b9c2cf';
    ctx.fillText(HELP[i][1], 230, y);
  }
  ctx.textAlign='center'; ctx.font='10px '+FONT; ctx.fillStyle='#707a88';
  ctx.fillText('? or ESC to go back', W/2, H-22);
  ctx.textAlign='left';
}
function drawHUD(){
  ctx.fillStyle='rgba(10,12,20,.9)'; ctx.fillRect(-8,-8,W+16,46);
  ctx.fillStyle='rgba(200,170,90,.4)'; ctx.fillRect(0,44,W,2);
  ctx.textAlign='center'; ctx.font='bold 15px '+FONT; ctx.fillStyle='#e8c15a';
  ctx.fillText('STONEBREAKER', W/2, 20);
  /* THE BAR IS FOR STATE, NOT FOR A KEYBOARD MANUAL (Scott, 2026-08-17:
     "simplify instructions at top of stonebreaker game, they are starting to
     overlap text"). The old line was ~100 characters centred on W/2, so it ran
     from x45 to x595 and straight through WALL n/n and the shot pips on the
     left and the powerup timers on the right. Every new mechanic made it
     longer — it was going to overlap eventually and then keep getting worse.
     So the controls moved to a page you can call up, and what is left here is
     six characters that cannot collide with anything. */
  ctx.font='11px '+FONT; ctx.fillStyle='#9a8f7a';
  ctx.fillText('W walls · ? keys', W/2, 36);
  ctx.textAlign='left'; ctx.font='bold 13px '+FONT; ctx.fillStyle='#7fe7ff';
  ctx.fillText('SCORE '+score, 14, 20);
  ctx.fillStyle='#9aa4c0'; ctx.font='11px '+FONT;
  const wn=Math.min(level,LEVELS.length-1);
  /* the wall's NAME rides beside its number (Scott, 2026-08-24: "on
     stonebreaker screens include wall name"). A custom wall has no name in
     the table, so it says what it is instead of printing a wrong one. */
  const wnm = level<0? 'YOUR WALL' : (WALL_NAMES[wn]||'');
  ctx.fillText('WALL '+(wn+1)+'/'+LEVELS.length+(wnm? '  ·  '+wnm : ''), 14, 36);
  if(feat('toll')){                            // what you are holding, and can spend
    ctx.font='bold 12px '+FONT; ctx.fillStyle='#e8c15a';
    ctx.fillText('PURSE '+purse, 150, 20);
  }
  // pocket-shot pips
  for(let i=0;i<SHOTS;i++){
    const bx2=88+i*11;
    ctx.strokeStyle= i<shots? '#ffd8b0' : '#3a3648';
    ctx.lineWidth=2.2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(bx2,37); ctx.lineTo(bx2,28); ctx.stroke();
    ctx.fillStyle= i<shots? '#ffd8b0' : '#3a3648';
    ctx.beginPath(); ctx.moveTo(bx2-2.4,29.5); ctx.lineTo(bx2,25); ctx.lineTo(bx2+2.4,29.5);
    ctx.closePath(); ctx.fill();
  }
  ctx.textAlign='right';
  for(let i=0;i<10;i++){ ctx.fillStyle= i<lives? '#ff5a5a':'#3a2c30'; ctx.beginPath(); ctx.arc(W-16-i*15,16,5,0,7); ctx.fill(); }
  if(bombArmed && (frame>>3)%2){
    ctx.textAlign='center'; ctx.font='bold 11px '+FONT; ctx.fillStyle='#ff5a3a';
    ctx.fillText('DA BOMB ARMED', W/2, 46+10);
  }
  const act=[]; if(tw>0)act.push(['WIDE',tw,WIDE_T,'#7fdbc8']); if(ts>0)act.push(['SLOW',ts,SLOW_T,'#8ab4ff']); if(tl>0)act.push(['LASER',tl,LASER_T,'#ff8a6a']); if(tb>0)act.push(['BOLIDE',tb,BOLIDE_T,'#ffd23f']);
  let ax=W-14;
  ctx.font='bold 9px '+FONT;
  for(const [nm,t0,tmax,col] of act){
    ctx.fillStyle=col; ctx.fillText(nm, ax, 36);
    ctx.fillStyle='rgba(255,255,255,.15)'; ctx.fillRect(ax-34,38,34,3);
    ctx.fillStyle=col; ctx.fillRect(ax-34,38,34*(t0/tmax),3);
    ax-=48;
  }

  if(thumpT>0) drawThump();
  if(faceT>0) drawFace();
  if(loreT>0) drawLore();
  if(ended){
    ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(-8,-8,W+16,H+16);
    ctx.textAlign='center'; ctx.font='bold 26px '+FONT;
    ctx.fillStyle= ended==='win'? '#ffd23e':'#ff8a8a';
    ctx.fillText(ended==='win'? 'THE WALL IS DOWN':'THE WALL STANDS', W/2, H/2-14);
    ctx.font='13px '+FONT; ctx.fillStyle='#d8d2c4';
    ctx.fillText('SCORE '+score+' · SPACE to leave', W/2, H/2+14);
  }
}
/* an iron plate, three rivets a side, one line. Fades up fast, holds, goes —
   a flash, not a dialog: nothing to dismiss and nothing to wait on. */
function drawThump(){
  const e=THUMP_T-thumpT;
  const a= e<THUMP_IN? e/THUMP_IN : (thumpT<THUMP_OUT? thumpT/THUMP_OUT : 1);
  /* lifted clear of the vault (probe-rendered first: centred, its bottom edge
     printed straight across the top course of driven stone, hiding the exact
     iron it is telling you to hit) */
  const cw=392, ch=94, x=(W-cw)/2, y=H/2-ch/2-42;
  ctx.save();
  ctx.globalAlpha=a;
  ctx.fillStyle='rgba(6,8,12,.62)'; ctx.fillRect(-8,-8,W+16,H+16);   // the room dims
  ctx.translate(0,(1-a)*7);                                          // and it settles in
  ctx.fillStyle='rgba(0,0,0,.5)';
  ctx.beginPath(); ctx.roundRect? ctx.roundRect(x+3,y+5,cw,ch,4):ctx.rect(x+3,y+5,cw,ch); ctx.fill();
  const g=ctx.createLinearGradient(0,y,0,y+ch);                      // the stone body
  g.addColorStop(0,'#8e8578'); g.addColorStop(1,'#584f44');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.roundRect? ctx.roundRect(x,y,cw,ch,4):ctx.rect(x,y,cw,ch); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.45)'; ctx.lineWidth=1; ctx.stroke();
  const ig=ctx.createLinearGradient(0,y+6,0,y+ch-6);                 // the cap it is named for
  ig.addColorStop(0,'#6e7a90'); ig.addColorStop(1,'#2e3646');
  ctx.fillStyle=ig; ctx.fillRect(x+5,y+6,cw-10,ch-12);
  ctx.fillStyle='#95a2b8';                                           // rivets
  for(const rx of [x+17, x+cw/2, x+cw-17])
    for(const ry of [y+15, y+ch-15]){ ctx.beginPath(); ctx.arc(rx,ry,2.2,0,7); ctx.fill(); }
  ctx.textAlign='center';
  /* the plate is a fixed size and the lines are not, so the TYPE gives way and
     never the plate — a card that resized per wall would read as four cards */
  let fs=27; ctx.font='bold '+fs+'px '+FONT;
  while(fs>14 && ctx.measureText(thumpMsg).width>cw-46){ fs--; ctx.font='bold '+fs+'px '+FONT; }
  ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillText(thumpMsg, W/2, y+ch/2+11);
  ctx.fillStyle='#e8f2ff';         ctx.fillText(thumpMsg, W/2, y+ch/2+9);
  ctx.restore();
}
/* the lore beat: dark, one fragment of the stone's story, gone. If Scott's
   art for this wall exists (images/lore/lore-<n>.png) it hangs above the
   words in a stone frame; the beat never waits on it. */
function drawLore(){
  const aIn=Math.min(1,(LORE_T-loreT)/22), aOut=Math.min(1,loreT/30);
  const a=Math.min(aIn,aOut);
  ctx.fillStyle='rgba(6,7,10,'+(0.86*a).toFixed(2)+')';
  ctx.fillRect(-8,-8,W+16,H+16);
  ctx.globalAlpha=a;
  const im=loreImgs[loreWall];
  ctx.textAlign='center';
  if(im && im.width){
    /* THE PAINTING REPLACES THE WORDS (Scott, 2026-08-20: "I should make some
       art for stonebreaker interstitials to replace the text... textless
       graphic ideas to mirror the mystery"). Full-bleed and cover-fit, exactly
       like the title paintings — no frame, no sentence, nothing competing with
       it. The line for this wall is still written and still the FALLBACK, so
       any wall without art reads as it did before and he can paint any subset
       in any order. */
    const sc=Math.max(W/im.width, H/im.height);
    const dw=im.width*sc, dh=im.height*sc;
    ctx.drawImage(im,(W-dw)/2,(H-dh)/2,dw,dh);
    ctx.fillStyle='rgba(6,7,10,.34)';               // a breath of scrim for the two labels
    ctx.fillRect(0,H-26,W,26);
    ctx.font='10px '+FONT; ctx.fillStyle='rgba(226,216,188,.62)';
    ctx.textAlign='left';  ctx.fillText('· WALL '+loreWall+' ·', 14, H-10);
    if(loreT<LORE_T-40){
      ctx.textAlign='right'; ctx.fillStyle='rgba(226,216,188,.45)';
      ctx.fillText('SPACE', W-14, H-10);
    }
    ctx.globalAlpha=1;
    return;
  }
  const ty=H/2;
  ctx.font='10px '+FONT; ctx.fillStyle='#8a8474';
  ctx.fillText('· WALL '+loreWall+' ·', W/2, ty-26);
  ctx.font='15px '+FONT; ctx.fillStyle='#e2d8bc';   // roman, not italic: a note, not a poem
  ctx.fillText(LORE[(loreWall-1)%LORE.length], W/2, ty);
  if(loreT<LORE_T-40){
    ctx.font='10px '+FONT; ctx.fillStyle='#6f6a5c';
    ctx.fillText('SPACE', W/2, ty+30);
  }
  ctx.globalAlpha=1;
}
/* THE OTHER FACE, drawn. Timeline (elapsed e of FACE_T=430):
   0-70 rise from the rubble · 70-160 it looks at you · 160-218 the eyes burn
   (threat) · 218-312 the color drains · 312-360 it is stone · 360 FLASH —
   and to 430 the shards hang, spreading, fading. Then the win screen. */
function drawFace(){
  const e=FACE_T-faceT;
  ctx.fillStyle='rgba(5,7,12,'+(0.68*Math.min(1,e/60)).toFixed(2)+')';   // the board dims
  ctx.fillRect(-8,-8,W+16,H+16);
  const idx= e<160?0 : e<218?1 : e<312?2 : e<360?3 : 4;
  const rise=Math.min(1,e/70), ez=1-Math.pow(1-rise,3);
  const cy=H*0.46 + (1-ez)*120;
  let alpha= e<30? e/30 : 1;
  if(e>=364) alpha=Math.max(0,1-(e-364)/62);
  const aur= e<160? 0.14*ez : e<218? 0.32 : e<312? 0.16 : e<360? 0.05 : 0;
  if(aur>0){                                                             // amber aura
    const g=ctx.createRadialGradient(W/2,cy,20,W/2,cy,210);
    g.addColorStop(0,'rgba(232,193,90,'+aur.toFixed(2)+')');
    g.addColorStop(1,'rgba(232,193,90,0)');
    ctx.fillStyle=g; ctx.fillRect(W/2-220,cy-220,440,440);
  }
  const im=faceImgs && faceImgs[idx] && faceImgs[idx]._ok? faceImgs[idx] : null;
  const grow= e>=360? 1+(e-360)/130 : 1;                                 // the burst spreads
  const tr= (e>=160&&e<360)? Math.sin(frame*0.31)*1.2 : 0;               // it trembles, lit
  ctx.save(); ctx.globalAlpha=alpha;
  if(im){
    const hgt=300*grow, wid=im.width/im.height*hgt;
    ctx.drawImage(im, W/2-wid/2+tr, cy-hgt/2, wid, hgt);
  } else {
    /* fallback silhouette — the WIN never waits on art */
    ctx.fillStyle= idx>=3? '#b8b2a6':'#1c2836';
    ctx.beginPath(); ctx.ellipse(W/2+tr,cy-40,95*grow,110*grow,0,0,7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W/2+tr,cy+70,80*grow,75*grow,0,0,7); ctx.fill();
    if(idx<3){
      ctx.fillStyle= idx===1? '#ffd76e':'#c89b3c';
      ctx.beginPath(); ctx.ellipse(W/2-32+tr,cy-55,13,9,0,0,7); ctx.ellipse(W/2+32+tr,cy-55,13,9,0,0,7); ctx.fill();
    }
  }
  ctx.restore(); ctx.globalAlpha=1;
  if(e>=356&&e<365){                                                     // the petrify-break flash
    ctx.globalAlpha=(1-Math.abs(e-360)/5)*0.85;
    ctx.fillStyle='#fff'; ctx.fillRect(-8,-8,W+16,H+16);
    ctx.globalAlpha=1;
  }
}

/* ================= THE WALL BUILDER =================================
   Scott, 2026-08-17: "make a wall builder in stonebreaker - palette of bricks
   to choose from, and if possible teeters, black hole, granite-to-lava etc
   (not sure how much of that stuff is coded per screen instead of pluggable
   into a wall) - ability to save/load, universally on server, and name the
   custom walls."

   It was ALL coded per screen. See the FEATS block above for what that cost
   and what replaced it. What is left here is the tool.

   Grid is authored exactly the way the built-in walls are — 15 columns, of
   which 0 and 14 are the dead margin the loader clamps off — so a wall drawn
   here is the same kind of object as a wall written in LEVELS, and could be
   pasted into the source verbatim. That is deliberate: two formats would rot.

   PRESS Z FROM ANY WALL. */
const ED_COLS=15, ED_RMIN=4, ED_RMAX=16, ED_R0=10;
const BRUSH=[
  {ch:'.', n:'ERASE',        d:'empty air'},
  {ch:'1', n:'BRICK',        d:'one hit'},
  {ch:'2', n:'BRICK II',     d:'two hits'},
  {ch:'3', n:'BRICK III',    d:'three hits'},
  {ch:'#', n:'STEEL',        d:'never breaks'},
  {ch:'T', n:'TUNNEL',       d:'one hit, opens a lane'},
  {ch:'K', n:'KEG',          d:'goes up, takes neighbours'},
  {ch:'O', n:'BUMPER',       d:'unbreakable, kicks hard'},
  {ch:'S', n:'SLINGSHOT',    d:'a bumper you can read'},
  {ch:'G', n:'EGG',          d:'hatches if you leave it'},
  {ch:'D', n:'DRIVEN STONE', d:'only a paddle bump cracks it'},
  {ch:'A', n:'GRANITE',      d:'melts to lava, never breaks'},
  {ch:'g', n:'GREENWOOD',    d:'grows back on you'},
  {ch:'b', n:'BRITTLE',      d:'answers to ball temperature'},
  {ch:'@', n:'ZING ROTOR',   d:'spins the ball; it curves and its bounces skew'},
  {ch:'^', n:'TEETER',       d:'a bistable pivot'},
  {ch:'*', n:'BLACK HOLE',   d:'pulls every ball; turns the well on'}
];
const ED_COL={'.':'#20242c','1':'#e0b062','2':'#d08a4a','3':'#b06a3a','#':'#8a93a2',
  'T':'#6ec0d8','K':'#e05a3a','O':'#c060d0','S':'#e050a0','G':'#d8d0a0','D':'#9a8a70',
  'A':'#c89058','g':'#4f9a52','b':'#cfe6f2','^':'#7fa85a','*':'#8a6ad0','@':'#e8a13c'};
let edit=null, edLatch={};

function edBlank(){
  const rows=[];
  for(let r=0;r<ED_R0;r++) rows.push('.'.repeat(ED_COLS));
  return rows;
}
function openBuilder(){
  edit={ rows: customWall? customWall.rows.slice() : edBlank(),
         c:7, r:2, brush:1, feats:new Set(customWall? customWall.feats:[]),
         name: customWall? customWall.name : '', id: customWall? customWall.id : null,
         ui:'grid', msg:'Draw a wall. SPACE paints, [ ] pick a brick, T tests it.',
         list:null, sel:0, busy:false };
}
function edSet(r,c,ch){
  const row=edit.rows[r];
  edit.rows[r]=row.slice(0,c)+ch+row.slice(c+1);
}
/* a wall with nothing breakable on it can never be finished, and a wall with
   nothing at all on it is not a wall. Both are refused at the door rather than
   discovered three minutes into a playtest. */
function edProblem(){
  let solid=0, breakable=0;
  for(const row of edit.rows) for(let c=1;c<ED_COLS-1;c++){
    const ch=row[c];
    if(ch==='.') continue;
    solid++;
    if(ch!=='#' && ch!=='O' && ch!=='S' && ch!=='^' && ch!=='*' && ch!=='@') breakable++;
  }
  if(!solid) return 'Nothing drawn yet.';
  if(!breakable) return 'Nothing on this wall can be broken — it could never be cleared.';
  return null;
}
function edToWall(){
  return {id:edit.id, name:edit.name||'UNTITLED', rows:edit.rows.slice(),
          feats:[...edit.feats]};
}
function edTest(){
  const p=edProblem();
  if(p){ edit.msg=p; return; }
  customWall=edToWall();
  edit=null;
  lives=10; score=0; broken=0; ended=''; level=-1;
  loadLevel(-1);
}

/* ---------------- the server store ----------------
   One endpoint, /archive/walls.php, same host and pattern as the archive
   engine. Everything is best-effort: if the network is down the builder still
   works, you just cannot share. */
const WALLS_URL='/archive/walls.php';
function edSave(){
  const p=edProblem();
  if(p){ edit.msg=p; return; }
  if(!edit.name){ edName(); if(!edit.name) return; }
  edit.busy=true; edit.msg='Saving...';
  fetch(WALLS_URL, {method:'POST', headers:{'Content-Type':'application/json'},
                    body:JSON.stringify(edToWall())})
    .then(r=>r.json())
    .then(j=>{ edit.busy=false;
      if(j&&j.ok){ edit.id=j.id; edit.msg='Saved as "'+edit.name+'". Anyone can load it.'; }
      else edit.msg='Server refused it: '+((j&&j.error)||'unknown'); })
    .catch(e=>{ edit.busy=false; edit.msg='No connection to the server ('+e.message+').'; });
}
function edBrowse(){
  edit.ui='browse'; edit.busy=true; edit.list=null; edit.sel=0;
  edit.msg='Fetching the shelf...';
  fetch(WALLS_URL+'?list=1').then(r=>r.json())
    .then(j=>{ edit.busy=false;
      edit.list=(j&&j.walls)||[];
      edit.msg=edit.list.length? 'ENTER loads, ESC goes back.' : 'Nothing saved yet — be first.'; })
    .catch(e=>{ edit.busy=false; edit.list=[]; edit.msg='No connection ('+e.message+').'; });
}
function edLoad(id){
  edit.busy=true; edit.msg='Loading...';
  fetch(WALLS_URL+'?get='+encodeURIComponent(id)).then(r=>r.json())
    .then(j=>{ edit.busy=false;
      if(j&&j.ok&&j.wall){
        edit.rows=j.wall.rows.slice(); edit.feats=new Set(j.wall.feats||[]);
        edit.name=j.wall.name; edit.id=j.wall.id; edit.ui='grid';
        edit.msg='Loaded "'+edit.name+'".';
      } else edit.msg='Could not load that one.'; })
    .catch(e=>{ edit.busy=false; edit.msg='No connection ('+e.message+').'; });
}
function edName(){
  const v=window.prompt('Name this wall (up to 40 characters):', edit.name||'');
  if(v===null) return;
  edit.name=v.replace(/[<>]/g,'').trim().slice(0,40);
  edit.msg=edit.name? 'Named "'+edit.name+'".' : 'A wall needs a name before it can be saved.';
}

/* ---------------- THE BUILDER, BY MOUSE (Scott, 2026-08-17) ----------------
   "make the wall builder work with mouse including click drag to fill in
   multiple cells with the selected component quickly and easily, and make it
   easier to switch between brick laying, choosing brick type etc — right click
   menu too, to make it even easier - clear a cell, and other convenient
   shortcuts(?)"

   Every hit region is DERIVED from the same constants the drawing uses, and
   nothing here measures anything twice. A layout number that exists in two
   places is a bug with a delay on it: the day someone nudges the grid, the
   clicks land one row off and it looks like a mouse problem.

   Right button does double duty the way paint tools have always done it: drag
   it to erase, click it (no movement) for the menu. The distinction is
   decided on mouse-UP by whether the pointer ever changed cell. */
const ED_GX=20, ED_GY=44, ED_CW=26, ED_CH=18;
const ED_PX=ED_GX+ED_COLS*ED_CW+18, ED_PY=62, ED_PH=17;
const ED_BW=62, ED_BG=4, ED_BTNY=H-46, ED_BTNH=18;
const ED_BTN=[['TEST','t'],['NAME','n'],['SAVE','s'],['LOAD','l'],
              ['BEHAVE','f'],['CLEAR','c'],['+ROW','+'],['-ROW','-'],['EXIT','x']];
const ED_MENU=[
  {k:'pick',   t:'Pick this brick'},
  {k:'clear',  t:'Clear this cell'},
  {k:'fillr',  t:'Fill this row'},
  {k:'clrr',   t:'Clear this row'},
  {k:'fillc',  t:'Fill this column'},
  {k:'clrc',   t:'Clear this column'},
  {k:'mirror', t:'Mirror left onto right'},
  {k:'all',    t:'Clear everything'}
];
const ED_MW=150, ED_MH=17;

function edCellAt(x,y){
  const c=Math.floor((x-ED_GX)/ED_CW), r=Math.floor((y-ED_GY)/ED_CH);
  if(c<1||c>ED_COLS-2||r<0||r>=edit.rows.length) return null;   // margin is not paintable
  return {c,r};
}
function edPalAt(x,y){
  if(x<ED_PX-5 || x>W-6) return -1;
  const i=Math.floor((y-ED_PY+3)/ED_PH);
  return (i>=0 && i<BRUSH.length)? i : -1;
}
function edBtnAt(x,y){
  if(y<ED_BTNY || y>ED_BTNY+ED_BTNH) return -1;
  const i=Math.floor((x-ED_GX)/(ED_BW+ED_BG));
  if(i<0||i>=ED_BTN.length) return -1;
  return (x-ED_GX-i*(ED_BW+ED_BG) <= ED_BW)? i : -1;
}
function edMenuAt(x,y){
  const m=edit.menu; if(!m) return -1;
  if(x<m.x || x>m.x+ED_MW) return -1;
  const i=Math.floor((y-m.y)/ED_MH);
  return (i>=0 && i<ED_MENU.length)? i : -1;
}
function edFeatAt(x,y){
  const i=Math.floor((y-94+13)/22);
  return (i>=0 && i<FEAT_LIST.length && x>16 && x<W-16)? i : -1;
}
function edListAt(x,y){
  if(!edit.list) return -1;
  const i=Math.floor((y-82+13)/20);
  return (i>=0 && i<edit.list.length && x>16 && x<W-16)? i : -1;
}

function edDoBtn(act){
  if(act==='t') edTest();
  else if(act==='n') edName();
  else if(act==='s') edSave();
  else if(act==='l') edBrowse();
  else if(act==='f'){ edit.ui='feats'; edit.sel=0; edit.msg='Click to toggle. These change how the whole wall behaves.'; }
  else if(act==='c'){ edit.rows=edBlank(); edit.msg='Cleared.'; }
  else if(act==='+'){ if(edit.rows.length<ED_RMAX) edit.rows.push('.'.repeat(ED_COLS)); else edit.msg='Sixteen rows is the tallest a wall gets.'; }
  else if(act==='-'){ if(edit.rows.length>ED_RMIN){ edit.rows.pop(); edit.r=Math.min(edit.r, edit.rows.length-1); } else edit.msg='Four rows is the shortest a wall gets.'; }
  else if(act==='x'){ edit=null; loadLevel(level<0?0:level); }
}
function edDoMenu(k){
  const {c,r}=edit.menu, ch=BRUSH[edit.brush].ch;
  if(k==='pick'){
    const at=edit.rows[r][c];
    const i=BRUSH.findIndex(b=>b.ch===at);
    if(i>=0){ edit.brush=i; edit.msg='Brush: '+BRUSH[i].n+'.'; }
  }
  else if(k==='clear') edSet(r,c,'.');
  else if(k==='fillr'){ for(let x=1;x<ED_COLS-1;x++) edSet(r,x,ch); }
  else if(k==='clrr'){ for(let x=1;x<ED_COLS-1;x++) edSet(r,x,'.'); }
  else if(k==='fillc'){ for(let y=0;y<edit.rows.length;y++) edSet(y,c,ch); }
  else if(k==='clrc'){ for(let y=0;y<edit.rows.length;y++) edSet(y,c,'.'); }
  else if(k==='mirror'){
    /* nearly every good breakout wall is symmetric, so this is the one
       convenience that saves real time rather than a keystroke */
    const mid=Math.floor(ED_COLS/2);
    for(let y=0;y<edit.rows.length;y++)
      for(let x=1;x<mid;x++) edSet(y, ED_COLS-1-x, edit.rows[y][x]);
    edit.msg='Mirrored.';
  }
  else if(k==='all'){ edit.rows=edBlank(); edit.msg='Cleared.'; }
  edit.menu=null;
}

function edMouse(){
  if(!ptrQ.length) return;
  for(const e of ptrQ){
    const x=e.x, y=e.y;
    edit.hover = edit.ui==='grid'? edCellAt(x,y) : null;

    // ---- an open menu swallows everything until it is answered ----
    if(edit.menu){
      if(e.t==='move'){ edit.menu.sel=edMenuAt(x,y); }
      else if(e.t==='down'){
        const i=edMenuAt(x,y);
        if(i>=0) edDoMenu(ED_MENU[i].k); else edit.menu=null;
      }
      continue;
    }
    if(edit.ui==='feats'){
      const i=edFeatAt(x,y);
      if(e.t==='move' && i>=0) edit.sel=i;
      if(e.t==='down' && e.btn===0 && i>=0){
        const f=FEAT_LIST[i];
        if(edit.feats.has(f)) edit.feats.delete(f); else edit.feats.add(f);
      }
      if(e.t==='down' && e.btn===2){ edit.ui='grid'; edit.msg=''; }
      continue;
    }
    if(edit.ui==='browse'){
      const i=edListAt(x,y);
      if(e.t==='move' && i>=0) edit.sel=i;
      if(e.t==='down' && e.btn===0 && i>=0) edLoad(edit.list[i].id);
      if(e.t==='down' && e.btn===2){ edit.ui='grid'; edit.msg=''; }
      continue;
    }

    // ---- the grid ----
    if(e.t==='down'){
      const b=edBtnAt(x,y);
      if(b>=0){ edDoBtn(ED_BTN[b][1]); continue; }
      const p=edPalAt(x,y);
      if(p>=0){ edit.brush=p; edit.msg=BRUSH[p].n+' — '+BRUSH[p].d; continue; }
      const cell=edCellAt(x,y);
      if(!cell) continue;
      edit.c=cell.c; edit.r=cell.r;
      if(e.btn===0){                       // LEFT: lay brick, and keep laying
        edit.drag={ch:BRUSH[edit.brush].ch, last:cell.c+','+cell.r};
        edSet(cell.r, cell.c, edit.drag.ch);
      } else if(e.btn===2){                // RIGHT: erase on drag, menu on click
        edit.rdrag={start:cell, moved:false, last:cell.c+','+cell.r};
      }
    }
    else if(e.t==='move'){
      const cell=edCellAt(x,y);
      if(!cell) continue;
      const k=cell.c+','+cell.r;
      if(edit.drag && k!==edit.drag.last){
        edit.drag.last=k; edit.c=cell.c; edit.r=cell.r;
        edSet(cell.r, cell.c, edit.drag.ch);
      } else if(edit.rdrag && k!==edit.rdrag.last){
        if(!edit.rdrag.moved){                       // the first move erases the origin too
          edSet(edit.rdrag.start.r, edit.rdrag.start.c, '.');
          edit.rdrag.moved=true;
        }
        edit.rdrag.last=k; edit.c=cell.c; edit.r=cell.r;
        edSet(cell.r, cell.c, '.');
      }
    }
    else if(e.t==='up'){
      if(e.btn===2 && edit.rdrag){
        if(!edit.rdrag.moved){
          const c=edit.rdrag.start;
          edit.menu={ x:Math.min(x, W-ED_MW-4), y:Math.min(y, H-ED_MENU.length*ED_MH-4),
                      c:c.c, r:c.r, sel:-1 };
        }
        edit.rdrag=null;
      }
      if(e.btn===0) edit.drag=null;
    }
  }
  ptrQ.length=0;
}

function edDrawMenu(){
  const m=edit.menu, h=ED_MENU.length*ED_MH;
  ctx.fillStyle='rgba(8,10,15,.96)'; ctx.fillRect(m.x, m.y, ED_MW, h);
  ctx.strokeStyle='#3c4658'; ctx.lineWidth=1; ctx.strokeRect(m.x+0.5, m.y+0.5, ED_MW-1, h-1);
  ctx.font='10px '+FONT; ctx.textAlign='left';
  for(let i=0;i<ED_MENU.length;i++){
    const y=m.y+i*ED_MH;
    if(i===m.sel){ ctx.fillStyle='#243044'; ctx.fillRect(m.x+1, y+1, ED_MW-2, ED_MH-1); }
    ctx.fillStyle= i===m.sel? '#ffe9a0' : '#b9c2cf';
    ctx.fillText(ED_MENU[i].t, m.x+9, y+12);
  }
  ctx.fillStyle='#5d6675'; ctx.font='9px '+FONT;
  ctx.fillText('r'+m.r+' c'+m.c, m.x+ED_MW-38, m.y-3);
}
function edDrawButtons(){
  ctx.font='bold 10px '+FONT; ctx.textAlign='center';
  const hov=edBtnAt(ptr.x, ptr.y);
  for(let i=0;i<ED_BTN.length;i++){
    const x=ED_GX+i*(ED_BW+ED_BG), on=i===hov;
    ctx.fillStyle= on? '#2a3648' : '#1a202b';
    ctx.fillRect(x, ED_BTNY, ED_BW, ED_BTNH);
    ctx.strokeStyle= on? '#7f92ad' : '#333c4b'; ctx.lineWidth=1;
    ctx.strokeRect(x+0.5, ED_BTNY+0.5, ED_BW-1, ED_BTNH-1);
    ctx.fillStyle= on? '#ffe9a0' : '#93a0b2';
    ctx.fillText(ED_BTN[i][0], x+ED_BW/2, ED_BTNY+13);
  }
  ctx.textAlign='left';
}

function edKey(k){ const hit=held[k]&&!edLatch[k]; edLatch[k]=held[k]; return hit; }
function edTick(){
  edMouse();
  if(!edit) return;                      // EXIT was clicked
  for(const k of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','[',']','t','T',
                  'f','F','n','N','s','S','l','L','c','C','+','=','-','Escape','Enter'])
    if(!(k in edLatch)) edLatch[k]=held[k];

  if(edKey('Escape')){
    if(edit.menu){ edit.menu=null; }
    else if(edit.ui!=='grid'){ edit.ui='grid'; edit.msg=''; }
    else { edit=null; loadLevel(level<0?0:level); }
    return;
  }
  if(edit.ui==='browse'){
    const n=edit.list? edit.list.length : 0;
    if(n){
      if(edKey('ArrowUp')) edit.sel=(edit.sel-1+n)%n;
      if(edKey('ArrowDown')) edit.sel=(edit.sel+1)%n;
      if(edKey('Enter')||edKey(' ')) edLoad(edit.list[edit.sel].id);
    }
    return;
  }
  if(edit.ui==='feats'){
    const n=FEAT_LIST.length;
    if(edKey('ArrowUp')) edit.sel=(edit.sel-1+n)%n;
    if(edKey('ArrowDown')) edit.sel=(edit.sel+1)%n;
    if(edKey('Enter')||edKey(' ')){
      const f=FEAT_LIST[edit.sel];
      if(edit.feats.has(f)) edit.feats.delete(f); else edit.feats.add(f);
    }
    return;
  }
  // --- the grid ---
  if(edKey('ArrowLeft'))  edit.c=Math.max(1, edit.c-1);
  if(edKey('ArrowRight')) edit.c=Math.min(ED_COLS-2, edit.c+1);
  if(edKey('ArrowUp'))    edit.r=Math.max(0, edit.r-1);
  if(edKey('ArrowDown'))  edit.r=Math.min(edit.rows.length-1, edit.r+1);
  if(edKey('[')) edit.brush=(edit.brush-1+BRUSH.length)%BRUSH.length;
  if(edKey(']')) edit.brush=(edit.brush+1)%BRUSH.length;
  if(edKey(' ')) edSet(edit.r, edit.c, BRUSH[edit.brush].ch);
  if(edKey('+')||edKey('=')){
    if(edit.rows.length<ED_RMAX) edit.rows.push('.'.repeat(ED_COLS));
    else edit.msg='Sixteen rows is the tallest a wall gets.';
  }
  if(edKey('-')){
    if(edit.rows.length>ED_RMIN){ edit.rows.pop(); edit.r=Math.min(edit.r, edit.rows.length-1); }
    else edit.msg='Four rows is the shortest a wall gets.';
  }
  if(edKey('c')||edKey('C')){ edit.rows=edBlank(); edit.msg='Cleared.'; }
  if(edKey('t')||edKey('T')) edTest();
  if(edKey('f')||edKey('F')){ edit.ui='feats'; edit.sel=0; edit.msg='ENTER toggles. These change how the whole wall behaves.'; }
  if(edKey('n')||edKey('N')) edName();
  if(edKey('s')||edKey('S')) edSave();
  if(edKey('l')||edKey('L')) edBrowse();
}

function edDraw(){
  ctx.fillStyle='#0d1016'; ctx.fillRect(0,0,W,H);
  ctx.textAlign='left';
  ctx.font='bold 15px '+FONT; ctx.fillStyle='#e8dfc8';
  ctx.fillText('WALL BUILDER', 20, 26);
  ctx.font='11px '+FONT; ctx.fillStyle='#8a94a4';
  ctx.fillText(edit.name? ('"'+edit.name+'"') : 'unnamed', 150, 26);

  if(edit.ui==='browse'){ edDrawList(); return; }
  if(edit.ui==='feats'){ edDrawFeats(); return; }

  // the grid — same 15 columns the built-in walls are authored in
  /* the SAME numbers the hit tests use — a layout constant that exists twice
     is a bug with a delay on it */
  const CW=ED_CW, CH=ED_CH, GX=ED_GX, GY=ED_GY;
  for(let r=0;r<edit.rows.length;r++) for(let c=0;c<ED_COLS;c++){
    const x=GX+c*CW, y=GY+r*CH, ch=edit.rows[r][c];
    const dead=(c===0||c===ED_COLS-1);
    ctx.fillStyle= dead? '#15181e' : (ED_COL[ch]||'#20242c');
    ctx.fillRect(x+1,y+1,CW-2,CH-2);
    if(dead){ ctx.strokeStyle='#1c2028'; ctx.lineWidth=1; ctx.strokeRect(x+1.5,y+1.5,CW-3,CH-3); }
    if(ch!=='.'&&!dead){
      ctx.fillStyle='rgba(0,0,0,.55)'; ctx.font='bold 10px '+FONT; ctx.textAlign='center';
      ctx.fillText(ch, x+CW/2, y+CH/2+3.5); ctx.textAlign='left';
    }
  }
  // the dead margin, named once so it is not a mystery
  ctx.font='9px '+FONT; ctx.fillStyle='#4a5260';
  ctx.fillText('margin', GX+1, GY+edit.rows.length*CH+11);
  ctx.fillText('margin', GX+(ED_COLS-1)*CW-4, GY+edit.rows.length*CH+11);
  // what the mouse is over, then where the cursor is
  if(edit.hover){
    ctx.fillStyle='rgba(255,233,160,.13)';
    ctx.fillRect(GX+edit.hover.c*CW+1, GY+edit.hover.r*CH+1, CW-2, CH-2);
  }
  const cx=GX+edit.c*CW, cy=GY+edit.r*CH;
  ctx.strokeStyle='#ffe9a0'; ctx.lineWidth=2;
  ctx.strokeRect(cx+0.5, cy+0.5, CW-1, CH-1);

  // palette
  const PX=ED_PX;
  ctx.font='bold 10px '+FONT; ctx.fillStyle='#c8bfa8'; ctx.fillText('BRICKS  (click)', PX, 54);
  const palHov=edPalAt(ptr.x, ptr.y);
  for(let i=0;i<BRUSH.length;i++){
    const y=ED_PY+i*ED_PH, on=i===edit.brush;
    if(i===palHov && !on){ ctx.fillStyle='rgba(255,233,160,.10)'; ctx.fillRect(PX-5, y-3, W-6-(PX-5), ED_PH-1); }
    ctx.fillStyle=ED_COL[BRUSH[i].ch]||'#20242c';
    ctx.fillRect(PX, y, 14, 12);
    if(on){ ctx.strokeStyle='#ffe9a0'; ctx.lineWidth=1.5; ctx.strokeRect(PX-1.5,y-1.5,17,15); }
    ctx.font=(on?'bold ':'')+'10px '+FONT;
    ctx.fillStyle= on? '#ffe9a0' : '#8a94a4';
    ctx.fillText(BRUSH[i].n, PX+20, y+10);
  }
  const b=BRUSH[edit.brush];
  ctx.font='10px '+FONT; ctx.fillStyle='#7f8896';
  ctx.fillText(b.d, PX, ED_PY+BRUSH.length*ED_PH+12);

  // features currently on
  const fy=GY+edit.rows.length*CH+30;
  ctx.font='bold 10px '+FONT; ctx.fillStyle='#c8bfa8'; ctx.fillText('BEHAVIOUR  (F)', GX, fy);
  ctx.font='10px '+FONT;
  const on=[...edit.feats];
  ctx.fillStyle= on.length? '#8ad8ff' : '#5a626e';
  ctx.fillText(on.length? on.map(f=>FEAT_NAME[f]).join(' · ') : 'plain wall', GX, fy+14);

  edDrawButtons();
  ctx.font='10px '+FONT; ctx.textAlign='left'; ctx.fillStyle='#707a88';
  ctx.fillText('DRAG to lay bricks · RIGHT-DRAG erases · RIGHT-CLICK for the menu · click a brick to pick it · arrows and SPACE still work',
               GX, H-22);
  ctx.fillStyle= edit.busy? '#ffe9a0' : '#a8dfa0';
  ctx.fillText(edit.msg||'', GX, H-8);
  if(edit.menu) edDrawMenu();
}
function edDrawFeats(){
  ctx.font='11px '+FONT; ctx.fillStyle='#8a94a4';
  ctx.fillText('These are the mechanics that used to be welded to a wall NUMBER.', 20, 52);
  ctx.fillText('Any wall can have any of them now.', 20, 68);
  for(let i=0;i<FEAT_LIST.length;i++){
    const f=FEAT_LIST[i], y=94+i*22, sel=i===edit.sel, on=edit.feats.has(f);
    if(sel){ ctx.fillStyle='#1c2230'; ctx.fillRect(16,y-13,W-32,20); }
    ctx.fillStyle= on? '#8ad8ff' : '#3a4250';
    ctx.fillRect(24, y-9, 11, 11);
    ctx.font=(sel?'bold ':'')+'11px '+FONT;
    ctx.fillStyle= sel? '#ffe9a0' : (on? '#c8d6e4' : '#707a88');
    ctx.fillStyle= sel? '#ffe9a0' : (on? '#c8d6e4' : '#707a88');
    ctx.fillText(FEAT_NAME[f], 46, y);
  }
  ctx.font='10px '+FONT; ctx.fillStyle='#707a88';
  ctx.fillText('CLICK toggles (or UP/DOWN and ENTER)   ESC or right-click goes back to the grid', 20, H-14);
}
function edDrawList(){
  ctx.font='11px '+FONT; ctx.fillStyle='#8a94a4';
  ctx.fillText('WALLS ON THE SERVER — everyone sees the same shelf.', 20, 52);
  if(!edit.list){ ctx.fillStyle='#ffe9a0'; ctx.fillText(edit.msg, 20, 80); return; }
  const per=14;
  const from=Math.max(0, Math.min(edit.sel-per+3, edit.list.length-per));
  for(let i=from;i<Math.min(edit.list.length, from+per);i++){
    const w=edit.list[i], y=82+(i-from)*20, sel=i===edit.sel;
    if(sel){ ctx.fillStyle='#1c2230'; ctx.fillRect(16,y-13,W-32,19); }
    ctx.font=(sel?'bold ':'')+'11px '+FONT;
    ctx.fillStyle= sel? '#ffe9a0' : '#c8bfa8';
    ctx.fillText(w.name, 26, y);
    ctx.font='10px '+FONT; ctx.fillStyle='#6b7482';
    ctx.fillText(w.rows+' rows', W-140, y);
    ctx.fillText(w.when||'', W-80, y);
  }
  ctx.font='10px '+FONT; ctx.fillStyle='#707a88';
  ctx.fillText(edit.msg||'', 20, H-14);
  ctx.fillText('CLICK a wall to load it   ESC or right-click goes back', 20, H-30);
}

/* ---------------- WALL BACKGROUNDS (Scott, 2026-08-17) ----------------
   "for all main levels, give player option to choose a background image stored
   locally as images or image links to local file or web file."

   Per wall, chosen by the player, kept in this browser. Three sources: a web
   link, a path inside the site, or a file off the player's own disk.

   THE ONE RULE THAT MATTERS: a photograph behind a breakout wall destroys the
   thing you actually need to see, which is a small fast ball against small
   fixed bricks. So every background is drawn under a SCRIM, dark by default,
   and the dim is the player's to set. The game stays readable at every setting
   the slider offers — the floor is not 0.
   Backgrounds are NEVER stored on the shared wall shelf. A wall someone else
   saved should not be able to make your browser fetch an arbitrary image; the
   grid travels, the wallpaper does not. */
const BG_KEY='sb_bg_v1';
const BG_DIM_MIN=0.30, BG_DIM_MAX=0.88, BG_DIM_DEF=0.62;
const BG_MAX_STORE=1200000;      // ~1.2MB of data URL; beyond that, this session only
let bgMap={}, bgImg={}, bgUI=null;

function bgLoadPrefs(){
  try{ bgMap=JSON.parse(localStorage.getItem(BG_KEY)||'{}')||{}; }catch(e){ bgMap={}; }
  bgMigrate();
}
/* ONE-TIME MIGRATION (2026-08-25). Per-wall backgrounds were stored under the
   wall's INDEX, so the play reorder would have silently handed every saved
   picture to a different wall. Favourites were keyed by NAME for exactly this
   reason; backgrounds had the same latent bug and this is the reorder that
   would have sprung it. Numeric keys are rewritten to names using the
   AUTHORING order they were saved against, then the numbers are dropped.
   'all' and 'custom' are reserved and pass straight through. */
function bgMigrate(){
  let moved=0;
  for(const k of Object.keys(bgMap)){
    if(!/^\d+$/.test(k)) continue;                 // 'all' / 'custom' / already a name
    const nm=WALL_NAMES_SRC[+k];
    if(nm && !bgMap[nm]) bgMap[nm]=bgMap[k];
    delete bgMap[k]; moved++;
  }
  if(moved) bgSavePrefs();
}
function bgSavePrefs(){
  try{ localStorage.setItem(BG_KEY, JSON.stringify(bgMap)); }
  catch(e){ if(bgUI) bgUI.msg='Too big to remember — it will last this session only.'; }
}
/* keyed by NAME, not index — same rule the favourites already follow, so a
   reorder can never hand one wall's picture to another. */
function bgKey(){ return level<0? 'custom' : (WALL_NAMES[level] || String(level)); }
/* THE HOUSE BACKGROUND (Scott, 2026-08-24: "a feature where they can choose 1
   image as overall game background, local storage, stretches to fit").
   Stored under the reserved key 'all' and used by EVERY wall that has not been
   given one of its own — so one picture dresses the whole cabinet, and a wall
   with a deliberate background still wins on its own row. Reserved-key note:
   per-wall keys are WALL NAMES or 'custom', and no wall is named 'all' or
   'custom' (pinned in the suite), so the reserved keys can never collide. */
const BG_ALL='all';
function bgEntry(){ return bgMap[bgKey()] || bgMap[BG_ALL] || null; }
function bgIsHouse(){ return !bgMap[bgKey()] && !!bgMap[BG_ALL]; }

/* one Image per source, made once and reused. A broken link is remembered as
   broken so the game is not retrying a dead URL every frame. */
function bgGet(){
  const e=bgEntry();
  if(!e || !e.src) return null;
  let im=bgImg[e.src];
  if(!im){
    im=new Image();
    im.onerror=()=>{ im.failed=true; };
    im.src=e.src;
    bgImg[e.src]=im;
  }
  return (im.complete && im.naturalWidth && !im.failed)? im : null;
}
function bgSet(src){
  if(!src){ delete bgMap[bgKey()]; }
  else {
    const keep = src.length<BG_MAX_STORE;
    bgMap[bgKey()]={src, dim:(bgEntry()&&bgEntry().dim)||BG_DIM_DEF};
    if(!keep){ /* held in memory only — bgSavePrefs will complain and that is right */ }
  }
  bgSavePrefs();
}
function bgDim(d){
  const e=bgEntry(); if(!e) return;
  e.dim=Math.max(BG_DIM_MIN, Math.min(BG_DIM_MAX, (e.dim||BG_DIM_DEF)+d));
  bgSavePrefs();
}
/* COVER fit: fill the frame, crop the overflow, never stretch. A squashed
   photograph looks like a bug even when it is a choice. */
function bgDraw(){
  const im=bgGet(); if(!im) return;
  const e=bgEntry();
  const s=Math.max(W/im.naturalWidth, H/im.naturalHeight);
  const w=im.naturalWidth*s, h=im.naturalHeight*s;
  ctx.drawImage(im, (W-w)/2, (H-h)/2, w, h);
  ctx.fillStyle='rgba(10,12,20,'+(e.dim||BG_DIM_DEF).toFixed(2)+')';
  ctx.fillRect(0,0,W,H);
}

/* ---- the picker ---- */
const BG_OPTS=[
  {k:'link', t:'Paste a web link or a path on this site'},
  {k:'file', t:'Choose an image from this computer'},
  {k:'dim',  t:'Dim  (LEFT / RIGHT, or click the bar)'},
  {k:'off',  t:'Remove this wall’s background'},
  /* the HOUSE background: set one picture once and every wall wears it.
     Promote-what-you-see rather than a second picker — you have already
     chosen the image on this wall, so the action is "use it everywhere". */
  {k:'house',   t:'Use this picture on EVERY wall'},
  {k:'nohouse', t:'Remove the every-wall picture'},
  {k:'all',  t:'Remove them from every wall'}
];
function bgOpen(){
  bgUI={sel:0, msg:'This wall only. Backgrounds stay in this browser.'};
}
function bgFile(){
  /* the input is made on demand and thrown away — a permanent hidden file
     input in the page is a thing that can be focused by accident */
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='image/*';
  inp.onchange=()=>{
    const f=inp.files && inp.files[0];
    if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{ bgSet(rd.result);
      if(bgUI) bgUI.msg = rd.result.length<BG_MAX_STORE
        ? 'Set from '+f.name+'.'
        : f.name+' is large — it will show now but is not remembered.'; };
    rd.onerror=()=>{ if(bgUI) bgUI.msg='Could not read that file.'; };
    rd.readAsDataURL(f);
  };
  inp.click();
}
function bgDo(k){
  if(k==='link'){
    const cur=bgEntry()? bgEntry().src : '';
    const v=window.prompt('Image link — a full https:// address, or a path like images/sky.jpg',
                          (cur&&cur.slice(0,5)!=='data:')? cur : '');
    if(v===null) return;
    const s=v.trim();
    if(!s){ bgSet(null); bgUI.msg='Removed.'; return; }
    if(!/^(https?:\/\/|\/|[\w.-]+\/)/i.test(s)){ bgUI.msg='That does not look like a link or a path.'; return; }
    bgSet(s); bgUI.msg='Set. If nothing appears, the link is not an image or the site blocks hotlinking.';
  }
  else if(k==='file') bgFile();
  else if(k==='off'){ bgSet(null); bgUI.msg='Removed from this wall.'; }
  else if(k==='house'){
    const e=bgEntry();
    if(!e || !e.src){ bgUI.msg='Pick a picture first, then send it to every wall.'; return; }
    bgMap[BG_ALL]={src:e.src, dim:e.dim||BG_DIM_DEF};
    delete bgMap[bgKey()];        // no duplicate copy on this wall's own row
    bgSavePrefs();
    bgUI.msg='Every wall wears it now. A wall given its own picture still wins.';
  }
  else if(k==='nohouse'){
    if(!bgMap[BG_ALL]){ bgUI.msg='There is no every-wall picture set.'; return; }
    delete bgMap[BG_ALL]; bgSavePrefs(); bgUI.msg='The every-wall picture is gone.';
  }
  else if(k==='all'){ bgMap={}; bgSavePrefs(); bgUI.msg='Removed from every wall.'; }
}
function bgTick(){
  for(const k of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' ','Escape'])
    if(!(k in edLatch)) edLatch[k]=held[k];
  if(edKey('Escape')){ bgUI=null; return; }
  if(edKey('ArrowUp'))   bgUI.sel=(bgUI.sel-1+BG_OPTS.length)%BG_OPTS.length;
  if(edKey('ArrowDown')) bgUI.sel=(bgUI.sel+1)%BG_OPTS.length;
  if(edKey('ArrowLeft'))  bgDim(-0.06);
  if(edKey('ArrowRight')) bgDim(+0.06);
  if(edKey('Enter')||edKey(' ')) bgDo(BG_OPTS[bgUI.sel].k);
  // mouse
  for(const e of ptrQ){
    const i=Math.floor((e.y-118+11)/24);
    if(e.t==='move' && i>=0 && i<BG_OPTS.length) bgUI.sel=i;
    if(e.t==='down'){
      if(i>=0 && i<BG_OPTS.length){
        if(BG_OPTS[i].k==='dim'){
          const e2=bgEntry();
          if(e2){ const f=Math.max(0,Math.min(1,(e.x-330)/200));
                  e2.dim=BG_DIM_MIN+f*(BG_DIM_MAX-BG_DIM_MIN); bgSavePrefs(); }
        } else bgDo(BG_OPTS[i].k);
      } else if(e.btn===2) bgUI=null;
    }
  }
  ptrQ.length=0;
}
function bgDrawUI(){
  ctx.fillStyle='rgba(6,8,13,.90)'; ctx.fillRect(0,0,W,H);
  ctx.textAlign='left';
  ctx.font='bold 15px '+FONT; ctx.fillStyle='#e8dfc8';
  ctx.fillText('BACKGROUND — '+(level<0? 'your custom wall' : 'wall '+(level+1)), 24, 40);
  ctx.font='11px '+FONT; ctx.fillStyle='#8a94a4';
  ctx.fillText('A picture behind the bricks is only ever wallpaper: the dim keeps the ball readable.', 24, 62);
  ctx.fillText('Set per wall, remembered in this browser. Never shared with walls you save.', 24, 78);

  const e=bgEntry();
  for(let i=0;i<BG_OPTS.length;i++){
    const y=118+i*24, sel=i===bgUI.sel;
    if(sel){ ctx.fillStyle='#1b2331'; ctx.fillRect(18, y-15, W-36, 22); }
    ctx.font=(sel?'bold ':'')+'12px '+FONT;
    ctx.fillStyle= sel? '#ffe9a0' : '#aab4c2';
    ctx.fillText(BG_OPTS[i].t, 30, y);
    if(BG_OPTS[i].k==='dim'){
      const d=e? (e.dim||BG_DIM_DEF) : BG_DIM_DEF;
      const f=(d-BG_DIM_MIN)/(BG_DIM_MAX-BG_DIM_MIN);
      ctx.fillStyle='#2a3342'; ctx.fillRect(330, y-9, 200, 10);
      ctx.fillStyle= e? '#8ad8ff' : '#3a4453'; ctx.fillRect(330, y-9, 200*f, 10);
      ctx.fillStyle='#6f7a88'; ctx.font='10px '+FONT;
      ctx.fillText(Math.round(d*100)+'%', 540, y);
    }
  }
  const im=bgGet();
  ctx.font='10px '+FONT;
  ctx.fillStyle= im? '#a8dfa0' : '#7f8896';
  ctx.fillText(e? (im? 'Showing: '+(e.src.slice(0,5)==='data:'? 'a file from this computer'
                                                              : e.src.slice(0,70))
                     : 'Set, but not loaded yet — or the link is not an image.')
                 : 'No background on this wall.', 24, H-60);
  // a live corner preview, so you judge it against the real bricks
  if(im){
    const pw=150, ph=pw*H/W;
    ctx.save(); ctx.beginPath(); ctx.rect(W-pw-24, H-ph-78, pw, ph); ctx.clip();
    const s=Math.max(pw/im.naturalWidth, ph/im.naturalHeight);
    ctx.drawImage(im, W-pw-24+(pw-im.naturalWidth*s)/2, H-ph-78+(ph-im.naturalHeight*s)/2,
                  im.naturalWidth*s, im.naturalHeight*s);
    ctx.fillStyle='rgba(10,12,20,'+((e.dim||BG_DIM_DEF)).toFixed(2)+')';
    ctx.fillRect(W-pw-24, H-ph-78, pw, ph);
    ctx.restore();
    ctx.strokeStyle='#3c4658'; ctx.lineWidth=1;
    ctx.strokeRect(W-pw-24.5, H-ph-78.5, pw+1, ph+1);
  }
  ctx.fillStyle='#ffe9a0'; ctx.font='10px '+FONT;
  ctx.fillText(bgUI.msg||'', 24, H-42);
  ctx.fillStyle='#707a88';
  ctx.fillText('UP/DOWN choose   ENTER or click   LEFT/RIGHT dim   ESC back to the wall', 24, H-16);
}

window.BreakoutLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    lives=10; level=0; score=0; broken=0; ended='';
    tw=0; ts=0; tl=0; tb=0; parts=[]; shake=0;
    pad={x:W/2, w:PW0};
    spaceLatch=true; eLatch=true;
    bgLoadPrefs();
    favLoad(); favStop();       // hearts persist; a favourites RUN never does
    loadLevel(0);
    helpUI=false;
    toast('STONEBREAKER. Where the ball meets the slab decides its angle. Press ? for the keys.');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; } else loadScreen(5);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update: tick,
  draw,
  /* the page suppresses the browser context menu ONLY when this says so, so
     right-click keeps working normally everywhere else */
  wantsMouse(){ return !!edit || !!bgUI; },
  _t:{
    get dryRally(){ return dryRally; }, hitBrick,LEVELS, get bricks(){return bricks;}, get balls(){return balls;}, get pups(){return pups;},
      get pad(){return pad;}, get lives(){return lives;}, get level(){return level;},
      get score(){return score;}, get ended(){return ended;}, get timers(){return {tw,ts,tl,tb};}, set tb(v){tb=v;}, set tl(v){tl=v;}, BOLIDE_T, BOLIDE_R,
      get shots(){return shots;}, SHOTS, get bolts(){return bolts;},
      get bores(){return bores;}, get bombArmed(){return bombArmed;},
      set bombArmed(v){bombArmed=v;}, detonate, kegBlast, fireDeathRay, RAY_HALF,
      get rays(){return rays;},
      get teeters(){return teeters;}, get travelers(){return travelers;},
      EGG_LVL, BELT_Y, TEET_L, TEET_MAX, freeCell,
      SINK_LVL, SINK_FLOOR, SINK_BASE, SINK_RECOIL, LURCH_MIN, LURCH_VAR, HATCH_V,
      get sinkY(){return sinkY;}, set sinkY(v){sinkY=v;},
      get sinkT(){return sinkT;}, set sinkT(v){sinkT=v;},
      get sinkers(){return sinkers;}, get landT(){return landT;},
      sinkTick, hitSinker, loseLife,
      BUMP_LVL, KICK_T, KICK_MULT, KICK_RADIAL, KICK_DOWN, SLING_A, bumperKick,
      set lives(v){lives=v;}, set level(v){level=v;}, set ended(v){ended=v;},
      WALL_KEYS,
      DRIV_LVL, drivenHit, doBump, padY, bumpRising,
      ZING_MAX, ZING_DECAY, ZING_CURVE, ZING_BITE, ZING_GIVE, ROTOR_SPD,
      HELP, get helpUI(){return helpUI;}, set helpUI(v){helpUI=v;},
      BG_KEY, BG_DIM_MIN, BG_DIM_MAX, BG_DIM_DEF, BG_OPTS, BG_MAX_STORE,
      bgOpen, bgSet, bgDraw, bgKey, bgEntry, bgDim, bgLoadPrefs,
      get bgMap(){return bgMap;}, set bgMap(v){bgMap=v;},
      get bgUI(){return bgUI;}, set bgUI(v){bgUI=v;},
      zingBall, zingSkew, bounced,
      BUMP_RISE, BUMP_UP, BUMP_FALL, BUMP_SETTLE, BUMP_DIP, BUMP_CD, BUMP_LEN,
      SPIKE_T, SPIKE_MULT,
      get bumpT(){return bumpT;}, set bumpT(v){bumpT=v;},
      get bumpCD(){return bumpCD;}, set bumpCD(v){bumpCD=v;},
      get spiked(){return spiked;},
      GRAN_LVL, GRAN_HP, MOLT_LIFE, DRIP_EVERY, DRIP_BITE, DRIP_V, HOT_T, HOT_BITE,
      get drips(){return drips;}, granTick,
      GRN_LVL, GRN_MAX, GRN_COOL, greenTick,
      TEMP_LVL, TEMP_START, TEMP_COLD, TEMP_HOT, TEMP_COOL, TEMP_HEAT,
      TEMP_SLOW, TEMP_FAST, POOL_X0, POOL_X1, POOL_Y0, POOL_Y1, inPool,
      brittleHit, brickCol, GRAN_RAMP, GRN_RAMP, PY, PH, H,
      RAND_LVL, RAND_R0, RAND_ROWS, RAND_CB, areaDist, genRandomWall, STACK_LVL,
      MURM_LVL, MURM_FLOOR, MURM_ROT, MURM_SQ, MURM_RIP, MURM_RIPK, MURM_W,
      MURM_CA, MURM_CK, MURM_CW, MURM_BOB,
      genMurmurWall, murmurTick, roostTick, birdOff, drawRoost, drawBirdSprite,
      get roost(){return roost;}, get murm(){return murm;},
      STORM_CALM, STORM_WARN, STORM_LEN, STORM_EVERY, METEOR_R, METEOR_PTS,
      stormTick, stormPhase, get meteors(){return meteors;},
      get stormT(){return stormT;}, set stormT(v){stormT=v;},
      RITE_BORN, LODGE_LVL, WALL_RITES, riteInit, riteMet, riteFire, riteTick, riteFixture,
      get rites(){return rites;}, get riteBanner(){return riteBanner;},
      get broken(){return broken;}, set broken(v){broken=v;},
      TOLL_LVL, TOLL_HP, TOLL_PRICE, COIN_FALL, tollPay, coinTick, drawCoins,
      get purse(){return purse;}, set purse(v){purse=v;}, get coins(){return coins;},
      CEIL_LVL, CEIL_Y, CEIL_KILL, CEIL_SPD, ceilX, drawCeilSlab,
      LOOM_LVL, LOOM_FLOOR, SAG_HELD, SAG_ONE, SAG_MAX, LOOM_FALL,
      loomInit, loomTick, loomLand, drawLoom, loomShape,
      get loomRows(){return loomRows;},
      CARDS, get thumpMsg(){return thumpMsg;},
      THUMP_T, THUMP_IN, THUMP_OUT, get thumpT(){return thumpT;}, set thumpT(v){thumpT=v;}, drawThump,
      FACE_T, get faceT(){return faceT;}, set faceT(v){faceT=v;}, faceLoad, drawFace,
      LORE_T, LORE, get loreT(){return loreT;}, set loreT(v){loreT=v;},
      get loreWall(){return loreWall;}, set loreWall(v){loreWall=v;},   // settable so a probe can render one wall's beat
      get loreImgs(){return loreImgs;}, drawLore, loreLoad,
      LIFE_LVL, LIFE_STEP, LIFE_ROWS, LIFE_CAP, LIFE_SEED,
      genLifeWall, lifeTick, lifeNeighbours, lifeDoomMarks,
      get lifeT(){return lifeT;}, set lifeT(v){lifeT=v;},
      get lifeGen(){return lifeGen;},
      BIRD_PALS, BIRD_ACC, WALL_NAMES, wallMenuInput, drawWallMenu,
      get wallUI(){return wallUI;}, set wallUI(v){wallUI=v;},
      get wallSel(){return wallSel;}, set wallSel(v){wallSel=v;},
      FEATS, FEAT_LIST, FEAT_NAME, feat, get featSet(){return featSet;},
      BRUSH, ED_COLS, ED_RMIN, ED_RMAX, openBuilder, edProblem, edToWall, edSet,
      ED_GX, ED_GY, ED_CW, ED_CH, ED_PX, ED_PY, ED_PH, ED_BTN, ED_MENU,
      edCellAt, edPalAt, edBtnAt, edMenuAt, edDoMenu, edDoBtn, edMouse,
      edTick, edTest, WALLS_URL, get edit(){return edit;}, set edit(v){edit=v;},
      get customWall(){return customWall;}, set customWall(v){customWall=v;},
      GALL_LVL, GALL_PUP, GALL_CAP,
      PERSP_LVL, PERSP_TOP, perS,
      GRAV_LVL, STAR_X, STAR_Y, STAR_R, STAR_G,
      loadLevel, tick, serve, launch, hitBrick, speed, breakable, bx, by,
      set held(v){}, get COLS(){return COLS}, get BW(){return BW}, get BH(){return BH},
      TOP, get LEFT(){return LEFT}, PW0, BALL_R, GAP, setMetrics, SUBMAX,
      get balls(){return balls}, get bricks(){return bricks}, get boss(){return boss},
      get embers(){return embers}, BOSS_HP, BOSS_W, BOSS_H, BOSS_Y, EYE_CYC, EYE_OPEN, REGEN_T}
};
})();
