/**
 * Map input for mouse, pen and touch (via Pointer Events).
 *
 * - Draw: press on a site and drag. Each site the pointer passes over is
 *   linked to the previous one, so one stroke can chain A → B → C. Starting
 *   from the end of a line continues that line (same colour).
 * - Select: tap or click a link. A × button appears on it; tap that to
 *   remove the link (refunded). Right-click or Delete also removes.
 * - Reroute: press on a link and drag it onto another site: A–B becomes
 *   A–C–B.
 *
 * To make fast finger swipes reliable, every move is treated as a line
 * segment: any site the segment passes close to counts, in order, even if
 * no move event landed on it.
 */
import { distanceToPolyline } from "../sim/geometry.js";
import { screenToWorld, worldToScreen } from "../render/camera.js";
import { removeButtonPos, removeButtonRadius, siteRadiusPx } from "../render/renderer.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {() => object} opts.getWorld
 * @param {() => object} opts.getCamera
 * @param {object} opts.config       CONFIG.input
 * @param {object} opts.ui           Shared UI state the renderer reads.
 * @param {() => boolean} opts.canEdit  False while the game is over or a dialog is open.
 * @param {object} opts.actions      { connect(a, b, line), remove(linkId), reroute(linkId, siteId), lineFor(siteId) }
 * @param {(reason: string) => void} [opts.onRefused]
 */
export function attachPointerInput(canvas, opts) {
  const { getWorld, getCamera, config, ui, canEdit, actions, onRefused } = opts;
  let last = null; // last pointer position (screen px) during a drawing drag
  let press = null; // a press on a link: { pointerId, linkId, start, touch }
  let lastPointerType = "mouse"; // contextmenu isn't a PointerEvent everywhere

  function local(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const isTouch = (e) => e.pointerType === "touch" || e.pointerType === "pen";

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

  /** Nearest link within `radius` px of p. */
  function linkAt(p, radius) {
    const world = getWorld();
    const camera = getCamera();
    let best = null;
    let bestD = Infinity;
    for (const link of world.links) {
      const pts = link.path.map((q) => worldToScreen(camera, q.x, q.y));
      const d = distanceToPolyline(p, pts);
      if (d <= radius && d < bestD) {
        best = link;
        bestD = d;
      }
    }
    return best;
  }

  function onRemoveButton(p) {
    const world = getWorld();
    const link = ui.selectedLinkId && world.linkById.get(ui.selectedLinkId);
    if (!link) return false;
    const camera = getCamera();
    const c = removeButtonPos(world, link, camera);
    return Math.hypot(c.x - p.x, c.y - p.y) <= removeButtonRadius(camera) + 6;
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

  function refuse(reason) {
    onRefused?.(reason);
  }

  function onDown(e) {
    lastPointerType = e.pointerType;
    if (!e.isPrimary || ui.drag || press) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!canEdit()) return;
    const p = local(e);
    const touch = isTouch(e);

    if (onRemoveButton(p)) {
      e.preventDefault();
      actions.remove(ui.selectedLinkId);
      ui.selectedLinkId = null;
      return;
    }

    const site = siteAt(p, touch ? config.touchGrabRadius : config.mouseGrabRadius);
    if (site) {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      ui.selectedLinkId = null;
      ui.drag = {
        pointerId: e.pointerId,
        touch,
        fromSiteId: site.id,
        line: actions.lineFor(site.id),
        pointerWorld: screenToWorld(getCamera(), p.x, p.y),
        refused: false,
      };
      ui.hoverSiteId = null;
      last = p;
      return;
    }

    const link = linkAt(p, touch ? config.touchLinkRadius : config.mouseLinkRadius);
    if (link) {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      press = { pointerId: e.pointerId, linkId: link.id, start: p, touch };
      return;
    }

    ui.selectedLinkId = null;
  }

  function onMove(e) {
    const p = local(e);
    if (press && e.pointerId === press.pointerId) {
      e.preventDefault();
      if (!ui.reroute && Math.hypot(p.x - press.start.x, p.y - press.start.y) > config.dragThreshold) {
        ui.reroute = { linkId: press.linkId, pointerWorld: null, overSiteId: null };
        ui.selectedLinkId = null;
      }
      if (ui.reroute) {
        ui.reroute.pointerWorld = screenToWorld(getCamera(), p.x, p.y);
        const over = siteAt(p, press.touch ? config.touchConnectRadius : config.mouseConnectRadius);
        ui.reroute.overSiteId = over?.id ?? null;
      }
      return;
    }

    const drag = ui.drag;
    if (!drag) {
      if (e.pointerType === "mouse") {
        const over = siteAt(p, config.mouseGrabRadius);
        ui.hoverSiteId = over?.id ?? null;
        const pointer = over || onRemoveButton(p) || linkAt(p, config.mouseLinkRadius);
        canvas.style.cursor = pointer ? "pointer" : "default";
      }
      return;
    }
    if (e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    if (!canEdit()) {
      ui.drag = null;
      return;
    }
    const points = e.getCoalescedEvents?.().map(local) ?? [];
    if (points.length === 0) points.push(p);
    const radius = drag.touch ? config.touchConnectRadius : config.mouseConnectRadius;
    for (const q of points) {
      for (const site of sitesAlong(last, q, radius)) {
        if (site.id === drag.fromSiteId) continue;
        const result = actions.connect(drag.fromSiteId, site.id, drag.line);
        if (result.ok || result.reason === "exists") {
          drag.fromSiteId = site.id;
        } else if (!drag.refused) {
          drag.refused = true;
          refuse(result.reason);
        }
      }
      last = q;
    }
    drag.pointerWorld = screenToWorld(getCamera(), p.x, p.y);
  }

  function onUp(e) {
    if (press && e.pointerId === press.pointerId) {
      if (ui.reroute) {
        const target = ui.reroute.overSiteId;
        if (target !== null && e.type === "pointerup" && canEdit()) {
          const result = actions.reroute(press.linkId, target);
          if (!result.ok && result.reason !== "same-site") refuse(result.reason);
        }
        ui.reroute = null;
      } else if (e.type === "pointerup") {
        // A tap: toggle selection.
        ui.selectedLinkId = ui.selectedLinkId === press.linkId ? null : press.linkId;
      }
      press = null;
      return;
    }
    if (!ui.drag || e.pointerId !== ui.drag.pointerId) return;
    ui.drag = null;
    last = null;
  }

  function onContextMenu(e) {
    // Right-click a link to remove it. Always stop long-press menus.
    e.preventDefault();
    if (lastPointerType !== "mouse" || !canEdit()) return;
    const link = linkAt(local(e), config.mouseLinkRadius);
    if (link) {
      actions.remove(link.id);
      if (ui.selectedLinkId === link.id) ui.selectedLinkId = null;
    }
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && !ui.drag) ui.hoverSiteId = null;
  });
  canvas.addEventListener("contextmenu", onContextMenu);

  return {
    /** Remove the selected link (Delete key). */
    removeSelected() {
      if (ui.selectedLinkId && canEdit()) {
        actions.remove(ui.selectedLinkId);
        ui.selectedLinkId = null;
      }
    },
    /** Drop any in-progress gesture (e.g. when a dialog opens). */
    cancel() {
      ui.drag = null;
      ui.reroute = null;
      press = null;
      last = null;
    },
  };
}
