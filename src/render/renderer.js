/**
 * Draws the world onto the canvas. Reads simulation state, never changes it.
 */
import { THEME } from "../../data/theme.js";
import { octilinearPath, pointAlong } from "../sim/geometry.js";
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

export function removeButtonRadius(camera) {
  return THEME.sizes.removeButton * uiScale(camera);
}

/**
 * @param {object} ui  { drag, reroute, selectedLinkId, hoverSiteId } from input.
 * @param {number} now Real time in seconds, for gentle animations.
 */
export function render(ctx, view, world, camera, ui, now = 0) {
  const colors = THEME.light;
  const k = uiScale(camera);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  drawBoundaries(ctx, world, camera, colors, k);
  drawLinks(ctx, world, camera, colors, k, ui);
  if (ui.drag) drawPreview(ctx, world, camera, ui.drag, k);
  if (ui.reroute) drawReroute(ctx, world, camera, ui.reroute, k);
  drawTravellingPackets(ctx, world, camera, k);
  for (const site of world.sites) drawOverload(ctx, world, camera, colors, site, k, now);
  for (const site of world.sites) drawSite(ctx, world, camera, colors, site, ui, k);
  for (const site of world.sites) drawQueue(ctx, world, camera, site, k);
  const selected = ui.selectedLinkId && world.linkById.get(ui.selectedLinkId);
  if (selected) drawRemoveButton(ctx, world, camera, colors, selected);
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

function drawLinks(ctx, world, camera, colors, k, ui) {
  for (const link of world.links) {
    const pts = toScreenPath(camera, link.path);
    const faded = ui.reroute?.linkId === link.id;
    const selected = ui.selectedLinkId === link.id;
    if (selected) {
      ctx.strokeStyle = colors.highlight;
      ctx.lineWidth = (THEME.sizes.linkWidth + 12) * k;
      strokePath(ctx, pts);
    }
    // A thin background-coloured outline keeps crossing lines readable.
    ctx.strokeStyle = colors.background;
    ctx.lineWidth = (THEME.sizes.linkWidth + 3) * k;
    strokePath(ctx, pts);
    ctx.globalAlpha = faded ? 0.3 : 1;
    ctx.strokeStyle = lineColor(link.line);
    ctx.lineWidth = THEME.sizes.linkWidth * k;
    strokePath(ctx, pts);
    ctx.globalAlpha = 1;
  }
}

function drawPreview(ctx, world, camera, drag, k) {
  const from = world.siteById.get(drag.fromSiteId);
  if (!from || !drag.pointerWorld) return;
  const pts = toScreenPath(camera, octilinearPath(from, drag.pointerWorld));
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = lineColor(drag.line);
  ctx.lineWidth = THEME.sizes.linkWidth * k;
  strokePath(ctx, pts);
  ctx.globalAlpha = 1;
}

function drawReroute(ctx, world, camera, reroute, k) {
  const link = world.linkById.get(reroute.linkId);
  if (!link || !reroute.pointerWorld) return;
  const a = world.siteById.get(link.a);
  const b = world.siteById.get(link.b);
  const p = reroute.pointerWorld;
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = lineColor(link.line);
  ctx.lineWidth = THEME.sizes.linkWidth * k;
  strokePath(ctx, toScreenPath(camera, octilinearPath(a, p)));
  strokePath(ctx, toScreenPath(camera, octilinearPath(p, b)));
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
  // A slow, soft breathing pulse; a little quicker as the timer fills.
  const pulse = 0.5 + 0.5 * Math.sin(now * (2.2 + fraction * 2.5));
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

function drawSite(ctx, world, camera, colors, site, ui, k) {
  const def = world.data.sites[site.type];
  const { x, y } = worldToScreen(camera, site.x, site.y);
  // New sites grow in with a little overshoot.
  const age = (world.time - site.born) / THEME.siteAppearSeconds;
  const grow = site.born === 0 || age >= 1 ? 1 : easeOutBack(Math.max(0, age));
  const r = siteRadiusPx(world, site, camera) * grow;
  if (r <= 0.1) return;
  const highlighted =
    ui.hoverSiteId === site.id || ui.drag?.fromSiteId === site.id || ui.reroute?.overSiteId === site.id;
  if (highlighted) {
    ctx.fillStyle = colors.highlight;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = THEME.sizes.siteStroke * k;
  ctx.beginPath();
  switch (def.shape) {
    case "hub": {
      const s = r * 1.05;
      ctx.roundRect(x - s, y - s, s * 2, s * 2, s * 0.35);
      ctx.fillStyle = colors.hubFill;
      ctx.strokeStyle = colors.hubStroke;
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
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  if (def.shape !== "hub") {
    ctx.fillStyle = colors.siteFill;
    ctx.strokeStyle = colors.siteStroke;
  }
  ctx.fill();
  ctx.stroke();
  if (def.shape === "hub" && site.label) {
    ctx.fillStyle = colors.hubText;
    ctx.font = `600 ${Math.round(r * 0.75)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(site.label, x, y + 0.5);
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

function drawRemoveButton(ctx, world, camera, colors, link) {
  const { x, y } = removeButtonPos(world, link, camera);
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
