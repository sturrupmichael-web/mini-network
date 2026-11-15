/**
 * Draws the world onto the canvas. Reads simulation state, never changes it.
 *
 * The look follows the Nano Networks style guide (docs/style-guide.md):
 * flat, rounded pieces with no outlines, depth only from a soft drop shadow
 * (SHADOW.tier in theme.js), and colour only for gameplay. Sizes are
 * fractions of a tile: one grid square on screen.
 *
 * Draw order: ground, zones, cables (shadows first), switches,
 * workstations and servers, packets, ticket pins and ring timers.
 *
 * Performance: the ground and zones are drawn to a cached layer, and so are
 * the cables (with their blurred shadows), each redrawn only when what they
 * show changes. Sites are drawn from cached sprites with their shadow baked
 * in. Only packets, pins, rings and other moving things are drawn from
 * scratch each frame, with cheap unblurred shadows.
 */
import { MOTION, SHADOW, SIZE, THEME, mapColors, nodeColor } from "../../data/theme.js";
import { pointAlong } from "../sim/geometry.js";
import { cellCenter, cellOf, cellsToPath, gridSize, straightCells } from "../sim/grid.js";
import { isBlocked } from "../sim/links.js";
import { busiestLink } from "../sim/runstats.js";
import { worldToScreen } from "./camera.js";

/** Small UI bits (the remove button, arrows) shrink a little on small screens and grow on big ones. */
export function uiScale(camera) {
  return Math.min(1.3, Math.max(0.8, camera.scale / 0.8));
}

/** One grid square on screen, in CSS px. Cables are sized from this. */
export function tilePx(world, camera) {
  return world.config.grid.cellSize * camera.scale;
}

/**
 * The tile size pieces (sites, packets, pins) are drawn at: a grid square,
 * but never so small that a site is hard to see or tap on a phone.
 */
export function pieceTile(world, camera) {
  return Math.min(44, Math.max(24, tilePx(world, camera)));
}

/**
 * What a site is drawn as: "workstation" (sites that send traffic),
 * "server" (sites traffic goes to) or "switch" (junctions).
 */
export function siteForm(def) {
  if (def.junction) return "switch";
  if (def.shape === "hub" || def.shape === "cloud" || def.shape === "edge" || def.shape === "district") return "server";
  return "workstation";
}

/** A site's size on screen: { form, w, h, radius } in CSS px. */
export function siteBox(world, site, camera) {
  const def = world.data.sites[site.type];
  const P = pieceTile(world, camera);
  const form = siteForm(def);
  if (form === "switch") {
    const d = SIZE.switch * P * (site.core ? 1.12 : 1);
    return { form, w: d, h: d, radius: d / 2 };
  }
  if (form === "server") {
    const big = def.shape === "hub";
    return { form, w: SIZE.server.w * P, h: (big ? SIZE.server.big : SIZE.server.h) * P, radius: SIZE.server.radius * P };
  }
  const grown = site.grown ? world.config.siteGrowth.size : 1;
  const s = SIZE.workstation * P * grown;
  return { form, w: s, h: s, radius: SIZE.wsRadius * P * grown };
}

/** Roughly how far a site reaches from its centre (for tapping and placing things next to it). */
export function siteRadiusPx(world, site, camera) {
  const b = siteBox(world, site, camera);
  return b.form === "server" ? Math.max(b.w, b.h) / 2 - b.h * 0.1 : Math.max(b.w, b.h) / 2;
}

/** Screen position of the "remove" button for a selected link. */
export function removeButtonPos(world, link, camera) {
  const mid = pointAlong(link.path, link.length / 2);
  return worldToScreen(camera, mid.x, mid.y);
}

/** Screen position of the "remove" button for a selected switch. */
export function siteRemoveButtonPos(world, site, camera) {
  const p = worldToScreen(camera, site.x, site.y);
  const r = siteRadiusPx(world, site, camera) * 0.75;
  const br = removeButtonRadius(camera) * 0.9;
  return { x: p.x + r + br, y: p.y - r - br };
}

/** How dark it is: 0 in the day, 1 in the middle of the night, smooth in between. */
export function nightAmount(world) {
  const { secondsPerDay } = world.config.time;
  const { nightStart, nightEnd } = world.config.dayNight;
  const f = (world.time % secondsPerDay) / secondsPerDay;
  const fade = 0.06;
  // Distance into the night from either edge, as a 0–1 ramp.
  const intoNight = f >= nightStart - fade ? (f - (nightStart - fade)) / fade : f < nightEnd + fade ? ((nightEnd + fade) - f) / fade : 0;
  return Math.max(0, Math.min(1, intoNight));
}

function parseColor(c) {
  if (c.startsWith("#")) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/[\d.]+/g) ?? [0, 0, 0];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

