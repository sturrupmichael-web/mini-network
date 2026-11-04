/**
 * Jammed switches, core routers and the weekly delivery.
 */
import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { createPacket } from "../src/sim/packets.js";
import { switchRate } from "../src/sim/sites.js";
import { addCoreRouter, addLink, chooseReward, placeSwitch, removeSwitch, setEventSchedule, snapshot, step } from "../src/sim/world.js";
import { configWith, customMap, makeWorld } from "./helpers.mjs";

const TPS = CONFIG.sim.tickRate;

/** No new sites, no outages, no events, no packets of its own: a quiet lab. */
function lab({ routers = 0, links = {} } = {}) {
  const config = configWith({
    growth: { firstSiteAt: 1e9 },
    overload: { seconds: 1e9 },
    spawn: { graceSeconds: 1e9, newSiteGrace: 1e9 },
    inventory: { ...CONFIG.inventory, switches: 2, routers },
    links: { ...CONFIG.links, startingCount: 200, ...links },
  });
  const world = makeWorld({
    config,
    map: customMap([
      { type: "datacenter", x: 600, y: 400 },
      { type: "office", x: 300, y: 250 },
      { type: "office", x: 300, y: 550 },
      { type: "office", x: 900, y: 250 },
    ]),
    seed: "jams",
  });
  setEventSchedule(world, false);
  return world;
}

/** A switch at (450, 400) joined to the data center. */
function hubSwitch(world) {
  const sw = placeSwitch(world, 450, 400).site;
  assert.ok(addLink(world, sw.id, world.sites[0].id).ok);
  return sw;
}

/** Queue n email packets at the switch and count how many it sends on over `seconds`. */
function drain(world, sw, n, seconds) {
  for (let i = 0; i < n; i++) createPacket(world, sw, "email", "datacenter");
  for (let i = 0; i < Math.round(seconds * TPS); i++) step(world);
  return n - sw.queue.length;
}

export const tests = [
  ["switches slow down as more links meet at them; core routers don't", () => {
    const world = lab({ routers: 1 });
    const sw = hubSwitch(world);
    const rate2 = () => switchRate(world, sw);
    assert.equal(rate2(), CONFIG.switches.forwardRate, "two links or fewer: full speed");
    const [, a, b, c] = world.sites;
    assert.ok(addLink(world, a.id, sw.id).ok);
    const withTwo = rate2();
    assert.ok(addLink(world, b.id, sw.id).ok);
    assert.ok(addLink(world, c.id, sw.id).ok);
    assert.ok(rate2() < withTwo, `4 links (${rate2()}) slower than 2 (${withTwo})`);
    assert.ok(addCoreRouter(world, sw.id).ok);
    assert.equal(rate2(), CONFIG.switches.coreForwardRate);
  }],
  ["a switch forwards one packet at a time, so a backlog drains at its rate", () => {
    // Links far faster than the switch, so the switch is the bottleneck.
    const world = lab({ links: { bandwidth: 100 } });
    const sw = hubSwitch(world);
    const seconds = 3;
    const sent = drain(world, sw, 60, seconds);
    const expected = CONFIG.switches.forwardRate * seconds;
    assert.ok(Math.abs(sent - expected) <= 1, `sent ${sent}, expected about ${expected}`);
    assert.ok(sw.queue.length > 0, "the rest are still waiting");
    assert.ok(sw.jam > 0.5, `a jammed switch glows (jam ${sw.jam.toFixed(2)})`);
  }],
  ["a core router clears the same backlog much faster", () => {
    const plain = lab({ links: { bandwidth: 100 } });
    const core = lab({ routers: 1, links: { bandwidth: 100 } });
    const sw = hubSwitch(core);
    assert.ok(addCoreRouter(core, sw.id).ok);
    const slow = drain(plain, hubSwitch(plain), 60, 3);
    const fast = drain(core, sw, 60, 3);
    assert.ok(fast >= slow * 2.5, `core ${fast} vs plain ${slow}`);
  }],
  ["the jam glow fades once the queue clears", () => {
    const world = lab({ links: { bandwidth: 100 } });
    const sw = hubSwitch(world);
    drain(world, sw, 12, 1);
    assert.ok(sw.jam > 0);
    for (let i = 0; i < 6 * TPS; i++) step(world);
    assert.equal(sw.queue.length, 0);
    assert.equal(sw.jam, 0);
  }],
  ["core routers only go on switches, once, and come back with the switch", () => {
    const world = lab({ routers: 1 });
    const sw = hubSwitch(world);
    assert.equal(addCoreRouter(world, world.sites[1].id).reason, "not-a-switch");
    assert.equal(addCoreRouter(world, 9999).reason, "unknown-site");
    assert.ok(addCoreRouter(world, sw.id).ok);
    assert.equal(world.inventory.routers, 0);
    assert.equal(addCoreRouter(world, sw.id).reason, "has-router");
    const other = placeSwitch(world, 750, 400).site;
    assert.equal(addCoreRouter(world, other.id).reason, "no-routers");
    assert.ok(removeSwitch(world, sw.id).ok);
    assert.equal(world.inventory.routers, 1, "refunded");
  }],
  ["core routers are part of the replayable state", () => {
    const world = lab({ routers: 1 });
    const sw = hubSwitch(world);
    const before = snapshot(world);
    addCoreRouter(world, sw.id);
    assert.notEqual(snapshot(world), before);
  }],
  ["every week brings a guaranteed delivery before the pick", () => {
    const world = lab();
    const links = world.inventory.links;
    const weekTicks = CONFIG.time.secondsPerDay * CONFIG.time.daysPerWeek * TPS;
    for (let i = 0; i <= weekTicks + 1 && !world.pendingReward; i++) step(world);
    const offer = world.pendingReward;
    assert.ok(offer, "the week ended");
    assert.deepEqual(offer.delivered, CONFIG.rewards.weekly);
    const perDay = CONFIG.links.perDay * CONFIG.time.daysPerWeek;
    assert.equal(world.inventory.links, links + perDay + CONFIG.rewards.weekly.links, "delivered before you choose");
    assert.ok(chooseReward(world, offer.options[0]).ok);
  }],
  ["core routers can be offered from week 2", () => {
    const reward = makeWorld().data.rewards.find((r) => r.grant.routers);
    assert.ok(reward && reward.fromWeek === 2);
  }],
];
