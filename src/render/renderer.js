/**
 * Draws the world onto the canvas. Reads simulation state, never changes it.
 */
import { TERRAIN_TYPES } from "../../data/terrain.js";
import { THEME } from "../../data/theme.js";
import { pointAlong } from "../sim/geometry.js";
import { cellCenter, cellOf, cellsToPath, gridSize, straightCells } from "../sim/grid.js";
import { isBlocked } from "../sim/links.js";
import { worldToScreen } from "./camera.js";

/** Drawing sizes shrink a little on small screens and grow on big ones. */
export function uiScale(camera) {
  return Math.min(1.3, Math.max(0.8, camera.scale / 0.8));
}

export function siteRadiusPx(world, site, camera) {
  const def = world.data.sites[site.type];
  return THEME.sizes.siteRadius * def.size * uiScale(camera);
}

/** Screen position of the "remove" button for a selected link. */
export function removeButtonPos(world, link, camera) {
  const mid = pointAlong(link.path, link.length / 2);
  return worldToScreen(camera, mid.x, mid.y);
}

/** Screen position of the "remove" button for a selected switch. */
export function siteRemoveButtonPos(world, site, camera) {
  const p = worldToScreen(camera, site.x, site.y);
  const r = siteRadiusPx(world, site, camera);
  return { x: p.x + r + removeButtonRadius(camera) * 0.9, y: p.y - r - removeButtonRadius(camera) * 0.9 };
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

function mixColor(a, b, t) {
  if (t <= 0) return a;
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p, shift) => (p >> shift) & 255;
  const mix = (shift) => Math.round(ch(pa, shift) + (ch(pb, shift) - ch(pa, shift)) * t);
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

export function removeButtonRadius(camera) {
  return THEME.sizes.removeButton * uiScale(camera);
}

/**
 * @param {object} ui  { drag, reroute, selectedLinkId, hoverSiteId } from input.
 * @param {number} now Real time in seconds, for gentle animations.
 */
export function render(ctx, view, world, camera, ui, now = 0) {
  const colors = THEME[ui.theme] ?? THEME.light;
  const k = uiScale(camera);
  ctx.fillStyle = mixColor(colors.background, colors.nightBackground, nightAmount(world));
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  drawTerrain(ctx, world, camera, colors);
  drawBoundaries(ctx, world, camera, colors, k);
  // The shaded edge follows the camera's eased view, so it glides open too.
  drawClosed(ctx, view, world, camera, colors, ui.shownView);
  drawGrid(ctx, world, camera, colors, k, Boolean(ui.drag), ui.shownView);
  drawLinks(ctx, world, camera, colors, k, ui, now);
  if (ui.drag) drawPreview(ctx, world, camera, ui.drag, k);
  drawBlockedCell(ctx, world, camera, colors, ui.blockedCell, now);
  if (ui.reroute) drawReroute(ctx, world, camera, ui.reroute, k);
  if (ui.place?.target) drawDropTarget(ctx, world, camera, colors, ui.place.target, k);
  drawTravellingPackets(ctx, world, camera, k);
  drawPops(ctx, ui.pops, now, k);
  for (const site of world.sites) drawOverload(ctx, world, camera, colors, site, k, now);
  for (const site of world.sites) drawSite(ctx, world, camera, colors, site, ui, k);
  for (const site of world.sites) drawQueue(ctx, world, camera, site, k);
  drawOffscreenArrows(ctx, view, world, camera, colors, ui.insets, k, now);
  const selected = ui.selectedLinkId && world.linkById.get(ui.selectedLinkId);
  if (selected) drawRemoveButton(ctx, camera, colors, removeButtonPos(world, selected, camera));
  const selectedSite = ui.selectedSiteId && world.siteById.get(ui.selectedSiteId);
  if (selectedSite) drawRemoveButton(ctx, camera, colors, siteRemoveButtonPos(world, selectedSite, camera));
  if (world.over) {
    ctx.fillStyle = colors.dim;
    ctx.fillRect(0, 0, view.width, view.height);
    const site = world.siteById.get(world.over.siteId);
    if (site) {
      drawOverload(ctx, world, camera, colors, site, k, now);
      drawSite(ctx, world, camera, colors, site, ui, k);
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

/**
 * Terrain squares (terrain.js). Each kind is filled, textured with its own
 * faint pattern (waves, dots, hatching), and outlined where it meets anything else, so blocked
 * areas stand out from open ground in both themes.
 */
function drawTerrain(ctx, world, camera, colors) {
  if (!world.terrain?.size) return;
  const s = world.config.grid.cellSize;
  const size = s * camera.scale + 0.6; // a hair of overlap so squares join up
  const half = (s * camera.scale) / 2;
  const byKind = new Map();
  for (const [key, kind] of world.terrain) {
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(key);
  }
  for (const [kind, keys] of byKind) {
    const style = terrainStyle(colors, kind);
    const cells = keys.map((key) => {
      const [cx, cy] = key.split(",").map(Number);
      const c = cellCenter(world, { cx, cy });
      return { cx, cy, p: worldToScreen(camera, c.x, c.y) };
    });

    ctx.beginPath();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { p } of cells) {
      ctx.rect(p.x - size / 2, p.y - size / 2, size, size);
      minX = Math.min(minX, p.x - half);
      minY = Math.min(minY, p.y - half);
      maxX = Math.max(maxX, p.x + half);
      maxY = Math.max(maxY, p.y + half);
    }
    ctx.fillStyle = style.fill;
    ctx.fill();

    if (style.hatch) {
      ctx.save();
      ctx.clip();
      drawPattern(ctx, TERRAIN_TYPES[kind]?.pattern ?? "hatch", style.hatch, camera.scale * s, { minX, minY, maxX, maxY });
      ctx.restore();
    }

    if (style.edge) {
      // Trace the area's outline in world space (the camera may be turned
      // for a tall phone screen, so screen up isn't always grid up).
      const same = (cx, cy) => world.terrain.get(`${cx},${cy}`) === kind;
      const line = (x0, y0, x1, y1) => {
        const a = worldToScreen(camera, x0, y0);
        const b = worldToScreen(camera, x1, y1);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      };
      ctx.strokeStyle = style.edge;
      ctx.lineWidth = Math.max(1.5, 2 * camera.scale);
      ctx.beginPath();
      for (const { cx, cy } of cells) {
        const c = cellCenter(world, { cx, cy });
        const l = c.x - s / 2, r = c.x + s / 2, t = c.y - s / 2, b = c.y + s / 2;
        if (!same(cx, cy - 1)) line(l, t, r, t);
        if (!same(cx, cy + 1)) line(l, b, r, b);
        if (!same(cx - 1, cy)) line(l, t, l, b);
        if (!same(cx + 1, cy)) line(r, t, r, b);
      }
      ctx.stroke();
    }
  }
}

/**
 * A texture over a terrain area (already clipped to it). `cell` is a grid
 * square's size on screen, so the texture scales with the zoom.
 *   waves  short wavy lines (water)
 *   dots   a staggered grid of dots (parks)
 *   hatch  diagonal lines (hills)
 */
function drawPattern(ctx, pattern, color, cell, box) {
  const { minX, minY, maxX, maxY } = box;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, cell * 0.06);
  if (pattern === "dots") {
    const gap = Math.max(9, cell * 0.5);
    const r = Math.max(1.5, cell * 0.08);
    ctx.beginPath();
    for (let y = minY + gap / 2, row = 0; y < maxY; y += gap, row++) {
      for (let x = minX + (row % 2 ? gap : gap / 2); x < maxX; x += gap) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    return;
  }
  if (pattern === "waves") {
    const gap = Math.max(9, cell * 0.5);
    const len = Math.max(12, cell * 0.7);
    const amp = Math.max(1.5, cell * 0.08);
    ctx.beginPath();
    for (let y = minY + gap / 2, row = 0; y < maxY; y += gap, row++) {
      for (let x = minX - (row % 2 ? len / 2 : 0); x < maxX; x += len) {
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + len / 4, y - amp * 2, x + len / 2, y);
        ctx.quadraticCurveTo(x + (3 * len) / 4, y + amp * 2, x + len, y);
      }
    }
    ctx.stroke();
    return;
  }
  const gap = Math.max(8, cell * 0.45);
  const h = maxY - minY;
  ctx.beginPath();
  for (let x = minX - h; x < maxX; x += gap) {
    ctx.moveTo(x, maxY);
    ctx.lineTo(x + h, minY);
  }
  ctx.stroke();
}

/** A red flash on the terrain square a drag just bumped into; fades over BLOCK_FLASH seconds. */
const BLOCK_FLASH = 0.6;
function drawBlockedCell(ctx, world, camera, colors, blocked, now) {
  if (!blocked) return;
  const age = now - blocked.born;
  if (age < 0 || age > BLOCK_FLASH) return;
  const t = 1 - age / BLOCK_FLASH;
  const c = cellCenter(world, blocked);
  const p = worldToScreen(camera, c.x, c.y);
  const size = world.config.grid.cellSize * camera.scale;
  ctx.globalAlpha = t;
  ctx.fillStyle = colors.blockedFill;
  ctx.strokeStyle = colors.down;
  ctx.lineWidth = Math.max(1.5, 2.5 * camera.scale);
  ctx.beginPath();
  ctx.rect(p.x - size / 2, p.y - size / 2, size, size);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A terrain kind's colours; a plain string in the theme is taken as just a fill. */
export function terrainStyle(colors, kind) {
  const t = colors.terrain?.[kind];
  if (!t) return { fill: colors.boundary };
  return typeof t === "string" ? { fill: t } : t;
}

/** Shade everything outside the open part of the map (world.view). */
function drawClosed(ctx, view, world, camera, colors, shown) {
  const v = shown ?? world.view;
  if (!v) return;
  const a = worldToScreen(camera, v.x, v.y);
  const b = worldToScreen(camera, v.x + v.width, v.y + v.height);
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  ctx.fillStyle = colors.closed;
  ctx.fillRect(0, 0, view.width, y0);
  ctx.fillRect(0, y1, view.width, view.height - y1);
  ctx.fillRect(0, y0, x0, y1 - y0);
  ctx.fillRect(x1, y0, view.width - x1, y1 - y0);
  ctx.strokeStyle = colors.closedEdge;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.setLineDash([]);
}

/** A faint dot in the middle of every open grid square (stronger while drawing). */
function drawGrid(ctx, world, camera, colors, k, drawing, shown) {
  const v = shown ?? world.view;
  const open = (x, y) => !v || (x >= v.x && y >= v.y && x <= v.x + v.width && y <= v.y + v.height);
  const { cols, rows } = gridSize(world);
  ctx.fillStyle = drawing ? colors.gridActive : colors.grid;
  const r = THEME.sizes.gridDot * k;
  ctx.beginPath();
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      if (world.terrain?.has(`${cx},${cy}`)) continue;
      const c = cellCenter(world, { cx, cy });
      if (!open(c.x, c.y)) continue;
      const p = worldToScreen(camera, c.x, c.y);
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

function drawBoundaries(ctx, world, camera, colors, k) {
  ctx.strokeStyle = colors.boundary;
  ctx.lineWidth = THEME.sizes.boundaryWidth * k;
  for (const line of world.map.boundaries ?? []) {
    strokePath(ctx, toScreenPath(camera, line.map(([x, y]) => ({ x, y }))));
  }
}

function lineColor(line) {
  return THEME.lineColors[line % THEME.lineColors.length];
}

const firstSeen = new WeakMap();

/** Delivery "pops": a ring that grows and fades where a packet arrived. */
function drawPops(ctx, pops, now, k) {
  if (!pops) return;
  for (const pop of pops) {
    const t = (now - pop.born) / THEME.popSeconds;
    if (t < 0 || t > 1) continue;
    ctx.globalAlpha = 0.5 * (1 - t);
    ctx.strokeStyle = pop.color;
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.arc(pop.x, pop.y, (10 + 16 * t) * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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

function linkWidth(world, link, k) {
  return THEME.sizes.linkWidth * world.data.tiers[link.tier].width * k;
}

function drawLinks(ctx, world, camera, colors, k, ui, now) {
  for (const link of world.links) {
    // Animate in real time, so links drawn while paused still finish drawing.
    if (!firstSeen.has(link)) firstSeen.set(link, now);
    const grow = (now - firstSeen.get(link)) / THEME.linkAppearSeconds;
    const pts = toScreenPath(camera, grow >= 1 ? link.path : partialPath(link.path, link.length * Math.max(0.05, grow)));
    const width = linkWidth(world, link, k);
    const faded = ui.reroute?.linkId === link.id;
    const selected = ui.selectedLinkId === link.id;
    const blocked = isBlocked(world, link);
    if (selected) {
      ctx.strokeStyle = colors.highlight;
      ctx.lineWidth = width + 12 * k;
      strokePath(ctx, pts);
    }
    // A thin background-coloured outline keeps crossing lines readable.
    ctx.strokeStyle = colors.background;
    ctx.lineWidth = width + 3 * k;
    strokePath(ctx, pts);
    ctx.globalAlpha = faded ? 0.3 : link.down || blocked ? 0.45 : 1;
    ctx.strokeStyle = lineColor(link.line);
    ctx.lineWidth = width;
    if (link.down || blocked) ctx.setLineDash([width * 1.4, width * 1.2]);
    strokePath(ctx, pts);
    ctx.setLineDash([]);
    if (link.leased) {
      // Leased lines get a double-rail look.
      ctx.strokeStyle = colors.leasedStripe;
      ctx.lineWidth = Math.max(1.2, width * 0.28);
      strokePath(ctx, pts);
    }
    ctx.globalAlpha = 1;
    const mid = worldToScreen(camera, ...xy(pointAlong(link.path, link.length / 2)));
    if (link.firewall) {
      const p = worldToScreen(camera, ...xy(pointAlong(link.path, link.length * 0.3)));
      drawFirewall(ctx, colors, p.x, p.y, k);
    }
    if (link.down) drawBadge(ctx, mid.x, mid.y, 7 * k, colors.down, "×");
    else if (blocked) drawBadge(ctx, mid.x, mid.y, 7 * k, colors.blocked, "!");
  }
}

const xy = (p) => [p.x, p.y];

function drawBadge(ctx, x, y, r, fill, text) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(r * 1.5)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
}

/** A tiny brick wall. */
function drawFirewall(ctx, colors, x, y, k) {
  const w = 12 * k;
  const h = 9 * k;
  ctx.fillStyle = colors.firewall;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 2 * k);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.2 * k;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x + w / 2, y);
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x, y);
  ctx.moveTo(x - w / 4, y);
  ctx.lineTo(x - w / 4, y + h / 2);
  ctx.moveTo(x + w / 4, y);
  ctx.lineTo(x + w / 4, y + h / 2);
  ctx.stroke();
}

function drawDropTarget(ctx, world, camera, colors, target, k) {
  ctx.strokeStyle = colors.dropTarget;
  ctx.fillStyle = colors.dropTarget;
  if (target.kind === "link") {
    const link = world.linkById.get(target.id);
    if (!link) return;
    ctx.lineWidth = linkWidth(world, link, k) + 14 * k;
    strokePath(ctx, toScreenPath(camera, link.path));
  } else if (target.kind === "site") {
    const site = world.siteById.get(target.id);
    if (!site) return;
    const p = worldToScreen(camera, site.x, site.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, siteRadiusPx(world, site, camera) * 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (target.kind === "spot") {
    const p = worldToScreen(camera, target.x, target.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14 * k, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The link being drawn: its squares so far, and how many links it uses. */
function drawPreview(ctx, world, camera, drag, k) {
  const from = world.siteById.get(drag.fromSiteId);
  if (!from || !drag.pointerWorld || !drag.cells) return;
  const color = lineColor(drag.line);
  const pts = toScreenPath(camera, cellsToPath(world, drag.cells));
  ctx.strokeStyle = color;
  ctx.lineWidth = THEME.sizes.linkWidth * k;
  ctx.globalAlpha = 0.7;
  if (pts.length > 1) strokePath(ctx, pts);
  // A thin guide from the end of the path to the pointer.
  const end = pts.at(-1);
  const pointer = worldToScreen(camera, drag.pointerWorld.x, drag.pointerWorld.y);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2 * k;
  strokePath(ctx, [end, pointer]);
  ctx.globalAlpha = 1;
  // Squares used so far (the cells after the starting site).
  const used = drag.cells.length - 1;
  if (used > 0) {
    const r = 11 * k;
    const bx = end.x + 16 * k;
    const by = end.y - 16 * k;
    ctx.fillStyle = drag.cells.length > world.inventory.links ? "#e8483f" : color;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(11 * k)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(used), bx, by + 0.5);
  }
}

function drawReroute(ctx, world, camera, reroute, k) {
  const link = world.linkById.get(reroute.linkId);
  if (!link || !reroute.pointerWorld) return;
  const a = world.siteById.get(link.a);
  const b = world.siteById.get(link.b);
  const p = cellOf(world, reroute.pointerWorld.x, reroute.pointerWorld.y);
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = lineColor(link.line);
  ctx.lineWidth = THEME.sizes.linkWidth * k;
  strokePath(ctx, toScreenPath(camera, cellsToPath(world, straightCells(cellOf(world, a.x, a.y), p))));
  strokePath(ctx, toScreenPath(camera, cellsToPath(world, straightCells(p, cellOf(world, b.x, b.y)))));
  ctx.globalAlpha = 1;
}

function drawPacketShape(ctx, shape, x, y, r) {
  ctx.beginPath();
  switch (shape) {
    case "square":
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case "triangle":
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.1, y + r * 0.8);
      ctx.lineTo(x - r * 1.1, y + r * 0.8);
      ctx.closePath();
      break;
    case "diamond":
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r * 1.25, y);
      ctx.lineTo(x, y + r * 1.25);
      ctx.lineTo(x - r * 1.25, y);
      ctx.closePath();
      break;
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawTravellingPackets(ctx, world, camera, k) {
  for (const packet of world.packets) {
    if (packet.linkId === null) continue;
    const link = world.linkById.get(packet.linkId);
    const dist = packet.dir === 0 ? packet.progress : link.length - packet.progress;
    const p = pointAlong(link.path, dist);
    const s = worldToScreen(camera, p.x, p.y);
    const traffic = world.data.traffic[packet.traffic];
    ctx.fillStyle = traffic.color;
    drawPacketShape(ctx, traffic.shape, s.x, s.y, THEME.sizes.packetRadius * k * Math.sqrt(traffic.size));
  }
}

/** The ring timer: fills clockwise from the top as the site stays overloaded. */
function drawOverload(ctx, world, camera, colors, site, k, now) {
  if (site.overload <= 0) return;
  const { x, y } = worldToScreen(camera, site.x, site.y);
  const r = siteRadiusPx(world, site, camera) * 1.85;
  const fraction = Math.min(1, site.overload / world.config.overload.seconds);
  const almostFull = world.outages && fraction >= (world.config.overload.warnAt ?? 0.7);
  // A slow, soft breathing pulse; a little quicker as the timer fills, and
  // quick once the site is almost full.
  const pulse = 0.5 + 0.5 * Math.sin(now * (almostFull ? 9 : 2.2 + fraction * 2.5));
  if (almostFull) {
    // A soft red glow behind the ring, breathing with it.
    ctx.globalAlpha = 0.25 * pulse;
    ctx.fillStyle = colors.overload;
    ctx.beginPath();
    ctx.arc(x, y, r + THEME.sizes.overloadRing * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = THEME.sizes.overloadRing * k;
  ctx.strokeStyle = colors.overloadTrack;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.65 + 0.35 * pulse;
  ctx.strokeStyle = colors.overload;
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

/** Arrows at the screen edge pointing to off-screen sites whose ring is filling. */
function drawOffscreenArrows(ctx, view, world, camera, colors, insets, k, now) {
  const size = 11 * k;
  for (const site of world.sites) {
    if (site.overload <= 0) continue;
    const p = worldToScreen(camera, site.x, site.y);
    const a = offscreenArrow(view, insets, p, size * 1.6);
    if (!a) continue;
    const fraction = Math.min(1, site.overload / world.config.overload.seconds);
    const pulse = 0.5 + 0.5 * Math.sin(now * (3 + fraction * 6));
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle);
    ctx.globalAlpha = 0.75 + 0.25 * pulse;
    ctx.fillStyle = colors.overload;
    ctx.strokeStyle = colors.siteOutline;
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, -size * 0.75);
    ctx.lineTo(-size * 0.35, 0);
    ctx.lineTo(-size * 0.7, size * 0.75);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}

function drawSite(ctx, world, camera, colors, site, ui, k) {
  const def = world.data.sites[site.type];
  const { x, y } = worldToScreen(camera, site.x, site.y);
  // New sites grow in with a little overshoot.
  const age = (world.time - site.born) / THEME.siteAppearSeconds;
  const grow = site.born === 0 || age >= 1 ? 1 : easeOutBack(Math.max(0, age));
  const r = siteRadiusPx(world, site, camera) * grow;
  if (r <= 0.1) return;
  const highlighted =
    ui.hoverSiteId === site.id ||
    ui.drag?.fromSiteId === site.id ||
    ui.reroute?.overSiteId === site.id ||
    ui.selectedSiteId === site.id;
  if (site.jam > 0.02 && !site.core) {
    // A jammed switch glows amber, pulsing gently, so you can spot the bottleneck.
    const pulse = 0.75 + 0.25 * Math.sin(world.time * 5);
    ctx.save();
    ctx.globalAlpha = Math.min(1, site.jam) * pulse;
    ctx.fillStyle = colors.jam;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.firewall;
    ctx.lineWidth = 2.5 * k;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (highlighted) {
    ctx.fillStyle = colors.highlight;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  switch (def.shape) {
    case "hub": {
      const s = r * 1.05;
      ctx.roundRect(x - s, y - s, s * 2, s * 2, s * 0.35);
      break;
    }
    case "square":
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
      break;
    case "triangle":
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 1.1, y + r * 0.8);
      ctx.lineTo(x - r * 1.1, y + r * 0.8);
      ctx.closePath();
      break;
    case "edge":
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        ctx[i === 0 ? "moveTo" : "lineTo"](x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1);
      }
      ctx.closePath();
      break;
    case "cloud":
      ctx.arc(x - r * 0.45, y + r * 0.15, r * 0.55, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(x, y - r * 0.2, r * 0.65, Math.PI, Math.PI * 2);
      ctx.arc(x + r * 0.5, y + r * 0.15, r * 0.55, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();
      break;
    case "district": {
      // A rounded square with a notch of a roof: a hub for one kind of site.
      const s = r * 1.05;
      ctx.moveTo(x - s, y - s * 0.55);
      ctx.lineTo(x, y - s * 1.15);
      ctx.lineTo(x + s, y - s * 0.55);
      ctx.lineTo(x + s, y + s * 0.75);
      ctx.quadraticCurveTo(x + s, y + s, x + s * 0.75, y + s);
      ctx.lineTo(x - s * 0.75, y + s);
      ctx.quadraticCurveTo(x - s, y + s, x - s, y + s * 0.75);
      ctx.closePath();
      break;
    }
    case "switch": {
      const s = site.core ? r * 1.2 : r;
      ctx.roundRect(x - s, y - s, s * 2, s * 2, s * 0.45);
      break;
    }
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  // Coloured by type, with a white outline and a soft shadow behind it.
  ctx.lineJoin = "round";
  ctx.strokeStyle = colors.siteShadow;
  ctx.lineWidth = (THEME.sizes.siteStroke + 2) * k;
  ctx.stroke();
  ctx.fillStyle = site.core ? colors.core : def.color;
  ctx.fill();
  ctx.strokeStyle = colors.siteOutline;
  ctx.lineWidth = THEME.sizes.siteStroke * k;
  ctx.stroke();
  if (def.shape === "switch" && site.core) {
    // A core router: a ring of ports round a centre.
    ctx.fillStyle = colors.siteFill;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (def.shape === "switch") {
    // Four little ports.
    ctx.fillStyle = colors.siteFill;
    for (const dx of [-0.4, 0.4]) {
      for (const dy of [-0.4, 0.4]) {
        ctx.beginPath();
        ctx.arc(x + dx * r, y + dy * r, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (site.sdwan) {
    const bx = x - r * 1.05;
    const by = y - r * 1.05;
    ctx.fillStyle = colors.sdwan;
    ctx.beginPath();
    ctx.arc(bx, by, 4.5 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.siteFill;
    ctx.lineWidth = 1.5 * k;
    ctx.beginPath();
    ctx.arc(bx, by, 2 * k, Math.PI * 0.2, Math.PI * 1.6);
    ctx.stroke();
  }
  if ((def.shape === "hub" || def.shape === "edge" || def.shape === "district") && site.label) {
    ctx.fillStyle = colors.hubText;
    ctx.font = `600 ${Math.round(r * (def.shape === "district" ? 0.62 : 0.75))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(site.label, x, y + (def.shape === "district" ? r * 0.12 : 0.5));
  }
  if (site.qos) {
    // A QoS policy: a little badge with a "fast lane" chevron, top right.
    const s = site.core ? r * 1.2 : r;
    const bx = x + s * 1.05;
    const by = y - s * 1.05;
    ctx.fillStyle = colors.qos;
    ctx.beginPath();
    ctx.arc(bx, by, 5 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.siteFill;
    ctx.lineWidth = 1.6 * k;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bx - 1.8 * k, by - 2.4 * k);
    ctx.lineTo(bx + 1.4 * k, by);
    ctx.lineTo(bx - 1.8 * k, by + 2.4 * k);
    ctx.stroke();
    ctx.lineCap = "butt";
  }
}

function easeOutBack(t) {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

/** Waiting packets sit in a small grid to the right of their site. */
function drawQueue(ctx, world, camera, site, k) {
  if (site.queue.length === 0) return;
  const { x, y } = worldToScreen(camera, site.x, site.y);
  const r = siteRadiusPx(world, site, camera);
  const pr = THEME.sizes.packetRadius * k;
  const gap = pr * 2.6;
  const perRow = 6;
  // Show at most three rows; a long queue is already shouting via its ring.
  const shown = site.queue.slice(0, perRow * 3);
  const byId = new Map();
  for (const p of world.packets) byId.set(p.id, p);
  shown.forEach((id, i) => {
    const packet = byId.get(id);
    if (!packet) return;
    const traffic = world.data.traffic[packet.traffic];
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    ctx.fillStyle = traffic.color;
    drawPacketShape(ctx, traffic.shape, x + r + gap * 0.9 + col * gap, y - r * 0.6 + row * gap, pr);
  });
}

function drawRemoveButton(ctx, camera, colors, { x, y }) {
  const r = removeButtonRadius(camera);
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
