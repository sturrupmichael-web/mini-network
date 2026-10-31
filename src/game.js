/**
 * Wires the pieces together: simulation, loop, renderer, input, and HUD.
 * This is the only module that knows about all of them.
 */
import { GAME_DATA, SIM_DATA } from "../data/index.js";
import { attachPointerInput } from "./input/pointer.js";
import { createLoop } from "./loop.js";
import { createCamera, fitCamera, worldToScreen } from "./render/camera.js";
import { setupCanvas } from "./render/canvas.js";
import { render } from "./render/renderer.js";
import { pointAlong } from "./sim/geometry.js";
import { chooseReward } from "./sim/progression.js";
import {
  addFirewall,
  addLink,
  addSdwan,
  createWorld,
  isHalted,
  placeSwitch,
  placeSwitchOnLink,
  removeLink,
  removeSwitch,
  rerouteLink,
  snapshot,
  step,
  triggerEvent,
  upgradeLink,
} from "./sim/world.js";
import { createStorage } from "./storage.js";
import { createHud } from "./ui/hud.js";

const CONFIG = GAME_DATA.config;

const REFUSED_TEXT = {
  "no-links": "Out of links. One arrives each day.",
  "no-leased": "Crossing a carrier boundary needs a leased line.",
  "no-upgrades": "No bandwidth upgrades left.",
  "max-tier": "That link is already dark fiber.",
  "no-firewalls": "No firewalls left.",
  "has-firewall": "That link already has a firewall.",
  "no-switches": "No switches left.",
  "too-close": "Too close to another site.",
  "off-map": "That's off the map.",
  "on-boundary": "Switches can't sit on a carrier boundary.",
  "no-sdwan": "No SD-WAN boxes left.",
  "has-sdwan": "That site already has SD-WAN.",
};

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {HTMLElement} opts.hudRoot
 * @param {string} opts.seed
 * @param {() => string} [opts.newSeed]  Seed for "Play again".
 */
