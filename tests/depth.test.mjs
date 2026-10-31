import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { createPacket, availableTraffic } from "../src/sim/packets.js";
import { computeRoutes, nextHop } from "../src/sim/routing.js";
import { isNight } from "../src/sim/sites.js";
import { linkBandwidth, isBlocked } from "../src/sim/links.js";
import {
  addFirewall,
  addLink,
  addSdwan,
  chooseReward,
  findLink,
  placeSwitch,
  placeSwitchOnLink,
  removeLink,
  removeSwitch,
  setEventSchedule,
  snapshot,
  step,
  triggerEvent,
  upgradeLink,
} from "../src/sim/world.js";
import { configWith, customMap, makeWorld } from "./helpers.mjs";

const TPS = CONFIG.sim.tickRate;
const DAY = CONFIG.time.secondsPerDay;
const run = (world, seconds) => {
  for (let i = 0; i < Math.round(seconds * TPS); i++) {
    if (world.pendingReward) chooseReward(world, world.pendingReward.options[0]);
    step(world);
  }
};
/** No new sites, no outages, no scheduled events: a quiet lab. */
const lab = (extra = {}) =>
  configWith({ growth: { firstSiteAt: 1e9 }, overload: { seconds: 1e9 }, ...extra });
const labWorld = (start, opts = {}) => {
  const world = makeWorld({ config: lab(opts.config ?? {}), map: customMap(start), seed: opts.seed ?? "lab" });
  setEventSchedule(world, false);
  return world;
};

