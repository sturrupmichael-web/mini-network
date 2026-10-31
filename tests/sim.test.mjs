import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { octilinearPath, pathLength, pointAlong } from "../src/sim/geometry.js";
import { nextHop, computeRoutes } from "../src/sim/routing.js";
import { addLink, findLink, snapshot, step } from "../src/sim/world.js";
import { configWith, customMap, makeWorld } from "./helpers.mjs";
import { plannedLink } from "../src/sim/links.js";

const run = (world, ticks) => {
  for (let i = 0; i < ticks; i++) step(world);
};
const seconds = (s) => Math.round(s * CONFIG.sim.tickRate);
const hub = (world) => world.sites.find((s) => s.type === "datacenter");
const offices = (world) => world.sites.filter((s) => s.type === "office");

/** Play a scripted game: link every office to the hub at set ticks. */
function scriptedGame(seed) {
  const world = makeWorld({ seed });
  const plan = offices(world).map((o, i) => ({ tick: 60 + i * 200, a: o.id, b: hub(world).id }));
  for (let t = 0; t < seconds(90); t++) {
    for (const p of plan) if (p.tick === world.tick) addLink(world, p.a, p.b, 0);
    step(world);
  }
  return world;
}

export const tests = [
  ["the starting map has a hub and offices", () => {
    const world = makeWorld();
    assert.ok(hub(world));
    assert.ok(offices(world).length >= 2 && offices(world).length <= 3);
  }],
  ["simulation is deterministic for a given seed", () => {
    const a = scriptedGame("same-seed");
    const b = scriptedGame("same-seed");
    assert.ok(a.stats.delivered > 0);
    assert.equal(snapshot(a), snapshot(b));
  }],
  ["different seeds play out differently", () => {
    assert.notEqual(snapshot(scriptedGame("seed-one")), snapshot(scriptedGame("seed-two")));
  }],
  ["offices create packets that wait in their queue with no links", () => {
    const world = makeWorld();
    run(world, seconds(30));
    assert.ok(world.stats.spawned > 0);
    assert.equal(world.stats.delivered, 0);
    const queued = offices(world).reduce((n, s) => n + s.queue.length, 0);
    assert.equal(queued, world.stats.spawned);
    assert.equal(hub(world).queue.length, 0, "the hub never creates traffic");
  }],
  ["linked offices deliver packets to the data center", () => {
    const world = makeWorld();
    const linked = offices(world);
    for (const o of linked) assert.ok(addLink(world, o.id, hub(world).id).ok);
    run(world, seconds(60));
    assert.ok(world.stats.delivered > 5, `delivered ${world.stats.delivered}`);
    assert.equal(world.stats.score, world.stats.delivered);
    const waiting = linked.reduce((n, s) => n + s.queue.length, 0);
    assert.ok(waiting <= 3, `${waiting} packets still waiting`);
  }],
  ["packets route through intermediate sites", () => {
    const world = makeWorld({
      map: customMap([
        { type: "datacenter", x: 100, y: 400 },
        { type: "office", x: 400, y: 400 },
        { type: "office", x: 700, y: 400 },
      ]),
    });
    const [h, mid, far] = world.sites;
    addLink(world, far.id, mid.id);
    addLink(world, mid.id, h.id);
    run(world, seconds(40));
    assert.ok(world.stats.delivered > 0);
    // Some packet from the far office must have taken two hops.
    computeRoutes(world);
    assert.equal(nextHop(world, far, "datacenter").id, findLink(world, far.id, mid.id).id);
    assert.equal(nextHop(world, mid, "datacenter").id, findLink(world, mid.id, h.id).id);
  }],
  ["routing prefers the shorter path, and avoids congestion", () => {
    const world = makeWorld({
      map: customMap([
        { type: "datacenter", x: 600, y: 400 },
        { type: "office", x: 200, y: 400 },
        { type: "office", x: 400, y: 200 },
      ]),
    });
    const [h, src, side] = world.sites;
    const direct = addLink(world, src.id, h.id).link;
    addLink(world, src.id, side.id);
    addLink(world, side.id, h.id);
    computeRoutes(world);
    assert.equal(nextHop(world, src, "datacenter").id, direct.id, "direct link is shorter");
    // Jam the direct link: traffic should go the long way round.
    direct.inTransit = 40;
    computeRoutes(world);
    assert.notEqual(nextHop(world, src, "datacenter").id, direct.id, "congested link is avoided");
  }],
  ["packets with no route stay queued", () => {
    const world = makeWorld({
      map: customMap([
        { type: "datacenter", x: 100, y: 100 },
        { type: "office", x: 500, y: 500 },
        { type: "office", x: 800, y: 500 },
      ]),
    });
    const [, a, b] = world.sites;
    addLink(world, a.id, b.id); // offices linked to each other, not the hub
    run(world, seconds(30));
    assert.equal(world.stats.delivered, 0);
    assert.ok(a.queue.length + b.queue.length === world.stats.spawned);
  }],
  ["link bandwidth limits how fast a queue drains", () => {
    const slow = configWith({ links: { bandwidth: 0.2 } });
    const world = makeWorld({ config: slow });
    for (const o of offices(world)) addLink(world, o.id, hub(world).id);
    run(world, seconds(60));
    const waiting = offices(world).reduce((n, s) => n + s.queue.length, 0);
    assert.ok(waiting > 5, `expected a backlog, got ${waiting}`);
  }],
  ["links use up inventory and refuse bad requests", () => {
    const world = makeWorld();
    const [h, a, b, c] = world.sites;
    world.inventory.links = plannedLink(world, a, h).cost + plannedLink(world, b, h).cost;
    assert.equal(addLink(world, a.id, a.id).reason, "same-site");
    assert.equal(addLink(world, a.id, 9999).reason, "unknown-site");
    assert.ok(addLink(world, a.id, h.id).ok);
    assert.equal(addLink(world, h.id, a.id).reason, "exists");
    assert.ok(addLink(world, b.id, h.id).ok);
    assert.equal(world.inventory.links, 0);
    assert.equal(addLink(world, c.id, h.id).reason, "no-links");
  }],
  ["link paths only use 0°, 45° and 90° segments", () => {
    const cases = [
      [{ x: 0, y: 0 }, { x: 300, y: 100 }],
      [{ x: 0, y: 0 }, { x: -50, y: 400 }],
      [{ x: 10, y: 10 }, { x: 110, y: 110 }],
      [{ x: 0, y: 0 }, { x: 0, y: -200 }],
    ];
    for (const [a, b] of cases) {
      const pts = octilinearPath(a, b);
      assert.deepEqual(pts[0], a);
      assert.deepEqual(pts.at(-1), b);
      for (let i = 1; i < pts.length; i++) {
        const angle = (Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x) * 180) / Math.PI;
        const snapped = Math.round(angle / 45) * 45;
        assert.ok(Math.abs(angle - snapped) < 1e-6, `angle ${angle}`);
      }
    }
  }],
  ["pointAlong walks the path", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    assert.equal(pathLength(pts), 200);
    assert.deepEqual(pointAlong(pts, 50), { x: 50, y: 0 });
    assert.deepEqual(pointAlong(pts, 150), { x: 100, y: 50 });
    assert.deepEqual(pointAlong(pts, 999), { x: 100, y: 100 });
  }],
];
