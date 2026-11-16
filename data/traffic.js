/**
 * Traffic types. Each key is a traffic type id that sites and events refer to.
 *
 * Fields:
 *   name       Display name.
 *   color      Packet colour (any CSS colour), used where the theme's
 *              colour isn't known.
 *   node       Optional gameplay colour name from theme.js NODE; the map
 *              draws the packet in it for the current theme. It matches
 *              the site it is headed for where that has a colour (web →
 *              internet edge, ERP → logistics hub, …).
 *   shape      Its shape on info-card icons: "circle" | "square" |
 *              "triangle" | "diamond". On the map every packet is a pill.
 *   size       Bandwidth used: a size-2 packet keeps a link busy twice as
 *              long as a size-1 packet. Also scales how big it is drawn.
 *   to         Where it goes. One of:
 *                - a site type id: delivered at the nearest reachable site
 *                  of that type
 *                - a list of site type ids: whichever is cheapest to reach
 *                - "site": a specific site, picked by whatever creates it
 *                  (used by broadcasts from the data center)
 *   points     Score for delivering one packet.
 *   unlockDay  First day (0-based) sites start sending it.
 *   hours      "any" | "day" | "night": when sites send it.
 *   maxHops    Optional. If the packet needs more hops than this it's
 *              dropped: you lose dropPoints and the site where it dropped
 *              gets an overload penalty (config.drops).
 *   dropPoints Points lost per drop.
 *   priority   true for traffic a QoS policy sends first (latency-sensitive
 *              calls and card payments).
 *   cloudShare true if it moves to the cloud after a cloud migration.
 *   junk       true for attack traffic: firewalls filter it out, and it
 *              scores nothing.
 */
export const TRAFFIC_TYPES = {
  email: {
    name: "Email & files",
    color: "#3E8ED0",
    node: "blue",
    shape: "circle",
    size: 1,
    to: "datacenter",
    points: 1,
    unlockDay: 0,
    hours: "any",
    cloudShare: true,
  },
  erp: {
    name: "ERP",
    color: "#F2B33D",
    node: "yellow",
    shape: "square",
    size: 1,
    to: ["datacenter", "logistics"],
    points: 1,
    unlockDay: 0,
    hours: "any",
  },
  payments: {
    name: "Payments",
    color: "#4FAE6A",
    node: "green",
    shape: "triangle",
    size: 0.6,
    to: ["datacenter", "payhub"],
    points: 2,
    unlockDay: 0,
    hours: "any",
    maxHops: 3,
    dropPoints: 2,
    priority: true,
  },
  voip: {
    name: "VoIP",
    color: "#8E6CC8",
    node: "purple",
    shape: "triangle",
    size: 0.5,
    to: "datacenter",
    points: 1,
    unlockDay: 3,
    hours: "day",
    maxHops: 3,
    dropPoints: 1,
    priority: true,
  },
  video: {
    name: "Video",
    color: "#2FAFA6",
    node: "teal",
    shape: "diamond",
    size: 2,
    to: "datacenter",
    points: 2,
    unlockDay: 6,
    hours: "day",
    cloudShare: true,
  },
  web: {
    name: "Web & SaaS",
    color: "#E2574C",
    node: "red",
    shape: "circle",
    size: 1,
    to: "edge",
    points: 1,
    unlockDay: 0,
    hours: "day",
  },
  backup: {
    name: "Backups",
    color: "#EE8A3C",
    node: "orange",
    shape: "square",
    size: 3,
    to: ["datacenter", "cloud"],
    points: 3,
    unlockDay: 7,
    hours: "night",
  },
  patch: {
    name: "Patches",
    color: "#E77FA8",
    node: "pink",
    shape: "diamond",
    size: 1.5,
    to: "site",
    points: 1,
    unlockDay: 0,
    hours: "any",
  },
  allhands: {
    name: "All-hands stream",
    color: "#E77FA8",
    node: "pink",
    shape: "diamond",
    size: 2,
    to: "site",
    points: 1,
    unlockDay: 0,
    hours: "any",
  },
  junk: {
    name: "Junk (DDoS)",
    color: "#A8A196",
    shape: "circle",
    size: 0.8,
    to: "datacenter",
    points: 0,
    unlockDay: 0,
    hours: "any",
    junk: true,
  },
};
