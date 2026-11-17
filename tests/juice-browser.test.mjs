import { assert, mouseDrag, sitePos } from "./harness.mjs";

export const browser = true;

export const tests = [
  ["the clock pulses on the week's last day, and only then", async (t) => {
    const page = await t.open();
    const clock = page.locator('[data-hud="clock"]');
    await page.waitForFunction(() => window.miniNetwork.run && window.miniNetwork.world.time > 0);
    assert(!(await clock.evaluate((el) => el.classList.contains("is-last-day"))), "not on day one");
    await page.evaluate(() => {
      const g = window.miniNetwork;
      const { secondsPerDay, daysPerWeek } = g.world.config.time;
      // world.time follows the tick count, so move that.
      g.world.tick = Math.round((secondsPerDay * (daysPerWeek - 1) + 1) / g.world.dt);
      g.world.day = daysPerWeek - 1;
      g.world.growth.nextSiteAt = Infinity;
    });
    await page.waitForFunction(() => document.querySelector('[data-hud="clock"]').classList.contains("is-last-day"));
    const animation = await page.locator('[data-hud="dial"]').evaluate((el) => getComputedStyle(el).animationName);
    assert(animation === "last-day-pulse", animation);
  }],
  ["drawing a link ticks once per square", async (t) => {
    const page = await t.open();
    const plan = await page.evaluate(() => {
      const g = window.miniNetwork;
      g.loop.paused = true;
      window.__ticks = [];
      g.audio.tick = (squares, undo) => window.__ticks.push([squares, undo]);
      const hub = g.world.sites.find((s) => s.type === "datacenter");
      const other = g.world.sites.find((s) => s !== hub);
      return { hub: hub.id, other: other.id };
    });
    await mouseDrag(page, [await sitePos(page, plan.hub), await sitePos(page, plan.other)]);
    const { ticks, link } = await page.evaluate(() => ({ ticks: window.__ticks, link: window.miniNetwork.world.links[0] }));
    assert(link, "linked");
    const added = ticks.filter(([, undo]) => !undo);
    assert(added.length >= link.cost, `${added.length} ticks for ${link.cost} squares`);
  }],
  ["a new site chimes", async (t) => {
    const page = await t.open();
    await page.waitForFunction(() => window.miniNetwork.run && window.miniNetwork.world.time > 0);
    await page.evaluate(() => {
      const g = window.miniNetwork;
      window.__chimes = 0;
      g.audio.spawned = () => window.__chimes++;
      const at = g.world.growth.nextSiteAt;
      g.runTicks(Math.ceil((at - g.world.time) * g.world.config.sim.tickRate) + 120);
    });
    // Sounds play on the next frame, for everything that happened since the last one.
    await page.waitForFunction(() => window.__chimes >= 1);
    assert((await page.evaluate(() => window.__chimes)) === 1, "one chime per frame");
  }],
];
