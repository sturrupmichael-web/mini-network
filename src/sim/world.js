/**
 * The simulation. Pure data and functions: no DOM, no canvas, no timers.
 * The game loop calls step(world) a fixed number of times per game second;
 * the renderer only reads `world`.
 *
 * Everything random goes through world.rng, so the same seed and the same
 * player actions (on the same ticks) always produce the same game.
 */
import { createRng } from "../rng.js";
import { octilinearPath, pathLength } from "./geometry.js";
import { computeRoutes, nextHop } from "./routing.js";

/**
 * Create a new world.
 * @param {object} opts
 * @param {object} opts.config  CONFIG from data/config.js
 * @param {object} opts.data    { sites: SITE_TYPES, traffic: TRAFFIC_TYPES }
 * @param {object} opts.map     One entry of MAPS
 * @param {number|string} opts.seed
 */
export function createWorld({ config, data, map, seed }) {
  const world = {
    config,
    data,
    map,
    seed,
    rng: createRng(seed),
    tick: 0,
    time: 0,
    dt: 1 / config.sim.tickRate,
    nextId: 1,
    sites: [],
    siteById: new Map(),
    links: [],
    linkById: new Map(),
    packets: [],
    inventory: { links: config.links.startingCount },
    stats: { spawned: 0, delivered: 0, score: 0 },
    routing: { tables: new Map(), dirty: true, nextRecompute: 0 },
    /** Things that happened this tick, for audio and UI. Cleared by the consumer. */
    events: [],
  };
  for (const s of map.start) addSite(world, s.type, s.x, s.y, s.label);
  return world;
}

export function addSite(world, type, x, y, label = null) {
  const def = world.data.sites[type];
  if (!def) throw new Error(`Unknown site type "${type}"`);
  const site = {
    id: world.nextId++,
    type,
    x,
    y,
    label,
    links: [],
    queue: [],
    nextSpawn: def.packetInterval
      ? world.time + world.config.spawn.graceSeconds + randomInterval(world, def)
      : Infinity,
  };
  world.sites.push(site);
  world.siteById.set(site.id, site);
  world.routing.dirty = true;
  return site;
}

/** Find the link joining two sites, if any. */
export function findLink(world, aId, bId) {
  for (const link of world.links) {
    if ((link.a === aId && link.b === bId) || (link.a === bId && link.b === aId)) return link;
  }
  return null;
}

/**
 * Player action: connect two sites. Returns { ok: true, link } or
 * { ok: false, reason } where reason is "same-site" | "unknown-site" |
 * "exists" | "no-links".
 * @param {number} line  Which drawn "line" (colour) the link belongs to.
 */
export function addLink(world, aId, bId, line = 0) {
  if (aId === bId) return { ok: false, reason: "same-site" };
  const a = world.siteById.get(aId);
  const b = world.siteById.get(bId);
  if (!a || !b) return { ok: false, reason: "unknown-site" };
  if (findLink(world, aId, bId)) return { ok: false, reason: "exists" };
  if (world.inventory.links <= 0) return { ok: false, reason: "no-links" };

  const path = octilinearPath(a, b);
  const link = {
    id: world.nextId++,
    a: aId,
    b: bId,
    line,
    path,
    length: pathLength(path),
    bandwidth: world.config.links.bandwidth,
    /** Game time each direction is free to send again: [a→b, b→a]. */
    busyUntil: [0, 0],
    inTransit: 0,
  };
  world.links.push(link);
  world.linkById.set(link.id, link);
  a.links.push(link.id);
  b.links.push(link.id);
  world.inventory.links--;
  world.routing.dirty = true;
  world.events.push({ type: "link-added", linkId: link.id });
  return { ok: true, link };
}

/** Advance the simulation by exactly one tick. */
export function step(world) {
  world.tick++;
  world.time = world.tick * world.dt;

  if (world.routing.dirty || world.time >= world.routing.nextRecompute) {
    computeRoutes(world);
  }

  spawnPackets(world);
  dispatchQueues(world);
  movePackets(world);
}

