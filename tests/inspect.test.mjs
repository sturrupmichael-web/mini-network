/**
 * Tap-to-explain cards (src/ui/inspect.js): every symbol on the map has a
 * description, and the card adds a line for whatever is happening to it.
 */
import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { GAME_DATA } from "../data/index.js";
import { INFO } from "../data/info.js";
import { EFFECT_NAMES } from "../src/sim/events.js";
import { validateData } from "../src/data/validate.js";
import { describe } from "../src/ui/inspect.js";
import { addCoreRouter, addFirewall, addLink, addQos, addSdwan, makeBackbone, placeSwitch, setEventSchedule, upgradeLink } from "../src/sim/world.js";
import { createPacket } from "../src/sim/packets.js";
import { configWith, customMap, makeWorld } from "./helpers.mjs";

const extra = (more = {}) => ({ tiers: GAME_DATA.tiers, terrain: GAME_DATA.terrain, lineColor: () => "#f00", ...more });

function lab() {
  const config = configWith({
    growth: { firstSiteAt: 1e9 },
    inventory: { ...CONFIG.inventory, switches: 2, routers: 1, qos: 1, sdwan: 1, firewalls: 1, backbone: 1, upgrades: 3 },
    links: { ...CONFIG.links, startingCount: 300 },
  });
  const world = makeWorld({
    config,
    map: customMap([
      { type: "datacenter", x: 600, y: 400, label: "HQ" },
      { type: "office", x: 300, y: 250 },
      { type: "edge", x: 900, y: 250 },
      { type: "logistics", x: 900, y: 600 },
      { type: "retail", x: 300, y: 600 },
    ]),
    seed: "inspect",
  });
  setEventSchedule(world, false);
  return world;
}

export const tests = [
  ["every site, traffic type, link tier and terrain kind has a description", () => {
    for (const id of Object.keys(GAME_DATA.sites)) assert.ok(INFO.sites[id], `site ${id}`);
    for (const id of Object.keys(GAME_DATA.traffic)) assert.ok(INFO.traffic[id], `traffic ${id}`);
    for (const t of GAME_DATA.tiers) assert.ok(INFO.tiers[t.id], `tier ${t.id}`);
    for (const id of Object.keys(GAME_DATA.terrain)) assert.ok(INFO.terrain[id], `terrain ${id}`);
  }],
  ["the data check catches a site type with no description", () => {
    const info = { ...INFO, sites: { ...INFO.sites, office: "" } };
    const errors = validateData({ ...GAME_DATA, effects: EFFECT_NAMES, info });
    assert.ok(errors.some((e) => e.includes("info.sites.office")), errors.join("\n"));
  }],
  ["a site card names it and explains what it does", () => {
    const world = lab();
    const hq = world.sites[0];
    const card = describe(world, INFO, { kind: "site", id: hq.id }, extra());
    assert.equal(card.title, "HQ · Data center");
    assert.equal(card.text, INFO.sites.datacenter);
    assert.equal(card.icon.shape, "hub");
  }],
  ["site cards add a line for overload, queues, hunger, growth and SD-WAN", () => {
    const world = lab();
    const [hq, office, , logistics] = world.sites;
    office.overload = 5;
    createPacket(world, office, "email", "datacenter");
    assert.ok(addSdwan(world, office.id).ok);
    const notes = describe(world, INFO, { kind: "site", id: office.id }, extra()).notes;
    assert.ok(notes.includes(INFO.states.overload));
    assert.ok(notes.includes(INFO.states.queue));
    assert.ok(notes.includes(INFO.states.sdwan));
    assert.ok(notes.some((n) => n.startsWith("Once ")), "how far from growing");
    office.grown = true;
    assert.ok(describe(world, INFO, { kind: "site", id: office.id }, extra()).notes.includes(INFO.states.grown));
    assert.ok(describe(world, INFO, { kind: "site", id: logistics.id }, extra()).notes.includes(INFO.states.hunger));
    assert.equal(describe(world, INFO, { kind: "site", id: hq.id }, extra()).notes.length, 0);
  }],
  ["switch cards cover jams, core routers and QoS", () => {
    const world = lab();
    const sw = placeSwitch(world, 450, 400).site;
    sw.jam = 0.8;
    assert.ok(describe(world, INFO, { kind: "site", id: sw.id }, extra()).notes.includes(INFO.states.jam));
    assert.ok(addQos(world, sw.id).ok);
    assert.ok(addCoreRouter(world, sw.id).ok);
    const card = describe(world, INFO, { kind: "site", id: sw.id }, extra({ colors: { core: "#123456" } }));
    assert.equal(card.title, "Core router");
    assert.equal(card.icon.color, "#123456");
    assert.ok(card.notes.includes(INFO.states.qos));
    assert.ok(!card.notes.includes(INFO.states.jam), "a core router never jams");
  }],
  ["link cards show the tier, both ends and what's happening to it", () => {
    const world = lab();
    const [hq, office, edge] = world.sites;
    const link = addLink(world, office.id, hq.id, 0).link;
    let card = describe(world, INFO, { kind: "link", id: link.id }, extra());
    assert.equal(card.title, "Copper link");
    assert.equal(card.subtitle, "Office ↔ HQ");
    upgradeLink(world, link.id);
    upgradeLink(world, link.id);
    assert.equal(describe(world, INFO, { kind: "link", id: link.id }, extra()).title, "Fiber link");
    link.down = { since: world.time, until: world.time + 10 };
    card = describe(world, INFO, { kind: "link", id: link.id }, extra({ selected: true }));
    assert.ok(card.notes[0].includes("cut") && card.notes[0].includes("10s"), card.notes[0]);
    assert.ok(card.notes.includes(INFO.states.selected));

    const toEdge = addLink(world, edge.id, hq.id, 1).link;
    world.security = true;
    assert.ok(describe(world, INFO, { kind: "link", id: toEdge.id }, extra()).notes.includes(INFO.states.blocked));
    assert.ok(addFirewall(world, toEdge.id).ok);
    const fw = describe(world, INFO, { kind: "link", id: toEdge.id }, extra()).notes;
    assert.ok(fw.includes(INFO.states.firewall) && !fw.includes(INFO.states.blocked));
    assert.ok(makeBackbone(world, toEdge.id).ok);
    assert.equal(describe(world, INFO, { kind: "link", id: toEdge.id }, extra()).title, "Backbone");
  }],
  ["packets, terrain, boundaries and the closed map explain themselves", () => {
    const world = lab();
    const packet = createPacket(world, world.sites[4], "payments", "datacenter");
    const card = describe(world, INFO, { kind: "packet", id: packet.id }, extra());
    assert.equal(card.title, "Payments");
    assert.equal(card.icon.shape, "triangle");
    assert.equal(describe(world, INFO, { kind: "terrain", terrain: "water" }, extra()).title, "Water");
    assert.equal(describe(world, INFO, { kind: "boundary" }, extra()).title, "Carrier boundary");
    assert.equal(describe(world, INFO, { kind: "closed" }, extra()).title, "Not open yet");
    assert.equal(describe(world, INFO, null, extra()), null);
    assert.equal(describe(world, INFO, { kind: "site", id: 9999 }, extra()), null);
  }],
];