export function startGame({ canvas, hudRoot, seed, newSeed = () => seed }) {
  const storage = createStorage();
  const settings = storage.get("settings", { speed: 1 });
  const data = SIM_DATA;
  const map = GAME_DATA.maps[0];
  let currentSeed = seed;
  let world = createWorld({ config: CONFIG, data, map, seed });
  const camera = createCamera();
  const ui = {
    drag: null,
    reroute: null,
    place: null,
    armed: null,
    selectedLinkId: null,
    selectedSiteId: null,
    hoverSiteId: null,
  };
  let nextLineIndex = 0;

  const view = setupCanvas(canvas, (v) => fit(v));
  function fit(v) {
    fitCamera(camera, map, v.width, v.height, {
      top: CONFIG.view.hudTop + CONFIG.view.padding,
      bottom: CONFIG.view.hudBottom + CONFIG.view.padding,
      left: CONFIG.view.padding,
      right: CONFIG.view.padding,
    });
  }
  fit(view);

  const loop = createLoop({
    tickRate: CONFIG.sim.tickRate,
    maxTicksPerFrame: CONFIG.sim.maxTicksPerFrame,
    onTick: () => step(world),
    onRender: () => {
      if (isHalted(world)) input.cancel();
      render(view.ctx, view, world, camera, ui, performance.now() / 1000);
      hud.update(world, loop, ui);
      // Events have been seen by the HUD (audio joins in Phase 4); clear them.
      world.events.length = 0;
    },
  });
  loop.speed = CONFIG.sim.speeds.includes(settings.speed) ? settings.speed : 1;

  function setSpeed(speed) {
    loop.speed = speed;
    loop.paused = false;
    storage.set("settings", { ...settings, speed });
  }
  function togglePause() {
    loop.paused = !loop.paused;
  }

  /** Continue the line that ends at this site, or start a new colour. */
  function lineFor(siteId) {
    const counts = new Map();
    for (const link of world.links) {
      if (link.a === siteId || link.b === siteId) counts.set(link.line, (counts.get(link.line) ?? 0) + 1);
    }
    const ends = [...counts].filter(([, n]) => n === 1).map(([line]) => line);
    if (ends.length) return Math.min(...ends);
    return nextLineIndex++;
  }

  function restart() {
    currentSeed = newSeed();
    world = createWorld({ config: CONFIG, data, map, seed: currentSeed });
    input.cancel();
    ui.selectedLinkId = null;
    ui.selectedSiteId = null;
    nextLineIndex = 0;
    loop.paused = false;
  }

  const hud = createHud(hudRoot, {
    onPause: togglePause,
    onSpeed: setSpeed,
    onReward: (id) => chooseReward(world, id),
    onRestart: restart,
    onItemPointerDown: (item, e) => {
      if (e) input.startPlacement(item, e);
      else ui.armed = ui.armed === item ? null : item; // keyboard
    },
    speeds: CONFIG.sim.speeds,
    items: GAME_DATA.items,
  });

  /** Use a tray item on what it was dropped on. */
  function place(item, target) {
    if (item === "upgrades" && target.kind === "link") return upgradeLink(world, target.id);
    if (item === "firewalls" && target.kind === "link") return addFirewall(world, target.id);
    if (item === "sdwan" && target.kind === "site") return addSdwan(world, target.id);
    if (item === "switches" && target.kind === "link") return placeSwitchOnLink(world, target.id, target.x, target.y);
    if (item === "switches" && target.kind === "spot") return placeSwitch(world, target.x, target.y);
    return { ok: false, reason: "bad-target" };
  }

  const input = attachPointerInput(canvas, {
    getWorld: () => world,
    getCamera: () => camera,
    config: CONFIG.input,
    ui,
    canEdit: () => !isHalted(world),
    actions: {
      connect: (a, b, line) => addLink(world, a, b, line),
      remove: (linkId) => removeLink(world, linkId),
      reroute: (linkId, siteId) => rerouteLink(world, linkId, siteId),
      removeSite: (siteId) => removeSwitch(world, siteId),
      place,
      lineFor,
    },
    items: GAME_DATA.items,
    onRefused: (reason) => REFUSED_TEXT[reason] && hud.toast(REFUSED_TEXT[reason]),
  });

  window.addEventListener("keydown", (e) => {
    // Leave keys alone in form fields and in dialogs (Space/Enter pick a reward there).
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, .overlay")) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePause();
    } else if (e.key >= "1" && e.key <= String(CONFIG.sim.speeds.length)) {
      setSpeed(CONFIG.sim.speeds[Number(e.key) - 1]);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      input.removeSelected();
    } else if (e.key === "Escape") {
      ui.selectedLinkId = null;
      ui.selectedSiteId = null;
      ui.armed = null;
    }
  });

  // Pause when the tab or app goes to the background.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) loop.paused = true;
  });

  loop.start();

  // A small handle for tests and debugging (and the Phase 5 debug panel).
  return {
    get world() {
      return world;
    },
    get seed() {
      return currentSeed;
    },
    loop,
    camera,
    ui,
    /** Screen position (CSS px, relative to the canvas) of a site. */
    sitePosition(id) {
      const site = world.siteById.get(id);
      return worldToScreen(camera, site.x, site.y);
    },
    /** Screen position of the point halfway along a link. */
    linkMidpoint(id) {
      const link = world.linkById.get(id);
      const mid = pointAlong(link.path, link.length / 2);
      return worldToScreen(camera, mid.x, mid.y);
    },
    /** Run n ticks immediately (for tests). Stops early if the game halts. */
    runTicks(n) {
      for (let i = 0; i < n && !isHalted(world); i++) step(world);
    },
    snapshot: () => snapshot(world),
    /** Start an event now, by id (tests and the Phase 5 debug panel). */
    triggerEvent: (id) => triggerEvent(world, id),
    /** Use a tray item on a target, as if dropped there (tests). */
    place,
    restart,
  };
}
