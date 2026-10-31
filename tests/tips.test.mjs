import { assert } from "./harness.mjs";

export const browser = true;

const tip = (page) => page.locator('[data-hud="tip"]');

export const tests = [
  ["hovering a tray tool shows what it does and how many are left", async (t) => {
    const page = await t.open();
    assert(await tip(page).isHidden(), "hidden at start");
    await page.hover('[data-item="upgrades"]');
    await tip(page).waitFor({ state: "visible" });
    const name = await page.locator('[data-hud="tip-name"]').textContent();
    const text = await page.locator('[data-hud="tip-text"]').textContent();
    const count = await page.locator('[data-hud="tip-count"]').textContent();
    assert(name === "Bandwidth upgrade", name);
    assert(text.includes("tier"), text);
    assert(/^\d+ left$/.test(count), count);
    // It sits above the tray and on screen.
    const box = await tip(page).boundingBox();
    const tray = await page.locator('[data-hud="tray"]').boundingBox();
    assert(box.y + box.height <= tray.y, "above the tray");
    assert(box.x >= 0, "on screen");
    await page.mouse.move(10, 300);
    await tip(page).waitFor({ state: "hidden" });
  }],
  ["empty tools still explain themselves", async (t) => {
    const page = await t.open();
    await page.evaluate(() => {
      window.miniNetwork.world.inventory.sdwan = 0;
    });
    await page.waitForFunction(() => document.querySelector('[data-item="sdwan"]').disabled);
    await page.hover('[data-item="sdwan"]', { force: true });
    await tip(page).waitFor({ state: "visible" });
    const count = await page.locator('[data-hud="tip-count"]').textContent();
    assert(count.startsWith("None left"), count);
  }],
  ["phone: pressing a tool shows its tip, which then fades", async (t) => {
    const page = await t.open({ mobile: true });
    await page.locator('[data-item="switches"]').tap();
    await tip(page).waitFor({ state: "visible" });
    assert((await page.locator('[data-hud="tip-name"]').textContent()) === "Switch");
    await tip(page).waitFor({ state: "hidden", timeout: 5000 });
  }],
];
