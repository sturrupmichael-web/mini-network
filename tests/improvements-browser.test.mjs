import { assert, mouseDrag, sitePos } from "./harness.mjs";

export const browser = true;

/** Run the current game until it ends (no links, so a site overloads). */
async function playToTheEnd(page) {
  await page.evaluate(() => {
    const g = window.miniNetwork;
    for (let i = 0; i < 200 && !g.world.over; i++) {
      g.runTicks(60 * 10);
      if (g.world.pendingReward) g.world.pendingReward = null;
    }
  });
  await page.locator('[data-hud="over"]').waitFor({ state: "visible" });
}

export const tests = [
  ["the first game from the title shows the tutorial; Skip ends it for good", async (t) => {
    const page = await t.open({ seed: null });
    await page.click('[data-title="play"]');
    const coach = page.locator('[data-hud="coach"]');
    await coach.waitFor({ state: "visible" });
    const text = await page.locator('[data-hud="coach-text"]').textContent();
    assert(text.includes("Drag from HQ"), text);
    await page.click('[data-hud="coach-skip"]');
    await coach.waitFor({ state: "hidden" });
    const page2 = await t.open({ seed: null, context: page.context() });
    await page2.click('[data-title="play"]');
    await page2.waitForTimeout(200);
    assert(await page2.locator('[data-hud="coach"]').isHidden(), "not shown again");
  }],
  ["linking a site moves the tutorial on", async (t) => {
    const page = await t.open({ seed: null });
    await page.click('[data-title="play"]');
    await page.evaluate(() => {
      const g = window.miniNetwork;
      const w = g.world;
      const hub = w.sites.find((s) => s.type === "datacenter");
      const other = w.sites.find((s) => s !== hub);
      g.loop.paused = true;
      return { hub: hub.id, other: other.id };
    }).then(async ({ hub, other }) => {
      await mouseDrag(page, [await sitePos(page, hub), await sitePos(page, other)]);
    });
    await page.waitForFunction(() => window.miniNetwork.tutorial.stepId !== "link");
    const text = await page.locator('[data-hud="coach-text"]').textContent();
    assert(/water, parks and hills/i.test(text), text);
  }],
  ["URL replays never show the tutorial", async (t) => {
    const page = await t.open();
    await page.waitForTimeout(200);
    assert(await page.locator('[data-hud="coach"]').isHidden(), "hidden");
  }],
  ["dragging into terrain flashes the square in the way", async (t) => {
    const page = await t.open();
    const plan = await page.evaluate(() => {
      const g = window.miniNetwork;
      const w = g.world;
      g.loop.paused = true;
      const S = w.config.grid.cellSize;
      const v = w.view;
      // The open terrain square nearest to any site, and that site.
      let best = null;
      for (const key of w.terrain.keys()) {
        const [cx, cy] = key.split(",").map(Number);
        const c = { x: (cx + 0.5) * S, y: (cy + 0.5) * S };
        if (c.x < v.x || c.y < v.y || c.x > v.x + v.width || c.y > v.y + v.height) continue;
        for (const s of w.sites) {
          const d = Math.hypot(s.x - c.x, s.y - c.y);
          if (!best || d < best.d) best = { d, site: s.id, c };
        }
      }
      const p = g.worldToScreen(best.c.x, best.c.y);
      const rect = document.getElementById("game").getBoundingClientRect();
      return { site: best.site, target: { x: rect.left + p.x, y: rect.top + p.y } };
    });
    await mouseDrag(page, [await sitePos(page, plan.site), plan.target], 20);
    const blocked = await page.evaluate(() => window.miniNetwork.ui.blockedCell);
    assert(blocked && Number.isInteger(blocked.cx), JSON.stringify(blocked));
    const isTerrain = await page.evaluate((b) => window.miniNetwork.world.terrain.has(`${b.cx},${b.cy}`), blocked);
    assert(isTerrain, "the flashed square is terrain");
  }],
  ["Same seed replays the game; the map card shows the best score", async (t) => {
    const page = await t.open({ seed: null });
    await page.click('[data-mode="classic"]');
    await page.click('[data-map="campus"]');
    await page.click('[data-title="play"]');
    await page.click('[data-hud="coach-skip"]');
    const first = await page.evaluate(() => window.miniNetwork.seed);
    await playToTheEnd(page);
    await page.locator('[data-hud="same-seed"]').waitFor({ state: "visible" });
    await page.click('[data-hud="same-seed"]');
    const again = await page.evaluate(() => window.miniNetwork.seed);
    assert(again === first, `${again} vs ${first}`);
    await playToTheEnd(page);
    await page.click('[data-hud="restart"]');
    const fresh = await page.evaluate(() => window.miniNetwork.seed);
    assert(fresh !== first, "Play again picks a new seed");
    await page.click('[data-hud="menu"]');
    const best = await page.locator('[data-map-best="campus"]').textContent();
    assert(/^Best \d+$/.test(best), best);
    assert(await page.locator('[data-map-best="florida-region"]').isHidden(), "no best on unplayed maps");
  }],
  ["daily games don't offer Same seed (the seed is today's)", async (t) => {
    const page = await t.open({ seed: null });
    await page.click('[data-mode="daily"]');
    await page.click('[data-title="play"]');
    await playToTheEnd(page);
    assert(await page.locator('[data-hud="same-seed"]').isHidden(), "hidden");
  }],
];