/** Mix colour a toward b by t (0–1). Takes #rrggbb or rgb(); returns rgb(). */
export function mixColor(a, b, t) {
  if (t <= 0) return a;
  const pa = parseColor(a);
  const pb = parseColor(b);
  const mix = (i) => Math.round(pa[i] + (pb[i] - pa[i]) * Math.min(1, t));
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

export function removeButtonRadius(camera) {
  return THEME.sizes.removeButton * uiScale(camera);
}

/** The colour a site is drawn in for this theme. */
export function siteColor(world, site, colors) {
  const def = world.data.sites[site.type];
  if (def.junction) return site.core ? colors.backbone : colors.cable;
  if (def.node) return nodeColor(def.node, colors.theme) ?? def.color;
  // Neutral servers (the data center) are the dark, "elevated" slate.
  return colors.backbone;
}

/** The colour a packet of this traffic type is drawn in for this theme. */
export function trafficColor(world, trafficId, colors) {
  const t = world.data.traffic[trafficId];
  if (!t) return colors.ringNeutral;
  return (t.node && nodeColor(t.node, colors.theme)) || t.color;
}

/** The colour of a site's ring timer, pins and edge arrow. */
function ringColor(world, site, colors) {
  const def = world.data.sites[site.type];
  return def.node ? siteColor(world, site, colors) : colors.ringNeutral;
}

/**
 * Links aren't colour-coded any more (colour only means traffic); info
 * cards and the run report draw a link in this neutral slate.
 */
export function lineColor() {
  return "#8F9AA6";
}

const easeOutBack = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

/**
 * @param {object} ui  { drag, reroute, selectedLinkId, hoverSiteId, theme, … } from input.
 * @param {number} now Real time in seconds, for gentle animations.
 */
export function render(ctx, view, world, camera, ui, now = 0) {
  const colors = mapColors(ui.theme, world.map?.palette);
  const mode = colors.theme === "dark" ? "night" : "day";
  const k = uiScale(camera);
  const T = tilePx(world, camera);
  const P = pieceTile(world, camera);
  const env = { ctx, view, world, camera, ui, now, colors, mode, k, T, P };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 1–2. Ground and zones (cached).
  drawGroundLayer(env);
  // 3–4. Cables, their shadows first (cached while nothing changes).
  drawCableLayer(env);
  drawRemovedLinks(env);
  if (ui.drag) drawPreview(env, ui.drag);
  drawBlockedCell(env, ui.blockedCell);
  if (ui.reroute) drawReroute(env, ui.reroute);
  if (ui.place?.target) drawDropTarget(env, ui.place.target);
  // 5–6. Switches, then workstations and servers.
  for (const site of world.sites) if (siteForm(world.data.sites[site.type]) === "switch") drawSite(env, site);
  for (const site of world.sites) if (siteForm(world.data.sites[site.type]) !== "switch") drawSite(env, site);
  // 7. Packets: waiting (parked bumper to bumper), travelling, and just delivered.
  drawPackets(env);
  drawPops(env, ui.pops);
  // 8. Ticket pins and ring timers.
  for (const site of world.sites) drawPins(env, site);
  for (const site of world.sites) drawRing(env, site);
  drawOffscreenArrows(env, ui.insets);
  const selected = ui.selectedLinkId && world.linkById.get(ui.selectedLinkId);
  if (selected) drawRemoveButton(env, removeButtonPos(world, selected, camera));
  const selectedSite = ui.selectedSiteId && world.siteById.get(ui.selectedSiteId);
  if (selectedSite) drawRemoveButton(env, siteRemoveButtonPos(world, selectedSite, camera));
  if (world.over) {
    ctx.fillStyle = colors.dim;
    ctx.fillRect(0, 0, view.width, view.height);
    // Lift the busiest link out of the dimming, with a halo (see the game-over card).
    const top = busiestLink(world);
    const busiest = top && top.linkId !== null && world.linkById.get(top.linkId);
    if (busiest) {
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = colors.removeFill;
      ctx.lineWidth = cableWidth(env, busiest) + 12 * k;
      strokePath(ctx, toScreenPath(camera, busiest.path));
      ctx.globalAlpha = 1;
      drawCable(ctx, env, busiest, busiest.path, 1);
    }
    const site = world.siteById.get(world.over.siteId);
    if (site) {
      drawSite(env, site);
      drawRing(env, site);
    }
  }
}

function toScreenPath(camera, points) {
  return points.map((p) => worldToScreen(camera, p.x, p.y));
}

function strokePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

/** Sets ctx's transform so world units can be drawn directly (on top of the dpr scale). */
function applyCamera(ctx, camera) {
  const s = camera.scale;
  if (camera.rotated) ctx.transform(0, s, -s, 0, camera.offsetX + camera.mapHeight * s, camera.offsetY);
  else ctx.transform(s, 0, 0, s, camera.offsetX, camera.offsetY);
}

// ---------------------------------------------------------------------------
// Offscreen canvases: cached layers and sprites.

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    return c;
  }
  return null;
}

/** A canvas the size of the view (device px), reused between frames. */
function layerCanvas(slot, view) {
  const w = Math.round(view.width * view.dpr);
  const h = Math.round(view.height * view.dpr);
  let c = layers[slot];
  if (!c) c = layers[slot] = makeCanvas(w, h);
  if (!c) return null;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}
const layers = {};
const layerKeys = {};

/** Draw a cached layer, redrawing it first if `key` changed. */
function cachedLayer(env, slot, key, paint) {
  const { ctx, view } = env;
  const c = layerCanvas(slot, view);
  if (!c) {
    // No offscreen canvases (very old browser): draw straight to the screen.
    paint(ctx);
    return;
  }
  if (layerKeys[slot] !== key) {
    const lc = c.getContext("2d");
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, c.width, c.height);
    lc.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    lc.lineCap = "round";
    lc.lineJoin = "round";
    paint(lc);
    layerKeys[slot] = key;
  }
  ctx.drawImage(c, 0, 0, view.width, view.height);
}

/**
 * Draw only the soft shadow of some shapes, at a depth tier, onto ctx.
 * The shapes are drawn far off to the side with the shadow offset back
 * onto the canvas, into a scratch layer in solid colour, and the layer is
 * then laid down at the shadow's alpha, so shadows that overlap don't get
 * darker. Used for cached layers only (blur is slow).
 */
