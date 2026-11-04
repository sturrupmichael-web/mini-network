/**
 * Network equipment: link bandwidth tiers and the items in the inventory
 * tray.
 */

/**
 * Link tiers, lowest first. A new link is the first tier; each bandwidth
 * upgrade moves it up one.
 *   bandwidth  Multiplier on config.links.bandwidth.
 *   width      Multiplier on the drawn line width (thicker = faster).
 */
export const LINK_TIERS = [
  { id: "copper", name: "Copper", bandwidth: 1, width: 0.75 },
  { id: "t1", name: "T1", bandwidth: 1.7, width: 1 },
  { id: "fiber", name: "Fiber", bandwidth: 2.8, width: 1.3 },
  { id: "darkfiber", name: "Dark fiber", bandwidth: 4.5, width: 1.65 },
];

/**
 * Inventory items, in tray order. The key is the inventory id used by
 * config.inventory, rewards and events.
 *   name    Display name.
 *   hint    One line shown when you pick it up.
 *   tip     What it's for, shown when you hover over it (or press and hold
 *           it on a phone).
 *   target  What you drop it on: "link" | "site" | "map" (empty space or a
 *           link) | null (used automatically).
 */
export const ITEMS = {
  links: {
    name: "Links",
    hint: "Drag from a site along the grid to another site.",
    tip: "Drag from one site to another; the link follows your finger square by square, so you can steer around things. Each grid square uses one. Removing a link gives them all back, and more arrive each day.",
    target: null,
  },
  upgrades: {
    name: "Bandwidth upgrade",
    hint: "Drop on a link to move it up a tier.",
    tip: "Drop on a busy link to move it up a tier (Copper, T1, Fiber, Dark fiber). Thicker links carry more packets at once.",
    target: "link",
  },
  switches: {
    name: "Switch",
    hint: "Drop on the map, or on a link to split it.",
    tip: "A junction for your links. Drop it on empty map to start a hub, or on a link to split it in two so more sites can join (the square it sits on comes back).",
    target: "map",
  },
  firewalls: {
    name: "Firewall",
    hint: "Drop on a link. Internet edge links need one.",
    tip: "Drop on a link. After the security rules change, links to an internet edge carry nothing without one, and it filters attack traffic.",
    target: "link",
  },
  sdwan: {
    name: "SD-WAN box",
    hint: "Drop on a site so it reroutes around cuts at once.",
    tip: "Drop on a site. When a link is cut, that site finds another way instantly instead of waiting for the network to catch up.",
    target: "site",
  },
  routers: {
    name: "Core router",
    hint: "Drop on a switch so it never jams.",
    tip: "Drop on a switch to make it a core router. Switches forward one packet at a time and slow down as more links meet there; a core router forwards several times faster, however many links it has.",
    target: "site",
  },
  leased: {
    name: "Leased lines",
    hint: "Used up when a link crosses a carrier boundary.",
    tip: "Needed to run a link across a shaded carrier boundary, one per boundary crossed. You get it back when the link is removed.",
    target: null,
  },
};
