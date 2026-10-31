/**
 * Drag-to-draw links, for mouse, pen and touch (via Pointer Events).
 *
 * Press on a site and drag. Each site the pointer passes over is linked to
 * the previous one, so one stroke can chain A → B → C. Passing over an
 * existing link's far end just continues the chain from there.
 *
 * To make fast finger swipes reliable, every move is treated as a line
 * segment: any site the segment passes close to counts, in order, even if
 * no move event landed on it.
 */
import { screenToWorld, worldToScreen } from "../render/camera.js";
import { siteRadiusPx } from "../render/renderer.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {() => object} opts.getWorld
 * @param {() => object} opts.getCamera
 * @param {object} opts.config       CONFIG.input
 * @param {object} opts.ui           Shared UI state the renderer reads ({ drag, hoverSiteId }).
 * @param {(from: number, to: number, line: number) => {ok: boolean, reason?: string}} opts.connect
 * @param {() => number} opts.nextLine  Colour index for a new stroke.
 * @param {(reason: string) => void} [opts.onRefused]
 */
export function attachPointerInput(canvas, opts) {
  const { getWorld, getCamera, config, ui, connect, nextLine, onRefused } = opts;
  let last = null; // last pointer position (screen px) during a drag

  function local(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function isTouch(e) {
    return e.pointerType === "touch" || e.pointerType === "pen";
  }

  /** Nearest site whose centre is within `radius` px (or its own drawn size) of p. */
  function siteAt(p, radius) {
    const world = getWorld();
    const camera = getCamera();
    let best = null;
    let bestD = Infinity;
    for (const site of world.sites) {
      const s = worldToScreen(camera, site.x, site.y);
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      const reach = Math.max(radius, siteRadiusPx(world, site, camera) + 4);
      if (d <= reach && d < bestD) {
        best = site;
        bestD = d;
      }
    }
    return best;
  }

  /** Sites the segment p0→p1 passes within `radius` px of, in travel order. */
  function sitesAlong(p0, p1, radius) {
    const world = getWorld();
    const camera = getCamera();
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len2 = dx * dx + dy * dy;
    const hits = [];
    for (const site of world.sites) {
      const s = worldToScreen(camera, site.x, site.y);
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((s.x - p0.x) * dx + (s.y - p0.y) * dy) / len2));
      const d = Math.hypot(p0.x + dx * t - s.x, p0.y + dy * t - s.y);
      const reach = Math.max(radius, siteRadiusPx(world, site, camera));
      if (d <= reach) hits.push({ site, t });
    }
    hits.sort((a, b) => a.t - b.t || a.site.id - b.site.id);
    return hits.map((h) => h.site);
  }

  function onDown(e) {
    if (!e.isPrimary || ui.drag) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = local(e);
    const site = siteAt(p, isTouch(e) ? config.touchGrabRadius : config.mouseGrabRadius);
    if (!site) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    ui.drag = {
      pointerId: e.pointerId,
      touch: isTouch(e),
      fromSiteId: site.id,
      line: nextLine(),
      pointerWorld: screenToWorld(getCamera(), p.x, p.y),
      refused: false,
      added: 0,
    };
    ui.hoverSiteId = null;
    last = p;
  }

  function onMove(e) {
    const p = local(e);
    const drag = ui.drag;
    if (!drag) {
      if (e.pointerType === "mouse") {
        ui.hoverSiteId = siteAt(p, config.mouseGrabRadius)?.id ?? null;
        canvas.style.cursor = ui.hoverSiteId ? "pointer" : "default";
      }
      return;
    }
    if (e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const points = e.getCoalescedEvents?.().map(local) ?? [];
    if (points.length === 0) points.push(p);
    const radius = drag.touch ? config.touchConnectRadius : config.mouseConnectRadius;
    for (const q of points) {
      for (const site of sitesAlong(last, q, radius)) {
        if (site.id === drag.fromSiteId) continue;
        const result = connect(drag.fromSiteId, site.id, drag.line);
        if (result.ok || result.reason === "exists") {
          if (result.ok) drag.added++;
          drag.fromSiteId = site.id;
        } else if (!drag.refused) {
          drag.refused = true;
          onRefused?.(result.reason);
        }
      }
      last = q;
    }
    drag.pointerWorld = screenToWorld(getCamera(), p.x, p.y);
  }

  function onUp(e) {
    if (!ui.drag || e.pointerId !== ui.drag.pointerId) return;
    ui.drag = null;
    last = null;
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && !ui.drag) ui.hoverSiteId = null;
  });
  // Stop long-press menus and double-tap zoom getting in the way.
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}
