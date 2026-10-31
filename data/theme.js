/**
 * Colours and drawing sizes. Sizes are CSS pixels at a "normal" zoom and
 * shrink a little on small screens (see render/renderer.js).
 */
export const THEME = {
  light: {
    background: "#f6f4ef",
    boundary: "#dbe7ef",
    /** The white outline around every site, and a soft shadow behind it so it shows on a pale map. */
    siteOutline: "#ffffff",
    siteShadow: "rgba(43, 43, 43, 0.28)",
    /** Dots marking the link grid, normally and while you draw. */
    grid: "rgba(43, 43, 43, 0.09)",
    /** Terrain fills, by kind (terrain.js). */
    terrain: { water: "#cfe2ef", park: "#d5e8cf", hills: "#e7ddcc" },
    /** Covers the part of the map that isn't open yet. */
    closed: "rgba(178, 172, 160, 0.42)",
    /** The edge of the open area. */
    closedEdge: "rgba(43, 43, 43, 0.18)",
    gridActive: "rgba(43, 43, 43, 0.22)",
    /** Small details drawn on top of a site (switch ports, SD-WAN mark). */
    siteFill: "#ffffff",
    hubText: "#ffffff",
    highlight: "rgba(43, 43, 43, 0.12)",
    preview: "rgba(43, 43, 43, 0.35)",
    overload: "#e8483f",
    overloadTrack: "rgba(232, 72, 63, 0.16)",
    removeFill: "#2b2b2b",
    removeText: "#ffffff",
    dim: "rgba(246, 244, 239, 0.55)",
    /** The background at the darkest point of the night. */
    nightBackground: "#e3e1dc",
    down: "#e8483f",
    blocked: "#f2994a",
    firewall: "#f2994a",
    sdwan: "#13a8b5",
    leasedStripe: "#ffffff",
    dropTarget: "rgba(47, 128, 237, 0.25)",
  },
  dark: {
    background: "#1d1e22",
    boundary: "#26313b",
    siteOutline: "#ffffff",
    siteShadow: "rgba(0, 0, 0, 0.45)",
    grid: "rgba(233, 230, 223, 0.07)",
    terrain: { water: "#1f3546", park: "#21392b", hills: "#43382b" },
    closed: "rgba(0, 0, 0, 0.45)",
    closedEdge: "rgba(233, 230, 223, 0.16)",
    gridActive: "rgba(233, 230, 223, 0.2)",
    siteFill: "#ffffff",
    hubText: "#ffffff",
    highlight: "rgba(233, 230, 223, 0.14)",
    preview: "rgba(233, 230, 223, 0.35)",
    overload: "#ff6b5e",
    overloadTrack: "rgba(255, 107, 94, 0.18)",
    removeFill: "#e9e6df",
    removeText: "#1d1e22",
    dim: "rgba(29, 30, 34, 0.6)",
    nightBackground: "#141518",
    down: "#ff6b5e",
    blocked: "#f2a65a",
    firewall: "#f2a65a",
    sdwan: "#2cc4cf",
    leasedStripe: "#1d1e22",
    dropTarget: "rgba(86, 160, 255, 0.3)",
  },
  /**
   * Colours for links. Each drag gesture draws in the next colour, so the
   * links you draw in one stroke read as one "line".
   */
  lineColors: ["#e8483f", "#f2a516", "#2fa66a", "#2f80ed", "#9b51e0", "#e0569b", "#13a8b5"],
  sizes: {
    siteRadius: 13,
    gridDot: 1.4,
    siteStroke: 3.5,
    linkWidth: 7,
    packetRadius: 3.6,
    boundaryWidth: 16,
    overloadRing: 4,
    removeButton: 13,
  },
  /** Seconds a new site takes to grow in. */
  siteAppearSeconds: 0.6,
  /** Seconds a new link takes to draw itself. */
  linkAppearSeconds: 0.25,
  /** Seconds a delivery "pop" ring lasts. */
  popSeconds: 0.5,
};
