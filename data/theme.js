/**
 * Colours and drawing sizes. Sizes are CSS pixels at a "normal" zoom and
 * shrink a little on small screens (see render/renderer.js).
 */
export const THEME = {
  light: {
    background: "#f6f4ef",
    boundary: "#dbe7ef",
    siteFill: "#ffffff",
    siteStroke: "#2b2b2b",
    hubFill: "#2b2b2b",
    hubStroke: "#2b2b2b",
    hubText: "#ffffff",
    highlight: "rgba(43, 43, 43, 0.12)",
    preview: "rgba(43, 43, 43, 0.35)",
  },
  /**
   * Colours for links. Each drag gesture draws in the next colour, so the
   * links you draw in one stroke read as one "line".
   */
  lineColors: ["#e8483f", "#f2a516", "#2fa66a", "#2f80ed", "#9b51e0", "#e0569b", "#13a8b5"],
  sizes: {
    siteRadius: 13,
    siteStroke: 3.5,
    linkWidth: 7,
    packetRadius: 3.6,
    boundaryWidth: 16,
  },
};
