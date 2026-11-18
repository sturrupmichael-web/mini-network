/**
 * Run stats for the game-over card: packets delivered each week, and how
 * many packets each link carried. Part of the simulation (no DOM).
 *
 * Link counts are kept per pair of sites, not per link id, so a link that
 * is bent, rerouted through the same ends, or made a backbone keeps its
 * count.
 */

/** The key for the link between sites `a` and `b`, either way round. */
export function pairKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** A packet arrived: count it for the current week. */
export function countDelivery(world) {
  const weekly = world.stats.weekly;
  const i = world.week - 1;
  while (weekly.length <= i) weekly.push(0);
  weekly[i]++;
}

/** A packet set off along `link`. */
export function countCarried(world, link) {
  const key = pairKey(link.a, link.b);
  world.stats.carried[key] = (world.stats.carried[key] ?? 0) + 1;
}

/**
 * Packets delivered in each week so far, one entry per week (the last is
 * the week the run is in, which may be partial).
 */
export function weeklyDeliveries(world) {
  const weeks = Math.max(world.week, world.stats.weekly.length);
  return Array.from({ length: weeks }, (_, i) => world.stats.weekly[i] ?? 0);
}

/**
 * The link that carried the most packets, ever, or null if none has.
 * Ties go to the pair counted first. `linkId` is the link that joins the
 * pair now, or null if it was taken down.
 * @returns {{ a: number, b: number, packets: number, linkId: number | null } | null}
 */
export function busiestLink(world) {
  let best = null;
  for (const [key, packets] of Object.entries(world.stats.carried)) {
    if (best && packets <= best.packets) continue;
    const [a, b] = key.split("-").map(Number);
    best = { a, b, packets };
  }
  if (!best) return null;
  const link = world.links.find((l) => pairKey(l.a, l.b) === pairKey(best.a, best.b));
  return { ...best, linkId: link ? link.id : null };
}
