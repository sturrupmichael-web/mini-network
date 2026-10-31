/**
 * The open part of the map. A game starts zoomed in on a patch around the
 * data center; every new site opens up more of the map (and the camera
 * zooms out to match) until the whole map is in play. New sites, links and
 * switches all stay inside this area.
 *
 * world.view is { x, y, width, height } in world units. It only grows.
 */
import { hubSite } from "./sites.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Recompute world.view from how many sites have been added. */
export function updateView(world) {
  const { map } = world;
  const g = world.config.growth;
  const frac = Math.min(1, g.viewStart + g.viewPerSite * world.stats.sitesAdded);
  const width = map.width * frac;
  const height = map.height * frac;
  const centre = hubSite(world) ?? { x: map.width / 2, y: map.height / 2 };
  let x0 = clamp(centre.x - width / 2, 0, map.width - width);
  let y0 = clamp(centre.y - height / 2, 0, map.height - height);
  let x1 = x0 + width;
  let y1 = y0 + height;
  // Always show every site, with room around it...
  const pad = g.viewPadding;
  for (const s of world.sites) {
    x0 = Math.min(x0, s.x - pad);
    y0 = Math.min(y0, s.y - pad);
    x1 = Math.max(x1, s.x + pad);
    y1 = Math.max(y1, s.y + pad);
  }
  // ...and never shrink.
  const old = world.view;
  if (old) {
    x0 = Math.min(x0, old.x);
    y0 = Math.min(y0, old.y);
    x1 = Math.max(x1, old.x + old.width);
    y1 = Math.max(y1, old.y + old.height);
  }
  x0 = clamp(x0, 0, map.width);
  y0 = clamp(y0, 0, map.height);
  x1 = clamp(x1, 0, map.width);
  y1 = clamp(y1, 0, map.height);
  world.view = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  world.viewSites = world.sites.length;
}
