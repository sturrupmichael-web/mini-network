/**
 * Site types. Each key is a site type id that maps, config and events refer to.
 *
 * Fields:
 *   name            Display name.
 *   shape           How it is drawn: "hub" | "circle" | "square" |
 *                   "triangle" | "cloud" | "edge" | "switch".
 *   size            Drawing size multiplier (1 = a normal site).
 *   capacity        Packets the queue can hold before the site starts to
 *                   overload (its ring timer fills).
 *   packetInterval  [min, max] game seconds between packets this site
 *                   creates. null means it never creates packets by itself.
 *   traffic         Relative weights of the traffic types (ids from
 *                   traffic.js) it creates. Types that aren't unlocked yet,
 *                   are out of hours, or have no destination on the map
 *                   are skipped.
 *   activity        Multipliers on how often packets appear by day and by
 *                   night: { day: 1.5, night: 0.3 }.
 *   burst           null, or { chance, min, max }: each time it creates a
 *                   packet, `chance` of creating a burst of min–max instead.
 *   unlockDay       First day (0-based) new sites of this type can appear.
 *   junction        true for switches: placed by the player, routes traffic
 *                   but never creates or receives it.
 */
export const SITE_TYPES = {
  datacenter: {
    name: "Data center",
    shape: "hub",
    size: 1.5,
    capacity: 40,
    packetInterval: null,
    traffic: {},
    activity: { day: 1, night: 1 },
    burst: null,
    unlockDay: 0,
  },
  office: {
    name: "Office",
    shape: "circle",
    size: 1,
    capacity: 8,
    packetInterval: [2.2, 4.5],
    traffic: { email: 6, voip: 3, video: 1, web: 3, backup: 2 },
    activity: { day: 1.2, night: 0.45 },
    burst: null,
    unlockDay: 0,
  },
  warehouse: {
    name: "Warehouse",
    shape: "square",
    size: 1,
    capacity: 10,
    packetInterval: [3.5, 6],
    traffic: { erp: 6, email: 1, backup: 2 },
    activity: { day: 1.4, night: 0.25 },
    burst: { chance: 0.18, min: 3, max: 5 },
    unlockDay: 2,
  },
  retail: {
    name: "Retail branch",
    shape: "triangle",
    size: 1,
    capacity: 7,
    packetInterval: [2.8, 5],
    traffic: { payments: 6, email: 1, web: 1 },
    activity: { day: 1.3, night: 0.3 },
    burst: null,
    unlockDay: 4,
  },
  cloud: {
    name: "Cloud region",
    shape: "cloud",
    size: 1.35,
    capacity: 40,
    packetInterval: null,
    traffic: {},
    activity: { day: 1, night: 1 },
    burst: null,
    unlockDay: 0,
  },
  edge: {
    name: "Internet edge",
    shape: "edge",
    size: 1.25,
    capacity: 30,
    packetInterval: null,
    traffic: {},
    activity: { day: 1, night: 1 },
    burst: null,
    unlockDay: 0,
  },
  switch: {
    name: "Switch",
    shape: "switch",
    size: 0.7,
    capacity: 24,
    packetInterval: null,
    traffic: {},
    activity: { day: 1, night: 1 },
    burst: null,
    unlockDay: 0,
    junction: true,
  },
};
