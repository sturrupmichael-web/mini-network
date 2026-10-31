/**
 * Entry point. Picks a seed (from ?seed= in the URL, or at random) and
 * starts the game.
 */
import { validateData } from "./data/validate.js";
import { CONFIG } from "../data/config.js";
import { MAPS } from "../data/maps.js";
import { SITE_TYPES } from "../data/sites.js";
import { TRAFFIC_TYPES } from "../data/traffic.js";
import { startGame } from "./game.js";

function pickSeed() {
  const fromUrl = new URLSearchParams(location.search).get("seed");
  if (fromUrl) return fromUrl;
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return n[0].toString(36);
}

const problems = validateData({ config: CONFIG, sites: SITE_TYPES, traffic: TRAFFIC_TYPES, maps: MAPS });
if (problems.length) {
  // Bad data is a developer mistake: say exactly what's wrong.
  console.warn(`Mini Network data problems:\n${problems.join("\n")}`);
}

const game = startGame({
  canvas: document.getElementById("game"),
  hudRoot: document.getElementById("hud"),
  seed: pickSeed(),
});
window.miniNetwork = game;
