import { assert } from "./harness.mjs";

export const browser = true;

const stats = (page) => page.locator('[data-debug="stats"]').textContent();

export const tests = [
  ["the ` key toggles the debug panel, with live stats", async (t) => {
    const page = await t.open();
    const panel = page.locator('[data-debug="panel"]');
    assert(await panel.isHidden(), "hidden at start");
    await page.keyboard.press("Backquote");
    await panel.waitFor({ state: "visible" });
    await page.waitForFunction(() => /seed \S+ · tick \d+/.test(document.querySelector('[data-debug="stats"]').textContent));
    await page.keyboard.press("Backquote");
    await panel.waitFor({ state: "hidden" });
  }],
  ["?debug opens it; spawn, trigger, skip and grant all work", async (t) => {
    const page = await t.open({ query: "debug" });
    await page.locator('[data-debug="panel"]').waitFor({ state: "visible" });
    const g = () => page.evaluate(() => {
      const w = window.miniNetwork.world;
      return { sites: w.sites.length, links: w.inventory.links, day: w.day, active: w.activeEvents.map((a) => a.id), time: w.time };
    });
    const before = await g();

    await page.selectOption('[data-debug="site-type"]', "retail");
    await page.click('[data-debug="spawn-site"]');
    assert((await g()).sites === before.sites + 1, "site added");
    assert(await page.evaluate(() => window.miniNetwork.world.sites.at(-1).type === "retail"), "retail");

    await page.click('[data-debug="grant-links"]');
    assert((await g()).links === before.links + 5, "links granted");

    // An all-hands needs linked sites to send to; with none it politely refuses.
    await page.selectOption('[data-debug="event"]', "all-hands");
    await page.click('[data-debug="trigger"]');
    assert((await page.locator('[data-debug="note"]').textContent()) === "That event can't start right now", "refused");
    const sitesNow = (await g()).sites;
    await page.selectOption('[data-debug="event"]', "acquisition");
    await page.click('[data-debug="trigger"]');
    assert((await page.locator('[data-debug="note"]').textContent()) === "Event started", "event started");
    assert((await g()).sites > sitesNow, "acquisition added sites");

    await page.click('[data-debug="outages"]');
    assert(!(await page.evaluate(() => window.miniNetwork.world.outages)), "outages off");
    await page.click('[data-debug="skip"][data-seconds="day"]');
    const after = await g();
    assert(after.day >= 1 && after.time >= before.time + 29, JSON.stringify(after));
    const note = await page.locator('[data-debug="note"]').textContent();
    assert(note.startsWith("Skipped"), note);
  }],
  ["knobs change the running game's config, not the shared data", async (t) => {
    const page = await t.open({ query: "debug" });
    const input = page.locator('[data-knob="links.bandwidth"]');
    await page.waitForFunction(() => document.querySelector('[data-knob="links.bandwidth"]').value !== "");
    const original = Number(await input.inputValue());
    await input.fill(String(original * 2));
    await input.press("Enter");
    await input.blur();
    assert(await page.evaluate((v) => window.miniNetwork.world.config.links.bandwidth === v, original * 2), "applied");
    await page.evaluate(() => window.miniNetwork.restart());
    const fresh = await page.evaluate(() => window.miniNetwork.world.config.links.bandwidth);
    assert(fresh === original, `new game uses data/config.js again (${fresh})`);
    assert((await stats(page)).length > 0);
  }],
  ["phone: the debug panel fits the screen", async (t) => {
    const page = await t.open({ query: "debug", mobile: true });
    const box = await page.locator('[data-debug="panel"]').boundingBox();
    const vw = await page.evaluate(() => innerWidth);
    assert(box.x >= 0 && box.x + box.width <= vw, JSON.stringify(box));
  }],
];
