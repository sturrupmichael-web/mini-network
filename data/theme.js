/**
 * The look of the game: design tokens from the Nano Networks style guide
 * (docs/style-guide.md). A pastel network diagram drawn as flat, softly
 * shadowed toy pieces, where colour only ever means "which traffic goes
 * where".
 *
 * Sizes on the map are fractions of one grid square on screen (a "tile");
 * see render/renderer.js.
 */

/**
 * Gameplay colours. Sites and traffic name one of these (`node` in
 * sites.js / traffic.js). They are introduced in NODE_ORDER as the game goes
 * on, so the first few on the map are always the easiest to tell apart.
 * The light theme uses `day`, the dark theme `night`.
 */
export const NODE = {
  day: {
    blue: "#3E8ED0",
    red: "#E2574C",
    yellow: "#F2B33D",
    green: "#4FAE6A",
    purple: "#8E6CC8",
    teal: "#2FAFA6",
    orange: "#EE8A3C",
    pink: "#E77FA8",
  },
  night: {
    blue: "#58A4E6",
    red: "#F06A5F",
    yellow: "#F7C55A",
    green: "#66C381",
    purple: "#A485DC",
    teal: "#47C4BA",
    orange: "#F79F55",
    pink: "#F296BA",
  },
};
export const NODE_ORDER = ["blue", "red", "yellow", "green", "purple", "teal", "orange", "pink"];

/**
 * Ground palettes, one per kind of map (maps.js `palette`), for the light
 * theme. The dark theme uses `night` on every map.
 *   ground    the open map
 *   secZone   water ("security zone") and carrier boundaries
 *   wallZone  hills ("wall/floor zone")
 *   park      parks: the ground tinted green
 *   block     city blocks: buildings, a touch darker than hills
 *   cable     links
 *   backbone  backbone links, the data center and core routers
 */
export const PALETTES = {
  office: { ground: "#EFE9DC", secZone: "#BFD3DE", wallZone: "#E0D6C2", park: "#D5E0C4", cable: "#FBFAF7", backbone: "#4A5560", block: "#D6CDBB" },
  campus: { ground: "#E4EADB", secZone: "#B7D0D6", wallZone: "#D3DCC6", park: "#C9DDB9", cable: "#FBFCF8", backbone: "#46544E", block: "#C6CFB9" },
  datacenter: { ground: "#E3E7EA", secZone: "#C2CCE0", wallZone: "#D2D8DD", park: "#CFDDCB", cable: "#FFFFFF", backbone: "#3F4A57", block: "#C8CFD6" },
  night: { ground: "#1F2329", secZone: "#25384A", wallZone: "#2A3038", park: "#243328", cable: "#3A414B", backbone: "#9AA6B2", block: "#30363F" },
};

/** Warm shadows by day, never pure black. */
export const SHADOW = {
  color: { day: "rgba(60, 48, 36, 0.18)", night: "rgba(0, 0, 0, 0.35)" },
  /** The same colours without their alpha, and the alpha on its own. */
  rgb: { day: "rgb(60, 48, 36)", night: "rgb(0, 0, 0)" },
  alpha: { day: 0.18, night: 0.35 },
  /**
   * Depth tiers: 0 ground and zones (no shadow), 1 packets and pins,
   * 2 links and workstations, 3 servers and switches, 4 backbones and
   * firewalls. Offsets and blur in CSS px.
   */
  tier: [null, { x: 0.5, y: 1, blur: 2 }, { x: 1, y: 2, blur: 4 }, { x: 1.5, y: 3, blur: 6 }, { x: 2, y: 5, blur: 9 }],
};

/** Map piece sizes, as fractions of a tile (one grid square on screen). */
export const SIZE = {
  cable: 0.42,
  backbone: 0.7,
  workstation: 0.72,
  wsRadius: 0.16,
  server: { w: 1.8, h: 0.8, big: 1.8, radius: 0.18 },
  packet: { w: 0.36, h: 0.22 },
  pin: 0.3,
  switch: 1.6,
  /** The ring timer sits this far outside a site. */
  ringGap: 0.35,
  ringWidth: 3,
};

