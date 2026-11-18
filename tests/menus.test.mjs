import { assert } from "./harness.mjs";

export const browser = true;

const run = (page) => page.evaluate(() => window.miniNetwork.run && { ...window.miniNetwork.run });

export const tests = [
  ["the title screen starts a game on the chosen map", async (t) => {
    const page = await t.open({ seed: null });
    await page.locator('[data-title="screen"]').waitFor({ state: "visible" });
    assert((await run(page)) === null, "no game yet");
    await page.click('[data-mode="classic"]');
    await page.click('[data-map="campus"]');
    await page.click('[data-title="play"]');
    await page.locator('[data-title="screen"]').waitFor({ state: "hidden" });
    const r = await run(page);
    assert(r.modeId === "classic" && r.mapId === "campus", JSON.stringify(r));
    assert((await page.evaluate(() => window.miniNetwork.world.map.id)) === "campus");
  }],
  ["the menu pauses the game and Resume carries on", async (t) => {
    const page = await t.open();
    await page.click('[data-hud="menu"]');
    await page.locator('[data-title="screen"]').waitFor({ state: "visible" });
    assert(await page.evaluate(() => window.miniNetwork.loop.paused), "paused");
    const tick = await page.evaluate(() => window.miniNetwork.world.tick);
    await page.click('[data-title="resume"]');
    await page.locator('[data-title="screen"]').waitFor({ state: "hidden" });
    await page.waitForFunction((t0) => window.miniNetwork.world.tick > t0, tick);
  }],
  ["zen mode never ends", async (t) => {
    const page = await t.open({ query: "mode=zen" });
    await page.evaluate(() => {
      const g = window.miniNetwork;
      for (let i = 0; i < 30; i++) {
        g.runTicks(60 * 20);
        if (g.world.pendingReward) g.world.pendingReward = null;
      }
    });
    assert(await page.evaluate(() => window.miniNetwork.world.over === null), "still going");
    assert(await page.locator('[data-hud="over"]').isHidden(), "no game-over card");
  }],
  ["daily challenge: today's map, a share line, and a saved best", async (t) => {
    const page = await t.open({ seed: null });
    await page.click('[data-mode="daily"]');
    const enabled = await page.locator(".map-card:not([disabled])").count();
    assert(enabled === 1, "only today's map can be picked");
    await page.click('[data-title="play"]');
    const r = await run(page);
    assert(r.daily && r.seed === `daily-${r.daily}`, JSON.stringify(r));
    await page.evaluate(() => {
      const g = window.miniNetwork;
      for (let i = 0; i < 100 && !g.world.over; i++) {
        g.runTicks(60 * 10);
        if (g.world.pendingReward) g.world.pendingReward = null;
      }
    });
    await page.locator('[data-hud="share"]').waitFor({ state: "visible" });
    const text = await page.locator('[data-hud="share-text"]').textContent();
    assert(text.startsWith(`Nano Networks daily ${r.daily}`), text);
    assert(/[🟩🟨🟥]/u.test(text), "has the day grid");
    const best = await page.locator('[data-hud="over-best"]').textContent();
    assert(best === "New best score!", best);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("miniNetwork:highScores")));
    assert(saved[`daily:${r.daily}`]?.length === 1, JSON.stringify(saved));
  }],
  ["dark mode and mute are saved and come back after a reload", async (t) => {
    const page = await t.open({ seed: null });
    await page.click('[data-title="open-settings"]');
    await page.click('[data-theme-choice="dark"]');
    await page.click('[data-setting="sound"]');
    await page.click('[data-title="close-settings"]');
    assert((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "dark now");
    const page2 = await t.open({ context: page.context() });
    const s = await page2.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      ui: window.miniNetwork.ui.theme,
      muted: window.miniNetwork.settings.muted,
    }));
    assert(s.theme === "dark" && s.ui === "dark" && s.muted, JSON.stringify(s));
    const pressed = await page2.locator('[data-hud="mute"]').getAttribute("aria-pressed");
    assert(pressed === "true", "mute button shows muted");
    const keys = await page2.evaluate(() => Object.keys(localStorage));
    assert(keys.length > 0 && keys.every((k) => k.startsWith("miniNetwork:")), keys.join(", "));
  }],
  ["the mute button toggles sound", async (t) => {
    const page = await t.open();
    await page.click('[data-hud="mute"]');
    assert(await page.evaluate(() => window.miniNetwork.audio.muted), "muted");
    await page.click('[data-hud="mute"]');
    assert(!(await page.evaluate(() => window.miniNetwork.audio.muted)), "unmuted");
  }],
  ["phone: the title screen fits and plays", async (t) => {
    const page = await t.open({ seed: null, mobile: true });
    const card = await page.locator(".title-card").boundingBox();
    assert(card.width <= 390 && card.x >= 0, "fits across");
    await page.locator('[data-title="play"]').tap();
    await page.locator('[data-title="screen"]').waitFor({ state: "hidden" });
    assert((await run(page)) !== null, "playing");
  }],
  ["the in-game theme button switches light and dark, and it's saved", async (t) => {
    const page = await t.open();
    const btn = page.locator('[data-hud="theme"]');
    const theme = () => page.evaluate(() => [document.documentElement.dataset.theme, window.miniNetwork.ui.theme]);
    const start = (await theme())[0];
    const other = start === "dark" ? "light" : "dark";
    await btn.click();
    assert(JSON.stringify(await theme()) === JSON.stringify([other, other]), "switched");
    await page.waitForFunction(
      (label) => document.querySelector('[data-hud="theme"]').getAttribute("aria-label") === label,
      other === "dark" ? "Light mode" : "Dark mode",
    );
    assert((await page.evaluate(() => window.miniNetwork.settings.theme)) === other, "saved");
    await btn.click();
    assert((await theme())[0] === start, "and back");
  }],
];
