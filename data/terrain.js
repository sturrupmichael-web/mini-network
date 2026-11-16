/**
 * Terrain kinds. Maps place terrain as shapes (see maps.js `terrain`);
 * every grid square whose centre falls inside a shape is blocked: links
 * have to go around it, and nothing is built on it. Each kind is drawn as
 * flat, soft-edged ground in its own colour from the map's palette
 * (theme.js PALETTES: water is the "security zone" colour, hills the
 * "wall/floor zone", parks a green tint).
 *
 *   name     What it's called in messages and tips.
 */
export const TERRAIN_TYPES = {
  water: { name: "Water" },
  park: { name: "Park" },
  hills: { name: "Hills" },
};