/** Animation timings (ms unless named otherwise). */
export const MOTION = {
  spawnMs: 280,
  pinMs: 180,
  cableSnapMs: 80,
  cableRemoveMs: 120,
  deliverMs: 150,
  gameOverMs: 1200,
  expandMs: 1500,
  cardStaggerMs: 60,
  /** The ring timer starts to pulse (opacity 60% to 100%, once a second) here. */
  slaPulseAt: 0.75,
  /** Gap between packets parked bumper to bumper, in tiles. */
  queueGap: 0.08,
  /** A new site's soft ring: it spreads out and fades over this long. */
  spawnRingMs: 900,
  /** How far the spawn ring spreads past the site, in tiles. */
  spawnRingSpread: 0.9,
  /** Packets glide into their place in a queue: how quickly (per second; higher is snappier). */
  queueEase: 12,
  /** The week clock pulses gently on the week's last day, once per this many seconds. */
  lastDayPulseS: 1.8,
};

/** A node colour by name for a theme ("light" | "dark"). */
export function nodeColor(name, theme = "light") {
  const set = theme === "dark" ? NODE.night : NODE.day;
  return set[name] ?? null;
}

/**
 * Theme colours that aren't gameplay colours: neutrals for the map and the
 * few overlays. Map-specific ground colours come from PALETTES (see
 * mapColors below); `background` etc. here are the default (office) map.
 */
export const THEME = {
  light: {
    ...groundKeys(PALETTES.office),
    shadow: SHADOW.color.day,
    /** Dots marking the link grid, normally and while you draw. */
    grid: "rgba(60, 48, 36, 0.10)",
    gridActive: "rgba(60, 48, 36, 0.24)",
    /** The part of the map that isn't open yet: the ground, a little deeper. */
    closed: "rgba(120, 104, 84, 0.12)",
    /** Small details drawn on top of a piece. */
    siteFill: "#ffffff",
    highlight: "rgba(60, 48, 36, 0.10)",
    preview: "rgba(60, 48, 36, 0.35)",
    /** The neutral ring for sites without a colour of their own (switches). */
    ringNeutral: "#4A5560",
    ringTrack: "rgba(60, 48, 36, 0.10)",
    removeFill: "#2E3238",
    removeText: "#ffffff",
    dim: "rgba(239, 233, 220, 0.55)",
    /** How far the ground darkens in the middle of an in-game night (0–1). */
    nightDepth: 0.12,
    /** A flash on a square a drag bumped into. */
    blockedFill: "rgba(60, 48, 36, 0.16)",
    dropTarget: "rgba(60, 48, 36, 0.12)",
  },
  dark: {
    ...groundKeys(PALETTES.night),
    shadow: SHADOW.color.night,
    grid: "rgba(233, 230, 223, 0.07)",
    gridActive: "rgba(233, 230, 223, 0.2)",
    closed: "rgba(0, 0, 0, 0.28)",
    siteFill: "#ffffff",
    highlight: "rgba(233, 230, 223, 0.10)",
    preview: "rgba(233, 230, 223, 0.35)",
    ringNeutral: "#9AA6B2",
    ringTrack: "rgba(233, 230, 223, 0.10)",
    removeFill: "#E9E6DF",
    removeText: "#1F2329",
    dim: "rgba(31, 35, 41, 0.6)",
    nightDepth: 0.35,
    blockedFill: "rgba(233, 230, 223, 0.14)",
    dropTarget: "rgba(233, 230, 223, 0.12)",
  },
  sizes: {
    gridDot: 1.3,
    removeButton: 13,
  },
};

/** A palette's colours under the names the renderer and info cards use. */
function groundKeys(p) {
  return {
    background: p.ground,
    /** The darkest the ground gets at night (see nightDepth). */
    nightBackground: p === PALETTES.night ? "#15181C" : "#2C3440",
    boundary: p.secZone,
    cable: p.cable,
    backbone: p.backbone,
    /** The data center and core routers: the neutral, "elevated" piece. */
    core: p.backbone,
    terrain: {
      water: { fill: p.secZone },
      park: { fill: p.park },
      hills: { fill: p.wallZone },
      block: { fill: p.block },
    },
  };
}

const mapColorCache = new Map();
/**
 * The theme's colours for one map: THEME[theme] with the ground palette the
 * map asks for (maps.js `palette`). Dark always uses the night palette.
 */
export function mapColors(theme, palette = "office") {
  const key = `${theme}:${palette}`;
  if (!mapColorCache.has(key)) {
    const base = THEME[theme] ?? THEME.light;
    const p = theme === "dark" ? PALETTES.night : (PALETTES[palette] ?? PALETTES.office);
    mapColorCache.set(key, { ...base, ...groundKeys(p), theme: theme === "dark" ? "dark" : "light" });
  }
  return mapColorCache.get(key);
}
