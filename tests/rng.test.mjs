import assert from "node:assert/strict";
import { createRng, hashSeed } from "../src/rng.js";

export const tests = [
  ["same seed gives the same sequence", () => {
    const a = createRng("daily-2026-10-31");
    const b = createRng("daily-2026-10-31");
    for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
  }],
  ["different seeds differ", () => {
    assert.notEqual(createRng("a").next(), createRng("b").next());
    assert.notEqual(hashSeed("a"), hashSeed("b"));
  }],
  ["values stay in range", () => {
    const r = createRng(42);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      assert.ok(v >= 0 && v < 1);
      const n = r.int(3, 7);
      assert.ok(Number.isInteger(n) && n >= 3 && n <= 7);
    }
  }],
  ["state can be saved and restored", () => {
    const a = createRng(7);
    a.next();
    const b = createRng(0);
    b.state = a.state;
    assert.equal(a.next(), b.next());
  }],
  ["weighted picks follow the weights roughly", () => {
    const r = createRng(1);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 10000; i++) counts[r.weighted({ a: 3, b: 1 })]++;
    assert.ok(counts.a / counts.b > 2.5 && counts.a / counts.b < 3.5, JSON.stringify(counts));
  }],
];
