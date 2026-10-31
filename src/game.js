/**
 * Wires the pieces together: simulation, loop, renderer, input, and HUD.
 * This is the only module that knows about all of them.
 */
import { GAME_DATA, SIM_DATA } from "../data/index.js";
import { createAudio } from "./audio/audio.js";
import { dailyChallenge, shareText } from "./daily.js";
import { attachPointerInput } from "./input/pointer.js";
import { createLoop } from "./loop.js";
import { createCamera, fitCamera, worldToScreen } from "./render/camera.js";
import { setupCanvas } from "./render/canvas.js";
import { render } from "./render/renderer.js";
import { pointAlong } from "./sim/geometry.js";
import { configForMap } from "./sim/config.js";
import { debugStats, grantItems, skipTime, spawnBurst, spawnSite } from "./sim/debug.js";
import { chooseReward, clock } from "./sim/progression.js";
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
import { bestScore, recordScore, scoreKey } from "./scores.js";
import { createStorage } from "./storage.js";
import { createDebugPanel } from "./ui/debug.js";
import { createHud } from "./ui/hud.js";
import { createTitle } from "./ui/title.js";

const CONFIG = GAME_DATA.config;

const REFUSED_TEXT = {
  "no-links": "Not enough links for that. More arrive each day.",
  "through-site": "Links can't run through another site.",
  "no-way": "There's no clear way through.",
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
 * @param {HTMLElement} opts.titleRoot
 * @param {() => string} opts.randomSeed
 * @param {object} [opts.autostart]  { modeId, mapId, seed } to skip the title screen
 *                                   (from the URL: ?seed=…&map=…&mode=…).
 * @param {boolean} [opts.debug]     Open the debug panel at start (?debug).
 */
export function startGame({ canvas, hudRoot, titleRoot, randomSeed, autostart = null, debug = false }) {
  const storage = createStorage();
  const settings = { speed: 1, muted: false, theme: "system", ...storage.get("settings", {}) };
  const saveSettings = () => storage.set("settings", settings);
  const data = SIM_DATA;
  const maps = GAME_DATA.maps;
  const modes = GAME_DATA.modes;
  const audio = createAudio(GAME_DATA.audio, { muted: settings.muted });

  const camera = createCamera();
  const ui = {
    drag: null,
    reroute: null,
    place: null,
    armed: null,
    selectedLinkId: null,
    selectedSiteId: null,
    hoverSiteId: null,
    theme: "light",
    pops: [],
  };
  let nextLineIndex = 0;

  /** The current game: { modeId, mapId, seed, daily, result } or null on the title screen. */
  let run = null;
  let map = maps[0];
  let config = configForMap(CONFIG, map);
  let world = createWorld({ config, data, map, seed: "preview" });

  // Theme: "system" follows the device; light/dark force it.
  const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  function applyTheme() {
    const dark = settings.theme === "dark" || (settings.theme === "system" && darkQuery?.matches);
    ui.theme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = ui.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1d1e22" : "#f6f4ef");
  }
  darkQuery?.addEventListener?.("change", applyTheme);
  applyTheme();

  const view = setupCanvas(canvas, (v) => fit(v));
  function fit(v = view) {
    fitCamera(camera, map, v.width, v.height, {
      top: CONFIG.view.hudTop + CONFIG.view.padding,
      bottom: CONFIG.view.hudBottom + CONFIG.view.padding,
      left: CONFIG.view.padding,
      right: CONFIG.view.padding,
    });
  }
  fit();

  /** Show a map behind the title screen (no simulation running). */
  function preview(mapId) {
    if (run || map.id === mapId) return;
    map = maps.find((m) => m.id === mapId) ?? maps[0];
    config = configForMap(CONFIG, map);
    world = createWorld({ config, data, map, seed: "preview" });
    fit();
  }

  const loop = createLoop({
    tickRate: CONFIG.sim.tickRate,
    maxTicksPerFrame: CONFIG.sim.maxTicksPerFrame,
    onTick: () => {
      if (run) step(world);
    },
    onRender: () => {
      if (!run && title.visible) preview(title.mapId);
      if (isHalted(world)) input.cancel();
      if (run && world.over && !run.result) finishRun();
      handleEvents();
      const now = performance.now() / 1000;
      ui.pops = ui.pops.filter((p) => now - p.born < 1);
      render(view.ctx, view, world, camera, ui, now);
      hud.update(world, loop, ui, {
        label: run ? runLabel() : "",
        muted: settings.muted,
        result: run?.result ?? null,
      });
      world.events.length = 0;
      debugPanel.update();
    },
  });
  loop.speed = CONFIG.sim.speeds.includes(settings.speed) ? settings.speed : 1;

  function runLabel() {
    const mode = modes[run.modeId];
    return run.daily ? `${mode.name} · ${run.daily}` : `${mode.name} · ${map.name}`;
  }

  /** Sounds and pops for what happened since the last frame. */
  function handleEvents() {
    const now = performance.now() / 1000;
    for (const e of world.events) {
      if (e.type === "delivered") {
        audio.delivered(e.traffic);
        const site = world.siteById.get(e.siteId);
        if (site && ui.pops.length < 40) {
          const p = worldToScreen(camera, site.x, site.y);
          ui.pops.push({ x: p.x, y: p.y, born: now, color: world.data.traffic[e.traffic].color });
        }
      } else if (e.type === "event") audio.cue("event");
      else if (e.type === "dropped") audio.cue("drop");
      else if (e.type === "outage") audio.cue("outage");
      else if (e.type === "week") audio.cue("reward");
    }
  }

  /** Record the score and build the share text, once, when a run ends. */
  function finishRun() {
    const mode = modes[run.modeId];
    const days = clock(world).daysSurvived;
    const result = { best: false, bestScore: null, share: null, seed: run.daily ? null : run.seed };
    if (mode.scores) {
      const key = scoreKey(run.modeId, map.id, run.daily);
      const previous = bestScore(storage, key);
      const r = recordScore(storage, key, {
        score: world.stats.score,
        days: Math.round(days * 10) / 10,
        date: new Date().toISOString().slice(0, 10),
      });
      result.best = r.best;
      result.bestScore = previous ? Math.max(previous.score, world.stats.score) : null;
    }
    if (run.daily) {
      result.share = shareText({
        key: run.daily,
        mapName: map.name,
        score: world.stats.score,
        days,
        dayStress: world.dayStress,
        daysPerWeek: config.time.daysPerWeek,
      });
    }
    run.result = result;
  }

  /** Start a game. */
  function startRun({ modeId, mapId, seed }) {
    const mode = modes[modeId] ?? modes.classic;
    const daily = mode.daily ? dailyChallenge(maps) : null;
    map = maps.find((m) => m.id === (daily ? daily.mapId : mapId)) ?? maps[0];
    config = configForMap(CONFIG, map);
    const runSeed = daily ? daily.seed : (seed ?? randomSeed());
    world = createWorld({ config, data, map, seed: runSeed, outages: mode.outages });
    run = { modeId: modes[modeId] ? modeId : "classic", mapId: map.id, seed: runSeed, daily: daily?.key ?? null, result: null, fixedSeed: Boolean(seed) };
    fit();
    input.cancel();
    ui.selectedLinkId = null;
    ui.selectedSiteId = null;
    ui.pops = [];
    nextLineIndex = 0;
    loop.paused = false;
    title.hide();
  }

  function restart() {
    if (!run) return;
    startRun({ modeId: run.modeId, mapId: run.mapId, seed: run.fixedSeed ? run.seed : undefined });
  }

  function openMenu() {
    if (run && !world.over) loop.paused = true;
    title.show({ canResume: Boolean(run && !world.over), mapId: map.id });
  }

  function resume() {
    title.hide();
    loop.paused = false;
  }

  function setSpeed(speed) {
    loop.speed = speed;
    loop.paused = false;
    settings.speed = speed;
    saveSettings();
  }
  function togglePause() {
    loop.paused = !loop.paused;
  }
  function setMuted(muted) {
    settings.muted = muted;
    audio.setMuted(muted);
    if (!muted) audio.unlock();
    saveSettings();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
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

  const hud = createHud(hudRoot, {
    onPause: togglePause,
    onSpeed: setSpeed,
    onReward: (id) => chooseReward(world, id),
    onRestart: restart,
    onMenu: openMenu,
    onMute: () => setMuted(!settings.muted),
    onTheme: () => {
      settings.theme = ui.theme === "dark" ? "light" : "dark";
      saveSettings();
      applyTheme();
    },
    onShare: copyText,
    onItemPointerDown: (item, e) => {
      if (e) input.startPlacement(item, e);
      else ui.armed = ui.armed === item ? null : item; // keyboard
    },
    speeds: CONFIG.sim.speeds,
    items: GAME_DATA.items,
  });

  const title = createTitle(titleRoot, {
    modes,
    maps,
    dailyMapId: () => dailyChallenge(maps).mapId,
    best: (modeId, mapId) => {
      const daily = modes[modeId].daily ? dailyChallenge(maps).key : null;
      return bestScore(storage, scoreKey(modeId, mapId, daily));
    },
    onPlay: (choice) => startRun(choice),
    onResume: resume,
    onSettings: (change) => {
      if ("muted" in change) setMuted(change.muted);
      if ("theme" in change) {
        settings.theme = change.theme;
        saveSettings();
        applyTheme();
      }
    },
    getSettings: () => settings,
  });

  const debugPanel = createDebugPanel(hudRoot.parentElement, {
    siteTypes: Object.keys(GAME_DATA.sites).filter((t) => !GAME_DATA.sites[t].junction),
    events: GAME_DATA.events.map((e) => ({ id: e.id, name: e.name })),
    stats: () => (run ? debugStats(world) : null),
    config: () => (run ? world.config : null),
    actions: {
      spawnSite: (type) => (run ? spawnSite(world, type) : null),
      burst: (n) => (run ? spawnBurst(world, n) : 0),
      trigger: (id) => Boolean(run) && triggerEvent(world, id),
      skip: (amount) => {
        if (!run) return null;
        const { secondsPerDay, daysPerWeek } = world.config.time;
        const seconds = amount === "day" ? secondsPerDay : amount === "week" ? secondsPerDay * daysPerWeek : Number(amount);
        const r = skipTime(world, seconds);
        // Don't play a minute of sounds and pops at once.
        world.events = world.events.filter((e) => e.type === "event" || e.type === "outage");
        return r;
      },
      grant: (items) => run && grantItems(world, items),
      getOutages: () => world.outages,
      setOutages: (on) => {
        world.outages = on;
      },
      // Replace the section rather than editing it: sections can be shared with data/config.js.
      setKnob: (section, key, value) => {
        world.config = { ...world.config, [section]: { ...world.config[section], [key]: value } };
        world.routing.dirty = true;
      },
      copy: copyText,
    },
  });
  if (debug) debugPanel.toggle(true);

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
    canEdit: () => Boolean(run) && !isHalted(world) && !title.visible,
    actions: {
      connect: (a, b, line, cells) => addLink(world, a, b, line, cells),
      remove: (linkId) => removeLink(world, linkId),
      reroute: (linkId, siteId) => rerouteLink(world, linkId, siteId),
      removeSite: (siteId) => removeSwitch(world, siteId),
      place,
      lineFor,
    },
    items: GAME_DATA.items,
    onRefused: (reason) => REFUSED_TEXT[reason] && hud.toast(REFUSED_TEXT[reason]),
  });

  // Audio can only start after the player touches something.
  const unlockAudio = () => {
    if (!settings.muted) audio.unlock();
  };
  window.addEventListener("pointerdown", unlockAudio, { capture: true });
  window.addEventListener("keydown", unlockAudio, { capture: true });

  window.addEventListener("keydown", (e) => {
    // Leave keys alone in form fields and in dialogs (Space/Enter pick a reward there).
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, .overlay")) return;
    if (e.code === "Backquote") {
      debugPanel.toggle();
      return;
    }
    if (!run) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePause();
    } else if (e.key >= "1" && e.key <= String(CONFIG.sim.speeds.length)) {
      setSpeed(CONFIG.sim.speeds[Number(e.key) - 1]);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      input.removeSelected();
    } else if (e.key === "Escape") {
      if (ui.selectedLinkId || ui.selectedSiteId || ui.armed) {
        ui.selectedLinkId = null;
        ui.selectedSiteId = null;
        ui.armed = null;
      } else {
        openMenu();
      }
    } else if (e.key === "m" || e.key === "M") {
      setMuted(!settings.muted);
    }
  });

  // Pause when the tab or app goes to the background.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && run) loop.paused = true;
  });

  if (autostart) startRun(autostart);
  else title.show();
  loop.start();

  // A small handle for tests and debugging.
  return {
    get world() {
      return world;
    },
    get seed() {
      return run?.seed ?? null;
    },
    get run() {
      return run;
    },
    get settings() {
      return settings;
    },
    loop,
    camera,
    ui,
    audio,
    debugPanel,
    /** Screen position (CSS px, relative to the canvas) of a world point. */
    worldToScreen: (x, y) => worldToScreen(camera, x, y),
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
      if (!run) return;
      for (let i = 0; i < n && !isHalted(world); i++) step(world);
    },
    snapshot: () => snapshot(world),
    /** Start an event now, by id (tests and the debug panel). */
    triggerEvent: (id) => triggerEvent(world, id),
    /** Use a tray item on a target, as if dropped there (tests). */
    place,
    startRun,
    restart,
    openMenu,
  };
}
