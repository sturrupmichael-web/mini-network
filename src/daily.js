/**
 * The daily challenge: today's date picks the map and the seed, so
 * everyone gets the same game. Also builds the shareable result text.
 */
import { hashSeed } from "./rng.js";

/** "2026-10-31" for the player's local date. */
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Map and seed for a day. */
export function dailyChallenge(maps, date = new Date()) {
  const key = dateKey(date);
  const map = maps[hashSeed(`map-${key}`) % maps.length];
  return { key, seed: `daily-${key}`, mapId: map.id };
}

/**
 * One square per day survived, a row per week, coloured by how close the
 * network came to an outage that day.
 */
export function stressGrid(dayStress, daysPerWeek = 7) {
  const squares = dayStress.map((s) => (s < 0.25 ? "🟩" : s < 0.75 ? "🟨" : "🟥"));
  const rows = [];
  for (let i = 0; i < squares.length; i += daysPerWeek) rows.push(squares.slice(i, i + daysPerWeek).join(""));
  return rows.join("\n");
}

/** Short "2 weeks, 3 days"-style text. */
function survived(days) {
  const whole = Math.floor(days);
  const weeks = Math.floor(whole / 7);
  const rest = whole % 7;
  if (weeks === 0) return `${whole}d`;
  return rest ? `${weeks}w ${rest}d` : `${weeks}w`;
}

/** The text copied by the Share button. */
export function shareText({ key, mapName, score, days, dayStress, daysPerWeek = 7 }) {
  return [
    `Nano Networks daily ${key}`,
    `${mapName}: ${score} delivered, survived ${survived(days)}`,
    stressGrid(dayStress, daysPerWeek),
  ]
    .filter(Boolean)
    .join("\n");
}
