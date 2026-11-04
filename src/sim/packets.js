/**
 * Packets: creating them at sites, sending them down links, moving them,
 * delivering or dropping them.
 */
import { linkBandwidth } from "./links.js";
import { nextHop } from "./routing.js";
import { currentDay, destinationExists, destKeyForTraffic, isNight, randomInterval, siteMatches, switchRate } from "./sites.js";

/** Create one packet waiting at `site`, heading for destination `to`. */
export function createPacket(world, site, trafficId, to) {
  const traffic = world.data.traffic[trafficId];
  const packet = {
    id: world.nextId++,
    traffic: trafficId,
    to,
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
  return packet;
}

/** The traffic a site may send right now, as { trafficId: weight }. */
export function availableTraffic(world, site) {
  const def = world.data.sites[site.type];
  const day = currentDay(world);
  const night = isNight(world);
  const out = {};
  for (const [id, weight] of Object.entries(def.traffic)) {
    const t = world.data.traffic[id];
    if (t.to === "site" || t.junk) continue;
    if (day < t.unlockDay) continue;
    if (t.hours === "day" && night) continue;
    if (t.hours === "night" && !night) continue;
    if (!destinationExists(world, destKeyForTraffic(t), true)) continue;
    out[id] = weight;
  }
  return out;
}

/** Where a new packet of this type goes (cloud migration moves some of it). */
function destinationFor(world, traffic) {
  if (traffic.cloudShare && world.cloudShare > 0 && destinationExists(world, "cloud", true)) {
    if (world.rng.next() < world.cloudShare) return "cloud";
  }
  return destKeyForTraffic(traffic);
}

export function spawnPackets(world) {
  for (const site of world.sites) {
    if (world.time < site.nextSpawn) continue;
    const def = world.data.sites[site.type];
    site.nextSpawn = world.time + randomInterval(world, def);
    const weights = availableTraffic(world, site);
    if (Object.keys(weights).length === 0) continue;
    let count = 1;
    if (def.burst && world.rng.next() < def.burst.chance) count = world.rng.int(def.burst.min, def.burst.max);
    for (let i = 0; i < count; i++) {
      const trafficId = world.rng.weighted(weights);
      const traffic = world.data.traffic[trafficId];
      createPacket(world, site, trafficId, destinationFor(world, traffic));
    }
  }
}

function removePackets(world, ids) {
  if (ids.size === 0) return;
  world.packets = world.packets.filter((p) => !ids.has(p.id));
}

/** How fast a switch's jam glow builds while packets wait at it, and fades after (per second). */
const JAM_RISE = 1.5;
const JAM_FADE = 0.6;

export function dispatchQueues(world) {
  const packetById = new Map();
  for (const p of world.packets) packetById.set(p.id, p);
  const gone = new Set();

  for (const site of world.sites) {
    const junction = world.data.sites[site.type].junction;
    if (junction) site.jam = Math.max(0, site.jam - world.dt * JAM_FADE);
    if (site.queue.length === 0) continue;
    let held = false;
    const remaining = [];
    for (const packetId of site.queue) {
      const packet = packetById.get(packetId);
      const traffic = world.data.traffic[packet.traffic];
      const link = nextHop(world, site, packet.to, packet.from);
      if (!link) {
        // Attack traffic with nowhere to go just fizzles out.
        if (traffic.junk) gone.add(packetId);
        else remaining.push(packetId);
        continue;
      }
      const dir = link.a === site.id ? 0 : 1;
      if (link.down || world.time < link.busyUntil[dir]) {
        remaining.push(packetId);
        continue;
      }
      if (junction && world.time < site.busyUntil) {
        // The switch is still forwarding the last packet: wait your turn.
        held = true;
        remaining.push(packetId);
        continue;
      }
      if (junction) site.busyUntil = world.time + packet.size / switchRate(world, site);
      link.busyUntil[dir] = world.time + packet.size / linkBandwidth(world, link);
      if (traffic.junk && link.firewall) {
        // The firewall eats it, but checking it still costs bandwidth.
        gone.add(packetId);
        world.stats.filtered++;
        world.events.push({ type: "filtered", packetId, linkId: link.id });
        continue;
      }
      link.inTransit++;
      packet.at = null;
      packet.from = site.id;
      packet.linkId = link.id;
      packet.dir = dir;
      packet.progress = 0;
    }
    site.queue = remaining;
    if (held) site.jam = Math.min(1, site.jam + world.dt * (JAM_FADE + JAM_RISE));
  }
  removePackets(world, gone);
}

export function movePackets(world) {
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
    const site = world.siteById.get(packet.dir === 0 ? link.b : link.a);
    packet.linkId = null;
    packet.progress = 0;
    const traffic = world.data.traffic[packet.traffic];
    if (siteMatches(site, packet.to)) {
      if (traffic.junk) continue; // an attack that got through scores nothing
      world.stats.delivered++;
      world.stats.score += traffic.points;
      world.events.push({ type: "delivered", packetId: packet.id, siteId: site.id, traffic: packet.traffic });
      continue;
    }
    if (traffic.maxHops && packet.hops >= traffic.maxHops) {
      // Too many hops for latency-sensitive traffic: the call drops.
      world.stats.dropped++;
      world.stats.score = Math.max(0, world.stats.score - (traffic.dropPoints ?? 0));
      site.overload += world.config.drops.overloadPenalty;
      world.events.push({ type: "dropped", packetId: packet.id, siteId: site.id, traffic: packet.traffic });
      continue;
    }
    packet.at = site.id;
    site.queue.push(packet.id);
    survivors.push(packet);
  }
  world.packets = survivors;
}
