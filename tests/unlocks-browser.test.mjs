import { assert } from "./harness.mjs";

export const browser = true;

/** Jump a running game to just before the given day, with nothing new arriving. */
async function jumpToDay(page, day) {
  await page.evaluate((d) => {
    const g = window.miniNetwork;
    const { secondsPerDay } = g.world.config.time;
    g.world.tick = Math.round((secondsPerDay * d - 0.5) / g.world.dt);
    g.world.day = d - 1;
    g.world.week = Math.floor((d - 1) / 7) + 1;
    g.world.growth.nextSiteAt = Infinity;
    g.world.pendingReward = null;
  }, day);
}

export const tests = [
  ["a new player sees later maps locked, with what opens them", async (t) => {
    const page = await t.open({ seed: null, locked: true });
    await page.locator('[data-title="screen"]').waitFor({ state: "visible" });
    await page.click('[data-mode="classic"]');
    const campus = page.locator('[data-map="campus"]');
    assert(await campus.isDisabled(), "Campus is locked");
    const why = await page.locator('[data-map-lock="campus"]').textContent();
    assert(why === "Locked. Survive 2 weeks on Florida Region to unlock.", why);
    assert(!(await page.locator('[data-map="florida-region"]').isDisabled()), "the first map is open");
    // Zen can't pick it either, but the daily challenge can be any map.
    await page.click('[data-mode="zen"]');
    assert(await campus.isDisabled(), "locked in Zen too");
  }],
  ["surviving two weeks beats the map and unlocks the next", async (t) => {
    const page = await t.open({ seed: null, locked: true });
    await page.click('[data-mode="classic"]');
    await page.click('[data-map="florida-region"]');
    await page.click('[data-title="play"]');
    await page.click('[data-hud="coach-skip"]');
    await jumpToDay(page, 14);
    await page.locator('[data-hud="ticker"]').filter({ hasText: "Campus is now unlocked" }).waitFor();
    const beaten = await page.evaluate(() => JSON.parse(localStorage.getItem("miniNetwork:beatenMaps")));
    assert(beaten.includes("florida-region"), JSON.stringify(beaten));
    // The end of week 2 is also a reward pick.
    await page.locator("[data-reward]").first().click();
    await page.click('[data-hud="menu"]');
    assert(!(await page.locator('[data-map="campus"]').isDisabled()), "Campus is open now");
    assert((await page.locator('[data-map-lock="florida-region"]').textContent()) === "Beaten", "Florida shows as beaten");
  }],
  ["Zen runs don't count towards unlocks", async (t) => {
    const page = await t.open({ seed: null, locked: true });
    await page.click('[data-mode="zen"]');
    await page.click('[data-title="play"]');
    await page.click('[data-hud="coach-skip"]');
    await jumpToDay(page, 15);
    await page.waitForFunction(() => window.miniNetwork.world.time > window.miniNetwork.world.config.time.secondsPerDay * 14 + 1);
    assert((await page.evaluate(() => localStorage.getItem("miniNetwork:beatenMaps"))) === null, "nothing beaten");
  }],
];
