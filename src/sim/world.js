/**
 * The simulation. Pure data and functions: no DOM, no canvas, no timers.
 * The game loop calls step(world) a fixed number of times per game second;
 * the renderer only reads `world`.
 *
 * Everything random goes through world.rng, so the same seed and the same
 * player actions (on the same ticks) always produce the same game.
 *
 * The pieces live in their own modules; this one creates the world, runs
 * a tick, and re-exports the player actions so callers have one import.
 */
import { createRng } from "../rng.js";
import { initEvents, updateEvents } from "./events.js";
import { dispatchQueues, movePackets, spawnPackets } from "./packets.js";
import { initProgression, updateProgression } from "./progression.js";
import { computeRoutes } from "./routing.js";
import { addSite, siteCapacity } from "./sites.js";
import { buildTerrain } from "./grid.js";
import { updateView } from "./view.js";

export { addSite, siteCapacity } from "./sites.js";
export { addFirewall, addLink, findLink, makeBackbone, removeLink, rerouteLink, upgradeLink } from "./links.js";
export { addCoreRouter, addQos, addSdwan, placeSwitch, placeSwitchOnLink, removeSwitch } from "./equipment.js";
export { chooseReward } from "./progression.js";
export { setEventSchedule, triggerEvent } from "./events.js";

/**
 * Create a new world.
 * @param {object} opts
 * @param {object} opts.config  CONFIG from data/config.js
 * @param {object} opts.data    SIM_DATA from data/index.js: { sites, traffic, rewards, events, tiers }
 * @param {object} opts.map     One entry of MAPS
 * @param {number|string} opts.seed
 * @param {boolean} [opts.outages]  false for Zen mode: overloads never end the game.
 */
export function createWorld({ config, data, map, seed, outages = true }) {
  const world = {
    config,
    data,
    map,
    seed,
    rng: createRng(seed),
    tick: 0,
    time: 0,
    dt: 1 / config.sim.tickRate,
    nextId: 1,
    sites: [],
    siteById: new Map(),
    links: [],
    linkById: new Map(),
    packets: [],
    outages,
    inventory: { links: config.links.startingCount, ...config.inventory },
    /** Permanent boosts from rewards. */
    bonus: { capacity: 0 },
    stats: { spawned: 0, delivered: 0, score: 0, sitesAdded: 0, dropped: 0, filtered: 0, lost: 0 },
    /** True once the security-rules event has happened (edge links need firewalls). */
    security: false,
    /** Fraction of cloud-eligible traffic sent to the cloud (after a migration). */
    cloudShare: 0,
    /** Set when the game ends: { siteId, time }. */
    over: null,
    /**
     * Set at the end of each week until the player picks:
     * { week, options: [rewardId, rewardId], delivered: { links: 8 } }.
     * `delivered` (config.rewards.weekly) is already in the inventory.
     */
    pendingReward: null,
    routing: { tables: new Map(), dirty: true, nextRecompute: 0 },
    /** For each day, the closest any site came to an outage (0–1): the daily share grid. */
    dayStress: [0],
    /** Whether events fire on their schedule (data/events.js). */
    scheduleEvents: true,
    /** Things that happened this tick, for audio and UI. Cleared by the consumer. */
    events: [],
  };
  initProgression(world);
  /** Cell key → terrain kind (grid.js). */
  world.terrain = buildTerrain(world);
  for (const s of map.start) addSite(world, s.type, s.x, s.y, s.label);
  updateView(world);
  initEvents(world);
  return world;
}

/** True when the world is waiting on the player (reward) or finished. */
export function isHalted(world) {
  return world.over !== null || world.pendingReward !== null;
}

/** Advance the simulation by exactly one tick (does nothing while halted). */
export function step(world) {
  if (isHalted(world)) return;
  world.tick++;
  world.time = world.tick * world.dt;

  updateProgression(world);
  updateEvents(world);
  if (world.sites.length !== world.viewSites) updateView(world);
  if (world.routing.dirty || world.time >= world.routing.nextRecompute) computeRoutes(world);

  spawnPackets(world);
  dispatchQueues(world);
  movePackets(world);
  updateOverload(world);
}

function updateOverload(world) {
  const { seconds, recoveryRate, warnAt = 0.7 } = world.config.overload;
  let worst = 0;
  for (const site of world.sites) worst = Math.max(worst, site.overload / seconds);
  while (world.dayStress.length <= world.day) world.dayStress.push(0);
  world.dayStress[world.day] = Math.min(1, Math.max(world.dayStress[world.day], worst));
  for (const site of world.sites) {
    const over = site.queue.length > siteCapacity(world, site);
    const before = site.overload;
    site.overload = over ? site.overload + world.dt : Math.max(0, site.overload - world.dt * recoveryRate);
    if (before === 0 && site.overload > 0) world.events.push({ type: "overload-start", siteId: site.id });
    // "Almost full": once per climb past warnAt (only when an outage would end the game).
    if (world.outages && before < seconds * warnAt && site.overload >= seconds * warnAt) {
      world.events.push({ type: "overload-warning", siteId: site.id });
    }
    if (site.overload >= seconds) {
      if (world.outages) {
        world.over = { siteId: site.id, time: world.time };
        world.events.push({ type: "outage", siteId: site.id });
        return;
      }
      site.overload = seconds;
    }
  }
}

/**
 * A plain-data snapshot of everything that changes during play. Two worlds
 * with the same seed and inputs produce identical snapshots.
 */
export function snapshot(world) {
  return JSON.stringify({
    tick: world.tick,
    rng: world.rng.state,
    over: world.over,
    pendingReward: world.pendingReward,
    week: world.week,
    day: world.day,
    bonus: world.bonus,
    growth: world.growth,
    security: world.security,
    cloudShare: world.cloudShare,
    eventPlan: world.eventPlan,
    eventQueue: world.eventQueue,
    activeEvents: world.activeEvents,
    nextId: world.nextId,
    stats: world.stats,
    dayStress: world.dayStress,
    inventory: world.inventory,
    sites: world.sites.map((s) => [s.id, s.type, s.x, s.y, s.queue, s.nextSpawn, s.links, s.overload, s.sdwan, s.core, s.qos, s.busyUntil]),
    links: world.links.map((l) => [l.id, l.a, l.b, l.busyUntil, l.inTransit, l.tier, l.firewall, l.leased, l.down, l.backbone, l.length]),
    packets: world.packets.map((p) => [p.id, p.traffic, p.to, p.at, p.linkId, p.dir, p.progress, p.hops]),
  });
}
