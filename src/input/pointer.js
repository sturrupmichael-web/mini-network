/**
 * Map input for mouse, pen and touch (via Pointer Events).
 *
 * - Draw: press on a site and drag. The link follows the pointer square by
 *   square across the grid (sim/grid.js); drag back over it to undo squares.
 *   Reaching another site completes the link there, and the stroke carries
 *   on from that site, so one stroke can chain A → B → C. Starting from the
 *   end of a line continues that line (same colour). Letting go anywhere
 *   but a site drops the unfinished part.
 * - Select: tap or click a link. A × button appears on it; tap that to
 *   remove the link (refunded). Right-click or Delete also removes.
 * - Reroute: press on a link and drag it onto another site: A–B becomes
 *   A–C–B.
 * - Equipment: drag an item from the tray onto its target (a link, a site,
 *   or empty map), or tap the item and then tap the target.
 * - Switches: tap a switch to select it; its × removes it.
 *
 * Fast swipes still work: the path steps one square at a time towards
 * wherever the pointer is now, so no squares are skipped.
 */
import { distanceToPolyline } from "../sim/geometry.js";
import { cellCenter, cellKey, cellOf, inGrid, inView, isTerrain, sameCell, siteCells, stepToward } from "../sim/grid.js";
import { screenToWorld, worldToScreen } from "../render/camera.js";
import { removeButtonPos, removeButtonRadius, siteRadiusPx, siteRemoveButtonPos } from "../render/renderer.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {() => object} opts.getWorld
 * @param {() => object} opts.getCamera
 * @param {object} opts.config       CONFIG.input
 * @param {object} opts.ui           Shared UI state the renderer reads.
 * @param {() => boolean} opts.canEdit  False while the game is over or a dialog is open.
 * @param {object} opts.actions      { connect(a, b, line, cells), remove(linkId), reroute(linkId, siteId),
 *                                    reshape(linkId, { x, y }),
 *                                    lineFor(siteId), removeSite(siteId), place(item, target) }
 * @param {object} opts.items        ITEMS from equipment.js (what each tray item targets).
 * @param {(reason: string) => void} [opts.onRefused]
 */
