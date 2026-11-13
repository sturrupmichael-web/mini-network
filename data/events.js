/**
 * Events. Each one fires on a schedule, shows a toast, and runs an effect
 * for `duration` game seconds.
 *
 * Fields:
 *   id        Stable id.
 *   name      Short title shown in the toast.
 *   toasts    Funny one-liners; one is picked at random each time.
 *   effect    What happens (the engine's effect handlers):
 *               "linkCut"        random links go down for the duration
 *               "broadcast"      the data center sends packets to every site
 *               "acquisition"    a cluster of new sites in a far corner
 *               "cloudMigration" a cloud region appears; some traffic moves there
 *               "securityRules"  an internet edge appears; its links need firewalls
 *               "ddos"           the internet edge floods with junk traffic
 *               "district"       a district hub (params.type) opens far from HQ;
 *                                its kind of site clusters around it
 *   schedule  When it fires. Days are 0-based (day 0 is the first Monday).
 *               { day: 8 }                       once, on that day
 *               { day: 4, every: [5, 8] }        then again every 5–8 days
 *               { weekday: 1, fromWeek: 2 }      every week on that weekday
 *                                                (0 = Mon), from that week
 *             Events that need something (a link to cut, an internet edge to
 *             attack) quietly skip a turn if it isn't there yet.
 *   duration  Game seconds the effect lasts (0 for instant effects).
 *   params    Settings for the effect (see each event).
 */
export const EVENTS = [
  {
    id: "backhoe",
    name: "Backhoe cut",
    toasts: [
      "A backhoe found your fiber. It was not looking for it.",
      "Someone dug a pool. Through a link.",
      "Construction crew: 1, Network: 0.",
    ],
    effect: "linkCut",
    schedule: { day: 6, every: [5, 8] },
    duration: 30,
    // count: how many links go down at once.
    params: { count: 1 },
  },
  {
    id: "patch-tuesday",
    name: "Patch Tuesday",
    toasts: [
      "It's Patch Tuesday. Everyone reboot. No, not all at once.",
      "Updates are rolling out. Please do not turn off your network.",
    ],
    effect: "broadcast",
    schedule: { weekday: 1, fromWeek: 2 },
    duration: 16,
    // traffic: what the data center sends; perSite: packets to each site,
    // spread across the duration.
    params: { traffic: "patch", perSite: 2 },
  },
  {
    id: "acquisition",
    name: "Acquisition",
    toasts: [
      "We bought a company! Their network is… a vibe.",
      "Welcome our new colleagues. And their three offices.",
    ],
    effect: "acquisition",
    schedule: { day: 10, every: [10, 14] },
    duration: 0,
    // count: sites in the cluster; types: odds of each site type.
    params: { count: 3, types: { office: 2, warehouse: 1, retail: 1 } },
  },
  {
    id: "logistics-hub",
    name: "Logistics hub",
    toasts: [
      "The warehouses got their own ERP hub. Connect nearby warehouses to it and keep it fed.",
      "Operations opened a logistics hub. New warehouses will set up around it.",
    ],
    effect: "district",
    schedule: { day: 9 },
    duration: 0,
    // type: the district hub's site type (sites.js).
    params: { type: "logistics" },
  },
  {
    id: "payment-gateway",
    name: "Payment gateway",
    toasts: [
      "Finance stood up a payment gateway. Connect nearby shops to it and keep it fed.",
      "A payment gateway went live. New shops will open around it.",
    ],
    effect: "district",
    schedule: { day: 15 },
    duration: 0,
    params: { type: "payhub" },
  },
  {
    id: "security-rules",
    name: "New security rules",
    toasts: [
      "Compliance says the internet is now a thing. Firewalls on every edge link.",
      "Security audit passed! Conditionally. Very conditionally.",
    ],
    effect: "securityRules",
    schedule: { day: 8 },
    duration: 0,
    // grant: inventory items handed over with the new rules.
    params: { grant: { firewalls: 2 } },
  },
  {
    id: "cloud-migration",
    name: "Cloud migration",
    toasts: [
      "Leadership read an article. We're moving to the cloud.",
      "The cloud is just someone else's data center. Please route to it.",
    ],
    effect: "cloudMigration",
    schedule: { day: 12 },
    duration: 0,
    // share: fraction of cloud-eligible traffic that goes to the cloud from now on.
    params: { share: 0.4 },
  },
  {
    id: "ddos",
    name: "DDoS",
    toasts: [
      "Someone on the internet is very upset with us.",
      "Ten thousand smart fridges want a word.",
    ],
    effect: "ddos",
    schedule: { day: 11, every: [6, 9] },
    duration: 20,
    // rate: junk packets per second arriving at each internet edge.
    params: { traffic: "junk", rate: 2.5 },
  },
  {
    id: "all-hands",
    name: "Exec all-hands",
    toasts: [
      "The CEO is streaming in 4K. From a boat.",
      "All-hands meeting! Cameras on, bandwidth off.",
    ],
    effect: "broadcast",
    schedule: { day: 6, every: [7, 10] },
    duration: 12,
    params: { traffic: "allhands", perSite: 1 },
  },
];
