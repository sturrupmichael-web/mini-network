/**
 * Site types. Each key is a site type id that maps and events refer to.
 *
 * Fields:
 *   name            Display name.
 *   shape           How it is drawn: "hub" | "circle" | "square" | "triangle".
 *   size            Drawing size multiplier (1 = a normal site).
 *   capacity        Packets the site's queue can hold before it starts to
 *                   overload (overload timers arrive in Phase 2).
 *   packetInterval  [min, max] game seconds between packets this site
 *                   creates. Each gap is picked at random in that range.
 *                   null means the site never creates packets.
 *   traffic         Relative weights of the traffic types (ids from
 *                   traffic.js) this site creates. { email: 3, video: 1 }
 *                   means 3 email packets for every video packet on average.
 */
export const SITE_TYPES = {
  datacenter: {
    name: "Data center",
    shape: "hub",
    size: 1.5,
    capacity: 40,
    packetInterval: null,
    traffic: {},
  },
  office: {
    name: "Office",
    shape: "circle",
    size: 1,
    capacity: 8,
    packetInterval: [2.2, 4.5],
    traffic: { email: 1 },
  },
};
