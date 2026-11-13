/**
 * Progression: the day/week clock, new sites appearing, traffic growth,
 * and the weekly reward. Part of the simulation (no DOM).
 */
import { scheduleDay } from "./events.js";
import { recordFrame } from "./history.js";
import { distanceToPolyline } from "./geometry.js";
import { cellOf, inView, isTerrain, snapToGrid } from "./grid.js";

/** Is (x, y) on terrain or right next to it (a site needs room for its links)? */
function nearTerrain(world, x, y) {
  const c = cellOf(world, x, y);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) if (isTerrain(world, { cx: c.cx + dx, cy: c.cy + dy })) return true;
  }
  return false;
}
import { addSite, hubSite } from "./sites.js";

/** Day number (0-based), week (1-based), day of week (0 = Mon) and fraction through the day. */
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
    scheduleDay(world, day);
    recordFrame(world);
  }

  const weekEnd = world.week * daysPerWeek * secondsPerDay;
  if (world.time >= weekEnd) {
    world.week++;
    const s = world.config.spawn;
    world.trafficScale = Math.max(s.minIntervalScale, world.trafficScale * s.weeklyIntervalMultiplier);
    world.pendingReward = offerRewards(world);
    grant(world, world.pendingReward.delivered);
    world.events.push({ type: "week", week: world.week });
  }

  if (world.time >= world.growth.nextSiteAt) {
    const g = world.config.growth;
    const types = Object.fromEntries(Object.entries(g.types).filter(([t]) => world.data.sites[t].unlockDay <= day));
    if (Object.keys(types).length > 0) {
      const type = world.rng.weighted(types);
      const pos = findSiteSpot(world, type);
      if (pos) {
        const site = addSite(world, type, pos.x, pos.y);
        world.events.push({ type: "site-added", siteId: site.id });
      }
    }
    world.growth.interval = Math.max(g.minInterval, world.growth.interval * g.intervalDecay);
    world.growth.nextSiteAt = world.time + world.growth.interval;
  }
}

/**
 * A random valid spot for a new site within `radius` of `center`, or null.
 * Valid: inside the edge margin and the open part of the map (unless
 * `anywhere`), at least minSpacing from every site, and clear of carrier
 * boundaries, terrain and every link.
 */
export function findSpot(world, { center, radius, anywhere = false }) {
  const { map, config } = world;
  const { edgeMargin, minSpacing, boundaryClearance, linkClearance = 0 } = config.sites;
  const boundaries = (map.boundaries ?? []).map((b) => b.map(([x, y]) => ({ x, y })));
  for (let i = 0; i < config.growth.attempts; i++) {
    const v = (!anywhere && world.view) || { x: 0, y: 0, width: map.width, height: map.height };
    const { x, y } = snapToGrid(
      world,
      world.rng.range(Math.max(edgeMargin, v.x), Math.min(map.width - edgeMargin, v.x + v.width)),
      world.rng.range(Math.max(edgeMargin, v.y), Math.min(map.height - edgeMargin, v.y + v.height)),
    );
    if (x < edgeMargin || y < edgeMargin || x > map.width - edgeMargin || y > map.height - edgeMargin) continue;
    if ((!anywhere && !inView(world, x, y)) || nearTerrain(world, x, y)) continue;
    if (Math.hypot(x - center.x, y - center.y) > radius) continue;
    if (world.sites.some((s) => Math.hypot(s.x - x, s.y - y) < minSpacing)) continue;
    const p = { x, y };
    if (boundaries.some((b) => distanceToPolyline(p, b) < boundaryClearance)) continue;
    if (world.links.some((l) => distanceToPolyline(p, l.path) < linkClearance)) continue;
    return { x, y };
  }
  return null;
}

/**
 * A spot for the next regular new site: near the data center, spreading
 * out each day. Sites with a district (sites.js) usually appear near one
 * of their district hubs instead, once there is one.
 */
export function findSiteSpot(world, type = null) {
  const g = world.config.growth;
  const district = type && world.data.sites[type]?.district;
  const hubs = district ? world.sites.filter((s) => s.type === district) : [];
  const d = world.config.districts;
  if (hubs.length > 0 && d && world.rng.next() < d.chance) {
    const hub = hubs[world.rng.int(0, hubs.length - 1)];
    const near = findSpot(world, { center: hub, radius: d.radius });
    if (near) return near;
  }
  const hub = hubSite(world) ?? { x: world.map.width / 2, y: world.map.height / 2 };
  return findSpot(world, { center: hub, radius: g.startRadius + g.radiusGrowthPerDay * clock(world).day });
}

/**
 * The end-of-week offer: the weekly delivery (granted straight away by
 * updateProgression) plus two different rewards to pick from.
 */
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
  return { week: finishedWeek, options, delivered: { ...(world.config.rewards?.weekly ?? {}) } };
}

/** Add a reward's grant (or the weekly delivery) to the inventory. */
function grant(world, items) {
  for (const [key, amount] of Object.entries(items)) {
    if (key === "capacity") world.bonus.capacity += amount;
    else world.inventory[key] = (world.inventory[key] ?? 0) + amount;
  }
}

/** Player action: take one of the offered rewards. */
export function chooseReward(world, rewardId) {
  if (!world.pendingReward || !world.pendingReward.options.includes(rewardId)) {
    return { ok: false, reason: "not-offered" };
  }
  const reward = world.data.rewards.find((r) => r.id === rewardId);
  grant(world, reward.grant);
  world.pendingReward = null;
  world.events.push({ type: "reward", rewardId });
  return { ok: true };
}
