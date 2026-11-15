/**
 * Tap-to-explain: turns "the thing you tapped" into a short card
 * ({ title, subtitle, icon, text, notes }) for the HUD to show. Pure: it
 * only reads the world and the text in data/info.js, so it's tested in node.
 *
 * Targets (from input/pointer.js):
 *   { kind: "site", id }      a site or switch
 *   { kind: "link", id }      a link
 *   { kind: "packet", id }    a packet, travelling or waiting in a queue
 *   { kind: "terrain", terrain }  water, park or hills
 *   { kind: "boundary" }      a carrier boundary line
 *   { kind: "closed" }        the shaded part of the map that isn't open yet
 */
import { isBlocked } from "../sim/links.js";

/**
 * @param {object} world
 * @param {object} info     INFO from data/info.js
 * @param {object} target
 * @param {object} [extra]  { tiers, terrain, lineColor(line), colors (theme palette), selected }
 * @returns {null | { title: string, subtitle: string, icon: object, text: string, notes: string[] }}
 */
export function describe(world, info, target, extra = {}) {
  if (!target) return null;
  switch (target.kind) {
    case "site":
      return describeSite(world, info, world.siteById.get(target.id), extra);
    case "link":
      return describeLink(world, info, world.linkById.get(target.id), extra);
    case "packet":
      return describePacket(world, info, world.packets.find((p) => p.id === target.id));
    case "terrain": {
      const kind = extra.terrain?.[target.terrain];
      if (!kind) return null;
      const style = extra.colors?.terrain?.[target.terrain] ?? {};
      const icon = { type: "terrain", terrain: target.terrain, fill: style.fill, edge: style.edge };
      return card(kind.name, "Terrain", icon, info.terrain[target.terrain]);
    }
    case "boundary":
      return card(info.places.boundary.name, "Map", { type: "boundary", color: extra.colors?.boundary }, info.places.boundary.text);
    case "closed":
      return card(info.places.closed.name, "Map", { type: "closed" }, info.places.closed.text);
    default:
      return null;
  }
}

function card(title, subtitle, icon, text, notes = []) {
  return { title, subtitle, icon, text: text ?? "", notes };
}

function describeSite(world, info, site, extra) {
  if (!site) return null;
  const def = world.data.sites[site.type];
  const s = info.states;
  const notes = [];
  let title = def.name;
  let text = info.sites[site.type];
  if (def.junction && site.core) {
    title = "Core router";
    text = s.core;
  }
  if (site.label && !def.junction) title = `${site.label} · ${def.name}`;
  if (site.overload > 0) notes.push(world.outages === false ? s.overloadZen : s.overload);
  if (site.queue.length > 0) notes.push(s.queue);
  if (def.hungry) notes.push(s.hunger);
  if (site.grown) notes.push(s.grown);
  else if (def.grows && world.config.siteGrowth) {
    const left = Math.max(1, world.config.siteGrowth.deliveries - site.served);
    notes.push(s.canGrow.replace("{left}", String(left)));
  }
  if (def.junction && site.jam > 0.02 && !site.core) notes.push(s.jam);
  if (site.qos) notes.push(s.qos);
  if (site.sdwan) notes.push(s.sdwan);
  const color = site.core ? (extra.colors?.core ?? "#7b5cd6") : def.color;
  return card(title, def.junction ? "Your gear" : "Site", { type: "site", shape: def.shape, color, core: site.core }, text, notes);
}

function describeLink(world, info, link, extra) {
  if (!link) return null;
  const s = info.states;
  const tiers = extra.tiers ?? world.data.tiers ?? [];
  const tier = tiers[link.tier];
  const name = (id) => {
    const site = world.siteById.get(id);
    if (!site) return "?";
    return site.label || world.data.sites[site.type].name;
  };
  const notes = [];
  let title = `${tier?.name ?? "Link"} link`;
  let text = (tier && info.tiers[tier.id]) || "";
  if (link.backbone) {
    title = "Backbone";
    text = s.backbone;
  }
  if (link.down) {
    const left = Math.ceil((link.down.until ?? world.time) - world.time);
    notes.push(s.down.replace("{when}", left > 0 ? ` in about ${left}s` : ""));
  } else if (isBlocked(world, link)) notes.push(s.blocked);
  if (link.firewall) notes.push(s.firewall);
  if (link.leased > 0 && !link.backbone) notes.push(s.leased.replace("{n}", String(link.leased)).replace("{s}", link.leased === 1 ? "" : "s"));
  if (extra.selected) notes.push(s.selected);
  const color = extra.lineColor ? extra.lineColor(link.line) : "#888";
  return card(title, `${name(link.a)} ↔ ${name(link.b)}`, { type: "link", color, tier: link.tier }, text, notes);
}

function describePacket(world, info, packet) {
  if (!packet) return null;
  const t = world.data.traffic[packet.traffic];
  if (!t) return null;
  return card(t.name, "Packet", { type: "packet", shape: t.shape, color: t.color }, info.traffic[packet.traffic]);
}
