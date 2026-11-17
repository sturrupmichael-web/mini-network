/**
 * The handcrafted maps: per-map data overrides (events, site unlocks),
 * terrain with holes (islands), two data centers, and that every map is
 * fully connected (no patch of land you can never link to).
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { CONFIG } from "../data/config.js";
import { SIM_DATA } from "../data/index.js";
import { MAPS } from "../data/maps.js";
import { configForMap, dataForMap } from "../src/sim/config.js";
import { cellOf, gridSize, isTerrain } from "../src/sim/grid.js";
import { hubCentre } from "../src/sim/sites.js";
import { addLink, chooseReward, step, triggerEvent } from "../src/sim/world.js";
import { makeWorld } from "./helpers.mjs";

const map = (id) => MAPS.find((m) => m.id === id);
const DAY = CONFIG.time.secondsPerDay;

function play(world, seconds) {
  const ticks = Math.round(seconds / world.dt);
  for (let i = 0; i < ticks && !world.over; i++) {
    if (world.pendingReward) chooseReward(world, world.pendingReward.options[0]);
    step(world);
  }
}

function worldOn(id, opts = {}) {
  const m = map(id);
  return makeWorld({ map: m, config: configForMap(CONFIG, m), seed: `maps-${id}`, ...opts });
}

export const tests = [
  ["the six handcrafted maps are listed after the first two, in unlock order", () => {
    assert.deepEqual(
      MAPS.map((m) => m.id),
      ["florida-region", "campus", "lake-ring", "coast-to-coast", "port-town", "the-pass", "downtown", "twin-cities", "archipelago"],
    );
  }],
  ["the online leaderboard accepts every map", async () => {
    const dir = new URL("../supabase/migrations/", import.meta.url);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const sql = (await Promise.all(files.map((f) => readFile(new URL(f, dir), "utf8")))).join("\n");
    const last = [...sql.matchAll(/map in \(([^)]*)\)/g)].at(-1)[1];
    for (const m of MAPS) assert.ok(last.includes(`'${m.id}'`), `${m.id} is in the latest nn_scores map check`);
  }],
  ["a map without overrides runs on the shared data", () => {
    assert.equal(dataForMap(SIM_DATA, map("florida-region")), SIM_DATA);
  }],
  ["Lake Ring: backhoe cuts come about twice as often", () => {
    const data = dataForMap(SIM_DATA, map("lake-ring"));
    const backhoe = data.events.find((e) => e.id === "backhoe");
    const usual = SIM_DATA.events.find((e) => e.id === "backhoe");
    assert.deepEqual(backhoe.schedule, { day: 3, every: [3, 5] });
    assert.deepEqual(backhoe.params, usual.params, "params kept");
    assert.deepEqual(usual.schedule, { day: 6, every: [5, 8] }, "the shared event is untouched");
    const world = worldOn("lake-ring", { outages: false });
    assert.equal(world.inventory.sdwan, 1, "starts with an SD-WAN box");
  }],
  ["Port Town: logistics hub from the start, warehouses from day one, payment gateway in week 2", () => {
    const data = dataForMap(SIM_DATA, map("port-town"));
    assert.ok(!data.events.some((e) => e.id === "logistics-hub"), "the logistics-hub event is off");
    assert.deepEqual(data.events.find((e) => e.id === "payment-gateway").schedule, { day: 8 });
    assert.equal(data.sites.warehouse.unlockDay, 0);
    assert.equal(SIM_DATA.sites.warehouse.unlockDay, 2, "other maps keep the usual day");
    const world = worldOn("port-town", { outages: false });
    assert.ok(world.sites.some((s) => s.type === "logistics"));
    assert.equal(world.data.sites.warehouse.unlockDay, 0, "the world runs on the map's data");
  }],
  ["Archipelago: the sea is terrain and the islands are holes in it", () => {
    const world = worldOn("archipelago", { outages: false });
    const hq = world.sites.find((s) => s.type === "datacenter");
    assert.ok(!isTerrain(world, cellOf(world, hq.x, hq.y)), "HQ's island is land");
    assert.ok(isTerrain(world, cellOf(world, 30, 870)), "the corner is sea");
    assert.ok(isTerrain(world, cellOf(world, 940, 420)), "between the islands is sea");
    assert.ok(!isTerrain(world, cellOf(world, 1130, 200)), "the north-east island is land");
    assert.equal(world.inventory.backbone, 2, "starts with two backbones");
  }],
  ["every map's open ground is one piece, so every new site can be linked", () => {
    for (const m of MAPS) {
      const world = makeWorld({ map: m, config: configForMap(CONFIG, m), seed: m.id, outages: false });
      const { cols, rows } = gridSize(world);
      const open = [];
      for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) if (!isTerrain(world, { cx, cy })) open.push(`${cx},${cy}`);
      const seen = new Set([open[0]]);
      const todo = [open[0]];
      while (todo.length) {
        const [cx, cy] = todo.pop().split(",").map(Number);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const c = { cx: cx + dx, cy: cy + dy };
            const k = `${c.cx},${c.cy}`;
            if (c.cx < 0 || c.cy < 0 || c.cx >= cols || c.cy >= rows || seen.has(k) || isTerrain(world, c)) continue;
            seen.add(k);
            todo.push(k);
          }
        }
      }
      assert.equal(seen.size, open.length, `${m.id}: ${open.length - seen.size} squares cut off`);
    }
  }],
  ["Downtown: city blocks with streets between them", () => {
    const world = worldOn("downtown", { outages: false });
    assert.equal(world.terrain.get(`${cellOf(world, 120, 120).cx},${cellOf(world, 120, 120).cy}`), "block");
    assert.ok(!isTerrain(world, cellOf(world, 255, 225)), "a street crossing is clear");
    play(world, DAY * 4);
    assert.ok(world.sites.length > 6, `new sites find room in the streets (${world.sites.length})`);
  }],
  ["The Pass: a portrait map whose only way north is a three-square gap", () => {
    const world = worldOn("the-pass", { outages: false });
    assert.ok(map("the-pass").height > map("the-pass").width);
    const row = cellOf(world, 0, 600).cy;
    const { cols } = gridSize(world);
    const clear = [];
    for (let cx = 0; cx < cols; cx++) if (!isTerrain(world, { cx, cy: row })) clear.push(cx);
    assert.equal(clear.length, 3, `squares open at the pass: ${clear}`);
    assert.equal(world.inventory.routers, 1, "starts with a core router");
  }],
  ["Twin Cities: two data centers; the view and new sites grow around both", () => {
    const world = worldOn("twin-cities", { outages: false });
    const hubs = world.sites.filter((s) => s.type === "datacenter");
    assert.equal(hubs.length, 2);
    const c = hubCentre(world);
    assert.equal(c.x, (hubs[0].x + hubs[1].x) / 2);
    const v = world.view;
    for (const h of hubs) assert.ok(h.x > v.x && h.x < v.x + v.width, "both HQs are in view");
    const startCount = world.sites.length;
    play(world, DAY * 6);
    const added = world.sites.slice(startCount).filter((s) => s.type !== "switch");
    const near = (h) => added.filter((s) => Math.hypot(s.x - h.x, s.y - h.y) < Math.hypot(s.x - hubs[1 - hubs.indexOf(h)].x, s.y - hubs[1 - hubs.indexOf(h)].y)).length;
    assert.ok(near(hubs[0]) >= 2 && near(hubs[1]) >= 2, `west ${near(hubs[0])}, east ${near(hubs[1])}`);
  }],
  ["Twin Cities: a broadcast comes from whichever data center each site is linked to", () => {
    const world = worldOn("twin-cities", { outages: false });
    world.inventory.links = 500;
    world.inventory.leased = 0; // no way across the river
    const [west, east] = world.sites.filter((s) => s.type === "datacenter");
    for (const s of world.sites.filter((x) => x.type === "office")) {
      const hub = s.x < 750 ? west : east;
      assert.ok(addLink(world, s.id, hub.id).ok);
    }
    assert.ok(triggerEvent(world, "patch-tuesday"));
    const from = new Set();
    for (let i = 0; i < 30 / world.dt; i++) {
      world.events.length = 0;
      step(world);
      for (const e of world.events) if (e.type === "spawned" && (e.siteId === west.id || e.siteId === east.id)) from.add(e.siteId);
    }
    assert.deepEqual([...from].sort(), [west.id, east.id].sort(), "patches from both HQs");
  }],
];
