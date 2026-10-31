/**
 * The cable grid. The map is divided into square cells of
 * config.grid.cellSize world units. Every site sits in the middle of a
 * cell, and a link is a chain of touching cells (sideways, up/down or
 * diagonal) from one site's cell to another's. Each cell between the two
 * sites uses one link from the inventory, so a long or winding link costs
 * more than a short straight one.
 *
 * Cells are { cx, cy } (column, row). Pure functions, no DOM.
 */

export const cellKey = (c) => `${c.cx},${c.cy}`;
export const sameCell = (a, b) => a.cx === b.cx && a.cy === b.cy;

export function cellSize(world) {
  return world.config.grid.cellSize;
}

/** Number of columns and rows on this map. */
export function gridSize(world) {
  const s = cellSize(world);
  return { cols: Math.floor(world.map.width / s), rows: Math.floor(world.map.height / s) };
}

/** The cell containing world point (x, y), clamped to the map. */
export function cellOf(world, x, y) {
  const s = cellSize(world);
  const { cols, rows } = gridSize(world);
  return {
    cx: Math.min(cols - 1, Math.max(0, Math.floor(x / s))),
    cy: Math.min(rows - 1, Math.max(0, Math.floor(y / s))),
  };
}

/** World position of a cell's centre. */
export function cellCenter(world, c) {
  const s = cellSize(world);
  return { x: (c.cx + 0.5) * s, y: (c.cy + 0.5) * s };
}

/** Snap a world point to the centre of its cell. */
export function snapToGrid(world, x, y) {
  return cellCenter(world, cellOf(world, x, y));
}

export function inGrid(world, c) {
  const { cols, rows } = gridSize(world);
  return c.cx >= 0 && c.cy >= 0 && c.cx < cols && c.cy < rows;
}

/** Is point p inside the polygon [[x, y], ...]? */
function insidePolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The map's terrain as a Map from cell key to terrain kind: every square
 * whose centre is inside one of map.terrain's shapes. Links can't cross
 * these squares and nothing can be built on them.
 */
export function buildTerrain(world) {
  const out = new Map();
  const { cols, rows } = gridSize(world);
  for (const area of world.map.terrain ?? []) {
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const c = { cx, cy };
        if (insidePolygon(cellCenter(world, c), area.points)) out.set(cellKey(c), area.kind);
      }
    }
  }
  return out;
}

export function isTerrain(world, c) {
  return world.terrain?.has(cellKey(c)) ?? false;
}

/** Is world point (x, y) inside the part of the map that's open so far (world.view)? */
export function inView(world, x, y) {
  const v = world.view;
  return !v || (x >= v.x && y >= v.y && x <= v.x + v.width && y <= v.y + v.height);
}

/** Map from cell key to the site in that cell. */
export function siteCells(world) {
  const out = new Map();
  for (const s of world.sites) out.set(cellKey(cellOf(world, s.x, s.y)), s);
  return out;
}

/** The next cell one step from `from` towards `to` (diagonal while both differ). */
export function stepToward(from, to) {
  return { cx: from.cx + Math.sign(to.cx - from.cx), cy: from.cy + Math.sign(to.cy - from.cy) };
}

/** Links a chain of cells uses: the cells between its two end sites. */
export function cellCost(cells) {
  return Math.max(0, cells.length - 2);
}

/**
 * Why `cells` isn't a valid link from site a to site b, or null if it is.
 * Valid: starts in a's cell, ends in b's cell, every step goes to a
 * touching cell, never visits a cell twice, stays inside the open part
 * of the map, and passes through no other site and no terrain.
 */
export function pathProblem(world, cells, a, b) {
  if (!Array.isArray(cells) || cells.length < 2) return "bad-path";
  if (!sameCell(cells[0], cellOf(world, a.x, a.y))) return "bad-path";
  if (!sameCell(cells.at(-1), cellOf(world, b.x, b.y))) return "bad-path";
  const seen = new Set();
  const sites = siteCells(world);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!inGrid(world, c)) return "off-map";
    const centre = cellCenter(world, c);
    if (!inView(world, centre.x, centre.y)) return "off-map";
    const k = cellKey(c);
    if (world.terrain?.has(k)) return "terrain";
    if (seen.has(k)) return "bad-path";
    seen.add(k);
    if (i > 0) {
      const p = cells[i - 1];
      if (Math.max(Math.abs(c.cx - p.cx), Math.abs(c.cy - p.cy)) !== 1) return "bad-path";
    }
    if (i > 0 && i < cells.length - 1 && sites.has(k)) return "through-site";
  }
  return null;
}

/** The cells straight from a to b: diagonal first, then straight. */
export function straightCells(from, to) {
  const out = [from];
  let c = from;
  while (!sameCell(c, to)) {
    c = stepToward(c, to);
    out.push(c);
  }
  return out;
}

/**
 * A good path between two sites when the player didn't draw one (rerouting,
 * splitting with a switch, tests): the straight one if it's clear, otherwise
 * the shortest way around other sites. Null if there's no way.
 */
export function autoCells(world, a, b) {
  const start = cellOf(world, a.x, a.y);
  const goal = cellOf(world, b.x, b.y);
  const straight = straightCells(start, goal);
  if (!pathProblem(world, straight, a, b)) return straight;

  // Breadth-first search; straight moves are tried before diagonals so the
  // result has fewer zigzags.
  const sites = siteCells(world);
  const moves = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  const from = new Map([[cellKey(start), null]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    if (sameCell(c, goal)) break;
    for (const [dx, dy] of moves) {
      const n = { cx: c.cx + dx, cy: c.cy + dy };
      const k = cellKey(n);
      if (!inGrid(world, n) || from.has(k)) continue;
      if (sites.has(k) && !sameCell(n, goal)) continue;
      if (world.terrain?.has(k)) continue;
      const centre = cellCenter(world, n);
      if (!inView(world, centre.x, centre.y)) continue;
      from.set(k, c);
      queue.push(n);
    }
  }
  if (!from.has(cellKey(goal))) return null;
  const path = [];
  for (let c = goal; c; c = from.get(cellKey(c))) path.push(c);
  return path.reverse();
}

/** The polyline through the cells' centres, with straight runs merged. */
export function cellsToPath(world, cells) {
  const pts = [];
  for (let i = 0; i < cells.length; i++) {
    if (i > 0 && i < cells.length - 1) {
      const p = cells[i - 1];
      const c = cells[i];
      const n = cells[i + 1];
      if (c.cx - p.cx === n.cx - c.cx && c.cy - p.cy === n.cy - c.cy) continue;
    }
    pts.push(cellCenter(world, cells[i]));
  }
  return pts;
}
