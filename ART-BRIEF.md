notes on additional main game splash screens below

----------------

## 2. STONEBREAKER INTERSTITIALS — the wordless beat

**Path:** `images/lore/lore-<n>.jpg` where `<n>` is the **wall number, 1–29** (`.png` also works; JPG is far smaller for painted work)

**These now REPLACE the text, not sit above it.** Clear a wall and the screen holds for about three seconds. If art exists for that wall it fills the frame edge to edge — no frame, no sentence, nothing competing — with only a dim `WALL n` and `SPACE` on a thin strip at the bottom. If it doesn't, the written line shows exactly as it does today. **So the words are the fallback and the painting is the upgrade**, which means any subset works and each one you paint quietly promotes that wall.

| Spec | Value |
|---|---|
| Size | **1280×864** (2× the game canvas) |
| Format | JPG (PNG fine for flat/graphic work) |
| Weight | under 400KB |
| Fit | cover-fit, so a slightly different ratio is fine — it crops, never stretches |
| Keep clear | the bottom ~30px carries a faint scrim with the two labels |

**Reading time is about two seconds at full strength** (it fades in, holds, fades out). That is the whole constraint: ONE subject, readable as a silhouette, no hunting. These can go **darker and quieter than the splash screens** — a title screen sells the game, these are a breath between rounds. **No readable words inside the image** (numbers on a ledger are fine, sentences are not) — that would put back the thing you're removing.

---

### The one rule that replaces all the others

**The number in the filename chooses where the picture appears.** `lore-3.jpg` plays after wall 3, `lore-22.jpg` after wall 22. That means **the subject is completely free** — paint whatever you feel like painting, then pick the number that puts it in the right mood. The arc comes from *where things land*, not from restricting what you draw. A friendly capybara at wall 4 and ghastly children at wall 20 is not a mixed bag, it is a story about a valley going wrong.

A rough shape to hang things on, ignore freely:

| Walls | Where the run is | What suits it |
|---|---|---|
| 1–8 | the valley as it was | sunlit, ordinary, cozy |
| 9–17 | something is off | quiet wrongness, nobody alarmed yet |
| 18–25 | it is bad now | dark, figures, power |
| 26 | the reveal | the toy — it lands on THE PLAYSET, the plastic wall |
| 27–29 | after the reveal | the chronicle back on the record — quieter, matter-of-fact |

**Three slots were added 2026-08-21** (THE LOOM, THE TOLLHOUSE, THE CEILING went in behind THE PLAYSET). **Nothing you may already have planned moved** — the toy is still wall 26, and every number below it means exactly what it meant before. There are simply three more at the end. Wall 30 is THE WARLORD and has no slot: clearing him plays THE OTHER FACE instead.

Subjects that suit the three new ones, if you want them: **27** a course of stone hung on wire, sagging (that is literally the wall); **28** a tollhouse at a gap in a wall, shuttered, with a worn ledge; **29** a yard with a roof over it and one hole in the roof.

---

### The cast — refined from Scott's own list (2026-08-20)

Worth saying: **almost none of this is invention.** The death ray, the fireball, the ducks, the capybara, the watching silhouette and the toy god are all *already in the game*. This is a portrait gallery of a cast that exists.

**Cozy — suits walls 1–8**
1. **Ducks on the millpond at first light.** The valley before any of it. Mist on the water.
2. **A capybara in the shallows with a duck asleep on its back.** Total serenity. (The capybara-as-peacemaker idea is already filed under THE POND ACCORD.)
3. **The quarry in full swing** — dust hanging in sunbeams, dozens of men, everything fine.
4. **A mason's hands and a chisel, close up**, stone dust in the light.

**Turning — suits walls 9–17**
5. **A face in the quarry seam** — not carved, just *there* in the grain of the rock. *(face 1 of 3)*
6. **Shadowy figures at the treeline**, watching the wall go up. Too far away to read. (This is THE LURKER's family — he already watches the title screen.)
7. **A child with her ear flat against the stone**; the adults behind her have not noticed.
8. **The wall at dusk with birds on every roof, fence and tree — and none at all on the wall.**
9. **A green coin held up, worn nearly smooth**, the profile only just readable. *(face 2 of 3)*

**Bad — suits walls 18–25**
10. **Ghastly children fading in and out** in a hallway with dead bulbs — half-there, lit wrong. (Your noir-macabre idea; they are only ever a distraction, never a threat.)
11. **A wizard with a death ray**, the beam blowing a clean lane straight through masonry. The death ray is a real Stonebreaker powerup — this gives it a face. Land it just after a wall where it does the work.
12. **A wizard mid-fireball**, the spell lighting his own face from underneath. Pairs with the Fireball Maze.
13. **An empty helm on a post, face-guard down.** Nothing inside it.
14. **The Warlord's camp at night** — and one fire, which he does not allow.
15. **Stone soldiers in a line, one turned slightly out of true.**

**Wall 26 only**
16. **A chipped wooden toy soldier's painted face.** *(face 3 of 3 — and the reveal.)*

That is **three faces, not ten** — the seam, the coin, the toy. Enough to feel like a thread without committing you to a series.

### Still available as series, if you ever want one

- **THE QUARRY GOES DOWN** — one viewpoint, revisited: sunlit and crowded → ropes and ladders → lanterns with daylight a bright square overhead → tools dropped where they lay, nobody in frame → the mouth grown over with one plank across it.
- **ONE ARRESTING SCENE** — standalone questions: a name half-carved and the rest impossibly smooth; a guard asleep bolt upright while others walk past; a cart of rubble hauled away with the wall already whole behind it.

### On monsters

**Stonebreaker has no monsters** — it is a wall, a ball and a slab — so creature art has nowhere to land *there*. But as above, it does not need monsters: wizards, figures, children and animals all have homes. Actual monsters belong to THE LOWER COURSES once it exists.

---

## NAMING — the whole thing you have to get right

Two different slots, **two different folders**. That is the only real trap.

**Title paintings** → `grishnak/images/splash-6.jpg`
> next free numbers are **6, 7, 8, 9, 10**. Shown at random on load.

**Interstitials** → `grishnak/images/lore/lore-3.jpg`
> the number is the **wall number, 1–29**, and it decides where the picture plays.

Both: **JPG**, **under 400KB**, no leading zeros (`lore-3`, never `lore-03`), all lower case. Drop the file, reload, it is there — nothing to ask me for.

| | Title paintings | Interstitials |
|---|---|---|
| Folder | `images/` | `images/lore/` |
| Name | `splash-<6–10>.jpg` | `lore-<1–29>.jpg` |
| Size | ~1280 wide | 1280×864 |
| Mood | sells the game | a breath between rounds — darker, quieter |
| Keep clear | wordmark band near top, bottom third | bottom ~30px |

## 3. NOT YET — don't draw these until the game exists

Listed so they are not forgotten, and so no effort goes into art with nowhere to land:

- **THE BULLRING** — bull animation cells. Needs the coliseum game built first.
- **CLEARANCE / RIGHT OF WAY** — the sidewalk-trimmer machine. Needs the side-view screen built first, and the name picked.
- **THE LOWER COURSES** — the 3/4 dungeon. Monsters there are drawn **in code** as lit silhouettes, so this one likely needs no art from you at all.

---

## House rules that apply to all of it

- **No spiders, no cobwebs.** Anywhere, ever.
- **Walls and floors never near the same colour** — if a piece has both, they need clearly different values.
- Light mode is a web rule, not a game rule; the game is free to be dark.
