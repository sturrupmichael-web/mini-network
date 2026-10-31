/**
 * Wires the pieces together: simulation, loop, renderer, input, and HUD.
 * This is the only module that knows about all of them.
 */
import { CONFIG } from "../data/config.js";
import { MAPS } from "../data/maps.js";
import { SITE_TYPES } from "../data/sites.js";
import { TRAFFIC_TYPES } from "../data/traffic.js";
import { attachPointerInput } from "./input/pointer.js";
import { createLoop } from "./loop.js";
import { createCamera, fitCamera, worldToScreen } from "./render/camera.js";
import { setupCanvas } from "./render/canvas.js";
import { render } from "./render/renderer.js";
import { createStorage } from "./storage.js";
import { createHud } from "./ui/hud.js";
import { addLink, createWorld, snapshot, step } from "./sim/world.js";

const REFUSED_TEXT = {
  "no-links": "Out of links. More arrive each week.",
};

export function startGame({ canvas, hudRoot, seed }) {
  const storage = createStorage();
  const settings = storage.get("settings", { speed: 1 });
  const data = { sites: SITE_TYPES, traffic: TRAFFIC_TYPES };
  const map = MAPS[0];
  let world = createWorld({ config: CONFIG, data, map, seed });
  const camera = createCamera();
  const ui = { drag: null, hoverSiteId: null };
  let lineCounter = 0;

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
      // Events are for audio/effects (later phases); drop them each frame.
      world.events.length = 0;
      render(view.ctx, view, world, camera, ui);
      hud.update(world, loop);
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

  const hud = createHud(hudRoot, { onPause: togglePause, onSpeed: setSpeed, speeds: CONFIG.sim.speeds });

  attachPointerInput(canvas, {
    getWorld: () => world,
    getCamera: () => camera,
    config: CONFIG.input,
    ui,
    connect: (a, b, line) => addLink(world, a, b, line),
    nextLine: () => lineCounter++,
    onRefused: (reason) => REFUSED_TEXT[reason] && hud.toast(REFUSED_TEXT[reason]),
  });

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePause();
    } else if (e.key >= "1" && e.key <= String(CONFIG.sim.speeds.length)) {
      setSpeed(CONFIG.sim.speeds[Number(e.key) - 1]);
    }
  });

  loop.start();

  // A small handle for tests and debugging (and the Phase 5 debug panel).
  return {
    get world() {
      return world;
    },
    loop,
    camera,
    seed,
    /** Screen position (CSS px, relative to the canvas) of a site. */
    sitePosition(id) {
      const site = world.siteById.get(id);
      return worldToScreen(camera, site.x, site.y);
    },
    /** Run n ticks immediately (for tests). */
    runTicks(n) {
      for (let i = 0; i < n; i++) step(world);
    },
    snapshot: () => snapshot(world),
    restart(newSeed = seed) {
      world = createWorld({ config: CONFIG, data, map, seed: newSeed });
    },
  };
}
