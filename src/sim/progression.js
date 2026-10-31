/**
 * Progression: the day/week clock, new sites appearing, traffic growth,
 * and the weekly reward. Part of the simulation (no DOM).
 */
import { distanceToPolyline } from "./geometry.js";
// world.js imports this module too; the cycle is safe because nothing
// here runs at import time.
import { addSite } from "./world.js";

/** Day number (0-based), day of week (0-based) and fraction through the day. */
export function clock(world) {
  const { secondsPerDay, daysPerWeek } = world.config.time;
  const day = Math.floor(world.time / secondsPerDay);
  return {
    day,
    week: Math.floor(day / daysPerWeek) + 1,
    dayOfWeek: day % daysPerWeek,
    dayFraction: (world.time % secondsPerDay) / secondsPerDay,
    daysSurvived: world.time / secondsPerDay,
  };
}

export function initProgression(world) {
  const g = world.config.growth;
  world.growth = { nextSiteAt: g.firstSiteAt, interval: g.interval };
  world.week = 1;
  world.day = 0;
  world.trafficScale = 1;
}

/** Called every tick. May pause the world for a reward. */
export function updateProgression(world) {
  const { secondsPerDay, daysPerWeek } = world.config.time;
  const day = Math.floor(world.time / secondsPerDay);
  if (day > world.day) {
    world.day = day;
    world.inventory.links += world.config.links.perDay;
    world.events.push({ type: "day", day });
  }
  const weekEnd = world.week * daysPerWeek * secondsPerDay;
  if (world.time >= weekEnd) {
    world.week++;
    const s = world.config.spawn;
    world.trafficScale = Math.max(s.minIntervalScale, world.trafficScale * s.weeklyIntervalMultiplier);
    world.pendingReward = offerRewards(world);
    world.events.push({ type: "week", week: world.week });
  }

  if (world.time >= world.growth.nextSiteAt) {
    const g = world.config.growth;
    const type = world.rng.weighted(g.types);
    const pos = findSiteSpot(world);
    if (pos) {
      const site = addSite(world, type, pos.x, pos.y);
      world.events.push({ type: "site-added", siteId: site.id });
    }
    world.growth.interval = Math.max(g.minInterval, world.growth.interval * g.intervalDecay);
    world.growth.nextSiteAt = world.time + world.growth.interval;
  }
}

/** A random valid spot for a new site, or null if none was found. */
export function findSiteSpot(world) {
  const { map, config } = world;
  const { edgeMargin, minSpacing, boundaryClearance } = config.sites;
  const g = config.growth;
  const hub = world.sites.find((s) => world.data.sites[s.type].shape === "hub") ?? { x: map.width / 2, y: map.height / 2 };
  const radius = g.startRadius + g.radiusGrowthPerDay * clock(world).day;
  for (let i = 0; i < g.attempts; i++) {
    const x = world.rng.range(edgeMargin, map.width - edgeMargin);
    const y = world.rng.range(edgeMargin, map.height - edgeMargin);
    if (Math.hypot(x - hub.x, y - hub.y) > radius) continue;
    if (world.sites.some((s) => Math.hypot(s.x - x, s.y - y) < minSpacing)) continue;
    const p = { x, y };
    if ((map.boundaries ?? []).some((b) => distanceToPolyline(p, b.map(([bx, by]) => ({ x: bx, y: by }))) < boundaryClearance)) {
      continue;
    }
    return { x: Math.round(x), y: Math.round(y) };
  }
  return null;
}

/** Pick two different rewards for the week that just ended. */
export function offerRewards(world) {
  const finishedWeek = world.week - 1;
  const pool = world.data.rewards.filter((r) => r.fromWeek <= finishedWeek);
  const options = [];
  while (options.length < 2 && pool.length > 0) {
    const weights = Object.fromEntries(pool.map((r, i) => [i, r.weight]));
    const index = Number(world.rng.weighted(weights));
    options.push(pool[index].id);
    pool.splice(index, 1);
  }
  return { week: finishedWeek, options };
}

/** Player action: take one of the offered rewards. */
export function chooseReward(world, rewardId) {
  if (!world.pendingReward || !world.pendingReward.options.includes(rewardId)) {
    return { ok: false, reason: "not-offered" };
  }
  const reward = world.data.rewards.find((r) => r.id === rewardId);
  const grant = reward.grant;
  if (grant.links) world.inventory.links += grant.links;
  if (grant.capacity) world.bonus.capacity += grant.capacity;
  world.pendingReward = null;
  world.events.push({ type: "reward", rewardId });
  return { ok: true };
}
