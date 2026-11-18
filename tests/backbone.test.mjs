/**
 * Backbones: straight, fast links that only connect at their two ends.
 */
import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { createPacket } from "../src/sim/packets.js";
import { linkBandwidth } from "../src/sim/links.js";
import {
  addLink,
  makeBackbone,
  placeSwitchOnLink,
  removeLink,
  rerouteLink,
  setEventSchedule,
  snapshot,
  step,
  upgradeLink,
} from "../src/sim/world.js";
import { configWith, customMap, makeWorld } from "./helpers.mjs";

const TPS = CONFIG.sim.tickRate;

function lab(backbone = 1) {
  const config = configWith({
    growth: { firstSiteAt: 1e9 },
    overload: { seconds: 1e9 },
    spawn: { graceSeconds: 1e9, newSiteGrace: 1e9 },
    inventory: { ...CONFIG.inventory, backbone, switches: 2, upgrades: 2 },
    links: { ...CONFIG.links, startingCount: 200 },
  });
  const world = makeWorld({
    config,
    map: customMap([
      { type: "datacenter", x: 210, y: 210 },
      { type: "office", x: 870, y: 570 },
      { type: "office", x: 870, y: 210 },
    ]),
    seed: "backbone",
  });
  setEventSchedule(world, false);
  return world;
}

/** Seconds for one email from the office to reach HQ. */
function tripTime(world) {
  const office = world.sites[1];
  createPacket(world, office, "email", "datacenter");
  const start = world.time;
  for (let i = 0; i < 30 * TPS; i++) {
    step(world);
    if (world.events.some((e) => e.type === "delivered")) return world.time - start;
    world.events.length = 0;
  }
  return Infinity;
}

export const tests = [
  ["a backbone straightens the link and refunds its squares", () => {
    const world = lab();
    const [hq, office] = world.sites;
    const link = addLink(world, office.id, hq.id).link;
    const links = world.inventory.links;
    const cost = link.cost;
    assert.ok(makeBackbone(world, link.id).ok);
    assert.equal(world.inventory.links, links + cost, "squares back");
    assert.equal(world.inventory.backbone, 0);
    assert.equal(link.path.length, 2, "a straight line");
    assert.ok(Math.abs(link.length - Math.hypot(office.x - hq.x, office.y - hq.y)) < 0.01);
    assert.equal(linkBandwidth(world, link), CONFIG.links.bandwidth * world.data.tiers.at(-1).bandwidth);
  }],
  ["packets cross a backbone much faster", () => {
    const plain = lab();
    addLink(plain, plain.sites[1].id, plain.sites[0].id);
    const fast = lab();
    const link = addLink(fast, fast.sites[1].id, fast.sites[0].id).link;
    makeBackbone(fast, link.id);
    const slow = tripTime(plain);
    const quick = tripTime(fast);
    assert.ok(quick * 2 < slow, `backbone ${quick.toFixed(2)}s vs ${slow.toFixed(2)}s`);
  }],
  ["nothing joins a backbone in the middle, and it can't be upgraded", () => {
    const world = lab();
    const [hq, office, other] = world.sites;
    const link = addLink(world, office.id, hq.id).link;
    makeBackbone(world, link.id);
    const mid = link.path[0];
    assert.equal(placeSwitchOnLink(world, link.id, (mid.x + office.x) / 2, (mid.y + office.y) / 2).reason, "backbone");
    assert.equal(rerouteLink(world, link.id, other.id).reason, "backbone");
    assert.equal(upgradeLink(world, link.id).reason, "backbone-max");
    assert.equal(makeBackbone(world, link.id).reason, "has-backbone");
  }],
  ["you need a backbone to make one, and removing it gives it back", () => {
    const world = lab(0);
    const link = addLink(world, world.sites[1].id, world.sites[0].id).link;
    assert.equal(makeBackbone(world, link.id).reason, "no-backbone");
    world.inventory.backbone = 1;
    assert.ok(makeBackbone(world, link.id).ok);
    const links = world.inventory.links;
    const before = snapshot(world);
    assert.ok(removeLink(world, link.id).ok);
    assert.equal(world.inventory.backbone, 1);
    assert.equal(world.inventory.links, links, "no squares to refund twice");
    assert.notEqual(snapshot(world), before);
  }],
  ["packets already on the link keep going when it becomes a backbone", () => {
    const world = lab();
    const [hq, office] = world.sites;
    const link = addLink(world, office.id, hq.id).link;
    createPacket(world, office, "email", "datacenter");
    for (let i = 0; i < TPS; i++) step(world);
    const p = world.packets[0];
    assert.equal(p.linkId, link.id);
    const frac = p.progress / link.length;
    makeBackbone(world, link.id);
    assert.ok(Math.abs(p.progress / link.length - frac) < 1e-9);
    let delivered = false;
    for (let i = 0; i < 10 * TPS && !delivered; i++) {
      step(world);
      delivered = world.events.some((e) => e.type === "delivered");
      world.events.length = 0;
    }
    assert.ok(delivered);
  }],
];
