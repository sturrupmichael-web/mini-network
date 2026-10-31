/**
 * Cheats and measurements for the debug panel (tuning only).
 *
 * These are pure functions on the world, like the rest of sim/. They use
 * world.rng, so using them changes the rest of a seeded game: a game you
 * touched with the debug panel won't replay the same from its seed.
 */
import { createPacket, availableTraffic } from "./packets.js";
import { clock, findSiteSpot, findSpot } from "./progression.js";
import { addSite, destKeyForTraffic, siteCapacity } from "./sites.js";
import { isHalted, step } from "./world.js";

/**
 * Add a site of `type` at a valid spot: near the data center like normal
 * growth if there's room, otherwise anywhere on the map. Returns the site
 * or null if there's no room at all.
 */
export function spawnSite(world, type) {
  if (!world.data.sites[type]) return null;
  const pos =
    findSiteSpot(world) ??
    findSpot(world, { center: { x: world.map.width / 2, y: world.map.height / 2 }, radius: Infinity });
  if (!pos) return null;
  const site = addSite(world, type, pos.x, pos.y);
  world.events.push({ type: "site-added", siteId: site.id });
  return site;
}

/** Queue `count` packets at every site that can send traffic right now. Returns how many were made. */
export function spawnBurst(world, count) {
  let made = 0;
  for (const site of world.sites) {
    const weights = availableTraffic(world, site);
    if (Object.keys(weights).length === 0) continue;
    for (let i = 0; i < count; i++) {
      const trafficId = world.rng.weighted(weights);
      createPacket(world, site, trafficId, destKeyForTraffic(world.data.traffic[trafficId]));
      made++;
    }
  }
  return made;
}

/**
 * Run the simulation forward `seconds` of game time, as fast as possible.
 * Stops early at a weekly reward or game over.
 * Returns { seconds actually skipped, stoppedBy: null | "reward" | "over" }.
 */
export function skipTime(world, seconds) {
  const start = world.time;
  const ticks = Math.round(seconds / world.dt);
  for (let i = 0; i < ticks && !isHalted(world); i++) step(world);
  const stoppedBy = world.over ? "over" : world.pendingReward ? "reward" : null;
  return { seconds: world.time - start, stoppedBy };
}

/** Add to the player's inventory, e.g. { links: 5, upgrades: 1 }. */
export function grantItems(world, items) {
  for (const [k, n] of Object.entries(items)) {
    if (k in world.inventory) world.inventory[k] += n;
  }
}

/** A plain object of numbers worth watching while tuning. */
export function debugStats(world) {
  const c = clock(world);
  const { seconds } = world.config.overload;
  let queued = 0;
  let overCapacity = 0;
  let worst = 0;
  const byType = {};
  for (const site of world.sites) {
    queued += site.queue.length;
    if (site.queue.length > siteCapacity(world, site)) overCapacity++;
    worst = Math.max(worst, site.overload / seconds);
    byType[site.type] = (byType[site.type] ?? 0) + 1;
  }
  const s = world.stats;
  const finished = s.delivered + s.dropped;
  return {
    seed: world.seed,
    tick: world.tick,
    time: Math.round(world.time),
    day: c.day,
    week: c.week,
    score: s.score,
    spawned: s.spawned,
    delivered: s.delivered,
    dropped: s.dropped,
    lost: s.lost,
    filtered: s.filtered,
    deliveryRate: finished ? Math.round((s.delivered / finished) * 100) : 100,
    inFlight: world.packets.length - queued,
    queued,
    sites: world.sites.length,
    sitesByType: byType,
    links: world.links.length,
    overCapacity,
    worstOverload: Math.round(worst * 100),
    trafficScale: Math.round(world.trafficScale * 1000) / 1000,
    nextSiteIn: Math.max(0, Math.round(world.growth.nextSiteAt - world.time)),
    activeEvents: world.activeEvents.map((a) => a.id),
    inventory: { ...world.inventory },
  };
}
