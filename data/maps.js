/**
 * Maps. Each map is laid out in its own world-unit space (see config.js).
 *
 * Fields:
 *   id          Stable id (used for saves and the daily challenge).
 *   name        Display name.
 *   width, height   Size of the playable area in world units. Every site
 *               must sit inside it. On a portrait phone a landscape map is
 *               turned 90° to fill the screen.
 *   start       The sites that exist when the game begins:
 *               { type: <site type id>, x, y, label? }
 *   boundaries  Carrier boundaries ("rivers"): lists of [x, y] points that
 *               form a polyline. Crossing one needs a leased line
 *               (Phase 3). Drawn now so maps look right.
 */
export const MAPS = [
  {
    id: "florida-region",
    name: "Florida Region",
    width: 1200,
    height: 800,
    start: [
      { type: "datacenter", x: 560, y: 400, label: "HQ" },
      { type: "office", x: 330, y: 230 },
      { type: "office", x: 820, y: 260 },
      { type: "office", x: 700, y: 610 },
    ],
    boundaries: [
      [
        [0, 520],
        [180, 520],
        [300, 640],
        [300, 800],
      ],
    ],
  },
];
