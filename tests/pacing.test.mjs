import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { addSite, warmupFactor } from "../src/sim/sites.js";
import { step } from "../src/sim/world.js";
import { makeWorld } from "./helpers.mjs";

const TPS = CONFIG.sim.tickRate;
const DAY = CONFIG.time.secondsPerDay;
const run = (world, seconds) => {
  for (let i = 0; i < seconds * TPS && !world.over; i++) step(world);
};

export const tests = [
  ["traffic starts calm and eases up to full over the first days", () => {
    const world = makeWorld({ config: CONFIG });
    const { warmupScale, warmupDays } = CONFIG.spawn;
    assert.ok(warmupScale > 1 && warmupDays > 0, "the calm start is on");
    assert.equal(warmupFactor(world), warmupScale);
    world.time = (warmupDays * DAY) / 2;
    const mid = warmupFactor(world);
    assert.ok(mid < warmupScale && mid > 1, `halfway: ${mid}`);
    world.time = warmupDays * DAY;
    assert.equal(warmupFactor(world), 1);
    world.time = warmupDays * DAY * 3;
    assert.equal(warmupFactor(world), 1, "stays at full after");
  }],
  ["the first day sends much less traffic than without the calm start", () => {
    const calm = makeWorld({ config: CONFIG, seed: "pace", outages: false });
    const full = makeWorld({ config: { ...CONFIG, spawn: { ...CONFIG.spawn, warmupDays: 0 } }, seed: "pace", outages: false });
    run(calm, DAY);
    run(full, DAY);
    assert.ok(calm.stats.spawned < full.stats.spawned * 0.7, `calm ${calm.stats.spawned} vs full ${full.stats.spawned}`);
  }],
  ["the first new site arrives later, and waits before sending", () => {
    assert.ok(CONFIG.growth.firstSiteAt >= 40, "a quiet first stretch");
    const world = makeWorld({ config: CONFIG, outages: false });
    run(world, 5);
    const site = addSite(world, "office", 100, 100);
    assert.ok(site.nextSpawn - world.time >= CONFIG.spawn.newSiteGrace, "time to connect it first");
  }],
];