function shadowPass(env, ctx, tier, paintShapes) {
  const t = SHADOW.tier[tier];
  if (!t) return;
  const { view, mode } = env;
  const scratch = layerCanvas("shadow", view);
  if (!scratch) return;
  const sc = scratch.getContext("2d");
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.clearRect(0, 0, scratch.width, scratch.height);
  const away = view.width + 200;
  sc.setTransform(view.dpr, 0, 0, view.dpr, -away * view.dpr, 0);
  sc.shadowColor = SHADOW.rgb[mode];
  sc.shadowBlur = t.blur * view.dpr;
  sc.shadowOffsetX = (away + t.x) * view.dpr;
  sc.shadowOffsetY = t.y * view.dpr;
  sc.lineCap = "round";
  sc.lineJoin = "round";
  sc.strokeStyle = "#000";
  sc.fillStyle = "#000";
  paintShapes(sc);
  sc.shadowColor = "transparent";
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = SHADOW.alpha[mode];
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

const sprites = new Map();
/**
 * A piece drawn once, with its blurred shadow baked in, and reused.
 * `paint(c, w, h)` draws the piece centred on (0, 0). Returns
 * { canvas, w, h } where w/h are the sprite's size in CSS px (centred).
 */
function sprite(key, w, h, tier, mode, dpr, paint) {
  const fullKey = `${key}|${w.toFixed(1)}|${h.toFixed(1)}|${tier}|${mode}|${dpr}`;
  let s = sprites.get(fullKey);
  if (s) return s;
  const t = SHADOW.tier[tier] ?? { x: 0, y: 0, blur: 0 };
  const pad = Math.ceil(t.blur * 1.5 + Math.max(Math.abs(t.x), Math.abs(t.y)) + 2);
  const sw = w + pad * 2;
  const sh = h + pad * 2;
  const c = makeCanvas(Math.ceil(sw * dpr), Math.ceil(sh * dpr));
  if (!c) return null;
  const sc = c.getContext("2d");
  sc.setTransform(dpr, 0, 0, dpr, (sw / 2) * dpr, (sh / 2) * dpr);
  sc.shadowColor = SHADOW.color[mode];
  sc.shadowBlur = t.blur * dpr;
  sc.shadowOffsetX = t.x * dpr;
  sc.shadowOffsetY = t.y * dpr;
  paint(sc, w, h, () => {
    sc.shadowColor = "transparent";
  });
  if (sprites.size > 400) sprites.clear();
  s = { canvas: c, w: sw, h: sh };
  sprites.set(fullKey, s);
  return s;
}

function drawSprite(ctx, s, x, y, scale = 1) {
  ctx.drawImage(s.canvas, x - (s.w / 2) * scale, y - (s.h / 2) * scale, s.w * scale, s.h * scale);
}

// ---------------------------------------------------------------------------
// 1–2. Ground and zones.

function drawGroundLayer(env) {
  const { world, camera, view, ui, colors } = env;
  const shown = ui.shownView ?? world.view;
  const night = Math.round(nightAmount(world) * 40) / 40;
  const key = [
    colors.theme,
    world.map?.id,
    view.width,
    view.height,
    view.dpr,
    camera.scale.toFixed(4),
    camera.offsetX.toFixed(1),
    camera.offsetY.toFixed(1),
    camera.rotated,
    shown ? [shown.x, shown.y, shown.width, shown.height].map((n) => Math.round(n)).join(",") : "",
    Boolean(ui.drag),
    night,
    world.terrain?.size ?? 0,
  ].join("|");
  cachedLayer(env, "ground", key, (c) => {
    c.fillStyle = colors.background;
    c.fillRect(0, 0, view.width, view.height);
    drawTerrain(c, env);
    drawBoundaries(c, env);
    drawClosed(c, env, shown);
    if (night > 0) {
      // In-game night: the ground and zones darken a little.
      c.globalAlpha = night * colors.nightDepth;
      c.fillStyle = colors.nightBackground;
      c.fillRect(0, 0, view.width, view.height);
      c.globalAlpha = 1;
    }
    drawGrid(c, env, shown);
  });
}

/**
 * Terrain areas (terrain.js) as flat, soft-edged blobs: every blocked grid
 * square, with the outside corners rounded off and the inside corners
 * filled in, so the area reads as one smooth piece of ground.
 */
function drawTerrain(c, env) {
  const { world, camera, colors } = env;
  if (!world.terrain?.size) return;
  const s = world.config.grid.cellSize;
  const byKind = new Map();
  for (const [key, kind] of world.terrain) {
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(key.split(",").map(Number));
  }
  c.save();
  applyCamera(c, camera);
  for (const [kind, cells] of byKind) {
    const same = (cx, cy) => world.terrain.get(`${cx},${cy}`) === kind;
    c.fillStyle = terrainStyle(colors, kind).fill;
    c.beginPath();
    const R = s * 0.5;
    const r = s * 0.32;
    for (const [cx, cy] of cells) {
      const o = cellCenter(world, { cx, cy });
      const x = o.x - s / 2;
      const y = o.y - s / 2;
      const up = same(cx, cy - 1);
      const down = same(cx, cy + 1);
      const left = same(cx - 1, cy);
      const right = same(cx + 1, cy);
      // Overlap a hair so neighbours join without seams.
      const e = 0.4;
      c.roundRect(x - e, y - e, s + 2 * e, s + 2 * e, [!up && !left ? R : 0, !up && !right ? R : 0, !down && !right ? R : 0, !down && !left ? R : 0]);
      c.closePath();
      // Fill inside corners: a neighbour on two sides but not on the diagonal.
      if (up && right && !same(cx + 1, cy - 1)) filletPath(c, x + s, y, 1, -1, r);
      if (up && left && !same(cx - 1, cy - 1)) filletPath(c, x, y, -1, -1, r);
      if (down && right && !same(cx + 1, cy + 1)) filletPath(c, x + s, y + s, 1, 1, r);
      if (down && left && !same(cx - 1, cy + 1)) filletPath(c, x, y + s, -1, 1, r);
    }
    c.fill();
  }
  c.restore();
}

/**
 * A concave fillet at corner (x, y): the little region inside the empty
 * diagonal cell, between its corner and a quarter circle of radius r.
 */
function filletPath(c, x, y, dx, dy, r) {
  c.moveTo(x, y);
  c.lineTo(x + dx * r, y);
  c.arc(x + dx * r, y + dy * r, r, dy > 0 ? -Math.PI / 2 : Math.PI / 2, dx > 0 ? Math.PI : 0, (dx > 0) === (dy > 0));
  c.lineTo(x, y);
  c.closePath();
}

/** A flash on the terrain square a drag just bumped into; fades over BLOCK_FLASH seconds. */
const BLOCK_FLASH = 0.6;
function drawBlockedCell(env, blocked) {
  const { ctx, world, camera, colors, now } = env;
  if (!blocked) return;
  const age = now - blocked.born;
  if (age < 0 || age > BLOCK_FLASH) return;
  const t = 1 - age / BLOCK_FLASH;
  const c = cellCenter(world, blocked);
  const p = worldToScreen(camera, c.x, c.y);
  const size = world.config.grid.cellSize * camera.scale;
  ctx.globalAlpha = t;
  ctx.fillStyle = colors.blockedFill;
  ctx.beginPath();
  ctx.roundRect(p.x - size / 2, p.y - size / 2, size, size, size * 0.3);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** A terrain kind's colours; a plain string in the theme is taken as just a fill. */
export function terrainStyle(colors, kind) {
  const t = colors.terrain?.[kind];
  if (!t) return { fill: colors.boundary };
  return typeof t === "string" ? { fill: t } : t;
}

/** Shade everything outside the open part of the map (world.view): the ground, a little deeper. */
function drawClosed(c, env, v) {
  const { view, camera, colors } = env;
  if (!v) return;
  const a = worldToScreen(camera, v.x, v.y);
  const b = worldToScreen(camera, v.x + v.width, v.y + v.height);
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  c.fillStyle = colors.closed;
  c.beginPath();
  c.rect(0, 0, view.width, view.height);
  // Cut out the open area, with soft rounded corners.
  c.roundRect(x0, y0, x1 - x0, y1 - y0, Math.min(18, (x1 - x0) / 4));
  c.fill("evenodd");
}

/** A faint dot in the middle of every open grid square (stronger while drawing). */
function drawGrid(c, env, shown) {
  const { world, camera, colors, k, ui } = env;
  const v = shown;
  const open = (x, y) => !v || (x >= v.x && y >= v.y && x <= v.x + v.width && y <= v.y + v.height);
  const { cols, rows } = gridSize(world);
  c.fillStyle = ui.drag ? colors.gridActive : colors.grid;
  const r = THEME.sizes.gridDot * k;
  c.beginPath();
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      if (world.terrain?.has(`${cx},${cy}`)) continue;
      const o = cellCenter(world, { cx, cy });
      if (!open(o.x, o.y)) continue;
      const p = worldToScreen(camera, o.x, o.y);
      c.moveTo(p.x + r, p.y);
      c.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
  }
  c.fill();
}

/** Carrier boundaries: soft bands of "security zone" colour; links that cross get rails. */
function drawBoundaries(c, env) {
  const { world, camera, colors } = env;
  const lines = world.map.boundaries ?? [];
  if (!lines.length) return;
  c.save();
  applyCamera(c, camera);
  c.strokeStyle = colors.boundary;
  c.lineWidth = world.config.grid.cellSize * 0.62;
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const line of lines) {
    c.beginPath();
    line.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  }
  c.restore();
}

