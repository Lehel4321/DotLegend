# Dot Legend

A browser MOBA in the dot style. One lane, two nexuses, and every unit on the
board — champion, minion, turret, nexus — is a dot on a seamed grid.

No 3D, no build step, no dependencies. Open `index.html` and play — against the
bot, or against a friend.

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
| Hold `C` | Show your attack range. |
| `Esc` | Pause. (Closes the shop or cancels an aim first.) The game also pauses when you switch away. |
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

## Playing a friend

Choose **With a friend** on the champion screen. Both of you open the same page.

1. **Host** presses *Host a game* and sends the code it shows to the friend, in any chat.
2. **Friend** pastes it, presses *Make my reply*, and sends the reply back.
3. **Host** pastes the reply and presses *Connect*. The match starts by itself.

There is no server. Each code carries what two browsers need to find each other
(WebRTC); after that they talk directly. That is why it is two short codes (about 570
characters each) rather than a room number: a room number needs somewhere to live. A code
contains your network addresses, so send it only to the person you are playing.

The host is ORDER (left), the friend is CHAOS (right). Each picks a champion, and both can
pick the same one. Nobody can pause, and the pace is fixed at the host's setting, so
nobody can freeze or speed up the other. The match keeps running while you shop.

**How it works.** The host's page runs the one true simulation, with the friend driving
the other champion. The friend's page runs none: it sends what the player wants — the same
*intents* your own clicks become, validated by the same code — and draws what the host
sends back, twenty times a second. Two things follow:

- **The friend cannot cheat fog of war.** The host only tells them about what their side
  can see, so an enemy in the fog is not in the data at all. The host, which runs
  everything, *could* cheat. Play with people you trust.
- **The friend's own dot moves the instant they click**, not a round trip later. Their page
  predicts a walk to a point or a target and the host corrects it if it was wrong. With 140ms
  of simulated round trip the dot was already moving 90ms after the click, before the host
  had heard, and the two ended on the same spot with no jitter. (Attack-move and spells are
  not predicted; they wait for the host.)

**The host's tab runs the match, so keep it open and in front.** If the browser puts it in
the background it stops, and the friend sees a warning that the host has gone quiet.

### What has and has not been tested

Tested by `tools/test-net.js` (56 checks): two real browsers, real WebRTC data
channels, the real lobby driven the way two people would use it, and the same inside a
sandboxed frame with storage and clipboard blocked. It covers movement with 140ms of
simulated lag, spells, purchases, fog of war across the wire, kills and messages reaching
the right person, the end screen and a rematch, someone leaving, and a friend sending
garbage or hostile input.

**Not tested: two machines on different networks.** Both browsers in the test are on one
machine. Direct connections can fail on strict school or work networks, some VPNs, and
phone networks behind carrier-grade NAT, and there is no relay server to fall back on.
If two people cannot connect, the game says so and suggests trying another network.
It has also not been run inside claude.ai's own frame, only inside the strictest standard
sandbox.

## Difficulty

Chosen on the champion screen, remembered between visits, **Easy** the first time.

| | damage to you / min | its farming (CS / min) | your spells that land | |
|---|---|---|---|---|
| **Easy** | 499 | 1.8 | 81% | Hits for 70%, thinks slower, never uses its ultimate, earns 20% less gold. |
| **Normal** | 760 | 3.0 | 79% | The balance everything else was tuned against. |
| **Hard** | ~900 | 3.3 | 59% | Hits for 120%, and steps out of your spells — after a 0.22s reaction time, and only the 62% of them it notices. |

Those are measured, not hoped for (`tools/simulate.js`, 36 matches each, ±30 on the
damage figures). Easy is clearly easier. Hard is a modest step up in raw damage; what
makes it Hard is that it dodges. It is deliberately beatable: an instant, perfect
dodge would be an aimbot, and the first version of it was — it avoided 79% of spells.

## Seeing what you are doing

- Hover an enemy and a ring marks it and your cursor turns red: that is what a right-click
  will attack.
- An enemy minion **glows gold** the moment your next auto-attack would kill it, and its
  health bar turns gold. That is last-hitting, made visible.
- Melee dots lunge at what they hit and ranged dots recoil, so a fight reads at a glance.
- The first few times something matters, a one-line tip says so — how to move, where the
  gold comes from, that enemy spells show their shape first. Each appears once and is
  remembered.

## Putting it in the dot world

The game is one file and it never touches the page outside its own `#stage`,
so an `<iframe>` is enough. It also exposes a small API on `window`:

```js
DotLegend.version           // "0.2.0"
DotLegend.champions         // ["VECTOR", "PULSE", "BULWARK"]
DotLegend.start("PULSE")    // skip the select screen
DotLegend.autoplay(true)    // hand your dot to the lane AI — an attract screen
DotLegend.state()           // { phase, mode: "solo"|"host"|"guest", clock, kills, me: { … } }
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
| 22 | playing a friend: the invite code, the connection, host snapshots, the friend's client and prediction, the lobby |

Adding a champion means adding one entry to `CHAMPS` — the four abilities are
`{ key, name, cd, cost, range, aim, cast }`, and `cast` builds on the shared
primitives (`lineShot`, `burst`, `cone`, `dashTo`, `blinkTo`, `shield`, `buff`).
Nothing else in the file needs to know it exists.

## Tests and balancing

Neither is needed to play. Both drive the real page in a real browser.

```
npm i playwright
node tools/test.js        # 46 checks on controls and feel
node tools/test-net.js    # two browsers playing each other (~60s)
node tools/simulate.js    # how dangerous the bot is at each difficulty (~90s)
```

`test.js` covers the things that make it feel right or wrong: the camera holds your dot
dead centre, a wave cannot shove you, held right-click keeps following a cursor that is
standing still, a skillshot telegraphs and can be walked out of, the hard bot cannot
react instantly, settings survive a reload, and so on.

`simulate.js` plays a fixed-strength AI in your place and reports what a player would
feel: damage taken, how well the bot farms, and what share of your spells land. It nudges
each run's start because the simulation is otherwise deterministic, and reports standard
errors so a difference is not mistaken for noise. Use it after changing a number.

## Not in yet

Three lanes and a jungle, a second champion per side, wards, inhibitors,
neutral objectives, a relay server for the networks that block direct connections, and
spectating. The map is generated in `buildMap()` from a
handful of spans, so a three-lane version is a change to that function and to
the minions' waypoints rather than a rewrite.
