/**
 * Entry point. Picks a seed (from ?seed= in the URL, or at random) and
 * starts the game.
 */
import { GAME_DATA } from "../data/index.js";
import { validateData } from "./data/validate.js";
import { EFFECT_NAMES } from "./sim/events.js";
import { startGame } from "./game.js";

const urlSeed = new URLSearchParams(location.search).get("seed");

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

const game = startGame({
  canvas: document.getElementById("game"),
  hudRoot: document.getElementById("hud"),
  seed: urlSeed || randomSeed(),
  // A ?seed= in the URL replays the same game every time.
  newSeed: () => urlSeed || randomSeed(),
});
window.miniNetwork = game;
