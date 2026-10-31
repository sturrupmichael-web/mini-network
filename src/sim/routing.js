/**
 * Routing: every packet heads for the cheapest path to the nearest site
 * matching its destination key (see sites.js). Costs include congestion
 * (see CONFIG.routing), so traffic spreads out when a link gets busy.
 *
 * For each destination key in use we run one multi-source Dijkstra outward
 * from every matching site, giving every site its cost-to-destination.
 * Tables are cached until the next recompute. A packet then picks the
 * neighbouring hop with the lowest  hop cost + neighbour's cost.
 * Ties break on link id, so routing is deterministic.
 *
 * Cut links: the routing tables ignore a cut link once the network has
 * converged (config.failover.convergenceSeconds after the cut). Before
 * that, only sites with an SD-WAN box know to avoid it; everyone else
 * keeps choosing it and their packets wait.
 */
import { isBlocked } from "./links.js";
import { siteMatches } from "./sites.js";

/** Cost for a packet to cross `link` and arrive at site `to`. */
export function hopCost(world, link, to) {
  const r = world.config.routing;
  return link.length + r.hopCost + r.congestionWeight * link.inTransit + r.queueWeight * to.queue.length;
}

/** Has the whole network learned that this link is cut? */
export function knownDown(world, link) {
  return link.down !== null && world.time >= link.down.since + world.config.failover.convergenceSeconds;
}

/** Start a fresh set of routing tables (built lazily per destination). */
export function computeRoutes(world) {
  world.routing.tables = new Map();
  world.routing.dirty = false;
  world.routing.nextRecompute = world.time + world.config.routing.recomputeInterval;
}

function tableFor(world, key) {
  let table = world.routing.tables.get(key);
  if (!table) {
    table = dijkstra(world, key);
    world.routing.tables.set(key, table);
  }
  return table;
}

function dijkstra(world, key) {
  const dist = new Map();
  const done = new Set();
  for (const site of world.sites) dist.set(site.id, siteMatches(site, key) ? 0 : Infinity);
  // Graphs are small (tens of sites), so a simple O(V²) scan is fine and
  // keeps the visiting order fully deterministic.
  for (;;) {
    let best = null;
    let bestDist = Infinity;
    for (const site of world.sites) {
      if (done.has(site.id)) continue;
      const d = dist.get(site.id);
      if (d < bestDist) {
        best = site;
        bestDist = d;
      }
    }
    if (!best) break;
    done.add(best.id);
    for (const linkId of best.links) {
      const link = world.linkById.get(linkId);
      if (isBlocked(world, link) || knownDown(world, link)) continue;
      const otherId = link.a === best.id ? link.b : link.a;
      if (done.has(otherId)) continue;
      const nd = bestDist + hopCost(world, link, best);
      if (nd < dist.get(otherId)) dist.set(otherId, nd);
    }
  }
  return dist;
}

/** Cost from this site to the destination (Infinity if unreachable). */
export function costToDestination(world, site, key) {
  return tableFor(world, key).get(site.id) ?? Infinity;
}

/**
 * The link a packet at `site` should take next toward `key`, or null if
 * there is no route. `cameFrom` (a site id) is only used as a last resort,
 * so packets don't bounce back and forth as congestion shifts.
 */
export function nextHop(world, site, key, cameFrom = null) {
  const table = tableFor(world, key);
  let best = null;
  let bestCost = Infinity;
  let back = null;
  let backCost = Infinity;
  // site.links is kept in ascending id order, so strict "<" breaks ties
  // toward the lowest link id.
  for (const linkId of site.links) {
    const link = world.linkById.get(linkId);
    if (isBlocked(world, link)) continue;
    if (link.down && (site.sdwan || knownDown(world, link))) continue;
    const otherId = link.a === site.id ? link.b : link.a;
    const other = world.siteById.get(otherId);
    const cost = hopCost(world, link, other) + (table.get(otherId) ?? Infinity);
    if (otherId === cameFrom) {
      if (cost < backCost) {
        back = link;
        backCost = cost;
      }
    } else if (cost < bestCost) {
      best = link;
      bestCost = cost;
    }
  }
  if (bestCost < Infinity) return best;
  return backCost < Infinity ? back : null;
}
