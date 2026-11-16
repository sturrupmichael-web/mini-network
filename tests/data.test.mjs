import assert from "node:assert/strict";
import { GAME_DATA } from "../data/index.js";
import { MAPS } from "../data/maps.js";
import { SITE_TYPES } from "../data/sites.js";
import { NODE, NODE_ORDER, PALETTES, THEME } from "../data/theme.js";
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
  ["the node palette has a day and a night colour for every name, in the guide's order", () => {
    assert.deepEqual(NODE_ORDER, ["blue", "red", "yellow", "green", "purple", "teal", "orange", "pink"]);
    for (const set of [NODE.day, NODE.night]) assert.deepEqual(Object.keys(set).sort(), [...NODE_ORDER].sort());
    for (const name of NODE_ORDER) assert.notEqual(NODE.day[name], NODE.night[name]);
  }],
  ["sites and the traffic headed for them share a colour", () => {
    for (const [id, t] of Object.entries(TRAFFIC_TYPES)) {
      if (t.junk) assert.equal(t.node, undefined, `${id}: junk stays neutral`);
      else assert.ok(NODE_ORDER.includes(t.node), `${id} has a node colour`);
      if (t.to === "site" || !t.node) continue;
      for (const dest of [t.to].flat()) {
        const d = SITE_TYPES[dest];
        if (d.node) assert.equal(d.node, t.node, `${id} → ${dest}`);
      }
    }
    // The data center takes everything, so it's the neutral slate.
    assert.equal(SITE_TYPES.datacenter.node, undefined);
  }],
  ["a bad node colour name is caught", () => {
    const d = all();
    d.sites.office.node = "chartreuse";
    assert.ok(validateData(d).some((e) => e.includes("sites.office.node")));
  }],
  ["every map has a ground palette, and every palette its colours", () => {
    for (const m of MAPS) assert.ok(PALETTES[m.palette], `${m.id} palette`);
    for (const p of Object.values(PALETTES)) {
      for (const key of ["ground", "secZone", "wallZone", "park", "cable", "backbone"]) assert.match(p[key], /^#[0-9a-f]{6}$/i);
    }
    assert.ok(THEME.light.background && THEME.dark.background);
  }],
  ["every site type has a colour, and each kind of sending site its own", () => {
    const colors = Object.values(SITE_TYPES).map((s) => s.color);
    assert.ok(colors.every((c) => typeof c === "string" && c.length > 0));
    // Colour means "who talks to whom", so a district hub shares its senders'
    // colour, but no two kinds of sender share one.
    const senders = Object.values(SITE_TYPES).filter((s) => s.packetInterval !== null).map((s) => s.node);
    assert.ok(senders.every(Boolean));
    assert.equal(new Set(senders).size, senders.length, "no two kinds of sender share a colour");
  }],
  ["the validator catches a site type without a colour or a tool without a tip", () => {
    const data = all();
    delete data.sites.office.color;
    delete data.items.switches.tip;
    const problems = validateData(data).join("\n");
    assert.match(problems, /sites\.office\.color/);
    assert.match(problems, /items\.switches needs a name, a hint and a tip/);
  }],
];
