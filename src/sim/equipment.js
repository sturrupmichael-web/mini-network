/**
 * Placing equipment from the inventory: switches and SD-WAN boxes.
 * (Upgrades and firewalls go on links: see links.js.)
 */
import { distanceToPolyline } from "./geometry.js";
import { cellCenter, cellKey, cellOf, inView, isTerrain, siteCells, snapToGrid } from "./grid.js";
import { addLink, leasedForCells, removeLink } from "./links.js";
import { addSite, deleteSite } from "./sites.js";

/** Can a switch go at (x, y)? Returns null if fine, or a reason. */
export function switchSpotProblem(world, x, y, ignore = []) {
  const { map, config } = world;
  const margin = config.sites.edgeMargin / 2;
  if (x < margin || y < margin || x > map.width - margin || y > map.height - margin) return "off-map";
  if (!inView(world, x, y)) return "off-map";
  if (isTerrain(world, cellOf(world, x, y))) return "on-terrain";
  const here = siteCells(world).get(cellKey(cellOf(world, x, y)));
  if (here && !ignore.includes(here.id)) return "too-close";
  for (const s of world.sites) {
    if (ignore.includes(s.id)) continue;
    if (Math.hypot(s.x - x, s.y - y) < config.switches.minSpacing) return "too-close";
  }
  for (const b of map.boundaries ?? []) {
    const line = b.map(([bx, by]) => ({ x: bx, y: by }));
    if (distanceToPolyline({ x, y }, line) < config.sites.boundaryClearance / 2) return "on-boundary";
  }
  return null;
}

/** Player action: place a switch on empty map. */
export function placeSwitch(world, x, y) {
  if (world.over) return { ok: false, reason: "over" };
  if (world.inventory.switches <= 0) return { ok: false, reason: "no-switches" };
  const spot = snapToGrid(world, x, y);
  const problem = switchSpotProblem(world, spot.x, spot.y);
  if (problem) return { ok: false, reason: problem };
  const site = addSite(world, "switch", spot.x, spot.y);
  world.inventory.switches--;
  world.events.push({ type: "switch-placed", siteId: site.id });
  return { ok: true, site };
}

/**
 * Player action: drop a switch onto a link A–B, splitting it into A–S and
 * S–B at the link's grid cell nearest (x, y). The halves follow the old
 * route, so the cell the switch sits in comes back to the inventory. Both
 * halves keep the old link's tier; its firewall (if any) is refunded.
 */
export function placeSwitchOnLink(world, linkId, x, y) {
  if (world.over) return { ok: false, reason: "over" };
  const link = world.linkById.get(linkId);
  if (!link) return { ok: false, reason: "unknown-link" };
  if (world.inventory.switches <= 0) return { ok: false, reason: "no-switches" };
  // The interior cell nearest the drop point.
  let index = -1;
  let best = Infinity;
  for (let i = 1; i < link.cells.length - 1; i++) {
    const c = cellCenter(world, link.cells[i]);
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < best) {
      best = d;
      index = i;
    }
  }
  if (index < 0) return { ok: false, reason: "too-close" };
  const spot = cellCenter(world, link.cells[index]);
  const problem = switchSpotProblem(world, spot.x, spot.y);
  if (problem) return { ok: false, reason: problem };
  const { a, b, line, tier } = link;
  const firstCells = link.cells.slice(0, index + 1);
  const secondCells = link.cells.slice(index);
  const leased = leasedForCells(world, firstCells) + leasedForCells(world, secondCells);
  if (leased > world.inventory.leased + link.leased) return { ok: false, reason: "no-leased" };
  removeLink(world, linkId);
  world.inventory.upgrades -= tier; // the tier stays on the new halves
  const site = addSite(world, "switch", spot.x, spot.y);
  world.inventory.switches--;
  const first = addLink(world, a, site.id, line, firstCells);
  const second = addLink(world, site.id, b, line, secondCells);
  for (const half of [first, second]) if (half.ok) half.link.tier = tier;
  world.events.push({ type: "switch-placed", siteId: site.id });
  return { ok: true, site };
}

/**
 * Switch add-ons: inventory item → the flag it sets on a switch, and the
 * reasons used when it can't go there.
 */
const SWITCH_ADDONS = {
  routers: { flag: "core", has: "has-router", none: "no-routers", event: "router-added" },
  qos: { flag: "qos", has: "has-qos", none: "no-qos", event: "qos-added" },
};

function addToSwitch(world, siteId, item) {
  const addon = SWITCH_ADDONS[item];
  if (world.over) return { ok: false, reason: "over" };
  const site = world.siteById.get(siteId);
  if (!site) return { ok: false, reason: "unknown-site" };
  if (!world.data.sites[site.type].junction) return { ok: false, reason: "not-a-switch" };
  if (site[addon.flag]) return { ok: false, reason: addon.has };
  if (world.inventory[item] <= 0) return { ok: false, reason: addon.none };
  site[addon.flag] = true;
  site.busyUntil = 0;
  world.inventory[item]--;
  world.events.push({ type: addon.event, siteId });
  return { ok: true };
}

/** Player action: upgrade a switch to a core router, so it never jams. */
export function addCoreRouter(world, siteId) {
  return addToSwitch(world, siteId, "routers");
}

/** Player action: give a switch a QoS policy (priority traffic first). */
export function addQos(world, siteId) {
  return addToSwitch(world, siteId, "qos");
}

/**
 * Player action: remove a switch. Its links come back (refunded) and so
 * does the switch (and its core router and QoS policy, if it had them). Packets waiting at it are lost.
 */
export function removeSwitch(world, siteId) {
  if (world.over) return { ok: false, reason: "over" };
  const site = world.siteById.get(siteId);
  if (!site || !world.data.sites[site.type].junction) return { ok: false, reason: "not-a-switch" };
  for (const linkId of [...site.links]) removeLink(world, linkId);
  const lost = new Set(site.queue);
  world.packets = world.packets.filter((p) => !lost.has(p.id));
  world.stats.lost += lost.size;
  deleteSite(world, siteId);
  world.inventory.switches++;
  for (const [item, addon] of Object.entries(SWITCH_ADDONS)) if (site[addon.flag]) world.inventory[item]++;
  world.events.push({ type: "switch-removed", siteId });
  return { ok: true };
}

/** Player action: give a site an SD-WAN box. */
export function addSdwan(world, siteId) {
  if (world.over) return { ok: false, reason: "over" };
  const site = world.siteById.get(siteId);
  if (!site) return { ok: false, reason: "unknown-site" };
  if (site.sdwan) return { ok: false, reason: "has-sdwan" };
  if (world.inventory.sdwan <= 0) return { ok: false, reason: "no-sdwan" };
  site.sdwan = true;
  world.inventory.sdwan--;
  world.events.push({ type: "sdwan-added", siteId });
  return { ok: true };
}
