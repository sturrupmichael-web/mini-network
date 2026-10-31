# Mini Network architecture

This is the map of the code as of Phase 5. It's meant to stay current as
phases land.

## The big picture

```
data/ (content + balance)       src/
  config.js  ─────────┐          main.js      picks a seed, validates data, starts the game
  sites.js            │          game.js      wires everything together (the only module that does)
  traffic.js          ├────────▶ sim/         the simulation: pure data + functions, no DOM
  maps.js             │            world.js     creates the world, step(), overload, re-exports actions
  rewards.js          │            sites.js     sites, capacity, destinations, day/night
  events.js           │            links.js     links, tiers, firewalls, leased lines
  equipment.js        │            packets.js   spawning, dispatch, movement, drops
  modes.js            │            routing.js   congestion-aware shortest paths, cut links
  theme.js ───────┐   │            equipment.js switches, SD-WAN
                  │   │            events.js    event schedule and effects
                  │   │            progression.js  clock, new sites, traffic growth, rewards
                  │   │            geometry.js  45°/90° metro paths, points along a path
                  │   │            grid.js      the link grid: squares, routes, costs, terrain
                  │   │            view.js      the open part of the map, growing with each site
                  │   │          loop.js      fixed-timestep loop: pause, 1×/2×
                  │   │          rng.js       seeded RNG (all gameplay randomness)
                  │   │          storage.js   localStorage wrapper ("miniNetwork:" keys)
                  │   │          scores.js    top-5 high scores per mode+map / daily date
                  │   │          daily.js     daily challenge seed + map, share text
                  │   │          audio/audio.js  Web Audio: ambient pad, delivery notes, cues
                  └───┴────────▶ render/      reads the world, draws it
                                   canvas.js    high-DPI + responsive canvas
                                   camera.js    world ⇄ screen (turns maps 90° on portrait phones)
                                   renderer.js  draws boundaries, links, packets, sites, queues
                                 input/pointer.js  drag-to-draw links (mouse, pen, touch)
                                 ui/hud.js         DOM HUD: score, pause/speed, mute, menu, tray, cards
                                 ui/title.js       title screen: mode, map, best score, settings
                                 ui/debug.js       debug panel (` key or ?debug): stats, cheats, knobs
                               sim/debug.js      cheats + stats for the panel (pure, tested in node)
                               tools/screenshot.mjs  makes the 1200×630 card image
                                 data/validate.js  checks data/ is well-formed
