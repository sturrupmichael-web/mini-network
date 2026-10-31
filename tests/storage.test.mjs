import assert from "node:assert/strict";
import { createStorage, PREFIX } from "../src/storage.js";

function fakeBackend() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const throwing = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("SecurityError");
  },
  removeItem() {
    throw new Error("SecurityError");
  },
};

export const tests = [
  ["every key gets the miniNetwork: prefix", () => {
    const backend = fakeBackend();
    const s = createStorage(backend);
    s.set("settings", { speed: 2 });
    assert.equal(PREFIX, "miniNetwork:");
    assert.deepEqual([...backend.map.keys()], ["miniNetwork:settings"]);
  }],
  ["round-trips JSON values", () => {
    const s = createStorage(fakeBackend());
    s.set("highScores", [{ map: "x", score: 10 }]);
    assert.deepEqual(s.get("highScores"), [{ map: "x", score: 10 }]);
  }],
  ["missing or corrupt values give the fallback", () => {
    const backend = fakeBackend();
    backend.setItem("miniNetwork:bad", "{not json");
    const s = createStorage(backend);
    assert.equal(s.get("nothing", 5), 5);
    assert.equal(s.get("bad", "fallback"), "fallback");
  }],
  ["blocked storage falls back to memory without throwing", () => {
    const s = createStorage(throwing);
    s.set("settings", { muted: true });
    assert.deepEqual(s.get("settings"), { muted: true });
    s.remove("settings");
    assert.equal(s.get("settings"), null);
  }],
  ["no storage at all still works", () => {
    const s = createStorage(null);
    s.set("a", 1);
    assert.equal(s.get("a"), 1);
  }],
];
