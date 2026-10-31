/**
 * Links: connecting sites, removing and rerouting links, bandwidth tiers,
 * firewalls, leased lines across carrier boundaries, and cuts.
 */
import { octilinearPath, pathLength, segmentsIntersect } from "./geometry.js";

/** Find the link joining two sites, if any. */
export function findLink(world, aId, bId) {
  for (const link of world.links) {
    if ((link.a === aId && link.b === bId) || (link.a === bId && link.b === aId)) return link;
  }
  return null;
}

/** How many carrier boundaries a path crosses. */
export function boundaryCrossings(world, path) {
  let crossings = 0;
  for (const line of world.map.boundaries ?? []) {
    let crossed = false;
    for (let i = 1; i < line.length && !crossed; i++) {
      const p = { x: line[i - 1][0], y: line[i - 1][1] };
      const q = { x: line[i][0], y: line[i][1] };
      for (let j = 1; j < path.length && !crossed; j++) {
        if (segmentsIntersect(path[j - 1], path[j], p, q)) crossed = true;
      }
    }
    if (crossed) crossings++;
  }
  return crossings;
}

/** Leased lines a new link between these two sites would need. */
export function leasedNeeded(world, a, b) {
  return boundaryCrossings(world, octilinearPath(a, b));
}

export function linkBandwidth(world, link) {
  return world.config.links.bandwidth * world.data.tiers[link.tier].bandwidth;
}

/** True when a link touches an internet edge but has no firewall (after the rules arrive). */
export function isBlocked(world, link) {
  if (!world.security || link.firewall) return false;
  return world.siteById.get(link.a)?.type === "edge" || world.siteById.get(link.b)?.type === "edge";
}

/**
 * Player action: connect two sites. Returns { ok: true, link } or
 * { ok: false, reason } where reason is "same-site" | "unknown-site" |
 * "exists" | "no-links" | "no-leased" | "over".
 * @param {number} line  Which drawn "line" (colour) the link belongs to.
 */
export function addLink(world, aId, bId, line = 0) {
  if (world.over) return { ok: false, reason: "over" };
  if (aId === bId) return { ok: false, reason: "same-site" };
  const a = world.siteById.get(aId);
  const b = world.siteById.get(bId);
  if (!a || !b) return { ok: false, reason: "unknown-site" };
  if (findLink(world, aId, bId)) return { ok: false, reason: "exists" };
  if (world.inventory.links <= 0) return { ok: false, reason: "no-links" };
  const path = octilinearPath(a, b);
  const leased = boundaryCrossings(world, path);
  if (leased > world.inventory.leased) return { ok: false, reason: "no-leased" };

  const link = {
    id: world.nextId++,
    a: aId,
    b: bId,
    line,
    path,
    length: pathLength(path),
    /** Index into LINK_TIERS. */
    tier: 0,
    firewall: false,
    /** Leased lines used to cross carrier boundaries (refunded on removal). */
    leased,
    /** Cut by an event: { since, until } or null. */
    down: null,
    /** Game time each direction is free to send again: [a→b, b→a]. */
    busyUntil: [0, 0],
    inTransit: 0,
  };
  world.links.push(link);
  world.linkById.set(link.id, link);
  a.links.push(link.id);
  b.links.push(link.id);
  world.inventory.links--;
  world.inventory.leased -= leased;
  world.routing.dirty = true;
  world.events.push({ type: "link-added", linkId: link.id });
  return { ok: true, link };
}

/**
 * Player action: remove a link. The link, its upgrades, its firewall and
 * any leased lines go back to the inventory. Packets travelling on it go
 * back to the front of the queue at the site they left.
 */
export function removeLink(world, linkId) {
  if (world.over) return { ok: false, reason: "over" };
  const link = world.linkById.get(linkId);
  if (!link) return { ok: false, reason: "unknown-link" };
  const returning = new Map();
  for (const p of world.packets) {
    if (p.linkId !== linkId) continue;
    p.linkId = null;
    p.progress = 0;
    p.at = p.from;
    if (!returning.has(p.from)) returning.set(p.from, []);
    returning.get(p.from).push(p.id);
  }
  for (const [siteId, ids] of returning) {
    const site = world.siteById.get(siteId);
    site.queue = [...ids, ...site.queue];
  }
  for (const id of [link.a, link.b]) {
    const site = world.siteById.get(id);
    site.links = site.links.filter((l) => l !== linkId);
  }
  world.links = world.links.filter((l) => l !== link);
  world.linkById.delete(linkId);
  world.inventory.links++;
  world.inventory.upgrades += link.tier;
  world.inventory.firewalls += link.firewall ? 1 : 0;
  world.inventory.leased += link.leased;
  world.routing.dirty = true;
  world.events.push({ type: "link-removed", linkId });
  return { ok: true, link };
}

/**
 * Player action: reroute link A–B through site C, making A–C and C–B.
 * Links that already exist are reused. The old link's equipment is
 * refunded first, so this needs at most one more link.
 */
export function rerouteLink(world, linkId, viaId) {
  if (world.over) return { ok: false, reason: "over" };
  const link = world.linkById.get(linkId);
  if (!link) return { ok: false, reason: "unknown-link" };
  const via = world.siteById.get(viaId);
  if (!via) return { ok: false, reason: "unknown-site" };
  if (viaId === link.a || viaId === link.b) return { ok: false, reason: "same-site" };
  const { a, b, line } = link;
  const legs = [
    [a, viaId],
    [viaId, b],
  ].filter(([x, y]) => !findLink(world, x, y));
  const needLinks = legs.length;
  const needLeased = legs.reduce((n, [x, y]) => n + leasedNeeded(world, world.siteById.get(x), world.siteById.get(y)), 0);
  if (needLinks > world.inventory.links + 1) return { ok: false, reason: "no-links" };
  if (needLeased > world.inventory.leased + link.leased) return { ok: false, reason: "no-leased" };
  removeLink(world, linkId);
  for (const [x, y] of legs) addLink(world, x, y, line);
  return { ok: true };
}

/** Player action: move a link up one bandwidth tier. */
export function upgradeLink(world, linkId) {
  if (world.over) return { ok: false, reason: "over" };
  const link = world.linkById.get(linkId);
  if (!link) return { ok: false, reason: "unknown-link" };
  if (link.tier >= world.data.tiers.length - 1) return { ok: false, reason: "max-tier" };
  if (world.inventory.upgrades <= 0) return { ok: false, reason: "no-upgrades" };
  link.tier++;
  world.inventory.upgrades--;
  world.routing.dirty = true;
  world.events.push({ type: "link-upgraded", linkId, tier: link.tier });
  return { ok: true };
}

/** Player action: put a firewall on a link. */
export function addFirewall(world, linkId) {
  if (world.over) return { ok: false, reason: "over" };
  const link = world.linkById.get(linkId);
  if (!link) return { ok: false, reason: "unknown-link" };
  if (link.firewall) return { ok: false, reason: "has-firewall" };
  if (world.inventory.firewalls <= 0) return { ok: false, reason: "no-firewalls" };
  link.firewall = true;
  world.inventory.firewalls--;
  world.routing.dirty = true;
  world.events.push({ type: "firewall-added", linkId });
  return { ok: true };
}
