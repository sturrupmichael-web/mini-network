/**
 * Terrain kinds. Maps place terrain as shapes (see maps.js `terrain`);
 * every grid square whose centre falls inside a shape is blocked: links
 * have to go around it, and nothing is built on it. Colours (fill, outline,
 * hatching) are in theme.js (`terrain`), per light/dark theme.
 *
 *   name     What it's called in messages and tips.
 *   pattern  The texture drawn over it, so kinds can be told apart without
 *            relying on colour: "waves", "dots" or "hatch".
 */
export const TERRAIN_TYPES = {
  water: { name: "Water", pattern: "waves" },
  park: { name: "Park", pattern: "dots" },
  hills: { name: "Hills", pattern: "hatch" },
};
