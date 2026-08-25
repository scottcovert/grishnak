# GRISHNAK — Universe Guide

*How to build a room in this world, and have it belong.*

This is the document the README promises. It is written for someone who wants
to add a game, a room, or a creature to Grishnak — or to lift the whole thing
and make their own. Everything here is either a rule you should follow to make
your work feel like it belongs, or a contract you must follow to make it run.

**Licence.** Code is MIT. Art and sound are CC BY 4.0. Take it, change it,
ship it, sell it. Credit GRISHNAK and you are square with us.

---

## 1. What Grishnak is

A valley you walk, and the things in it are doors.

A wrecked ship in a wheat field, a cracked door in a cave wall, an arcade
cabinet standing where no cabinet should be — each opens into a whole other
game. More than twenty of them share one map, one save, and one story. You
leave a game the way you entered it and you are standing where the door is.

It began as a Commodore 64 game its author wrote in the 1980s. The name is his.

**The one structural idea worth stealing: a door is not a menu.**

Most collections of games are a list. You look at the list, you read the
titles, you choose. The choosing happens outside the fiction — you are a person
at a menu, deciding what to spend the next twenty minutes on.

Grishnak has no list. To reach a game you walk to the thing it lives in and
open it. You find the wreck in the wheat before you find the game inside the
wreck. That means you meet every game as **a place you came across**, not an
option you evaluated — and when you leave it, you step back out of the same
wreck, standing in the same field.

Two things follow, and they are why the rule is worth keeping:
- **The map is the game.** Walking around is not navigation between the real
  content; it is the thing that holds the content together.
- **Every cabinet is a place before it is a genre.** You do not think "I will
  play a breakout clone now." You think "there is a cabinet in the square."

(There is a shortcut — `?g=<slug>` deep links open any space directly, for
sharing and for video. That is a side door for the owner and the audience,
not the way the world is meant to be met.)

---

## 2. The register

**Dark Tower and The OA.** Something old and patient underneath, told plainly.

- **Simple words. Never ornate.** If a sentence sounds like fantasy-novel
  narration, cut it. The world is strange; the prose is not.
- **Names are plain and short.** THE CHIMNEY. THE RIBS. TWO CATS. THE SHELF.
  A name should sound like something a working person called it, not something
  a wizard named it.
- **The uncanny arrives sideways.** Nothing announces itself as mysterious.
  A thing is wrong in a small, specific, physical way, and it is left alone.

### The plain-voice law (dialogue, lore, flavour text)

- **Vary sentence SHAPE.** The single most obvious tell of machine-written game
  text is the repeated rhythm of *flat clause, then inverted twist* — "The
  door was open. It should not have been." Once is fine. Three times is a
  signature. Mix lengths and structures deliberately.
- **Concrete over profound.** A detail beats an observation. What something
  smells like beats what it means.
- **Never explain the lore to the player.** Characters know their own world
  and do not narrate it for an audience.

### The lore law

Lore is discovered, never delivered. It arrives in fragments, out of order,
through people who have their own reasons for speaking. Nothing in the world
exists to inform the player.

---

## 3. The build law

Eight rules every room in this world follows. They are craft rules, not themes,
and they are the reason the cabinet feels the way it does.

1. **Guaranteed early competence.** The first two minutes must not fail the
   player. Whatever the room is about, it opens by letting them succeed.
2. **Low-stakes failure.** Cost time, position, progress — not a life, not a
   run, not their work. Failure should make a player lean in, not flinch.
3. **Short, complete sessions with a real ending.** Every space is finishable.
   A thing that ends is worth more than a thing that goes forever.
4. **Small persistent visible progress.** Never resettable, never wiped.
5. **No streaks. No comparison. No guilt on exit.** Leaving must cost nothing.
   A room that punishes you for stopping is a room that does not respect you.
6. **Novelty and variety.** Anything repeated stops registering. Assume every
   element has a shelf life and plan the next one.
7. **Beauty and calm are active ingredients**, not decoration.
8. **Interruptions live at boundaries.** The door in and the door out. Never
   in the middle of play.

