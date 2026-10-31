/**
 * Traffic types. Each key is a traffic type id that sites refer to.
 *
 * Fields:
 *   name     Display name.
 *   color    Packet colour (any CSS colour).
 *   shape    Packet shape: "circle" | "square" | "triangle" | "diamond".
 *   size     Bandwidth used: a size-2 packet keeps a link busy twice as
 *            long as a size-1 packet. Also scales how big it is drawn.
 *   to       Where it goes: a site type id from sites.js. The packet is
 *            delivered at the nearest reachable site of that type.
 *   points   Score for delivering one packet.
 */
export const TRAFFIC_TYPES = {
  email: {
    name: "Email & files",
    color: "#2f80ed",
    shape: "circle",
    size: 1,
    to: "datacenter",
    points: 1,
  },
};
