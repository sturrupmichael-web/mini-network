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

/**
 * The game data a map actually runs with: data/ with the map's own
 * overrides applied (see maps.js):
 *   events      { <event id>: false | { schedule?, params?, duration? } }
 *               false turns that event off on this map; an object is merged
 *               over the event (params merged key by key).
 *   siteUnlock  { <site type id>: day } changes when new sites of that
 *               type can start appearing.
 * Returns `data` itself when the map has no overrides.
 */
export function dataForMap(data, map) {
  if (!map?.events && !map?.siteUnlock) return data;
  const out = { ...data };
  if (map.events) {
    out.events = data.events
      .filter((ev) => map.events[ev.id] !== false)
      .map((ev) => {
        const o = map.events[ev.id];
        if (!o) return ev;
        return { ...ev, ...o, params: { ...ev.params, ...(o.params ?? {}) } };
      });
  }
  if (map.siteUnlock) {
    out.sites = { ...data.sites };
    for (const [type, day] of Object.entries(map.siteUnlock)) out.sites[type] = { ...data.sites[type], unlockDay: day };
  }
  return out;
}
