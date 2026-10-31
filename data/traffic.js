/**
 * Traffic types. Each key is a traffic type id that sites and events refer to.
 *
 * Fields:
 *   name       Display name.
 *   color      Packet colour (any CSS colour).
 *   shape      Packet shape: "circle" | "square" | "triangle" | "diamond".
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
 *   cloudShare true if it moves to the cloud after a cloud migration.
 *   junk       true for attack traffic: firewalls filter it out, and it
 *              scores nothing.
 */
export const TRAFFIC_TYPES = {
  email: {
    name: "Email & files",
    color: "#2f80ed",
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
    color: "#f2994a",
    shape: "square",
    size: 1,
    to: "datacenter",
    points: 1,
    unlockDay: 0,
    hours: "any",
  },
  payments: {
    name: "Payments",
    color: "#27ae60",
    shape: "triangle",
    size: 0.6,
    to: "datacenter",
    points: 2,
    unlockDay: 0,
    hours: "any",
    maxHops: 3,
    dropPoints: 2,
  },
  voip: {
    name: "VoIP",
    color: "#13a8b5",
    shape: "triangle",
    size: 0.5,
    to: "datacenter",
    points: 1,
    unlockDay: 3,
    hours: "day",
    maxHops: 3,
    dropPoints: 1,
  },
  video: {
    name: "Video",
    color: "#9b51e0",
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
    color: "#e0569b",
    shape: "circle",
    size: 1,
    to: "edge",
    points: 1,
    unlockDay: 0,
    hours: "day",
  },
  backup: {
    name: "Backups",
    color: "#4f4f4f",
    shape: "square",
    size: 3,
    to: ["datacenter", "cloud"],
    points: 3,
    unlockDay: 7,
    hours: "night",
  },
  patch: {
    name: "Patches",
    color: "#56ccf2",
    shape: "diamond",
    size: 1.5,
    to: "site",
    points: 1,
    unlockDay: 0,
    hours: "any",
  },
  allhands: {
    name: "All-hands stream",
    color: "#bb6bd9",
    shape: "diamond",
    size: 2,
    to: "site",
    points: 1,
    unlockDay: 0,
    hours: "any",
  },
  junk: {
    name: "Junk (DDoS)",
    color: "#b5b0a6",
    shape: "circle",
    size: 0.8,
    to: "datacenter",
    points: 0,
    unlockDay: 0,
    hours: "any",
    junk: true,
  },
};
