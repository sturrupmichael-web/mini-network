/**
 * Sites: adding and removing them, capacity, destinations, and the
 * day/night clock that drives how busy they are.
 */
import { snapToGrid } from "./grid.js";

/** Is it night right now? (config.dayNight) */
export function isNight(world) {
  const { secondsPerDay } = world.config.time;
  const f = (world.time % secondsPerDay) / secondsPerDay;
  const { nightStart, nightEnd } = world.config.dayNight;
  return f >= nightStart || f < nightEnd;
}

export function currentDay(world) {
  return Math.floor(world.time / world.config.time.secondsPerDay);
}

/**
 * How much sparser traffic is right now because of the calm start: from
 * spawn.warmupScale at the beginning, easing to 1 after spawn.warmupDays.
 */
export function warmupFactor(world) {
  const { warmupDays = 0, warmupScale = 1 } = world.config.spawn;
  if (warmupDays <= 0) return 1;
  const t = Math.min(1, world.time / (warmupDays * world.config.time.secondsPerDay));
  const eased = t * t * (3 - 2 * t); // smoothstep
  return warmupScale + (1 - warmupScale) * eased;
}

/** Seconds until a site's next packet, scaled by the calm start, traffic growth and time of day. */
export function randomInterval(world, def) {
  const [min, max] = def.packetInterval;
  const activity = isNight(world) ? def.activity.night : def.activity.day;
  const scale = world.config.spawn.packetIntervalScale * world.trafficScale * warmupFactor(world);
  return (world.rng.range(min, max) * scale) / Math.max(activity, 0.01);
}

export function addSite(world, type, x, y, label = null) {
  const def = world.data.sites[type];
  if (!def) throw new Error(`Unknown site type "${type}"`);
  // Every site sits in the middle of a grid cell (grid.js).
  const at = snapToGrid(world, x, y);
  const site = {
    id: world.nextId++,
    type,
    x: at.x,
    y: at.y,
    label,
    links: [],
    queue: [],
    /** Seconds the queue has been over capacity (drains when it's back under). */
    overload: 0,
    born: world.time,
    sdwan: false,
    nextSpawn: def.packetInterval
      ? world.time + (world.tick > 0 ? (world.config.spawn.newSiteGrace ?? 0) : world.config.spawn.graceSeconds) + randomInterval(world, def)
      : Infinity,
  };
  world.sites.push(site);
  world.siteById.set(site.id, site);
  if (world.tick > 0 && !def.junction) world.stats.sitesAdded++;
  world.routing.dirty = true;
  return site;
}

/** Delete a site that has no links left. */
export function deleteSite(world, siteId) {
  world.sites = world.sites.filter((s) => s.id !== siteId);
  world.siteById.delete(siteId);
  world.routing.dirty = true;
}

/** Packets a site can queue before it starts to overload. */
export function siteCapacity(world, site) {
  return world.data.sites[site.type].capacity + world.bonus.capacity;
}

/**
 * Destination keys say where a packet is going:
 *   "datacenter"         any site of that type
 *   "datacenter|cloud"   any site of either type
 *   "#12"                site 12 exactly
 */
export function destKeyForTraffic(traffic) {
  return Array.isArray(traffic.to) ? traffic.to.join("|") : traffic.to;
}

const keyTypes = new Map();
export function siteMatches(site, key) {
  if (key.startsWith("#")) return site.id === Number(key.slice(1));
  let types = keyTypes.get(key);
  if (!types) {
    types = key.split("|");
    keyTypes.set(key, types);
  }
  return types.includes(site.type);
}

/**
 * Does any site on the map match this destination? With `settled`, only
 * count sites that appeared at least config.spawn.newDestinationDelay ago.
 */
export function destinationExists(world, key, settled = false) {
  const cutoff = settled ? world.time - world.config.spawn.newDestinationDelay : Infinity;
  return world.sites.some((s) => siteMatches(s, key) && (s.born === 0 || s.born <= cutoff));
}

/** The first data center (the "HQ" broadcasts come from). */
export function hubSite(world) {
  return world.sites.find((s) => world.data.sites[s.type].shape === "hub") ?? null;
}
