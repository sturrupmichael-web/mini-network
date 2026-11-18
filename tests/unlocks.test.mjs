/** Map unlocks (src/unlocks.js): beat a map to open the next one. */
import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { MAPS } from "../data/maps.js";
import { recordScore, scoreKey } from "../src/scores.js";
import { createStorage } from "../src/storage.js";
import { weeksText } from "../src/ui/title.js";
import { createUnlocks } from "../src/unlocks.js";

function memoryBackend() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const fresh = () => {
  const storage = createStorage(memoryBackend());
  return { storage, unlocks: createUnlocks(storage, MAPS, CONFIG) };
};

export const tests = [
  ["a new player has only the first map open", () => {
    const { unlocks } = fresh();
    assert.deepEqual(
      MAPS.filter((m) => unlocks.isUnlocked(m.id)).map((m) => m.id),
      [MAPS[0].id],
    );
    assert.equal(unlocks.unlockedBy(MAPS[1].id).id, MAPS[0].id);
    assert.equal(unlocks.unlockedBy(MAPS[0].id), null);
    assert.equal(unlocks.firstOpen().id, MAPS[0].id);
  }],
  ["beating a map opens the next one, once", () => {
    const { storage, unlocks } = fresh();
    const r = unlocks.markBeaten(MAPS[0].id);
    assert.equal(r.first, true);
    assert.equal(r.opened.id, MAPS[1].id);
    assert.ok(unlocks.isUnlocked(MAPS[1].id));
    assert.ok(!unlocks.isUnlocked(MAPS[2].id));
    assert.ok(unlocks.isBeaten(MAPS[0].id));
    const again = unlocks.markBeaten(MAPS[0].id);
    assert.deepEqual(again, { first: false, opened: null });
    // It's kept in storage.
    assert.ok(createUnlocks(storage, MAPS, CONFIG).isUnlocked(MAPS[1].id));
  }],
  ["beating the last map opens nothing new", () => {
    const { unlocks } = fresh();
    for (const m of MAPS.slice(0, -1)) unlocks.markBeaten(m.id);
    const r = unlocks.markBeaten(MAPS.at(-1).id);
    assert.deepEqual(r, { first: true, opened: null });
    assert.ok(MAPS.every((m) => unlocks.isUnlocked(m.id)));
  }],
  ["the goal is two weeks, unless a map sets its own", () => {
    const { unlocks } = fresh();
    assert.equal(CONFIG.unlocks.goalDays, 14);
    assert.equal(unlocks.goalDays(MAPS[0]), 14);
    assert.equal(unlocks.goalDays({ ...MAPS[0], goalDays: 10 }), 10);
    assert.equal(weeksText(14), "2 weeks");
    assert.equal(weeksText(7), "1 week");
    assert.equal(weeksText(10), "10 days");
  }],
  ["players from before unlocks keep the maps they've played", () => {
    const { storage, unlocks } = fresh();
    recordScore(storage, scoreKey("classic", "coast-to-coast"), { score: 300, days: 5.2, date: "2026-11-10" });
    assert.ok(unlocks.isUnlocked("coast-to-coast"), "played before: stays open");
    assert.ok(!unlocks.isBeaten("coast-to-coast"), "but isn't beaten");
    assert.ok(!unlocks.isUnlocked("port-town"), "the one after it is still locked");
  }],
  ["an old Classic run that lasted two weeks counts as beating the map", () => {
    const { storage, unlocks } = fresh();
    recordScore(storage, scoreKey("classic", "campus"), { score: 1500, days: 14.3, date: "2026-11-12" });
    assert.ok(unlocks.isBeaten("campus"));
    assert.ok(unlocks.isUnlocked("lake-ring"));
  }],
  ["junk in storage doesn't break unlocks", () => {
    const { storage, unlocks } = fresh();
    storage.set("beatenMaps", "nonsense");
    assert.ok(unlocks.isUnlocked(MAPS[0].id));
    assert.equal(unlocks.markBeaten(MAPS[0].id).first, true);
    assert.ok(unlocks.isUnlocked(MAPS[1].id));
  }],
];
