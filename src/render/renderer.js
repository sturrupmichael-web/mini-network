/**
 * Draws the world onto the canvas. Reads simulation state, never changes it.
 */
import { THEME } from "../../data/theme.js";
import { octilinearPath, pointAlong } from "../sim/geometry.js";
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

  drawBoundaries(ctx, world, camera, colors, k);
  drawLinks(ctx, world, camera, colors, k, ui, now);
  if (ui.drag) drawPreview(ctx, world, camera, ui.drag, k);
  if (ui.reroute) drawReroute(ctx, world, camera, ui.reroute, k);
  if (ui.place?.target) drawDropTarget(ctx, world, camera, colors, ui.place.target, k);
  drawTravellingPackets(ctx, world, camera, k);
  drawPops(ctx, ui.pops, now, k);
  for (const site of world.sites) drawOverload(ctx, world, camera, colors, site, k, now);
  for (const site of world.sites) drawSite(ctx, world, camera, colors, site, ui, k);
  for (const site of world.sites) drawQueue(ctx, world, camera, site, k);
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
    ui.hoverSiteId === site.id ||
    ui.drag?.fromSiteId === site.id ||
    ui.reroute?.overSiteId === site.id ||
    ui.selectedSiteId === site.id;
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
    case "switch":
      ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.45);
      break;
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = colors.siteFill;
  ctx.strokeStyle = colors.siteStroke;
  if (def.shape === "hub") {
    ctx.fillStyle = colors.hubFill;
    ctx.strokeStyle = colors.hubStroke;
  } else if (def.shape === "edge") {
    ctx.fillStyle = colors.edgeFill;
  } else if (def.shape === "switch") {
    ctx.fillStyle = colors.switchFill;
  } else if (def.shape === "cloud") {
    ctx.fillStyle = colors.cloudFill;
  }
  ctx.fill();
  ctx.stroke();
  if (def.shape === "switch") {
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
  if ((def.shape === "hub" || def.shape === "edge") && site.label) {
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
