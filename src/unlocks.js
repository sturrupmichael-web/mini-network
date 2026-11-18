/**
 * Map unlocks. Maps open one at a time, in the order maps.js lists them:
 * the first is always open, and beating a map (surviving its goal days in
 * Classic or the Daily challenge) opens the next one.
 *
 * Kept in storage under "beatenMaps" (a list of map ids). Players who
 * were here before unlocks keep what they had: a map they already have a
 * Classic score on stays open, and an old Classic run that lasted the goal
 * counts as beating it.
 */
import { loadScores, scoreKey } from "./scores.js";

const KEY = "beatenMaps";

/**
 * @param {object} storage  storage.js
 * @param {object[]} maps   MAPS, in unlock order
 * @param {object} config   CONFIG (for unlocks.goalDays)
 */
export function createUnlocks(storage, maps, config) {
  const goalDays = (map) => map.goalDays ?? config.unlocks.goalDays;

  function beaten() {
    const list = storage.get(KEY, []);
    const set = new Set(Array.isArray(list) ? list : []);
    // Old Classic runs that already lasted the goal.
    const scores = loadScores(storage);
    for (const m of maps) {
      const runs = scores[scoreKey("classic", m.id)];
      if (Array.isArray(runs) && runs.some((r) => r.days >= goalDays(m))) set.add(m.id);
    }
    return set;
  }

  function played(mapId) {
    const runs = loadScores(storage)[scoreKey("classic", mapId)];
    return Array.isArray(runs) && runs.length > 0;
  }

  const api = {
    goalDays,
    isBeaten(mapId) {
      return beaten().has(mapId);
    },
    isUnlocked(mapId) {
      const i = maps.findIndex((m) => m.id === mapId);
      if (i <= 0) return i === 0;
      return beaten().has(maps[i - 1].id) || beaten().has(mapId) || played(mapId);
    },
    /** The map that has to be beaten to open this one (null for the first). */
    unlockedBy(mapId) {
      const i = maps.findIndex((m) => m.id === mapId);
      return i > 0 ? maps[i - 1] : null;
    },
    /**
     * Record that a map was beaten. Returns { first: whether it's the first
     * time, opened: the map this opened (or null if none, or it was open already) }.
     */
    markBeaten(mapId) {
      const set = beaten();
      const first = !set.has(mapId);
      const i = maps.findIndex((m) => m.id === mapId);
      const next = i >= 0 ? (maps[i + 1] ?? null) : null;
      const wasOpen = next ? api.isUnlocked(next.id) : true;
      if (first) {
        const stored = storage.get(KEY, []);
        storage.set(KEY, [...new Set([...(Array.isArray(stored) ? stored : []), mapId])]);
      }
      return { first, opened: next && !wasOpen ? next : null };
    },
    /** The first open map, for when the picked one is locked. */
    firstOpen() {
      return maps.find((m) => api.isUnlocked(m.id)) ?? maps[0];
    },
  };
  return api;
}
