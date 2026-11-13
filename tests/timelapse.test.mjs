import { assert } from "./harness.mjs";

export const browser = true;

export const tests = [
  ["the game-over card plays a timelapse of the network", async (t) => {
    const page = await t.open();
    await page.evaluate(() => {
      const g = window.miniNetwork;
      for (let i = 0; i < 200 && !g.world.over; i++) {
        g.runTicks(60 * 10);
        if (g.world.pendingReward) g.world.pendingReward = null;
      }
    });
    await page.locator('[data-hud="over"]').waitFor({ state: "visible" });
    const box = page.locator('[data-hud="timelapse-box"]');
    await box.waitFor({ state: "visible" });
    const frames = await page.evaluate(() => window.miniNetwork.world.history.length);
    assert(frames >= 1, `${frames} frames`);
    const size = await page.locator('[data-hud="timelapse"]').evaluate((c) => ({ w: c.width, h: c.height }));
    assert(size.w > 0 && size.h > 0, "drawn");
    const download = page.waitForEvent("download");
    await page.click('[data-hud="save-image"]');
    assert((await download).suggestedFilename() === "nano-networks.png", "saves a png");
  }],
];
