/**
 * Maps. Each map is laid out in its own world-unit space (see config.js).
 *
 * Fields:
 *   id          Stable id (used for high scores and the daily challenge).
 *   name        Display name.
 *   description One line for the title screen.
 *   width, height   Size of the playable area in world units. Every site
 *               must sit inside it. On a portrait phone a landscape map is
 *               turned 90° to fill the screen.
 *   start       The sites that exist when the game begins:
 *               { type: <site type id>, x, y, label? }
 *   boundaries  Carrier boundaries ("rivers"): lists of [x, y] points that
 *               form a polyline. A link that crosses one needs a leased
 *               line.
 *   tuning      Optional config overrides for this map only, merged over
 *               config.js section by section, e.g.
 *               { sites: { minSpacing: 90 }, growth: { startRadius: 300 } }.
 */
export const MAPS = [
  {
    id: "florida-region",
    name: "Florida Region",
    description: "A long peninsula, a bay, and one carrier per coast.",
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
      [
        [1000, 0],
        [1000, 300],
        [1200, 500],
      ],
    ],
  },
  {
    id: "coast-to-coast",
    name: "Coast to Coast",
    description: "A wide country split into three carrier regions.",
    width: 1600,
    height: 700,
    start: [
      { type: "datacenter", x: 800, y: 350, label: "HQ" },
      { type: "office", x: 620, y: 220 },
      { type: "office", x: 980, y: 480 },
    ],
    boundaries: [
      [
        [520, 0],
        [520, 260],
        [440, 340],
        [440, 700],
      ],
      [
        [1100, 0],
        [1100, 420],
        [1180, 500],
        [1180, 700],
      ],
    ],
    tuning: {
      growth: { startRadius: 450, radiusGrowthPerDay: 80 },
      inventory: { upgrades: 2, switches: 1, firewalls: 0, sdwan: 0, leased: 2 },
    },
  },
  {
    id: "campus",
    name: "Campus",
    description: "Tight buildings around a quad, with a road down the middle.",
    width: 900,
    height: 900,
    start: [
      { type: "datacenter", x: 450, y: 450, label: "HQ" },
      { type: "office", x: 300, y: 330 },
      { type: "office", x: 600, y: 300 },
      { type: "office", x: 540, y: 620 },
    ],
    boundaries: [
      [
        [0, 760],
        [900, 760],
      ],
    ],
    tuning: {
      sites: { minSpacing: 95, edgeMargin: 45, boundaryClearance: 40 },
      growth: { startRadius: 300, radiusGrowthPerDay: 45 },
      links: { startingCount: 40, perDay: 4, bandwidth: 2, packetSpeed: 120 },
    },
  },
];
