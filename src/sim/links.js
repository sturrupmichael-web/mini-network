/**
 * Links: connecting sites, removing and rerouting links, bandwidth tiers,
 * firewalls, leased lines across carrier boundaries, and cuts.
 */
import { pathLength, segmentsIntersect } from "./geometry.js";
import { autoCells, cellCost, cellsToPath, pathProblem } from "./grid.js";

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

/** Leased lines a chain of cells would need. */
export function leasedForCells(world, cells) {
  return boundaryCrossings(world, cellsToPath(world, cells));
}

/**
 * What an automatic link between two sites (or spots) would take:
 * { cells, cost, leased }, or null if there's no way through.
 */
export function plannedLink(world, a, b) {
  const cells = autoCells(world, a, b);
  if (!cells) return null;
  return { cells, cost: cellCost(cells), leased: leasedForCells(world, cells) };
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
 * Player action: connect two sites along a chain of grid cells (see
 * grid.js). Each cell between the two sites uses one link from the
 * inventory. Returns { ok: true, link } or { ok: false, reason } where
 * reason is "same-site" | "unknown-site" | "exists" | "no-links" |
 * "no-leased" | "over" | "bad-path" | "off-map" | "through-site" | "no-way".
 * @param {number} line  Which drawn "line" (colour) the link belongs to.
 * @param {{cx: number, cy: number}[]} [cells]  The route the player drew,
 *        from a's cell to b's. Left out, the straightest clear route is used.
 */
export function addLink(world, aId, bId, line = 0, cells = null) {
  if (world.over) return { ok: false, reason: "over" };
  if (aId === bId) return { ok: false, reason: "same-site" };
  const a = world.siteById.get(aId);
  const b = world.siteById.get(bId);
  if (!a || !b) return { ok: false, reason: "unknown-site" };
  if (findLink(world, aId, bId)) return { ok: false, reason: "exists" };
  const route = cells ?? autoCells(world, a, b);
  if (!route) return { ok: false, reason: "no-way" };
  const problem = pathProblem(world, route, a, b);
  if (problem) return { ok: false, reason: problem };
  const cost = cellCost(route);
  if (cost > world.inventory.links) return { ok: false, reason: "no-links" };
  const path = cellsToPath(world, route);
  const leased = boundaryCrossings(world, path);
  if (leased > world.inventory.leased) return { ok: false, reason: "no-leased" };

  const link = {
    id: world.nextId++,
    a: aId,
    b: bId,
    line,
    /** The grid cells it runs through, end site to end site. */
    cells: route.map((c) => ({ cx: c.cx, cy: c.cy })),
    /** Links from the inventory it uses (the cells between its ends). */
    cost,
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
  world.inventory.links -= cost;
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
  world.inventory.links += link.cost;
  world.inventory.upgrades += link.tier;
  world.inventory.firewalls += link.firewall ? 1 : 0;
  world.inventory.leased += link.leased;
  world.routing.dirty = true;
  world.events.push({ type: "link-removed", linkId });
  return { ok: true, link };
}

/**
 * Player action: reroute link A–B through site C, making A–C and C–B
 * along the straightest clear routes. Links that already exist are reused.
 * The old link is refunded first, then the new legs are paid for.
 */
export function rerouteLink(world, linkId, viaId) {
  if (world.over) return { ok: false, reason: "over" };
  const link = world.linkById.get(linkId);
  if (!link) return { ok: false, reason: "unknown-link" };
  const via = world.siteById.get(viaId);
  if (!via) return { ok: false, reason: "unknown-site" };
  if (viaId === link.a || viaId === link.b) return { ok: false, reason: "same-site" };
  const { a, b, line } = link;
  const legs = [];
  for (const [x, y] of [
    [a, viaId],
    [viaId, b],
  ]) {
    if (findLink(world, x, y)) continue;
    const plan = plannedLink(world, world.siteById.get(x), world.siteById.get(y));
    if (!plan) return { ok: false, reason: "no-way" };
    legs.push({ x, y, ...plan });
  }
  const needLinks = legs.reduce((n, l) => n + l.cost, 0);
  const needLeased = legs.reduce((n, l) => n + l.leased, 0);
  if (needLinks > world.inventory.links + link.cost) return { ok: false, reason: "no-links" };
  if (needLeased > world.inventory.leased + link.leased) return { ok: false, reason: "no-leased" };
  removeLink(world, linkId);
  for (const leg of legs) addLink(world, leg.x, leg.y, line, leg.cells);
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
