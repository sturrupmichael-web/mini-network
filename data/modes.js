/**
 * Game modes.
 *
 * Fields:
 *   name      Display name.
 *   detail    One line for the title screen.
 *   outages   false: overloaded sites never end the game (Zen).
 *   daily     true: the map and seed come from today's date, so everyone
 *             plays the same game, and you get a share line at the end.
 *   scores    Whether to keep high scores for this mode.
 */
export const MODES = {
  classic: {
    name: "Classic",
    detail: "Survive as long as you can.",
    outages: true,
    daily: false,
    scores: true,
  },
  zen: {
    name: "Zen",
    detail: "No outages. Just build and watch it flow.",
    outages: false,
    daily: false,
    scores: false,
  },
  daily: {
    name: "Daily challenge",
    detail: "Today's map and events, the same for everyone.",
    outages: true,
    daily: true,
    scores: true,
  },
};
