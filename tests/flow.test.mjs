import { assert } from "./harness.mjs";

export const browser = true;

const visible = (page, name) => page.locator(`[data-hud="${name}"]`).isVisible();

export const tests = [
  ["the HUD shows the week and day", async (t) => {
    const page = await t.open();
    const text = await page.locator('[data-hud="clock-text"]').textContent();
    assert(/^Week 1 · Mon$/.test(text), `clock reads "${text}"`);
  }],
  ["game over: an outage shows the result and Play again restarts", async (t) => {
    const page = await t.open();
    assert(!(await visible(page, "over")), "no game-over card at the start");
    // Leave everything unlinked until an office overloads.
    await page.evaluate(() => {
      const g = window.miniNetwork;
      for (let i = 0; i < 200 && !g.world.over; i++) {
        if (g.world.pendingReward) return;
        g.runTicks(60 * 10);
      }
    });
    assert(await page.evaluate(() => window.miniNetwork.world.over !== null), "the game ended");
    await page.locator('[data-hud="over"]').waitFor({ state: "visible" });
    const title = await page.locator('[data-hud="over-title"]').textContent();
    assert(/went down/.test(title), title);
    const days = await page.locator('[data-hud="over-days"]').textContent();
    assert(/day|week/.test(days), days);
    await page.click('[data-hud="restart"]');
    await page.locator('[data-hud="over"]').waitFor({ state: "hidden" });
    const fresh = await page.evaluate(() => ({ over: window.miniNetwork.world.over, tick: window.miniNetwork.world.tick }));
    assert(fresh.over === null && fresh.tick < 600, "a new game started");
  }],
  ["the weekly reward picker pauses the game until you choose", async (t) => {
    const page = await t.open();
    // Keep every office healthy by linking them all, then run to the week's end.
    await page.evaluate(() => {
      const g = window.miniNetwork;
      g.loop.paused = true;
      // Give sites huge buffers so the test reaches the end of the week.
      g.world.bonus.capacity = 1000;
      g.runTicks(60 * 60 * 10);
    });
    await page.locator('[data-hud="reward"]').waitFor({ state: "visible" });
    const buttons = page.locator("[data-reward]");
    assert((await buttons.count()) === 2, "two choices");
    const tick = await page.evaluate(() => window.miniNetwork.world.tick);
    await page.evaluate(() => window.miniNetwork.runTicks(100));
    assert((await page.evaluate(() => window.miniNetwork.world.tick)) === tick, "halted while choosing");
    const before = await page.evaluate(() => window.miniNetwork.world.inventory.links);
    const id = await buttons.first().getAttribute("data-reward");
    await buttons.first().click();
    await page.locator('[data-hud="reward"]').waitFor({ state: "hidden" });
    const after = await page.evaluate(
      (rid) => ({
        links: window.miniNetwork.world.inventory.links,
        grant: window.miniNetwork.world.data.rewards.find((r) => r.id === rid).grant,
        pending: window.miniNetwork.world.pendingReward,
      }),
      id,
    );
    assert(after.pending === null, "choice taken");
    assert(after.links === before + (after.grant.links ?? 0), "reward applied");
  }],
  ["phone: reward and game-over cards fit the screen", async (t) => {
    const page = await t.open({ mobile: true });
    await page.evaluate(() => {
      const g = window.miniNetwork;
      g.loop.paused = true;
      g.world.bonus.capacity = 1000;
      g.runTicks(60 * 60 * 10);
    });
    const card = page.locator('[data-hud="reward"] .card');
    await card.waitFor({ state: "visible" });
    const box = await card.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, "card on screen");
    await page.locator("[data-reward]").first().tap();
    await page.locator('[data-hud="reward"]').waitFor({ state: "hidden" });
  }],
];
