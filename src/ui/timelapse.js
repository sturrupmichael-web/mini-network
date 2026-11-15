/**
 * The game-over timelapse: the network growing day by day, drawn small on
 * a canvas in the game-over card, plus a "Save image" of the final frame.
 */
import { THEME } from "../../data/theme.js";

const FRAME_SECONDS = 0.45;
const HOLD_SECONDS = 2;

/**
 * Start playing `frames` (world.history) on `canvas`. Returns stop().
 * @param {HTMLCanvasElement} canvas
 * @param {object[]} frames
 * @param {object} siteTypes  SITE_TYPES (for colours and sizes)
 * @param {{ link?: { a: number, b: number } | null, siteId?: number }} [marks]
 *   The busiest link (outlined whenever it's there) and the site that
 *   ended the run (ringed on the last frame).
 */
export function playTimelapse(canvas, frames, siteTypes, marks = {}) {
  let raf = 0;
  if (frames.length === 0) return () => {};
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();
  const total = frames.length * FRAME_SECONDS + HOLD_SECONDS;
  const tick = (now) => {
    // rAF's timestamp is when the frame began, which can be a moment before `start`.
    const t = (Math.max(0, now - start) / 1000) % total;
    const index = reduced ? frames.length - 1 : Math.min(frames.length - 1, Math.floor(t / FRAME_SECONDS));
    drawFrame(canvas, frames, index, siteTypes, marks);
    if (!reduced) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** The bounding box of everything in every frame, with some padding. */
function bounds(frames) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of frames) {
    for (const s of f.sites) {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x);
      maxY = Math.max(maxY, s.y);
    }
  }
  const pad = 40;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

/** Draw frame `index` to fill the canvas (also used for the saved image). */
export function drawFrame(canvas, frames, index, siteTypes, marks = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 180;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const style = getComputedStyle(canvas);
  ctx.fillStyle = style.getPropertyValue("--bg").trim() || "#f6f4ef";
  ctx.fillRect(0, 0, cssW, cssH);

  const box = bounds(frames);
  // Keep a strip at the top for the day counter.
  const top = 22;
  const scale = Math.min(cssW / box.w, (cssH - top) / box.h);
  const ox = (cssW - box.w * scale) / 2 - box.x * scale;
  const oy = top + (cssH - top - box.h * scale) / 2 - box.y * scale;
  const k = Math.max(0.45, Math.min(1, scale * 1.6));
  const frame = frames[index];

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const ink = style.getPropertyValue("--ink").trim() || "#2b2b2b";
  const busiest = marks.link && frame.links.find((l) => (l.a === marks.link.a && l.b === marks.link.b) || (l.a === marks.link.b && l.b === marks.link.a));
  if (busiest) {
    // A soft halo under the busiest link.
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = ink;
    ctx.lineWidth = (busiest.backbone ? 5 : 3.2) * k + 7;
    ctx.beginPath();
    busiest.path.forEach((p, i) => ctx[i === 0 ? "moveTo" : "lineTo"](ox + p.x * scale, oy + p.y * scale));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const link of frame.links) {
    ctx.strokeStyle = THEME.lineColors[link.line % THEME.lineColors.length];
    ctx.lineWidth = (link.backbone ? 5 : 3.2) * k;
    ctx.beginPath();
    link.path.forEach((p, i) => ctx[i === 0 ? "moveTo" : "lineTo"](ox + p.x * scale, oy + p.y * scale));
    ctx.stroke();
  }
  for (const s of frame.sites) {
    const def = siteTypes[s.type];
    const r = 5.5 * def.size * (s.grown ? 1.3 : 1) * k;
    ctx.beginPath();
    if (def.shape === "circle") ctx.arc(ox + s.x * scale, oy + s.y * scale, r, 0, Math.PI * 2);
    else ctx.roundRect(ox + s.x * scale - r, oy + s.y * scale - r, r * 2, r * 2, r * 0.3);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5 * k;
    ctx.stroke();
  }
  const ended = index === frames.length - 1 && marks.siteId !== undefined && frame.sites.find((s) => s.id === marks.siteId);
  if (ended) {
    const def = siteTypes[ended.type];
    const r = 5.5 * def.size * (ended.grown ? 1.3 : 1) * k;
    ctx.beginPath();
    ctx.arc(ox + ended.x * scale, oy + ended.y * scale, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = THEME.light.overload;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
  // Day counter in the corner.
  ctx.fillStyle = style.getPropertyValue("--muted").trim() || "#888";
  ctx.font = `600 11px ${style.getPropertyValue("--font").trim() || "system-ui, sans-serif"}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Day ${frame.day + 1}`, 8, 8);
}

/** Download the final frame as a PNG. */
export function saveImage(canvas, frames, siteTypes, marks = {}, filename = "nano-networks.png") {
  drawFrame(canvas, frames, frames.length - 1, siteTypes, marks);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}
