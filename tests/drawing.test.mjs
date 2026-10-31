import { assert, mouseDrag, sitePos } from "./harness.mjs";

export const browser = true;

/** Screen position (page coords) of the centre of grid square (cx, cy). */
const cellPos = (page, cx, cy) =>
  page.evaluate(([cx, cy]) => {
    const g = window.miniNetwork;
    const s = g.world.config.grid.cellSize;
    const rect = document.getElementById("game").getBoundingClientRect();
    const { worldToScreen } = g;
    const p = worldToScreen((cx + 0.5) * s, (cy + 0.5) * s);
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, [cx, cy]);

const sites = (page) =>
  page.evaluate(() => {
    const g = window.miniNetwork;
    const s = g.world.config.grid.cellSize;
    return g.world.sites.map((x) => ({ id: x.id, type: x.type, cx: Math.floor(x.x / s), cy: Math.floor(x.y / s) }));
  });

export const tests = [
  ["a drawn link follows the pointer square by square", async (t) => {
    const page = await t.open();
    const all = await sites(page);
    const hub = all.find((s) => s.type === "datacenter");
    const office = all.find((s) => s.type === "office");
    // Go the long way: three squares sideways, away from the hub, then to the hub.
    const detour = { cx: office.cx + (office.cx > hub.cx ? 3 : -3), cy: office.cy };
    await mouseDrag(page, [
      await sitePos(page, office.id),
      await cellPos(page, detour.cx, detour.cy),
      await sitePos(page, hub.id),
    ]);
    const link = await page.evaluate(() => window.miniNetwork.world.links[0] && { ...window.miniNetwork.world.links[0] });
    assert(link, "link drawn");
    assert(link.cells.some((c) => Math.abs(c.cx - office.cx) >= 2 && Math.abs(c.cy - office.cy) <= 1), `goes out the way the pointer went: ${JSON.stringify(link.cells)}`);
    const straight = (p, q) => Math.abs(p.cx - q.cx) + Math.abs(p.cy - q.cy) === 1;
    for (let i = 2; i < link.cells.length; i++) {
      const [a, b, c] = link.cells.slice(i - 2, i + 1);
      const corner = straight(a, b) && straight(b, c) && Math.abs(a.cx - c.cx) === 1 && Math.abs(a.cy - c.cy) === 1;
      assert(!corner, "no square L-corners (they become diagonals)");
    }
    const direct = Math.max(Math.abs(office.cx - hub.cx), Math.abs(office.cy - hub.cy)) - 1;
    assert(link.cost > direct, `the detour costs more (${link.cost} > ${direct})`);
  }],
  ["dragging back over the path undoes squares", async (t) => {
    const page = await t.open();
    const all = await sites(page);
    const hub = all.find((s) => s.type === "datacenter");
    const office = all.find((s) => s.type === "office");
    const away = { cx: office.cx + (office.cx > hub.cx ? 3 : -3), cy: office.cy };
    const start = await sitePos(page, office.id);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const far = await cellPos(page, away.cx, away.cy);
    await page.mouse.move(far.x, far.y, { steps: 8 });
    const long = await page.evaluate(() => window.miniNetwork.ui.drag.cells.length);
    const near = await cellPos(page, office.cx + Math.sign(away.cx - office.cx), office.cy);
    await page.mouse.move(near.x, near.y, { steps: 8 });
    const short = await page.evaluate(() => window.miniNetwork.ui.drag.cells.length);
    await page.mouse.up();
    assert(long === 4 && short === 2, `went out 3 then back to 1 (${long}, ${short})`);
    assert((await page.evaluate(() => window.miniNetwork.world.links.length)) === 0, "letting go off a site draws nothing");
  }],
  ["running out of links stops the path", async (t) => {
    const page = await t.open();
    await page.evaluate(() => {
      window.miniNetwork.world.inventory.links = 1;
    });
    const all = await sites(page);
    const hub = all.find((s) => s.type === "datacenter");
    const office = all.find((s) => s.type === "office");
    await mouseDrag(page, [await sitePos(page, office.id), await sitePos(page, hub.id)]);
    assert((await page.evaluate(() => window.miniNetwork.world.links.length)) === 0, "no link");
    await page.locator('[data-hud="toast"]').filter({ hasText: "Not enough links" }).waitFor();
  }],
];
