/* ============================================================
   GFX — shared depth + ink helpers for every Grishnak screen.

   Lifted from the Frog Sqwad look (flat colour, hard ink line,
   contact shadow) and adapted to a 2D canvas. Three rules:

     1. CONTACT SHADOW under everything that stands on ground.
        A dark core where the thing touches, soft falloff around.
        This is the single cheapest thing that sells depth.

     2. TWO SHADES per body — one lit, one dark. No gradients on
        creatures. Gradients are for terrain and light, not skin.

     3. INK LINE on creatures and props only. Never on terrain.
        The outline is what separates a character from its world.

   All GFX.* functions take SCREEN coordinates (HUD already added).
   The older global drawShadow(x,y,w) still takes world y and adds
   HUD itself — it now delegates here, so both paths look alike.
   ============================================================ */
(function(){
'use strict';

const G = {};

/* ---- 1. contact shadow -------------------------------------
   x,y = the contact point on the ground (screen coords)
   w   = half-width of the blob
   a   = darkness 0..1 (default .34)
   Squashed to 0.40 vertical: reads as ground, not as a ball.  */
G.shadow = function(g, x, y, w, a){
  a = (a===undefined) ? 0.34 : a;
  if(w <= 0 || a <= 0) return;
  g.save();
  g.translate(x, y); g.scale(1, 0.40); g.translate(-x, -y);
  // soft outer falloff
  const rg = g.createRadialGradient(x, y, w*0.25, x, y, w);
  rg.addColorStop(0, 'rgba(0,0,0,'+(a).toFixed(3)+')');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(x, y, w, 0, 7); g.fill();
  // hard little core right at the contact point — this is the part
  // that actually makes something feel planted rather than pasted
  g.fillStyle = 'rgba(0,0,0,'+(a*0.55).toFixed(3)+')';
  g.beginPath(); g.arc(x, y, w*0.42, 0, 7); g.fill();
  g.restore();
};

/* ---- 2. projected shadow -----------------------------------
   For airborne things. The shadow stays on the ground, shrinks
   and fades the higher the object is. Doubles as a landing
   telegraph — the player reads where they're about to come down.
     x        screen x of the object
     groundY  screen y of the floor beneath it
     h        pixels above that floor
     w        half-width at rest
     maxH     height at which the shadow has faded out  */
G.airShadow = function(g, x, groundY, h, w, maxH){
  maxH = maxH || 170;
  const t = Math.max(0, Math.min(1, h / maxH));
  const scale = 1 - t*0.62;                        // shrinks with altitude
  const alpha = 0.34 * Math.pow(1 - t, 1.5);       // fades to nothing at maxH
  if(alpha <= 0.02) return;
  G.shadow(g, x, groundY, w*scale, alpha);
};

/* ---- 3. ink ------------------------------------------------
   Stroke the current path as a character outline. Creatures and
   props only — terrain stays unlined so characters pop off it. */
G.INK = 'rgba(14,18,12,.62)';
G.ink = function(g, w){
  g.strokeStyle = G.INK;
  g.lineWidth = w || 1.6;
  g.lineJoin = 'round';
  g.stroke();
};
/* fill the current path, then ink it */
G.fillInk = function(g, fill, w){
  g.fillStyle = fill; g.fill();
  G.ink(g, w);
};

/* ---- 4. two-shade body -------------------------------------
   Flat lit colour on top, darker shade on the bottom third, one
   ink line around the whole thing. The Frog Sqwad body in three
   draw calls. Returns nothing; draws an ellipse at x,y.          */
G.body = function(g, x, y, rx, ry, lit, dark){
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7);
  g.fillStyle = lit; g.fill();
  // lower shade, clipped to the body
  g.save();
  g.clip();
  g.fillStyle = dark;
  g.beginPath(); g.ellipse(x, y + ry*0.62, rx*1.1, ry*0.85, 0, 0, 7); g.fill();
  g.restore();
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7);
  G.ink(g, 1.6);
};

/* ---- 5. rect body ------------------------------------------
   Same idea for boxy sprites (torsos, crates).                  */
G.box = function(g, x, y, w, h, lit, dark, r){
  r = (r===undefined) ? 2 : r;
  const p = () => {
    g.beginPath();
    if(g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  };
  p(); g.fillStyle = lit; g.fill();
  g.save(); p(); g.clip();
  g.fillStyle = dark; g.fillRect(x, y + h*0.58, w, h*0.42);
  g.restore();
  p(); G.ink(g, 1.5);
};

/* ---- 6. darken a hex by a factor ---------------------------- */
G.dim = function(hex, f){
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n>>16)&255)*f)|0,
        gg= Math.max(0, ((n>>8)&255)*f)|0,
        b = Math.max(0, (n&255)*f)|0;
  return 'rgb('+r+','+gg+','+b+')';
};

/* ---- 7. lighten a hex TOWARD WHITE, not past it -------------
   dim() multiplies, which is right going down but wrong going up:
   multiplying a saturated colour just clips one channel and skews
   the hue. Lifting mixes toward white instead, so a highlight stays
   the same colour it started as. */
G.lift = function(hex, f){
  const t = Math.max(0, Math.min(1, (f-1)));
  const n = parseInt(hex.slice(1), 16);
  const mix = (v)=> (v + (255-v)*t)|0;
  return 'rgb('+mix((n>>16)&255)+','+mix((n>>8)&255)+','+mix(n&255)+')';
};

window.GFX = G;
})();
