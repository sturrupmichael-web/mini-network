/**
 * Tap-to-explain in the browser: a tap or click on the map shows what's
 * there, and it never gets in the way of drawing links.
 */
import { assert, mouseDrag, sitePos, touchDrag } from "./harness.mjs";

export const browser = true;

const card = (page) => page.locator('[data-hud="info"]');
const title = (page) => page.locator('[data-hud="info-title"]').textContent();

const siteOf = (page, type) =>
  page.evaluate((type) => window.miniNetwork.world.sites.find((s) => s.type === type).id, type);

export const tests = [
  ["clicking a site explains it; clicking empty map hides it", async (t) => {
    const page = await t.open();
    assert(await card(page).isHidden(), "hidden at start");
    const hq = await sitePos(page, await siteOf(page, "datacenter"));
    await page.mouse.click(hq.x, hq.y);
    await card(page).waitFor({ state: "visible" });
    assert((await title(page)).includes("Data center"), await title(page));
    assert((await page.evaluate(() => window.miniNetwork.world.links.length)) === 0, "a click draws nothing");
    // It never takes clicks itself.
    assert((await card(page).evaluate((el) => getComputedStyle(el).pointerEvents)) === "none");
    await page.mouse.click(5, 380);
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-hud="info"]');
      return el.hidden || !el.textContent.includes("Data center");
    });
  }],
  ["clicking a link explains its tier and ends, and still selects it", async (t) => {
    const page = await t.open();
    const office = await siteOf(page, "office");
    await mouseDrag(page, [await sitePos(page, office), await sitePos(page, await siteOf(page, "datacenter"))]);
    const id = await page.evaluate(() => window.miniNetwork.world.links[0].id);
    const mid = await page.evaluate((id) => {
      const g = window.miniNetwork;
      const r = document.getElementById("game").getBoundingClientRect();
      const p = g.linkMidpoint(id);
      return { x: r.left + p.x, y: r.top + p.y };
    }, id);
    // No packets riding the link, so the click lands on the link itself.
    await page.evaluate(() => {
      const w = window.miniNetwork.world;
      w.packets.length = 0;
      for (const s of w.sites) s.queue.length = 0;
    });
    await page.mouse.click(mid.x, mid.y);
    await card(page).waitFor({ state: "visible" });
    assert((await title(page)) === "Copper link", await title(page));
    assert((await page.locator('[data-hud="info-sub"]').textContent()).includes("↔"));
    assert((await page.evaluate(() => window.miniNetwork.ui.selectedLinkId)) === id, "selected");
  }],
  ["phone: tap a site to explain it, then drag from it straight through the card", async (t) => {
    const page = await t.open({ mobile: true });
    const office = await siteOf(page, "office");
    const from = await sitePos(page, office);
    await page.touchscreen.tap(from.x, from.y);
    await card(page).waitFor({ state: "visible" });
    assert((await title(page)) === "Office", await title(page));
    await touchDrag(page, [from, await sitePos(page, await siteOf(page, "datacenter"))]);
    assert((await page.evaluate(() => window.miniNetwork.world.links.length)) === 1, "the link was drawn");
    assert(await card(page).isHidden(), "drawing hides the card");
  }],
];
