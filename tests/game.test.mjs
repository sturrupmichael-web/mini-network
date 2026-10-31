import { assert, mouseDrag, sitePos, touchDrag } from "./harness.mjs";

export const browser = true;

const sites = (page) =>
  page.evaluate(() => window.miniNetwork.world.sites.map((s) => ({ id: s.id, type: s.type })));
const linkCount = (page) => page.evaluate(() => window.miniNetwork.world.links.length);

async function hubAndOffices(page) {
  const all = await sites(page);
  return { hub: all.find((s) => s.type === "datacenter"), offices: all.filter((s) => s.type === "office") };
}

export const tests = [
  ["starts with no console errors and a crisp canvas", async (t) => {
    const page = await t.open();
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const c = document.getElementById("game");
      return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, dpr: devicePixelRatio };
    });
    assert(info.cw === 1366 && info.ch === 768, `canvas fills the window (${info.cw}×${info.ch})`);
    assert(info.w === Math.round(info.cw * info.dpr) && info.h === Math.round(info.ch * info.dpr), "backing store matches DPR");
    const ticks = await page.evaluate(() => window.miniNetwork.world.tick);
    assert(ticks > 0, "simulation is running");
  }],
  ["drawing a link with the mouse connects two sites", async (t) => {
    const page = await t.open();
    const { hub, offices } = await hubAndOffices(page);
    await mouseDrag(page, [await sitePos(page, offices[0].id), await sitePos(page, hub.id)]);
    assert((await linkCount(page)) === 1, "one link drawn");
    const link = await page.evaluate(() => {
      const l = window.miniNetwork.world.links[0];
      return [l.a, l.b].sort();
    });
    assert(JSON.stringify(link) === JSON.stringify([offices[0].id, hub.id].sort()), "link joins the right sites");
  }],
  ["one stroke can chain through several sites", async (t) => {
    const page = await t.open();
    const { hub, offices } = await hubAndOffices(page);
    await mouseDrag(page, [
      await sitePos(page, offices[0].id),
      await sitePos(page, hub.id),
      await sitePos(page, offices[1].id),
    ]);
    assert((await linkCount(page)) === 2, `two links (got ${await linkCount(page)})`);
    const inv = await page.evaluate(() => window.miniNetwork.world.inventory.links);
    const start = await page.evaluate(() => window.miniNetwork.world.config.links.startingCount);
    const used = await page.evaluate(() => window.miniNetwork.world.links.reduce((n, l) => n + l.cost, 0));
    assert(used > 2 && inv === start - used, `inventory went down by the squares used (${used})`);
  }],
  ["dragging from empty space draws nothing", async (t) => {
    const page = await t.open();
    await mouseDrag(page, [{ x: 20, y: 400 }, { x: 1300, y: 400 }]);
    assert((await linkCount(page)) === 0, "no links");
  }],
  ["packets travel along links to the data center", async (t) => {
    const page = await t.open();
    const { hub, offices } = await hubAndOffices(page);
    for (const o of offices) await mouseDrag(page, [await sitePos(page, o.id), await sitePos(page, hub.id)]);
    await page.evaluate(() => window.miniNetwork.runTicks(60 * 60));
    const stats = await page.evaluate(() => window.miniNetwork.world.stats);
    assert(stats.delivered > 5, `delivered ${stats.delivered}`);
    const score = await page.locator('[data-hud="score"]').textContent();
    await page.waitForFunction((s) => Number(document.querySelector('[data-hud="score"]').textContent) >= s, stats.score);
    assert(Number(score) >= 0, "score shows");
  }],
  ["pause and speed controls change the clock", async (t) => {
    const page = await t.open();
    await page.click('[data-hud="pause"]');
    const a = await page.evaluate(() => window.miniNetwork.world.tick);
    await page.waitForTimeout(250);
    const b = await page.evaluate(() => window.miniNetwork.world.tick);
    assert(a === b, "paused game doesn't tick");
    await page.click('[data-speed="2"]');
    const state = await page.evaluate(() => ({ paused: window.miniNetwork.loop.paused, speed: window.miniNetwork.loop.speed }));
    assert(!state.paused && state.speed === 2, "2× resumes at double speed");
    await page.keyboard.press("Space");
    assert(await page.evaluate(() => window.miniNetwork.loop.paused), "space pauses");
  }],
  ["the canvas follows window resizes", async (t) => {
    const page = await t.open();
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForFunction(() => document.getElementById("game").width === Math.round(800 * devicePixelRatio));
    const { hub } = await hubAndOffices(page);
    const p = await sitePos(page, hub.id);
    assert(p.x > 0 && p.x < 800 && p.y > 0 && p.y < 600, "map is still on screen");
  }],
  ["phone: drawing links with a finger", async (t) => {
    const page = await t.open({ mobile: true });
    const info = await page.evaluate(() => ({
      w: document.getElementById("game").width,
      rotated: window.miniNetwork.camera.rotated,
    }));
    assert(info.w === 390 * 3, `3× backing store (got ${info.w})`);
    assert(info.rotated, "landscape map is turned to fit the portrait phone");
    const { hub, offices } = await hubAndOffices(page);
    await touchDrag(page, [await sitePos(page, offices[0].id), await sitePos(page, hub.id), await sitePos(page, offices[1].id)]);
    assert((await linkCount(page)) === 2, `two links by touch (got ${await linkCount(page)})`);
  }],
  ["phone: a fast swipe still connects", async (t) => {
    const page = await t.open({ mobile: true });
    const { hub, offices } = await hubAndOffices(page);
    // Only two touch moves for the whole stroke.
    await touchDrag(page, [await sitePos(page, offices[2].id), await sitePos(page, hub.id)], 2);
    assert((await linkCount(page)) === 1, "one link");
  }],
  ["phone: a tap on empty map doesn't scroll or link", async (t) => {
    const page = await t.open({ mobile: true });
    await touchDrag(page, [{ x: 30, y: 400 }, { x: 30, y: 200 }]);
    const scrolled = await page.evaluate(() => window.scrollY);
    assert((await linkCount(page)) === 0 && scrolled === 0, "nothing happened");
  }],
];
