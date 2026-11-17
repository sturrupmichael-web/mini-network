/**
 * Maps. Each map is laid out in its own world-unit space (see config.js).
 *
 * Fields:
 *   id          Stable id (used for high scores and the daily challenge).
 *   name        Display name.
 *   description One line for the title screen.
 *   palette     Ground colours in the light theme: "office" | "campus" |
 *               "datacenter" (theme.js PALETTES).
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
 *               An area can also list `holes`: polygons cut back out of it
 *               (islands in a sea).
 *   events      Optional. Per-map event changes: { <event id>: false } turns
 *               one off, { <event id>: { schedule, params, … } } changes it.
 *   siteUnlock  Optional. { <site type id>: day } moves the day new sites of
 *               that type start appearing.
 *   goalDays    Optional. Days to survive (Classic or Daily) to beat the map
 *               and unlock the next one (default config.unlocks.goalDays).
 *   tuning      Optional config overrides for this map only, merged over
 *               config.js section by section, e.g.
 *               { sites: { minSpacing: 90 }, growth: { startRadius: 300 } }.
 */
/**
 * Downtown's street grid: a city block (4 × 3 squares) every 210 × 180 wu,
 * with three-square streets between them. `skip` leaves a block out (a
 * plaza) and `parks` turns one into a park; both are "column,row".
 */
function cityBlocks({ skip = [], parks = [] }) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const key = `${i},${j}`;
      if (skip.includes(key)) continue;
      const x = 90 + 210 * i;
      const y = 90 + 180 * j;
      out.push({ kind: parks.includes(key) ? "park" : "block", points: [[x, y], [x + 120, y], [x + 120, y + 90], [x, y + 90]] });
    }
  }
  return out;
}

