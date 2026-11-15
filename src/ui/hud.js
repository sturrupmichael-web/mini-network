/**
 * The DOM HUD: score and clock along the top, speed controls, the
 * inventory tray, the weekly reward picker and the game-over card.
 * Only reads the world and calls the actions it is given.
 */
import { isStarving } from "../sim/sites.js";
import { playTimelapse, saveImage } from "./timelapse.js";
import { busiestHtml, endedHtml, runReport, weekChartHtml } from "./report.js";
import { clock } from "../sim/progression.js";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Small inline SVG icons (no external files).
const svg = (body) =>
  `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const SOUND_ON = svg('<path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/><path d="M13 7.5a3.5 3.5 0 0 1 0 5M15.5 5a7 7 0 0 1 0 10"/>');
const SOUND_OFF = svg('<path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/><path d="M13.5 8l4 4M17.5 8l-4 4"/>');
const MOON = svg('<path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z" fill="currentColor"/>');
const SUN = svg('<circle cx="10" cy="10" r="3.2" fill="currentColor"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>');
const MENU_ICON = svg('<path d="M4 6h12M4 10h12M4 14h12"/>');

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Little item icons with counts ("+12" next to a link) for a reward card. */
function grantChips(entries) {
  return entries
    .map(([key, n]) => `<span class="reward-chip"><span class="tray-icon tray-icon-${escapeHtml(key)}"></span>+${Number(n)}</span>`)
    .join("");
}

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
export function createHud(root, opts) {
  const { onPause, onSpeed, onReward, onRestart, onMenu, onMute, onTheme, onShare, onItemPointerDown, onSkipTutorial, speeds, items } = opts;
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
        <div class="hud-run" data-hud="run"></div>
      </div>
      <div class="hud-controls" role="group" aria-label="Game controls">
        <button type="button" class="hud-btn" data-hud="theme" aria-label="Dark mode">${MOON}</button>
        <button type="button" class="hud-btn" data-hud="mute" aria-label="Mute sound" aria-pressed="false">${SOUND_ON}</button>
        <button type="button" class="hud-btn" data-hud="pause" aria-label="Pause" aria-pressed="false">❚❚</button>
        ${speeds
          .map(
            (s) =>
              `<button type="button" class="hud-btn" data-speed="${s}" aria-label="${s}× speed" aria-pressed="false">${s}×</button>`,
          )
          .join("")}
        <button type="button" class="hud-btn" data-hud="menu" aria-label="Menu">${MENU_ICON}</button>
      </div>
    </div>
    <div class="hud-tray" data-hud="tray">
      ${Object.entries(items)
        .map(
          ([id, item]) => `
        <button type="button" class="tray-item" data-item="${id}" aria-describedby="tray-tip"
          aria-label="${escapeHtml(item.name)}" ${item.target ? "" : 'tabindex="-1"'}>
          <span class="tray-icon tray-icon-${id}" aria-hidden="true"></span>
          <span class="tray-count" data-count="${id}">0</span>
        </button>`,
        )
        .join("")}
    </div>
    <div class="tray-tip" id="tray-tip" data-hud="tip" role="tooltip" hidden>
      <strong data-hud="tip-name"></strong>
      <span data-hud="tip-text"></span>
      <span class="tray-tip-count" data-hud="tip-count"></span>
    </div>
    <div class="map-info" data-hud="info" role="status" aria-live="polite" hidden>
      <div class="map-info-head">
        <span class="map-info-icon" data-hud="info-icon" aria-hidden="true"></span>
        <span class="map-info-names">
          <strong data-hud="info-title"></strong>
          <span class="map-info-sub" data-hud="info-sub"></span>
        </span>
      </div>
      <p class="map-info-text" data-hud="info-text"></p>
      <ul class="map-info-notes" data-hud="info-notes"></ul>
    </div>
    <div class="hud-coach" data-hud="coach" role="status" aria-live="polite" hidden>
      <span data-hud="coach-text"></span>
      <button type="button" class="text-btn" data-hud="coach-skip">Skip</button>
    </div>
    <div class="hud-hint" data-hud="hint" role="status"></div>
    <div class="hud-toast" data-hud="toast" role="status"></div>
    <div class="hud-ticker" data-hud="ticker" role="status" aria-live="polite">
      <strong data-hud="ticker-title"></strong><span data-hud="ticker-text"></span>
    </div>
    <div class="overlay" data-hud="reward" hidden>
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="reward-title">
        <p class="card-kicker" data-hud="reward-kicker">Week 1 done</p>
        <p class="reward-delivered" data-hud="reward-delivered"></p>
        <h2 id="reward-title">Pick one more</h2>
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
        <p class="card-best" data-hud="over-best"></p>
        <div class="timelapse" data-hud="timelapse-box" hidden>
          <canvas class="timelapse-canvas" data-hud="timelapse" role="img" aria-label="Your network growing, day by day"></canvas>
          <button type="button" class="link-btn" data-hud="save-image">Save image</button>
        </div>
        <section class="report" aria-label="Run report">
          <div class="report-head">
            <h3 class="report-heading">Packets delivered each week</h3>
            <p class="report-note" data-hud="week-note"></p>
          </div>
          <div class="week-chart" role="list" data-hud="week-chart"></div>
          <dl class="report-facts">
            <div class="fact"><dt>Busiest link</dt><dd data-hud="busiest"></dd></div>
            <div class="fact" data-hud="ended-box"><dt>Ended the run</dt><dd data-hud="ended-by"></dd></div>
          </dl>
        </section>
        <div class="share" data-hud="share" hidden>
          <pre class="share-text" data-hud="share-text"></pre>
          <button type="button" class="secondary-btn" data-hud="share-btn">Copy result</button>
        </div>
        <div class="card-actions">
          <button type="button" class="primary-btn" data-hud="restart">Play again</button>
          <button type="button" class="secondary-btn" data-hud="same-seed" hidden>Same seed</button>
          <button type="button" class="secondary-btn" data-hud="over-menu">Menu</button>
        </div>
        <p class="card-seed" data-hud="over-seed"></p>
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
    rewardDelivered: q("reward-delivered"),
    over: q("over"),
    overTitle: q("over-title"),
    overText: q("over-text"),
    overScore: q("over-score"),
    overDays: q("over-days"),
    restart: q("restart"),
    mute: q("mute"),
    theme: q("theme"),
    menu: q("menu"),
    run: q("run"),
    overBest: q("over-best"),
    overSeed: q("over-seed"),
    timelapseBox: q("timelapse-box"),
    timelapse: q("timelapse"),
    weekChart: q("week-chart"),
    weekNote: q("week-note"),
    busiest: q("busiest"),
    endedBox: q("ended-box"),
    endedBy: q("ended-by"),
    saveImage: q("save-image"),
    overMenu: q("over-menu"),
    sameSeed: q("same-seed"),
    coach: q("coach"),
    coachText: q("coach-text"),
    coachSkip: q("coach-skip"),
    info: q("info"),
    infoIcon: q("info-icon"),
    infoTitle: q("info-title"),
    infoSub: q("info-sub"),
    infoText: q("info-text"),
    infoNotes: q("info-notes"),
    share: q("share"),
    shareText: q("share-text"),
    shareBtn: q("share-btn"),
  };
  const speedBtns = [...root.querySelectorAll("[data-speed]")];
  const trayItems = [...root.querySelectorAll("[data-item]")];
  const counts = Object.fromEntries(trayItems.map((b) => [b.dataset.item, b.querySelector("[data-count]")]));

  // Tooltips: hover with a mouse, keyboard focus, or press on a phone.
  const tip = {
    box: q("tip"),
    name: q("tip-name"),
    text: q("tip-text"),
    count: q("tip-count"),
    item: null,
    timer: 0,
  };
  function tipCount(id) {
    const n = Number(counts[id].textContent);
    if (id === "links") return n === 0 ? "None left. One arrives each day." : `${n} left`;
    if (n === 0) return "None left. Weekly rewards can give you more.";
    return `${n} left`;
  }
  function showTip(b, hideAfter = 0) {
    const id = b.dataset.item;
    clearTimeout(tip.timer);
    tip.item = id;
    tip.name.textContent = items[id].name;
    tip.text.textContent = items[id].tip;
    tip.count.textContent = tipCount(id);
    tip.box.hidden = false;
    // Centre it above the button, kept on screen.
    const r = b.getBoundingClientRect();
    const w = tip.box.offsetWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    tip.box.style.left = `${left}px`;
    tip.box.style.bottom = `${window.innerHeight - r.top + 10}px`;
    if (hideAfter) tip.timer = setTimeout(hideTip, hideAfter);
  }
  function hideTip() {
    clearTimeout(tip.timer);
    tip.item = null;
    tip.box.hidden = true;
  }
  // Disabled buttons don't get pointer events, so listen on the tray.
  const trayButtonAt = (e) => trayItems.find((b) => {
    if (b.hidden) return false;
    const r = b.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  });
  const tray = q("tray");
  tray.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || e.buttons) return;
    const b = trayButtonAt(e);
    if (!b) hideTip();
    else if (tip.item !== b.dataset.item) showTip(b);
  });
  tray.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "touch") hideTip();
  });
  tray.addEventListener("pointerdown", (e) => {
    const b = trayButtonAt(e);
    if (!b) return;
    if (e.pointerType === "touch") showTip(b, 2500);
    else hideTip();
  });

  for (const b of trayItems) {
    b.addEventListener("focus", () => b.matches(":focus-visible") && showTip(b));
    b.addEventListener("blur", hideTip);
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
  el.sameSeed.addEventListener("click", () => onRestart({ sameSeed: true }));
  el.coachSkip.addEventListener("click", () => onSkipTutorial?.());
  el.menu.addEventListener("click", () => onMenu());
  el.overMenu.addEventListener("click", () => onMenu());
  el.mute.addEventListener("click", () => onMute());
  el.theme.addEventListener("click", () => onTheme());
  el.shareBtn.addEventListener("click", async () => {
    const ok = await onShare(el.shareText.textContent);
    el.shareBtn.textContent = ok ? "Copied!" : "Select and copy above";
    setTimeout(() => (el.shareBtn.textContent = "Copy result"), 2000);
  });
  el.rewardOptions.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-reward]");
    if (btn) onReward(btn.dataset.reward);
  });

  let toastTimer = 0;
  let infoTimer = 0;
  let tickerTimer = 0;
  let stopTimelapse = () => {};
  const shown = {
    score: -1,
    paused: null,
    speed: null,
    clock: "",
    dial: -1,
    reward: null,
    over: null,
    armed: null,
    inv: {},
    muted: null,
    theme: null,
    run: "",
    coach: null,
  };

  return {
    /**
     * @param {object} run  { label, muted, result: { best, bestScore, share, seed } | null }
     */
    update(world, loop, ui, run) {
      if (shown.muted !== run.muted) {
        shown.muted = run.muted;
        el.mute.innerHTML = run.muted ? SOUND_OFF : SOUND_ON;
        el.mute.setAttribute("aria-pressed", String(run.muted));
        el.mute.setAttribute("aria-label", run.muted ? "Unmute sound" : "Mute sound");
      }
      if (shown.theme !== ui.theme) {
        // Shows what a tap switches to: the moon in light mode, the sun in dark.
        shown.theme = ui.theme;
        const dark = ui.theme === "dark";
        el.theme.innerHTML = dark ? SUN : MOON;
        el.theme.setAttribute("aria-label", dark ? "Light mode" : "Dark mode");
      }
      if (shown.run !== run.label) {
        shown.run = run.label;
        el.run.textContent = run.label;
      }
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
          // Firewalls only show up once they matter, and core routers, QoS
          // policies and backbones once you have one; everything else always shows.
          b.hidden =
            (id === "firewalls" && n === 0 && !world.security) || (id === "routers" && n === 0 && !world.sites.some((s) => s.core)) ||
            (id === "qos" && n === 0 && !world.sites.some((s) => s.qos)) ||
            (id === "backbone" && n === 0 && !world.links.some((l) => l.backbone));
          if (items[id].target) b.disabled = n === 0;
        }
      }
      if (tip.item) tip.count.textContent = tipCount(tip.item);
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
          const delivered = Object.entries(offer.delivered ?? {});
          el.rewardDelivered.hidden = delivered.length === 0;
          el.rewardDelivered.innerHTML = delivered.length
            ? `<span class="reward-delivered-label">Delivered</span>${grantChips(delivered)}`
            : "";
          el.rewardOptions.innerHTML = offer.options
            .map((id) => {
              const r = world.data.rewards.find((x) => x.id === id);
              return `<button type="button" class="reward-btn" data-reward="${escapeHtml(r.id)}">
                <span class="reward-icons" aria-hidden="true">${grantChips(Object.entries(r.grant))}</span>
                <strong>${escapeHtml(r.label)}</strong><span class="reward-detail">${escapeHtml(r.detail)}</span></button>`;
            })
            .join("");
          el.rewardOptions.querySelector("button")?.focus();
        }
      }

      if (shown.over !== world.over) {
        shown.over = world.over;
        el.over.hidden = !world.over;
        stopTimelapse();
        if (world.over) {
          const frames = world.history;
          const report = runReport(world);
          // The timelapse outlines the busiest link and rings the site that went down.
          const marks = { link: report.busiest, siteId: world.over.siteId };
          el.timelapseBox.hidden = frames.length === 0;
          if (frames.length > 0) {
            stopTimelapse = playTimelapse(el.timelapse, frames, world.data.sites, marks);
            el.saveImage.onclick = () => saveImage(el.timelapse, frames, world.data.sites, marks);
          }
          el.weekChart.innerHTML = weekChartHtml(report.weeks);
          // The last bar is lighter: the outage cut that week short.
          el.weekNote.hidden = report.weeks.length < 2;
          el.weekNote.textContent = `Week ${report.weeks.length} cut short`;
          el.busiest.innerHTML = busiestHtml(report.busiest);
          el.endedBox.hidden = !report.ended;
          el.endedBy.innerHTML = endedHtml(report.ended, world.data.sites);
          const site = world.siteById.get(world.over.siteId);
          const name = world.data.sites[site.type].name;
          el.overTitle.textContent = `${article(name)} ${name.toLowerCase()} went down`;
          el.overText.textContent = isStarving(world, site)
            ? "It went too long without any deliveries."
            : "Its queue stayed over capacity for too long.";
          el.overScore.textContent = String(world.stats.score);
          el.overDays.textContent = describeSurvival(clock(world).daysSurvived);
          const r = run.result;
          el.overBest.textContent = !r ? "" : r.best ? "New best score!" : r.bestScore !== null ? `Best: ${r.bestScore}` : "";
          el.share.hidden = !r?.share;
          el.shareText.textContent = r?.share ?? "";
          el.overSeed.textContent = r?.seed ? `Seed ${r.seed}` : "";
          el.sameSeed.hidden = !r?.seed;
          el.restart.focus();
        }
      }
    },
    /** The tutorial prompt, or null to hide it. */
    coach(text) {
      if (shown.coach === text) return;
      shown.coach = text;
      el.coach.hidden = !text;
      el.coachText.textContent = text ?? "";
    },
    /** A short headline for an event, shown at the top for a few seconds. */
    ticker(title, text) {
      el.tickerTitle.textContent = title;
      el.tickerText.textContent = text;
      el.ticker.classList.add("show");
      clearTimeout(tickerTimer);
      tickerTimer = setTimeout(() => el.ticker.classList.remove("show"), 5500);
    },
    /**
     * Show the tap-to-explain card (ui/inspect.js) near a screen point,
     * above it if there's room so a finger doesn't cover it. It never
     * takes taps itself, so drawing carries on underneath.
     * @param {object | null} info  null hides it.
     * @param {{ x: number, y: number }} [at]  Client (viewport) px.
     * @param {{ top: number, bottom: number }} [insets]  HUD space to stay clear of.
     */
    showInfo(info, at, insets = { top: 0, bottom: 0 }, hideAfterMs = 0) {
      clearTimeout(infoTimer);
      if (!info) {
        el.info.hidden = true;
        return;
      }
      el.infoIcon.innerHTML = infoIconSvg(info.icon);
      el.infoTitle.textContent = info.title;
      el.infoSub.textContent = info.subtitle ?? "";
      el.infoText.textContent = info.text;
      el.infoText.hidden = !info.text;
      el.infoNotes.replaceChildren(
        ...info.notes.map((n) => {
          const li = document.createElement("li");
          li.textContent = n;
          return li;
        }),
      );
      el.info.hidden = false;
      const w = el.info.offsetWidth;
      const h = el.info.offsetHeight;
      const gap = 28;
      const top = insets.top + 6;
      const bottom = window.innerHeight - insets.bottom - 6;
      const x = at?.x ?? window.innerWidth / 2;
      const y = at?.y ?? window.innerHeight / 2;
      const left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
      let ty = y - gap - h;
      if (ty < top) ty = y + gap;
      if (ty + h > bottom) ty = Math.max(top, bottom - h);
      el.info.style.left = `${left}px`;
      el.info.style.top = `${ty}px`;
      if (hideAfterMs) infoTimer = setTimeout(() => (el.info.hidden = true), hideAfterMs);
    },
    get infoShown() {
      return !el.info.hidden;
    },

    toast(text) {
      el.toast.textContent = text;
      el.toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
    },
  };
}

/** A small picture of what the info card describes, drawn like the map draws it. */
export function infoIconSvg(icon) {
  if (!icon) return "";
  const svg = (body) => `<svg viewBox="0 0 28 28" width="28" height="28">${body}</svg>`;
  const color = escapeHtml(icon.color ?? "#888");
  const shape = (kind, fill, stroke) => {
    const st = stroke ? `stroke="#fff" stroke-width="2" stroke-linejoin="round"` : "";
    switch (kind) {
      case "hub":
        return `<rect x="5" y="5" width="18" height="18" rx="6" fill="${fill}" ${st}/>`;
      case "square":
        return `<rect x="6" y="6" width="16" height="16" fill="${fill}" ${st}/>`;
      case "triangle":
        return `<path d="M14 4 L24 22 L4 22 Z" fill="${fill}" ${st}/>`;
      case "diamond":
        return `<path d="M14 4 L24 14 L14 24 L4 14 Z" fill="${fill}" ${st}/>`;
      case "edge":
        return `<path d="M14 3 L23.5 8.5 L23.5 19.5 L14 25 L4.5 19.5 L4.5 8.5 Z" fill="${fill}" ${st}/>`;
      case "cloud":
        return `<path d="M7 20 A5 5 0 0 1 8 10 A7 7 0 0 1 20.5 10 A5 5 0 0 1 21 20 Z" fill="${fill}" ${st}/>`;
      case "district":
        return `<path d="M4 10 L14 4 L24 10 L24 21 Q24 24 21 24 L7 24 Q4 24 4 21 Z" fill="${fill}" ${st}/>`;
      case "switch":
        return (
          `<rect x="6" y="6" width="16" height="16" rx="6" fill="${fill}" ${st}/>` +
          [10, 18].flatMap((x) => [10, 18].map((y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#fff"/>`)).join("")
        );
      default:
        return `<circle cx="14" cy="14" r="${stroke ? 9 : 7}" fill="${fill}" ${st}/>`;
    }
  };
  switch (icon.type) {
    case "site":
      return svg(shape(icon.shape, color, true));
    case "packet":
      return svg(shape(icon.shape, color, false));
    case "link": {
      const width = 3 + (icon.tier ?? 0) * 1.5;
      return svg(`<path d="M3 21 L11 13 L25 13" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    case "terrain": {
      const fill = escapeHtml(icon.fill ?? "#bbb");
      const edge = escapeHtml(icon.edge ?? "#888");
      const marks = {
        water: `<path d="M6 11 q2 -2 4 0 t4 0 t4 0 t4 0 M6 18 q2 -2 4 0 t4 0 t4 0 t4 0" fill="none" stroke="${edge}" stroke-width="1.5"/>`,
        park: [9, 14, 19].flatMap((x) => [10, 18].map((y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${edge}"/>`)).join(""),
        hills: `<path d="M5 13 L13 5 M5 21 L21 5 M11 23 L23 11" stroke="${edge}" stroke-width="1.5"/>`,
      };
      return svg(`<rect x="3" y="3" width="22" height="22" rx="4" fill="${fill}" stroke="${edge}" stroke-width="1.5"/>${marks[icon.terrain] ?? ""}`);
    }
    case "boundary":
      return svg(`<path d="M4 24 C10 18 10 10 16 8 S22 5 25 4" fill="none" stroke="${icon.color ? color : "var(--muted)"}" stroke-width="7" stroke-linecap="round"/>`);
    case "closed":
      return svg(`<rect x="4" y="4" width="20" height="20" rx="3" fill="var(--muted)" opacity="0.35" stroke="var(--muted)" stroke-dasharray="3 3"/>`);
    default:
      return "";
  }
}

function article(word) {
  return /^[aeiou]/i.test(word) ? "An" : "A";
}
