import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { AUDIO } from "../data/audio.js";
import { MAPS } from "../data/maps.js";
import { MODES } from "../data/modes.js";
import { createBeatQueue, stepFrequency } from "../src/audio/audio.js";
import { dailyChallenge, dateKey, shareText, stressGrid } from "../src/daily.js";
import { bestScore, recordScore, scoreKey } from "../src/scores.js";
import { configForMap } from "../src/sim/config.js";
import { addLink, chooseReward, step } from "../src/sim/world.js";
import { createStorage } from "../src/storage.js";
import { configWith, makeWorld } from "./helpers.mjs";

function memoryBackend() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

export const tests = [
  ["there are at least three maps, each different", () => {
    assert.ok(MAPS.length >= 3);
    for (const m of MAPS) assert.ok(m.boundaries.length >= 1, `${m.id} has a carrier boundary`);
    assert.equal(new Set(MAPS.map((m) => `${m.width}x${m.height}`)).size, MAPS.length, "different shapes");
  }],
  ["every map plays: traffic flows once linked", () => {
    for (const map of MAPS) {
      const world = makeWorld({ map, config: configForMap(CONFIG, map), seed: map.id });
      world.inventory.leased = 5;
      const hub = world.sites.find((s) => s.type === "datacenter");
      for (const s of world.sites.filter((x) => x !== hub)) {
        const result = addLink(world, s.id, hub.id);
        assert.ok(result.ok, `${map.id}: ${result.reason}`);
      }
      for (let i = 0; i < 60 * 40; i++) step(world);
      assert.ok(world.stats.delivered > 3, `${map.id} delivered ${world.stats.delivered}`);
    }
  }],
  ["map tuning overrides config section by section", () => {
    const campus = MAPS.find((m) => m.id === "campus");
    const c = configForMap(CONFIG, campus);
    assert.equal(c.sites.minSpacing, campus.tuning.sites.minSpacing);
    assert.equal(c.sites.edgeMargin, campus.tuning.sites.edgeMargin);
    assert.equal(c.overload, CONFIG.overload, "untouched sections are shared");
    assert.equal(configForMap(CONFIG, { ...campus, tuning: undefined }), CONFIG);
  }],
  ["zen mode exists and has no outages", () => {
    assert.equal(MODES.zen.outages, false);
    assert.equal(MODES.classic.outages, true);
    assert.equal(MODES.daily.daily, true);
  }],
  ["the daily challenge is the same all day and changes by date", () => {
    const morning = dailyChallenge(MAPS, new Date(2026, 9, 31, 8, 0));
    const night = dailyChallenge(MAPS, new Date(2026, 9, 31, 23, 59));
    assert.deepEqual(morning, night);
    assert.equal(morning.key, "2026-10-31");
    assert.equal(morning.seed, "daily-2026-10-31");
    assert.ok(MAPS.some((m) => m.id === morning.mapId));
    const days = new Set();
    for (let d = 1; d <= 20; d++) days.add(dailyChallenge(MAPS, new Date(2026, 10, d)).seed);
    assert.equal(days.size, 20);
    const mapsUsed = new Set();
    for (let d = 1; d <= 30; d++) mapsUsed.add(dailyChallenge(MAPS, new Date(2026, 10, d)).mapId);
    assert.ok(mapsUsed.size >= 2, "the map changes from day to day");
    assert.equal(dateKey(new Date(2026, 0, 5)), "2026-01-05");
  }],
  ["two daily games with the same choices are identical", () => {
    const play = () => {
      const { seed, mapId } = dailyChallenge(MAPS, new Date(2026, 9, 31));
      const map = MAPS.find((m) => m.id === mapId);
      const world = makeWorld({ map, config: configForMap(CONFIG, map), seed });
      for (let i = 0; i < 60 * 120; i++) {
        if (world.pendingReward) chooseReward(world, world.pendingReward.options[0]);
        step(world);
      }
      return JSON.stringify([world.stats, world.sites.map((s) => [s.x, s.y, s.type]), world.dayStress]);
    };
    assert.equal(play(), play());
  }],
  ["share text has the date, score, and a day grid", () => {
    const text = shareText({ key: "2026-10-31", mapName: "Campus", score: 321, days: 9.4, dayStress: [0, 0.1, 0.3, 0.8, 0.2, 0, 0, 0.5, 1] });
    assert.match(text, /Mini Network daily 2026-10-31/);
    assert.match(text, /Campus: 321 delivered, survived 1w 2d/);
    const grid = text.split("\n").slice(2);
    assert.deepEqual(grid, ["🟩🟩🟨🟥🟩🟩🟩", "🟨🟥"]);
    assert.equal(stressGrid([]), "");
  }],
  ["the simulation records how stressed each day was", () => {
    const world = makeWorld({ config: configWith({ growth: { firstSiteAt: 1e9 } }) });
    for (let i = 0; i < 60 * CONFIG.time.secondsPerDay * 2.5 && !world.over; i++) step(world);
    assert.ok(world.dayStress.length >= 2);
    assert.ok(world.dayStress.every((s) => s >= 0 && s <= 1));
    assert.ok(world.dayStress.some((s) => s > 0), "unlinked offices get stressed");
  }],
  ["high scores keep a top 5 per mode and map, and the daily per date", () => {
    const storage = createStorage(memoryBackend());
    const key = scoreKey("classic", "campus");
    assert.equal(key, "classic:campus");
    assert.equal(scoreKey("daily", "campus", "2026-10-31"), "daily:2026-10-31");
    assert.equal(bestScore(storage, key), null);
    assert.deepEqual(recordScore(storage, key, { score: 10, days: 2 }), { rank: 0, best: true });
    assert.deepEqual(recordScore(storage, key, { score: 5, days: 1 }), { rank: 1, best: false });
    for (let i = 0; i < 5; i++) recordScore(storage, key, { score: 20 + i, days: 3 });
    assert.equal(bestScore(storage, key).score, 24);
    assert.deepEqual(recordScore(storage, key, { score: 1, days: 0 }), { rank: -1, best: false });
    assert.equal(storage.get("highScores")[key].length, 5);
    assert.equal(bestScore(storage, scoreKey("classic", "florida-region")), null, "maps are separate");
  }],
  ["audio: each traffic type has a note, and notes snap to a calm beat", () => {
    const freqs = Object.values(AUDIO.trafficSteps).map((s) => stepFrequency(AUDIO, s));
    assert.ok(freqs.every((f) => f >= AUDIO.notes.root && f < AUDIO.notes.root * 8));
    assert.equal(stepFrequency(AUDIO, 0), AUDIO.notes.root);
    assert.ok(Math.abs(stepFrequency(AUDIO, AUDIO.notes.scale.length) - AUDIO.notes.root * 2) < 1e-9, "wraps up an octave");
    const q = createBeatQueue({ beat: 0.2, maxPerBeat: 2 });
    const slots = [q.slot(1.01), q.slot(1.02), q.slot(1.03), q.slot(1.04), q.slot(1.05)];
    assert.ok(Math.abs(slots[0] - 1.2) < 1e-9 && Math.abs(slots[1] - 1.2) < 1e-9, "two on the next beat");
    assert.ok(Math.abs(slots[2] - 1.4) < 1e-9 && Math.abs(slots[3] - 1.4) < 1e-9, "then the one after");
    assert.equal(slots[4], null, "and the rest are skipped");
  }],
];
