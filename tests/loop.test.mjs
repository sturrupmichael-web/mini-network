import assert from "node:assert/strict";
import { createLoop } from "../src/loop.js";
import { createCamera, fitCamera, screenToWorld, worldToScreen } from "../src/render/camera.js";

function makeLoop(tickRate = 60, maxTicksPerFrame = 8) {
  const counter = { ticks: 0, renders: 0 };
  const loop = createLoop({
    tickRate,
    maxTicksPerFrame,
    onTick: () => counter.ticks++,
    onRender: () => counter.renders++,
    raf: () => {},
    now: () => 0,
  });
  return { loop, counter };
}

export const tests = [
  ["the same real time gives the same ticks at any frame rate", () => {
    const fast = makeLoop();
    const slow = makeLoop();
    for (let i = 0; i < 240; i++) fast.loop.advance(1000 / 120); // 120 Hz for 2 s
    for (let i = 0; i < 60; i++) slow.loop.advance(1000 / 30); // 30 Hz for 2 s
    assert.equal(fast.counter.ticks, 120);
    assert.equal(slow.counter.ticks, 120);
  }],
  ["2× speed runs twice the ticks", () => {
    const { loop, counter } = makeLoop();
    loop.speed = 2;
    for (let i = 0; i < 60; i++) loop.advance(1000 / 60);
    assert.equal(counter.ticks, 120);
  }],
  ["pause stops ticks but keeps rendering", () => {
    const { loop, counter } = makeLoop();
    loop.paused = true;
    for (let i = 0; i < 30; i++) loop.advance(1000 / 60);
    assert.equal(counter.ticks, 0);
    assert.equal(counter.renders, 30);
  }],
  ["a long stall doesn't fast-forward the game", () => {
    const { loop, counter } = makeLoop(60, 8);
    loop.advance(10_000);
    assert.ok(counter.ticks <= 8);
    loop.advance(1000 / 60);
    assert.ok(counter.ticks <= 9);
  }],
  ["camera fits the map and round-trips coordinates", () => {
    const map = { width: 1200, height: 800 };
    const insets = { top: 10, bottom: 10, left: 10, right: 10 };
    for (const [w, h] of [[1366, 768], [390, 844]]) {
      const cam = fitCamera(createCamera(), map, w, h, insets);
      assert.equal(cam.rotated, h > w, "portrait screens turn the map");
      for (const [x, y] of [[0, 0], [1200, 800], [300, 650]]) {
        const s = worldToScreen(cam, x, y);
        assert.ok(s.x >= 9.99 && s.x <= w - 9.99 && s.y >= 9.99 && s.y <= h - 9.99, `(${x},${y}) on screen`);
        const back = screenToWorld(cam, s.x, s.y);
        assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.y - y) < 1e-9);
      }
    }
  }],
];
