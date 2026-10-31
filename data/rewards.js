/**
 * Weekly rewards. At the end of each week the game pauses and offers two
 * different rewards picked at random (weighted) from this list.
 *
 * Fields:
 *   id       Stable id.
 *   label    Short button text.
 *   detail   One line under the label.
 *   weight   Relative odds of being offered.
 *   fromWeek First week this can be offered (week 1 ends the first time).
 *   grant    What you get. Keys are inventory items from equipment.js
 *            (links, upgrades, switches, firewalls, sdwan, leased), plus
 *            capacity: extra queue capacity at every site (permanent).
 */
export const REWARDS = [
  { id: "links-2", label: "+2 links", detail: "Two more links for the inventory.", weight: 3, fromWeek: 1, grant: { links: 2 } },
  {
    id: "fiber-switch",
    label: "Upgrade + switch",
    detail: "One bandwidth upgrade and one switch.",
    weight: 3,
    fromWeek: 1,
    grant: { upgrades: 1, switches: 1 },
  },
  {
    id: "upgrades-2",
    label: "2 bandwidth upgrades",
    detail: "Make two links a tier faster.",
    weight: 2,
    fromWeek: 1,
    grant: { upgrades: 2 },
  },
  {
    id: "links-1-capacity",
    label: "+1 link, bigger buffers",
    detail: "One link, and every site queues 2 more packets.",
    weight: 2,
    fromWeek: 1,
    grant: { links: 1, capacity: 2 },
  },
  {
    id: "leased-links",
    label: "Leased line + link",
    detail: "Cross a carrier boundary with a new link.",
    weight: 2,
    fromWeek: 1,
    grant: { leased: 1, links: 1 },
  },
  { id: "sdwan-2", label: "2 SD-WAN boxes", detail: "Sites with one reroute around cuts instantly.", weight: 2, fromWeek: 2, grant: { sdwan: 2 } },
  { id: "firewall-link", label: "Firewall + link", detail: "Another way out to the internet.", weight: 2, fromWeek: 2, grant: { firewalls: 1, links: 1 } },
  { id: "capacity-4", label: "Much bigger buffers", detail: "Every site queues 4 more packets before it overloads.", weight: 1, fromWeek: 2, grant: { capacity: 4 } },
  { id: "links-3", label: "+3 links", detail: "A big order of cable came in.", weight: 1, fromWeek: 3, grant: { links: 3 } },
];

/** The grant keys the engine understands (checked by the validator). */
export const REWARD_GRANTS = ["links", "upgrades", "switches", "firewalls", "sdwan", "leased", "capacity"];
