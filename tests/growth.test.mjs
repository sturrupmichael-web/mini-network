/**
 * Hungry district hubs and sites that grow.
 */
import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { createPacket } from "../src/sim/packets.js";
import { randomInterval, recordDelivery, siteCapacity } from "../src/sim/sites.js";
import { addLink, setEventSchedule, step } from "../src/sim/world.js";
import { configWith, customMap, makeWorld } from "./helpers.mjs";

const TPS = CONFIG.sim.tickRate;
const H = CONFIG.hunger;

function lab(start, { outages = false, overload = 1e9 } = {}) {
  const config = configWith({
    growth: { firstSiteAt: 1e9 },
    overload: { seconds: overload },
    spawn: { graceSeconds: 1e9, newSiteGrace: 0 },
    links: { ...CONFIG.links, startingCount: 300 },
  });
  const world = makeWorld({ config, map: customMap(start), seed: "growth", outages });
  setEventSchedule(world, false);
  return world;
}

const run = (world, seconds) => {
  for (let i = 0; i < Math.round(seconds * TPS) && !world.over; i++) step(world);
};

const DISTRICT = [
  { type: "datacenter", x: 200, y: 400 },
  { type: "logistics", x: 900, y: 400 },
  { type: "warehouse", x: 1050, y: 400 },
];

export const tests = [
  ["a district hub gets hungry once its district has formed", () => {
    const world = lab(DISTRICT);
    const hub = world.sites[1];
    run(world, H.startDelay - 1);
    assert.equal(hub.hunger, 0, "a grace period first");
    run(world, H.secondsPerPip * 2 + 1);
    assert.ok(hub.hunger >= 2, `pips build up (${hub.hunger.toFixed(2)})`);
  }],
  ["a hub with no district nearby stays patient", () => {
    const world = lab([
      { type: "datacenter", x: 200, y: 400 },
      { type: "logistics", x: 1050, y: 700 },
      { type: "warehouse", x: 300, y: 150 },
    ]);
    run(world, H.startDelay + H.secondsPerPip * 3);
    assert.equal(world.sites[1].hunger, 0);
  }],
  ["each delivery takes a pip away", () => {
    const world = lab(DISTRICT);
    const [, hub, warehouse] = world.sites;
    hub.hunger = 3;
    recordDelivery(world, warehouse, hub);
    assert.equal(hub.hunger, 2);
  }],
  ["a starving hub's ring fills and ends the game", () => {
    const world = lab(DISTRICT, { outages: true, overload: 5 });
    run(world, H.startDelay + H.secondsPerPip * H.maxPips + 10);
    assert.ok(world.over, "outage");
    assert.equal(world.over.siteId, world.sites[1].id);
  }],
  ["feeding the hub keeps it happy", () => {
    const world = lab(DISTRICT, { outages: true, overload: 5 });
    const [, hub, warehouse] = world.sites;
    assert.ok(addLink(world, warehouse.id, hub.id).ok);
    for (let s = 0; s < H.startDelay + H.secondsPerPip * H.maxPips + 20; s += 4) {
      createPacket(world, warehouse, "erp", "datacenter|logistics");
      run(world, 4);
    }
    assert.equal(world.over, null);
    assert.ok(hub.hunger < 1);
  }],
  ["a well-served site grows: bigger, busier, roomier", () => {
    const world = lab([
      { type: "datacenter", x: 200, y: 400 },
      { type: "office", x: 500, y: 400 },
    ]);
    const [hq, office] = world.sites;
    const capacity = siteCapacity(world, office);
    const events = [];
    for (let i = 0; i < CONFIG.siteGrowth.deliveries; i++) {
      assert.equal(office.grown, false);
      recordDelivery(world, office, hq);
      events.push(...world.events.filter((e) => e.type === "site-grew"));
      world.events.length = 0;
    }
    assert.ok(office.grown);
    assert.equal(events.length, 1);
    assert.equal(siteCapacity(world, office), capacity + CONFIG.siteGrowth.capacity);
    const def = world.data.sites.office;
    world.rng.state = 7;
    const before = randomInterval(world, def, { grown: false });
    world.rng.state = 7;
    const after = randomInterval(world, def, office);
    assert.ok(Math.abs(after - before * CONFIG.siteGrowth.intervalScale) < 1e-9);
  }],
  ["only sites that send traffic grow", () => {
    const world = lab(DISTRICT);
    const [hq, hub] = world.sites;
    for (let i = 0; i < CONFIG.siteGrowth.deliveries * 2; i++) recordDelivery(world, hq, hub);
    assert.equal(hq.grown, false);
  }],
];
