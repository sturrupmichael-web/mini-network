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
 *   target  What you drop it on: "link" | "site" | "map" (empty space or a
 *           link) | null (used automatically).
 */
export const ITEMS = {
  links: { name: "Links", hint: "Drag between sites to connect them.", target: null },
  upgrades: { name: "Bandwidth upgrade", hint: "Drop on a link to move it up a tier.", target: "link" },
  switches: { name: "Switch", hint: "Drop on the map, or on a link to split it.", target: "map" },
  firewalls: { name: "Firewall", hint: "Drop on a link. Internet edge links need one.", target: "link" },
  sdwan: { name: "SD-WAN box", hint: "Drop on a site so it reroutes around cuts at once.", target: "site" },
  leased: { name: "Leased lines", hint: "Used up when a link crosses a carrier boundary.", target: null },
};
