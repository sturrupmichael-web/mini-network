/**
 * The title screen (mode and map pickers, best score, Play) and the
 * settings card. DOM only; the game passes in what to show and what to do.
 */
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {object} opts.modes   MODES
 * @param {object[]} opts.maps  MAPS
 * @param {(modeId: string) => string|null} opts.dailyMapId  Today's map for daily modes.
 * @param {(modeId: string, mapId: string) => object|null} opts.best  Best score entry.
 * @param {(choice: {modeId: string, mapId: string}) => void} opts.onPlay
 * @param {() => void} opts.onResume
 * @param {(change: object) => void} opts.onSettings  { muted?, theme? }
 * @param {() => object} opts.getSettings
 */
export function createTitle(root, opts) {
  const { modes, maps, dailyMapId, best, onPlay, onResume, onSettings, getSettings } = opts;
  let modeId = "classic";
  let mapId = maps[0].id;

  root.innerHTML = `
    <div class="overlay title-screen" data-title="screen" hidden>
      <div class="card title-card" role="dialog" aria-modal="true" aria-labelledby="title-heading">
        <h1 id="title-heading" class="title-logo"><span class="logo-dot"></span>Mini Network</h1>
        <p class="title-tagline">Link the sites. Keep the traffic flowing. Don't let anything melt.</p>
        <div class="segmented" role="radiogroup" aria-label="Mode">
          ${Object.entries(modes)
            .map(([id, m]) => `<button type="button" role="radio" data-mode="${esc(id)}" aria-checked="false">${esc(m.name)}</button>`)
            .join("")}
        </div>
        <p class="title-detail" data-title="mode-detail"></p>
        <div class="map-list" role="radiogroup" aria-label="Map" data-title="maps">
          ${maps
            .map(
              (m) => `<button type="button" role="radio" class="map-card" data-map="${esc(m.id)}" aria-checked="false">
                <strong>${esc(m.name)}</strong><span>${esc(m.description ?? "")}</span>
                <span class="map-best" data-map-best="${esc(m.id)}"></span></button>`,
            )
            .join("")}
        </div>
        <p class="title-best" data-title="best"></p>
        <div class="title-actions">
          <button type="button" class="primary-btn" data-title="play">Play</button>
          <button type="button" class="secondary-btn" data-title="resume" hidden>Resume</button>
        </div>
        <p class="title-howto">Drag from site to site to link them. Drop gear from the tray onto links and sites. Keep every queue short.</p>
        <button type="button" class="text-btn" data-title="open-settings">Settings</button>
      </div>
    </div>
    <div class="overlay" data-title="settings" hidden>
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="settings-heading">
        <h2 id="settings-heading">Settings</h2>
        <div class="setting-row">
          <span>Sound</span>
          <button type="button" class="toggle" data-setting="sound" role="switch" aria-checked="true">On</button>
        </div>
        <div class="setting-row">
          <span>Theme</span>
          <div class="segmented small" role="radiogroup" aria-label="Theme">
            <button type="button" role="radio" data-theme-choice="system">Auto</button>
            <button type="button" role="radio" data-theme-choice="light">Light</button>
            <button type="button" role="radio" data-theme-choice="dark">Dark</button>
          </div>
        </div>
        <button type="button" class="primary-btn" data-title="close-settings">Done</button>
      </div>
    </div>
  `;
  const q = (sel) => root.querySelector(sel);
  const screen = q('[data-title="screen"]');
  const settingsCard = q('[data-title="settings"]');
  const modeBtns = [...root.querySelectorAll("[data-mode]")];
  const mapBtns = [...root.querySelectorAll("[data-map]")];
  const themeBtns = [...root.querySelectorAll("[data-theme-choice]")];
  const soundBtn = q('[data-setting="sound"]');

  function refresh() {
    const mode = modes[modeId];
    for (const b of modeBtns) b.setAttribute("aria-checked", String(b.dataset.mode === modeId));
    q('[data-title="mode-detail"]').textContent = mode.detail;
    const forced = mode.daily ? dailyMapId(modeId) : null;
    const shownMap = forced ?? mapId;
    for (const b of mapBtns) {
      b.setAttribute("aria-checked", String(b.dataset.map === shownMap));
      b.disabled = Boolean(forced) && b.dataset.map !== forced;
    }
    // Each map card shows its own best (not for the daily, whose best is per day).
    for (const b of mapBtns) {
      const e = mode.scores && !mode.daily ? best(modeId, b.dataset.map) : null;
      const span = b.querySelector("[data-map-best]");
      span.textContent = e ? `Best ${e.score}` : "";
      span.hidden = !e;
    }
    const entry = mode.scores ? best(modeId, shownMap) : null;
    const label = mode.daily ? "Today's best" : "Best";
    q('[data-title="best"]').textContent = mode.scores
      ? entry
        ? `${label}: ${entry.score} delivered`
        : mode.daily
          ? `Today's map: ${maps.find((m) => m.id === shownMap).name}`
          : "No best score yet"
      : "";
    const s = getSettings();
    soundBtn.setAttribute("aria-checked", String(!s.muted));
    soundBtn.textContent = s.muted ? "Off" : "On";
    for (const b of themeBtns) b.setAttribute("aria-checked", String(b.dataset.themeChoice === s.theme));
  }

  for (const b of modeBtns) {
    b.addEventListener("click", () => {
      modeId = b.dataset.mode;
      refresh();
    });
  }
  for (const b of mapBtns) {
    b.addEventListener("click", () => {
      if (modes[modeId].daily) return;
      mapId = b.dataset.map;
      refresh();
    });
  }
  q('[data-title="play"]').addEventListener("click", () => {
    const mode = modes[modeId];
    onPlay({ modeId, mapId: mode.daily ? dailyMapId(modeId) : mapId });
  });
  q('[data-title="resume"]').addEventListener("click", () => onResume());
  q('[data-title="open-settings"]').addEventListener("click", () => {
    settingsCard.hidden = false;
    refresh();
    q('[data-title="close-settings"]').focus();
  });
  q('[data-title="close-settings"]').addEventListener("click", () => {
    settingsCard.hidden = true;
    if (!screen.hidden) q('[data-title="play"]').focus();
  });
  soundBtn.addEventListener("click", () => {
    onSettings({ muted: !getSettings().muted });
    refresh();
  });
  for (const b of themeBtns) {
    b.addEventListener("click", () => {
      onSettings({ theme: b.dataset.themeChoice });
      refresh();
    });
  }

  return {
    /** Show the title screen. canResume: a game is in progress. */
    show({ canResume = false, mapId: current } = {}) {
      if (current && !modes[modeId].daily) mapId = current;
      q('[data-title="resume"]').hidden = !canResume;
      screen.hidden = false;
      refresh();
      q(canResume ? '[data-title="resume"]' : '[data-title="play"]').focus();
    },
    hide() {
      screen.hidden = true;
      settingsCard.hidden = true;
    },
    get visible() {
      return !screen.hidden;
    },
    /** The map currently picked (for the background preview). */
    get mapId() {
      return modes[modeId].daily ? dailyMapId(modeId) : mapId;
    },
    showSettings() {
      settingsCard.hidden = false;
      refresh();
    },
  };
}
