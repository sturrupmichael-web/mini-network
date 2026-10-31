/**
 * Checks the content in data/ is well-formed and every reference points at
 * something that exists. Returns a list of human-readable problems (empty
 * when all is well). Used by the tests, and at startup in the browser.
 */
const SITE_SHAPES = ["hub", "circle", "square", "triangle"];
const PACKET_SHAPES = ["circle", "square", "triangle", "diamond"];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isPos = (v) => isNum(v) && v > 0;

export function validateData({ config, sites, traffic, maps }) {
  const errors = [];
  const err = (msg) => errors.push(msg);

  // Config: every leaf must be a finite number (or an array of them).
  walkNumbers(config, "config", err);
  if (!isPos(config?.sim?.tickRate)) err("config.sim.tickRate must be > 0");
  if (!Array.isArray(config?.sim?.speeds) || config.sim.speeds.length === 0) err("config.sim.speeds must be a non-empty array");
  if (!isPos(config?.links?.bandwidth)) err("config.links.bandwidth must be > 0");
  if (!isPos(config?.links?.packetSpeed)) err("config.links.packetSpeed must be > 0");

  // Traffic types.
  for (const [id, t] of Object.entries(traffic ?? {})) {
    const at = `traffic.${id}`;
    if (typeof t.name !== "string" || !t.name) err(`${at}.name is missing`);
    if (typeof t.color !== "string" || !t.color) err(`${at}.color is missing`);
    if (!PACKET_SHAPES.includes(t.shape)) err(`${at}.shape "${t.shape}" must be one of ${PACKET_SHAPES.join(", ")}`);
    if (!isPos(t.size)) err(`${at}.size must be > 0`);
    if (!isNum(t.points)) err(`${at}.points must be a number`);
    if (!sites?.[t.to]) err(`${at}.to "${t.to}" is not a site type`);
  }

  // Site types.
  for (const [id, s] of Object.entries(sites ?? {})) {
    const at = `sites.${id}`;
    if (typeof s.name !== "string" || !s.name) err(`${at}.name is missing`);
    if (!SITE_SHAPES.includes(s.shape)) err(`${at}.shape "${s.shape}" must be one of ${SITE_SHAPES.join(", ")}`);
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
      if (!isPos(w)) err(`${at}.traffic.${tid} weight must be > 0`);
    }
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
    // Every traffic type the starting sites send must have a destination on the map.
    const types = new Set(m.start.map((s) => s.type));
    for (const t of types) {
      for (const tid of Object.keys(sites?.[t]?.traffic ?? {})) {
        const dest = traffic?.[tid]?.to;
        if (dest && !types.has(dest)) err(`${at}: "${t}" sends ${tid} to "${dest}", but the map starts with none`);
      }
    }
    const spacing = config?.sites?.minSpacing ?? 0;
    for (let a = 0; a < m.start.length; a++) {
      for (let b = a + 1; b < m.start.length; b++) {
        const d = Math.hypot(m.start[a].x - m.start[b].x, m.start[a].y - m.start[b].y);
        if (d < spacing) err(`${at}.start[${a}] and [${b}] are closer than config.sites.minSpacing`);
      }
    }
    for (const [j, line] of (m.boundaries ?? []).entries()) {
      if (!Array.isArray(line) || line.length < 2 || !line.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))) {
        err(`${at}.boundaries[${j}] must be a list of at least two [x, y] points`);
      }
    }
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
