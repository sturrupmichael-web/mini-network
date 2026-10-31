/**
 * Test runner. Runs every tests/*.test.mjs file.
 *
 * Each file exports `tests`: an array of [name, async fn]. Files that also
 * export `browser = true` get a Playwright harness (see harness.mjs) and run
 * against dev.html, the built index.html over http, and index.html opened
 * from disk.
 *
 *   npm test               everything
 *   npm test -- node       skip browser tests
 *   npm test -- routing    only tests whose file or name contains "routing"
 */
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const nodeOnly = args.includes("node");
const filters = args.filter((a) => a !== "node");

const files = (await readdir(here)).filter((f) => f.endsWith(".test.mjs")).sort();
const modules = [];
for (const file of files) {
  modules.push({ file, mod: await import(pathToFileURL(join(here, file)).href) });
}

const matches = (file, name) => filters.length === 0 || filters.some((f) => file.includes(f) || name.includes(f));

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

async function runOne(label, fn) {
  const start = Date.now();
  try {
    await withTimeout(Promise.resolve().then(fn), 60_000, label);
    passed++;
    console.log(`  ✓ ${label} (${Date.now() - start} ms)`);
  } catch (e) {
    failed++;
    failures.push({ label, error: e });
    console.log(`  ✗ ${label}\n      ${String(e?.stack ?? e).split("\n").slice(0, 4).join("\n      ")}`);
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    }),
  ]);
}

// Node tests first: they're fast and catch most mistakes.
for (const { file, mod } of modules.filter((m) => !m.mod.browser)) {
  console.log(file);
  for (const [name, fn] of mod.tests) {
    if (!matches(file, name)) continue;
    await runOne(name, fn);
  }
}

const browserModules = modules.filter((m) => m.mod.browser);
if (nodeOnly) {
  for (const { mod } of browserModules) skipped += mod.tests.length;
  if (browserModules.length) console.log(`Skipping ${browserModules.length} browser test file(s) (node only).`);
} else if (browserModules.some(({ file, mod }) => mod.tests.some(([name]) => matches(file, name)))) {
  const { createHarness } = await import("./harness.mjs");
  const harness = await createHarness();
  try {
    for (const { file, mod } of browserModules) {
      const targets = harness.targets.filter((t) => !mod.targets || mod.targets.includes(t.name));
      for (const target of targets) {
        console.log(`${file} [${target.name}]`);
        for (const [name, fn] of mod.tests) {
          if (!matches(file, name)) continue;
          await runOne(`${name} [${target.name}]`, () => harness.run(target, fn));
        }
      }
    }
  } finally {
    await harness.close();
  }
}

console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""}`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ${f.label}: ${f.error?.message ?? f.error}`);
  process.exit(1);
}
