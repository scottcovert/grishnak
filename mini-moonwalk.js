"use strict";
/* ============================================================
   GRISHNAK — MOONWALK  (Scott, 2026-08-10)

   ACTUAL 3D. The moon is a real sphere now: your position and
   heading are unit vectors, and you can walk ANYWHERE on the
   ball — every object (stones, tanks, rocks, craters, lander,
   meteor strikes) sits at a fixed point on the globe. Walk a
   straight line long enough and the great circle brings you
   home. The camera floats up and behind the suit and PIVOTS
   AUTOMATICALLY — turn, and it eases around behind your new
   heading. UP walks forward, DOWN backpedals, LEFT/RIGHT turn.

   The horizon bows away as a gentle arc in every direction
   (the sight line grazing the ball), things rise over the curve
   as you approach, the stars and Earth are fixed points in
   space that wheel past as you walk, and you leave footprints.
   A radar minimap (forward = up, the whole globe folded onto
   the disc) keeps the far side and behind-you strikes honest.

   The loop: collect the 12 moonstones scattered over the globe,
   hop the boulders, dodge the telegraphed meteor strikes (the
   ground blast only bites you GROUNDED — the low-gravity jump
   is the dodge), keep your O2 up from tanks or the lander, then
   bring all twelve home and PLANT THE FLAG.
   Since 2026-08-12 the sun FLARES on a clock — shadow (monolith
   lanes, craters, the lander, night side) is the only defence —
   and three crashed CARGO PODS can be hauled home for O2 + score,
   at the price of your jump while you carry.

   Look: deep-purple pixel sky, ink-outlined grey moon, orange
   accents, a cat-eared helmet seen from behind. Same family as
   the poster that inspired it, none of its branding.
   ============================================================ */