export const MAPS = [
  {
    id: "florida-region",
    name: "Florida Region",
    palette: "office",
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
    id: "campus",
    name: "Campus",
    palette: "campus",
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
  {
    id: "lake-ring",
    name: "Lake Ring",
    palette: "campus",
    description: "Towns around a big lake. Backhoes are busy here: close the loop.",
    width: 1000,
    height: 1000,
    start: [
      { type: "datacenter", x: 500, y: 830, label: "HQ" },
      { type: "office", x: 250, y: 700 },
      { type: "office", x: 760, y: 690 },
    ],
    boundaries: [],
    terrain: [
      // The lake.
      {
        kind: "water",
        points: [[500, 170], [650, 200], [760, 290], [800, 430], [770, 580], [660, 690], [560, 730], [440, 730], [330, 690], [230, 590], [200, 440], [240, 290], [350, 200]],
      },
      // A wooded corner up in the north-west.
      { kind: "park", points: [[40, 40], [190, 40], [170, 150], [40, 170]] },
      // Hills in the south-east corner.
      { kind: "hills", points: [[850, 860], [960, 830], [960, 960], [870, 960]] },
    ],
    events: {
      // Cable cuts come roughly twice as often.
      backhoe: { schedule: { day: 3, every: [3, 5] } },
    },
    tuning: {
      inventory: { upgrades: 2, switches: 1, firewalls: 0, sdwan: 1, leased: 0, routers: 0, qos: 0, backbone: 0 },
      growth: { startRadius: 420 },
    },
  },
  {
    id: "coast-to-coast",
    name: "Coast to Coast",
    palette: "datacenter",
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
    id: "port-town",
    name: "Port Town",
    palette: "office",
    description: "A busy harbour. The docks run on ERP and the logistics hub is hungry.",
    width: 1300,
    height: 800,
    start: [
      { type: "datacenter", x: 680, y: 400, label: "HQ" },
      { type: "logistics", x: 990, y: 420, label: "ERP" },
      { type: "office", x: 560, y: 220 },
      { type: "office", x: 760, y: 650 },
      { type: "warehouse", x: 900, y: 620 },
      { type: "warehouse", x: 860, y: 250 },
    ],
    boundaries: [
      // The river between the old town and the harbour: a different carrier.
      [
        [400, 0],
        [450, 200],
        [400, 420],
        [450, 620],
        [420, 800],
      ],
    ],
    terrain: [
      // The sea, with two piers sticking out into it.
      {
        kind: "water",
        points: [[1110, 0], [1300, 0], [1300, 800], [1090, 800], [1070, 620], [1100, 420], [1080, 210]],
        holes: [
          [[1040, 240], [1230, 240], [1230, 300], [1040, 300]],
          [[1040, 510], [1200, 510], [1200, 570], [1040, 570]],
        ],
      },
      // The old town's hill.
      { kind: "hills", points: [[120, 300], [260, 270], [300, 380], [180, 450], [100, 400]] },
      // The town square park.
      { kind: "park", points: [[560, 520], [660, 510], [670, 600], [570, 610]] },
    ],
    // Warehouses from day one; the logistics hub is already here, and the
    // payment gateway opens a week early.
    siteUnlock: { warehouse: 0 },
    events: {
      "logistics-hub": false,
      "payment-gateway": { schedule: { day: 8 } },
    },
    tuning: {
      growth: { types: { office: 5, warehouse: 3, retail: 2 } },
      // Gentler than usual: the hub is hungry from the very first day.
      hunger: { startDelay: 60, secondsPerPip: 16 },
      inventory: { upgrades: 3, switches: 1, firewalls: 0, sdwan: 0, leased: 2, routers: 0, qos: 0, backbone: 0 },
    },
  },
  {
    id: "the-pass",
    name: "The Pass",
    palette: "datacenter",
    description: "Two valleys and one narrow pass. Everything goes through it.",
    width: 660,
    height: 1200,
    start: [
      { type: "datacenter", x: 330, y: 930, label: "HQ" },
      { type: "office", x: 190, y: 250 },
      { type: "office", x: 480, y: 340 },
      { type: "office", x: 500, y: 1060 },
    ],
    boundaries: [],
    terrain: [
      // The mountains on each side, pinching to a gap three squares wide.
      { kind: "hills", points: [[0, 380], [110, 430], [270, 560], [270, 640], [110, 790], [0, 840]] },
      { kind: "hills", points: [[660, 370], [530, 440], [360, 560], [360, 640], [540, 800], [660, 850]] },
      // A lake in the north valley.
      { kind: "water", points: [[320, 90], [430, 80], [450, 170], [340, 190]] },
      // Forest in the south.
      { kind: "park", points: [[60, 1040], [180, 1020], [200, 1140], [70, 1150]] },
    ],
    tuning: {
      links: { startingCount: 60 },
      growth: { startRadius: 520, radiusGrowthPerDay: 70, attempts: 120 },
      inventory: { upgrades: 1, switches: 1, firewalls: 0, sdwan: 0, leased: 0, routers: 1, qos: 0, backbone: 0 },
    },
  },
  {
    id: "downtown",
    name: "Downtown",
    palette: "office",
    description: "City blocks and three boroughs. Links follow the streets.",
    width: 1200,
    height: 900,
    start: [
      { type: "datacenter", x: 570, y: 315, label: "HQ" },
      { type: "office", x: 465, y: 225 },
      { type: "office", x: 675, y: 585 },
      { type: "office", x: 465, y: 585 },
    ],
    boundaries: [
      // Two carrier boroughs, split down two avenues.
      [
        [255, 0],
        [255, 900],
      ],
      [
        [885, 0],
        [885, 900],
      ],
    ],
    // HQ sits on the plaza at block 2,1; two blocks are parks.
    terrain: cityBlocks({ skip: ["2,1"], parks: ["3,2", "1,3"] }),
    tuning: {
      sites: { minSpacing: 100 },
      growth: { attempts: 160 },
      links: { startingCount: 55 },
      inventory: { upgrades: 2, switches: 1, firewalls: 0, sdwan: 0, leased: 2, routers: 0, qos: 0, backbone: 0 },
    },
  },
  {
    id: "twin-cities",
    name: "Twin Cities",
    palette: "datacenter",
    description: "Two data centers, one river, two carriers. Join them or don't.",
    width: 1500,
    height: 800,
    start: [
      { type: "datacenter", x: 390, y: 400, label: "HQ" },
      { type: "datacenter", x: 1110, y: 400, label: "HQ" },
      { type: "office", x: 230, y: 250 },
      { type: "office", x: 530, y: 590 },
      { type: "office", x: 1260, y: 230 },
      { type: "office", x: 980, y: 600 },
    ],
    boundaries: [
      // The river is the line between the two carriers.
      [
        [765, 0],
        [765, 800],
      ],
    ],
    terrain: [
      // The river, broken by two bridges.
      { kind: "water", points: [[715, 0], [805, 0], [805, 240], [715, 240]] },
      { kind: "water", points: [[715, 330], [805, 330], [805, 510], [715, 510]] },
      { kind: "water", points: [[715, 600], [805, 600], [805, 800], [715, 800]] },
      // Parks on each bank.
      { kind: "park", points: [[180, 560], [320, 540], [340, 680], [190, 700]] },
      { kind: "park", points: [[1180, 560], [1320, 550], [1330, 690], [1190, 700]] },
    ],
    tuning: {
      links: { startingCount: 55 },
      growth: { startRadius: 300 },
      inventory: { upgrades: 2, switches: 1, firewalls: 0, sdwan: 0, leased: 2, routers: 0, qos: 0, backbone: 0 },
    },
  },
  {
    id: "archipelago",
    name: "Archipelago",
    palette: "campus",
    description: "Islands joined by thin causeways. Backbones go straight over the sea.",
    width: 1400,
    height: 900,
    start: [
      { type: "datacenter", x: 680, y: 440, label: "HQ" },
      { type: "office", x: 790, y: 340 },
      { type: "office", x: 770, y: 510 },
      { type: "office", x: 290, y: 200 },
    ],
    boundaries: [],
    terrain: [
      // The sea, with the islands (and the causeways between them) cut out.
      {
        kind: "water",
        points: [[0, 0], [1400, 0], [1400, 900], [0, 900]],
        holes: [
          // The main island.
          [[540, 270], [860, 270], [890, 490], [780, 610], [600, 600], [510, 460]],
          // North-west island, and a one-square causeway to the main island.
          [[150, 90], [390, 70], [420, 200], [400, 320], [250, 340], [120, 240]],
          [[390, 300], [560, 300], [560, 330], [390, 330]],
          // South-west island, reached down a long causeway from the north-west.
          [[210, 300], [240, 300], [240, 560], [210, 560]],
          [[110, 550], [370, 540], [400, 740], [220, 800], [90, 710]],
          // South-east island and its causeway.
          [[990, 540], [1260, 560], [1290, 790], [1050, 820], [980, 720]],
          [[800, 540], [1010, 540], [1010, 570], [800, 570]],
          // North-east island, at the end of a long causeway that runs up
          // and round the top of the map. A backbone is a big shortcut.
          [[1000, 80], [1260, 100], [1280, 290], [1080, 320], [990, 210]],
          [[690, 30], [720, 30], [720, 290], [690, 290]],
          [[690, 30], [1030, 30], [1030, 60], [690, 60]],
          [[1000, 30], [1030, 30], [1030, 110], [1000, 110]],
        ],
      },
    ],
    tuning: {
      links: { startingCount: 55 },
      growth: { attempts: 120 },
      inventory: { upgrades: 2, switches: 1, firewalls: 0, sdwan: 0, leased: 0, routers: 0, qos: 0, backbone: 2 },
    },
  },
];
