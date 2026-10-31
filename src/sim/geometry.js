/**
 * Metro-map geometry: links are drawn with 0°/45°/90° segments only.
 * Pure math, shared by the simulation (path lengths) and the renderer.
 */

/**
 * The octilinear path from a to b: one straight (horizontal or vertical)
 * run, then one 45° diagonal. Returns an array of {x, y} points (2 or 3).
 */
export function octilinearPath(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const eps = 1e-9;
  if (adx < eps || ady < eps || Math.abs(adx - ady) < eps) {
    return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  }
  const corner =
    adx > ady
      ? { x: a.x + sx * (adx - ady), y: a.y }
      : { x: a.x, y: a.y + sy * (ady - adx) };
  return [{ x: a.x, y: a.y }, corner, { x: b.x, y: b.y }];
}

/** Total length of a polyline. */
export function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** The point `dist` along a polyline (clamped to its ends). */
export function pointAlong(points, dist) {
  let remaining = Math.max(0, dist);
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    const seg = Math.hypot(q.x - p.x, q.y - p.y);
    if (remaining <= seg || i === points.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, remaining / seg);
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    }
    remaining -= seg;
  }
  return { x: points[0].x, y: points[0].y };
}

/** Shortest distance from point p to the segment a–b. */
export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
}

/** Shortest distance from point p to a polyline. */
export function distanceToPolyline(p, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(p, points[i - 1], points[i]));
  return best;
}

/** Do segments p1–p2 and p3–p4 cross (touching counts)? */
export function segmentsIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (a, b, c) =>
    Math.min(a.x, b.x) - 1e-9 <= c.x && c.x <= Math.max(a.x, b.x) + 1e-9 && Math.min(a.y, b.y) - 1e-9 <= c.y && c.y <= Math.max(a.y, b.y) + 1e-9;
  return (
    (d1 === 0 && on(p3, p4, p1)) || (d2 === 0 && on(p3, p4, p2)) || (d3 === 0 && on(p1, p2, p3)) || (d4 === 0 && on(p1, p2, p4))
  );
}

/** The closest point on a polyline to p, and how far along the polyline it is. */
export function closestPointOnPath(points, p) {
  let best = { point: points[0], along: 0, distance: Infinity };
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const point = { x: a.x + dx * t, y: a.y + dy * t };
    const distance = Math.hypot(point.x - p.x, point.y - p.y);
    if (distance < best.distance) best = { point, along: travelled + Math.sqrt(len2) * t, distance };
    travelled += Math.sqrt(len2);
  }
  return best;
}