export const tests = [
  ["bandwidth upgrades raise a link's tier, and removal refunds them", () => {
    const world = makeWorld({ config: lab({ inventory: { ...CONFIG.inventory, upgrades: 5 } }) });
    const [hub, a] = world.sites;
    const link = addLink(world, a.id, hub.id).link;
    const base = linkBandwidth(world, link);
    assert.ok(upgradeLink(world, link.id).ok);
    assert.ok(linkBandwidth(world, link) > base);
    while (link.tier < world.data.tiers.length - 1) assert.ok(upgradeLink(world, link.id).ok);
    assert.equal(upgradeLink(world, link.id).reason, "max-tier");
    const used = 5 - world.inventory.upgrades;
    removeLink(world, link.id);
    assert.equal(world.inventory.upgrades, 5, `refunded ${used}`);
  }],
  ["upgraded links drain queues faster", () => {
    const backlog = (upgrades) => {
      const world = makeWorld({ config: lab({ links: { ...CONFIG.links, bandwidth: 0.15 }, inventory: { ...CONFIG.inventory, upgrades: 9 } }) });
      const hub = world.sites[0];
      for (const o of world.sites.slice(1)) {
        const l = addLink(world, o.id, hub.id).link;
        for (let i = 0; i < upgrades; i++) upgradeLink(world, l.id);
      }
      run(world, 60);
      return world.sites.slice(1).reduce((n, s) => n + s.queue.length, 0);
    };
    assert.ok(backlog(3) < backlog(0), `${backlog(3)} < ${backlog(0)}`);
  }],
  ["no upgrades left is refused", () => {
    const world = makeWorld({ config: lab({ inventory: { ...CONFIG.inventory, upgrades: 0 } }) });
    const link = addLink(world, world.sites[1].id, world.sites[0].id).link;
    assert.equal(upgradeLink(world, link.id).reason, "no-upgrades");
  }],
  ["crossing a carrier boundary uses a leased line", () => {
    const map = customMap([
      { type: "datacenter", x: 200, y: 400 },
      { type: "office", x: 800, y: 400 },
      { type: "office", x: 200, y: 150 },
    ]);
    map.boundaries = [[[500, 0], [500, 800]]];
    const world = makeWorld({ config: lab({ inventory: { ...CONFIG.inventory, leased: 1 } }), map });
    const [hub, far, near] = world.sites;
    assert.ok(addLink(world, near.id, hub.id).ok);
    assert.equal(world.inventory.leased, 1, "same side: no leased line");
    const link = addLink(world, far.id, hub.id).link;
    assert.equal(link.leased, 1);
    assert.equal(world.inventory.leased, 0);
    assert.equal(addLink(world, far.id, near.id).reason, "no-leased");
    removeLink(world, link.id);
    assert.equal(world.inventory.leased, 1, "refunded");
  }],
  ["switches: placed on the map, split links, and come back when removed", () => {
    const world = makeWorld({ config: lab({ inventory: { ...CONFIG.inventory, switches: 2, upgrades: 2 } }) });
    const [hub, a] = world.sites;
    assert.equal(placeSwitch(world, hub.x + 5, hub.y).reason, "too-close");
    assert.equal(placeSwitch(world, -100, 50).reason, "off-map");
    const link = addLink(world, a.id, hub.id).link;
    upgradeLink(world, link.id);
    const links = world.inventory.links;
    const mid = link.path[1] ?? { x: (a.x + hub.x) / 2, y: (a.y + hub.y) / 2 };
    const r = placeSwitchOnLink(world, link.id, mid.x + 3, mid.y + 3);
    assert.ok(r.ok, r.reason);
    assert.equal(findLink(world, a.id, hub.id), null);
    const s1 = findLink(world, a.id, r.site.id);
    const s2 = findLink(world, r.site.id, hub.id);
    assert.ok(s1 && s2, "split into two");
    assert.ok(s1.tier === 1 && s2.tier === 1, "tier kept");
    assert.equal(world.inventory.links, links, "the split is free");
    assert.equal(world.inventory.upgrades, 1);
    run(world, 30);
    assert.ok(world.stats.delivered > 0, "traffic flows through the switch");
    const switches = world.inventory.switches;
    const linksBefore = world.inventory.links;
    assert.ok(removeSwitch(world, r.site.id).ok);
    assert.equal(world.inventory.switches, switches + 1);
    assert.equal(world.inventory.links, linksBefore + 2);
    assert.ok(!world.siteById.has(r.site.id));
    assert.equal(removeSwitch(world, hub.id).reason, "not-a-switch");
  }],
  ["firewalls: edge links are blocked without one, and junk is filtered", () => {
    const world = labWorld([
      { type: "datacenter", x: 300, y: 400 },
      { type: "office", x: 600, y: 400 },
      { type: "edge", x: 900, y: 400 },
    ]);
    world.inventory.firewalls = 0;
    world.security = true;
    const [hub, office, edge] = world.sites;
    const toEdge = addLink(world, office.id, edge.id).link;
    addLink(world, office.id, hub.id);
    assert.ok(isBlocked(world, toEdge), "blocked without a firewall");
    computeRoutes(world);
    assert.equal(nextHop(world, office, "edge"), null, "no route to the internet");
    assert.equal(addFirewall(world, toEdge.id).reason, "no-firewalls");
    world.inventory.firewalls = 1;
    assert.ok(addFirewall(world, toEdge.id).ok);
    assert.equal(addFirewall(world, toEdge.id).reason, "has-firewall");
    computeRoutes(world);
    assert.equal(nextHop(world, office, "edge").id, toEdge.id);
    for (let i = 0; i < 10; i++) createPacket(world, edge, "junk", "datacenter");
    run(world, 15);
    assert.equal(world.stats.filtered, 10, "the firewall ate the junk");
    assert.ok(world.packets.every((p) => p.traffic !== "junk"));
  }],
  ["cut links: SD-WAN sites reroute at once, others wait for convergence", () => {
    const world = labWorld([
      { type: "datacenter", x: 600, y: 400 },
      { type: "office", x: 300, y: 400 },
      { type: "office", x: 300, y: 150 },
    ]);
    const [hub, a, b] = world.sites;
    const direct = addLink(world, a.id, hub.id).link;
    addLink(world, a.id, b.id);
    addLink(world, b.id, hub.id);
    computeRoutes(world);
    assert.equal(nextHop(world, a, "datacenter").id, direct.id);
    direct.down = { since: world.time, until: world.time + 30 };
    computeRoutes(world);
    assert.equal(nextHop(world, a, "datacenter").id, direct.id, "no SD-WAN: still trying the dead link");
    world.inventory.sdwan = 1;
    assert.ok(addSdwan(world, a.id).ok);
    assert.equal(addSdwan(world, a.id).reason, "has-sdwan");
    assert.notEqual(nextHop(world, a, "datacenter").id, direct.id, "SD-WAN reroutes");
    a.sdwan = false;
    world.time += CONFIG.failover.convergenceSeconds + 0.1;
    computeRoutes(world);
    assert.notEqual(nextHop(world, a, "datacenter").id, direct.id, "after convergence everyone reroutes");
  }],
  ["packets wait while their link is cut", () => {
    const world = labWorld([
      { type: "datacenter", x: 600, y: 400 },
      { type: "office", x: 300, y: 400 },
    ]);
    const [hub, a] = world.sites;
    const link = addLink(world, a.id, hub.id).link;
    link.down = { since: 0, until: 1e9 };
    run(world, 25);
    assert.equal(world.stats.delivered, 0);
    assert.ok(a.queue.length > 0);
  }],
  ["VoIP and payments drop after too many hops", () => {
    const start = [{ type: "datacenter", x: 100, y: 400 }];
    for (let i = 1; i <= 5; i++) start.push({ type: "office", x: 100 + i * 180, y: 400 });
    const world = labWorld(start);
    for (let i = 1; i < world.sites.length; i++) addLink(world, world.sites[i].id, world.sites[i - 1].id);
    const far = world.sites.at(-1);
    world.stats.score = 10;
    createPacket(world, far, "voip", "datacenter");
    for (const s of world.sites) s.nextSpawn = Infinity;
    for (let i = 0; i < TPS * 30 && world.stats.dropped === 0; i++) step(world);
    assert.equal(world.stats.dropped, 1);
    assert.equal(world.stats.score, 10 - world.data.traffic.voip.dropPoints);
    assert.ok(world.sites.some((s) => s.overload > 0), "the drop added an overload penalty");
  }],
  ["new traffic unlocks over time, and backups only run at night", () => {
    const world = labWorld([
      { type: "datacenter", x: 600, y: 400 },
      { type: "office", x: 300, y: 400 },
    ]);
    const office = world.sites[1];
    assert.ok(!("voip" in availableTraffic(world, office)), "no VoIP on day 0");
    assert.ok(!("web" in availableTraffic(world, office)), "no web without an internet edge");
    world.time = DAY * 8 + DAY * 0.5;
    assert.ok(!isNight(world));
    const day = availableTraffic(world, office);
    assert.ok("voip" in day && "video" in day && !("backup" in day));
    world.time = DAY * 8 + DAY * 0.9;
    assert.ok(isNight(world));
    const night = availableTraffic(world, office);
    assert.ok("backup" in night && !("voip" in night));
  }],
  ["backhoe cut takes a link down, then brings it back", () => {
    const world = labWorld([
      { type: "datacenter", x: 600, y: 400 },
      { type: "office", x: 300, y: 400 },
    ]);
    assert.equal(triggerEvent(world, "backhoe"), false, "nothing to cut yet");
    const link = addLink(world, world.sites[1].id, world.sites[0].id).link;
    assert.ok(triggerEvent(world, "backhoe"));
    assert.ok(link.down);
    assert.ok(world.events.some((e) => e.type === "event" && e.id === "backhoe" && e.toast));
    run(world, 31);
    assert.equal(link.down, null);
  }],
  ["broadcasts go from the data center to every reachable site", () => {
    const world = labWorld([
      { type: "datacenter", x: 600, y: 400 },
      { type: "office", x: 300, y: 400 },
      { type: "office", x: 900, y: 400 },
      { type: "office", x: 600, y: 100 },
    ]);
    const [hub, a, b] = world.sites;
    addLink(world, a.id, hub.id);
    addLink(world, b.id, hub.id);
    computeRoutes(world);
    for (const s of world.sites) s.nextSpawn = Infinity;
    assert.ok(triggerEvent(world, "patch-tuesday"));
    run(world, 40);
    const perSite = world.data.events.find((e) => e.id === "patch-tuesday").params.perSite;
    assert.equal(world.stats.delivered, perSite * 2, "only the two linked offices");
  }],
  ["acquisition, security rules and cloud migration add sites", () => {
    const world = labWorld([
      { type: "datacenter", x: 300, y: 300 },
      { type: "office", x: 500, y: 300 },
    ]);
    const before = world.sites.length;
    assert.ok(triggerEvent(world, "acquisition"));
    const added = world.sites.slice(before);
    assert.equal(added.length, 3);
    for (const s of added) assert.ok(Math.hypot(s.x - 300, s.y - 300) > 400, "far from HQ");
    const firewalls = world.inventory.firewalls;
    assert.ok(triggerEvent(world, "security-rules"));
    assert.ok(world.security);
    assert.equal(world.sites.filter((s) => s.type === "edge").length, 1);
    assert.ok(world.inventory.firewalls > firewalls);
    assert.equal(triggerEvent(world, "security-rules"), false, "only one edge");
    assert.ok(triggerEvent(world, "cloud-migration"));
    assert.equal(world.sites.filter((s) => s.type === "cloud").length, 1);
    assert.ok(world.cloudShare > 0);
  }],
  ["after a cloud migration some traffic heads to the cloud", () => {
    const world = labWorld([
      { type: "datacenter", x: 300, y: 300 },
      { type: "office", x: 500, y: 300 },
      { type: "office", x: 300, y: 500 },
    ]);
    triggerEvent(world, "cloud-migration");
    run(world, 120);
    const emails = world.packets.filter((p) => p.traffic === "email");
    assert.ok(emails.some((p) => p.to === "cloud") && emails.some((p) => p.to === "datacenter"));
  }],
  ["DDoS needs an internet edge, then floods it with junk", () => {
    const world = labWorld([
      { type: "datacenter", x: 300, y: 300 },
      { type: "office", x: 500, y: 300 },
    ]);
    assert.equal(triggerEvent(world, "ddos"), false);
    triggerEvent(world, "security-rules");
    const edge = world.sites.find((s) => s.type === "edge");
    addLink(world, edge.id, world.sites[0].id);
    assert.ok(triggerEvent(world, "ddos"));
    run(world, 5);
    assert.ok(world.stats.spawned > 0);
    // Blocked (no firewall) with nowhere to go: the junk fizzles out.
    assert.ok(world.packets.filter((p) => p.traffic === "junk").length === 0);
  }],
  ["the event schedule fires through a long game, deterministically", () => {
    const play = () => {
      const world = makeWorld({ config: configWith({ overload: { seconds: 1e9 } }), seed: "events" });
      const fired = [];
      const hub = world.sites[0];
      for (let i = 0; i < TPS * DAY * 16; i++) {
        if (world.pendingReward) chooseReward(world, world.pendingReward.options[0]);
        // Keep things linked so link-dependent events have something to act on.
        for (const s of world.sites) if (s.links.length === 0 && s !== hub && world.inventory.links > 0) addLink(world, s.id, hub.id);
        step(world);
        for (const e of world.events) if (e.type === "event") fired.push(`${Math.floor(world.time / DAY)}:${e.id}`);
        world.events.length = 0;
      }
      return { fired, snap: snapshot(world) };
    };
    const a = play();
    const b = play();
    assert.deepEqual(a.fired, b.fired);
    assert.equal(a.snap, b.snap);
    for (const id of ["backhoe", "patch-tuesday", "security-rules", "acquisition", "ddos", "all-hands", "cloud-migration"]) {
      assert.ok(a.fired.some((f) => f.endsWith(`:${id}`)), `${id} fired (${a.fired.join(", ")})`);
    }
    const tuesdays = a.fired.filter((f) => f.endsWith(":patch-tuesday")).map((f) => Number(f.split(":")[0]));
    assert.ok(tuesdays.every((d) => d % 7 === 1 && d >= 7), `Patch Tuesday on Tuesdays from week 2 (${tuesdays})`);
  }],
  ["warehouses and retail branches start appearing once unlocked", () => {
    const world = makeWorld({ config: configWith({ overload: { seconds: 1e9 } }), seed: "types" });
    run(world, DAY * 10);
    const types = new Set(world.sites.map((s) => s.type));
    assert.ok(types.has("warehouse") && types.has("retail"), [...types].join(", "));
    for (const s of world.sites) {
      if (s.born > 0) assert.ok(Math.floor(s.born / DAY) >= world.data.sites[s.type].unlockDay || s.type === "edge" || s.type === "cloud");
    }
  }],
];
