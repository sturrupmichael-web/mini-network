import assert from "node:assert/strict";
import { AUDIO } from "../data/audio.js";
import { MOTION } from "../data/theme.js";
import { createAudio, tickFrequency } from "../src/audio/audio.js";
import { createCamera } from "../src/render/camera.js";
import { easeIntoQueues } from "../src/render/renderer.js";

const spot = (id, x, y) => ({ packet: { id }, x, y });

export const tests = [
  ["juice timings are design tokens", () => {
    for (const key of ["spawnRingMs", "spawnRingSpread", "queueEase", "lastDayPulseS"]) {
      assert.ok(MOTION[key] > 0, key);
    }
  }],
  ["drawing ticks climb a little with each square, then level off", () => {
    const t = AUDIO.tick;
    assert.equal(tickFrequency(t, 1), t.freq);
    assert.ok(tickFrequency(t, 6) > tickFrequency(t, 2));
    assert.equal(tickFrequency(t, 500), t.freq * 2 ** (t.maxRise / 12));
    assert.equal(tickFrequency(t, 0), t.freq);
  }],
  ["spawn chimes and ticks stay silent (and safe) before audio is unlocked", () => {
    const audio = createAudio(AUDIO);
    audio.spawned();
    audio.tick(3);
    audio.tick(2, true);
  }],
  ["a packet joining a queue glides there from its site", () => {
    const camera = createCamera();
    const world = {};
    const ui = {};
    const site = { x: 100, y: 100 };
    const first = spot(1, 140, 100);
    easeIntoQueues({ world, camera, ui, now: 10 }, [[site, first]], []);
    assert.deepEqual([first.x, first.y], [100, 100], "starts at the site");
    let s = spot(1, 140, 100);
    easeIntoQueues({ world, camera, ui, now: 10.05 }, [[site, s]], []);
    assert.ok(s.x > 100 && s.x < 140, `part way: ${s.x}`);
    for (let i = 1; i <= 40; i++) {
      s = spot(1, 140, 100);
      easeIntoQueues({ world, camera, ui, now: 10.05 + i * 0.05 }, [[site, s]], []);
    }
    assert.equal(s.x, 140, "settles exactly in place");
  }],
  ["a packet arriving off a link glides from the link's end", () => {
    const camera = createCamera();
    const world = {};
    const ui = {};
    const site = { x: 0, y: 0 };
    easeIntoQueues({ world, camera, ui, now: 1 }, [], [spot(7, 50, 0)]);
    const s = spot(7, 10, 0);
    easeIntoQueues({ world, camera, ui, now: 1.02 }, [[site, s]], []);
    assert.ok(s.x > 10 && s.x < 50, `between the link end and its place: ${s.x}`);
  }],
  ["queue easing starts fresh for a new game, and does nothing without a ui", () => {
    const camera = createCamera();
    const ui = {};
    const site = { x: 0, y: 0 };
    easeIntoQueues({ world: {}, camera, ui, now: 1 }, [[site, spot(1, 30, 0)]], []);
    easeIntoQueues({ world: {}, camera, ui, now: 1.5 }, [[site, spot(1, 30, 0)]], []);
    const s = spot(1, 30, 0);
    easeIntoQueues({ world: {}, camera, ui, now: 2 }, [[site, s]], []);
    assert.equal(s.x, 0, "a new world forgets old packet positions");
    const plain = spot(1, 30, 0);
    easeIntoQueues({ world: {}, camera, ui: null, now: 1 }, [[site, plain]], []);
    assert.equal(plain.x, 30);
  }],
];
