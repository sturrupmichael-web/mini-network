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
    switchFill: "#2b2b2b",
    edgeFill: "#2b2b2b",
    cloudFill: "#ffffff",
    dropTarget: "rgba(47, 128, 237, 0.25)",
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
    overloadRing: 4,
    removeButton: 13,
  },
  /** Seconds a new site takes to grow in. */
  siteAppearSeconds: 0.6,
};