```

Dependencies only point one way: `sim/` imports nothing outside `sim/` and
`rng.js`. Rendering, input and UI read the world but only change it through
the simulation's action functions (like `addLink`).

## One frame

1. `requestAnimationFrame` calls `loop.advance(realMs)`.
2. The loop adds `realMs × speed` to an accumulator (nothing while paused)
   and runs `step(world)` once per whole tick (1/60 game second), at most
   `config.sim.maxTicksPerFrame` times. A 120 Hz phone and a 30 Hz laptop
   run exactly the same ticks.
3. Each `step` (skipped entirely while the game is over or a reward is
   waiting to be picked):
   1. progression: a new day delivers links and schedules that day's
      events; the end of a week grows traffic and halts for the reward
      picker; new sites appear when due
   2. events: start any that are due, tick running ones, end finished ones
   3. recomputes routes if a link changed, or every `routing.recomputeInterval`
   4. spawns packets at sites whose timer is up (seeded RNG), choosing
      from traffic that's unlocked, in hours, and has a destination
   5. dispatches queued packets onto their next hop, if that link direction
      has bandwidth free
   6. moves travelling packets; on arrival they're delivered (score) or join
      the next site's queue
   7. overload: any site with more queued than its capacity fills its ring
      timer; under capacity it drains. A full timer is an outage (game over),
      except in Zen mode (`createWorld({ outages: false })`)
4. The renderer draws the current state; the HUD updates only what changed.

Input events arrive between frames and call the player actions directly
(`addLink`, `removeLink`, `rerouteLink`, `chooseReward`), so they always
land between ticks.

## Player actions

| Gesture | Action |
| --- | --- |
| Drag from a site across others | `addLink` for each pair; starting from a line's end keeps its colour |
| Tap/click a link, then its × | `removeLink` (refunded; packets on it go back to the queue they left) |
| Right-click a link, or select + Delete | `removeLink` |
| Drag a link onto a site C | `rerouteLink`: A–B becomes A–C–B (existing links are reused) |
| Drag (or tap, then tap) a bandwidth upgrade onto a link | `upgradeLink` |
| ...a firewall onto a link | `addFirewall` |
| ...an SD-WAN box onto a site | `addSdwan` |
| ...a switch onto empty map / onto a link | `placeSwitch` / `placeSwitchOnLink` |
| Tap a switch, then its × (or right-click it) | `removeSwitch` |
| Pick a weekly reward | `chooseReward` |

## Phase 3 systems

- **Destinations** are keys: a site type (`"datacenter"`), several
  (`"datacenter|cloud"`, whichever is cheaper), or one site (`"#12"`, used by
  broadcasts). Routing tables are built lazily per key.
- **Bandwidth tiers** (`equipment.js` `LINK_TIERS`) multiply
  `config.links.bandwidth` and the drawn width.
- **Leased lines**: a link whose path crosses a map boundary uses one leased
  line per boundary crossed. Refunded with the link.
- **Firewalls**: after the security-rules event, a link touching an
  internet edge carries nothing until it has a firewall. Junk (DDoS) packets
  are filtered when they're sent down a firewalled link, which still costs
  bandwidth.
- **Cuts and SD-WAN**: a cut link carries nothing. Sites with SD-WAN route
  around it at once; everyone else learns after
  `failover.convergenceSeconds`.
- **Hop limits**: traffic with `maxHops` (VoIP, payments) is dropped if it
  needs more hops: lost points plus `drops.overloadPenalty` on that site's ring.
- **Day/night**: sites' `activity` multiplies their packet rate; traffic
  `hours` limits when it's sent (backups only at night). The background
  dims at night.
- **Events** (`data/events.js`) are scheduled per day from the seeded RNG
  and run through effect handlers in `sim/events.js`:
  `linkCut`, `broadcast`, `acquisition`, `securityRules`, `cloudMigration`,
  `ddos`. `triggerEvent(world, id)` starts one immediately.

## Phase 4: modes, maps and polish

- **Title screen** (`ui/title.js`): pick a mode and a map, see your best
  score for that pair, Play. While it's open a preview game runs behind it.
  The in-game menu button pauses and reopens it with Resume.
- **Maps** (`data/maps.js`): Florida Region, Coast to Coast and Campus.
  A map's optional `tuning` is merged over `config.js` section by section
  (`sim/config.js` `configForMap`), so maps can change spacing, growth,
  links or inventory without code.
- **Modes** (`data/modes.js`): Classic; Zen (`outages: false`, so
  `isHalted` never ends the game and no scores are kept); Daily challenge
  (`daily.js` hashes today's date to a map and seed `daily-YYYY-MM-DD`;
  the game-over card shows a share line with one coloured square per day,
  from `world.dayStress`, the worst overload ring that day).
- **High scores** (`scores.js`): storage key `highScores`, a top-5 list per
  `mode:map` or `daily:date`.
- **Settings** stored under `settings`: `{ speed, muted, theme }`. Theme is
  `system`, `light` or `dark`; it sets `data-theme` on `<html>` (CSS
  variables) and `ui.theme` (canvas palette from `THEME.light` /
  `THEME.dark`).
- **Audio** (`audio/audio.js`, `data/audio.js`): all sound is generated with
  Web Audio, no files. Each delivery plays a note of a pentatonic scale
  picked by traffic type, snapped to a beat (`createBeatQueue`) and capped
  per beat. Cues play for new sites, events, rewards and game over. Audio
  starts on the first tap (browser rule) and respects the mute setting.
- **Animation**: sites scale in, links draw along their path over
  `theme.linkAppearSeconds` of real time, and deliveries pop. These are
  render-only (real time, not game ticks), so they never affect the sim.
- **URL parameters**: `?seed=` skips the title and starts that seed; add
  `&map=campus` and/or `&mode=zen` to pick the map or mode.

## Phase 5: tuning and deploy

- **Debug panel** (`ui/debug.js`, `sim/debug.js`): `spawnSite`,
  `spawnBurst`, `skipTime` (steps the sim, stops at a reward or game over),
  `grantItems` and `debugStats`. Knob edits replace a config *section* on the
  running world (`world.config = { ...config, links: { ...links, bandwidth } }`)
  because sections can be shared with `data/config.js`; a new game starts
  from the data again.
- **Site colours**: each site type has a `color` in `data/sites.js`; every
  site is drawn filled with it, with a white outline and a soft shadow
  (`THEME.*.siteOutline`, `siteShadow`).
- **Tray tooltips**: each item in `data/equipment.js` has a `tip`. The HUD
  shows it on mouse hover (listening on the tray, since disabled buttons get
  no pointer events), on keyboard focus, and for 2.5 s after a touch press,
  with a live "N left" line.
- **Deploy**: see the README. Tests on `main` → Deploy builds and publishes
  `index.html` to Pages.

## Progression

- Days last `time.secondsPerDay` game seconds. Each new day adds
  `links.perDay` links.
- Each week ends with a pause and two different rewards from
  `data/rewards.js` (weighted, filtered by `fromWeek`). Traffic intervals
  shrink by `spawn.weeklyIntervalMultiplier`.
- New sites appear every `growth.interval` seconds, shrinking by
  `growth.intervalDecay` each time down to `growth.minInterval`. A spot is
  valid when it's inside `sites.edgeMargin`, at least `sites.minSpacing`
  from other sites, `sites.boundaryClearance` from carrier boundaries, and
  within a radius of the data center that grows each day.

## Determinism

All gameplay randomness uses `world.rng` (mulberry32). Same seed + same
actions on the same ticks gives an identical game: `snapshot(world)` is
compared in the tests. Routing ties break on link id, and iteration order is
always creation order. Use `?seed=anything` in the URL to replay a seed.

## Routing

Each destination type (just the data center for now) gets a multi-source
Dijkstra outward from every site of that type. A packet at a site picks the
neighbouring link with the lowest

    link length + hopCost + congestionWeight × packets on the link
              + queueWeight × packets queued at the far site
              + far site's cost to the destination

It avoids going straight back where it came from unless that's the only way.

## Terrain and the growing map

- **Terrain** (`map.terrain`, kinds in `data/terrain.js`): polygons; every
  grid square whose centre is inside one is blocked (`world.terrain`, a
  Map from cell key to kind, built once in `createWorld`). Links can't
  cross those squares, switches can't go on them, and new sites keep a
  square away. The validator checks starting sites are clear.
- **The open area** (`world.view`, `sim/view.js`): starts at
  `growth.viewStart` of the map around HQ and grows by `growth.viewPerSite`
  per added site; it always includes every site plus `growth.viewPadding`,
  and never shrinks. New sites, links and switches stay inside it, except
  acquisitions, which can land in a far corner and pull the area open.
- **Camera**: `fitCamera(…, rect)` fits a part of the map; whether it
  turns 90° depends only on the whole map. `game.js` eases the shown rect
  towards `world.view` each frame (`view.zoomSpeed`), so it zooms out
  smoothly; `settleCamera()` jumps there (tests, screenshots). The renderer
  shades everything outside `world.view`.

## Links and the grid

The map is a grid of `grid.cellSize` squares (`sim/grid.js`). Every site
sits in the middle of a square. A link is a chain of touching squares
(sideways, up/down or diagonal) from one site's square to another's, never
through a third site; each square between the two ends uses one link from
the inventory, and removing the link refunds them all. The drawn polyline
(`link.path`) runs through the square centres with straight runs merged,
so lines are 0°/45°/90°.

Players draw the route: the pointer input steps one square at a time
towards the pointer, cuts square kinks into diagonals, and undoes squares
when you drag back over the path. Reaching a site calls
`addLink(world, a, b, line, cells)`. Without `cells` (rerouting, splitting
with a switch, tests, the bot) `autoCells` uses the straight route if it's
clear, else a breadth-first search around sites.

Each direction has its own bandwidth: after sending a packet of size `s`,
that direction is busy for `s / bandwidth` seconds. Each drag gesture gets
the next line colour.

## Config schema (data/)

Every file is a plain ES module, bundled into the build. Every field is
commented in the file itself; this is the overview.

| File | Export | What it holds |
| --- | --- | --- |
| `config.js` | `CONFIG` | Engine and balance numbers: `sim` (tick rate, speeds), `links` (starting count, daily delivery, bandwidth, packet speed), `routing` (cost weights), `spawn` (packet rate, weekly growth), `sites` (spacing, edge and boundary clearance), `growth` (new-site timing, radius, type odds), `overload` (ring timer length and recovery), `time` (day length, days per week), `input` (radii for mouse and touch), `view` (padding, HUD space) |
| `sites.js` | `SITE_TYPES` | `{ id: { name, shape, color, size, capacity, packetInterval, traffic: { trafficId: weight }, activity: { day, night }, burst, unlockDay, junction? } }` |
| `traffic.js` | `TRAFFIC_TYPES` | `{ id: { name, color, shape, size, to, points, unlockDay, hours, maxHops?, dropPoints?, cloudShare?, junk? } }` |
| `maps.js` | `MAPS` | `[{ id, name, width, height, start: [{ type, x, y, label? }], boundaries: [[[x,y], …]] }]` |
| `rewards.js` | `REWARDS` | `[{ id, label, detail, weight, fromWeek, grant: { links?, upgrades?, switches?, firewalls?, sdwan?, leased?, capacity? } }]` |
| `events.js` | `EVENTS` | `[{ id, name, toasts, effect, schedule: { day, every? } or { weekday, fromWeek }, duration, params }]` |
| `equipment.js` | `LINK_TIERS`, `ITEMS` | Link tiers `{ id, name, bandwidth, width }`; tray items `{ name, hint, tip, target }` |
| `maps.js` tuning | `tuning` | Per-map overrides of any `config.js` section |
| `modes.js` | `MODES` | `{ id: { name, detail, outages, daily, scores } }` |
| `audio.js` | `AUDIO` | Volume, ambient pad, scale/beat for delivery notes, per-traffic scale steps, cues |
| `theme.js` | `THEME` | `light` and `dark` palettes, line colours, drawing sizes, animation timings |
| `index.js` | `GAME_DATA` | All of the above in one object (add new data files here) |

`src/data/validate.js` checks all of it: types and ranges, that every
reference (`traffic.to`, `sites.traffic`, `maps.start[].type`,
`growth.types`, reward grant keys, event effects and params,
`config.inventory` items) exists, that
starting sites are on the map and spaced apart, and that every map has a
destination for its traffic. The tests fail on any problem, and the browser
logs a warning.

## Builds

`dev.html` loads `src/main.js` and `styles/main.css` directly.
`npm run build` (`build.mjs`) bundles and minifies with esbuild, inlines the
JS and CSS into `index.html`, writes a CSP with the scripts' sha256 hashes,
and fails if any `src`/`href` in `dev.html` still points at a file.

## Tests

`npm test` runs `tests/*.test.mjs`. Browser files (`export const browser =
true`) run three times: `dev.html` over http, the built `index.html` over
http, and `index.html` from disk. Any console error fails a browser test.
