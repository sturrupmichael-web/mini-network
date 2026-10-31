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
  dark: {
    background: "#1d1e22",
    boundary: "#26313b",
    siteFill: "#1d1e22",
    siteStroke: "#e9e6df",
    hubFill: "#e9e6df",
    hubStroke: "#e9e6df",
    hubText: "#1d1e22",
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
    switchFill: "#e9e6df",
    edgeFill: "#e9e6df",
    cloudFill: "#1d1e22",
    dropTarget: "rgba(86, 160, 255, 0.3)",
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
  /** Seconds a new link takes to draw itself. */
  linkAppearSeconds: 0.25,
  /** Seconds a delivery "pop" ring lasts. */
  popSeconds: 0.5,
};
