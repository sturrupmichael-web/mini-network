/**
 * Browser test harness. Builds index.html, serves the repo over a local
 * http server, and gives each test a way to open the game in Chromium.
 *
 * A browser test is `async (t) => { ... }` where t has:
 *   t.target          { name: "dev" | "built" | "file", url }
 *   t.open(opts)      Opens the game and returns a Playwright page once it
 *                     has started. opts: { mobile?: boolean, seed?: string,
 *                     query?: string, context? }. seed: null opens the title
 *                     screen; context reuses a browser context (same storage).
 *                     Desktop is 1366×768; mobile is a 390×844 phone with
 *                     touch at 3× pixel density.
 * Any console error or uncaught exception on any opened page fails the test.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { build } from "../build.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export const DESKTOP = { viewport: { width: 1366, height: 768 } };
export const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

function startServer() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(root, path);
    if (!file.startsWith(root) || path.startsWith("node_modules")) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error("not a file");
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

export async function createHarness() {
  console.log("Building index.html for browser tests…");
  await build();
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();

  const targets = [
    { name: "dev", url: `${base}/dev.html` },
    { name: "built", url: `${base}/index.html` },
    { name: "file", url: pathToFileURL(join(root, "index.html")).href },
  ];

  async function run(target, fn) {
    const contexts = [];
    const errors = [];
    const t = {
      target,
      async open({ mobile = false, seed = "test", query = "", context: reuse = null } = {}) {
        const context = reuse ?? (await browser.newContext(mobile ? MOBILE : DESKTOP));
        if (!reuse) contexts.push(context);
        const page = await context.newPage();
        page.on("console", (msg) => {
          if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
        });
        page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
        const params = [seed === null ? "" : `seed=${encodeURIComponent(seed)}`, query].filter(Boolean).join("&");
        await page.goto(params ? `${target.url}?${params}` : target.url);
        await page.waitForFunction(() => window.miniNetwork?.world, null, { timeout: 10_000 });
        return page;
      },
    };
    try {
      await fn(t);
      if (errors.length) throw new Error(`Errors in the page:\n${errors.join("\n")}`);
    } finally {
      for (const c of contexts) await c.close();
    }
  }

  return {
    targets,
    run,
    async close() {
      await browser.close();
      await new Promise((r) => server.close(r));
    },
  };
}

/** Screen position (page CSS px) of a site, by id. */
export async function sitePos(page, id) {
  return page.evaluate((siteId) => {
    const game = window.miniNetwork;
    const p = game.sitePosition(siteId);
    const rect = document.getElementById("game").getBoundingClientRect();
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, id);
}

/** Drag the mouse through a list of {x, y} points. */
export async function mouseDrag(page, points, steps = 12) {
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps });
  await page.mouse.up();
}

/** Drag one finger through a list of {x, y} points (Chromium touch events). */
export async function touchDrag(page, points, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  await send("touchStart", points[0].x, points[0].y);
  let prev = points[0];
  for (const p of points.slice(1)) {
    for (let i = 1; i <= steps; i++) {
      await send("touchMove", prev.x + ((p.x - prev.x) * i) / steps, prev.y + ((p.y - prev.y) * i) / steps);
    }
    prev = p;
  }
  await send("touchEnd");
  await cdp.detach();
}

export function assert(cond, message) {
  if (!cond) throw new Error(message);
}