export function attachPointerInput(canvas, opts) {
  const { getWorld, getCamera, config, ui, canEdit, actions, onRefused, items } = opts;
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

  /** Is p on the × of the selected link or switch? Returns "link", "site" or null. */
  function onRemoveButton(p) {
    const world = getWorld();
    const camera = getCamera();
    const near = (c) => Math.hypot(c.x - p.x, c.y - p.y) <= removeButtonRadius(camera) + 6;
    const link = ui.selectedLinkId && world.linkById.get(ui.selectedLinkId);
    if (link && near(removeButtonPos(world, link, camera))) return "link";
    const site = ui.selectedSiteId && world.siteById.get(ui.selectedSiteId);
    if (site && near(siteRemoveButtonPos(world, site, camera))) return "site";
    return null;
  }

  function clearSelection() {
    ui.selectedLinkId = null;
    ui.selectedSiteId = null;
  }

  /** What a tray item would land on at screen point p, or null. */
  function dropTarget(item, p, touch) {
    const kind = items[item]?.target;
    const radius = touch ? config.touchDropRadius : config.mouseDropRadius;
    if (kind === "link") {
      const link = linkAt(p, radius);
      return link ? { kind: "link", id: link.id } : null;
    }
    if (kind === "site") {
      const site = siteAt(p, radius);
      return site ? { kind: "site", id: site.id } : null;
    }
    if (kind === "map") {
      if (siteAt(p, radius)) return null;
      const link = linkAt(p, radius);
      const w = screenToWorld(getCamera(), p.x, p.y);
      return link ? { kind: "link", id: link.id, x: w.x, y: w.y } : { kind: "spot", x: w.x, y: w.y };
    }
    return null;
  }

  function applyPlacement(item, target) {
    if (!target) return;
    const result = actions.place(item, target);
    if (!result.ok) refuse(result.reason);
  }

  /**
   * Called by the HUD when a tray item is pressed. Dragging it onto the
   * map drops it there; a tap arms it, and the next tap on the map uses it.
   */
  function startPlacement(item, e) {
    if (!canEdit() || !items[item]?.target) return;
    e.preventDefault();
    clearSelection();
    const touch = isTouch(e);
    const startX = e.clientX;
    const startY = e.clientY;
    ui.place = { item, target: null, pointerWorld: null, dragging: false };
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId || !ui.place) return;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > config.dragThreshold) ui.place.dragging = true;
      if (!ui.place.dragging) return;
      const p = local(ev);
      ui.place.pointerWorld = screenToWorld(getCamera(), p.x, p.y);
      ui.place.target = dropTarget(item, p, touch);
    };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const place = ui.place;
      ui.place = null;
      if (!place) return;
      if (!place.dragging) {
        // A tap: arm it (or disarm if it was already armed).
        ui.armed = ui.armed === item ? null : item;
        return;
      }
      ui.armed = null;
      if (ev.type === "pointerup" && canEdit()) applyPlacement(item, dropTarget(item, local(ev), touch));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /**
   * Grow the drag's path one square at a time towards cell `target`.
   * Backtracking over the path shortens it; reaching another site links to
   * it and starts a new path there.
   */
  function extendPath(drag, target) {
    const world = getWorld();
    const sites = siteCells(world);
    for (let guard = 0; guard < 400; guard++) {
      const lastCell = drag.cells.at(-1);
      if (sameCell(lastCell, target)) return;
      const next = stepToward(lastCell, target);
      if (!inGrid(world, next)) return;
      const centre = cellCenter(world, next);
      if (!inView(world, centre.x, centre.y)) return;
      if (isTerrain(world, next)) {
        // Flash the square that's in the way (renderer: drawBlockedCell).
        ui.blockedCell = { cx: next.cx, cy: next.cy, born: performance.now() / 1000 };
        if (!drag.refused) {
          drag.refused = true;
          refuse("terrain");
        }
        return;
      }
      const back = drag.cells.findIndex((c) => sameCell(c, next));
      if (back >= 0) {
        drag.cells.length = back + 1; // undo squares
        continue;
      }
      // Cut square corners into diagonals: a sideways step then an up/down
      // step (an L) becomes one diagonal step.
      if (drag.cells.length >= 2) {
        const before = drag.cells.at(-2);
        const last = drag.cells.at(-1);
        const straight = (p, q) => Math.abs(p.cx - q.cx) + Math.abs(p.cy - q.cy) === 1;
        if (straight(before, last) && straight(last, next) && Math.abs(before.cx - next.cx) === 1 && Math.abs(before.cy - next.cy) === 1) {
          drag.cells.pop();
        }
      }
      const site = sites.get(cellKey(next));
      if (site) {
        const result = actions.connect(drag.fromSiteId, site.id, drag.line, [...drag.cells, next]);
        if (result.ok || result.reason === "exists") {
          drag.fromSiteId = site.id;
          drag.cells = [next];
          drag.refused = false;
          continue;
        }
        if (!drag.refused) {
          drag.refused = true;
          refuse(result.reason);
        }
        return;
      }
      if (drag.cells.length > world.inventory.links) {
        // Adding `next` would make this link cost drag.cells.length.
        if (!drag.refused) {
          drag.refused = true;
          refuse("no-links");
        }
        return;
      }
      drag.cells.push(next);
    }
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

    if (ui.armed) {
      e.preventDefault();
      const item = ui.armed;
      ui.armed = null;
      const target = dropTarget(item, p, touch);
      if (target) applyPlacement(item, target);
      return;
    }

    const button = onRemoveButton(p);
    if (button) {
      e.preventDefault();
      if (button === "link") actions.remove(ui.selectedLinkId);
      else actions.removeSite(ui.selectedSiteId);
      clearSelection();
      return;
    }

    const site = siteAt(p, touch ? config.touchGrabRadius : config.mouseGrabRadius);
    if (site) {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      const wasSelected = ui.selectedSiteId === site.id;
      clearSelection();
      ui.drag = {
        startSiteId: site.id,
        start: p,
        moved: false,
        wasSelected,
        pointerId: e.pointerId,
        touch,
        fromSiteId: site.id,
        line: actions.lineFor(site.id),
        pointerWorld: screenToWorld(getCamera(), p.x, p.y),
        /** The squares drawn so far, from fromSiteId's square. */
        cells: [cellOf(getWorld(), site.x, site.y)],
        refused: false,
      };
      ui.hoverSiteId = null;
      return;
    }

    const link = linkAt(p, touch ? config.touchLinkRadius : config.mouseLinkRadius);
    if (link) {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      press = { pointerId: e.pointerId, linkId: link.id, start: p, touch };
      return;
    }

    clearSelection();
  }

  function onMove(e) {
    const p = local(e);
    if (press && e.pointerId === press.pointerId) {
      e.preventDefault();
      if (!ui.reroute && Math.hypot(p.x - press.start.x, p.y - press.start.y) > config.dragThreshold) {
        ui.reroute = { linkId: press.linkId, pointerWorld: null, overSiteId: null };
        clearSelection();
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
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > config.dragThreshold) drag.moved = true;
    const points = e.getCoalescedEvents?.().map(local) ?? [];
    if (points.length === 0) points.push(p);
    const radius = drag.touch ? config.touchConnectRadius : config.mouseConnectRadius;
    const world = getWorld();
    for (const q of points) {
      // Near a site counts as on it (fingers are big); otherwise the square under the pointer.
      const near = siteAt(q, radius);
      const w = screenToWorld(getCamera(), q.x, q.y);
      const target = near && near.id !== drag.fromSiteId ? cellOf(world, near.x, near.y) : cellOf(world, w.x, w.y);
      extendPath(drag, target);
    }
    drag.pointerWorld = screenToWorld(getCamera(), p.x, p.y);
  }

  function onUp(e) {
    if (press && e.pointerId === press.pointerId) {
      if (ui.reroute) {
        const target = ui.reroute.overSiteId;
        const spot = ui.reroute.pointerWorld;
        if (e.type === "pointerup" && canEdit()) {
          // Dropped on a site: run the link through it. Anywhere else: bend
          // the link's path through that square.
          const result = target !== null ? actions.reroute(press.linkId, target) : spot ? actions.reshape(press.linkId, spot) : null;
          if (result && !result.ok && result.reason !== "same-site") refuse(result.reason);
        }
        ui.reroute = null;
      } else if (e.type === "pointerup") {
        // A tap: toggle selection.
        const was = ui.selectedLinkId === press.linkId;
        clearSelection();
        ui.selectedLinkId = was ? null : press.linkId;
      }
      press = null;
      return;
    }
    if (!ui.drag || e.pointerId !== ui.drag.pointerId) return;
    const drag = ui.drag;
    ui.drag = null;
    // A tap on a switch selects it (tap again to deselect).
    const world = getWorld();
    const site = world.siteById.get(drag.startSiteId);
    if (e.type === "pointerup" && !drag.moved && site && world.data.sites[site.type].junction) {
      ui.selectedSiteId = drag.wasSelected ? null : site.id;
    }
  }

  function onContextMenu(e) {
    // Right-click a link to remove it. Always stop long-press menus.
    e.preventDefault();
    if (lastPointerType !== "mouse" || !canEdit()) return;
    const p = local(e);
    const site = siteAt(p, config.mouseGrabRadius);
    const world = getWorld();
    if (site && world.data.sites[site.type].junction) {
      actions.removeSite(site.id);
      clearSelection();
      return;
    }
    const link = linkAt(p, config.mouseLinkRadius);
    if (link) {
      actions.remove(link.id);
      clearSelection();
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
    startPlacement,
    /** Remove the selected link or switch (Delete key). */
    removeSelected() {
      if (!canEdit()) return;
      if (ui.selectedLinkId) actions.remove(ui.selectedLinkId);
      else if (ui.selectedSiteId) actions.removeSite(ui.selectedSiteId);
      clearSelection();
    },
    /** Drop any in-progress gesture (e.g. when a dialog opens). */
    cancel() {
      ui.drag = null;
      ui.reroute = null;
      ui.place = null;
      ui.armed = null;
      press = null;
    },
  };
}