// ---------------------------------------------------------------------------
// 3–4. Cables.

function cableWidth(env, link) {
  const { world, T } = env;
  if (link.backbone) return SIZE.backbone * T;
  const tiers = world.data.tiers;
  // T1 (the 1× tier) is the guide's cable width; others scale from it.
  const base = tiers.find((t) => t.width === 1)?.width ?? 1;
  return SIZE.cable * T * (tiers[link.tier]?.width ?? 1) / base;
}

/** Cables that carry the deeper (tier 4) shadow. */
const raised = (link) => link.backbone || link.leased;

/** How much of a link has snapped in (0–1): each tile segment over cableSnapMs, at most half a second. */
const firstSeen = new WeakMap();
function growth(env, link) {
  const { now } = env;
  if (!firstSeen.has(link)) firstSeen.set(link, now);
  const segments = Math.max(1, Math.round(link.length / env.world.config.grid.cellSize));
  const seconds = Math.min(0.5, (segments * MOTION.cableSnapMs) / 1000);
  return Math.min(1, (now - firstSeen.get(link)) / seconds);
}

function linkState(env, link) {
  const { ui, world } = env;
  return {
    faded: ui.reroute?.linkId === link.id,
    selected: ui.selectedLinkId === link.id,
    broken: Boolean(link.down || isBlocked(world, link)),
  };
}

/** The cables, drawn to a cached layer: shadows first (by depth tier), then the cables on top. */
function drawCableLayer(env) {
  const { world, camera, view, colors, ui } = env;
  let animating = false;
  const parts = [colors.theme, world.map?.id, view.width, view.height, view.dpr, camera.scale.toFixed(4), camera.offsetX.toFixed(1), camera.offsetY.toFixed(1), camera.rotated];
  for (const link of world.links) {
    const g = growth(env, link);
    if (g < 1) animating = true;
    const s = linkState(env, link);
    parts.push(`${link.id}:${link.tier}:${link.backbone ? 1 : 0}${link.leased ? 1 : 0}${link.firewall ? 1 : 0}${s.broken ? 1 : 0}${s.faded ? 1 : 0}${s.selected ? 1 : 0}:${link.length.toFixed(1)}:${link.path.length}`);
  }
  parts.push(ui.selectedLinkId ?? "");
  const key = animating ? `anim|${env.now}` : parts.join("|");
  cachedLayer(env, "cables", key, (c) => paintCables(c, env));
}

function paintCables(c, env) {
  const { world, camera, colors, k } = env;
  const shown = world.links.map((link) => {
    const g = growth(env, link);
    const path = g >= 1 ? link.path : partialPath(link.path, link.length * Math.max(0.05, g));
    return { link, pts: toScreenPath(camera, path), state: linkState(env, link) };
  });
  // Selection halo, under everything.
  for (const { link, pts, state } of shown) {
    if (!state.selected) continue;
    c.strokeStyle = colors.highlight;
    c.lineWidth = cableWidth(env, link) + 14 * k;
    strokePath(c, pts);
  }
  // Shadows: ordinary cables (tier 2), then backbones and leased lines (tier 4).
  shadowPass(env, c, 2, (sc) => {
    for (const { link, pts, state } of shown) {
      if (raised(link) || state.faded) continue;
      sc.lineWidth = cableWidth(env, link);
      strokePath(sc, pts);
    }
  });
  // Cables, lowest first so raised ones lie on top.
  for (const { link, pts, state } of shown) if (!raised(link)) drawCable(c, env, link, null, state.faded ? 0.3 : 1, pts, state);
  shadowPass(env, c, 4, (sc) => {
    for (const { link, pts, state } of shown) {
      if (!raised(link) || state.faded) continue;
      sc.lineWidth = cableWidth(env, link) + (link.leased && !link.backbone ? 2 * k : 0);
      strokePath(sc, pts);
    }
    for (const { link } of shown) if (link.firewall) firewallShape(sc, env, link);
  });
  for (const { link, pts, state } of shown) if (raised(link)) drawCable(c, env, link, null, state.faded ? 0.3 : 1, pts, state);
  for (const { link } of shown) if (link.firewall) {
    c.fillStyle = colors.backbone;
    firewallShape(c, env, link);
  }
}

