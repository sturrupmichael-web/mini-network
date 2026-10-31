/**
 * Entry point: checks the data, then starts the game (title screen, or
 * straight into a game when the URL has ?seed=).
 */
import { GAME_DATA } from "../data/index.js";
import { validateData } from "./data/validate.js";
import { EFFECT_NAMES } from "./sim/events.js";
import { startGame } from "./game.js";

const params = new URLSearchParams(location.search);
const urlSeed = params.get("seed");

function randomSeed() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return n[0].toString(36);
}

const problems = validateData({ ...GAME_DATA, effects: EFFECT_NAMES });
if (problems.length) {
  // Bad data is a developer mistake: say exactly what's wrong.
  console.warn(`Mini Network data problems:\n${problems.join("\n")}`);
}

// ?seed=… (optionally with &map=… and &mode=…) skips the title screen and
// replays exactly that game: handy for bug reports and for the tests.
const game = startGame({
  canvas: document.getElementById("game"),
  hudRoot: document.getElementById("hud"),
  titleRoot: document.getElementById("title"),
  randomSeed,
  autostart: urlSeed ? { seed: urlSeed, mapId: params.get("map") ?? undefined, modeId: params.get("mode") ?? "classic" } : null,
  // ?debug opens the tuning panel (the ` key toggles it too).
  debug: params.has("debug"),
});
window.miniNetwork = game;
