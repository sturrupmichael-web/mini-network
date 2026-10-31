/**
 * Everything in data/, in one object. Add new data files here so the
 * engine, the validator and the tests all see them.
 */
import { CONFIG } from "./config.js";
import { ITEMS, LINK_TIERS } from "./equipment.js";
import { EVENTS } from "./events.js";
import { MAPS } from "./maps.js";
import { REWARD_GRANTS, REWARDS } from "./rewards.js";
import { SITE_TYPES } from "./sites.js";
import { TRAFFIC_TYPES } from "./traffic.js";

export const GAME_DATA = {
  config: CONFIG,
  sites: SITE_TYPES,
  traffic: TRAFFIC_TYPES,
  maps: MAPS,
  rewards: REWARDS,
  rewardGrants: REWARD_GRANTS,
  events: EVENTS,
  tiers: LINK_TIERS,
  items: ITEMS,
};

/** The subset the simulation needs (createWorld's `data`). */
export const SIM_DATA = {
  sites: SITE_TYPES,
  traffic: TRAFFIC_TYPES,
  rewards: REWARDS,
  events: EVENTS,
  tiers: LINK_TIERS,
};
