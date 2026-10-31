import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { MAPS } from "../data/maps.js";
import { createCamera, fitCamera, worldToScreen } from "../src/render/camera.js";
import { configForMap } from "../src/sim/config.js";
import { autoCells, cellCenter, cellKey, cellOf, inView, isTerrain } from "../src/sim/grid.js";
import { chooseReward } from "../src/sim/progression.js";
import { addLink, placeSwitch, step } from "../src/sim/world.js";
import { configWith, customMap, makeWorld } from "./helpers.mjs";

const S = CONFIG.grid.cellSize;
const TPS = CONFIG.sim.tickRate;

/** A map with a wall of water between HQ (left) and an office (right). */
function walled() {
  const map = customMap([
    { type: "datacenter", x: 4.5 * S, y: 8.5 * S },
    { type: "office", x: 14.5 * S, y: 8.5 * S },
  ]);
  map.terrain = [{ kind: "water", points: [[9 * S, 3 * S], [10 * S, 3 * S], [10 * S, 14 * S], [9 * S, 14 * S]] }];
  return makeWorld({ map });
}

function play(world, seconds) {
  for (let i = 0; i < seconds * TPS && !world.over; i++) {
    if (world.pendingReward) chooseReward(world, world.pendingReward.options[0]);
    step(world);
  }
}

export const tests = [
  ["terrain shapes block the squares inside them", () => {
    const world = walled();
    assert.ok(isTerrain(world, { cx: 9, cy: 8 }));
    assert.ok(!isTerrain(world, { cx: 8, cy: 8 }));
    assert.equal(world.terrain.get(cellKey({ cx: 9, cy: 5 })), "water");
  }],
  ["links can't cross terrain, so they go around it", () => {
    const world = walled();
    const [h, o] = world.sites;
    const straight = [];
    for (let cx = 4; cx <= 14; cx++) straight.push({ cx, cy: 8 });
    assert.equal(addLink(world, h.id, o.id, 0, straight).reason, "terrain");
    const around = autoCells(world, h, o);
    assert.ok(around, "a way around exists");
    assert.ok(around.every((c) => !isTerrain(world, c)));
    const r = addLink(world, h.id, o.id);
    assert.ok(r.ok, r.reason);
    assert.ok(r.link.cost > straight.length - 2, "going around costs more");
  }],
  ["nothing is built on terrain", () => {
    const world = walled();
    world.inventory.switches = 1;
    assert.equal(placeSwitch(world, 9.5 * S, 8.5 * S).reason, "on-terrain");
  }],
  ["every real map has terrain, and new sites never land on or beside it", () => {
    for (const map of MAPS) {
      const world = makeWorld({ map, config: configForMap(CONFIG, map), seed: `t-${map.id}`, outages: false });
      assert.ok(world.terrain.size > 20, `${map.id} has terrain`);
      play(world, 60 * 6);
      for (const s of world.sites) {
        const c = cellOf(world, s.x, s.y);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          assert.ok(!isTerrain(world, { cx: c.cx + dx, cy: c.cy + dy }), `${map.id}: ${s.type} next to terrain`);
        }
      }
    }
  }],
  ["the map opens up as sites are added, and never closes", () => {
    const world = makeWorld({ config: configWith({ overload: { seconds: 1e9 } }), seed: "grow" });
    const map = world.map;
    const first = { ...world.view };
    assert.ok(first.width < map.width && first.height < map.height, "starts zoomed in");
    for (const s of world.sites) assert.ok(inView(world, s.x, s.y), "starting sites are in view");
    let last = first;
    for (let i = 0; i < 40; i++) {
      const before = world.sites.length;
      play(world, 10);
      const v = world.view;
      assert.ok(v.width >= last.width - 1e-9 && v.height >= last.height - 1e-9, "never shrinks");
      assert.ok(v.x <= last.x + 1e-9 && v.y <= last.y + 1e-9, "never shrinks");
      for (const s of world.sites.slice(before)) assert.ok(inView(world, s.x, s.y), "new sites are in view");
      last = { ...v };
    }
    assert.ok(last.width > first.width, "it grew");
    assert.ok(world.stats.sitesAdded > 10);
  }],
  ["new sites only appear in the open part of the map", () => {
    const world = makeWorld({ config: configWith({ overload: { seconds: 1e9 } }), seed: "open" });
    for (let i = 0; i < 20 * 60 * TPS; i++) {
      if (world.pendingReward) chooseReward(world, world.pendingReward.options[0]);
      const v = { ...world.view };
      const before = world.sites.length;
      step(world);
      for (const s of world.sites.slice(before)) {
        if (s.type === "datacenter") continue;
        const inside = s.x >= v.x && s.y >= v.y && s.x <= v.x + v.width && s.y <= v.y + v.height;
        // Acquisitions are the exception: they open up a far corner.
        const acquired = world.events.some((e) => e.type === "event" && e.id === "acquisition");
        assert.ok(inside || acquired, `site at ${s.x},${s.y} outside ${JSON.stringify(v)}`);
      }
      world.events.length = 0;
      if (world.over) break;
    }
  }],
  ["links stay inside the open area", () => {
    const world = makeWorld();
    const [h] = world.sites;
    const v = world.view;
    const outside = cellOf(world, v.x + v.width + S, v.y + v.height / 2);
    const c = cellCenter(world, outside);
    assert.ok(!inView(world, c.x, c.y));
    assert.ok(autoCells(world, h, { x: c.x, y: c.y }) === null || !inView(world, c.x, c.y));
  }],
  ["the camera fits the open area into the screen", () => {
    const map = MAPS[0];
    const rect = { x: 200, y: 100, width: 600, height: 400 };
    for (const [w, h] of [[1200, 800], [390, 844]]) {
      const insets = { top: 80, bottom: 90, left: 20, right: 20 };
      const cam = fitCamera(createCamera(), map, w, h, insets, rect);
      const a = worldToScreen(cam, rect.x, rect.y);
      const b = worldToScreen(cam, rect.x + rect.width, rect.y + rect.height);
      const xs = [a.x, b.x].sort((p, q) => p - q);
      const ys = [a.y, b.y].sort((p, q) => p - q);
      assert.ok(xs[0] >= insets.left - 1e-6 && xs[1] <= w - insets.right + 1e-6, `fits across at ${w}×${h}`);
      assert.ok(ys[0] >= insets.top - 1e-6 && ys[1] <= h - insets.bottom + 1e-6, `fits down at ${w}×${h}`);
      const full = fitCamera(createCamera(), map, w, h, insets);
      assert.ok(cam.scale > full.scale, "zoomed in compared to the whole map");
      assert.equal(cam.rotated, full.rotated, "turning depends on the map, not the area");
    }
  }],
];
