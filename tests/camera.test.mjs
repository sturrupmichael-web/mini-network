import { assert } from "./harness.mjs";

export const browser = true;

export const tests = [
  ["when the map opens up, the camera eases out instead of jumping", async (t) => {
    const page = await t.open({ query: "mode=zen" });
    const samples = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const g = window.miniNetwork;
          g.loop.paused = true;
          g.settleCamera();
          const before = { ...g.world.view };
          g.triggerEvent("acquisition"); // a far-off cluster: a big jump in the open area
          g.runTicks(1);
          if (g.world.view.width === before.width && g.world.view.height === before.height) resolve(null);
          const out = [];
          const frame = () => {
            out.push([performance.now(), g.camera.scale]);
            if (out.length < 90) requestAnimationFrame(frame);
            else resolve(out);
          };
          requestAnimationFrame(frame);
        }),
    );
    assert(samples, "the open area grew");
    const speeds = [];
    for (let i = 1; i < samples.length; i++) {
      const dt = (samples[i][0] - samples[i - 1][0]) / 1000;
      if (dt > 0) speeds.push(Math.abs(samples[i][1] - samples[i - 1][1]) / dt);
    }
    const peak = Math.max(...speeds);
    assert(peak > 0, "it moved");
    assert(speeds[0] < peak * 0.35, `starts gently (${speeds[0].toFixed(4)} vs peak ${peak.toFixed(4)})`);
    assert(samples.at(-1)[1] < samples[0][1], "zoomed out");
    for (let i = 1; i < samples.length; i++) assert(samples[i][1] <= samples[i - 1][1] + 1e-9, "only ever zooms out (no bounce)");
  }],
];