/**
 * One cable. Plain links are the light cable colour; backbones are wider
 * and dark slate; leased lines (across a carrier boundary) get two thin
 * rails along their edges. A cut or blocked link fades and turns dashed.
 */
function drawCable(c, env, link, path, alpha = 1, pts = null, state = null) {
  const { camera, colors, k } = env;
  const p = pts ?? toScreenPath(camera, path ?? link.path);
  const st = state ?? linkState(env, link);
  const width = cableWidth(env, link);
  c.globalAlpha = alpha * (st.broken ? 0.55 : 1);
  if (st.broken) c.setLineDash([width * 1.1, width * 1.3]);
  if (link.backbone) {
    c.strokeStyle = colors.backbone;
    c.lineWidth = width;
    strokePath(c, p);
  } else if (link.leased) {
    const rail = Math.max(1.2, 1.4 * k);
    c.strokeStyle = colors.backbone;
    c.lineWidth = width + rail * 2;
    strokePath(c, p);
    c.strokeStyle = colors.cable;
    c.lineWidth = width;
    strokePath(c, p);
  } else {
    c.strokeStyle = colors.cable;
    c.lineWidth = width;
    strokePath(c, p);
  }
  c.setLineDash([]);
  c.globalAlpha = 1;
}

/** A firewall: a small flat gate across the cable, a third of the way along. */
function firewallShape(c, env, link) {
  const { camera, T } = env;
  const d = link.length * 0.3;
  const a = pointAlong(link.path, d - 2);
  const b = pointAlong(link.path, d + 2);
  const m = pointAlong(link.path, d);
  const sa = worldToScreen(camera, a.x, a.y);
  const sb = worldToScreen(camera, b.x, b.y);
  const sm = worldToScreen(camera, m.x, m.y);
  const angle = Math.atan2(sb.y - sa.y, sb.x - sa.x);
  const along = Math.max(5, 0.28 * T);
  const across = Math.max(cableWidth(env, link) + 6, 0.8 * T);
  c.save();
  c.translate(sm.x, sm.y);
  c.rotate(angle);
  c.beginPath();
  c.roundRect(-along / 2, -across / 2, along, across, along / 2);
  c.fill();
  c.restore();
}

/** The first `length` world units of a path. */
function partialPath(points, length) {
  const out = [points[0]];
  let left = length;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (left >= seg) {
      out.push(points[i]);
      left -= seg;
    } else {
      const t = seg === 0 ? 0 : left / seg;
      out.push({ x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t });
      break;
    }
  }
  return out;
}

/** The middle `length` world units of a path (a removed cable shrinking to its midpoint). */
function middlePath(points, total, length) {
  const start = (total - length) / 2;
  const out = [];
  let walked = 0;
  out.push(pointAlong(points, start));
  for (let i = 1; i < points.length; i++) {
    walked += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (walked > start && walked < start + length) out.push(points[i]);
  }
  out.push(pointAlong(points, start + length));
  return out;
}

/** Removed links shrink to their midpoints over cableRemoveMs. */
let lastLinks = { world: null, byId: new Map() };
const removing = [];
function drawRemovedLinks(env) {
  const { world, now, ctx } = env;
  if (lastLinks.world !== world) {
    lastLinks = { world, byId: new Map() };
    removing.length = 0;
  }
  const seen = new Map();
  for (const link of world.links) seen.set(link.id, link);
  for (const [id, link] of lastLinks.byId) if (!seen.has(id)) removing.push({ link, born: now });
  lastLinks.byId = seen;
  for (let i = removing.length - 1; i >= 0; i--) {
    const r = removing[i];
    const t = (now - r.born) / (MOTION.cableRemoveMs / 1000);
    if (t >= 1 || t < 0) {
      removing.splice(i, 1);
      continue;
    }
    const path = middlePath(r.link.path, r.link.length, r.link.length * (1 - t));
    drawCable(ctx, env, r.link, path, 1 - t * 0.5, null, { faded: false, selected: false, broken: false });
  }
}