(function(){

const TAU=Math.PI*2;
const R=430;                          // moon radius (world px)
const W_SPD=0.0052;                   // walking, radians per frame
const BACK_MUL=0.7;                   // backpedal is careful
const TURN=0.045;                     // pivot, radians per frame
const JUMP_V=4.4, GRAV=0.13;          // one-sixth gravity, more or less
const O2_MAX=100, O2_DRAIN=0.016, O2_JUMP=0.5, O2_TANK=45;
const HEARTS0=5;
const MET_FALL=46, MET_WARN=95;
const STONE_N=12;

/* --- the chase camera: up and behind the suit, auto-pivoting.
   The moon PLAYS at radius R but RENDERS on a much bigger ball:
   arc lengths are preserved (RV * visual-angle = R * true-angle),
   so distances, speeds and spacing feel identical while the
   curvature gentles. Scott's spec (2026-08-10): horizon at 60%
   down the screen (~y260 of 432), and the bow across the width
   shaped like 1/6 of a circumference — a 60-degree arc, ~85px of
   sag at the edges. RV=1400 with this camera lands both. --- */
const RV=1400;                        // the ball you SEE
const RSC=R/RV;                       // true angle -> visual angle
const CB=116;                         // camera sits this far behind you
const CH=110;                         // ...and this far above the surface
const FOC=150;                        // focal length
const UHV=Math.acos(RV/(RV+CH));      // visual horizon angle (~0.38 rad)
const UH=UHV*RV/R;                    // in TRUE angle: you see ~1.25 rad ahead
const CXS=RW/2;                       // you, horizontally, forever
const CY0=HUD+162.4;                  // projection centreline (pitches the view)
const SURF_Y=CY0+CH*FOC/CB;           // your boots on screen (~HUD+305)
const ZS=1.4;                         // world jump height -> screen px
/* --- the silhouette (Scott, twice): the drawn horizon is a LITERAL
   circular arc — radius 640px, so the 640px-wide screen spans exactly
   a 60-degree slice, 1/6 of a circumference. A true pinhole projection
   of a small ball always droops egg-style (the sides of the horizon
   circle sit nearer the camera than the front), so instead the ground
   is projected on a depth chart and then BOWED toward that arc: flat
   underfoot (w=0), the full arc at the horizon (w=1). The egg is
   impossible by construction. --- */
const RC=640;                                     // the horizon arc's radius
const S0=FOC/CB;                                  // scale at your boots
const SH=FOC/(CB+RV*Math.sin(UHV));               // scale at the horizon
const HY=CY0+(CH+RV*(1-Math.cos(UHV)))*SH;        // horizon apex (~y260 = 60% down)
const DSAT=f=>RV*Math.sin(Math.min(1.35,Math.max(-0.6,f/RV)));   // depth, saturating
const RISE=f=>RV*(1-Math.cos(Math.min(1.35,Math.max(-0.6,f/RV))));// ground falls away
const BOW=x=>{ const dx=Math.min(Math.abs(x-CXS),RC-1); return RC-Math.sqrt(RC*RC-dx*dx); };

/* --- tiny vector kit (unit vectors on the sphere) --- */
const vd=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const vx=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const vam=(a,b,s)=>[a[0]+b[0]*s, a[1]+b[1]*s, a[2]+b[2]*s];
const vm=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const vn=a=>{ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; };
const ad=(a,b)=>Math.acos(Math.max(-1,Math.min(1,vd(a,b))));
const sph=(lat,lon)=>[Math.cos(lat)*Math.sin(lon), Math.sin(lat), Math.cos(lat)*Math.cos(lon)];

/* fixed layout — points on the globe. Deterministic on purpose: the
   tests walk this moon, and a second run rewards a remembered map. */
const LANDER_Q=sph(0,0);
const STONES_LL=[[0.00,0.52],[0.30,1.05],[-0.35,1.62],[0.55,2.10],[-0.60,2.62],[0.15,3.05],
                 [0.90,3.55],[-0.95,4.02],[0.40,4.55],[-0.25,5.02],[1.20,1.90],[-1.15,5.50]];
const TANKS_LL=[[0.20,1.35],[-0.40,2.85],[0.50,4.30],[-0.15,5.75]];
const ROCKS_LL=[[0.05,0.80],[-0.30,1.90],[0.35,2.35],[-0.50,3.30],[0.60,3.85],[-0.10,4.80],[0.25,5.25],[-0.65,0.35]];
const CRATERS=[[0.15,0.30,26],[-0.45,1.20,34],[0.70,2.20,22],[-0.20,2.90,30],
               [0.45,3.60,24],[-0.75,4.40,34],[0.10,5.10,20],[0.95,5.60,28]]
              .map(([la,lo,w])=>({Q:sph(la,lo), w}));
const ROCKS_Q=ROCKS_LL.map(([la,lo])=>sph(la,lo));
const dirT=(A,B)=>vn(vam(B,A,-vd(B,A)));      // tangent at A toward B
/* --- THE SOLAR FLARE (Scott 2026-08-12): the sun is a fixed point in
   space, drawn in the sky like Earth. On a clock it FLARES — a radio
   warning, then hard radiation over the entire sunlit hemisphere.
   Shadow is life: behind a MONOLITH, inside a crater, at the lander,
   or anywhere on the night side. The jump does NOT help — radiation
   is not a meteor. Monoliths are the visually-certain shelters: tall
   ink-lined slabs whose shadow lanes are drawn on the ground and lit
   safe-blue whenever the sun is angry. --- */
const SUN_Q=sph(0.15,0.90);
const FLARE_EVERY=2400, FLARE_WARN=360, FLARE_LEN=300;
const MONO_SHADOW=0.115, MONO_CONE=0.55;      // base lane length (rad); cone kept for reference
/* Monolith field v2 (Scott 2026-08-13): BIGGER certain-shelters. sc scales
   the drawn slab and its shadow; n>1 raises a RIDGE — n slabs shoulder to
   shoulder across the sun line, one long continuous shadow wall. Each slab
   carries its own lane length (sh), lane half-width (hw) and walking block
   radius (bl), all grown with its size. */
const MONO_SPEC=[
  {la: 0.40, lo:0.55, sc:1.0},
  {la:-0.50, lo:1.70, sc:1.6},                 // the big slab
  {la: 0.70, lo:2.80, sc:1.0},
  {la:-0.20, lo:3.60, sc:1.3, n:2},            // the double ridge
  {la: 0.50, lo:4.70, sc:1.0},
  {la:-0.85, lo:5.35, sc:1.4},
  {la: 0.05, lo:2.35, sc:1.2, n:3},            // the long ridge — three slabs wide
  {la:-0.60, lo:0.20, sc:1.8, wrong:true},     // the monster slab — AND THE DOOR
];
/* --- THE WRONG SHADOW (2026-08-24) ---------------------------------------
   Every other lane in this game is honest: tS is computed from the real sun
   direction, and inShadow() tests the lane you can actually see drawn. That
   consistency is the entire budget this one violation spends. THE MONSTER
   SLAB's lane points somewhere no sun could put it, and it SHELTERS YOU
   ANYWAY — it works, and it shouldn't, which is the tell. Three levels of
   correct shadows teach the player to read lanes; this one then says
   something. It is deliberately NOT a bug: see the test pin asserting the
   bearing is wrong, so no future tidy-up "corrects" it into silence. */
const WRONG_TURN=1.94;                         // radians off true. Not subtle, on purpose.
const MONO=[];
for(const sp of MONO_SPEC){
  const Q0=sph(sp.la,sp.lo), t0=dirT(Q0, vm(SUN_Q,-1)), p0=vn(vx(Q0,t0));
  const n=sp.n||1;
  for(let k=0;k<n;k++){
    const off=(k-(n-1)/2)*0.052*sp.sc*1.7;     // lanes overlap: one unbroken wall
    const Q= n>1? vn(vam(Q0,p0,off)) : Q0;
    let tS=dirT(Q, vm(SUN_Q,-1));
    if(sp.wrong){                              // spin the lane about the surface normal
      const c=Math.cos(WRONG_TURN), s=Math.sin(WRONG_TURN);
      tS=vn(vam(vm(tS,c), vx(Q,tS), s));
    }
    MONO.push({ Q, tS, sc:sp.sc, wrong:!!sp.wrong,
                sh:MONO_SHADOW*(0.5+0.5*sp.sc),
                hw:0.052*sp.sc, bl:0.020*sp.sc });
  }
}
const WRONG=MONO.find(m=>m.wrong);
/* THE SHAFT sits at the far end of the lane that should not exist. Until
   level 4 it is closed and the ground there is merely wrong; from level 4
   it is open, and it is the only thing left to walk to. */
/* 0.45 down the lane, not the far end. ROCKS_LL[7] lies alongside this whole
   lane, and at the far end it sits INSIDE the shaft — where its 0.026 block
   radius would have fenced the player off from their own entrance. Mid-lane
   clears both the boulder and the slab's own block radius with a walking
   step to spare, and it reads better anyway: a hole in the middle of the
   impossible shadow, the slab at one end, the boulder at its shoulder. */
const SHAFT_F=0.45;
const SHAFT_Q=vn(vam(vm(WRONG.Q,Math.cos(WRONG.sh*SHAFT_F)), WRONG.tS, Math.sin(WRONG.sh*SHAFT_F)));
const SHAFT_R=0.042, DESCEND_LV=4;
const CRATER_HIDE=cr=>cr.w/R*0.8;             // a crater shelters inside ~80% of its rim
/* --- CARGO PODS (Scott 2026-08-12): crashed cargo hauled home for O2
   + score. Carrying KILLS the jump — your meteor dodge — and slows the
   walk; SPACE sets the pod down instead, and taking any hit drops it.
   Delivered pods stack beside the lander, stencils out. --- */
const PODS_LL=[[0.85,1.00],[-0.70,3.10],[0.30,5.30]];
const POD_SPD=0.80, POD_SCORE=150;
/* --- LEVELS + THE ASSESSORS (Scott 2026-08-12). Planting the flag no
   longer ends the moon: the stones RETURN — plopping down from the sky
   in a staggered diamond-drop — and the next level begins, faster and
   thirstier. From level 2, ASSESSORS arrive: pale glass lights that
   descend on uncollected diamonds, beam them up, and re-drop them
   somewhere else later. They never touch you; they touch your MAP.
   Walk into the beam and they spook off empty-handed.
   Universe note: the Assessors are canon-NEUTRAL by design — Scott's
   spec is a tie into the text-adventure common universe with no
   obligation in either direction yet. Nothing here names or needs any
   Spindle thread; the door is simply left open. --- */
const ALIEN_SPD=0.0042, ALIEN_BEAM=200, ALIEN_AWAY=900, ALIEN_EVERY=600;
/* --- THE HARVESTERS (Scott 2026-08-12, after the movie MOON): two
   automated mining hulks crawl fixed great circles, chewing regolith
   for O3. Their vents leak breathable spare — stand beside one and
   your tanks fill; their bulk shelters you from a flare; their cutter
   drum does NOT distinguish rock from suit. They leave churned twin
   tracks behind them forever. --- */
const HARV=[
  { ax:vn([0.30,1.00,0.20]), ph0:0.0,  spd: 0.00085 },
  { ax:vn([-0.60,1.00,0.70]), ph0:2.6, spd:-0.00075 } ];
for(const h of HARV){                          // orthonormal circle basis
  let u=vx(h.ax,[0,0,1]); if(Math.hypot(u[0],u[1],u[2])<1e-6) u=vx(h.ax,[1,0,0]);
  h.u=vn(u); h.v=vx(h.ax,h.u);
}
const harvQ=h=>vn(vam(vm(h.u,Math.cos(h.ph)), h.v, Math.sin(h.ph)));
const harvDir=h=>vm(vx(h.ax,harvQ(h)), h.spd>=0?1:-1);
const HARV_VENT=0.055, HARV_BLOCK=0.030, HARV_CUT=0.020, HARV_HEAD=0.028;
/* ground grit, world-fixed — the motion feedback */
const SPECK=[]; for(let i=0;i<150;i++)
  SPECK.push(sph(Math.asin(2*hash2(i*3,i*11)-1), hash2(i*7,i*5)*TAU));
/* THE TILED GLOBE (Scott 2026-08-10): the whole sphere is mapped
   into lat/long tiles, ~10 degrees each, columns scaled by cos(lat)
   so tiles stay roughly square (a little polar clunk is accepted —
   tiles visibly rotating in and out of view is part of the look).
   Every tile carries deterministic terrain from its hash: plains,
   dust, rubble, cracks, RAVINES, ridges. Nothing is stored per
   frame — the map is pure function of (band, column). */
const TILES=[];
{
  const NB=18, STEPB=Math.PI/NB;
  for(let b=0;b<NB;b++){
    const lat0=-Math.PI/2+b*STEPB, lat1=lat0+STEPB, latC=(lat0+lat1)/2;
    const nc=Math.max(3,Math.round(36*Math.cos(latC)));
    for(let c=0;c<nc;c++){
      const lon0=c/nc*TAU, lon1=(c+1)/nc*TAU;
      const Q=sph(latC,(lon0+lon1)/2);
      let e=[Q[2],0,-Q[0]];                       // east tangent
      const el=Math.hypot(e[0],e[1],e[2]);
      e= el<1e-6? [1,0,0] : vm(e,1/el);
      const n=vx(Q,e);                            // north tangent
      TILES.push({ Q, e, n,
        q00:sph(lat0,lon0), q01:sph(lat0,lon1), q11:sph(lat1,lon1), q10:sph(lat1,lon0),
        h:hash2(b*7+1,c*13+5), h2:hash2(b*3+11,c*5+2) });
    }
  }
}
/* the sky is fixed in SPACE: stars wheel past as you walk the ball */
const STARS=[]; for(let i=0;i<130;i++)
  STARS.push({Q:sph(Math.asin(2*hash2(i*13+7,i*29+3)-1), hash2(i*7+1,i*17+11)*TAU), h:hash2(i,5)});
const SPARKS=[sph(0.5,0.9),sph(-0.3,2.4),sph(0.8,3.9),sph(-0.6,5.3)];
const EARTH_Q=sph(0.35,4.6);

let P=sph(0,0.18), H=[1,0,0];         // where you stand, which way you face
let camF=[1,0,0];                     // eased camera heading (the auto-pivot)
let z=0, vz=0, walking=false, walkT=0, backing=false;
let stones=[], tanks=[], o2=O2_MAX, hearts=HEARTS0, score=0;
let meteors=[], scorches=[], metT=0, iframes=0;
let plantT=0, flagUp=0, doneT=0, over=false, deadT=0;
let introT=0, jumpLatch=true, exitLatch=true, savedPos=null, homeMsgT=0;
let hintT=0;                  // the controls hint fades after ~9s — it was overprinting CARGO forever
let parts=[], prints=[], printC=0;
let flareMode=0, flareT=FLARE_EVERY;  // 0 quiet · 1 warning · 2 FLARE
let pods=[], carrying=-1;
let level=1, dropT=0;                 // dropT: the diamond-drop curtain-up
let aliens=[], alienT=0, tracks=[];
/* THE BOUND (2026-08-24). Apollo crews stopped walking within minutes and
   loped, because in one-sixth gravity a chain of low hops beats a stride.
   Re-hop within BND_WIN frames of landing and the chain builds; miss the
   beat and it drops to nothing. Airborne speed is 1.15 x bnd, so a clean
   bounder covers roughly twice the ground of a walker for about a third
   more air — worth doing, never free. Carrying cargo kills the jump, so
   it also kills the bound: that is the cost of the pods made physical. */
const BND_MAX=1.9, BND_STEP=0.14, BND_WIN=16;
let bnd=1, bndT=99;                   // bndT: frames since you last touched down
/* THE STATIC (Scott, 2026-08-24). Charge accrues on the suit in sunlight —
   slowly always, fast under a flare — and bleeds off in shadow. Scott's
   word was "per round", so it does NOT reset at a level boundary: a sloppy
   level 2 is still on your suit in level 3. Full charge DISCHARGES, and
   what it costs you is the radar, not blood. */
const STAT_MAX=100, STAT_BLIND=420;
let stat=0, statBlind=0, statMsgT=0;
/* HUNTED WHEN LOADED (2026-08-24). Assessors want diamonds. Once diamonds
   are in your hands, your hands are where the diamonds are. They still
   never touch you — canon holds — they take a stone back out of the bag.
   ALIEN_SPD is 0.0042 against a 0.0052 walk, so you can outrun one; you
   CANNOT outrun one while carrying a pod at 0.80 speed. That trade was
   already sitting in the numbers before this existed. */
const HUNT_LOCK=150, HUNT_NEAR=0.05, HUNT_BREAK=0.095;
/* --- THE PHASE SHIFT (Scott, 2026-08-24) ---------------------------------
   Levels 1-3 are the moon as it has always been, and each one leans a
   little harder on the same thread: the slab whose shadow is wrong. The
   hints are placed AT the thing, never in the HUD, so the player is being
   taught to look rather than told to go. Level 4 stops being a lap: the
   diamonds do not come back, the ceremony has nothing to receive, and the
   only object left on the map is the shaft. That IS the doozy. */
let hintedLv=0, shaftMsgT=0, descT=0, descended=false;
const SHAFT_HINTS={
  1:'The big slab throws its shadow the wrong way. You look at the sun, then back at it. It has not moved.',
  2:'The ground inside the wrong shadow gives, very slightly, and springs back. It is not solid down there.',
  3:'Something under the wrong shadow answers your bootfall. Twice. The second one is not an echo.'
};

/* move along the great circle you face; heading is carried with you */
function advance(a){
  const c=Math.cos(a), s=Math.sin(a);
  const P2=vn(vam(vm(P,c),H,s));
  H=vn(vam(vm(H,c),P,-s));
  P=P2;
}
function turnBy(t){
  const right=vx(H,P);
  H=vn(vam(vm(H,Math.cos(t)),right,Math.sin(t)));
}
/* keep the frame honest against drift */
function ortho(){ P=vn(P); H=vn(vam(H,P,-vd(H,P))); }
/* point `back` radians short of Q, facing straight at it (tests use this) */
function approach(Q,back){
  let t=vx(Q,[0,1,0]); if(Math.hypot(t[0],t[1],t[2])<1e-6) t=vx(Q,[1,0,0]);
  t=vn(t);
  P=vn(vam(vm(Q,Math.cos(back)),t,-Math.sin(back)));
  H=vn(vam(Q,P,-vd(Q,P)));
  camF=H.slice();
}
const bearingTo=Q=>{ const t=vam(Q,P,-vd(Q,P)); const l=Math.hypot(t[0],t[1],t[2]);
  return l<1e-9? 1 : vd(H,t)/l; };

function reset(){
  P=sph(0,0.18);
  H=vn(vam([1,0,0],P,-vd([1,0,0],P)));   // due east, honestly tangent
  camF=H.slice();
  z=0; vz=0; walking=false; backing=false; walkT=0;
  stones=STONES_LL.map(([la,lo])=>({Q:sph(la,lo), got:false}));
  tanks=TANKS_LL.map(([la,lo])=>({Q:sph(la,lo), got:false}));
  o2=O2_MAX; hearts=HEARTS0; score=0;
  meteors=[]; scorches=[]; metT=200; iframes=0;
  plantT=0; flagUp=0; doneT=0; over=false; deadT=0;
  introT=90; jumpLatch=true; parts=[]; prints=[]; printC=0; homeMsgT=0; hintT=540;
  flareMode=0; flareT=FLARE_EVERY;
  bnd=1; bndT=99; stat=0; statBlind=0; statMsgT=0;
  hintedLv=0; shaftMsgT=0; descT=0; descended=false;
  pods=PODS_LL.map(([la,lo])=>({Q:sph(la,lo), home:false})); carrying=-1;
  level=1; dropT=0; aliens=[]; alienT=0; tracks=[];
  for(const h of HARV) h.ph=h.ph0;
}
/* the stones return: same fixed spots (a remembered map stays rewarded),
   plopping down one after another from the sky */
function respawnStones(){
  stones.forEach((s,i)=>{ s.Q=sph(STONES_LL[i][0],STONES_LL[i][1]);
    s.got=false; s.away=0; s.fall=50+i*7; });
}
const stonesGot=()=> stones.filter(s=>s.got).length;

function hurt(){
  if(iframes>0) return;
  hearts--; iframes=90; vz=Math.max(vz,2.2);
  sfx.hurt && sfx.hurt();
  burst(CXS, SURF_Y-z*ZS-16, '#ff8a5a', 10);
  if(carrying>=0){                    // any hit knocks the cargo loose
    pods[carrying].Q=P.slice(); pods[carrying].cd=45; carrying=-1;
    toast('The cargo pod slips loose!');
  }
  if(hearts<=0){ over=true; doneT=170; sfx.denied && sfx.denied(); }
}
/* shadow is life — the one question the flare asks */
function inShadow(){
  if(vd(P,SUN_Q)<-0.06) return true;                       // the night side
  if(ad(P,LANDER_Q)<0.085) return true;                    // the lander's hull
  for(const cr of CRATERS) if(ad(P,cr.Q)<CRATER_HIDE(cr)) return true;
  for(const m of MONO){
    /* lane-frame test — matches the drawn lane exactly: how far DOWN the
       lane you are (along) and how far off its centreline (side) */
    const d=ad(P,m.Q); if(d>m.sh) continue;
    const dir=dirT(m.Q,P), perp=vn(vx(m.Q,m.tS));
    const along=vd(dir,m.tS)*d, side=Math.abs(vd(dir,perp))*d;
    if(along>0 && side<m.hw) return true;
  }
  for(const h of HARV) if(ad(P,harvQ(h))<0.06) return true;   // its bulk shades you
  return false;
}
/* FLARE GUIDANCE (Scott 2026-08-13): when the sun growls you get told WHERE
   and HOW FAR — the nearest shelter of any kind, and the seconds it takes
   to reach it at a walk, measured against the countdown. */
function nearestShelter(){
  let best=null, bd=1e9;
  const take=q=>{ const d=ad(P,q); if(d<bd){ bd=d; best=q; } };
  for(const m of MONO) take(vn(vam(m.Q,m.tS,m.sh*0.5)));   // mid-lane, squarely in shade
  for(const cr of CRATERS) take(cr.Q);
  take(LANDER_Q);
  { const dp=vd(P,SUN_Q);                                  // the terminator, a step past dark
    if(dp>-0.06 && dp<0.9){
      const T=vn(vam(P,SUN_Q,-dp)); take(vn(vam(T,SUN_Q,-0.09))); } }
  return {Q:best, d:bd, runS:Math.ceil(bd/W_SPD/60)};
}
/* walk a point toward a target along the great circle, capped at spd */
function stepToward(Q,tgt,spd){
  const d=ad(Q,tgt); if(d<1e-6) return Q;
  const t=dirT(Q,tgt), a=Math.min(spd,d);
  return vn(vam(vm(Q,Math.cos(a)),t,Math.sin(a)));
}
/* How likely a new Assessor comes for YOU instead of a stone on the ground.
   Empty-handed you are of no interest; holding all twelve you are the most
   interesting thing on the moon. This is the same instinct as the meteor
   clock — risk rises with what you stand to lose — and it is what turns the
   walk home from a victory lap into the tense part of the run. */
const huntChance=()=> stonesGot()/STONE_N*0.85;

function spawnAlien(tgtIdx){
  let tgt=tgtIdx;
  const hunting = tgtIdx===undefined && stonesGot()>0 && Math.random()<huntChance();
  if(!hunting && tgt===undefined){
    const open=stones.map((s,i)=>(!s.got&&!(s.away>0)&&!(s.fall>0))?i:-1).filter(i=>i>=0);
    if(!open.length){
      if(stonesGot()===0) return;               // nothing on the ground, nothing in hand
      tgt=-1;                                   // everything is in your hands, so: you
    } else tgt=open[(Math.random()*open.length)|0];
  } else if(hunting) tgt=-1;
  let Q=null;
  for(let k=0;k<24 && !Q;k++){                 // beyond the horizon, please
    const c=sph((Math.random()*2-1)*1.1, Math.random()*TAU);
    if(ad(c,P)>1.25) Q=c;
  }
  aliens.push({Q:Q||vm(P,-1), st: tgt<0? 'hunt':'seek', tgt, t:0, hov:46, carry:false});
}
/* it takes a diamond back OUT of your hands and drops it somewhere else */
function loseStone(){
  const held=stones.map((s,i)=>s.got?i:-1).filter(i=>i>=0);
  if(!held.length) return false;
  const s=stones[held[(Math.random()*held.length)|0]];
  s.got=false; s.away=ALIEN_AWAY;
  score=Math.max(0,score-100);
  return true;
}
function burst(x,y,col,n){
  for(let i=0;i<n;i++) parts.push({x,y,vx:(Math.random()-.5)*2.4,
    vy:(Math.random()-.5)*2-0.8, life:16+Math.random()*12, col});
}
function spawnMeteor(Q){ meteors.push({Q:vn(Q.slice()), t:-MET_WARN}); }

/* ---------------- update ---------------- */
function update(){
  if(introT>0){ introT--; return; }
  if(held.Escape){ if(!exitLatch){ exitLatch=true; startMoonwalkTrans('out'); return; } } else exitLatch=false;

  if(doneT>0){
    if(--doneT===0) startMoonwalkTrans('out');
    return;
  }
  if(deadT>0){ if(--deadT===0){ iframes=120; } return; }
  if(iframes>0) iframes--;
  if(homeMsgT>0) homeMsgT--;
  if(hintT>0) hintT--;

  /* the flag ceremony: stand at the lander with all twelve and it begins.
     Then — new since 2026-08-12 — the moon does NOT let you go: the
     stones plop back down from the sky and the next level starts. */
  if(plantT>0){
    plantT++;
    flagUp=Math.min(1, plantT/110);
    if(plantT===110){
      score+=500+(level-1)*250; sfx.win && sfx.win();
      if(!flags.moonwalkDone){ flags.moonwalkDone=true;
        res.gold=Math.min(999,res.gold+40);
        toast('FIRST FOOTPRINTS — +40 gold. The flag is yours forever.');
        saveGame && saveGame();
      }
      level++; plantT=0; flagUp=0; dropT=170;
      tanks=TANKS_LL.map(([la,lo])=>({Q:sph(la,lo), got:false}));
      aliens=[]; alienT=120;
      if(level>=DESCEND_LV){
        /* THE PHASE SHIFT. The diamonds do NOT come back. Three rounds of
           fetch-and-carry end here, and the moon has exactly one thing left
           on it. Everything that can still kill you still runs. */
        stones.forEach(s=>{ s.got=true; s.away=0; s.fall=0; });
        toast('The stones do not come back. The wrong shadow is open.');
      } else {
        respawnStones();
        if(level===2) toast('The sky flickers. Something has noticed the diamonds. It does not introduce itself.');
        else if(level===3) toast('LEVEL 3 — the stones return. Under the wrong shadow, something is keeping count.');
        else toast('LEVEL '+level+' — the stones return. The moon is less patient now.');
      }
    }
    return;
  }
  if(dropT>0) dropT--;
  // stone timers run even during the drop: fall = landing, away = stolen
  for(const s of stones){
    if(s.fall>0){ if(--s.fall===0){ const p=surfPt(s.Q); burst(p.x,p.y,'#d8dce4',5); sfx.task&&sfx.task(); } }
    if(s.away>0){ if(--s.away===0){
      s.Q=sph((Math.random()*2-1)*1.1, Math.random()*TAU); s.fall=45;
    } }
  }

  // turning — the camera pivots itself around behind you
  if(held.ArrowLeft) turnBy(-TURN);
  else if(held.ArrowRight) turnBy(TURN);

  // walking — the moon does the moving. DOWN backpedals.
  walking=false; backing=false;
  let dir=0;
  if(held.ArrowUp) dir=1;
  else if(held.ArrowDown) dir=-1;
  if(dir!==0){
    /* boulders block a GROUNDED walker — hop them. Monoliths block at
       ANY height — they are taller than you can jump; hug them for
       shade, walk around them to pass. */
    const aheadP=vn(vam(vm(P,Math.cos(0.030*dir)),H,Math.sin(0.030*dir)));
    const blocked = (z<14 && ROCKS_Q.some(q=>ad(aheadP,q)<0.026)) ||
                    MONO.some(m=>ad(aheadP,m.Q)<m.bl) ||
                    HARV.some(h=>ad(aheadP,harvQ(h))<HARV_BLOCK);
    if(!blocked){
      advance(dir*W_SPD*(dir<0?BACK_MUL:1)*(z>0?1.15*bnd:1)*(carrying>=0?POD_SPD:1));
      walking=true; backing=dir<0; walkT+=1;
      if(z===0 && walkT%9===0){                     // footprints, world-fixed
        const right=vx(H,P);
        prints.push({Q:vn(vam(P,right,((printC++%2)?1:-1)*0.006)), t:900});
        if(prints.length>90) prints.shift();
      }
    }
  } else walkT=0;
  ortho();
  // the auto-pivot: the camera heading eases in behind your real one
  camF=[camF[0]+(H[0]-camF[0])*0.18, camF[1]+(H[1]-camF[1])*0.18, camF[2]+(H[2]-camF[2])*0.18];
  camF=vn(vam(camF,P,-vd(camF,P)));

  // the low-gravity hop — unless you're carrying: then SPACE sets it down
  if(held[' ']){
    if(!jumpLatch && z===0){
      jumpLatch=true;
      if(carrying>=0){
        pods[carrying].Q=P.slice(); pods[carrying].cd=45; carrying=-1;
        burst(CXS, SURF_Y-4, '#d8dce4', 6);
        sfx.task && sfx.task();
        toast('Cargo set down.');
      } else {
        /* THE BOUND: hop again inside the window and the chain builds.
           The WINDOW decides build-or-reset; the cap only clamps the value.
           Testing `bnd<BND_MAX` in the condition instead made a chain
           collapse to 1 on the very hop after it maxed — a perfect run
           punished at the exact moment it was earned. */
        bnd = (bndT<=BND_WIN)? Math.min(BND_MAX, bnd+BND_STEP) : 1;
        bndT=99;
        z=0.01; vz=JUMP_V; o2=Math.max(0,o2-O2_JUMP);
        sfx.jump? sfx.jump() : (sfx.task&&sfx.task());
      }
    }
  } else jumpLatch=false;
  if(z>0 || vz>0){
    z+=vz; vz-=GRAV;
    if(z<=0){ z=0; vz=0; bndT=0;      // touchdown — the window opens here
      burst(CXS, SURF_Y+2, '#d8dce4', 4); }
  } else if(bndT<99){
    // grounded: the window is closing. Miss it and the chain is gone.
    if(++bndT>BND_WIN){ bndT=99; bnd=1; }
  }

  // breathing — thirstier every level, and the reserve bottle is SMALL now
  o2-=O2_DRAIN*(1+(level-1)*0.15);
  if(o2<=0){
    o2=30; hurt();
    if(!over) toast('Suit alarm — the reserve bottle. It is smaller than the last one.');
  }
  if(o2<25 && o2>0 && frame%50===0) sfx.task && sfx.task();   // the low-air tick

  // pickups (grounded or low)
  if(z<26){
    for(const s of stones) if(!s.got && !(s.fall>0) && !(s.away>0) && ad(P,s.Q)<0.032){
      s.got=true; score+=100; sfx.coin && sfx.coin();
      burst(CXS, SURF_Y-16, '#ffb35a', 8);
      if(stonesGot()===STONE_N) toast('Twelve of twelve. Take them home to the lander.');
    }
    for(const t of tanks) if(!t.got && ad(P,t.Q)<0.032){
      t.got=true; score+=25; o2=Math.min(O2_MAX,o2+O2_TANK);
      sfx.heart && sfx.heart();
      burst(CXS, SURF_Y-16, '#bfe8ff', 6);
    }
    // shoulder a cargo pod (grounded-ish, hands free)
    if(carrying<0 && z<10) for(let i=0;i<pods.length;i++){
      const pd=pods[i];                 // pd.cd: a just-dropped pod waits a beat
      if(!pd.home && !(pd.cd>0) && ad(P,pd.Q)<0.035){
        carrying=i; sfx.chest && sfx.chest();
        burst(CXS, SURF_Y-18, '#7fe87f', 6);
        toast('Cargo shouldered — no jumping now. SPACE sets it down.');
        break;
      }
    }
  }
  // home base: the lander tops you up, and takes the stones at the end
  if(ad(P,LANDER_Q)<0.08 && z===0){
    if(o2<O2_MAX-1 && homeMsgT===0){ homeMsgT=180; toast('The lander tops up your O2.'); }
    o2=O2_MAX;
    if(carrying>=0){                     // cargo home: stack it, breathe deep
      pods[carrying].home=true; carrying=-1;
      score+=POD_SCORE; sfx.win && sfx.win();
      burst(CXS, SURF_Y-20, '#7fe87f', 10);
      const left=pods.filter(p2=>!p2.home).length;
      toast(left? 'Cargo aboard — +'+POD_SCORE+'. '+left+' pod'+(left>1?'s':'')+' still out there.'
                : 'All cargo recovered — +'+POD_SCORE+'. The manifest is clean.');
    }
    if(stonesGot()===STONE_N && plantT===0){ plantT=1; sfx.chest && sfx.chest(); }
  }

  /* --- THE WRONG SHADOW: one thread, running through every round ---------
     The hints live AT the slab, never in the HUD, and only fire if you go
     and stand in the lane. A player who never looks gets told nothing —
     which is the point. One per level, escalating. */
  if(shaftMsgT>0) shaftMsgT--;
  { const dW=ad(P,SHAFT_Q);
    if(level<DESCEND_LV){
      if(dW<0.075 && hintedLv<level && SHAFT_HINTS[level]){
        hintedLv=level; toast(SHAFT_HINTS[level]); sfx.mine && sfx.mine();
      }
    } else if(!descended){
      if(dW<SHAFT_R && z===0){                 // you have to be ON the ground to fall in
        descended=true; descT=1; sfx.chest && sfx.chest();
      } else if(dW<0.17 && shaftMsgT===0){
        shaftMsgT=600; toast('The hole goes down further than the light does.');
      }
    }
  }
  if(descT>0){
    /* going down. The moon stops mattering — nothing up here can reach you
       now, so no hazard ticks while the descent plays. */
    descT++;
    if(descT===150){
      score+=2000;
      if(!flags.moonwalkDeep){
        flags.moonwalkDeep=true;
        res.gold=Math.min(999,res.gold+80);
        saveGame && saveGame();
      }
      over=false; doneT=220;
    }
    return;
  }

  // meteors — telegraphed, then a ground blast. Airborne = safe.
  if(--metT<=0){
    metT=Math.max(90, 250-stonesGot()*12-(level-1)*20);
    const phi=Math.random()*TAU, d=0.25+Math.random()*1.15;
    const right=vx(H,P);
    const t=vn(vam(vm(H,Math.cos(phi)),right,Math.sin(phi)));
    spawnMeteor(vam(vm(P,Math.cos(d)),t,Math.sin(d)));
  }
  for(let i=meteors.length-1;i>=0;i--){
    const m=meteors[i]; m.t++;
    if(m.t===0){ sfx.mine && sfx.mine(); }
    if(m.t>=MET_FALL){
      scorches.push({Q:m.Q, t:240});
      sfx.explode && sfx.explode();
      const p=surfPt(m.Q);
      burst(p.x, p.y, '#ff9a3c', 14); burst(p.x, p.y, '#ffe9a0', 8);
      if(ad(P,m.Q)<0.045 && z<20) hurt();
      meteors.splice(i,1);
    }
  }
  for(const pd of pods) if(pd.cd>0) pd.cd--;

  // THE HARVESTERS: crawl, chew, leak air, take no prisoners at the drum
  for(const h of HARV){
    h.ph+=h.spd;
    const Q=harvQ(h), dir=harvDir(h);
    if(frame%14===0){                              // churned twin tracks
      const perp=vx(Q,dir);
      tracks.push({Q:vn(vam(Q,perp, 0.010)), t:1400});
      tracks.push({Q:vn(vam(Q,perp,-0.010)), t:1400});
      if(tracks.length>170) tracks.splice(0,2);
    }
    if(ad(P,Q)<HARV_VENT){                          // the vent leaks spare O3
      o2=Math.min(O2_MAX, o2+0.5);
      if(!(h.msgT>0)){ h.msgT=240; toast('The harvester’s vent hisses spare O3 into your tanks.'); }
    }
    if(h.msgT>0) h.msgT--;
    const head=vn(vam(Q,dir,HARV_HEAD));            // the cutter drum
    if(ad(P,head)<HARV_CUT && z<14) hurt();
  }
  for(let i=tracks.length-1;i>=0;i--) if(--tracks[i].t<=0) tracks.splice(i,1);

  // THE ASSESSORS (level 2+): they come for the diamonds, not for you
  if(level>=2){
    const want=Math.min(3, level-1);
    if(aliens.length<want && --alienT<=0){ spawnAlien(); alienT=ALIEN_EVERY; }
  }
  for(let i=aliens.length-1;i>=0;i--){
    const a=aliens[i];
    const tgtS=stones[a.tgt];
    if(a.st==='hunt'){
      /* it comes for the diamonds in your hands. Empty them — by getting
         home — and it loses interest entirely. */
      if(stonesGot()===0){ a.st='flee'; a.t=160; continue; }
      a.Q=stepToward(a.Q, P, ALIEN_SPD);
      if(ad(a.Q,P)<HUNT_NEAR){
        a.st='lift'; a.t=HUNT_LOCK;
        if(!a.warned){ a.warned=true; toast('A light comes down over you. It is not interested in the ground.'); }
      }
      continue;
    }
    if(a.st==='lift'){
      /* THE ESCAPES: empty your hands, outrun it, or reach the lander.
         In the lock it tracks at full ALIEN_SPD (0.00420) against a laden
         walk of W_SPD*POD_SPD (0.00416) — so hauling a pod means it gains
         on you, slowly, and cannot be shaken except by going home. Unladen
         you walk 0.00520 and leave it behind comfortably. That knife-edge
         is the pod's real price, and this is the only place it shows up. */
      if(stonesGot()===0){ a.st='flee'; a.t=160; continue; }
      if(ad(P,LANDER_Q)<0.08){
        a.st='flee'; a.t=160;
        toast('The lander’s hull breaks the beam. It withdraws.');
        sfx.mine && sfx.mine();
      } else if(ad(a.Q,P)>HUNT_BREAK){
        a.st='hunt';                      // you broke away — it follows again
      } else if(--a.t<=0){
        if(loseStone()){
          sfx.denied && sfx.denied();
          burst(CXS, SURF_Y-z*ZS-20, '#c9b5ff', 12);
          toast('It takes a diamond out of your hands. It will land somewhere.');
        }
        a.st='flee'; a.t=160; a.carry=true;
      } else {
        a.Q=stepToward(a.Q, P, ALIEN_SPD);
      }
      continue;
    }
    if(a.st==='seek'){
      if(!tgtS || tgtS.got || tgtS.away>0 || tgtS.fall>0){
        const open=stones.map((s,j)=>(!s.got&&!(s.away>0)&&!(s.fall>0))?j:-1).filter(j=>j>=0);
        if(!open.length){
          /* the ground is bare. If you cleared it, the diamonds did not
             stop existing — they moved into your hands, and so does it. */
          if(stonesGot()>0){ a.st='hunt'; a.tgt=-1; continue; }
          a.st='flee'; a.t=160; continue;
        }
        a.tgt=open[(Math.random()*open.length)|0]; continue;
      }
      a.Q=stepToward(a.Q, tgtS.Q, ALIEN_SPD);
      if(ad(a.Q,tgtS.Q)<0.012){ a.st='beam'; a.t=ALIEN_BEAM; }
    } else if(a.st==='beam'){
      if(ad(P,a.Q)<0.06){                           // walked into the beam: spooked
        a.st='flee'; a.t=160; a.carry=false;
        sfx.mine && sfx.mine();
        toast('The light withdraws. It leaves the diamond.');
      } else if(--a.t<=0){                          // beamed up, to be re-dropped
        tgtS.away=ALIEN_AWAY;
        a.st='flee'; a.t=160; a.carry=true;
        sfx.mine && sfx.mine();
        toast('A diamond rises into the light and is gone. It will land somewhere.');
      }
    } else {                                        // flee: rise and leave
      a.hov=Math.min(120, a.hov+1.2);
      const t=dirT(a.Q,P);
      a.Q=vn(vam(vm(a.Q,Math.cos(ALIEN_SPD*1.4)), t, -Math.sin(ALIEN_SPD*1.4)));
      if(--a.t<=0) aliens.splice(i,1);
    }
  }

  const shaded=inShadow();            // asked once — the static and the flare share the answer
  // the solar flare clock: quiet -> radio warning -> hard radiation
  if(flareMode===0){
    if(--flareT<=0){
      flareMode=1; flareT=FLARE_WARN;
      toast('SUIT RADIO: solar flare building. Get to shadow — a monolith, a crater, the lander, or night side.');
      sfx.mine && sfx.mine();
    }
  } else if(flareMode===1){
    if(--flareT<=0){ flareMode=2; flareT=FLARE_LEN; sfx.explode && sfx.explode(); }
  } else {
    if(!shaded){
      hurt();                            // iframes throttle this to ~1 heart/1.5s
      if(frame%5===0) parts.push({x:CXS+(Math.random()-.5)*30, y:SURF_Y-z*ZS-40,
        vx:(Math.random()-.5)*1.4, vy:1.6+Math.random(), life:10+Math.random()*8, col:'#ffd76e'});
    }
    if(--flareT<=0){ flareMode=0; flareT=FLARE_EVERY; toast('The flare passes. The suit ticks as it cools.'); }
  }

  /* --- THE STATIC --- charge in the light, bleed in the dark. Note this
     runs OUTSIDE the flare branches on purpose: sunlight always charges
     you a little, so the meter is alive between flares instead of being
     furniture nine tenths of the time. Deliberately NOT reset on level-up. */
  if(statBlind>0) statBlind--;
  if(statMsgT>0) statMsgT--;
  if(shaded) stat=Math.max(0, stat-0.25);
  else stat=Math.min(STAT_MAX, stat + (flareMode===2? 0.34 : flareMode===1? 0.12 : 0.018));
  if(stat>=STAT_MAX){
    /* DISCHARGE. It costs you the radar, not blood — unless you are
       standing next to something conductive, in which case the charge
       goes THROUGH you to reach it. Sheltering at the lander during a
       flare is still right; sheltering there at 99% static is not. */
    stat=22; statBlind=STAT_BLIND;
    sfx.explode && sfx.explode();
    burst(CXS, SURF_Y-z*ZS-30, '#bfe8ff', 14);
    burst(CXS, SURF_Y-z*ZS-30, '#eef0f6', 8);
    const metal = ad(P,LANDER_Q)<0.10 || carrying>=0 ||
                  HARV.some(h=>ad(P,harvQ(h))<0.07) ||
                  pods.some(pd=>!pd.home && ad(P,pd.Q)<0.06);
    if(metal){ hurt(); toast('The charge finds metal and goes through you to reach it. Radar is dead.'); }
    else toast('The suit discharges into the regolith. Radar is dead until it settles.');
  } else if(stat>78 && statMsgT===0 && statBlind===0){
    statMsgT=420; toast('The suit is buzzing. Get into shadow.');
  }

  for(let i=scorches.length-1;i>=0;i--) if(--scorches[i].t<=0) scorches.splice(i,1);
  for(let i=prints.length-1;i>=0;i--) if(--prints[i].t<=0) prints.splice(i,1);

  for(let i=parts.length-1;i>=0;i--){ const q=parts[i];
    q.x+=q.vx; q.y+=q.vy; q.vy+=0.04; if(--q.life<=0) parts.splice(i,1); }
}

/* --- the projection: full 3D through the eased chase camera.
   Returns screen x/y, the scale at that depth, and the depth
   itself for painter sorting — or null past the camera. --- */
let _Rt=[0,-1,0];
function camBasis(){
  _Rt=vn(vx(camF,P));
}
/* a world point -> chart coords (forward arc f, lateral arc l, in px
   along the ground) -> perspective depth -> screen, then bowed toward
   the literal horizon arc by w (0 underfoot, 1 at the horizon). */
function toCam(Q,h){
  const u=ad(Q,P);
  let fb=1, rb=0;
  if(u>1e-9){
    const t=vam(Q,P,-vd(Q,P)); const l=Math.hypot(t[0],t[1],t[2]);
    if(l>1e-12){ fb=vd(t,camF)/l; rb=vd(t,_Rt)/l; }
  }
  const f=u*fb*R, l=u*rb*R;
  const d=CB+DSAT(f);
  if(d<24) return null;
  const s=FOC/d;
  const x=CXS+l*s;
  let y=CY0+(CH+RISE(f)-(h||0))*s;
  const w=Math.max(0,Math.min(1,(S0-s)/(S0-SH)));
  y+=BOW(x)*w;
  return { x, y, s, d };
}
/* legacy shim used by tests/effects: forward/lateral angles -> screen */
function proj(u,v,h){
  const cv=Math.cos(v||0);
  const Q=vn(vam(vam(vm(P,cv*Math.cos(u)),camF,cv*Math.sin(u)),_Rt,Math.sin(v||0)));
  return toCam(Q,h);
}
/* screen position of a surface point (effects want this; off-view
   points park offscreen so their particles never show) */
function surfPt(Q){
  camBasis();
  const p=toCam(Q,0);
  return p || {x:-200,y:-200};
}

/* ---------------- draw ---------------- */
function drawSky(g){
  const sg=g.createLinearGradient(0,HUD,0,HUD+RH);
  sg.addColorStop(0,'#1f1638'); sg.addColorStop(1,'#37285c');
  g.fillStyle=sg; g.fillRect(0,HUD,RW,RH);
  /* stars are fixed points in SPACE: project their directions through
     the camera rotation. Walk and they wheel; turn and they sweep. */
  for(const st of STARS){
    const dx=vd(st.Q,camF); if(dx<0.25) continue;
    const sx=CXS+vd(st.Q,_Rt)/dx*FOC, sy=CY0-vd(st.Q,P)/dx*FOC;
    if(sy<HUD+2||sy>HUD+RH||sx<0||sx>RW) continue;
    const tw=0.35+0.5*Math.abs(Math.sin(frame*0.02+st.h*9));
    g.fillStyle='rgba(238,236,255,'+(0.25+st.h*0.5*tw).toFixed(2)+')';
    g.fillRect(sx|0, sy|0, 2, 2);
  }
  for(let i=0;i<SPARKS.length;i++){
    const q=SPARKS[i], dx=vd(q,camF); if(dx<0.3) continue;
    const sx=CXS+vd(q,_Rt)/dx*FOC, sy=CY0-vd(q,P)/dx*FOC;
    if(sy<HUD+6||sy>HUD+RH-6||sx<6||sx>RW-6) continue;
    const a2=0.35+0.4*Math.abs(Math.sin(frame*0.03+i*2));
    g.fillStyle='rgba(255,255,255,'+a2.toFixed(2)+')';
    g.fillRect(sx-1,sy-5,2,10); g.fillRect(sx-5,sy-1,10,2);
  }
  // home, far away and very blue — it rises and sets as you walk
  { const dx=vd(EARTH_Q,camF);
    if(dx>0.3){
      const ex=CXS+vd(EARTH_Q,_Rt)/dx*FOC, ey=CY0-vd(EARTH_Q,P)/dx*FOC;
      if(ex>-20&&ex<RW+20&&ey>HUD-20&&ey<HUD+RH){
        g.fillStyle='#3a6fd8'; g.beginPath(); g.arc(ex,ey,11,0,7); g.fill();
        g.fillStyle='#5a9ae8';
        g.beginPath(); g.arc(ex-3,ey-2,4,0,7); g.arc(ex+4,ey+4,3,0,7); g.fill();
        g.fillStyle='#8ac48a'; g.beginPath(); g.arc(ex+3,ey-4,2.4,0,7); g.fill();
        g.fillStyle='rgba(0,0,10,.35)';
        g.beginPath(); g.arc(ex+4,ey,11,-1.6,1.6); g.arc(ex,ey,11,1.6,-1.6,true); g.fill();
        g.strokeStyle='rgba(20,16,40,.6)'; g.lineWidth=1.2;
        g.beginPath(); g.arc(ex,ey,11,0,7); g.stroke();
      }
    }
  }
  // THE SUN — a fixed point in space; it swells and rages before a flare
  { const dx=vd(SUN_Q,camF);
    if(dx>0.3){
      const sx=CXS+vd(SUN_Q,_Rt)/dx*FOC, sy=CY0-vd(SUN_Q,P)/dx*FOC;
      if(sx>-40&&sx<RW+40&&sy>HUD-40&&sy<HUD+RH){
        const rage= flareMode===2? 1 : flareMode===1? 1-flareT/FLARE_WARN : 0;
        const rr=10+rage*6+(flareMode? Math.sin(frame*0.25)*2.5*rage : 0);
        const halo=g.createRadialGradient(sx,sy,2,sx,sy,rr*3.2);
        halo.addColorStop(0,'rgba(255,238,180,'+(0.55+rage*0.35).toFixed(2)+')');
        halo.addColorStop(1,'rgba(255,180,80,0)');
        g.fillStyle=halo; g.beginPath(); g.arc(sx,sy,rr*3.2,0,7); g.fill();
        g.fillStyle= flareMode===2? '#fff2c8':'#ffe9a0';
        g.beginPath(); g.arc(sx,sy,rr,0,7); g.fill();
        g.strokeStyle='rgba(255,170,60,'+(0.6+rage*0.4).toFixed(2)+')'; g.lineWidth=1.6;
        for(let i=0;i<8;i++){                       // spikes, longer as it angers
          const a2=i*TAU/8+frame*0.004, L2=rr+5+rage*9+((i%2)? 3:0);
          g.beginPath(); g.moveTo(sx+Math.cos(a2)*(rr+2),sy+Math.sin(a2)*(rr+2));
          g.lineTo(sx+Math.cos(a2)*L2,sy+Math.sin(a2)*L2); g.stroke();
        }
      }
    }
  }
  // the flare washes the whole sky hot
  if(flareMode){
    const w= flareMode===2? 0.16+0.06*Math.sin(frame*0.3) : (1-flareT/FLARE_WARN)*0.08;
    g.fillStyle='rgba(255,140,50,'+w.toFixed(3)+')';
    g.fillRect(0,HUD,RW,RH);
  }
}

/* the drawn horizon IS a circle: centre (CXS, HY+RC), radius RC.
   th is the angle from the apex; dy nudges the whole arc down. */
function horizonPt(th,dy){
  return { x:CXS+RC*Math.sin(th), y:HY+(dy||0)+RC*(1-Math.cos(th)), s:SH };
}
/* adds the arc (spanning past both screen edges) to the current path */
function horizonPath(g,dy){
  g.arc(CXS, HY+(dy||0)+RC, RC, -Math.PI/2-0.58, -Math.PI/2+0.58);
}

function drawGround(g){
  // the ball itself: everything below the bowed horizon arc
  g.beginPath();
  horizonPath(g,0);
  g.lineTo(RW+60,HUD+RH+60); g.lineTo(-60,HUD+RH+60); g.closePath();
  const hg=g.createLinearGradient(0,CY0+44,0,HUD+RH);
  hg.addColorStop(0,'#cdd1d8'); hg.addColorStop(0.55,'#b4b8c2'); hg.addColorStop(1,'#8e93a2');
  g.fillStyle=hg; g.fill();
  // ink line where moon meets sky — the poster look
  g.strokeStyle='#241c3a'; g.lineWidth=3;
  g.beginPath(); horizonPath(g,0); g.stroke();
  g.strokeStyle='rgba(238,240,248,.5)'; g.lineWidth=1.4;
  g.beginPath(); horizonPath(g,2.5); g.stroke();
  // a soft distance haze hugging the rim
  g.strokeStyle='rgba(238,240,248,.10)'; g.lineWidth=16;
  g.beginPath(); horizonPath(g,11); g.stroke();
  drawTiles(g);
  // world-fixed grit scrolls underfoot — the motion feedback
  for(let i=0;i<SPECK.length;i++){
    const q=SPECK[i];
    if(vd(q,P)<CULL_GRIT) continue;
    const p=toCam(q,0); if(!p) continue;
    g.fillStyle='rgba(60,58,80,'+(0.08+hash2(i,7)*0.14).toFixed(2)+')';
    g.fillRect(p.x, p.y, 2.6*p.s, 2.6*p.s);
  }
  // the harvesters' churned twin tracks — they last a long time
  for(const tk of tracks){
    if(vd(tk.Q,P)<CULL_GRIT) continue;
    const p=toCam(tk.Q,0); if(!p) continue;
    g.fillStyle='rgba(44,40,66,'+(0.34*Math.min(1,tk.t/300)).toFixed(2)+')';
    g.fillRect(p.x-2.2*p.s, p.y, 4.4*p.s, 2*p.s);
  }
  // your own footprints, fading behind you
  for(const fp of prints){
    if(vd(fp.Q,P)<CULL_GRIT) continue;
    const p=toCam(fp.Q,0); if(!p) continue;
    g.fillStyle='rgba(50,46,72,'+(0.30*Math.min(1,fp.t/240)).toFixed(2)+')';
    g.fillRect(p.x-1.2*p.s, p.y, 2.4*p.s, 1.6*p.s);
  }
  // craters — recessed, ink-lined
  for(const cr of CRATERS){
    if(vd(cr.Q,P)<CULL_FEAT) continue;
    const p=toCam(cr.Q,0); if(!p) continue;
    const s=p.s, w=cr.w;
    g.fillStyle='#9aa0ad';
    g.beginPath(); g.ellipse(p.x,p.y+3*s,w*s,w*0.36*s,0,0,7); g.fill();
    g.fillStyle='#787e8e';
    g.beginPath(); g.ellipse(p.x,p.y+1.8*s,w*0.82*s,w*0.27*s,0,0,7); g.fill();
    g.strokeStyle='#2a2440'; g.lineWidth=Math.max(1,1.6*s);
    g.beginPath(); g.ellipse(p.x,p.y+3*s,w*s,w*0.36*s,0,0,7); g.stroke();
    g.strokeStyle='rgba(238,240,248,.55)'; g.lineWidth=Math.max(1,1.4*s);
    g.beginPath(); g.ellipse(p.x,p.y+4.4*s,w*0.9*s,w*0.31*s,0,0.35,Math.PI-0.35); g.stroke();
  }
  /* monolith shadow lanes — always faintly there (the sun casts them),
     bold + safe-blue-rimmed whenever the sun is angry. The lane IS the
     shelter zone: stand in it and the flare cannot touch you. */
  for(const m of MONO){
    if(vd(m.Q,P)<CULL_FEAT) continue;
    const perp=vn(vx(m.Q,m.tS));
    const lane=[ toCam(vn(vam(vam(m.Q,m.tS,0.010),perp, 0.016*m.sc)),0),
                 toCam(vn(vam(vam(m.Q,m.tS,0.010),perp,-0.016*m.sc)),0),
                 toCam(vn(vam(vam(m.Q,m.tS,m.sh),perp,-m.hw)),0),
                 toCam(vn(vam(vam(m.Q,m.tS,m.sh),perp, m.hw)),0) ];
    if(!lane.every(Boolean)) continue;
    const hot=flareMode>0;
    g.fillStyle= hot? 'rgba(16,12,36,.42)' : 'rgba(24,20,44,.16)';
    g.beginPath(); g.moveTo(lane[0].x,lane[0].y); g.lineTo(lane[1].x,lane[1].y);
    g.lineTo(lane[2].x,lane[2].y); g.lineTo(lane[3].x,lane[3].y); g.closePath(); g.fill();
    if(hot){
      g.strokeStyle='rgba(127,216,255,'+(0.35+0.3*Math.abs(Math.sin(frame*0.12))).toFixed(2)+')';
      g.lineWidth=1.6; g.stroke();
    }
  }
  // craters + lander advertise their shelter too while the sun is angry
  if(flareMode>0){
    const pa=(0.30+0.28*Math.abs(Math.sin(frame*0.12))).toFixed(2);
    g.strokeStyle='rgba(127,216,255,'+pa+')'; g.lineWidth=1.6;
    for(const cr of CRATERS){
      if(vd(cr.Q,P)<CULL_FEAT) continue;
      const p=toCam(cr.Q,0); if(!p) continue;
      g.beginPath(); g.ellipse(p.x,p.y+2*p.s,cr.w*0.8*p.s,cr.w*0.29*p.s,0,0,7); g.stroke();
    }
    { const p=toCam(LANDER_Q,0);
      if(p){ g.beginPath(); g.ellipse(p.x,p.y+2*p.s,34*p.s,12*p.s,0,0,7); g.stroke(); } }
  }
  // scorch marks where meteors landed
  for(const sc of scorches){
    if(vd(sc.Q,P)<CULL_FEAT) continue;
    const p=toCam(sc.Q,0); if(!p) continue;
    g.globalAlpha=Math.min(1,sc.t/120);
    g.fillStyle='#4a4050';
    g.beginPath(); g.ellipse(p.x,p.y+1*p.s,13*p.s,4.6*p.s,0,0,7); g.fill();
    g.fillStyle='rgba(255,140,60,'+(Math.min(1,sc.t/120)*0.5*(0.5+0.5*Math.sin(frame*0.3))).toFixed(2)+')';
    g.beginPath(); g.ellipse(p.x,p.y+0.5*p.s,6*p.s,2.2*p.s,0,0,7); g.fill();
    g.globalAlpha=1;
  }
  /* THE SHAFT — a ground feature, not an object, so it paints with the
     craters and scorches rather than sorting against them. Before the
     phase shift it is only a seam: visible if you go and stand there,
     meaningless if you never do. After, it is open and it is lit. */
  if(vd(SHAFT_Q,P)>=CULL_FEAT){
    const p=toCam(SHAFT_Q,0);
    if(p){
      const rx=SHAFT_R*R*1.15*p.s, ry=rx*0.36;
      if(level<DESCEND_LV){
        g.strokeStyle='rgba(58,56,78,.6)'; g.lineWidth=1.4*p.s;
        g.beginPath(); g.ellipse(p.x,p.y,rx,ry,0,0,7); g.stroke();
      } else {
        const gr=g.createRadialGradient(p.x,p.y,1,p.x,p.y,Math.max(2,rx));
        gr.addColorStop(0,'#000000'); gr.addColorStop(0.7,'#05030c'); gr.addColorStop(1,'#171028');
        g.fillStyle=gr;
        g.beginPath(); g.ellipse(p.x,p.y,rx,ry,0,0,7); g.fill();
        g.strokeStyle='#241c3a'; g.lineWidth=2.2*p.s;
        g.beginPath(); g.ellipse(p.x,p.y,rx,ry,0,0,7); g.stroke();
        g.strokeStyle='rgba(191,232,255,'+(0.30+0.26*Math.sin(frame*0.06)).toFixed(2)+')';
        g.lineWidth=1.5*p.s;
        g.beginPath(); g.ellipse(p.x,p.y-ry*0.16,rx*0.8,ry*0.68,0,0,7); g.stroke();
      }
    }
  }
}

/* --- the tiled terrain. Each visible tile paints its wash (the
   tonal quad that makes the tiling read) and its hashed feature.
   Feature vertices are small angular offsets in the tile's own
   east/north frame, projected point-by-point so every shape lies
   honestly on the ball. Screen size of an offset a is ~R*a*p.s
   (arc lengths are preserved on the visual sphere). --- */
const CULL_TILE=Math.cos(UH-0.10), CULL_GRIT=Math.cos(UH-0.01), CULL_FEAT=Math.cos(UH-0.02);
function drawTiles(g){
  for(const t of TILES){
    if(vd(t.Q,P)<CULL_TILE) continue;            // whole tile inside the horizon (dot-cull, no acos)
    const ctr=toCam(t.Q,0); if(!ctr) continue;
    const s=ctr.s;
    // the wash — the visible tiling
    const c00=toCam(t.q00,0), c01=toCam(t.q01,0), c11=toCam(t.q11,0), c10=toCam(t.q10,0);
    if(c00&&c01&&c11&&c10){
      const a2=(0.035+((t.h2*7)%1)*0.075).toFixed(3);
      g.fillStyle=(t.h2<0.5? 'rgba(24,20,44,':'rgba(238,240,248,')+a2+')';
      g.beginPath(); g.moveTo(c00.x,c00.y); g.lineTo(c01.x,c01.y);
      g.lineTo(c11.x,c11.y); g.lineTo(c10.x,c10.y); g.closePath(); g.fill();
    }
    // the feature — a pure function of the tile's hash
    const tp=(fx,fy)=>toCam(vn(vam(vam(t.Q,t.e,fx),t.n,fy)),0);
    if(t.h<0.30){ /* plain — breathing room */ }
    else if(t.h<0.45){                            // dust blot
      g.fillStyle= t.h2<0.5? 'rgba(138,144,162,.40)':'rgba(224,228,238,.38)';
      g.beginPath();
      g.ellipse(ctr.x,ctr.y, 23*s*(0.7+t.h*0.6), 8.5*s*(0.7+t.h2*0.6), 0,0,7);
      g.fill();
    }
    else if(t.h<0.62){                            // rubble field
      for(let j=0;j<4;j++){
        const p=tp((hash2(j*5+2,j*11+7)-0.5)*0.10*(0.5+t.h2),
                   (hash2(j*13+3,j*7+1)-0.5)*0.10*(0.5+t.h));
        if(!p) continue;
        g.fillStyle= j%2? '#9aa0ad':'#878da0';
        g.fillRect(p.x-2*p.s, p.y-1.4*p.s, 4*p.s, 2.8*p.s);
        g.fillStyle='rgba(36,28,58,.5)';
        g.fillRect(p.x-2*p.s, p.y+1*p.s, 4*p.s, 0.8*p.s);
      }
    }
    else if(t.h<0.76){                            // cracked ground
      g.strokeStyle='rgba(42,36,64,.55)'; g.lineWidth=Math.max(0.8,1.4*s); g.lineCap='round';
      for(let k=0;k<2;k++){
        let fx=(hash2(k*9+1,k*3+5)-0.5)*0.09, fy=(hash2(k*5+8,k*7+2)-0.5)*0.09;
        const a0=t.h2*TAU+k*2.2;
        g.beginPath(); let ok=false;
        for(let j2=0;j2<4;j2++){
          const p=tp(fx,fy);
          if(!p){ ok=false; break; }
          if(j2===0){ g.moveTo(p.x,p.y); } else g.lineTo(p.x,p.y);
          ok=true;
          const aj=a0+(hash2(j2*7+k,j2*3+1)-0.5)*1.7;
          fx+=Math.cos(aj)*0.033; fy+=Math.sin(aj)*0.033;
        }
        if(ok) g.stroke();
      }
    }
    else if(t.h<0.90){                            // RAVINE — the deep cut
      const th2=t.h2*Math.PI, ux=Math.cos(th2), uy=Math.sin(th2);
      const L=0.075, W2=0.016+t.h*0.014, px2=-uy, py2=ux;
      const V=[[ux*L,uy*L],
               [ux*L*0.45+px2*W2, uy*L*0.45+py2*W2],
               [-ux*L*0.35+px2*W2*1.1, -uy*L*0.35+py2*W2*1.1],
               [-ux*L,-uy*L],
               [-ux*L*0.35-px2*W2*1.1, -uy*L*0.35-py2*W2*1.1],
               [ux*L*0.45-px2*W2, uy*L*0.45-py2*W2]];
      const pts=V.map(v=>tp(v[0],v[1]));
      if(pts.every(Boolean)){
        g.fillStyle='#6e7383';
        g.beginPath(); g.moveTo(pts[0].x,pts[0].y);
        for(let j3=1;j3<6;j3++) g.lineTo(pts[j3].x,pts[j3].y);
        g.closePath(); g.fill();
        g.strokeStyle='rgba(36,28,58,.8)'; g.lineWidth=Math.max(1,1.4*s); g.stroke();
        const core=V.map(v=>tp(v[0]*0.55,v[1]*0.55));
        if(core.every(Boolean)){
          g.fillStyle='#4e5266';
          g.beginPath(); g.moveTo(core[0].x,core[0].y);
          for(let j4=1;j4<6;j4++) g.lineTo(core[j4].x,core[j4].y);
          g.closePath(); g.fill();
        }
      }
    }
    else {                                        // ridge — a lit spine
      const th3=t.h2*Math.PI, ux=Math.cos(th3), uy=Math.sin(th3);
      const L=0.07, a3=tp(-ux*L,-uy*L), b3=tp(ux*0.1-uy*0.012,uy*0.1+ux*0.012), c3=tp(ux*L,uy*L);
      if(a3&&b3&&c3){
        g.strokeStyle='rgba(60,58,86,.45)'; g.lineWidth=Math.max(1,2.6*s); g.lineCap='round';
        g.beginPath(); g.moveTo(a3.x,a3.y+2.2*s);
        g.quadraticCurveTo(b3.x,b3.y+2.2*s,c3.x,c3.y+2.2*s); g.stroke();
        g.strokeStyle='#e2e6ee'; g.lineWidth=Math.max(1,2*s);
        g.beginPath(); g.moveTo(a3.x,a3.y);
        g.quadraticCurveTo(b3.x,b3.y,c3.x,c3.y); g.stroke();
      }
    }
  }
}

/* --- surface sprites: each draws at a projected point p, scaled by
   p.s so things shrink toward the horizon and loom up close --- */
function drawRock(g,p){
  g.save(); g.translate(p.x,p.y); g.scale(p.s,p.s);
  g.fillStyle='#8e93a2';
  g.beginPath();
  g.moveTo(-11,2); g.lineTo(-8,-11); g.lineTo(-1,-15); g.lineTo(8,-10);
  g.lineTo(11,2); g.closePath(); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=2; g.stroke();
  g.fillStyle='rgba(238,240,248,.5)'; g.fillRect(-5,-11,4,3);
  g.fillStyle='rgba(255,122,26,.55)'; g.fillRect(3,-6,2.4,2.4);
  g.restore();
}
/* glowing chevrons on the ground, walking from your feet toward the
   nearest shelter — the panic-proof answer to "which way do I run" */
function drawShelterGuide(g){
  const ns=nearestShelter(); if(!ns.Q || ns.d<0.015) return;
  const dir=dirT(P,ns.Q);
  for(let i=1;i<=4;i++){
    const d=0.022*i; if(d>ns.d+0.01) break;
    const q=vn(vam(P,dir,d)), q2=vn(vam(P,dir,d+0.008));
    const p=toCam(q,0), p2=toCam(q2,0); if(!p||!p2) continue;
    const an=Math.atan2(p2.y-p.y,p2.x-p.x);
    const a=Math.max(0.2, 0.55+0.4*Math.sin(frame*0.25-i*0.9));
    g.save(); g.translate(p.x,p.y); g.rotate(an);
    g.strokeStyle='rgba(127,216,255,'+a.toFixed(2)+')';
    g.lineWidth=2.4*p.s; g.lineCap='round';
    g.beginPath(); g.moveTo(-4*p.s,-5*p.s); g.lineTo(3*p.s,0); g.lineTo(-4*p.s,5*p.s); g.stroke();
    g.restore();
  }
}
/* a MONOLITH: a tall basalt slab, taller than any jump — the certain
   shelter. Sunlit edge carries a warm rim light; the shade face is
   flat dark, so which side is safe reads at a glance. */
function drawMono(g,p,m){
  const sunSide= vd(SUN_Q,_Rt)>=0? 1 : -1;
  const sc=(m&&m.sc)||1;
  g.save(); g.translate(p.x,p.y); g.scale(p.s*sc,p.s*sc);
  g.fillStyle='rgba(20,16,40,.30)';                       // ground contact
  g.beginPath(); g.ellipse(0,1.5,13,4,0,0,7); g.fill();
  g.fillStyle='#565b6e';                                  // the slab
  g.beginPath();
  g.moveTo(-10,2); g.lineTo(-8.4,-46); g.lineTo(-3,-52); g.lineTo(6.6,-49);
  g.lineTo(9.6,-44); g.lineTo(10,2); g.closePath(); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=2.2; g.stroke();
  g.fillStyle='rgba(24,20,44,.45)';                       // shade face
  g.beginPath();
  if(sunSide>0){ g.moveTo(-10,2); g.lineTo(-8.4,-46); g.lineTo(-3,-52); g.lineTo(-2,2); }
  else { g.moveTo(10,2); g.lineTo(9.6,-44); g.lineTo(6.6,-49); g.lineTo(2,2); }
  g.closePath(); g.fill();
  g.strokeStyle= flareMode? '#ffd76e' : 'rgba(238,240,248,.65)';   // sunlit rim
  g.lineWidth= flareMode? 2.4 : 1.6;
  g.beginPath();
  if(sunSide>0){ g.moveTo(9.8,-2); g.lineTo(9.6,-44); g.lineTo(6.6,-49); }
  else { g.moveTo(-9.8,-2); g.lineTo(-8.4,-46); g.lineTo(-3,-52); }
  g.stroke();
  g.strokeStyle='rgba(20,16,36,.5)'; g.lineWidth=1.2;     // old cracks
  g.beginPath(); g.moveTo(-4,-38); g.lineTo(-1,-30); g.lineTo(-5,-22); g.stroke();
  g.beginPath(); g.moveTo(4,-16); g.lineTo(2,-9); g.stroke();
  g.restore();
}
/* a CARGO POD in its crash scar: strobing beacon, stencilled crate */
function drawPod(g,p){
  g.save(); g.translate(p.x,p.y); g.scale(p.s,p.s);
  g.fillStyle='#787e8e';                                  // the gouged trench
  g.beginPath(); g.ellipse(-14,2,17,4.6,0.16,0,7); g.fill();
  g.fillStyle='#4a4050';
  g.beginPath(); g.ellipse(-8,1.4,10,3,0.16,0,7); g.fill();
  g.fillStyle='#9aa0ad';                                  // flung debris
  g.fillRect(-26,-2,3,2.2); g.fillRect(-20,3,2.4,2); g.fillRect(14,1,2.6,2.2);
  const gl=g.createRadialGradient(0,-8,1,0,-8,18);        // beacon glow
  gl.addColorStop(0,'rgba(127,232,127,'+(0.28+0.22*Math.sin(frame*0.2)).toFixed(2)+')');
  gl.addColorStop(1,'rgba(127,232,127,0)');
  g.fillStyle=gl; g.beginPath(); g.arc(0,-8,18,0,7); g.fill();
  const tg=g.createLinearGradient(0,-15,0,0);             // the crate
  tg.addColorStop(0,'#e8ecf4'); tg.addColorStop(1,'#b4bac8');
  g.fillStyle=tg;
  g.beginPath(); g.roundRect? g.roundRect(-9,-15,18,15,3) : g.rect(-9,-15,18,15); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=1.8; g.stroke();
  g.fillStyle='#ff7a1a'; g.fillRect(-9,-11,18,2.6);       // hazard stripe
  g.fillStyle='#241c3a'; g.font='bold 6px '+FONT; g.textAlign='center';
  g.fillText('CARGO',0,-3.4);
  if((frame>>3)%2){ g.fillStyle='#7fe87f'; g.fillRect(-1.6,-19,3.2,3.2); }
  g.strokeStyle='#8e93a2'; g.lineWidth=1;                 // beacon mast
  g.beginPath(); g.moveTo(0,-15); g.lineTo(0,-17.5); g.stroke();
  g.restore();
}
function drawStone(g,p,st){
  if(st.fall>0){                       // the diamond-drop: falling from the sky
    const fh=st.fall*3.4;
    g.save(); g.translate(p.x,p.y); g.scale(p.s,p.s);
    g.fillStyle='rgba(20,16,40,'+(0.05+0.25*(1-Math.min(1,st.fall/50))).toFixed(2)+')';
    g.beginPath(); g.ellipse(0,1,6,2.2,0,0,7); g.fill();
    g.translate(0,-fh);
    g.strokeStyle='rgba(255,200,120,.4)'; g.lineWidth=1.6;   // the fall streak
    g.beginPath(); g.moveTo(0,-26); g.lineTo(0,-4); g.stroke();
    g.fillStyle='#ff9a3c';
    g.beginPath(); g.moveTo(0,-15); g.lineTo(6,-8); g.lineTo(0,-1); g.lineTo(-6,-8);
    g.closePath(); g.fill();
    g.strokeStyle='#241c3a'; g.lineWidth=1.6; g.stroke();
    g.restore();
    return;
  }
  g.save(); g.translate(p.x,p.y); g.scale(p.s,p.s);
  const pu=0.6+0.4*Math.sin(frame*0.1+st.Q[0]*9);
  const gl=g.createRadialGradient(0,-8,1,0,-8,16);
  gl.addColorStop(0,'rgba(255,160,60,'+(0.5*pu).toFixed(2)+')');
  gl.addColorStop(1,'rgba(255,160,60,0)');
  g.fillStyle=gl; g.beginPath(); g.arc(0,-8,16,0,7); g.fill();
  g.fillStyle='#ff9a3c';
  g.beginPath(); g.moveTo(0,-15); g.lineTo(6,-8); g.lineTo(0,-1); g.lineTo(-6,-8);
  g.closePath(); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=1.6; g.stroke();
  g.fillStyle='#ffe9c0'; g.fillRect(-2.4,-11.5,2.2,2.2);
  g.restore();
}
function drawTank(g,p){
  g.save(); g.translate(p.x,p.y); g.scale(p.s,p.s);
  g.fillStyle='#eef0f6';
  g.beginPath(); g.roundRect? g.roundRect(-5,-16,10,16,4) : g.rect(-5,-16,10,16); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=1.6; g.stroke();
  g.fillStyle='#ff7a1a'; g.fillRect(-5,-13,10,3);
  g.fillStyle='#8e93a2'; g.fillRect(-2,-19,4,4);
  g.fillStyle='#241c3a'; g.font='bold 7px '+FONT; g.textAlign='center';
  g.fillText('O2',0,-4.5);
  g.restore();
}
/* THE LANDER, twice the size and built like a real one (2026-08-24).
   Two stages now: a boxy panelled DESCENT stage standing on four splayed
   legs with footpads, and the tapered ASCENT hull above it. The single
   bullet-with-fins is gone — at this size fins read as decoration, so the
   detail budget went into things that say "vehicle": panel seams, a
   thermal band, an engine bell, a hatch with a ladder down the front,
   RCS quads at the shoulders, a dish, and a beacon that blinks.
   Origin (0,0) is still ground contact; the flare-shelter ring is left at
   its old radius on purpose — the safe zone is 0.085 rad of GROUND and
   must not appear to grow just because the art did. */
function drawLander(g,p){
  g.save(); g.translate(p.x,p.y); g.scale(p.s,p.s);
  const ink='#241c3a';
  // recovered cargo, stacked beside the legs — the manifest made visible
  { const home=pods.filter(p2=>p2.home).length;
    for(let i=0;i<home;i++){
      const cy2=-i*20;
      g.fillStyle= i%2? '#c6cad4':'#d8dce4';
      g.beginPath(); g.roundRect? g.roundRect(-62,cy2-19,26,19,3) : g.rect(-62,cy2-19,26,19); g.fill();
      g.strokeStyle=ink; g.lineWidth=1.8; g.stroke();
      g.fillStyle='#ff7a1a'; g.fillRect(-62,cy2-14,26,3.4);
      g.fillStyle='rgba(36,28,58,.3)'; g.fillRect(-57,cy2-8,8,4);
    }
  }
  // --- four splayed legs. Back pair thinner and shorter: cheap depth. ---
  const leg=(x0,y0,x1,y1,w,pad)=>{
    g.lineCap='round';
    g.strokeStyle=ink; g.lineWidth=w;
    g.beginPath(); g.moveTo(x0,y0); g.lineTo(x1,y1); g.stroke();
    g.strokeStyle='#c6cad4'; g.lineWidth=w*0.42;
    g.beginPath(); g.moveTo(x0,y0); g.lineTo(x1,y1); g.stroke();
    g.fillStyle='#d8dce4';
    g.beginPath(); g.ellipse(x1,y1,pad,pad*0.42,0,0,7); g.fill();
    g.strokeStyle=ink; g.lineWidth=1.5; g.stroke();
  };
  leg(-13,-32,-25,-10, 3.0, 5.5);            // back left
  leg( 13,-32, 25,-10, 3.0, 5.5);            // back right
  leg(-17,-30,-35,  0, 4.2, 8.5);            // front left
  leg( 17,-30, 35,  0, 4.2, 8.5);            // front right

  // --- DESCENT STAGE: the octagonal box that stays behind ---
  const dg=g.createLinearGradient(-24,-36,24,-6);
  dg.addColorStop(0,'#e8ebf1'); dg.addColorStop(1,'#b6bac6');
  g.fillStyle=dg;
  g.beginPath();
  g.moveTo(-24,-11); g.lineTo(-24,-30); g.lineTo(-17,-36); g.lineTo(17,-36);
  g.lineTo(24,-30); g.lineTo(24,-11); g.lineTo(17,-6); g.lineTo(-17,-6);
  g.closePath(); g.fill();
  g.strokeStyle=ink; g.lineWidth=2.2; g.stroke();
  g.strokeStyle='rgba(36,28,58,.32)'; g.lineWidth=1.2;      // panel seams
  g.beginPath(); g.moveTo(-9,-35); g.lineTo(-9,-6.5); g.moveTo(9,-35); g.lineTo(9,-6.5); g.stroke();
  g.fillStyle='#ff7a1a'; g.fillRect(-24,-24,48,4.6);        // thermal band
  g.fillStyle='rgba(36,28,58,.25)'; g.fillRect(-24,-24,48,1.4);
  // the engine bell, tucked under
  g.fillStyle='#8e94a4';
  g.beginPath(); g.moveTo(-7,-6); g.lineTo(-11,0); g.lineTo(11,0); g.lineTo(7,-6);
  g.closePath(); g.fill();
  g.strokeStyle=ink; g.lineWidth=1.8; g.stroke();
  g.fillStyle='rgba(36,28,58,.45)';
  g.beginPath(); g.ellipse(0,0,11,2.4,0,0,7); g.fill();

  // --- ASCENT STAGE: the tapered hull ---
  const lg=g.createLinearGradient(-22,-88,22,-34);
  lg.addColorStop(0,'#f6f8fb'); lg.addColorStop(0.55,'#dfe3ea'); lg.addColorStop(1,'#b6bac6');
  g.fillStyle=lg;
  g.beginPath();
  g.moveTo(-20,-34); g.lineTo(-20,-58); g.quadraticCurveTo(0,-94,20,-58); g.lineTo(20,-34);
  g.closePath(); g.fill();
  g.strokeStyle=ink; g.lineWidth=2.4; g.stroke();
  g.strokeStyle='rgba(36,28,58,.26)'; g.lineWidth=1.2;      // hull seams
  g.beginPath(); g.moveTo(-20,-45); g.lineTo(20,-45); g.moveTo(-19.5,-58); g.lineTo(19.5,-58); g.stroke();
  // RCS quads at the shoulders
  const rcs=(x,y,dx)=>{
    g.fillStyle='#8e94a4';
    g.beginPath(); g.moveTo(x,y-3.4); g.lineTo(x+dx*8,y-5.2); g.lineTo(x+dx*8,y+1.4); g.lineTo(x,y+3.4);
    g.closePath(); g.fill(); g.strokeStyle=ink; g.lineWidth=1.4; g.stroke();
  };
  rcs(-19.6,-55,-1); rcs(19.6,-55,1);
  // hatch, and the ladder down the front of the descent stage
  g.fillStyle='#aeb4c2';
  g.beginPath(); g.roundRect? g.roundRect(-7.5,-44,15,10,2.5) : g.rect(-7.5,-44,15,10); g.fill();
  g.strokeStyle=ink; g.lineWidth=1.6; g.stroke();
  g.strokeStyle='#d8dce4'; g.lineWidth=1.7;
  g.beginPath(); g.moveTo(-4.5,-33); g.lineTo(-4.5,-9); g.moveTo(4.5,-33); g.lineTo(4.5,-9); g.stroke();
  g.strokeStyle='rgba(36,28,58,.55)'; g.lineWidth=1.1;
  for(let i=0;i<5;i++){ const ry=-31.5+i*5.4;
    g.beginPath(); g.moveTo(-4.5,ry); g.lineTo(4.5,ry); g.stroke(); }
  // porthole
  g.fillStyle='#2a3450';
  g.beginPath(); g.arc(0,-63,10.8,0,7); g.fill();
  g.strokeStyle='#ff9a3c'; g.lineWidth=2.6;
  g.beginPath(); g.arc(0,-63,10.8,0,7); g.stroke();
  g.fillStyle='rgba(160,220,255,.7)'; g.fillRect(-6.5,-70,6,6);
  // the dish, canted the way a dish always is
  g.strokeStyle=ink; g.lineWidth=1.8; g.lineCap='round';
  g.beginPath(); g.moveTo(14,-71); g.lineTo(21,-79); g.stroke();
  g.fillStyle='#eef0f6';
  g.beginPath(); g.ellipse(22.5,-81,7,4.4,-0.5,0,7); g.fill();
  g.strokeStyle=ink; g.lineWidth=1.5; g.stroke();
  // the beacon — the one moving light on a dead world
  if((frame>>4)%2){
    g.fillStyle='rgba(255,122,26,.35)';
    g.beginPath(); g.arc(0,-79,7,0,7); g.fill();
    g.fillStyle='#ff7a1a';
    g.beginPath(); g.arc(0,-79,3.2,0,7); g.fill();
  }

  // the flagpole — the flag climbs it during the ceremony
  g.strokeStyle='#d8dce4'; g.lineWidth=3.2; g.lineCap='round';
  g.beginPath(); g.moveTo(48,0); g.lineTo(48,-80); g.stroke();
  const fy=-16-flagUp*56;
  const wav=Math.sin(frame*0.12)*4.4;
  g.fillStyle= flagUp>=1? '#ff7a1a' : '#eef0f6';
  g.beginPath();
  g.moveTo(50,fy); g.quadraticCurveTo(72,fy+4+wav,88,fy+2+wav);
  g.lineTo(88,fy+18+wav); g.quadraticCurveTo(70,fy+20+wav,50,fy+16);
  g.closePath(); g.fill();
  g.strokeStyle=ink; g.lineWidth=2; g.stroke();
  g.restore();
}
/* an ASSESSOR: a pale glass light. No face, no ship, no explanation. */
function drawAlien(g,p,a){
  const s=p.s, hov=(a.hov+Math.sin(frame*0.1+a.Q[1]*7)*4)*s;
  const y=p.y-hov;
  if(a.st==='beam'){                             // the taking, telegraphed
    const bw=4*s, gw=10*s;
    const bg=g.createLinearGradient(0,y,0,p.y);
    bg.addColorStop(0,'rgba(210,190,255,.45)'); bg.addColorStop(1,'rgba(210,190,255,.06)');
    g.fillStyle=bg;
    g.beginPath(); g.moveTo(p.x-bw,y); g.lineTo(p.x+gw,p.y); g.lineTo(p.x-gw,p.y); g.lineTo(p.x+bw,y);
    g.closePath(); g.fill();
    g.strokeStyle='rgba(230,220,255,'+(0.3+0.25*Math.sin(frame*0.3)).toFixed(2)+')';
    g.lineWidth=1.2;
    g.beginPath(); g.ellipse(p.x,p.y,gw,gw*0.36,0,0,7); g.stroke();
  }
  const gl=g.createRadialGradient(p.x,y,1,p.x,y,16*s);
  gl.addColorStop(0,'rgba(240,235,255,.9)');
  gl.addColorStop(0.5,'rgba(190,170,255,.4)');
  gl.addColorStop(1,'rgba(160,140,255,0)');
  g.fillStyle=gl; g.beginPath(); g.arc(p.x,y,16*s,0,7); g.fill();
  g.fillStyle='#efeaff';
  g.beginPath(); g.ellipse(p.x,y,7*s,5*s,0,0,7); g.fill();
  g.strokeStyle='rgba(120,100,200,.8)'; g.lineWidth=1.3;
  g.beginPath(); g.ellipse(p.x,y,7*s,5*s,0,0,7); g.stroke();
  g.strokeStyle='rgba(210,195,255,'+(0.4+0.3*Math.sin(frame*0.2)).toFixed(2)+')';
  g.beginPath(); g.ellipse(p.x,y+1.5*s,10*s,2.6*s,0,0,7); g.stroke();
  if(a.carry){                                   // the diamond, dangling in light
    g.fillStyle='#ff9a3c';
    g.beginPath(); g.moveTo(p.x,y+9*s); g.lineTo(p.x+3.4*s,y+13*s);
    g.lineTo(p.x,y+17*s); g.lineTo(p.x-3.4*s,y+13*s); g.closePath(); g.fill();
    g.strokeStyle='#241c3a'; g.lineWidth=1; g.stroke();
  }
}
/* a HARVESTER: a low mining hulk off the movie MOON — treads, a churning
   cutter drum, work lights, an O3 stencil, dust boiling off the head */
function drawHarv(g,p,h){
  const fs2= vd(harvDir(h),_Rt)>=0? 1 : -1;      // face the way it crawls
  g.save(); g.translate(p.x,p.y); g.scale(p.s*fs2,p.s);
  g.fillStyle='rgba(20,16,40,.30)';
  g.beginPath(); g.ellipse(0,2,30,6,0,0,7); g.fill();
  // treads with rolling dashes
  g.fillStyle='#2c2c3e';
  g.beginPath(); g.roundRect? g.roundRect(-26,-9,50,10,5) : g.rect(-26,-9,50,10); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=1.8; g.stroke();
  g.strokeStyle='rgba(160,166,186,.55)'; g.lineWidth=1.6;
  g.setLineDash([3,4]); g.lineDashOffset=-(frame*Math.abs(h.spd)*2600)%7;
  g.beginPath(); g.moveTo(-24,-4); g.lineTo(22,-4); g.stroke(); g.setLineDash([]);
  // hull
  const hg2=g.createLinearGradient(0,-30,0,-8);
  hg2.addColorStop(0,'#d4d8e2'); hg2.addColorStop(1,'#9aa0b0');
  g.fillStyle=hg2;
  g.beginPath();
  g.moveTo(-24,-8); g.lineTo(-24,-24); g.lineTo(-10,-30); g.lineTo(12,-30);
  g.lineTo(20,-22); g.lineTo(20,-8); g.closePath(); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=2; g.stroke();
  g.fillStyle='#ff7a1a'; g.fillRect(-24,-13,44,2.6);          // hazard band
  g.fillStyle='#241c3a'; g.font='bold 8px '+FONT; g.textAlign='center';
  g.save(); if(fs2<0) g.scale(-1,1);                          // stencil never mirrors
  g.fillText('O3', 0, -17); g.restore();
  // the vent, hissing whenever someone drinks from it
  g.fillStyle='#8e93a2'; g.fillRect(-22,-28,5,6);
  if(ad(P,harvQ(h))<HARV_VENT){
    g.strokeStyle='rgba(127,216,255,'+(0.4+0.3*Math.sin(frame*0.5)).toFixed(2)+')';
    g.lineWidth=1.4;
    g.beginPath(); g.moveTo(-20,-30); g.quadraticCurveTo(-24,-36,-20,-40); g.stroke();
    g.beginPath(); g.moveTo(-17,-30); g.quadraticCurveTo(-13,-35,-16,-40); g.stroke();
  }
  // work lights
  if((frame>>4)%2){ g.fillStyle='#ffd76e'; g.fillRect(14,-33,4,3); }
  else { g.fillStyle='#ff9a3c'; g.fillRect(-8,-33,4,3); }
  // the cutter drum, churning
  g.fillStyle='#565b6e';
  g.beginPath(); g.arc(28,-7,9,0,7); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=2; g.stroke();
  g.strokeStyle='#d8dce4'; g.lineWidth=2;
  for(let i=0;i<4;i++){
    const a2=frame*0.22*fs2*(h.spd>=0?1:-1)+i*Math.PI/2;
    g.beginPath(); g.moveTo(28+Math.cos(a2)*4,-7+Math.sin(a2)*4);
    g.lineTo(28+Math.cos(a2)*8.4,-7+Math.sin(a2)*8.4); g.stroke();
  }
  // dust boiling off the head
  for(let i=0;i<3;i++){
    const dh=hash2(((frame>>2)+i*7)%97, i*13+1);
    g.fillStyle='rgba(178,182,196,'+(0.30-i*0.08).toFixed(2)+')';
    g.beginPath(); g.arc(30+dh*8, -2-dh*10-i*3, 3.4+i*1.6, 0, 7); g.fill();
  }
  g.restore();
}
function drawMeteor(g,p,m){
  const s=p.s;
  if(m.t<0){                                  // the telegraph: a ground reticle
    const bl=(m.t+MET_WARN)/MET_WARN;
    if((frame>>2)%2){
      g.strokeStyle='rgba(255,90,60,'+(0.45+bl*0.4).toFixed(2)+')'; g.lineWidth=2;
      g.beginPath(); g.ellipse(p.x,p.y,20*s,7*s,0,0,7); g.stroke();
      g.fillStyle='rgba(255,90,60,'+(0.10+bl*0.15).toFixed(2)+')';
      g.beginPath(); g.ellipse(p.x,p.y,20*s,7*s,0,0,7); g.fill();
      // chevron pointing at the spot
      g.fillStyle='rgba(255,90,60,'+(0.5+bl*0.4).toFixed(2)+')';
      g.beginPath(); g.moveTo(p.x,p.y-14*s); g.lineTo(p.x+6*s,p.y-24*s); g.lineTo(p.x-6*s,p.y-24*s);
      g.closePath(); g.fill();
    }
    g.strokeStyle='rgba(255,90,60,'+(0.08+bl*0.12).toFixed(2)+')'; g.lineWidth=2;
    g.beginPath(); g.moveTo(p.x,p.y-26*s); g.lineTo(p.x,p.y-210*s); g.stroke();
  } else {                                    // falling
    const q=m.t/MET_FALL;
    const yy=p.y-(1-q)*250*s;
    g.strokeStyle='rgba(255,170,80,.6)'; g.lineWidth=3*s; g.lineCap='round';
    g.beginPath(); g.moveTo(p.x,yy-26*s); g.lineTo(p.x,yy); g.stroke();
    g.fillStyle='#ff8a3c';
    g.beginPath(); g.arc(p.x,yy,6*s,0,7); g.fill();
    g.fillStyle='#ffe9a0';
    g.beginPath(); g.arc(p.x,yy,2.6*s,0,7); g.fill();
    g.strokeStyle='#241c3a'; g.lineWidth=1.4;
    g.beginPath(); g.arc(p.x,yy,6*s,0,7); g.stroke();
  }
}

function drawPlayer(g){
  if(deadT>0 && (frame>>2)%2) return;
  if(iframes>0 && (frame>>2)%2===0) return;
  // shadow stays on the ground and thins with height
  g.fillStyle='rgba(20,16,40,'+Math.max(0.08,0.30-z*0.003).toFixed(2)+')';
  g.beginPath(); g.ellipse(CXS,SURF_Y+2,12-Math.min(6,z*0.06),3.4,0,0,7); g.fill();
  const y=SURF_Y - z*ZS;
  const sgn=backing? -1 : 1;
  const step=(walking && z===0)? Math.sin(walkT*0.32)*sgn : 0;
  const bob=(walking && z===0)? -Math.abs(Math.sin(walkT*0.32))*1.6 : 0;
  g.save(); g.translate(CXS,y+bob); g.scale(1.15,1.15);
  // seen from BEHIND: backpack, boots under it, helmet on top
  // legs / boots
  g.strokeStyle='#eef0f6'; g.lineWidth=4; g.lineCap='round';
  if(z>0){
    g.beginPath(); g.moveTo(-4,-9); g.lineTo(-6,-3); g.moveTo(4,-9); g.lineTo(6,-4); g.stroke();
    g.fillStyle='#ff7a1a'; g.fillRect(-9,-5,6,4.6); g.fillRect(3,-6,6,4.6);
  } else {
    g.beginPath();
    g.moveTo(-4,-9); g.lineTo(-4,-2+step*1.6);
    g.moveTo(4,-9);  g.lineTo(4,-2-step*1.6); g.stroke();
    g.fillStyle='#ff7a1a';
    g.fillRect(-7.4,-3+step*1.6,6.4,4.2);
    g.fillRect(1,-3-step*1.6,6.4,4.2);
  }
  // torso (white suit) with the backpack square on it — this is his back
  g.fillStyle='#f2f4f8';
  g.beginPath(); g.roundRect? g.roundRect(-9,-27,18,18,5) : g.rect(-9,-27,18,18); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=1.8; g.stroke();
  g.fillStyle='#aab0bc';                                  // the pack
  g.beginPath(); g.roundRect? g.roundRect(-6.6,-25.4,13.2,13,3) : g.rect(-6.6,-25.4,13.2,13); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=1.5; g.stroke();
  g.fillStyle='#ff9a3c'; g.fillRect(-4.6,-23.4,2.4,9); g.fillRect(2.2,-23.4,2.4,9);
  g.fillStyle='#241c3a'; g.fillRect(-6.6,-14.6,13.2,1.4);
  // air hoses looping from the pack to the helmet
  g.strokeStyle='#d8dce4'; g.lineWidth=1.8;
  g.beginPath(); g.moveTo(-6,-25); g.quadraticCurveTo(-11,-30,-6.5,-34); g.stroke();
  g.beginPath(); g.moveTo(6,-25);  g.quadraticCurveTo(11,-30,6.5,-34);  g.stroke();
  // arms: swinging free, or raised overhead when hauling cargo
  const carryNow=carrying>=0;
  g.strokeStyle='#eef0f6'; g.lineWidth=3.6;
  if(carryNow){
    g.beginPath(); g.moveTo(-9,-24); g.lineTo(-10.5,-46); g.stroke();
    g.beginPath(); g.moveTo(9,-24);  g.lineTo(10.5,-46);  g.stroke();
  } else {
    g.beginPath(); g.moveTo(-9,-24); g.lineTo(-13,-15+step*2.6); g.stroke();
    g.beginPath(); g.moveTo(9,-24);  g.lineTo(13,-15-step*2.6);  g.stroke();
    g.fillStyle='#ff7a1a';
    g.beginPath(); g.arc(-13.6,-14+step*2.6,2.7,0,7); g.arc(13.6,-14-step*2.6,2.7,0,7); g.fill();
  }
  // helmet — the back of it, with the ears
  g.fillStyle='#f6f8fc';
  g.beginPath(); g.arc(0,-34,8.8,0,7); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=1.8; g.stroke();
  // visor rim just peeking round both sides
  g.strokeStyle='#2a2438'; g.lineWidth=2.4;
  g.beginPath(); g.arc(0,-34,7.6,-2.55,-2.05); g.stroke();
  g.beginPath(); g.arc(0,-34,7.6,-1.1,-0.6); g.stroke();
  // cat ears, suit-built
  g.fillStyle='#f6f8fc';
  g.beginPath(); g.moveTo(-6.4,-39.5); g.lineTo(-4.6,-45); g.lineTo(-1.4,-41); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(6.4,-39.5); g.lineTo(4.6,-45); g.lineTo(1.4,-41); g.closePath(); g.fill();
  g.strokeStyle='#241c3a'; g.lineWidth=1.4;
  g.beginPath(); g.moveTo(-6.4,-39.5); g.lineTo(-4.6,-45); g.lineTo(-1.4,-41); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(6.4,-39.5); g.lineTo(4.6,-45); g.lineTo(1.4,-41); g.closePath(); g.stroke();
  // helmet shine + antenna
  g.fillStyle='rgba(255,255,255,.55)'; g.fillRect(-2.6,-40.4,3,1.8);
  g.strokeStyle='#aab0bc'; g.lineWidth=1.4;
  g.beginPath(); g.moveTo(-7,-39); g.lineTo(-9.4,-44.4); g.stroke();
  g.fillStyle='#ff7a1a'; g.beginPath(); g.arc(-9.7,-45.2,1.5,0,7); g.fill();
  // the cargo pod, hoisted overhead, swaying with each stride
  if(carryNow){
    const sw=(walking && z===0)? Math.sin(walkT*0.32)*1.8 : 0;
    g.save(); g.translate(sw,0);
    const tg=g.createLinearGradient(0,-61,0,-47);
    tg.addColorStop(0,'#e8ecf4'); tg.addColorStop(1,'#b4bac8');
    g.fillStyle=tg;
    g.beginPath(); g.roundRect? g.roundRect(-11,-61,22,14,3) : g.rect(-11,-61,22,14); g.fill();
    g.strokeStyle='#241c3a'; g.lineWidth=1.8; g.stroke();
    g.fillStyle='#ff7a1a'; g.fillRect(-11,-57.4,22,2.6);
    g.fillStyle='#241c3a'; g.font='bold 6px '+FONT; g.textAlign='center';
    g.fillText('CARGO',0,-49.6);
    if((frame>>3)%2){ g.fillStyle='#7fe87f'; g.fillRect(-1.6,-65,3.2,3.2); }
    g.restore();
  }
  g.restore();
}

/* radar: the whole globe folded onto a disc, forward = up.
   An object at angular distance d, bearing b from your heading
   plots at radius d/π — the far pole is the rim. */
function drawMiniMap(g){
  /* 50% bigger, 2026-08-24 — and still a CIRCLE on purpose. This is an
     azimuthal-equidistant plot: distance from the centre IS distance across
     the moon, in every direction equally. Stretch it wider than tall and a
     stone dead ahead plots nearer than the same stone dead abeam, which is
     exactly the lie a radar must not tell. Geometry x1.5, markers x1.25 —
     the extra room is meant to separate the blips, not fatten them. */
  const cx=RW-60, cy=HUD+66, r=36;
  g.fillStyle='rgba(18,12,36,.62)';
  g.beginPath(); g.arc(cx,cy,r+13,0,7); g.fill();
  g.strokeStyle='rgba(255,179,90,.55)'; g.lineWidth=1.6;
  g.beginPath(); g.arc(cx,cy,r,0,7); g.stroke();
  g.strokeStyle='rgba(255,179,90,.18)';
  g.beginPath(); g.arc(cx,cy,r*UH/Math.PI,0,7); g.stroke();   // your horizon ring
  /* THE STATIC'S PRICE. A discharge kills the radar, and this is where you
     feel it — no contacts, no lander, no sun, no meteor telegraph on the
     map. Everything is still out there; you simply cannot see it. */
  if(statBlind>0){
    g.save();
    g.beginPath(); g.arc(cx,cy,r,0,7); g.clip();
    for(let i=0;i<70;i++){
      const sd=(frame>>2)+i*7;
      const a2=hash2(sd,i*13)*TAU, rr=Math.sqrt(hash2(i*5,sd+3))*r;
      g.fillStyle='rgba(255,179,90,'+(0.10+0.34*hash2(sd+11,i)).toFixed(2)+')';
      g.fillRect(cx+Math.cos(a2)*rr-1, cy+Math.sin(a2)*rr-1, 2, 2);
    }
    g.restore();
    g.fillStyle='rgba(255,90,74,'+((frame>>4)%2?0.9:0.5)+')';
    g.font='bold 9px '+FONT; g.textAlign='center';
    g.fillText('NO SIGNAL', cx, cy+3);
    g.textAlign='left';
    return;
  }
  const right=vx(camF,P);
  const pt=Q=>{
    const d=ad(Q,P);
    const t=vam(Q,P,-vd(Q,P)); const l=Math.hypot(t[0],t[1],t[2]);
    const b= l<1e-9? 0 : Math.atan2(vd(t,right)/l, vd(t,camF)/l);
    const rr=d/Math.PI*r;
    return [cx+Math.sin(b)*rr, cy-Math.cos(b)*rr];
  };
  // lander
  { const [x,y]=pt(LANDER_Q);
    g.fillStyle='#eef0f6';
    g.beginPath(); g.moveTo(x,y-5.5); g.lineTo(x+4.25,y+3.25); g.lineTo(x-4.25,y+3.25);
    g.closePath(); g.fill(); }
  // stones left / tanks left
  g.fillStyle='#ff9a3c';
  for(const s of stones) if(!s.got){ const [x,y]=pt(s.Q); g.fillRect(x-1.75,y-1.75,3.5,3.5); }
  g.fillStyle='#7fd8ff';
  for(const t of tanks) if(!t.got){ const [x,y]=pt(t.Q); g.fillRect(x-1.5,y-1.5,3,3); }
  // monolith shelters — they matter, so the radar knows them
  g.fillStyle= flareMode? '#bfe8ff' : 'rgba(210,218,236,.7)';
  for(const m of MONO){ const [x,y]=pt(m.Q), r2=1.75*m.sc; g.fillRect(x-r2,y-r2,r2*2,r2*2); }
  /* the shaft appears on the radar only once it is open. Before that the
     instrument has nothing to report, which is honest — and it means the
     player who finds the seam early found it by LOOKING. */
  if(level>=DESCEND_LV){
    const [x,y]=pt(SHAFT_Q);
    g.fillStyle='#05030c';
    g.beginPath(); g.arc(x,y,4.4,0,7); g.fill();
    g.strokeStyle='rgba(191,232,255,'+((frame>>3)%2?0.95:0.45)+')'; g.lineWidth=1.6;
    g.beginPath(); g.arc(x,y,4.4,0,7); g.stroke();
  }
  // cargo pods still out there
  g.fillStyle='#7fe87f';
  for(let i=0;i<pods.length;i++) if(!pods[i].home && carrying!==i){
    const [x,y]=pt(pods[i].Q); g.fillRect(x-2,y-2,4,4); }
  // the harvesters, always on the move
  g.fillStyle='#bfe8a0';
  for(const h of HARV){ const [x,y]=pt(harvQ(h)); g.fillRect(x-2.5,y-2.5,5,5); }
  // assessors — pale violet, blinking while they beam
  for(const a of aliens){
    if(a.st==='beam' && (frame>>2)%2) continue;
    const [x,y]=pt(a.Q);
    const after = a.st==='hunt' || a.st==='lift';
    g.fillStyle= after? '#ff9ad8' : '#c9b5ff';
    g.fillRect(x-2.25,y-2.25,4.5,4.5);
    if(after){                       // the one contact that is coming for YOU
      g.strokeStyle='rgba(255,154,216,'+((frame>>3)%2?0.95:0.4)+')'; g.lineWidth=1.4;
      g.beginPath(); g.arc(x,y,6.5,0,7); g.stroke();
    }
  }
  // the sun, pinned to the rim — blinks when it's angry
  { const t2=vam(SUN_Q,P,-vd(SUN_Q,P)); const l2=Math.hypot(t2[0],t2[1],t2[2]);
    const b2= l2<1e-9? 0 : Math.atan2(vd(t2,right)/l2, vd(t2,camF)/l2);
    if(!flareMode || (frame>>3)%2){
      g.fillStyle= flareMode? '#ff8a3c' : '#ffe9a0';
      g.beginPath(); g.arc(cx+Math.sin(b2)*(r+7), cy-Math.cos(b2)*(r+7), flareMode?3.75:2.75, 0, 7); g.fill();
    }
  }
  // meteors — telegraphs blink, fallers burn
  for(const m of meteors){
    const [x,y]=pt(m.Q);
    if(m.t<0){ if((frame>>2)%2){ g.fillStyle='#ff5a4a'; g.fillRect(x-2.5,y-2.5,5,5); } }
    else { g.fillStyle='#ffb35a'; g.fillRect(x-2.5,y-2.5,5,5); }
  }
  // you — the centre, always facing up
  if((frame>>3)%2){ g.fillStyle='#ffffff'; g.beginPath(); g.arc(cx,cy,3,0,7); g.fill(); }
  g.strokeStyle='rgba(255,255,255,.6)'; g.lineWidth=1.6;
  g.beginPath(); g.moveTo(cx,cy); g.lineTo(cx,cy-9); g.stroke();
}

function drawHUDbarM(g){
  const hg=g.createLinearGradient(0,0,0,HUD);
  hg.addColorStop(0,'#2a2044'); hg.addColorStop(1,'#171028');
  g.fillStyle=hg; g.fillRect(0,0,RW,HUD);
  g.fillStyle='rgba(255,140,60,.4)'; g.fillRect(0,HUD-2,RW,2);
  g.textAlign='left'; g.font='bold 14px '+FONT; g.fillStyle='#ffb35a';
  g.fillText('MOONWALK',12,20);
  /* the controls hint used to print here FOREVER, straight through the CARGO
     counter (Scott 2026-08-18, part of the overlap report). It earns ~9s of
     screen, fades, and the band belongs to the counters after that. */
  if(hintT>0){
    g.globalAlpha=Math.min(1,hintT/60);
    g.font='11px '+FONT; g.fillStyle='#9a90c0';
    g.fillText('UP/DOWN walk · LEFT/RIGHT turn · SPACE jump/drop · ESC leave',12,37);
    g.globalAlpha=1;
  } else if(bnd>1.001){
    /* THE BOUND, printed only while you are actually holding a chain — it
       lives in the band the controls hint vacates, so nothing overlaps. */
    g.font='bold 11px '+FONT;
    g.fillStyle= bnd>=BND_MAX? '#7fe87f' : '#ffb35a';
    g.fillText('BOUND ×'+bnd.toFixed(1)+(bnd>=BND_MAX?' MAX':''),12,37);
  }
  // stones
  g.textAlign='center'; g.font='bold 13px '+FONT; g.fillStyle='#ff9a3c';
  g.fillText('◆ '+stonesGot()+'/'+STONE_N, RW/2-56, 21);
  g.font='bold 10px '+FONT; g.fillStyle='#7fe87f';
  g.fillText('CARGO '+pods.filter(p2=>p2.home).length+'/'+pods.length, RW/2-56, 36);
  g.fillStyle='#cfd6ff'; g.font='bold 11px '+FONT;
  g.fillText('LV '+level, RW/2-110, 21);
  // O2
  const bw=110, bx=RW/2, low=o2<25;
  g.fillStyle='#3a3452'; g.fillRect(bx,10,bw,9);
  g.fillStyle= low? ((frame>>3)%2?'#ff5a4a':'#ff9a3c') : '#7fd8ff';
  g.fillRect(bx,10,bw*Math.max(0,o2)/O2_MAX,9);
  g.strokeStyle='#0e0a1c'; g.lineWidth=1.4; g.strokeRect(bx,10,bw,9);
  /* THE STATIC, stacked under the air. Labels moved to the LEFT of both
     bars — the old 'O2' caption sat under the bar in exactly the band this
     one needs, and two stacked meters read faster than two scattered ones. */
  const stf=stat/STAT_MAX, stHot=stf>0.78;
  g.fillStyle='#3a3452'; g.fillRect(bx,24,bw,7);
  g.fillStyle= statBlind>0? '#5a5270'
             : stHot? ((frame>>2)%2?'#eef6ff':'#bfe8ff')
             : '#8fa8d8';
  g.fillRect(bx,24,bw*stf,7);
  g.strokeStyle='#0e0a1c'; g.lineWidth=1.2; g.strokeRect(bx,24,bw,7);
  g.textAlign='right'; g.font='bold 9px '+FONT;
  g.fillStyle='#cfd6ff'; g.fillText('O2', bx-5, 18);
  g.fillStyle= statBlind>0? ((frame>>3)%2?'#ff5a4a':'#8a7f9e') : (stHot?'#bfe8ff':'#9a90c0');
  g.fillText(statBlind>0? 'DEAD':'STAT', bx-5, 31);
  g.textAlign='left';
  // hearts (suit patches)
  for(let i=0;i<HEARTS0;i++){
    g.fillStyle= i<hearts? '#ff6a6a' : '#443a5a';
    const hx=RW/2+130+i*15;
    g.beginPath();
    g.arc(hx-2.6,16,3,0,7); g.arc(hx+2.6,16,3,0,7);
    g.moveTo(hx-5.4,17.6); g.lineTo(hx,23); g.lineTo(hx+5.4,17.6);
    g.closePath(); g.fill();
  }
  g.textAlign='right'; g.font='bold 16px '+FONT; g.fillStyle='#ffe9a8';
  g.fillText(String(score).padStart(5,'0'), RW-12, 22);
}

function draw(){
  const g=ctx;
  camBasis();
  drawSky(g);
  drawGround(g);

  /* painter order over the curve: far things first, the player (at
     depth CB) slotted in, near-side things last. */
  const list=[];
  /* ext: a TALL thing crests the curve sooner than a pebble does. Only the
     lander asks for it, and only a little — the projection's own clamp is
     1.35 rad, so this must stay well under it. */
  const push=(Q,fn,arg,ext)=>{
    if(ad(Q,P)>UH+(ext||0.04)) return;
    const p=toCam(Q,0); if(!p) return;
    list.push({d:p.d, fn, p, arg});
  };
  for(const q of ROCKS_Q) push(q, drawRock);
  for(const m of MONO) push(m.Q, drawMono, m);
  for(let i=0;i<pods.length;i++) if(!pods[i].home && carrying!==i) push(pods[i].Q, drawPod);
  for(const h of HARV){ h._q=harvQ(h); push(h._q, drawHarv, h); }
  for(const s of stones) if(!s.got && !(s.away>0)) push(s.Q, drawStone, s);
  for(const t of tanks) if(!t.got) push(t.Q, drawTank);
  for(const a of aliens) push(a.Q, drawAlien, a);
  push(LANDER_Q, drawLander, null, 0.07);   // UH is 1.250; the clamp is 1.350. Stay off it.
  for(const m of meteors) push(m.Q, drawMeteor, m);
  list.push({d:CB, fn:'player'});
  list.sort((a,b)=>b.d-a.d);
  for(const it of list){
    if(it.fn==='player') drawPlayer(g);
    else it.fn(g,it.p,it.arg);
  }

  for(const q of parts){
    g.globalAlpha=Math.min(1,q.life/12);
    g.fillStyle=q.col; g.fillRect(q.x,q.y,2.4,2.4);
    g.globalAlpha=1;
  }
  // low air closes in on the edges of your sight
  if(o2<25 && !over){
    const urg=(25-Math.max(0,o2))/25;
    const a2=(0.10+0.22*urg)*(0.55+0.45*Math.sin(frame*0.18));
    const vg=g.createRadialGradient(CXS,HUD+RH/2,RH*0.42,CXS,HUD+RH/2,RH*0.74);
    vg.addColorStop(0,'rgba(255,60,40,0)'); vg.addColorStop(1,'rgba(255,60,40,'+a2.toFixed(3)+')');
    g.fillStyle=vg; g.fillRect(0,HUD,RW,RH);
  }
  drawMiniMap(g);
  drawHUDbarM(g);

  /* BANNERS moved to MID-SCREEN (Scott 2026-08-18: "warnings and other text
     are starting to overlap at top of screen — for things like solar flares,
     warning has to flash in middle of screen"). The band under the HUD is the
     toasts' lane (index.html stacks up to three there); the flare and level
     banners now flash over the terrain instead, each line on its own dark
     pill so it reads against sunlit ground. */
  const midPill=(txt,y,size,col,blink)=>{
    if(blink && !((frame>>3)%2)) return;
    g.textAlign='center'; g.font='bold '+size+'px '+FONT;
    const m=g.measureText(txt), tw=(m&&m.width)||txt.length*size*0.6;
    const w=tw+34, h=size+12;
    g.fillStyle='rgba(10,6,20,.62)';
    g.fillRect(RW/2-w/2, y-h+7, w, h);
    g.fillStyle=col; g.fillText(txt, RW/2, y);
  };
  if(dropT>0)
    midPill('LEVEL '+level+' — THE STONES RETURN', HUD+RH*0.30, 18, '#ffd76e', true);

  // the flare banner — it answers WHEN, WHERE and HOW FAR, from centre stage
  if(flareMode>0){
    const shel=inShadow(), cd=Math.ceil(flareT/60);
    if(!shel) drawShelterGuide(g);
    const my=HUD+RH*0.42;
    if(flareMode===1){
      midPill('SOLAR FLARE IN '+cd+'s', my, 20, '#ffb35a', true);
      if(shel) midPill('YOU ARE IN SHADOW — HOLD', my+26, 13, '#7fd8ff', false);
      else{
        const ns=nearestShelter();
        midPill('NEAREST SHADOW '+ns.runS+'s AWAY — FOLLOW THE MARKERS', my+26,
                13, ns.runS<=cd? '#7fe7a0' : '#ff5a4a', false);
      }
    } else {
      if(shel) midPill('SHELTERED — '+cd+'s TO GO', my, 16, '#7fd8ff', false);
      else{
        const ns=nearestShelter();
        midPill('RADIATION — SHADOW '+ns.runS+'s AWAY', my, 20, '#ff5a4a', true);
      }
    }
  }

  if(introT>0){
    g.globalAlpha=Math.min(1,introT/40); g.textAlign='center';
    g.font='bold 22px '+FONT; g.fillStyle='#ffb35a';
    g.fillText('MOONWALK', RW/2, HUD+150);
    g.font='12px '+FONT; g.fillStyle='#d8cfe8';
    g.fillText('A whole little world. Twelve stones. Bring them home.', RW/2, HUD+172);
    g.globalAlpha=1;
  }
  /* THE DESCENT. The surface closes over from the rim inward — you are not
     fading out, the hole is swallowing the picture. Nothing is explained. */
  if(descT>0){
    const k=Math.min(1,descT/110);
    g.save();
    g.beginPath(); g.rect(0,HUD,RW,RH);
    g.arc(RW/2, HUD+RH*0.52, Math.max(0,(RW*0.78)*(1-k)), 0, 7, true);
    g.fillStyle='#05030c'; g.fill();
    g.restore();
    if(descT>70){
      g.globalAlpha=Math.min(1,(descT-70)/50);
      g.textAlign='center';
      g.font='bold 22px '+FONT; g.fillStyle='#bfe8ff';
      g.fillText('THE WRONG SHADOW WAS A DOOR', RW/2, HUD+RH/2-10);
      g.font='12px '+FONT; g.fillStyle='#8fa8d8';
      g.fillText('Whatever built this was heavy, and liked it here.', RW/2, HUD+RH/2+14);
      g.globalAlpha=1;
    }
  }
  if(doneT>0){
    g.fillStyle= descended? 'rgba(4,3,10,.86)' : 'rgba(10,6,20,.72)';
    g.fillRect(0,HUD,RW,RH);
    g.textAlign='center'; g.font='bold 24px '+FONT;
    g.fillStyle= descended? '#bfe8ff' : over? '#ff9a9a' : '#ffb35a';
    g.fillText(descended? 'YOU ARE BELOW' : over? 'THE MOON KEEPS YOU' : 'FIRST FOOTPRINTS',
               RW/2, HUD+RH/2-8);
    g.font='12px '+FONT; g.fillStyle='#d8cfe8';
    g.fillText(descended? 'Score '+score+' · the way down is open for good'
               : over? 'Score '+score+' · Level '+level
               : 'The flag flies. Score '+score, RW/2, HUD+RH/2+16);
    if(descended){
      g.font='11px '+FONT; g.fillStyle='#7a6f9a';
      g.fillText('THE DEEP is not dug yet. The door is.', RW/2, HUD+RH/2+38);
    }
  }
}

/* ---------------- API ---------------- */
window.MoonwalkLayer={
  enter(){
    savedPos={scr:curScr, x:PL.x, y:PL.y};
    reset();
    exitLatch=true;
    toast('A very small moon. The ground does the moving.');
  },
  exitDone(){
    if(savedPos){ loadScreen(savedPos.scr); PL.x=savedPos.x; PL.y=savedPos.y; }
    else loadScreen(5);
    unstick(PL); PL.iframes=45; PL.kb.x=0; PL.kb.y=0;
  },
  update, draw,
  _t:{ get z(){return z;}, get o2(){return o2;}, set o2(v){o2=v;},
       get hearts(){return hearts;}, get score(){return score;}, set score(v){score=v;},
       get stones(){return stones;}, get tanks(){return tanks;},
       get meteors(){return meteors;}, get scorches(){return scorches;},
       get prints(){return prints;},
       get plantT(){return plantT;}, get flagUp(){return flagUp;},
       get doneT(){return doneT;}, get over(){return over;}, get iframes(){return iframes;},
       pos(){return P.slice();}, heading(){return H.slice();}, camHeading(){return camF.slice();},
       ROCKS_Q, LANDER_Q, TILES, R, RV, W_SPD, BACK_MUL, TURN, JUMP_V, GRAV,
       O2_MAX, O2_DRAIN, MET_FALL, MET_WARN, STONE_N, HEARTS0, UH, CB,
       MONO, SUN_Q, FLARE_EVERY, FLARE_WARN, FLARE_LEN, MONO_SHADOW, MONO_CONE,
       nearestShelter, W_SPD,
       POD_SPD, POD_SCORE, CRATERS, CRATER_HIDE, inShadow, hurt,
       get flareMode(){return flareMode;}, set flareMode(v){flareMode=v;},
       get flareT(){return flareT;}, set flareT(v){flareT=v;},
       get pods(){return pods;}, get carrying(){return carrying;}, set carrying(v){carrying=v;},
       get level(){return level;}, set level(v){level=v;},
       get dropT(){return dropT;}, get aliens(){return aliens;}, get tracks(){return tracks;},
       spawnAlien, ALIEN_SPD, ALIEN_BEAM, ALIEN_AWAY, ALIEN_EVERY,
       // THE BOUND · THE STATIC · HUNTED WHEN LOADED (2026-08-24)
       BND_MAX, BND_STEP, BND_WIN, STAT_MAX, STAT_BLIND,
       HUNT_LOCK, HUNT_NEAR, HUNT_BREAK, huntChance, loseStone,
       get bnd(){return bnd;}, set bnd(v){bnd=v;},
       get bndT(){return bndT;}, set bndT(v){bndT=v;},
       get stat(){return stat;}, set stat(v){stat=v;},
       get statBlind(){return statBlind;}, set statBlind(v){statBlind=v;},
       // THE WRONG SHADOW + THE PHASE SHIFT (2026-08-24)
       WRONG, WRONG_TURN, SHAFT_Q, SHAFT_R, DESCEND_LV, SHAFT_HINTS, dirT,
       get descT(){return descT;}, get descended(){return descended;},
       get hintedLv(){return hintedLv;}, set hintedLv(v){hintedLv=v;},
       HARV, harvQ, harvDir, HARV_VENT, HARV_BLOCK, HARV_CUT, HARV_HEAD, STONES_LL,
       setP(Q){ P=vn(Q.slice()); H=vn(vam([1,0,0],P,-vd([1,0,0],P)));
         if(Math.hypot(H[0],H[1],H[2])<0.5){ H=vn(vam([0,0,1],P,-vd([0,0,1],P))); } camF=H.slice(); },
       ad, sph, vd, spawnMeteor, surfPt, stonesGot, approach, bearingTo, horizonPt, RC, HY,
       toCam(Q,h){ camBasis(); return toCam(Q,h); },
       proj(u,v,h){ camBasis(); return proj(u,v,h); },
       setIframes(v){ iframes=v; },
       skipIntro(){ introT=0; },
       reset }
};

})();
