/**
 * Terrain kinds. Maps place terrain as shapes (see maps.js `terrain`);
 * every grid square whose centre falls inside a shape is blocked: links
 * have to go around it, and nothing is built on it. Colours are in
 * theme.js (`terrain`), per light/dark theme.
 *
 *   name   What it's called in messages and tips.
 */
export const TERRAIN_TYPES = {
  water: { name: "Water" },
  park: { name: "Park" },
  hills: { name: "Hills" },
};
