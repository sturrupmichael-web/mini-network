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
 *   terrain     Optional. Areas links can't cross and nothing is built on:
 *               [{ kind: <terrain id from terrain.js>, points: [[x, y], …] }].
 *               Each is a polygon; every grid square whose centre is inside
 *               it is blocked. Keep starting sites at least a square away.
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
    terrain: [
      // The bay.
      { kind: "water", points: [[860, 560], [1040, 520], [1200, 600], [1200, 800], [900, 800], [830, 690]] },
      // A lake west of HQ.
      { kind: "water", points: [[370, 410], [470, 390], [505, 470], [430, 525], [355, 490]] },
      // A state park up north.
      { kind: "park", points: [[540, 110], [690, 100], [710, 185], [580, 205]] },
      // Wetland preserve in the south-west corner (behind the boundary).
      { kind: "park", points: [[40, 600], [200, 610], [220, 760], [40, 770]] },
      // Hills in the north-east.
      { kind: "hills", points: [[1060, 60], [1180, 40], [1190, 200], [1090, 230]] },
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
    terrain: [
      // A mountain range across the middle-north.
      { kind: "hills", points: [[690, 40], [900, 30], [960, 120], [820, 165], [680, 120]] },
      // A big lake south-west of HQ.
      { kind: "water", points: [[630, 420], [770, 440], [750, 570], [610, 545]] },
      // The west coast.
      { kind: "water", points: [[0, 540], [170, 590], [240, 700], [0, 700]] },
      // Eastern mountains.
      { kind: "hills", points: [[1290, 110], [1450, 70], [1510, 220], [1380, 270]] },
      // A national park in the south-east.
      { kind: "park", points: [[1340, 520], [1490, 500], [1510, 630], [1360, 650]] },
      // Forest in the west.
      { kind: "park", points: [[150, 120], [300, 100], [330, 240], [180, 260]] },
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
    terrain: [
      // The quad lawn.
      { kind: "park", points: [[230, 515], [380, 495], [400, 625], [255, 655]] },
      // The duck pond.
      { kind: "water", points: [[620, 420], [725, 400], [745, 485], [650, 505]] },
      // The arboretum up north.
      { kind: "park", points: [[370, 110], [520, 100], [540, 190], [390, 205]] },
      // The fountain plaza.
      { kind: "water", points: [[110, 330], [190, 320], [195, 400], [115, 405]] },
    ],
    tuning: {
      sites: { minSpacing: 95, edgeMargin: 45, boundaryClearance: 40 },
      growth: { startRadius: 300, radiusGrowthPerDay: 45 },
      links: { startingCount: 40, perDay: 4, bandwidth: 2, packetSpeed: 120 },
    },
  },
];
