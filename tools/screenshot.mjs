/**
 * Makes the 1200×630 card image for the games site: plays a few days of a
 * seeded game (linking each new site to its nearest linked neighbour), then
 * saves a WebP. Run `npm run build` first.
 *
 *   node tools/screenshot.mjs [out.webp] [--dark]
 *
 * The WebP is encoded by Chromium itself, so no image tools are needed.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith("--")) ?? "mini-network.webp");
const dark = args.includes("--dark");
const SEED = "card-1";
const DAYS = 9;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
  colorScheme: dark ? "dark" : "light",
});
const page = await context.newPage();
page.on("pageerror", (e) => console.error(e));
const url = pathToFileURL(join(root, "index.html"));
url.search = `seed=${SEED}&map=florida-region&mode=zen`;
await page.goto(url.href);
await page.evaluate(() => window.miniNetwork.audio.setMuted(true));

/** Drag a link from every unlinked site to the nearest linked one. */
async function linkNewSites() {
  const pairs = await page.evaluate(() => {
    const g = window.miniNetwork;
    const w = g.world;
    const linked = w.sites.filter((s) => s.links.length > 0 || w.data.sites[s.type].shape === "hub");
    const out = [];
    for (const s of w.sites) {
      if (linked.includes(s) || w.data.sites[s.type].junction) continue;
      const near = linked
        .map((t) => ({ t, d: Math.hypot(t.x - s.x, t.y - s.y) }))
        .sort((a, b) => a.d - b.d)[0];
      if (!near) continue;
      out.push([g.sitePosition(s.id), g.sitePosition(near.t.id)]);
      linked.push(s);
    }
    return out;
  });
  const canvas = await page.locator("#game").boundingBox();
  for (const [a, b] of pairs) {
    await page.mouse.move(canvas.x + a.x, canvas.y + a.y);
    await page.mouse.down();
    await page.mouse.move(canvas.x + (a.x + b.x) / 2, canvas.y + (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(canvas.x + b.x, canvas.y + b.y, { steps: 4 });
    await page.mouse.up();
  }
}

for (let half = 0; half < DAYS * 2; half++) {
  await linkNewSites();
  await page.evaluate(() => {
    const g = window.miniNetwork;
    g.runTicks(g.world.config.sim.tickRate * g.world.config.time.secondsPerDay * 0.5);
    g.world.pendingReward = null; // skip the weekly card for the picture
  });
}
await linkNewSites();
// A moment of real time so packets and animations settle, then freeze.
await page.evaluate(() => {
  window.miniNetwork.loop.paused = false;
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  window.miniNetwork.loop.paused = true;
  window.miniNetwork.ui.selectedLinkId = null;
});
await page.mouse.move(0, 0);
// Keep the card clean: no event ticker, toasts or mode label.
await page.addStyleTag({ content: '[data-hud="ticker"], [data-hud="toast"], [data-hud="run"] { visibility: hidden !important; }' });
await page.waitForTimeout(300);

const png = await page.screenshot({ type: "png" });
const webp = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  return c.toDataURL("image/webp", 0.86).split(",")[1];
}, png.toString("base64"));
await writeFile(out, Buffer.from(webp, "base64"));
console.log(`Wrote ${out}`);
await browser.close();
