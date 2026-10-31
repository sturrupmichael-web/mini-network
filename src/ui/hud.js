/**
 * The DOM HUD: score along the top, speed controls, and the inventory tray.
 * Only reads the world and calls the actions it is given.
 */
export function createHud(root, { onPause, onSpeed, speeds }) {
  root.innerHTML = `
    <div class="hud-top">
      <div class="hud-score" aria-live="polite">
        <span class="hud-score-value" data-hud="score">0</span>
        <span class="hud-score-label">delivered</span>
      </div>
      <div class="hud-controls" role="group" aria-label="Game speed">
        <button type="button" class="hud-btn" data-hud="pause" aria-label="Pause" aria-pressed="false">❚❚</button>
        ${speeds
          .map(
            (s) =>
              `<button type="button" class="hud-btn" data-speed="${s}" aria-label="${s}× speed" aria-pressed="false">${s}×</button>`,
          )
          .join("")}
      </div>
    </div>
    <div class="hud-tray">
      <div class="tray-item" data-hud="links" title="Links left">
        <span class="tray-icon tray-icon-link"></span>
        <span class="tray-count" data-hud="links-count">0</span>
      </div>
    </div>
    <div class="hud-toast" data-hud="toast" role="status"></div>
  `;
  const q = (sel) => root.querySelector(sel);
  const scoreEl = q('[data-hud="score"]');
  const linksEl = q('[data-hud="links-count"]');
  const pauseBtn = q('[data-hud="pause"]');
  const toastEl = q('[data-hud="toast"]');
  const speedBtns = [...root.querySelectorAll("[data-speed]")];

  pauseBtn.addEventListener("click", () => onPause());
  for (const b of speedBtns) b.addEventListener("click", () => onSpeed(Number(b.dataset.speed)));

  let toastTimer = 0;
  const shown = { score: -1, links: -1, paused: null, speed: null };

  return {
    update(world, loop) {
      if (shown.score !== world.stats.score) {
        shown.score = world.stats.score;
        scoreEl.textContent = String(world.stats.score);
      }
      if (shown.links !== world.inventory.links) {
        shown.links = world.inventory.links;
        linksEl.textContent = String(world.inventory.links);
      }
      if (shown.paused !== loop.paused || shown.speed !== loop.speed) {
        shown.paused = loop.paused;
        shown.speed = loop.speed;
        pauseBtn.setAttribute("aria-pressed", String(loop.paused));
        pauseBtn.textContent = loop.paused ? "▶" : "❚❚";
        pauseBtn.setAttribute("aria-label", loop.paused ? "Resume" : "Pause");
        for (const b of speedBtns) {
          b.setAttribute("aria-pressed", String(!loop.paused && Number(b.dataset.speed) === loop.speed));
        }
      }
    },
    toast(text) {
      toastEl.textContent = text;
      toastEl.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
    },
  };
}
