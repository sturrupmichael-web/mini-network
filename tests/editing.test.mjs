import { assert, mouseDrag, sitePos, touchDrag } from "./harness.mjs";

export const browser = true;

const state = (page) =>
  page.evaluate(() => {
    const w = window.miniNetwork.world;
    return {
      links: w.links.map((l) => ({ id: l.id, a: l.a, b: l.b, line: l.line })),
      inventory: w.inventory.links,
      sites: w.sites.map((s) => ({ id: s.id, type: s.type })),
    };
  });

async function setup(page) {
  // Freeze time so nothing changes under the test's feet.
  await page.evaluate(() => {
    window.miniNetwork.loop.paused = true;
  });
  const s = await state(page);
  return { hub: s.sites.find((x) => x.type === "datacenter"), offices: s.sites.filter((x) => x.type === "office") };
}

const midpoint = (page, linkId) =>
  page.evaluate((id) => {
    const p = window.miniNetwork.linkMidpoint(id);
    const rect = document.getElementById("game").getBoundingClientRect();
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, linkId);

export const tests = [
  ["click a link, then its × button, to remove it (refunded)", async (t) => {
    const page = await t.open();
    const { hub, offices } = await setup(page);
    await mouseDrag(page, [await sitePos(page, offices[0].id), await sitePos(page, hub.id)]);
    const before = await state(page);
    assert(before.links.length === 1, "link drawn");
    const mid = await midpoint(page, before.links[0].id);
    await page.mouse.click(mid.x, mid.y);
    assert((await page.evaluate(() => window.miniNetwork.ui.selectedLinkId)) === before.links[0].id, "selected");
    await page.mouse.click(mid.x, mid.y); // the × sits at the midpoint
    const after = await state(page);
    assert(after.links.length === 0, "removed");
    assert(after.inventory === before.inventory + 1, "refunded");
  }],
  ["right-click removes a link", async (t) => {
    const page = await t.open();
    const { hub, offices } = await setup(page);
    await mouseDrag(page, [await sitePos(page, offices[1].id), await sitePos(page, hub.id)]);
    const mid = await midpoint(page, (await state(page)).links[0].id);
    await page.mouse.click(mid.x, mid.y, { button: "right" });
    assert((await state(page)).links.length === 0, "removed");
  }],
  ["Delete removes the selected link", async (t) => {
    const page = await t.open();
    const { hub, offices } = await setup(page);
    await mouseDrag(page, [await sitePos(page, offices[1].id), await sitePos(page, hub.id)]);
    const mid = await midpoint(page, (await state(page)).links[0].id);
    await page.mouse.click(mid.x, mid.y);
    await page.keyboard.press("Delete");
    assert((await state(page)).links.length === 0, "removed");
  }],
  ["drag a link onto a site to reroute it through that site", async (t) => {
    const page = await t.open();
    const { hub, offices } = await setup(page);
    await mouseDrag(page, [await sitePos(page, offices[0].id), await sitePos(page, hub.id)]);
    const link = (await state(page)).links[0];
    await mouseDrag(page, [await midpoint(page, link.id), await sitePos(page, offices[1].id)]);
    const links = (await state(page)).links;
    const has = (a, b) => links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    assert(links.length === 2, `two links (got ${links.length})`);
    assert(has(offices[0].id, offices[1].id) && has(offices[1].id, hub.id), "A–C–B");
    assert(links.every((l) => l.line === link.line), "same colour");
  }],
  ["drawing from the end of a line extends that line", async (t) => {
    const page = await t.open();
    const { hub, offices } = await setup(page);
    await mouseDrag(page, [await sitePos(page, offices[0].id), await sitePos(page, hub.id)]);
    // Start again from the hub (the line's end) and go to another office.
    await mouseDrag(page, [await sitePos(page, hub.id), await sitePos(page, offices[1].id)]);
    // And from office 0's end, to office 2.
    await mouseDrag(page, [await sitePos(page, offices[1].id), await sitePos(page, offices[2].id)]);
    const lines = new Set((await state(page)).links.map((l) => l.line));
    assert(lines.size === 1, `one colour (got ${[...lines]})`);
  }],
  ["phone: tap a link and its × to remove it", async (t) => {
    const page = await t.open({ mobile: true });
    const { hub, offices } = await setup(page);
    await touchDrag(page, [await sitePos(page, offices[0].id), await sitePos(page, hub.id)]);
    const link = (await state(page)).links[0];
    assert(link, "link drawn");
    const mid = await midpoint(page, link.id);
    await page.touchscreen.tap(mid.x, mid.y);
    await page.touchscreen.tap(mid.x, mid.y);
    assert((await state(page)).links.length === 0, "removed");
  }],
  ["phone: long-press on a link doesn't remove it", async (t) => {
    const page = await t.open({ mobile: true });
    const { hub, offices } = await setup(page);
    await touchDrag(page, [await sitePos(page, offices[0].id), await sitePos(page, hub.id)]);
    const mid = await midpoint(page, (await state(page)).links[0].id);
    await page.dispatchEvent("#game", "contextmenu", { clientX: mid.x, clientY: mid.y });
    assert((await state(page)).links.length === 1, "still there");
  }],
];
