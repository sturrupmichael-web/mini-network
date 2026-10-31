/**
 * Placing equipment from the inventory: switches and SD-WAN boxes.
 * (Upgrades and firewalls go on links: see links.js.)
 */
import { closestPointOnPath, distanceToPolyline } from "./geometry.js";
import { addLink, leasedNeeded, removeLink } from "./links.js";
import { addSite, deleteSite } from "./sites.js";

/** Can a switch go at (x, y)? Returns null if fine, or a reason. */
export function switchSpotProblem(world, x, y, ignore = []) {
  const { map, config } = world;
  const margin = config.sites.edgeMargin / 2;
  if (x < margin || y < margin || x > map.width - margin || y > map.height - margin) return "off-map";
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
  const rx = Math.round(x);
  const ry = Math.round(y);
  const problem = switchSpotProblem(world, rx, ry);
  if (problem) return { ok: false, reason: problem };
  const site = addSite(world, "switch", rx, ry);
  world.inventory.switches--;
  world.events.push({ type: "switch-placed", siteId: site.id });
  return { ok: true, site };
}

/**
 * Player action: drop a switch onto a link A–B, splitting it into A–S and
 * S–B. The switch comes with the extra patch cable, and both halves keep
 * the old link's tier. Its firewall (if any) goes back to the inventory.
 */
export function placeSwitchOnLink(world, linkId, x, y) {
  if (world.over) return { ok: false, reason: "over" };
  const link = world.linkById.get(linkId);
  if (!link) return { ok: false, reason: "unknown-link" };
  if (world.inventory.switches <= 0) return { ok: false, reason: "no-switches" };
  const { point } = closestPointOnPath(link.path, { x, y });
  const rx = Math.round(point.x);
  const ry = Math.round(point.y);
  const problem = switchSpotProblem(world, rx, ry);
  if (problem) return { ok: false, reason: problem };
  const { a, b, line, tier } = link;
  const spot = { x: rx, y: ry };
  const leased = leasedNeeded(world, world.siteById.get(a), spot) + leasedNeeded(world, spot, world.siteById.get(b));
  if (leased > world.inventory.leased + link.leased) return { ok: false, reason: "no-leased" };
  removeLink(world, linkId);
  world.inventory.upgrades -= tier; // the tier stays on the new halves
  const site = addSite(world, "switch", rx, ry);
  world.inventory.switches--;
  world.inventory.links++; // the free patch cable
  const first = addLink(world, a, site.id, line);
  const second = addLink(world, site.id, b, line);
  for (const half of [first, second]) if (half.ok) half.link.tier = tier;
  world.events.push({ type: "switch-placed", siteId: site.id });
  return { ok: true, site };
}

/**
 * Player action: remove a switch. Its links come back (refunded) and so
 * does the switch. Packets waiting at it are lost.
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