function randomInterval(world, def) {
  const [min, max] = def.packetInterval;
  return world.rng.range(min, max) * world.config.spawn.packetIntervalScale;
}

function spawnPackets(world) {
  for (const site of world.sites) {
    if (world.time < site.nextSpawn) continue;
    const def = world.data.sites[site.type];
    site.nextSpawn = world.time + randomInterval(world, def);
    const trafficId = world.rng.weighted(def.traffic);
    const traffic = world.data.traffic[trafficId];
    if (traffic.to === site.type) continue;
    const packet = {
      id: world.nextId++,
      traffic: trafficId,
      to: traffic.to,
      size: traffic.size,
      origin: site.id,
      /** Site the packet is waiting at, or null while it travels. */
      at: site.id,
      /** Site it last left, to avoid bouncing straight back. */
      from: null,
      linkId: null,
      /** 0 = travelling link.a → link.b, 1 = link.b → link.a. */
      dir: 0,
      /** World units travelled along the current link. */
      progress: 0,
      hops: 0,
      born: world.time,
    };
    world.packets.push(packet);
    site.queue.push(packet.id);
    world.stats.spawned++;
    world.events.push({ type: "spawned", packetId: packet.id, siteId: site.id });
  }
}

function dispatchQueues(world) {
  const packetById = new Map();
  for (const p of world.packets) packetById.set(p.id, p);

  for (const site of world.sites) {
    if (site.queue.length === 0) continue;
    const remaining = [];
    for (const packetId of site.queue) {
      const packet = packetById.get(packetId);
      const link = nextHop(world, site, packet.to, packet.from);
      if (!link) {
        remaining.push(packetId);
        continue;
      }
      const dir = link.a === site.id ? 0 : 1;
      if (world.time < link.busyUntil[dir]) {
        remaining.push(packetId);
        continue;
      }
      link.busyUntil[dir] = world.time + packet.size / link.bandwidth;
      link.inTransit++;
      packet.at = null;
      packet.from = site.id;
      packet.linkId = link.id;
      packet.dir = dir;
      packet.progress = 0;
    }
    site.queue = remaining;
  }
}

function movePackets(world) {
  const speed = world.config.links.packetSpeed * world.dt;
  const survivors = [];
  for (const packet of world.packets) {
    if (packet.linkId === null) {
      survivors.push(packet);
      continue;
    }
    const link = world.linkById.get(packet.linkId);
    packet.progress += speed;
    if (packet.progress < link.length) {
      survivors.push(packet);
      continue;
    }
    // Arrived at the far end.
    link.inTransit--;
    packet.hops++;
    const arrivedId = packet.dir === 0 ? link.b : link.a;
    const site = world.siteById.get(arrivedId);
    packet.linkId = null;
    packet.progress = 0;
    if (site.type === packet.to) {
      const traffic = world.data.traffic[packet.traffic];
      world.stats.delivered++;
      world.stats.score += traffic.points;
      world.events.push({ type: "delivered", packetId: packet.id, siteId: site.id, traffic: packet.traffic });
      continue;
    }
    packet.at = site.id;
    site.queue.push(packet.id);
    survivors.push(packet);
  }
  world.packets = survivors;
}

/**
 * A plain-data snapshot of everything that changes during play. Two worlds
 * with the same seed and inputs produce identical snapshots.
 */
export function snapshot(world) {
  return JSON.stringify({
    tick: world.tick,
    rng: world.rng.state,
    nextId: world.nextId,
    stats: world.stats,
    inventory: world.inventory,
    sites: world.sites.map((s) => [s.id, s.type, s.x, s.y, s.queue, s.nextSpawn, s.links]),
    links: world.links.map((l) => [l.id, l.a, l.b, l.busyUntil, l.inTransit]),
    packets: world.packets.map((p) => [p.id, p.traffic, p.at, p.linkId, p.dir, p.progress, p.hops]),
  });
}
