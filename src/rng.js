/**
 * Seeded random number generator (mulberry32). All gameplay randomness goes
 * through one of these so a seed always replays the same game.
 *
 * The whole state is one 32-bit integer in `rng.state`, so it can be saved
 * and restored with the rest of the world.
 */

/** Turn any string into a 32-bit seed (xmur3-style hash). */
export function hashSeed(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed) {
  const state = typeof seed === "string" ? hashSeed(seed) : seed >>> 0;
  return {
    state,
    /** Float in [0, 1). */
    next() {
      this.state = (this.state + 0x6d2b79f5) >>> 0;
      let t = this.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** Float in [min, max). */
    range(min, max) {
      return min + (max - min) * this.next();
    },
    /** Integer in [min, max]. */
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    /** A random element of an array. */
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    },
    /** A key of `weights` ({ key: weight }), chosen in proportion to weight. */
    weighted(weights) {
      const keys = Object.keys(weights);
      let total = 0;
      for (const k of keys) total += weights[k];
      let r = this.next() * total;
      for (const k of keys) {
        r -= weights[k];
        if (r < 0) return k;
      }
      return keys[keys.length - 1];
    },
  };
}
