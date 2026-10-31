import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { MAPS } from "../data/maps.js";
import { configForMap } from "../src/sim/config.js";
import {
  autoCells,
  cellCost,
  cellOf,
  cellsToPath,
  pathProblem,
  straightCells,
} from "../src/sim/grid.js";
import { addLink, addSite, removeLink, step } from "../src/sim/world.js";
import { customMap, makeWorld } from "./helpers.mjs";

const S = CONFIG.grid.cellSize;
const at = (cx, cy) => ({ type: "office", x: (cx + 0.5) * S, y: (cy + 0.5) * S });
const lab = (start) => makeWorld({ map: customMap(start) });

export const tests = [
  ["every site sits in the middle of a grid square", () => {
    for (const map of MAPS) {
      const world = makeWorld({ map, config: configForMap(CONFIG, map), seed: map.id });
      for (let i = 0; i < 60 * 120; i++) step(world);
      for (const s of world.sites) {
        assert.equal((s.x / S) % 1, 0.5, `${map.id} ${s.type} x`);
        assert.equal((s.y / S) % 1, 0.5, `${map.id} ${s.type} y`);
      }
    }
  }],
  ["a link costs one per square between its two sites", () => {
    const world = lab([{ ...at(2, 2), type: "datacenter" }, at(8, 2)]);
    const [h, a] = world.sites;
    const before = world.inventory.links;
    const link = addLink(world, a.id, h.id).link;
    assert.equal(link.cells.length, 7, "squares 2..8");
    assert.equal(link.cost, 5, "the 5 squares in between");
    assert.equal(world.inventory.links, before - 5);
    removeLink(world, link.id);
    assert.equal(world.inventory.links, before);
  }],
  ["a drawn route can wind around, and costs its length", () => {
    const world = lab([{ ...at(2, 4), type: "datacenter" }, at(8, 4)]);
    const [h, a] = world.sites;
    // Up and over: 2,4 → 3,3 → 4,2 → 5,2 → 6,2 → 7,3 → 8,4
    const cells = [[2, 4], [3, 3], [4, 2], [5, 2], [6, 2], [7, 3], [8, 4]].map(([cx, cy]) => ({ cx, cy }));
    const link = addLink(world, h.id, a.id, 0, cells).link;
    assert.equal(link.cost, 5);
    assert.deepEqual(link.cells, cells);
    // Path corners are at square centres, straight runs merged.
    assert.equal(link.path.length, 4, "start, two corners, end");
    assert.deepEqual(link.path[0], { x: h.x, y: h.y });
    assert.deepEqual(link.path.at(-1), { x: a.x, y: a.y });
  }],
  ["bad routes are refused", () => {
    const world = lab([{ ...at(2, 2), type: "datacenter" }, at(6, 2), at(4, 2)]);
    const [h, a] = world.sites;
    const row = (from, to) => straightCells({ cx: from, cy: 2 }, { cx: to, cy: 2 });
    assert.equal(addLink(world, h.id, a.id, 0, row(2, 6)).reason, "through-site", "can't pass through the middle site");
    const gap = [{ cx: 2, cy: 2 }, { cx: 4, cy: 3 }, { cx: 5, cy: 3 }, { cx: 6, cy: 2 }];
    assert.equal(addLink(world, h.id, a.id, 0, gap).reason, "bad-path", "squares must touch");
    const loop = [{ cx: 2, cy: 2 }, { cx: 3, cy: 3 }, { cx: 2, cy: 3 }, { cx: 3, cy: 3 }, { cx: 4, cy: 3 }, { cx: 5, cy: 3 }, { cx: 6, cy: 2 }];
    assert.equal(addLink(world, h.id, a.id, 0, loop).reason, "bad-path", "no square twice");
    assert.equal(addLink(world, h.id, a.id, 0, row(2, 5)).reason, "bad-path", "must end at the site");
    assert.equal(world.links.length, 0);
  }],
  ["without a drawn route, links go straight or around sites in the way", () => {
    const world = lab([{ ...at(2, 2), type: "datacenter" }, at(8, 2), at(5, 2)]);
    const [h, a] = world.sites;
    const cells = autoCells(world, h, a);
    assert.ok(cells, "found a way");
    assert.equal(pathProblem(world, cells, h, a), null);
    assert.ok(!cells.some((c) => c.cx === 5 && c.cy === 2), "goes around the middle site");
    const r = addLink(world, h.id, a.id);
    assert.ok(r.ok, r.reason);
    assert.equal(r.link.cost, cellCost(cells));
  }],
  ["not enough links for the route is refused", () => {
    const world = lab([{ ...at(2, 2), type: "datacenter" }, at(12, 2)]);
    const [h, a] = world.sites;
    world.inventory.links = 8;
    assert.equal(addLink(world, h.id, a.id).reason, "no-links");
    world.inventory.links = 9;
    assert.ok(addLink(world, h.id, a.id).ok);
    assert.equal(world.inventory.links, 0);
  }],
  ["straight paths are octilinear: diagonal first, then straight", () => {
    const cells = straightCells({ cx: 0, cy: 0 }, { cx: 5, cy: 2 });
    assert.deepEqual(cells.map((c) => [c.cx, c.cy]), [[0, 0], [1, 1], [2, 2], [3, 2], [4, 2], [5, 2]]);
    const world = lab([{ ...at(0, 0), type: "datacenter" }]);
    assert.equal(cellsToPath(world, cells).length, 3, "one corner");
  }],
  ["switches snap to a square", () => {
    const world = lab([{ ...at(2, 2), type: "datacenter" }, at(10, 2)]);
    world.inventory.switches = 1;
    const s = addSite(world, "switch", 6.3 * S, 6.9 * S);
    assert.deepEqual(cellOf(world, s.x, s.y), { cx: 6, cy: 6 });
    assert.equal(s.x, 6.5 * S);
  }],
];
