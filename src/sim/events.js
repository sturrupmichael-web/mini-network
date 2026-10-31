/**
 * Events (data/events.js): scheduling them, starting them, running their
 * effects, and ending them. Part of the simulation, so every event is
 * seeded and deterministic.
 */
import { createPacket } from "./packets.js";
import { findSpot } from "./progression.js";
import { costToDestination } from "./routing.js";
import { addSite, currentDay, hubSite } from "./sites.js";

const NON_TARGETS = new Set(["datacenter", "cloud", "edge"]);

/**
 * Effect handlers. start() returns false to skip (nothing to act on) or a
 * state object. tick() runs every step while active; end() cleans up.
 */
const EFFECTS = {
  linkCut: {
    start(world, ev) {
      const candidates = world.links.filter((l) => !l.down);
      if (candidates.length === 0) return false;
      const cut = [];
      for (let i = 0; i < ev.params.count && candidates.length > 0; i++) {
        const index = world.rng.int(0, candidates.length - 1);
        const link = candidates.splice(index, 1)[0];
        link.down = { since: world.time, until: world.time + ev.duration };
        cut.push(link.id);
      }
      world.routing.dirty = true;
      return { cut };
    },
    end(world, _ev, state) {
      for (const id of state.cut) {
        const link = world.linkById.get(id);
        if (link) link.down = null;
      }
      world.routing.dirty = true;
    },
  },

  broadcast: {
    start(world, ev) {
      const hub = hubSite(world);
      if (!hub) return false;
      // Only sites the data center can actually reach, or the packets would
      // pile up at HQ through no fault of the player's.
      const targets = world.sites.filter(
        (s) =>
          !NON_TARGETS.has(s.type) &&
          !world.data.sites[s.type].junction &&
          costToDestination(world, hub, `#${s.id}`) < Infinity,
      );
      if (targets.length === 0) return false;
      const plan = [];
      for (let round = 0; round < ev.params.perSite; round++) for (const t of targets) plan.push(t.id);
      return { hubId: hub.id, plan, sent: 0, startedAt: world.time };
    },
    tick(world, ev, state) {
      const hub = world.siteById.get(state.hubId);
      if (!hub) return;
      const progress = ev.duration > 0 ? Math.min(1, (world.time - state.startedAt) / ev.duration) : 1;
      const due = Math.ceil(progress * state.plan.length);
      while (state.sent < due) {
        const targetId = state.plan[state.sent++];
        if (world.siteById.has(targetId)) createPacket(world, hub, ev.params.traffic, `#${targetId}`);
      }
    },
  },

  acquisition: {
    start(world, ev) {
      const hub = hubSite(world) ?? { x: world.map.width / 2, y: world.map.height / 2 };
      const corners = [
        { x: 0, y: 0 },
        { x: world.map.width, y: 0 },
        { x: 0, y: world.map.height },
        { x: world.map.width, y: world.map.height },
      ];
      corners.sort((a, b) => Math.hypot(b.x - hub.x, b.y - hub.y) - Math.hypot(a.x - hub.x, a.y - hub.y));
      for (const corner of corners) {
        const placed = [];
        for (let i = 0; i < ev.params.count; i++) {
          // An acquisition can be outside the open area: the map opens up to it.
          const spot = findSpot(world, { center: corner, radius: world.map.height * 0.55, anywhere: true });
          if (!spot) break;
          const day = currentDay(world);
          const types = Object.fromEntries(
            Object.entries(ev.params.types).filter(([t]) => world.data.sites[t].unlockDay <= day),
          );
          const type = Object.keys(types).length ? world.rng.weighted(types) : "office";
          placed.push(addSite(world, type, spot.x, spot.y).id);
        }
        if (placed.length > 0) {
          for (const id of placed) world.events.push({ type: "site-added", siteId: id });
          return { placed };
        }
      }
      return false;
    },
  },

  securityRules: {
    start(world, ev) {
      if (world.sites.some((s) => s.type === "edge")) return false;
      const spot = farSpot(world);
      if (!spot) return false;
      const site = addSite(world, "edge", spot.x, spot.y, "NET");
      world.security = true;
      grant(world, ev.params.grant);
      world.events.push({ type: "site-added", siteId: site.id });
      return { siteId: site.id };
    },
  },

  cloudMigration: {
    start(world, ev) {
      if (world.sites.some((s) => s.type === "cloud")) return false;
      const spot = farSpot(world);
      if (!spot) return false;
      const site = addSite(world, "cloud", spot.x, spot.y);
      world.cloudShare = ev.params.share;
      world.events.push({ type: "site-added", siteId: site.id });
      return { siteId: site.id };
    },
  },

  ddos: {
    start(world) {
      if (!world.sites.some((s) => s.type === "edge")) return false;
      return { owed: 0 };
    },
    tick(world, ev, state) {
      const edges = world.sites.filter((s) => s.type === "edge");
      state.owed += ev.params.rate * world.dt;
      while (state.owed >= 1) {
        state.owed -= 1;
        for (const edge of edges) createPacket(world, edge, ev.params.traffic, world.data.traffic[ev.params.traffic].to);
      }
    },
  },
};

