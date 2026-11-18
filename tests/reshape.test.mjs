/**
 * Bending a link to a new path, and the day-by-day history for the timelapse.
 */
import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { cellOf } from "../src/sim/grid.js";
import { addLink, makeBackbone, reshapeLink, setEventSchedule, step } from "../src/sim/world.js";
import { configWith, customMap, makeWorld } from "./helpers.mjs";

const TPS = CONFIG.sim.tickRate;

function lab({ links = 200, outages = false } = {}) {
  const config = configWith({
    growth: { firstSiteAt: 1e9 },
    overload: { seconds: 1e9 },
    links: { ...CONFIG.links, startingCount: links },
    inventory: { ...CONFIG.inventory, backbone: 1 },
  });
  const world = makeWorld({
    config,
    map: customMap([
      { type: "datacenter", x: 315, y: 405 },
      { type: "office", x: 855, y: 405 },
    ]),
    seed: "reshape",
    outages,
  });
  setEventSchedule(world, false);
  return world;
}

export const tests = [
  ["dragging a link bends it through the square you let go on", () => {
    const world = lab();
    const [hq, office] = world.sites;
    const link = addLink(world, hq.id, office.id).link;
    const { id, tier, line } = link;
    const before = world.inventory.links + link.cost;
    const spot = { x: 405, y: 585 };
    assert.ok(reshapeLink(world, link.id, spot).ok);
    const via = cellOf(world, spot.x, spot.y);
    assert.ok(link.cells.some((c) => c.cx === via.cx && c.cy === via.cy), "passes through the drop square");
    assert.equal(world.inventory.links + link.cost, before, "squares settled against the old path");
    assert.deepEqual([link.id, link.tier, link.line], [id, tier, line], "same link");
    assert.ok(link.cost > 17, "the detour costs more");
  }],
  ["a bend you can't afford is refused and changes nothing", () => {
    const world = lab({ links: 17 });
    const link = addLink(world, world.sites[0].id, world.sites[1].id).link;
    const cells = JSON.stringify(link.cells);
    assert.equal(reshapeLink(world, link.id, { x: 405, y: 585 }).reason, "no-links");
    assert.equal(JSON.stringify(link.cells), cells);
  }],
  ["backbones can't be bent", () => {
    const world = lab();
    const link = addLink(world, world.sites[0].id, world.sites[1].id).link;
    makeBackbone(world, link.id);
    assert.equal(reshapeLink(world, link.id, { x: 585, y: 225 }).reason, "backbone");
  }],
  ["the network is recorded every day, and once more at the end", () => {
    const world = lab({ outages: true });
    world.config.overload.seconds = 3;
    for (let i = 0; i < CONFIG.time.secondsPerDay * 2.5 * TPS && !world.over; i++) step(world);
    assert.ok(world.history.length >= 2, `${world.history.length} frames`);
    assert.equal(world.history[0].day, 1);
    assert.equal(world.history[0].sites.length, world.sites.length);
  }],
];
