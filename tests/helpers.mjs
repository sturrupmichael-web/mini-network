/** Shared helpers for node tests. */
import { CONFIG } from "../data/config.js";
import { MAPS } from "../data/maps.js";
import { SITE_TYPES } from "../data/sites.js";
import { TRAFFIC_TYPES } from "../data/traffic.js";
import { createWorld } from "../src/sim/world.js";

export const DATA = { sites: SITE_TYPES, traffic: TRAFFIC_TYPES };

/** A world on the first real map, or on a custom map. */
export function makeWorld({ seed = "test", map = MAPS[0], config = CONFIG, data = DATA } = {}) {
  return createWorld({ config, data, map, seed });
}

/** A map with sites at the given positions: [{ type, x, y }]. */
export function customMap(start) {
  return { id: "test", name: "Test", width: 1200, height: 800, start, boundaries: [] };
}

/** Deep-ish copy of CONFIG with overrides merged per section. */
export function configWith(overrides) {
  const out = structuredClone(CONFIG);
  for (const [section, values] of Object.entries(overrides)) Object.assign(out[section], values);
  return out;
}
