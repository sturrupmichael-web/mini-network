/**
 * The debug panel, for tuning balance. Toggle it with the ` key (backquote),
 * or open the game with ?debug in the URL (handy on a phone).
 *
 * It only calls the functions it's given and the cheats in sim/debug.js;
 * it never reaches into the simulation itself.
 */

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Live config knobs: [section, key, label, step]. Edits apply to the
 * current game only; to keep a value, copy it into data/config.js.
 */
export const KNOBS = [
  ["spawn", "packetIntervalScale", "Packet interval ×", 0.05],
  ["links", "bandwidth", "Link bandwidth", 0.25],
  ["links", "packetSpeed", "Packet speed", 10],
  ["overload", "seconds", "Overload seconds", 1],
  ["overload", "recoveryRate", "Overload recovery", 0.25],
];

/** Lines of text for the stats readout. */
export function formatStats(s) {
  const types = Object.entries(s.sitesByType)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  const inv = Object.entries(s.inventory)
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
  return [
    `seed ${s.seed} · tick ${s.tick} · ${s.time}s`,
    `week ${s.week} · day ${s.day} · next site in ${s.nextSiteIn}s`,
    `score ${s.score} · delivered ${s.delivered} · dropped ${s.dropped} (${s.deliveryRate}% ok)`,
    `lost ${s.lost} · filtered ${s.filtered} · spawned ${s.spawned}`,
    `packets: ${s.inFlight} moving, ${s.queued} queued`,
    `sites ${s.sites} (${types})`,
    `links ${s.links} · over capacity ${s.overCapacity} · worst ring ${s.worstOverload}%`,
    `traffic scale ${s.trafficScale} · events ${s.activeEvents.join(", ") || "none"}`,
    `inventory: ${inv}`,
  ].join("\n");
}

/**
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {string[]} opts.siteTypes   Site type ids that can be spawned.
 * @param {{id: string, name: string}[]} opts.events
 * @param {() => object|null} opts.stats  debugStats(world), or null when no game is running.
 * @param {() => object|null} opts.config The running game's config.
 * @param {object} opts.actions  { spawnSite(type), burst(n), trigger(id), skip(seconds), grant(items),
 *                                 setOutages(on), getOutages(), setKnob(section, key, value), copy(text) }
 */
export function createDebugPanel(root, opts) {
  const { actions } = opts;
  const panel = document.createElement("aside");
  panel.className = "debug-panel";
  panel.dataset.debug = "panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Debug panel");
  panel.innerHTML = `
    <header class="debug-head">
      <strong>Debug</strong>
      <span class="debug-hint">\` to toggle</span>
      <button type="button" class="debug-close" data-debug="close" aria-label="Close debug panel">×</button>
    </header>
    <pre class="debug-stats" data-debug="stats"></pre>
    <div class="debug-row">
      <select data-debug="site-type" aria-label="Site type">
        ${opts.siteTypes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
      </select>
      <button type="button" data-debug="spawn-site">Add site</button>
      <button type="button" data-debug="burst">Burst ×3</button>
    </div>
    <div class="debug-row">
      <select data-debug="event" aria-label="Event">
        ${opts.events.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`).join("")}
      </select>
      <button type="button" data-debug="trigger">Trigger</button>
    </div>
    <div class="debug-row">
      <span>Skip</span>
      <button type="button" data-debug="skip" data-seconds="10">10s</button>
      <button type="button" data-debug="skip" data-seconds="day">1 day</button>
      <button type="button" data-debug="skip" data-seconds="week">1 week</button>
    </div>
    <div class="debug-row">
      <button type="button" data-debug="grant-links">+30 links</button>
      <button type="button" data-debug="grant-items">+1 each item</button>
      <label><input type="checkbox" data-debug="outages" checked /> outages</label>
    </div>
    <div class="debug-knobs">
      ${KNOBS.map(
        ([section, key, label, step]) => `
        <label>${escapeHtml(label)}
          <input type="number" step="${step}" min="0" data-knob="${section}.${key}" />
        </label>`,
      ).join("")}
    </div>
    <div class="debug-row">
      <button type="button" data-debug="copy">Copy stats</button>
      <span class="debug-note" data-debug="note" aria-live="polite"></span>
    </div>`;
  root.append(panel);

  const q = (name) => panel.querySelector(`[data-debug="${name}"]`);
  const note = (text) => {
    q("note").textContent = text;
  };

  q("close").addEventListener("click", () => toggle(false));
  q("spawn-site").addEventListener("click", () => {
    const site = actions.spawnSite(q("site-type").value);
    note(site ? `Added ${site.type} #${site.id}` : "No room for a site");
  });
  q("burst").addEventListener("click", () => note(`${actions.burst(3)} packets queued`));
  q("trigger").addEventListener("click", () => {
    note(actions.trigger(q("event").value) ? "Event started" : "That event can't start right now");
  });
  for (const b of panel.querySelectorAll('[data-debug="skip"]')) {
    b.addEventListener("click", () => {
      const r = actions.skip(b.dataset.seconds);
      if (!r) return note("Start a game first");
      const why = { reward: " (stopped for the weekly reward)", over: " (game over)" }[r.stoppedBy] ?? "";
      note(`Skipped ${Math.round(r.seconds)}s${why}`);
    });
  }
  q("grant-links").addEventListener("click", () => actions.grant({ links: 30 }));
  q("grant-items").addEventListener("click", () =>
    actions.grant({ upgrades: 1, switches: 1, firewalls: 1, sdwan: 1, leased: 1 }),
  );
  q("outages").addEventListener("change", (e) => actions.setOutages(e.target.checked));
  for (const input of panel.querySelectorAll("[data-knob]")) {
    input.addEventListener("change", () => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value <= 0) return;
      const [section, key] = input.dataset.knob.split(".");
      actions.setKnob(section, key, value);
    });
  }
  q("copy").addEventListener("click", async () => {
    const s = opts.stats();
    if (!s) return;
    note((await actions.copy(JSON.stringify(s, null, 2))) ? "Copied" : "Couldn't copy");
  });

  let lastStats = 0;
  /** Refresh the readout (call every frame; it throttles itself). */
  function update(now = performance.now()) {
    if (panel.hidden || now - lastStats < 250) return;
    lastStats = now;
    const s = opts.stats();
    q("stats").textContent = s ? formatStats(s) : "No game running.";
    const config = opts.config();
    q("outages").checked = actions.getOutages();
    for (const input of panel.querySelectorAll("[data-knob]")) {
      if (document.activeElement === input || !config) continue;
      const [section, key] = input.dataset.knob.split(".");
      input.value = String(config[section][key]);
    }
  }

  function toggle(open = panel.hidden) {
    panel.hidden = !open;
    lastStats = 0;
    update();
  }

  return {
    toggle,
    update,
    get visible() {
      return !panel.hidden;
    },
  };
}
