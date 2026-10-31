/**
 * Routing: every packet heads for the cheapest path to the nearest site of
 * its destination type. Costs include congestion (see CONFIG.routing), so
 * traffic spreads out when a link gets busy.
 *
 * We run one multi-source Dijkstra per destination type, outward from all
 * destination sites at once, giving every site its cost-to-destination.
 * A packet then picks the neighbouring hop with the lowest
 *   hop cost + neighbour's cost-to-destination.
 * Ties break on link id, so routing is deterministic.
 */

/** Cost for a packet to cross `link` and arrive at site `to`. */
export function hopCost(world, link, to) {
  const r = world.config.routing;
  return (
    link.length +
    r.hopCost +
    r.congestionWeight * link.inTransit +
    r.queueWeight * to.queue.length
  );
}

/** Recompute cost-to-destination tables for every destination type. */
export function computeRoutes(world) {
  const tables = new Map();
  const destTypes = new Set();
  for (const t of Object.values(world.data.traffic)) destTypes.add(t.to);
  for (const destType of destTypes) {
    tables.set(destType, dijkstra(world, destType));
  }
  world.routing.tables = tables;
  world.routing.dirty = false;
  world.routing.nextRecompute = world.time + world.config.routing.recomputeInterval;
}

function dijkstra(world, destType) {
  const dist = new Map();
  const done = new Set();
  for (const site of world.sites) {
    dist.set(site.id, site.type === destType ? 0 : Infinity);
  }
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
      const otherId = link.a === best.id ? link.b : link.a;
      if (done.has(otherId)) continue;
      const nd = bestDist + hopCost(world, link, best);
      if (nd < dist.get(otherId)) dist.set(otherId, nd);
    }
  }
  return dist;
}

/**
 * The link a packet at `site` should take next toward `destType`, or null
 * if there is no route. `cameFrom` (a site id) is only used as a last
 * resort, so packets don't bounce back and forth as congestion shifts.
 */
export function nextHop(world, site, destType, cameFrom = null) {
  const table = world.routing.tables.get(destType);
  if (!table) return null;
  let best = null;
  let bestCost = Infinity;
  let back = null;
  let backCost = Infinity;
  // site.links is kept in ascending id order, so strict "<" breaks ties
  // toward the lowest link id.
  for (const linkId of site.links) {
    const link = world.linkById.get(linkId);
    const otherId = link.a === site.id ? link.b : link.a;
    const other = world.siteById.get(otherId);
    const cost = hopCost(world, link, other) + table.get(otherId);
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
