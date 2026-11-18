/**
 * Game-over run stats: packets delivered each week, the busiest link, and
 * the site that ended the run (src/sim/runstats.js, src/ui/report.js).
 */
import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { addLink, busiestLink, makeBackbone, reshapeLink, setEventSchedule, step, weeklyDeliveries } from "../src/sim/world.js";
import { busiestHtml, endedHtml, runReport, weekChartHtml } from "../src/ui/report.js";
import { configWith, customMap, DATA, makeWorld } from "./helpers.mjs";

const TPS = CONFIG.sim.tickRate;
const WEEK = CONFIG.time.secondsPerDay * CONFIG.time.daysPerWeek;

function lab({ outages = false } = {}) {
  const config = configWith({
    growth: { firstSiteAt: 1e9 },
    overload: outages ? { seconds: 3 } : { seconds: 1e9 },
    links: { ...CONFIG.links, startingCount: 400 },
    inventory: { ...CONFIG.inventory, backbone: 1 },
  });
  const world = makeWorld({
    config,
    map: customMap([
      { type: "datacenter", x: 315, y: 405, label: "HQ" },
      { type: "office", x: 855, y: 405 },
      { type: "office", x: 315, y: 705 },
    ]),
    seed: "runstats",
    outages,
  });
  setEventSchedule(world, false);
  return world;
}

/** Run for `seconds`, skipping weekly reward cards. */
function run(world, seconds) {
  for (let i = 0; i < seconds * TPS && !world.over; i++) {
    if (world.pendingReward) world.pendingReward = null;
    step(world);
  }
}

export const tests = [
  ["deliveries are counted per week and add up to the total", () => {
    const world = lab();
    const [hq, a, b] = world.sites;
    addLink(world, a.id, hq.id);
    addLink(world, b.id, hq.id);
    run(world, WEEK * 2 + 20);
    const weeks = weeklyDeliveries(world);
    assert.equal(weeks.length, 3);
    assert.ok(weeks[0] > 0 && weeks[1] > 0, weeks.join(","));
    assert.equal(weeks.reduce((s, n) => s + n, 0), world.stats.delivered);
  }],

  ["a week with no deliveries still gets a bar", () => {
    const world = lab();
    run(world, WEEK + 5);
    assert.deepEqual(weeklyDeliveries(world), [0, 0]);
    assert.equal(busiestLink(world), null);
  }],

  ["the busiest link is the one that carried the most packets, and keeps its count when edited", () => {
    const world = lab();
    const [hq, a, b] = world.sites;
    const busy = addLink(world, a.id, hq.id).link;
    run(world, 60);
    const top = busiestLink(world);
    assert.deepEqual([top.a, top.b].sort(), [hq.id, a.id].sort());
    assert.equal(top.linkId, busy.id);
    const before = top.packets;
    assert.ok(before > 0);
    // Bending it or making it a backbone keeps the same two ends, so the count carries on.
    assert.ok(reshapeLink(world, busy.id, { x: 585, y: 255 }).ok);
    const bent = world.links.find((l) => l.a === busy.a && l.b === busy.b) ?? world.links[0];
    assert.ok(makeBackbone(world, bent.id).ok);
    run(world, 30);
    const after = busiestLink(world);
    assert.ok(after.packets > before, `${after.packets} > ${before}`);
    assert.notEqual(after.linkId, null);
    // A link to the other office that carried less doesn't win.
    addLink(world, b.id, hq.id);
    run(world, 5);
    assert.deepEqual([busiestLink(world).a, busiestLink(world).b].sort(), [hq.id, a.id].sort());
  }],

  ["the report names the busiest link and the site that ended the run", () => {
    const world = lab({ outages: true });
    const [hq, a] = world.sites;
    addLink(world, a.id, hq.id);
    run(world, WEEK * 3);
    assert.ok(world.over, "the unlinked office goes down");
    const report = runReport(world);
    assert.equal(report.ended.siteId, world.over.siteId);
    assert.equal(report.ended.name, "Office");
    assert.equal(report.ended.bornDay, 0);
    assert.match(report.ended.when, /^Week \d+, (Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    assert.deepEqual([report.busiest.from, report.busiest.to].sort(), ["Data center (HQ)", "Office"]);
    assert.match(busiestHtml(report.busiest), /(Office ↔ Data center \(HQ\)|Data center \(HQ\) ↔ Office)/);
    assert.match(endedHtml(report.ended, DATA.sites), /There from the start · \d+ links? · down Week \d+, \w{3}/);
    assert.match(busiestHtml(null), /No packets moved yet/);
  }],

  ["the week chart labels every bar, then thins labels out on long runs", () => {
    const short = weekChartHtml([10, 40, 5]);
    assert.equal((short.match(/class="wk[ "]/g) ?? []).length, 3);
    assert.match(short, /wk-partial/);
    assert.match(short, /Week 2: 40 packets/);
    const long = weekChartHtml(Array.from({ length: 16 }, (_, i) => i * 10));
    const labels = long.match(/<span class="wk-lbl">W\d+<\/span>/g);
    assert.ok(labels.length < 16 && labels.at(-1).includes("W16"), labels.join(""));
  }],
];
