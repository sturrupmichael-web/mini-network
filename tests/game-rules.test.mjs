import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { distanceToPolyline } from "../src/sim/geometry.js";
import { chooseReward, clock, findSiteSpot } from "../src/sim/progression.js";
import { addLink, findLink, isHalted, removeLink, rerouteLink, siteCapacity, snapshot, step } from "../src/sim/world.js";
import { configWith, customMap, makeWorld } from "./helpers.mjs";

const TPS = CONFIG.sim.tickRate;
const run = (world, ticks) => {
  for (let i = 0; i < ticks; i++) step(world);
};
const runUntil = (world, cond, maxTicks = TPS * 60 * 30) => {
  for (let i = 0; i < maxTicks && !cond(world); i++) step(world);
  assert.ok(cond(world), "condition reached");
};
const weekSeconds = CONFIG.time.secondsPerDay * CONFIG.time.daysPerWeek;
/** Config with no new sites, so tests control the map. */
const noGrowth = (extra = {}) => configWith({ growth: { firstSiteAt: 1e9 }, ...extra });

export const tests = [
  ["an overloaded site's timer fills, and an outage ends the game", () => {
    const world = makeWorld({ config: noGrowth() });
    const office = world.sites.find((s) => s.type === "office");
    runUntil(world, () => office.queue.length > siteCapacity(world, office));
    run(world, TPS * 2);
    assert.ok(office.overload > 1.5, "timer is filling");
    runUntil(world, (w) => w.over !== null);
    assert.ok(world.sites.some((s) => s.id === world.over.siteId));
    assert.ok(isHalted(world));
    const tick = world.tick;
    run(world, 100);
    assert.equal(world.tick, tick, "nothing moves after game over");
    assert.equal(addLink(world, world.sites[0].id, world.sites[1].id).reason, "over");
  }],
  ["clearing the queue drains the timer", () => {
    const world = makeWorld({ config: noGrowth() });
    const hub = world.sites.find((s) => s.type === "datacenter");
    const office = world.sites.find((s) => s.type === "office");
    runUntil(world, () => office.overload > 5);
    const before = office.overload;
    addLink(world, office.id, hub.id);
    runUntil(world, () => office.queue.length <= siteCapacity(world, office));
    run(world, TPS * 2);
    assert.ok(office.overload < before, `timer went down (${before.toFixed(2)} → ${office.overload.toFixed(2)})`);
  }],
  ["zen mode never ends in an outage", () => {
    const world = makeWorld({ config: noGrowth(), outages: false });
    run(world, TPS * 120);
    assert.equal(world.over, null);
    assert.ok(world.sites.some((s) => s.overload === CONFIG.overload.seconds), "timer tops out");
  }],
  ["the clock counts days and weeks", () => {
    const world = makeWorld({ config: noGrowth({ overload: { seconds: 1e9 } }) });
    run(world, Math.round(CONFIG.time.secondsPerDay * 2.5 * TPS));
    const c = clock(world);
    assert.equal(c.day, 2);
    assert.equal(c.week, 1);
    assert.equal(c.dayOfWeek, 2);
    assert.ok(Math.abs(c.dayFraction - 0.5) < 0.01);
  }],
  ["a link is delivered every day", () => {
    const world = makeWorld({ config: noGrowth({ overload: { seconds: 1e9 } }) });
    const start = world.inventory.links;
    run(world, Math.round(CONFIG.time.secondsPerDay * 3.1 * TPS));
    assert.equal(world.inventory.links, start + 3 * CONFIG.links.perDay);
  }],
  ["each week ends with a choice of two different rewards", () => {
    const world = makeWorld({ config: noGrowth({ overload: { seconds: 1e9 } }) });
    runUntil(world, (w) => w.pendingReward !== null);
    assert.ok(Math.abs(world.time - weekSeconds) < 0.05, `at the end of week 1 (t=${world.time})`);
    const { options, week } = world.pendingReward;
    assert.equal(week, 1);
    assert.equal(options.length, 2);
    assert.notEqual(options[0], options[1]);
    for (const id of options) assert.ok(world.data.rewards.find((r) => r.id === id && r.fromWeek <= 1));
    const tick = world.tick;
    run(world, 50);
    assert.equal(world.tick, tick, "the game waits for a choice");
    assert.equal(chooseReward(world, "not-a-reward").ok, false);
    const links = world.inventory.links;
    const capacity = world.bonus.capacity;
    const reward = world.data.rewards.find((r) => r.id === options[0]);
    assert.ok(chooseReward(world, options[0]).ok);
    assert.equal(world.inventory.links, links + (reward.grant.links ?? 0));
    assert.equal(world.bonus.capacity, capacity + (reward.grant.capacity ?? 0));
    assert.equal(world.pendingReward, null);
    assert.ok(world.trafficScale < 1, "traffic grows each week");
    run(world, 10);
    assert.ok(world.tick > tick, "and carries on");
  }],
  ["new sites appear over time, faster and faster", () => {
    const world = makeWorld({ config: configWith({ overload: { seconds: 1e9 } }) });
    const start = world.sites.length;
    const gaps = [];
    let last = 0;
    for (let i = 0; i < TPS * 60 * 6; i++) {
      if (world.pendingReward) chooseReward(world, world.pendingReward.options[0]);
      const n = world.sites.length;
      step(world);
      if (world.sites.length > n) {
        gaps.push(world.time - last);
        last = world.time;
      }
    }
    assert.ok(world.sites.length >= start + 8, `sites: ${world.sites.length}`);
    assert.ok(gaps.at(-1) < gaps[1], "gaps shrink");
    assert.equal(world.stats.sitesAdded, world.sites.length - start);
  }],
  ["new sites are in valid spots", () => {
    const config = configWith({ overload: { seconds: 1e9 } });
    const world = makeWorld({ config });
    for (let i = 0; i < TPS * 60 * 8; i++) {
      if (world.pendingReward) chooseReward(world, world.pendingReward.options[0]);
      step(world);
    }
    const { edgeMargin, minSpacing, boundaryClearance } = config.sites;
    const added = world.sites.filter((s) => s.born > 0);
    assert.ok(added.length > 10);
    for (const s of added) {
      assert.ok(s.x >= edgeMargin && s.x <= world.map.width - edgeMargin, "inside the edges");
      assert.ok(s.y >= edgeMargin && s.y <= world.map.height - edgeMargin, "inside the edges");
      for (const o of world.sites) if (o !== s) assert.ok(Math.hypot(o.x - s.x, o.y - s.y) >= minSpacing, "spaced out");
      for (const b of world.map.boundaries) {
        assert.ok(distanceToPolyline(s, b.map(([x, y]) => ({ x, y }))) >= boundaryClearance, "clear of boundaries");
      }
    }
  }],
  ["new sites never appear on top of a link", () => {
    const config = configWith({ overload: { seconds: 1e9 } });
    const world = makeWorld({ config, seed: "on-links" });
    world.inventory.links = 999;
    world.inventory.leased = 99;
    const hub = world.sites.find((s) => s.type === "datacenter");
    const linkAll = () => {
      for (const s of world.sites) {
        if (s !== hub && s.links.length === 0 && !world.data.sites[s.type].junction) addLink(world, s.id, hub.id);
      }
    };
    linkAll();
    for (let i = 0; i < TPS * 60 * 8; i++) {
      if (world.pendingReward) chooseReward(world, world.pendingReward.options[0]);
      const before = world.sites.length;
      step(world);
      for (const s of world.sites.slice(before)) {
        for (const l of world.links) {
          assert.ok(distanceToPolyline(s, l.path) >= config.sites.linkClearance, `site ${s.id} sits on link ${l.id}`);
        }
      }
      linkAll();
    }
    assert.ok(world.sites.length > 12, `sites still appear: ${world.sites.length}`);
  }],
  ["no spot is found on a full map", () => {
    const start = [{ type: "datacenter", x: 600, y: 400 }];
    for (let x = 60; x <= 1140; x += 100) for (let y = 60; y <= 740; y += 100) start.push({ type: "office", x, y });
    const world = makeWorld({ map: customMap(start) });
    assert.equal(findSiteSpot(world), null);
  }],
  ["site spawning is deterministic", () => {
    const play = () => {
      const w = makeWorld({ seed: "spawn" });
      for (let i = 0; i < TPS * 200; i++) {
        if (w.pendingReward) chooseReward(w, w.pendingReward.options[1]);
        step(w);
      }
      return snapshot(w);
    };
    assert.equal(play(), play());
  }],
  ["removing a link refunds it and returns its packets", () => {
    const world = makeWorld({ config: noGrowth() });
    const hub = world.sites.find((s) => s.type === "datacenter");
    const office = world.sites.find((s) => s.type === "office");
    runUntil(world, () => office.queue.length >= 3);
    const link = addLink(world, office.id, hub.id).link;
    const before = world.inventory.links;
    runUntil(world, (w) => w.packets.some((p) => p.linkId === link.id));
    const travelling = world.packets.filter((p) => p.linkId === link.id).map((p) => p.id);
    assert.ok(removeLink(world, link.id).ok);
    assert.equal(world.inventory.links, before + 1);
    assert.equal(findLink(world, office.id, hub.id), null);
    assert.equal(office.links.length, 0);
    for (const id of travelling) assert.ok(office.queue.includes(id), "packet is back in the queue");
    assert.ok(world.packets.every((p) => p.linkId !== link.id));
    run(world, TPS * 5);
    assert.equal(removeLink(world, link.id).reason, "unknown-link");
  }],
  ["rerouting A–B through C makes A–C and C–B", () => {
    const world = makeWorld({ config: noGrowth() });
    const [hub, a, b] = world.sites;
    const link = addLink(world, a.id, hub.id, 3).link;
    const before = world.inventory.links;
    assert.ok(rerouteLink(world, link.id, b.id).ok);
    assert.equal(findLink(world, a.id, hub.id), null);
    assert.ok(findLink(world, a.id, b.id));
    assert.ok(findLink(world, b.id, hub.id));
    assert.equal(findLink(world, a.id, b.id).line, 3, "keeps the line colour");
    assert.equal(world.inventory.links, before - 1, "costs one extra link");
    assert.equal(rerouteLink(world, findLink(world, a.id, b.id).id, a.id).reason, "same-site");
  }],
  ["rerouting reuses links that already exist", () => {
    const world = makeWorld({ config: noGrowth() });
    const [hub, a, b] = world.sites;
    addLink(world, b.id, hub.id);
    const link = addLink(world, a.id, hub.id).link;
    const before = world.inventory.links;
    assert.ok(rerouteLink(world, link.id, b.id).ok);
    assert.equal(world.inventory.links, before, "one refunded, one used");
  }],
  ["rerouting with no links left is refused and changes nothing", () => {
    const world = makeWorld({ config: noGrowth({ links: { startingCount: 1, perDay: 0 } }) });
    const [hub, a, b] = world.sites;
    const link = addLink(world, a.id, hub.id).link;
    assert.equal(rerouteLink(world, link.id, b.id).reason, "no-links");
    assert.ok(findLink(world, a.id, hub.id));
  }],
];
