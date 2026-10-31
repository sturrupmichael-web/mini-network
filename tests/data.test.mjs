import assert from "node:assert/strict";
import { GAME_DATA } from "../data/index.js";
import { MAPS } from "../data/maps.js";
import { SITE_TYPES } from "../data/sites.js";
import { THEME } from "../data/theme.js";
import { TRAFFIC_TYPES } from "../data/traffic.js";
import { validateData } from "../src/data/validate.js";
import { EFFECT_NAMES } from "../src/sim/events.js";

const all = () => ({ ...structuredClone(GAME_DATA), effects: EFFECT_NAMES });

export const tests = [
  ["shipped data is valid", () => {
    assert.deepEqual(validateData(all()), []);
  }],
  ["there is exactly one hub-shaped site type and it is a destination", () => {
    const hubs = Object.entries(SITE_TYPES).filter(([, s]) => s.shape === "hub");
    assert.equal(hubs.length, 1);
    assert.ok(Object.values(TRAFFIC_TYPES).some((t) => t.to === hubs[0][0]));
  }],
  ["every map starts with a data center", () => {
    for (const m of MAPS) assert.ok(m.start.some((s) => s.type === "datacenter"), m.id);
  }],
  ["catches a traffic type pointing at a missing site type", () => {
    const d = all();
    d.traffic.email.to = "moon-base";
    assert.ok(validateData(d).some((e) => e.includes('"moon-base" is not a site type')));
  }],
  ["catches a site sending unknown traffic", () => {
    const d = all();
    d.sites.office.traffic = { carrierPigeon: 1 };
    assert.ok(validateData(d).some((e) => e.includes('unknown traffic type "carrierPigeon"')));
  }],
  ["catches map problems: unknown type, outside the map, too close", () => {
    const d = all();
    d.maps[0].start.push({ type: "spaceport", x: 10, y: 10 });
    d.maps[0].start.push({ type: "office", x: 5000, y: 10 });
    d.maps[0].start.push({ type: "office", x: d.maps[0].start[0].x + 1, y: d.maps[0].start[0].y });
    const errors = validateData(d);
    assert.ok(errors.some((e) => e.includes('unknown site type "spaceport"')));
    assert.ok(errors.some((e) => e.includes("outside the map")));
    assert.ok(errors.some((e) => e.includes("closer than config.sites.minSpacing")));
  }],
  ["catches a non-number in the config", () => {
    const d = all();
    d.config.links.bandwidth = "lots";
    assert.ok(validateData(d).some((e) => e.includes("config.links.bandwidth")));
  }],
  ["catches bad shapes and intervals", () => {
    const d = all();
    d.sites.office.shape = "hexagon";
    d.sites.office.packetInterval = [5, 1];
    d.traffic.email.shape = "star";
    const errors = validateData(d);
    assert.ok(errors.some((e) => e.includes("sites.office.shape")));
    assert.ok(errors.some((e) => e.includes("sites.office.packetInterval")));
    assert.ok(errors.some((e) => e.includes("traffic.email.shape")));
  }],
  ["catches duplicate map ids and broken boundaries", () => {
    const d = all();
    d.maps.push({ ...structuredClone(MAPS[0]), boundaries: [[[0, 0]]] });
    const errors = validateData(d);
    assert.ok(errors.some((e) => e.includes("duplicate")));
    assert.ok(errors.some((e) => e.includes("boundaries[0]")));
  }],
  ["catches bad rewards", () => {
    const d = all();
    d.rewards[0].grant = { unicorns: 1 };
    d.rewards[1].id = d.rewards[2].id;
    const errors = validateData(d);
    assert.ok(errors.some((e) => e.includes('unknown key "unicorns"')));
    assert.ok(errors.some((e) => e.includes("duplicate")));
  }],
  ["catches new-site weights naming unknown site types", () => {
    const d = all();
    d.config.growth.types = { lighthouse: 1 };
    assert.ok(validateData(d).some((e) => e.includes('unknown site type "lighthouse"')));
  }],
  ["theme has line colours", () => {
    assert.ok(THEME.lineColors.length >= 5);
  }],
];
