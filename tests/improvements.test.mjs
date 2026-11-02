import assert from "node:assert/strict";
import { GAME_DATA } from "../data/index.js";
import { TERRAIN_TYPES } from "../data/terrain.js";
import { validateData } from "../src/data/validate.js";
import { EFFECT_NAMES } from "../src/sim/events.js";
import { offscreenArrow } from "../src/render/renderer.js";
import { createPacket } from "../src/sim/packets.js";
import { step } from "../src/sim/world.js";
import { createStorage } from "../src/storage.js";
import { TUTORIAL_STEPS, createTutorial } from "../src/tutorial.js";
import { makeWorld } from "./helpers.mjs";

function memoryStorage() {
  const map = new Map();
  return createStorage({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) });
}

/** Push a site over capacity and run until its ring passes `fraction`. */
function overloadTo(world, fraction) {
  const site = world.sites.find((s) => s.type !== "datacenter");
  const hub = world.sites.find((s) => s.type === "datacenter");
  const traffic = Object.keys(world.data.traffic)[0];
  const seconds = world.config.overload.seconds;
  const events = [];
  // Nothing is linked, so these packets just wait at the site.
  for (let i = 0; i < 100; i++) createPacket(world, site, traffic, `#${hub.id}`);
  for (let i = 0; i < 60 * seconds * 2 && site.overload < seconds * fraction && !world.over; i++) {
    world.events.length = 0;
    step(world);
    events.push(...world.events);
  }
  return { site, events };
}

export const tests = [
  ["every terrain kind has its own texture", () => {
    const patterns = Object.values(TERRAIN_TYPES).map((t) => t.pattern);
    assert.equal(new Set(patterns).size, patterns.length, "no two kinds share a texture");
    const bad = validateData({ ...GAME_DATA, effects: EFFECT_NAMES, terrain: { ...TERRAIN_TYPES, mud: { name: "Mud", pattern: "plaid" } } });
    assert.ok(bad.some((e) => e.includes("terrain.mud.pattern")), bad.join("\n"));
  }],
  ["a site that is almost full warns once per climb", () => {
    const world = makeWorld();
    const { events } = overloadTo(world, 0.9);
    const warnings = events.filter((e) => e.type === "overload-warning");
    assert.equal(warnings.length, 1);
    assert.ok(!world.over, "not over yet");
  }],
  ["zen mode doesn't warn (nothing can go down)", () => {
    const world = makeWorld({ outages: false });
    const { events } = overloadTo(world, 0.9);
    assert.equal(events.filter((e) => e.type === "overload-warning").length, 0);
  }],
  ["off-screen arrows sit on the visible edge, pointing at the site", () => {
    const view = { width: 400, height: 800 };
    const insets = { top: 60, bottom: 80, left: 0, right: 0 };
    assert.equal(offscreenArrow(view, insets, { x: 200, y: 400 }, 10), null, "on screen: no arrow");
    const right = offscreenArrow(view, insets, { x: 900, y: 390 }, 10);
    assert.ok(Math.abs(right.x - 390) < 1e-6 && Math.abs(right.angle) < 1e-6, JSON.stringify(right));
    const under = offscreenArrow(view, insets, { x: 200, y: 790 }, 10);
    assert.ok(Math.abs(under.y - (800 - 80 - 10)) < 1e-6, "behind the tray counts as off screen");
    const corner = offscreenArrow(view, insets, { x: -500, y: -500 }, 10);
    assert.ok(corner.x >= 10 - 1e-6 && corner.y >= 70 - 1e-6, JSON.stringify(corner));
  }],
  ["the tutorial walks through its steps and is remembered", () => {
    const storage = memoryStorage();
    const tut = createTutorial(storage, true);
    assert.equal(tut.stepId, "link");
    tut.update({ links: 0 });
    assert.equal(tut.stepId, "link");
    tut.update({ links: 1 });
    assert.equal(tut.stepId, "around");
    tut.update({ links: 2 });
    assert.equal(tut.stepId, "gear");
    tut.placed();
    tut.update({ links: 2 });
    assert.equal(tut.active, false);
    assert.equal(storage.get("tutorialDone"), true);
    assert.equal(createTutorial(storage, true).active, false, "not again");
    assert.equal(TUTORIAL_STEPS.length, 3);
  }],
  ["skipping the tutorial ends it for good; inactive games never show it", () => {
    const storage = memoryStorage();
    assert.equal(createTutorial(storage, false).text, null);
    const tut = createTutorial(storage, true);
    assert.ok(tut.text);
    tut.skip();
    assert.equal(tut.text, null);
    assert.equal(createTutorial(storage, true).active, false);
  }],
];
