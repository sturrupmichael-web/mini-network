/**
 * QoS policies on switches, and district hubs (logistics hub, payment
 * gateway) that warehouses and shops cluster around.
 */
import assert from "node:assert/strict";
import { CONFIG } from "../data/config.js";
import { createPacket } from "../src/sim/packets.js";
import { findSiteSpot } from "../src/sim/progression.js";
import { switchTime } from "../src/sim/sites.js";
import { addLink, addQos, placeSwitch, removeSwitch, setEventSchedule, snapshot, step, triggerEvent } from "../src/sim/world.js";
import { configWith, customMap, makeWorld } from "./helpers.mjs";

const TPS = CONFIG.sim.tickRate;

function lab({ qos = 0, start = null, overrides = {} } = {}) {
  const config = configWith({
    growth: { firstSiteAt: 1e9 },
    overload: { seconds: 1e9 },
    spawn: { graceSeconds: 1e9, newSiteGrace: 1e9 },
    inventory: { ...CONFIG.inventory, switches: 2, qos },
    links: { ...CONFIG.links, startingCount: 300, bandwidth: 100 },
    ...overrides,
  });
  const world = makeWorld({
    config,
    map: customMap(
      start ?? [
        { type: "datacenter", x: 600, y: 400 },
        { type: "office", x: 300, y: 250 },
        { type: "retail", x: 300, y: 550 },
      ],
    ),
    seed: "districts",
  });
  setEventSchedule(world, false);
  return world;
}

function hubSwitch(world) {
  const sw = placeSwitch(world, 450, 400).site;
  assert.ok(addLink(world, sw.id, world.sites[0].id).ok);
  return sw;
}

export const tests = [
  ["a QoS policy sends calls and payments first at its switch", () => {
    const world = lab({ qos: 1 });
    const sw = hubSwitch(world);
    assert.ok(addQos(world, sw.id).ok);
    const email = [];
    for (let i = 0; i < 6; i++) email.push(createPacket(world, sw, "email", "datacenter").id);
    const pay = createPacket(world, sw, "payments", "datacenter|payhub").id;
    step(world);
    assert.ok(!sw.queue.includes(pay), "the payment left first");
    assert.deepEqual(sw.queue, email, "the email waits, still in order");
  }],
  ["QoS makes priority traffic quicker through the switch and the rest slower", () => {
    const world = lab({ qos: 1 });
    const sw = hubSwitch(world);
    const pay = { traffic: "payments", size: 1 };
    const mail = { traffic: "email", size: 1 };
    const before = { pay: switchTime(world, sw, pay), mail: switchTime(world, sw, mail) };
    addQos(world, sw.id);
    assert.ok(switchTime(world, sw, pay) < before.pay);
    assert.ok(switchTime(world, sw, mail) > before.mail);
  }],
  ["QoS policies only go on switches, once, and come back with the switch", () => {
    const world = lab({ qos: 1 });
    const sw = hubSwitch(world);
    assert.equal(addQos(world, world.sites[1].id).reason, "not-a-switch");
    assert.ok(addQos(world, sw.id).ok);
    assert.equal(addQos(world, sw.id).reason, "has-qos");
    const other = placeSwitch(world, 750, 400).site;
    assert.equal(addQos(world, other.id).reason, "no-qos");
    const before = snapshot(world);
    assert.ok(removeSwitch(world, sw.id).ok);
    assert.equal(world.inventory.qos, 1, "refunded");
    assert.notEqual(snapshot(world), before);
  }],
  ["a district hub opens far from HQ with its label", () => {
    const world = lab();
    assert.ok(triggerEvent(world, "logistics-hub"));
    const hub = world.sites.find((s) => s.type === "logistics");
    assert.ok(hub, "placed");
    assert.equal(hub.label, "ERP");
    assert.equal(triggerEvent(world, "logistics-hub"), false, "only one");
    assert.ok(triggerEvent(world, "payment-gateway"));
    assert.ok(world.sites.some((s) => s.type === "payhub"));
  }],
  ["shops can pay through the payment gateway instead of HQ", () => {
    const world = lab({
      start: [
        { type: "datacenter", x: 200, y: 400 },
        { type: "retail", x: 900, y: 400 },
        { type: "payhub", x: 1050, y: 400 },
      ],
    });
    const [hq, shop, gateway] = world.sites;
    assert.ok(addLink(world, shop.id, hq.id).ok);
    assert.ok(addLink(world, shop.id, gateway.id).ok);
    createPacket(world, shop, "payments", "datacenter|payhub");
    const delivered = [];
    for (let i = 0; i < 5 * TPS; i++) {
      step(world);
      for (const e of world.events) if (e.type === "delivered") delivered.push(e.siteId);
      world.events.length = 0;
    }
    assert.deepEqual(delivered, [gateway.id], "the nearer destination");
  }],
  ["new warehouses cluster around a logistics hub", () => {
    const world = lab({ overrides: { districts: { chance: 1, radius: 260 } } });
    triggerEvent(world, "logistics-hub");
    const hub = world.sites.find((s) => s.type === "logistics");
    let found = 0;
    for (let i = 0; i < 10; i++) {
      const spot = findSiteSpot(world, "warehouse");
      if (!spot) continue;
      found++;
      assert.ok(Math.hypot(spot.x - hub.x, spot.y - hub.y) <= 260, "within the district");
    }
    assert.ok(found > 0, "found spots");
  }],
  ["district hubs only receive traffic, never send it", () => {
    const world = lab();
    triggerEvent(world, "logistics-hub");
    const hub = world.sites.find((s) => s.type === "logistics");
    assert.equal(hub.nextSpawn, Infinity);
  }],
];
