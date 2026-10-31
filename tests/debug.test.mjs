import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { debugStats, grantItems, skipTime, spawnBurst, spawnSite } from "../src/sim/debug.js";
import { addLink, chooseReward, snapshot, step } from "../src/sim/world.js";
import { formatStats, KNOBS } from "../src/ui/debug.js";
import { makeWorld } from "./helpers.mjs";

export const tests = [
  ["spawnSite adds a site of the asked type at a valid spot", () => {
    const world = makeWorld();
    const before = world.sites.length;
    const site = spawnSite(world, "warehouse");
    assert.equal(site.type, "warehouse");
    assert.equal(world.sites.length, before + 1);
    for (const s of world.sites) {
      if (s !== site) assert.ok(Math.hypot(s.x - site.x, s.y - site.y) >= CONFIG.sites.minSpacing);
    }
    assert.equal(spawnSite(world, "nope"), null);
  }],
  ["spawnBurst queues packets only where traffic has a destination", () => {
    const world = makeWorld();
    for (let i = 0; i < 60; i++) step(world);
    const senders = world.sites.filter((s) => s.type !== "datacenter").length;
    const made = spawnBurst(world, 3);
    assert.equal(made, senders * 3);
    assert.equal(world.packets.length >= made, true);
  }],
  ["skipTime runs the sim forward and stops at the weekly reward", () => {
    const world = makeWorld({ outages: false });
    const r = skipTime(world, world.config.time.secondsPerDay);
    assert.equal(r.stoppedBy, null);
    assert.ok(Math.abs(r.seconds - world.config.time.secondsPerDay) < 0.1);
    assert.equal(world.day, 1);
    const w = skipTime(world, 1e4);
    assert.equal(w.stoppedBy, "reward");
    assert.equal(world.week, 2);
    chooseReward(world, world.pendingReward.options[0]);
    assert.equal(skipTime(world, 1).stoppedBy, null);
  }],
  ["skipTime is the same as stepping: same snapshot", () => {
    const a = makeWorld({ seed: "skip" });
    const b = makeWorld({ seed: "skip" });
    skipTime(a, 12);
    for (let i = 0; i < 12 * CONFIG.sim.tickRate; i++) step(b);
    assert.equal(snapshot(a), snapshot(b));
  }],
  ["grantItems adds to known inventory only", () => {
    const world = makeWorld();
    const links = world.inventory.links;
    grantItems(world, { links: 5, bogus: 3 });
    assert.equal(world.inventory.links, links + 5);
    assert.equal("bogus" in world.inventory, false);
  }],
  ["debugStats reports the numbers the panel shows", () => {
    const world = makeWorld({ seed: "stats" });
    const hub = world.sites.find((s) => s.type === "datacenter");
    const other = world.sites.find((s) => s !== hub);
    addLink(world, other.id, hub.id);
    skipTime(world, 20);
    const s = debugStats(world);
    assert.equal(s.seed, "stats");
    assert.equal(s.links, 1);
    assert.equal(s.sites, world.sites.length);
    assert.equal(s.inFlight + s.queued, world.packets.length);
    assert.ok(s.delivered > 0, "something got delivered");
    assert.ok(s.deliveryRate >= 0 && s.deliveryRate <= 100);
    const text = formatStats(s);
    assert.match(text, /seed stats/);
    assert.match(text, /delivered \d+/);
    assert.equal(text.split("\n").length, 9);
  }],
  ["every debug knob points at a real config number", () => {
    for (const [section, key] of KNOBS) assert.equal(typeof CONFIG[section]?.[key], "number", `${section}.${key}`);
  }],
];
