/**
 * High scores, kept in storage under "highScores": a top-5 list per
 * mode and map ("classic:campus"), plus one per daily challenge date
 * ("daily:2026-10-31").
 */
const KEEP = 5;

export function scoreKey(modeId, mapId, daily = null) {
  return daily ? `daily:${daily}` : `${modeId}:${mapId}`;
}

export function loadScores(storage) {
  const all = storage.get("highScores", {});
  return all && typeof all === "object" ? all : {};
}

/** The best entry for a key, or null. */
export function bestScore(storage, key) {
  return loadScores(storage)[key]?.[0] ?? null;
}

/**
 * Add a finished game. Returns { rank (0-based, or -1 if it didn't make
 * the list), best: whether it's the new best }.
 */
export function recordScore(storage, key, entry) {
  const all = loadScores(storage);
  const list = Array.isArray(all[key]) ? all[key] : [];
  list.push(entry);
  list.sort((a, b) => b.score - a.score || b.days - a.days);
  const rank = list.indexOf(entry);
  all[key] = list.slice(0, KEEP);
  storage.set("highScores", all);
  return { rank: rank < KEEP ? rank : -1, best: rank === 0 };
}
