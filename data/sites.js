/**
 * Site types. Each key is a site type id that maps, config and events refer to.
 *
 * Fields:
 *   name            Display name.
 *   shape           How it is drawn: "hub" | "circle" | "square" |
 *                   "triangle" | "cloud" | "edge" | "switch" |
 *                   "district".
 *   color           Fill colour (any CSS colour), used where the theme's
 *                   colour isn't known (info cards, the run report).
 *   node            Optional gameplay colour name from theme.js NODE
 *                   ("blue", "red", …): the map draws the site in that
 *                   colour for the current theme. A site and the traffic
 *                   it trades share a colour. Leave it out for neutral
 *                   pieces (the data center, switches).
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
 *   district        Optional: a destination site type this kind of site
 *                   clusters around. Once one is on the map, most new sites
 *                   of this kind appear near it (config.districts).
 *   hungry          Optional, for district hubs: true if the hub wants
 *                   deliveries. Left unserved it builds up hunger pips,
 *                   and a full set of pips fills its overload ring
 *                   (config.hunger).
 *   grows           Optional, for sites that send traffic: true if it can
 *                   grow into a bigger, busier site once enough of its
 *                   packets have been delivered (config.siteGrowth).
 *   label           Optional short text drawn on "hub" and "district" sites
 *                   that arrive during play.
 */
export const SITE_TYPES = {
  datacenter: {
    name: "Data center",
    shape: "hub",
    color: "#4A5560",
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
    color: "#3E8ED0",
    node: "blue",
    size: 1,
    capacity: 8,
    packetInterval: [2.2, 4.5],
    traffic: { email: 6, voip: 3, video: 1, web: 3, backup: 2 },
    activity: { day: 1.2, night: 0.45 },
    burst: null,
    unlockDay: 0,
    grows: true,
  },
  warehouse: {
    name: "Warehouse",
    shape: "square",
    color: "#F2B33D",
    node: "yellow",
    size: 1,
    capacity: 10,
    packetInterval: [3.5, 6],
    traffic: { erp: 6, email: 1, backup: 2 },
    activity: { day: 1.4, night: 0.25 },
    burst: { chance: 0.18, min: 3, max: 5 },
    unlockDay: 2,
    district: "logistics",
    grows: true,
  },
  retail: {
    name: "Retail branch",
    shape: "triangle",
    color: "#4FAE6A",
    node: "green",
    size: 1,
    capacity: 7,
    packetInterval: [2.8, 5],
    traffic: { payments: 6, email: 1, web: 1 },
    activity: { day: 1.3, night: 0.3 },
    burst: null,
    unlockDay: 4,
    district: "payhub",
    grows: true,
  },
  logistics: {
    name: "Logistics hub",
    shape: "district",
    color: "#F2B33D",
    node: "yellow",
    size: 1.3,
    capacity: 36,
    packetInterval: null,
    traffic: {},
    activity: { day: 1, night: 1 },
    burst: null,
    unlockDay: 0,
    label: "ERP",
    hungry: true,
  },
  payhub: {
    name: "Payment gateway",
    shape: "district",
    color: "#4FAE6A",
    node: "green",
    size: 1.3,
    capacity: 36,
    packetInterval: null,
    traffic: {},
    activity: { day: 1, night: 1 },
    burst: null,
    unlockDay: 0,
    label: "PAY",
    hungry: true,
  },
  cloud: {
    name: "Cloud region",
    shape: "cloud",
    color: "#EE8A3C",
    node: "orange",
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
    color: "#E2574C",
    node: "red",
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
    color: "#9AA6B2",
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
