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
 *   grant    What you get. Known keys:
 *              links     extra links in the inventory
 *              capacity  extra queue capacity at every site (permanent)
 */
export const REWARDS = [
  {
    id: "links-2",
    label: "+2 links",
    detail: "Two more links for the inventory.",
    weight: 3,
    fromWeek: 1,
    grant: { links: 2 },
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
    id: "capacity-4",
    label: "Much bigger buffers",
    detail: "Every site queues 4 more packets before it overloads.",
    weight: 1,
    fromWeek: 2,
    grant: { capacity: 4 },
  },
  {
    id: "links-3",
    label: "+3 links",
    detail: "A big order of cable came in.",
    weight: 1,
    fromWeek: 3,
    grant: { links: 3 },
  },
];

/** The grant keys the engine understands (checked by the validator). */
export const REWARD_GRANTS = ["links", "capacity"];
