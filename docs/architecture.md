# Mini Network architecture

This is the map of the code as of Phase 1. It's meant to stay current as
phases land.

## The big picture

```
data/ (content + balance)       src/
  config.js  ─────────┐          main.js      picks a seed, validates data, starts the game
  sites.js            │          game.js      wires everything together (the only module that does)
  traffic.js          ├────────▶ sim/         the simulation: pure data + functions, no DOM
  maps.js             │            world.js     state, player actions, step()
  theme.js ───────┐   │            routing.js   congestion-aware shortest paths
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
3. Each `step`:
   1. recomputes routes if a link changed, or every `routing.recomputeInterval`
   2. spawns packets at sites whose timer is up (seeded RNG)
   3. dispatches queued packets onto their next hop, if that link direction
      has bandwidth free
   4. moves travelling packets; on arrival they're delivered (score) or join
      the next site's queue
4. The renderer draws the current state; the HUD updates only what changed.

Input events arrive between frames and call `addLink` directly, so they
always land between ticks.

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
| `config.js` | `CONFIG` | Engine and balance numbers: `sim` (tick rate, speeds), `links` (starting count, bandwidth, packet speed), `routing` (cost weights), `spawn` (global packet rate, grace period), `sites` (minimum spacing), `input` (grab/connect radii for mouse and touch), `view` (padding, HUD space) |
| `sites.js` | `SITE_TYPES` | `{ id: { name, shape, size, capacity, packetInterval: [min,max] or null, traffic: { trafficId: weight } } }` |
| `traffic.js` | `TRAFFIC_TYPES` | `{ id: { name, color, shape, size, to: siteTypeId, points } }` |
| `maps.js` | `MAPS` | `[{ id, name, width, height, start: [{ type, x, y, label? }], boundaries: [[[x,y], …]] }]` |
| `theme.js` | `THEME` | Colours, line palette, drawing sizes |

`src/data/validate.js` checks all of it: types and ranges, that every
reference (`traffic.to`, `sites.traffic`, `maps.start[].type`) exists, that
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
