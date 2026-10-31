/**
 * Mini Network balance and engine configuration.
 *
 * Everything you might want to tune lives here (or in the other files in
 * data/). The engine never hard-codes a balance number.
 *
 * Units used throughout:
 *   - "world units" (wu): the coordinate space maps are drawn in. A map is
 *     typically 1200 × 800 wu. The camera scales the map to fit the screen,
 *     so these are not pixels.
 *   - "seconds": seconds of *game* time. At 2× speed a game second passes
 *     in half a real second.
 *   - "px": CSS pixels on screen (only used for input and drawing sizes).
 */
export const CONFIG = {
  sim: {
    /**
     * Simulation ticks per game second. The simulation always advances in
     * steps of exactly 1 / tickRate seconds, whatever the screen's frame
     * rate, so a given seed plays out identically on every device.
     */
    tickRate: 60,
    /**
     * Most ticks to run in a single animation frame. If the browser stalls
     * (tab in the background, slow phone), extra time is dropped instead of
     * fast-forwarding, so the game never "jumps" ahead.
     */
    maxTicksPerFrame: 8,
    /** Speed multipliers available from the speed buttons, in order. */
    speeds: [1, 2],
  },

  links: {
    /** Links in the inventory at the start of a game. */
    startingCount: 8,
    /**
     * Base bandwidth: how many size-1 packets per second a link can start
     * sending in each direction. A packet of size 2 uses twice the time.
     */
    bandwidth: 2,
    /** How fast packets travel along a link, in world units per second. */
    packetSpeed: 140,
  },

  routing: {
    /**
     * Packets take the cheapest path to their destination. The cost of a
     * path is the sum of, for each hop:
     *     link length (wu)
     *   + hopCost
     *   + congestionWeight × packets currently travelling on that link
     *   + queueWeight × packets waiting at the site the hop arrives at
     * Raise the weights to make traffic spread out around busy links sooner.
     */
    hopCost: 30,
    congestionWeight: 25,
    queueWeight: 15,
    /**
     * Seconds between route recalculations (to pick up new congestion).
     * Adding a link recalculates immediately.
     */
    recomputeInterval: 0.5,
  },

  spawn: {
    /**
     * Global multiplier on every site's packet interval (see sites.js).
     * 1 = as written, 0.5 = packets twice as often.
     */
    packetIntervalScale: 1,
    /** Game seconds before the first packets appear. */
    graceSeconds: 2,
  },

  sites: {
    /**
     * Closest two sites may be, in world units. Used by map validation now
     * and by site spawning in Phase 2.
     */
    minSpacing: 110,
  },

  input: {
    /** How close (px) a pointer must be to a site to start a drag from it. */
    mouseGrabRadius: 22,
    touchGrabRadius: 38,
    /**
     * How close (px) the pointer must pass to a site, mid-drag, to connect
     * to it. Smaller than the grab radius so sweeping a finger past a site
     * doesn't link it by accident.
     */
    mouseConnectRadius: 18,
    touchConnectRadius: 28,
  },

  view: {
    /** Empty space kept around the map, in px. */
    padding: 28,
    /** Space reserved for the HUD bar at the top and the tray at the bottom, in px. */
    hudTop: 56,
    hudBottom: 72,
  },
};
