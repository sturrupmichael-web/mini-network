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
export function randomInterval(world, def, site = null) {
  const [min, max] = def.packetInterval;
  const activity = isNight(world) ? def.activity.night : def.activity.day;
  const scale = world.config.spawn.packetIntervalScale * world.trafficScale * warmupFactor(world);
  const grown = site?.grown ? world.config.siteGrowth.intervalScale : 1;
  return (world.rng.range(min, max) * scale * grown) / Math.max(activity, 0.01);
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
    /** Switches only: upgraded to a core router (see switchRate). */
    core: false,
    /** Switches only: has a QoS policy (priority traffic goes first). */
    qos: false,
    /** Switches only: game time the switch is free to forward the next packet. */
    busyUntil: 0,
    /** Switches only, for drawing: 0–1, how jammed it has been lately. */
    jam: 0,
    /** Hungry district hubs only: hunger pips (0 to config.hunger.maxPips). */
    hunger: 0,
    /** Packets this site sent that were delivered (for growing). */
    served: 0,
    /** Has grown into a bigger, busier site (config.siteGrowth). */
    grown: false,
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

/**
 * Size-1 packets per second a switch can forward, across all its links.
 * Plain switches slow down as more links meet at them; core routers don't.
 */
export function switchRate(world, site) {
  const c = world.config.switches;
  if (site.core) return c.coreForwardRate;
  return c.forwardRate / (1 + c.crowdPenalty * Math.max(0, site.links.length - 2));
}

/**
 * Seconds a switch is busy forwarding this packet. With a QoS policy,
 * priority traffic is quicker and everything else slower.
 */
export function switchTime(world, site, packet) {
  let t = packet.size / switchRate(world, site);
  if (site.qos) t *= world.data.traffic[packet.traffic].priority ? world.config.qos.priorityCost : world.config.qos.otherCost;
  return t;
}

/** Packets a site can queue before it starts to overload. */
export function siteCapacity(world, site) {
  const grown = site.grown ? world.config.siteGrowth.capacity : 0;
  return world.data.sites[site.type].capacity + world.bonus.capacity + grown;
}

/** Is this hungry hub out of patience (all its pips full)? */
export function isStarving(world, site) {
  return site.hunger >= world.config.hunger.maxPips;
}

/**
 * Every tick: hungry district hubs get hungrier while nothing that could
 * feed them is being delivered.
 */
export function updateHunger(world) {
  const h = world.config.hunger;
  for (const site of world.sites) {
    if (!world.data.sites[site.type].hungry) continue;
    if (world.time - site.born < h.startDelay) continue;
    // Only once its district has formed: a site that sends it traffic has
    // settled in nearby (so there's something sensible to connect).
    const reach = world.config.districts.radius * 1.2;
    const settle = world.config.spawn.newSiteGrace ?? 0;
    const fed = world.sites.some(
      (s) =>
        world.data.sites[s.type].district === site.type &&
        world.time - s.born >= settle &&
        Math.hypot(s.x - site.x, s.y - site.y) <= reach,
    );
    if (!fed) continue;
    site.hunger = Math.min(h.maxPips, site.hunger + world.dt / h.secondsPerPip);
  }
}

/** A packet from `origin` was delivered at `dest`: feed the hub, grow the sender. */
export function recordDelivery(world, origin, dest) {
  if (world.data.sites[dest.type].hungry) dest.hunger = Math.max(0, dest.hunger - 1);
  if (!origin || origin.grown || !world.data.sites[origin.type].grows) return;
  origin.served++;
  if (origin.served >= world.config.siteGrowth.deliveries) {
    origin.grown = true;
    world.events.push({ type: "site-grew", siteId: origin.id });
  }
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