**Tone is separate from structure.** A room may be tense, sad, frightening or
bleak and still obey all eight. Structure is how you treat the player; tone is
what the room is about. Do not flatten this world into comfort — one of its
games is a paranoid corporate thriller and it follows every rule above.

**These rules cost engagement on purpose.** Sessions that end, no streaks, a
free exit — all of it lowers the numbers a normal studio optimises. That is
the point. This is a cabinet that wants you to stop when you are done.

---

## 4. Naming laws

- **Walls built from square brick carry BLOCK or SQUARE in the name.**
  BLOCKHEAD. SQUARE ONE. The name tells you the shape before you see it.
  (Still free: THE BLOCKADE, SQUARE DEAL, CITY BLOCK, TOWN SQUARE.)
- **A name should describe the thing, not the feeling.** THE GALLERIES is a
  wall with galleries in it. THE COOPERAGE is made of barrels.
- **Do not borrow another world's proper nouns.** Take mechanics from anywhere;
  take names from nowhere. A borrowed name ties your canon to someone else's.

---

## 5. The layer contract — how a game plugs in

Every game in Grishnak is a **layer**: one file that registers a single global
object. There are twenty of them and they all have the same shape.

```js
window.YourGameLayer = {
  enter(){ /* set up a fresh run. Save where the player was standing. */ },
  exitDone(){ /* put them back exactly there. */ },
  update(){ /* one tick of your game. */ },
  draw(){   /* one frame of your game. */ },
  _t:{ /* optional: internals exposed for headless tests */ }
};
```

- **`enter()`** is called once when the door opens. Stash the player's position
  and screen so you can restore it; reset your own state; say one line of
  toast if the room needs introducing.
- **`exitDone()`** is called when the player leaves. Put them back on the map
  where the door is — not at a spawn point. This is the rule that makes the
  valley feel continuous.
- **`update()` / `draw()`** are called by the shell each frame while your layer
  owns the screen. The shell handles the canvas, input state, sound, saving and
  the transition wipe. You do not manage the game loop.
- **`_t`** is a deliberate hole in the encapsulation: the internals a test
  harness needs, exposed so the suites drive the *real* engine rather than a
  copy of it. Every shipped layer does this. Yours should too.

**Registering the door.** The shell keeps a table of portals — a key, a label,
a colour, and whether the door is open yet:

```js
yourgame:{ label:'YOUR GAME', color:'#8fc4ff', ok:()=>true, req:'', live:true }
```

Then place the door somewhere in the world (a cabinet, a wreck, a hole in a
wall) and wire its interaction to the transition that hands control to your
layer. ESC returns the player to the map.

**Deep links.** Every major space has a shareable front door:
`?g=<slug>` (or `#<slug>`) boots straight into it — `?g=stonebreaker`,
`?g=waka`, `?g=omega`. Add your slug to the same table and your room is
linkable and video-able from day one.

---

## 6. Art

- **The house style for characters is photographed toy.** Realistic glossy
  plastic figures on a green screen, shot like product photography — then
  chroma-keyed and packed into a sprite atlas. Not pixel art, not cartoon.
- **Character sheets are 2×4 grids, 8 cells, one figure, same scale
  throughout.** Row 1 is the side view facing RIGHT (the engine mirrors for
  left) plus one signature pose; row 2 is toward-camera and away.
- **Two or three cells per creature is enough.** They alternate every 16
  frames. Animation variety is not where the appeal lives.
- **Keying notes learned the hard way:** a ratio-only green test eats glossy
  black surfaces, because green screen *reflects* in them — require absolute
  green dominance too. Despill only within a few pixels of the cut edge, or
  you will drain the colour out of anything green deep inside the silhouette.
- **Light mode by default.** Dark is a deliberate choice for a specific room,
  never the house default.
- **No arrows in UI.** No spiders, anywhere, ever.

---

## 7. The cosmology, lightly

There is one entity with many faces. It appears as different things in
different games and it is never explained. Players who play everything will
notice; players who play one cabinet will not, and lose nothing.

Write toward it, never about it.

---

## 8. If you build something

Open an issue on the repo and show us. If you make your own valley out of this,
that is the best possible outcome and you owe us nothing but the credit line.

*— scovert.com/grishnak*
