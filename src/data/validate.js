/**
 * Checks the content in data/ is well-formed and every reference points at
 * something that exists. Returns a list of human-readable problems (empty
 * when all is well). Used by the tests, and at startup in the browser.
 */
const SITE_SHAPES = ["hub", "circle", "square", "triangle", "cloud", "edge", "switch"];
const PACKET_SHAPES = ["circle", "square", "triangle", "diamond"];
const HOURS = ["any", "day", "night"];
const SCHEDULE_KEYS = ["day", "every", "weekday", "fromWeek"];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPos = (v) => isNum(v) && v > 0;

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function validateData({ config, sites, traffic, maps, rewards, rewardGrants, events, tiers, items, effects, modes, audio, terrain }) {
  const errors = [];
  const err = (msg) => errors.push(msg);

  // Config: every leaf must be a finite number (or an array of them).
  walkNumbers(config, "config", err);
  if (!isPos(config?.sim?.tickRate)) err("config.sim.tickRate must be > 0");
  if (!Array.isArray(config?.sim?.speeds) || config.sim.speeds.length === 0) err("config.sim.speeds must be a non-empty array");
  if (!isPos(config?.links?.bandwidth)) err("config.links.bandwidth must be > 0");
  if (!isPos(config?.links?.packetSpeed)) err("config.links.packetSpeed must be > 0");

  for (const [id, w] of Object.entries(config?.growth?.types ?? {})) {
    if (!sites?.[id]) err(`config.growth.types references unknown site type "${id}"`);
    else if (!isPos(w)) err(`config.growth.types.${id} weight must be > 0`);
  }
  if (Object.keys(config?.growth?.types ?? {}).length === 0) err("config.growth.types needs at least one site type");
  if (config?.overload?.seconds <= 0) err("config.overload.seconds must be > 0");
  const warnAt = config?.overload?.warnAt;
  if (!(warnAt > 0 && warnAt < 1)) err("config.overload.warnAt must be between 0 and 1");

  // Terrain kinds.
  for (const [id, t] of Object.entries(terrain ?? {})) {
    if (!["waves", "dots", "hatch"].includes(t?.pattern)) err(`terrain.${id}.pattern must be "waves", "dots" or "hatch"`);
  }

  // Rewards.
  if (!Array.isArray(rewards) || rewards.length < 2) err("rewards must list at least two rewards");
  const rewardIds = new Set();
  for (const [i, r] of (rewards ?? []).entries()) {
    const at = `rewards[${i}] (${r.id ?? "no id"})`;
    if (typeof r.id !== "string" || !r.id) err(`${at}.id is missing`);
    else if (rewardIds.has(r.id)) err(`${at}.id is a duplicate`);
    rewardIds.add(r.id);
    if (typeof r.label !== "string" || !r.label) err(`${at}.label is missing`);
    if (typeof r.detail !== "string") err(`${at}.detail is missing`);
    if (!isPos(r.weight)) err(`${at}.weight must be > 0`);
    if (!Number.isInteger(r.fromWeek) || r.fromWeek < 1) err(`${at}.fromWeek must be a whole number ≥ 1`);
    const grants = Object.entries(r.grant ?? {});
    if (grants.length === 0) err(`${at}.grant is empty`);
    for (const [k, v] of grants) {
      if (!(rewardGrants ?? []).includes(k)) err(`${at}.grant has unknown key "${k}"`);
      if (!Number.isInteger(v) || v <= 0) err(`${at}.grant.${k} must be a whole number > 0`);
    }
  }
  if ((rewards ?? []).filter((r) => r.fromWeek === 1).length < 2) err("at least two rewards must be available from week 1");

  // Traffic types.
  for (const [id, t] of Object.entries(traffic ?? {})) {
    const at = `traffic.${id}`;
    if (typeof t.name !== "string" || !t.name) err(`${at}.name is missing`);
    if (typeof t.color !== "string" || !t.color) err(`${at}.color is missing`);
    if (!PACKET_SHAPES.includes(t.shape)) err(`${at}.shape "${t.shape}" must be one of ${PACKET_SHAPES.join(", ")}`);
    if (!isPos(t.size)) err(`${at}.size must be > 0`);
    if (!isNum(t.points)) err(`${at}.points must be a number`);
    const dests = Array.isArray(t.to) ? t.to : [t.to];
    if (dests.length === 0) err(`${at}.to is empty`);
    if (t.to !== "site") {
      for (const d of dests) if (!sites?.[d]) err(`${at}.to "${d}" is not a site type`);
    }
    if (!Number.isInteger(t.unlockDay) || t.unlockDay < 0) err(`${at}.unlockDay must be a whole number ≥ 0`);
    if (!HOURS.includes(t.hours)) err(`${at}.hours must be one of ${HOURS.join(", ")}`);
    if (t.maxHops !== undefined && (!Number.isInteger(t.maxHops) || t.maxHops < 1)) err(`${at}.maxHops must be a whole number ≥ 1`);
    if (t.dropPoints !== undefined && !isNum(t.dropPoints)) err(`${at}.dropPoints must be a number`);
  }

  // Site types.
  for (const [id, s] of Object.entries(sites ?? {})) {
    const at = `sites.${id}`;
    if (typeof s.name !== "string" || !s.name) err(`${at}.name is missing`);
    if (!SITE_SHAPES.includes(s.shape)) err(`${at}.shape "${s.shape}" must be one of ${SITE_SHAPES.join(", ")}`);
    if (typeof s.color !== "string" || !s.color) err(`${at}.color must be a CSS colour string`);
    if (!isPos(s.size)) err(`${at}.size must be > 0`);
    if (!isPos(s.capacity)) err(`${at}.capacity must be > 0`);
    if (s.packetInterval !== null) {
      const [min, max] = Array.isArray(s.packetInterval) ? s.packetInterval : [];
      if (!isPos(min) || !isPos(max) || min > max) err(`${at}.packetInterval must be null or [min, max] with 0 < min ≤ max`);
    }
    if (!s.traffic || typeof s.traffic !== "object") {
      err(`${at}.traffic must be an object`);
      continue;
    }
    const weights = Object.entries(s.traffic);
    if (s.packetInterval !== null && weights.length === 0) err(`${at} creates packets but has no traffic`);
    for (const [tid, w] of weights) {
      if (!traffic?.[tid]) err(`${at}.traffic references unknown traffic type "${tid}"`);
      else if (traffic[tid].to === "site" || traffic[tid].junk) err(`${at}.traffic: "${tid}" is only sent by events`);
      if (!isPos(w)) err(`${at}.traffic.${tid} weight must be > 0`);
    }
    if (!s.activity || !(isNum(s.activity.day) && s.activity.day >= 0) || !(isNum(s.activity.night) && s.activity.night >= 0)) {
      err(`${at}.activity needs day and night multipliers ≥ 0`);
    }
    if (s.burst !== null) {
      const b = s.burst ?? {};
      if (!(isNum(b.chance) && b.chance >= 0 && b.chance <= 1) || !Number.isInteger(b.min) || !Number.isInteger(b.max) || b.min < 1 || b.min > b.max) {
        err(`${at}.burst must be null or { chance 0–1, min ≥ 1, max ≥ min }`);
      }
    }
    if (!Number.isInteger(s.unlockDay) || s.unlockDay < 0) err(`${at}.unlockDay must be a whole number ≥ 0`);
  }
  if (!Object.values(sites ?? {}).some((s) => s.shape === "hub")) err("sites needs a hub-shaped site type (the data center)");
  if (!Object.values(sites ?? {}).some((s) => s.junction)) err("sites needs a junction site type (the switch)");

  // Equipment.
  if (!Array.isArray(tiers) || tiers.length === 0) err("tiers must list at least one link tier");
  for (const [i, t] of (tiers ?? []).entries()) {
    if (typeof t.name !== "string" || !t.name) err(`tiers[${i}].name is missing`);
    if (!isPos(t.bandwidth) || !isPos(t.width)) err(`tiers[${i}] needs bandwidth and width > 0`);
    if (i > 0 && t.bandwidth <= tiers[i - 1].bandwidth) err(`tiers[${i}] must be faster than the tier before it`);
  }
  const itemIds = Object.keys(items ?? {});
  for (const [id, item] of Object.entries(items ?? {})) {
    if (typeof item.name !== "string" || typeof item.hint !== "string" || typeof item.tip !== "string") {
      err(`items.${id} needs a name, a hint and a tip`);
    }
    if (![null, "link", "site", "map"].includes(item.target)) err(`items.${id}.target must be link, site, map or null`);
  }
  for (const k of Object.keys(config?.inventory ?? {})) {
    if (!itemIds.includes(k)) err(`config.inventory.${k} is not an item in equipment.js`);
  }
  for (const k of rewardGrants ?? []) {
    if (k !== "capacity" && !itemIds.includes(k)) err(`reward grant "${k}" is not an item in equipment.js`);
  }

  // Events.
  const eventIds = new Set();
  for (const [i, ev] of (events ?? []).entries()) {
    const at = `events[${i}] (${ev.id ?? "no id"})`;
    if (typeof ev.id !== "string" || !ev.id) err(`${at}.id is missing`);
    else if (eventIds.has(ev.id)) err(`${at}.id is a duplicate`);
    eventIds.add(ev.id);
    if (typeof ev.name !== "string" || !ev.name) err(`${at}.name is missing`);
    if (!Array.isArray(ev.toasts) || ev.toasts.length === 0 || !ev.toasts.every((t) => typeof t === "string" && t)) {
      err(`${at}.toasts needs at least one line`);
    }
    if (effects && !effects.includes(ev.effect)) err(`${at}.effect "${ev.effect}" is not one of ${effects.join(", ")}`);
    if (!(isNum(ev.duration) && ev.duration >= 0)) err(`${at}.duration must be ≥ 0`);
    const sch = ev.schedule ?? {};
    for (const k of Object.keys(sch)) if (!SCHEDULE_KEYS.includes(k)) err(`${at}.schedule has unknown key "${k}"`);
    if (sch.weekday !== undefined) {
      if (!Number.isInteger(sch.weekday) || sch.weekday < 0 || sch.weekday >= (config?.time?.daysPerWeek ?? 7)) err(`${at}.schedule.weekday is out of range`);
    } else if (!Number.isInteger(sch.day) || sch.day < 0) {
      err(`${at}.schedule needs a day (or a weekday)`);
    }
    if (sch.every !== undefined) {
      const [a, b] = Array.isArray(sch.every) ? sch.every : [];
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || a > b) err(`${at}.schedule.every must be [min, max] days, 1 ≤ min ≤ max`);
    }
    const p = ev.params ?? {};
    if (p.traffic !== undefined && !traffic?.[p.traffic]) err(`${at}.params.traffic "${p.traffic}" is not a traffic type`);
    if (ev.effect === "broadcast" && traffic?.[p.traffic]?.to !== "site") err(`${at}: broadcast traffic must have to: "site"`);
    if (ev.effect === "ddos" && !traffic?.[p.traffic]?.junk) err(`${at}: ddos traffic must be junk`);
    for (const t of Object.keys(p.types ?? {})) if (!sites?.[t]) err(`${at}.params.types references unknown site type "${t}"`);
    for (const k of Object.keys(p.grant ?? {})) if (!itemIds.includes(k)) err(`${at}.params.grant "${k}" is not an item`);
  }

  // Maps.
  if (!Array.isArray(maps) || maps.length === 0) err("maps must be a non-empty array");
  const mapIds = new Set();
  for (const [i, m] of (maps ?? []).entries()) {
    const at = `maps[${i}] (${m.id ?? "no id"})`;
    if (typeof m.id !== "string" || !m.id) err(`${at}.id is missing`);
    else if (mapIds.has(m.id)) err(`${at}.id is a duplicate`);
    mapIds.add(m.id);
    if (typeof m.name !== "string" || !m.name) err(`${at}.name is missing`);
    if (!isPos(m.width) || !isPos(m.height)) err(`${at} needs a positive width and height`);
    if (!Array.isArray(m.start) || m.start.length === 0) {
      err(`${at}.start must list at least one site`);
      continue;
    }
    for (const [j, s] of m.start.entries()) {
      if (!sites?.[s.type]) err(`${at}.start[${j}] has unknown site type "${s.type}"`);
      if (!isNum(s.x) || !isNum(s.y) || s.x < 0 || s.y < 0 || s.x > m.width || s.y > m.height) {
        err(`${at}.start[${j}] is outside the map`);
      }
    }
    // Every starting site that sends traffic must have somewhere to send it
    // on day 0 (other destinations can arrive later through events).
    const types = new Set(m.start.map((s) => s.type));
    for (const t of types) {
      const sends = Object.keys(sites?.[t]?.traffic ?? {}).map((tid) => traffic?.[tid]).filter(Boolean);
      if (sends.length === 0) continue;
      const ok = sends.some((tr) => tr.unlockDay === 0 && (Array.isArray(tr.to) ? tr.to : [tr.to]).some((d) => types.has(d)));
      if (!ok) err(`${at}: "${t}" has no traffic with a destination on the map on day 0`);
    }
    const spacing = config?.sites?.minSpacing ?? 0;
    // Sites snap to the middle of a grid square, so check where they end up.
    const cell = m.tuning?.grid?.cellSize ?? config?.grid?.cellSize ?? 1;
    const snap = (v) => (Math.floor(v / cell) + 0.5) * cell;
    for (let a = 0; a < m.start.length; a++) {
      for (let b = a + 1; b < m.start.length; b++) {
        const d = Math.hypot(snap(m.start[a].x) - snap(m.start[b].x), snap(m.start[a].y) - snap(m.start[b].y));
        if (d < spacing) err(`${at}.start[${a}] and [${b}] are closer than config.sites.minSpacing`);
      }
    }
    for (const [section, values] of Object.entries(m.tuning ?? {})) {
      if (!config?.[section] || typeof config[section] !== "object") {
        err(`${at}.tuning.${section} is not a config section`);
        continue;
      }
      for (const [k, v] of Object.entries(values)) {
        if (!(k in config[section])) err(`${at}.tuning.${section}.${k} is not in config.${section}`);
        else if (typeof v !== typeof config[section][k]) err(`${at}.tuning.${section}.${k} has the wrong type`);
      }
    }
    const cellSize = m.tuning?.grid?.cellSize ?? config?.grid?.cellSize ?? 1;
    for (const [j, area] of (m.terrain ?? []).entries()) {
      if (!terrain?.[area?.kind]) err(`${at}.terrain[${j}].kind "${area?.kind}" is not a terrain type`);
      const pts = area?.points;
      if (!Array.isArray(pts) || pts.length < 3 || !pts.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))) {
        err(`${at}.terrain[${j}].points must be a list of at least three [x, y] points`);
        continue;
      }
      // Starting sites need their square and the ones around it clear.
      for (const [si, s] of m.start.entries()) {
        const cx = (Math.floor(s.x / cellSize) + 0.5) * cellSize;
        const cy = (Math.floor(s.y / cellSize) + 0.5) * cellSize;
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          if (pointInPolygon(cx + dx * cellSize, cy + dy * cellSize, pts)) {
            err(`${at}.start[${si}] is on or right next to terrain[${j}]`);
            break;
          }
        }
      }
    }
    for (const [j, line] of (m.boundaries ?? []).entries()) {
      if (!Array.isArray(line) || line.length < 2 || !line.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))) {
        err(`${at}.boundaries[${j}] must be a list of at least two [x, y] points`);
      }
    }
  }
  // Modes.
  if (modes) {
    if (!modes.classic) err("modes needs a classic mode");
    for (const [id, m] of Object.entries(modes)) {
      if (typeof m.name !== "string" || typeof m.detail !== "string") err(`modes.${id} needs a name and detail`);
      for (const k of ["outages", "daily", "scores"]) if (typeof m[k] !== "boolean") err(`modes.${id}.${k} must be true or false`);
    }
  }

  // Audio.
  if (audio) {
    for (const tid of Object.keys(audio.trafficSteps ?? {})) {
      if (!traffic?.[tid]) err(`audio.trafficSteps references unknown traffic type "${tid}"`);
    }
    if (!Array.isArray(audio.notes?.scale) || audio.notes.scale.length === 0) err("audio.notes.scale must list semitones");
  }
  return errors;
}

function walkNumbers(obj, path, err) {
  if (obj === null || typeof obj !== "object") {
    err(`${path} must be an object`);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = `${path}.${k}`;
    if (Array.isArray(v)) {
      if (!v.every(isNum)) err(`${p} must only contain numbers`);
    } else if (v && typeof v === "object") {
      walkNumbers(v, p, err);
    } else if (!isNum(v)) {
      err(`${p} must be a number`);
    }
  }
}
