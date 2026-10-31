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

/**
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {object} opts.items  ITEMS from equipment.js, in tray order.
 * @param {(item: string, e: PointerEvent) => void} opts.onItemPointerDown
 */
export function createHud(root, { onPause, onSpeed, onReward, onRestart, onItemPointerDown, speeds, items }) {
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
    <div class="hud-tray" data-hud="tray">
      ${Object.entries(items)
        .map(
          ([id, item]) => `
        <button type="button" class="tray-item" data-item="${id}" title="${escapeHtml(`${item.name}: ${item.hint}`)}"
          aria-label="${escapeHtml(item.name)}" ${item.target ? "" : 'tabindex="-1"'}>
          <span class="tray-icon tray-icon-${id}" aria-hidden="true"></span>
          <span class="tray-count" data-count="${id}">0</span>
        </button>`,
        )
        .join("")}
    </div>
    <div class="hud-hint" data-hud="hint" role="status"></div>
    <div class="hud-toast" data-hud="toast" role="status"></div>
    <div class="hud-ticker" data-hud="ticker" role="status" aria-live="polite">
      <strong data-hud="ticker-title"></strong><span data-hud="ticker-text"></span>
    </div>
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
    hint: q("hint"),
    ticker: q("ticker"),
    tickerTitle: q("ticker-title"),
    tickerText: q("ticker-text"),
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
  const trayItems = [...root.querySelectorAll("[data-item]")];
  const counts = Object.fromEntries(trayItems.map((b) => [b.dataset.item, b.querySelector("[data-count]")]));

  for (const b of trayItems) {
    b.addEventListener("pointerdown", (e) => {
      if (b.disabled) return;
      onItemPointerDown(b.dataset.item, e);
    });
    // Keyboard: Enter/Space arms the item, like a tap.
    b.addEventListener("click", (e) => {
      if (e.detail === 0 && !b.disabled) onItemPointerDown(b.dataset.item, null);
    });
  }

  el.pause.addEventListener("click", () => onPause());
  for (const b of speedBtns) b.addEventListener("click", () => onSpeed(Number(b.dataset.speed)));
  el.restart.addEventListener("click", () => onRestart());
  el.rewardOptions.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-reward]");
    if (btn) onReward(btn.dataset.reward);
  });

  let toastTimer = 0;
  let tickerTimer = 0;
  const shown = { score: -1, paused: null, speed: null, clock: "", dial: -1, reward: null, over: null, armed: null, inv: {} };

  return {
    update(world, loop, ui) {
      if (shown.score !== world.stats.score) {
        shown.score = world.stats.score;
        el.score.textContent = String(world.stats.score);
      }
      for (const b of trayItems) {
        const id = b.dataset.item;
        const n = world.inventory[id] ?? 0;
        if (shown.inv[id] !== n) {
          shown.inv[id] = n;
          counts[id].textContent = String(n);
          b.classList.toggle("empty", n === 0);
          // Firewalls only show up once they matter; everything else always shows.
          b.hidden = id === "firewalls" && n === 0 && !world.security;
          if (items[id].target) b.disabled = n === 0;
        }
      }
      const armed = ui.armed ?? ui.place?.item ?? null;
      if (armed !== shown.armed) {
        shown.armed = armed;
        for (const b of trayItems) b.classList.toggle("armed", b.dataset.item === armed);
        el.hint.textContent = armed ? items[armed].hint : "";
        el.hint.classList.toggle("show", Boolean(armed));
      }
      for (const e of world.events) {
        if (e.type === "event") this.ticker(e.name, e.toast);
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
    /** A short headline for an event, shown at the top for a few seconds. */
    ticker(title, text) {
      el.tickerTitle.textContent = title;
      el.tickerText.textContent = text;
      el.ticker.classList.add("show");
      clearTimeout(tickerTimer);
      tickerTimer = setTimeout(() => el.ticker.classList.remove("show"), 5500);
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