export const EFFECT_NAMES = Object.keys(EFFECTS);

function grant(world, items = {}) {
  for (const [k, v] of Object.entries(items)) world.inventory[k] = (world.inventory[k] ?? 0) + v;
}

/** A valid spot as far from the data center (and other far sites) as we can find. */
function farSpot(world) {
  const hub = hubSite(world) ?? { x: world.map.width / 2, y: world.map.height / 2 };
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const spot = findSpot(world, { center: hub, radius: Infinity });
    if (!spot) continue;
    const score = Math.hypot(spot.x - hub.x, spot.y - hub.y);
    if (score > bestScore) {
      best = spot;
      bestScore = score;
    }
  }
  return best;
}

export function initEvents(world) {
  world.eventPlan = {};
  for (const ev of world.data.events) {
    world.eventPlan[ev.id] = { nextDay: ev.schedule.day ?? null, fired: 0 };
  }
  /** Events due to start later today: [{ id, at }]. */
  world.eventQueue = [];
  /** Running events: [{ id, until, state }]. */
  world.activeEvents = [];
  scheduleDay(world, 0);
}

/** Turn the event schedule on or off (tests and the debug panel). Manual triggers still work. */
export function setEventSchedule(world, on) {
  world.scheduleEvents = on;
  if (!on) world.eventQueue.length = 0;
}

/** Called at the start of each day: decide which events fire today, and when. */
export function scheduleDay(world, day) {
  if (!world.scheduleEvents) return;
  const { secondsPerDay, daysPerWeek } = world.config.time;
  for (const ev of world.data.events) {
    const plan = world.eventPlan[ev.id];
    const s = ev.schedule;
    let due = false;
    if (s.weekday !== undefined) {
      due = day % daysPerWeek === s.weekday && Math.floor(day / daysPerWeek) + 1 >= (s.fromWeek ?? 1);
    } else if (plan.nextDay !== null && day >= plan.nextDay) {
      due = true;
      plan.nextDay = s.every ? day + world.rng.int(s.every[0], s.every[1]) : null;
    }
    if (due) world.eventQueue.push({ id: ev.id, at: day * secondsPerDay + world.rng.range(0.15, 0.55) * secondsPerDay });
  }
  world.eventQueue.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

/** Start an event now. Returns true if it started. Used by the schedule and the debug panel. */
export function triggerEvent(world, id) {
  const ev = world.data.events.find((e) => e.id === id);
  if (!ev) return false;
  const state = EFFECTS[ev.effect].start(world, ev);
  if (state === false) return false;
  world.eventPlan[ev.id].fired++;
  const toast = ev.toasts[world.rng.int(0, ev.toasts.length - 1)];
  world.events.push({ type: "event", id: ev.id, name: ev.name, toast });
  if (ev.duration > 0) world.activeEvents.push({ id: ev.id, until: world.time + ev.duration, state });
  return true;
}

/** Every tick: start due events, run active ones, end finished ones. */
export function updateEvents(world) {
  while (world.eventQueue.length > 0 && world.eventQueue[0].at <= world.time) {
    triggerEvent(world, world.eventQueue.shift().id);
  }
  const still = [];
  for (const active of world.activeEvents) {
    const ev = world.data.events.find((e) => e.id === active.id);
    const effect = EFFECTS[ev.effect];
    effect.tick?.(world, ev, active.state);
    if (world.time >= active.until) {
      effect.end?.(world, ev, active.state);
      world.events.push({ type: "event-end", id: ev.id });
    } else {
      still.push(active);
    }
  }
  world.activeEvents = still;
}
