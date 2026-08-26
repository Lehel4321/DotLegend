# Dot Legend

A browser MOBA in the dot style. One lane, two nexuses, and every unit on the
board — champion, minion, turret, nexus — is a dot on a seamed grid.

No 3D, no build step, no dependencies. Open `index.html` and play.

```
git clone <this repo> && cd DotLegend
open index.html          # or: python3 -m http.server 8000
```

## The match

You are the blue dot on **Order**. A bot champion holds the lane for **Chaos**.
Waves meet in the middle every 22 seconds; three turrets stand between you and
each nexus. Kill the enemy nexus to win. A match runs about 7–12 minutes.

The League rules that make a lane a lane are all here:

- **Last-hitting.** Gold comes from the killing blow on a minion, not from
  hitting it. A dot you nearly killed pays nothing.
- **Turret order.** A turret is invulnerable while a turret further out on the
  same side is still standing — it wears a pale ring until then. The nexus is
  invulnerable until every turret is down.
- **Turret aggro.** Turrets shoot minions first. Hit an enemy champion inside
  their turret's ring and it drops everything to shoot you, and it hits harder
  with every consecutive shot on the same target.
- **Brush.** The green pockets hide you. Someone standing in brush is invisible
  unless you are in brush with them, or close enough to trip over them.
- **Fog.** You see what your dots see. Everything else is dark.
- **Cast times.** Every spell except the dashes roots you for a moment first and
  paints its shape on the ground while it winds up. That wind-up is why a
  skillshot can be dodged — walk off the line and it passes through empty grid.
- **Recall.** `B` channels for five seconds and breaks the instant anything
  touches you.
- **The shop opens in your fountain only**, and opens by itself when the match
  starts, so your first item is bought before minions spawn. Going home for the
  next one costs you the lane.

The camera sits close and locks dead centre on your dot, the way a MOBA camera
does — you see the fight you are in, not the whole map. The minimap is how you
know what is happening elsewhere.

**Minions never push you.** A champion absorbs none of a minion's overlap, so you
walk straight through a wave instead of being shoved around by it. Champions
still collide with each other.

**The pace is yours.** `[` and `]` scale the whole simulation between 0.5x and
1.5x, live, and the bar shows where you are. It ships at 0.9x. Everything scales
together — movement, attacks, cooldowns, wave timers — so nothing gets out of
step with anything else.

## Controls

| | |
|---|---|
| Right click | Move there. **Hold** it and your dot follows the cursor. |
| Right click an enemy | Attack that dot until it dies. |
| `Q` `W` `E` `R` | Cast at your cursor immediately. Click the icon instead to aim first. |
| `[` `]` | Slow the whole game down or speed it up, any time. |
| `Ctrl` + `Q/W/E/R` | Spend a skill point (or click the `+` on the icon). |
| `A` then click | Attack-move: walk there, hit whatever you meet. |
| `S` | Stop. |
| `B` | Recall. |
| `P` | Shop (fountain only). |
| `Space` | Snap the camera back to your dot. `Y` unlocks it. |
| Scroll | Zoom in and out. |
| `M` | Mute. |

Ultimates unlock at level 6, 11 and 16. Other abilities cap at rank 5.

## The three dots

| | | |
|---|---|---|
| **VECTOR** | Marksman, ranged | A line that pierces everything, a hop out of trouble, and a snipe the length of the lane. Longest reach, least health. |
| **PULSE** | Mage, ranged | A slowing bolt, a pool that burns the ground for three seconds, a blink through terrain, and a stun on everything within 230. |
| **BULWARK** | Fighter, melee | A cleave that heals, a shield, a charge that stuns the first dot it hits, and a quake that catches a whole fight. |

The bot takes one of the other two.

## Putting it in the dot world

The game is one file and it never touches the page outside its own `#stage`,
so an `<iframe>` is enough. It also exposes a small API on `window`:

```js
DotLegend.version           // "0.1.0"
DotLegend.champions         // ["VECTOR", "PULSE", "BULWARK"]
DotLegend.start("PULSE")    // skip the select screen
DotLegend.autoplay(true)    // hand your dot to the lane AI — an attract screen
DotLegend.state()           // { phase, clock, kills, me: { champ, level, k, d, a, cs, gold } }
DotLegend.onEnd = (result, state) => { ... }   // "win" | "loss"
```

The dot world can drop the game into a box, watch `onEnd`, and pay out from
`state()` without owning any of the game's internals.

Everything the dot world already uses is shared on purpose: the same near-black
ground, the same seamed grid of tiles, the same circle-on-a-cell for a unit, the
same colour tokens (`--ground --panel --edge --ink --hot --safe --gold`), the
same DOM-not-canvas HUD, and the same square-wave blips.

## Where the code is

`index.html` is one file, sectioned with banner comments:

| Section | |
|---|---|
| 1 The world | tile map, lane, brush, fountains, turret and nexus placement |
| 2 Numbers | wave timing, gold, XP curve, minion and turret stats |
| 3 Champions | the three champions and their abilities, as data + a `cast()` |
| 4 Items | the shop |
| 5–7 | state, unit construction, derived stats, A\* pathing |
| 8–11 | damage and mitigation, projectiles, ability primitives, vision and brush |
| 12 | the simulation step |
| 13 | the lane bot |
| 14 | the renderer |
| 15–18 | sound, HUD, shop, input |
| 19–21 | match setup, the loop, the embed API |

Adding a champion means adding one entry to `CHAMPS` — the four abilities are
`{ key, name, cd, cost, range, aim, cast }`, and `cast` builds on the shared
primitives (`lineShot`, `burst`, `cone`, `dashTo`, `blinkTo`, `shield`, `buff`).
Nothing else in the file needs to know it exists.

## Balancing

`tools/simulate.js` plays the bot against itself across every champion matchup
and prints how each match ended. It needs Playwright, which the game itself does
not.

```
npm i playwright && node tools/simulate.js
```

Use it after changing a number: a champion that wins both of its non-mirror
matchups, or a matrix where matches stop ending, is the signal.

## Not in yet

Three lanes and a jungle, a second champion per side, wards, inhibitors,
neutral objectives, and online play. The map is generated in `buildMap()` from a
handful of spans, so a three-lane version is a change to that function and to
the minions' waypoints rather than a rewrite.
