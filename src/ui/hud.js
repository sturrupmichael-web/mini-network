/**
 * The DOM HUD: score and clock along the top, speed controls, the
 * inventory tray, the weekly reward picker and the game-over card.
 * Only reads the world and calls the actions it is given.
 */
import { clock } from "../sim/progression.js";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function dayName(dayOfWeek) {
  return DAY_NAMES[dayOfWeek % DAY_NAMES.length];
}

/** "3 days" / "2 weeks, 1 day" */
export function describeSurvival(days) {
  const whole = Math.floor(days);
  const weeks = Math.floor(whole / 7);
  const rest = whole % 7;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (weeks === 0) return plural(whole, "day");
  return rest === 0 ? plural(weeks, "week") : `${plural(weeks, "week")}, ${plural(rest, "day")}`;
}

export function createHud(root, { onPause, onSpeed, onReward, onRestart, speeds }) {
  root.innerHTML = `
    <div class="hud-top">
      <div class="hud-left">
        <div class="hud-score" aria-live="polite">
          <span class="hud-score-value" data-hud="score">0</span>
          <span class="hud-score-label">delivered</span>
        </div>
        <div class="hud-clock" data-hud="clock">
          <span class="hud-clock-dial" data-hud="dial"></span>
          <span data-hud="clock-text">Week 1 · Mon</span>
        </div>
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
    <div class="overlay" data-hud="reward" hidden>
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="reward-title">
        <p class="card-kicker" data-hud="reward-kicker">Week 1 done</p>
        <h2 id="reward-title">Pick a delivery</h2>
        <div class="reward-options" data-hud="reward-options"></div>
      </div>
    </div>
    <div class="overlay" data-hud="over" hidden>
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="over-title">
        <p class="card-kicker">Network outage</p>
        <h2 id="over-title" data-hud="over-title">An office went down</h2>
        <p class="card-text" data-hud="over-text"></p>
        <dl class="stats">
          <div><dt>Delivered</dt><dd data-hud="over-score">0</dd></div>
          <div><dt>Survived</dt><dd data-hud="over-days">0 days</dd></div>
        </dl>
        <button type="button" class="primary-btn" data-hud="restart">Play again</button>
      </div>
    </div>
  `;
  const q = (name) => root.querySelector(`[data-hud="${name}"]`);
  const el = {
    score: q("score"),
    clockText: q("clock-text"),
    dial: q("dial"),
    links: q("links-count"),
    pause: q("pause"),
    toast: q("toast"),
    reward: q("reward"),
    rewardKicker: q("reward-kicker"),
    rewardOptions: q("reward-options"),
    over: q("over"),
    overTitle: q("over-title"),
    overText: q("over-text"),
    overScore: q("over-score"),
    overDays: q("over-days"),
    restart: q("restart"),
  };
  const speedBtns = [...root.querySelectorAll("[data-speed]")];

  el.pause.addEventListener("click", () => onPause());
  for (const b of speedBtns) b.addEventListener("click", () => onSpeed(Number(b.dataset.speed)));
  el.restart.addEventListener("click", () => onRestart());
  el.rewardOptions.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-reward]");
    if (btn) onReward(btn.dataset.reward);
  });

  let toastTimer = 0;
  const shown = { score: -1, links: -1, paused: null, speed: null, clock: "", dial: -1, reward: null, over: null };

  return {
    update(world, loop) {
      if (shown.score !== world.stats.score) {
        shown.score = world.stats.score;
        el.score.textContent = String(world.stats.score);
      }
      if (shown.links !== world.inventory.links) {
        shown.links = world.inventory.links;
        el.links.textContent = String(world.inventory.links);
      }
      const c = clock(world);
      const text = `Week ${c.week} · ${dayName(c.dayOfWeek)}`;
      if (text !== shown.clock) {
        shown.clock = text;
        el.clockText.textContent = text;
      }
      const dial = Math.round(c.dayFraction * 100);
      if (dial !== shown.dial) {
        shown.dial = dial;
        el.dial.style.setProperty("--day", `${dial}%`);
      }
      if (shown.paused !== loop.paused || shown.speed !== loop.speed) {
        shown.paused = loop.paused;
        shown.speed = loop.speed;
        el.pause.setAttribute("aria-pressed", String(loop.paused));
        el.pause.textContent = loop.paused ? "▶" : "❚❚";
        el.pause.setAttribute("aria-label", loop.paused ? "Resume" : "Pause");
        for (const b of speedBtns) {
          b.setAttribute("aria-pressed", String(!loop.paused && Number(b.dataset.speed) === loop.speed));
        }
      }

      if (shown.reward !== world.pendingReward) {
        shown.reward = world.pendingReward;
        const offer = world.pendingReward;
        el.reward.hidden = !offer;
        if (offer) {
          el.rewardKicker.textContent = `Week ${offer.week} done`;
          el.rewardOptions.innerHTML = offer.options
            .map((id) => {
              const r = world.data.rewards.find((x) => x.id === id);
              return `<button type="button" class="reward-btn" data-reward="${escapeHtml(r.id)}">
                <strong>${escapeHtml(r.label)}</strong><span>${escapeHtml(r.detail)}</span></button>`;
            })
            .join("");
          el.rewardOptions.querySelector("button")?.focus();
        }
      }

      if (shown.over !== world.over) {
        shown.over = world.over;
        el.over.hidden = !world.over;
        if (world.over) {
          const site = world.siteById.get(world.over.siteId);
          const name = world.data.sites[site.type].name;
          el.overTitle.textContent = `${article(name)} ${name.toLowerCase()} went down`;
          el.overText.textContent = "Its queue stayed over capacity for too long.";
          el.overScore.textContent = String(world.stats.score);
          el.overDays.textContent = describeSurvival(clock(world).daysSurvived);
          el.restart.focus();
        }
      }
    },
    toast(text) {
      el.toast.textContent = text;
      el.toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
    },
  };
}

function article(word) {
  return /^[aeiou]/i.test(word) ? "An" : "A";
}
