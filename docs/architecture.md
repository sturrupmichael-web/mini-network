# Mini Network architecture

This is the map of the code as of Phase 3. It's meant to stay current as
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
  index.js            │            routing.js   congestion-aware shortest paths, cut links
  theme.js ───────┐   │            equipment.js switches, SD-WAN
                  │   │            events.js    event schedule and effects
                  │   │            progression.js  clock, new sites, traffic growth, rewards
                  │   │            geometry.js  45°/90° metro paths, points along a path
                  │   │          loop.js      fixed-timestep loop: pause, 1×/2×
                  │   │          rng.js       seeded RNG (all gameplay randomness)
                  │   │          storage.js   localStorage wrapper ("miniNetwork:" keys)
                  └───┴────────▶ render/      reads the world, draws it
                                   canvas.js    high-DPI + responsive canvas
                                   camera.js    world ⇄ screen (turns maps 90° on portrait phones)
                                   renderer.js  draws boundaries, links, packets, sites, queues
                                 input/pointer.js  drag-to-draw links (mouse, pen, touch)
                                 ui/hud.js         DOM HUD: score, pause/speed, inventory tray
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

## Links

A link joins two sites with a metro-style path: one straight run then one
45° diagonal (`geometry.octilinearPath`). Each direction has its own
bandwidth: after sending a packet of size `s`, that direction is busy for
`s / bandwidth` seconds. Each drag gesture gets the next line colour.

## Config schema (data/)

Every file is a plain ES module, bundled into the build. Every field is
commented in the file itself; this is the overview.

| File | Export | What it holds |
| --- | --- | --- |
| `config.js` | `CONFIG` | Engine and balance numbers: `sim` (tick rate, speeds), `links` (starting count, daily delivery, bandwidth, packet speed), `routing` (cost weights), `spawn` (packet rate, weekly growth), `sites` (spacing, edge and boundary clearance), `growth` (new-site timing, radius, type odds), `overload` (ring timer length and recovery), `time` (day length, days per week), `input` (radii for mouse and touch), `view` (padding, HUD space) |
| `sites.js` | `SITE_TYPES` | `{ id: { name, shape, size, capacity, packetInterval, traffic: { trafficId: weight }, activity: { day, night }, burst, unlockDay, junction? } }` |
| `traffic.js` | `TRAFFIC_TYPES` | `{ id: { name, color, shape, size, to, points, unlockDay, hours, maxHops?, dropPoints?, cloudShare?, junk? } }` |
| `maps.js` | `MAPS` | `[{ id, name, width, height, start: [{ type, x, y, label? }], boundaries: [[[x,y], …]] }]` |
| `rewards.js` | `REWARDS` | `[{ id, label, detail, weight, fromWeek, grant: { links?, upgrades?, switches?, firewalls?, sdwan?, leased?, capacity? } }]` |
| `events.js` | `EVENTS` | `[{ id, name, toasts, effect, schedule: { day, every? } or { weekday, fromWeek }, duration, params }]` |
| `equipment.js` | `LINK_TIERS`, `ITEMS` | Link tiers `{ id, name, bandwidth, width }`; tray items `{ name, hint, target }` |
| `theme.js` | `THEME` | Colours, line palette, drawing sizes |
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
