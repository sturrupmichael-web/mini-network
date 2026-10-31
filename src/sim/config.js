/**
 * The config a game actually runs with: config.js, with the map's
 * `tuning` merged over it section by section.
 */
export function configForMap(config, map) {
  if (!map.tuning) return config;
  const out = { ...config };
  for (const [section, values] of Object.entries(map.tuning)) {
    out[section] = { ...config[section], ...values };
  }
  return out;
}