function drawDropTarget(env, target) {
  const { ctx, world, camera, colors, k } = env;
  ctx.strokeStyle = colors.dropTarget;
  ctx.fillStyle = colors.dropTarget;
  if (target.kind === "link") {
    const link = world.linkById.get(target.id);
    if (!link) return;
    ctx.lineWidth = cableWidth(env, link) + 14 * k;
    strokePath(ctx, toScreenPath(camera, link.path));
  } else if (target.kind === "site") {
    const site = world.siteById.get(target.id);
    if (!site) return;
    const p = worldToScreen(camera, site.x, site.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, siteRadiusPx(world, site, camera) * 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (target.kind === "spot") {
    const p = worldToScreen(camera, target.x, target.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14 * k, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The link being drawn: its squares so far, and how many links it uses. */
function drawPreview(env, drag) {
  const { ctx, world, camera, colors, k, T } = env;
  const from = world.siteById.get(drag.fromSiteId);
  if (!from || !drag.pointerWorld || !drag.cells) return;
  const pts = toScreenPath(camera, cellsToPath(world, drag.cells));
  const width = SIZE.cable * T;
  if (pts.length > 1) {
    // A cable lifted off the map: a soft shadow, then the cable.
    ctx.globalAlpha = SHADOW.alpha[env.mode];
    ctx.strokeStyle = SHADOW.rgb[env.mode];
    ctx.lineWidth = width;
    ctx.save();
    ctx.translate(1.5, 4);
    strokePath(ctx, pts);
    ctx.restore();
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = colors.cable;
    strokePath(ctx, pts);
  }
  // A thin guide from the end of the path to the pointer.
  const end = pts.at(-1);
  const pointer = worldToScreen(camera, drag.pointerWorld.x, drag.pointerWorld.y);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = colors.preview;
  ctx.lineWidth = 2 * k;
  strokePath(ctx, [end, pointer]);
  ctx.globalAlpha = 1;
  // Squares used so far (the cells after the starting site).
  const used = drag.cells.length - 1;
  if (used > 0) {
    const r = 11 * k;
    const bx = end.x + 16 * k;
    const by = end.y - 16 * k;
    const over = drag.cells.length > world.inventory.links;
    ctx.fillStyle = over ? nodeColor("red", colors.theme) : colors.removeFill;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = over ? "#ffffff" : colors.removeText;
    ctx.font = `600 ${Math.round(11 * k)}px "DM Sans", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(used), bx, by + 0.5);
  }
}

function drawReroute(env, reroute) {
  const { ctx, world, camera, colors, T } = env;
  const link = world.linkById.get(reroute.linkId);
  if (!link || !reroute.pointerWorld) return;
  const a = world.siteById.get(link.a);
  const b = world.siteById.get(link.b);
  const p = cellOf(world, reroute.pointerWorld.x, reroute.pointerWorld.y);
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = colors.preview;
  ctx.lineWidth = SIZE.cable * T;
  strokePath(ctx, toScreenPath(camera, cellsToPath(world, straightCells(cellOf(world, a.x, a.y), p))));
  strokePath(ctx, toScreenPath(camera, cellsToPath(world, straightCells(p, cellOf(world, b.x, b.y)))));
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// 5–6. Sites.

/** A colour mixed toward white. */
const lighten = (c, t) => mixColor(c, "#ffffff", t);

/**
 * Draw one site from its sprite.
 *   workstation  a rounded square with a lighter "monitor" in its top half
 *                (two side by side once it has grown)
 *   server       a rounded rectangle with thin rack-unit stripes
 *   switch       a roundabout: a ring the width of a cable round an island
 *                of ground; a core router's ring is dark slate
 */
function drawSite(env, site) {
  const { ctx, world, camera, ui, colors, mode, view, P } = env;
  const { x, y } = worldToScreen(camera, site.x, site.y);
  // New sites pop in: scale 0 → 1.08 → 1 with an ease-out-back.
  const age = (world.time - site.born) / (MOTION.spawnMs / 1000);
  const grow = site.born === 0 || age >= 1 ? 1 : Math.max(0, easeOutBack(Math.max(0, age)));
  if (grow <= 0.01) return;
  const box = siteBox(world, site, camera);
  const color = siteColor(world, site, colors);
  const highlighted = ui.hoverSiteId === site.id || ui.drag?.fromSiteId === site.id || ui.reroute?.overSiteId === site.id || ui.selectedSiteId === site.id;
  if (highlighted) {
    ctx.fillStyle = colors.highlight;
    ctx.beginPath();
    ctx.arc(x, y, (Math.max(box.w, box.h) / 2 + 0.45 * P) * grow, 0, Math.PI * 2);
    ctx.fill();
  }
  let s;
  if (box.form === "switch") {
    // The island shows the ground (and hides the cables meeting under it).
    ctx.fillStyle = mixColor(colors.background, colors.nightBackground, Math.round(nightAmount(world) * 40) / 40 * colors.nightDepth);
    ctx.beginPath();
    ctx.arc(x, y, (box.w / 2) * grow, 0, Math.PI * 2);
    ctx.fill();
    const ring = Math.max(3, SIZE.cable * env.T * (site.core ? 1.5 : 1));
    s = sprite(`switch:${color}`, box.w, box.h, 3, mode, view.dpr, (c, w) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(0, 0, w / 2, 0, Math.PI * 2);
      c.arc(0, 0, Math.max(1, w / 2 - ring), 0, Math.PI * 2, true);
      c.fill("evenodd");
    });
  } else if (box.form === "server") {
    const stripes = box.h > box.w * 0.7 ? 3 : 2;
    s = sprite(`server:${color}:${stripes}`, box.w, box.h, 3, mode, view.dpr, (c, w, h, noShadow) => {
      c.fillStyle = color;
      c.beginPath();
      c.roundRect(-w / 2, -h / 2, w, h, box.radius);
      c.fill();
      noShadow();
      c.fillStyle = lighten(color, 0.18);
      const inset = w * 0.16;
      const gap = h / (stripes + 1);
      for (let i = 1; i <= stripes; i++) c.fillRect(-w / 2 + inset, -h / 2 + gap * i - 1, w - inset * 2, 2);
    });
  } else {
    const monitors = site.grown ? 2 : 1;
    s = sprite(`ws:${color}:${monitors}`, box.w, box.h, 2, mode, view.dpr, (c, w, h, noShadow) => {
      c.fillStyle = color;
      c.beginPath();
      c.roundRect(-w / 2, -h / 2, w, h, box.radius);
      c.fill();
      noShadow();
      c.fillStyle = lighten(color, 0.25);
      const top = -h / 2 + h * 0.18;
      const mh = h * 0.32;
      if (monitors === 1) {
        c.beginPath();
        c.roundRect(-w * 0.28, top, w * 0.56, mh, Math.min(2, mh / 3));
        c.fill();
      } else {
        for (const sx of [-1, 1]) {
          c.beginPath();
          c.roundRect(sx > 0 ? w * 0.04 : -w * 0.34, top, w * 0.3, mh, Math.min(2, mh / 3));
          c.fill();
        }
      }
    });
  }
  if (s) drawSprite(ctx, s, x, y, grow);
  if (box.form === "switch" && site.qos) drawQosLight(env, x + box.w * 0.42, y - box.h * 0.42);
  if (site.sdwan) {
    // An SD-WAN box: a small slate tab on the top-left corner.
    const d = Math.max(5, 0.22 * P);
    const bx = x - box.w / 2 + d * 0.1;
    const by = y - box.h / 2 - d * 0.55;
    ctx.fillStyle = SHADOW.color[mode];
    ctx.beginPath();
    ctx.roundRect(bx + 0.5, by + 1, d * 1.4, d, d / 2);
    ctx.fill();
    ctx.fillStyle = colors.backbone;
    ctx.beginPath();
    ctx.roundRect(bx, by, d * 1.4, d, d / 2);
    ctx.fill();
  }
}

/** A QoS policy: a small three-dot "traffic light" by the switch. */
function drawQosLight(env, x, y) {
  const { ctx, colors, mode, P } = env;
  const d = Math.max(3, 0.13 * P);
  const w = d * 1.9;
  const h = d * 4.6;
  ctx.fillStyle = SHADOW.color[mode];
  ctx.beginPath();
  ctx.roundRect(x - w / 2 + 0.5, y - h / 2 + 1, w, h, w / 2);
  ctx.fill();
  ctx.fillStyle = colors.backbone;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, w / 2);
  ctx.fill();
  ctx.fillStyle = colors.cable;
  for (const dy of [-1.35, 0, 1.35]) {
    ctx.beginPath();
    ctx.arc(x, y + dy * d, d * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// 7. Packets.

/** A pill centred on (x, y), turned to `angle`. */
function pill(ctx, x, y, w, h, angle) {
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  ctx.restore();
}

/** Pill length for a packet: bigger (more bandwidth) packets are a little longer. */
function packetSize(world, packet, P) {
  const t = world.data.traffic[packet.traffic];
  const f = Math.min(1.45, Math.max(0.85, 0.8 + 0.2 * (t?.size ?? 1)));
  return { w: SIZE.packet.w * P * f, h: SIZE.packet.h * P };
}

/** Draw packet pills with a cheap tier-1 shadow: all shadows first, then the pills. */
function drawPills(env, spots) {
  const { ctx, mode, world, colors } = env;
  const t = SHADOW.tier[1];
  ctx.fillStyle = SHADOW.color[mode];
  for (const s of spots) pill(ctx, s.x + t.x, s.y + t.y, s.w * s.scale, s.h * s.scale, s.angle);
  for (const s of spots) {
    ctx.fillStyle = trafficColor(world, s.packet.traffic, colors);
    pill(ctx, s.x, s.y, s.w * s.scale, s.h * s.scale, s.angle);
  }
}

function drawPackets(env) {
  const { world, camera } = env;
  const byId = new Map();
  for (const p of world.packets) byId.set(p.id, p);
  const spots = [];
  for (const site of world.sites) spots.push(...queuedPacketSpots(world, camera, site, byId));
  spots.push(...travellingPacketSpots(world, camera));
  drawPills(env, spots);
}

/** Where each travelling packet is drawn on screen: [{ packet, x, y, r, w, h, angle, scale }]. */
function travellingPacketSpots(world, camera) {
  const P = pieceTile(world, camera);
  const out = [];
  for (const packet of world.packets) {
    if (packet.linkId === null) continue;
    const link = world.linkById.get(packet.linkId);
    if (!link) continue;
    const dist = packet.dir === 0 ? packet.progress : link.length - packet.progress;
    const p = pointAlong(link.path, dist);
    const a = worldToScreen(camera, ...xy(pointAlong(link.path, dist - 1)));
    const b = worldToScreen(camera, ...xy(pointAlong(link.path, dist + 1)));
    const s = worldToScreen(camera, p.x, p.y);
    const { w, h } = packetSize(world, packet, P);
    out.push({ packet, x: s.x, y: s.y, r: w / 2, w, h, angle: Math.atan2(b.y - a.y, b.x - a.x), scale: 1 });
  }
  return out;
}

const xy = (p) => [p.x, p.y];

/**
 * Where a site's waiting packets are drawn: [{ packet, x, y, r, w, h, angle, scale }].
 * They park bumper to bumper (MOTION.queueGap apart) in rows beside the
 * site, at most three rows; at a switch they queue round the ring.
 */
function queuedPacketSpots(world, camera, site, byId) {
  if (site.queue.length === 0) return [];
  const P = pieceTile(world, camera);
  const { x, y } = worldToScreen(camera, site.x, site.y);
  const box = siteBox(world, site, camera);
  const gap = MOTION.queueGap * P;
  const out = [];
  if (box.form === "switch") {
    // Round the ring, like cars waiting on a roundabout.
    let ring = box.w / 2 + SIZE.packet.h * P * 0.9;
    let angle = -Math.PI / 2;
    for (const id of site.queue.slice(0, 40)) {
      const packet = byId.get(id);
      if (!packet) continue;
      const { w, h } = packetSize(world, packet, P);
      const step = (w + gap) / ring;
      if (angle + step > Math.PI * 1.5) {
        ring += h + gap * 2;
        angle = -Math.PI / 2;
      }
      const a = angle + step / 2;
      out.push({ packet, x: x + Math.cos(a) * ring, y: y + Math.sin(a) * ring, r: w / 2, w, h, angle: a + Math.PI / 2, scale: 1 });
      angle += step;
    }
    return out;
  }
  const perRow = 5;
  const rows = 3;
  const h = SIZE.packet.h * P;
  const startX = x + box.w / 2 + 0.28 * P;
  const top = y - ((Math.min(rows, Math.ceil(site.queue.length / perRow)) - 1) * (h + gap * 2)) / 2;
  let cx = startX;
  let row = 0;
  let inRow = 0;
  for (const id of site.queue.slice(0, perRow * rows)) {
    const packet = byId.get(id);
    if (!packet) continue;
    if (inRow === perRow) {
      row++;
      inRow = 0;
      cx = startX;
    }
    const { w } = packetSize(world, packet, P);
    out.push({ packet, x: cx + w / 2, y: top + row * (h + gap * 2), r: w / 2, w, h, angle: 0, scale: 1 });
    cx += w + gap;
    inRow++;
  }
  return out;
}

/**
 * The packet drawn nearest screen point p (travelling or waiting in a
 * queue), within `radius` px of its edge, or null. For tap-to-explain.
 */
export function packetAt(world, camera, p, radius) {
  const byId = new Map();
  for (const q of world.packets) byId.set(q.id, q);
  const spots = travellingPacketSpots(world, camera);
  for (const site of world.sites) spots.push(...queuedPacketSpots(world, camera, site, byId));
  let best = null;
  let bestD = Infinity;
  for (const s of spots) {
    const d = Math.hypot(s.x - p.x, s.y - p.y) - s.r;
    if (d <= radius && d < bestD) {
      best = s.packet;
      bestD = d;
    }
  }
  return best;
}

/** A delivered packet shrinks into the site it reached. */
function drawPops(env, pops) {
  if (!pops) return;
  const { world, P, now } = env;
  const spots = [];
  for (const pop of pops) {
    if (!pop.traffic) continue;
    const t = (now - pop.born) / (MOTION.deliverMs / 1000);
    if (t < 0 || t > 1) continue;
    const { w, h } = packetSize(world, { traffic: pop.traffic }, P);
    spots.push({ packet: { traffic: pop.traffic }, x: pop.x, y: pop.y, w, h, angle: 0, scale: 1 - t });
  }
  if (spots.length) drawPills(env, spots);
}

// ---------------------------------------------------------------------------
// 8. Ticket pins and ring timers.

/** When each of a site's pins appeared (real time), so new ones can pop in. */
const pinTimes = new WeakMap();

/**
 * Hunger as ticket pins: a tidy row of small circles above a district hub,
 * one per pip, each with a white dot in the middle. They pop in (scale
 * 0 → 1 with a small upward settle) as the hub waits for deliveries.
 */
function drawPins(env, site) {
  const { ctx, world, camera, colors, mode, P, now } = env;
  const def = world.data.sites[site.type];
  if (!def.hungry) return;
  const max = world.config.hunger.maxPips;
  const full = Math.min(max, Math.floor(site.hunger));
  let times = pinTimes.get(site);
  if (!times) pinTimes.set(site, (times = []));
  while (times.length < full) times.push(now);
  times.length = full;
  if (full === 0) return;
  const { x, y } = worldToScreen(camera, site.x, site.y);
  const box = siteBox(world, site, camera);
  const d = SIZE.pin * P;
  const gap = d * 0.35;
  const startX = x - ((full - 1) * (d + gap)) / 2;
  const py = y - box.h / 2 - d * 0.95;
  const color = ringColor(world, site, colors);
  const t1 = SHADOW.tier[1];
  for (let i = 0; i < full; i++) {
    const t = Math.min(1, (now - times[i]) / (MOTION.pinMs / 1000));
    const scale = t;
    const lift = (1 - t) * 2;
    const px = startX + i * (d + gap);
    const r = (d / 2) * scale;
    if (r <= 0.2) continue;
    ctx.fillStyle = SHADOW.color[mode];
    ctx.beginPath();
    ctx.arc(px + t1.x, py + lift + t1.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py + lift, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(px, py + lift, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The ring timer: fills clockwise from the top as the site stays
 * overloaded. From 75% full it pulses (opacity 60% ↔ 100%, once a second):
 * the only thing on the map that flashes.
 */
function drawRing(env, site) {
  const { ctx, world, camera, colors, P, now } = env;
  if (site.overload <= 0) return;
  const { x, y } = worldToScreen(camera, site.x, site.y);
  const box = siteBox(world, site, camera);
  const r = box.form === "switch" ? box.w / 2 + SIZE.ringGap * P : Math.hypot(box.w, box.h) / 2 + SIZE.ringGap * P;
  const fraction = Math.min(1, site.overload / world.config.overload.seconds);
  const width = SIZE.ringWidth * Math.max(1, P / 32);
  const color = ringColor(world, site, colors);
  ctx.lineWidth = width;
  ctx.strokeStyle = colors.ringTrack;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = fraction >= MOTION.slaPulseAt ? 0.8 + 0.2 * Math.sin(now * Math.PI * 2) : 1;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Where to put an arrow for a site that's off screen, or null if it's on
 * screen. The arrow sits on the edge of the visible area (the screen minus
 * the HUD `insets`), on the line from the centre towards the site.
 */
export function offscreenArrow(view, insets, p, margin) {
  const i = insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const left = i.left + margin;
  const right = view.width - i.right - margin;
  const top = i.top + margin;
  const bottom = view.height - i.bottom - margin;
  if (right <= left || bottom <= top) return null;
  if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) return null;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const t = Math.min(dx ? (dx > 0 ? right - cx : left - cx) / dx : Infinity, dy ? (dy > 0 ? bottom - cy : top - cy) / dy : Infinity);
  return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) };
}

/** Arrows at the screen edge pointing to off-screen sites whose ring is filling, in the site's colour. */
function drawOffscreenArrows(env, insets) {
  const { ctx, view, world, camera, colors, mode, k } = env;
  const size = 11 * k;
  for (const site of world.sites) {
    if (site.overload <= 0) continue;
    const p = worldToScreen(camera, site.x, site.y);
    const a = offscreenArrow(view, insets, p, size * 1.6);
    if (!a) continue;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle);
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.7, -size * 0.75);
      ctx.quadraticCurveTo(-size * 0.2, 0, -size * 0.7, size * 0.75);
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = SHADOW.color[mode];
    ctx.translate(1, 2);
    shape();
    ctx.translate(-1, -2);
    ctx.fillStyle = ringColor(world, site, colors);
    shape();
    ctx.restore();
  }
}

function drawRemoveButton(env, { x, y }) {
  const { ctx, camera, colors, mode } = env;
  const r = removeButtonRadius(camera);
  ctx.fillStyle = SHADOW.color[mode];
  ctx.beginPath();
  ctx.arc(x + 1, y + 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.removeFill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.removeText;
  ctx.lineWidth = 2.2;
  const d = r * 0.38;
  ctx.beginPath();
  ctx.moveTo(x - d, y - d);
  ctx.lineTo(x + d, y + d);
  ctx.moveTo(x + d, y - d);
  ctx.lineTo(x - d, y + d);
  ctx.stroke();
}
