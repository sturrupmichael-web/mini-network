import { assert, mouseDrag, sitePos, touchDrag } from "./harness.mjs";

export const browser = true;

async function setup(page) {
  await page.evaluate(() => {
    const g = window.miniNetwork;
    g.loop.paused = true;
    Object.assign(g.world.inventory, { upgrades: 3, switches: 2, firewalls: 2, sdwan: 2 });
  });
  const sites = await page.evaluate(() => window.miniNetwork.world.sites.map((s) => ({ id: s.id, type: s.type })));
  return { hub: sites.find((s) => s.type === "datacenter"), offices: sites.filter((s) => s.type === "office") };
}

const center = async (page, selector) => {
  const box = await page.locator(selector).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const midpoint = (page, linkId) =>
  page.evaluate((id) => {
    const p = window.miniNetwork.linkMidpoint(id);
    const rect = document.getElementById("game").getBoundingClientRect();
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, linkId);

const world = (page, fn) => page.evaluate(fn);

export const tests = [
  ["drag a bandwidth upgrade from the tray onto a link", async (t) => {
    const page = await t.open();
    const { hub, offices } = await setup(page);
    await mouseDrag(page, [await sitePos(page, offices[0].id), await sitePos(page, hub.id)]);
    const linkId = await world(page, () => window.miniNetwork.world.links[0].id);
    await mouseDrag(page, [await center(page, '[data-item="upgrades"]'), await midpoint(page, linkId)]);
    const r = await world(page, () => ({ tier: window.miniNetwork.world.links[0].tier, left: window.miniNetwork.world.inventory.upgrades }));
    assert(r.tier === 1 && r.left === 2, `tier ${r.tier}, ${r.left} left`);
    await page.waitForFunction(() => document.querySelector('[data-count="upgrades"]').textContent === "2");
  }],
  ["drop a switch on empty map, then tap it and its × to remove it", async (t) => {
    const page = await t.open();
    const { hub } = await setup(page);
    const h = await sitePos(page, hub.id);
    const spot = { x: h.x, y: h.y + 110 };
    await mouseDrag(page, [await center(page, '[data-item="switches"]'), spot]);
    const sw = await world(page, () => window.miniNetwork.world.sites.find((s) => s.type === "switch"));
    assert(sw, "switch placed");
    await page.mouse.click(spot.x, spot.y);
    assert((await world(page, () => window.miniNetwork.ui.selectedSiteId)) === sw.id, "selected");
    const button = await page.evaluate((id) => {
      const g = window.miniNetwork;
      const site = g.world.siteById.get(id);
      const p = g.sitePosition(id);
      // Mirrors siteRemoveButtonPos in the renderer.
      const r = 13 * g.world.data.sites[site.type].size * Math.min(1.3, Math.max(0.8, g.camera.scale / 0.8));
      const br = 13 * Math.min(1.3, Math.max(0.8, g.camera.scale / 0.8));
      return { x: p.x + r + br * 0.9, y: p.y - r - br * 0.9 };
    }, sw.id);
    await page.mouse.click(button.x, button.y);
    const left = await world(page, () => ({ sw: window.miniNetwork.world.sites.some((s) => s.type === "switch"), n: window.miniNetwork.world.inventory.switches }));
    assert(!left.sw && left.n === 2, "removed and refunded");
  }],
  ["phone: tap a firewall in the tray, then tap a link", async (t) => {
    const page = await t.open({ mobile: true });
    const { hub, offices } = await setup(page);
    await page.evaluate(() => {
      window.miniNetwork.world.security = true;
    });
    await touchDrag(page, [await sitePos(page, offices[0].id), await sitePos(page, hub.id)]);
    const linkId = await world(page, () => window.miniNetwork.world.links[0].id);
    const tray = await center(page, '[data-item="firewalls"]');
    await page.touchscreen.tap(tray.x, tray.y);
    assert((await world(page, () => window.miniNetwork.ui.armed)) === "firewalls", "armed");
    await page.locator('[data-hud="hint"]').waitFor({ state: "visible" });
    const mid = await midpoint(page, linkId);
    await page.touchscreen.tap(mid.x, mid.y);
    const r = await world(page, () => ({ fw: window.miniNetwork.world.links[0].firewall, armed: window.miniNetwork.ui.armed }));
    assert(r.fw && r.armed === null, "firewall on, tray disarmed");
  }],
  ["phone: drag an SD-WAN box onto a site", async (t) => {
    const page = await t.open({ mobile: true });
    const { offices } = await setup(page);
    await touchDrag(page, [await center(page, '[data-item="sdwan"]'), await sitePos(page, offices[1].id)]);
    const on = await world(page, () => window.miniNetwork.world.sites.filter((s) => s.sdwan).map((s) => s.id));
    assert(on.length === 1 && on[0] === offices[1].id, `SD-WAN on ${on}`);
  }],
  ["empty tray items can't be picked up", async (t) => {
    const page = await t.open();
    await setup(page);
    await page.evaluate(() => {
      window.miniNetwork.world.inventory.upgrades = 0;
    });
    await page.waitForFunction(() => document.querySelector('[data-item="upgrades"]').disabled);
  }],
  ["events show a ticker with a toast line", async (t) => {
    const page = await t.open();
    const { hub, offices } = await setup(page);
    await mouseDrag(page, [await sitePos(page, offices[0].id), await sitePos(page, hub.id)]);
    assert(await page.evaluate(() => window.miniNetwork.triggerEvent("backhoe")), "event started");
    await page.locator('[data-hud="ticker"].show').waitFor();
    const title = await page.locator('[data-hud="ticker-title"]').textContent();
    assert(title === "Backhoe cut", title);
    assert(await world(page, () => window.miniNetwork.world.links[0].down !== null), "link is cut");
  }],
  ["a long game with every event runs without errors", async (t) => {
    const page = await t.open({ seed: "long" });
    await page.evaluate(() => {
      const g = window.miniNetwork;
      g.loop.paused = true;
      // Nothing is connected, so keep it from ending: huge queues, and no
      // outages (hungry district hubs would otherwise starve).
      g.world.bonus.capacity = 1000;
      g.world.outages = false;
      for (let day = 0; day < 20; day++) {
        g.runTicks(60 * 30);
        if (g.world.pendingReward) {
          const opt = g.world.pendingReward.options[0];
          document.querySelector(`[data-reward="${opt}"]`)?.click();
          g.world.pendingReward && (g.world.pendingReward = null);
        }
      }
    });
    await page.waitForTimeout(300);
    const seen = await page.evaluate(() => window.miniNetwork.world.eventPlan);
    const fired = Object.entries(seen).filter(([, p]) => p.fired > 0).map(([id]) => id);
    assert(fired.includes("security-rules") && fired.includes("cloud-migration"), fired.join(", "));
  }],
];
