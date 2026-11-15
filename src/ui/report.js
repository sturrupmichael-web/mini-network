/**
 * The run report on the game-over card: a bar chart of packets delivered
 * each week, the busiest link, and the site that ended the run.
 * Builds HTML strings from world data; hud.js puts them in place.
 */
import { THEME } from "../../data/theme.js";
import { busiestLink, weeklyDeliveries } from "../sim/runstats.js";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmt = (n) => n.toLocaleString("en-US");
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

/** "Data center (HQ)", "Office" */
export function siteName(world, site) {
  const name = world.data.sites[site.type].name;
  return site.label ? `${name} (${site.label})` : name;
}

/**
 * Everything the card needs, as plain data (also handy for tests).
 * @returns {{ weeks: number[], busiest: object | null, ended: object | null }}
 */
export function runReport(world) {
  const weeks = weeklyDeliveries(world);
  const top = busiestLink(world);
  const busiest = top && {
    ...top,
    from: siteName(world, world.siteById.get(top.a)),
    to: siteName(world, world.siteById.get(top.b)),
    line: top.linkId !== null ? world.linkById.get(top.linkId).line : null,
  };
  const site = world.over && world.siteById.get(world.over.siteId);
  let ended = null;
  if (site) {
    const { secondsPerDay, daysPerWeek } = world.config.time;
    const bornDay = Math.floor(site.born / secondsPerDay);
    const endDay = Math.floor(world.over.time / secondsPerDay);
    ended = {
      siteId: site.id,
      type: site.type,
      name: siteName(world, site),
      bornDay,
      links: site.links.length,
      when: `Week ${Math.floor(endDay / daysPerWeek) + 1}, ${DAY_NAMES[endDay % daysPerWeek]}`,
    };
  }
  return { weeks, busiest, ended };
}

/** The weekly bar chart. The last week is still going, so it's drawn lighter. */
export function weekChartHtml(weeks, inProgress = true) {
  const max = Math.max(1, ...weeks);
  const peak = weeks.indexOf(Math.max(...weeks));
  const n = weeks.length;
  // Label every week while there's room, then every 2nd/5th (always the last).
  const every = n <= 10 ? 1 : n <= 20 ? 2 : 5;
  return weeks
    .map((v, i) => {
      const last = i === n - 1;
      const partial = last && inProgress && n > 1;
      const showValue = n <= 8 || i === peak || last;
      const showLabel = last || i % every === 0;
      const h = v === 0 ? 0 : Math.max(3, (v / max) * 100);
      const tip = `Week ${i + 1}${partial ? " (so far)" : ""}: ${plural(v, "packet")}`;
      return `<div class="wk${partial ? " wk-partial" : ""}${i === peak ? " wk-peak" : ""}" title="${tip}" role="listitem" aria-label="${tip}">
        <span class="wk-val">${showValue ? fmt(v) : ""}</span>
        <span class="wk-track"><span class="wk-bar" style="height:${h.toFixed(1)}%"></span></span>
        <span class="wk-lbl">${showLabel ? `W${i + 1}` : ""}</span>
      </div>`;
    })
    .join("");
}

/** A short line swatch in the link's colour, with the same halo as on the map. */
function linkSwatch(line) {
  const color = line === null ? "var(--muted)" : THEME.lineColors[line % THEME.lineColors.length];
  return `<svg class="fact-icon" viewBox="0 0 28 28" aria-hidden="true">
    <path d="M4 20 L12 12 L24 12" fill="none" stroke="var(--ink)" stroke-opacity="0.22" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 20 L12 12 L24 12" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"${line === null ? ' stroke-dasharray="3 4"' : ""}/>
  </svg>`;
}

/** The site's shape in its colour, inside the red outage ring. */
function siteSwatch(def) {
  const shape =
    def.shape === "circle"
      ? `<circle cx="14" cy="14" r="6.5" fill="${def.color}" stroke="#fff" stroke-width="1.6"/>`
      : `<rect x="7.5" y="7.5" width="13" height="13" rx="3" fill="${def.color}" stroke="#fff" stroke-width="1.6"/>`;
  return `<svg class="fact-icon" viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="11.5" fill="none" stroke="${THEME.light.overload}" stroke-width="2.4"/>${shape}
  </svg>`;
}

export function busiestHtml(busiest) {
  if (!busiest) return `<span class="fact-main">No packets moved yet</span>`;
  const note = busiest.linkId === null ? "since taken down" : "outlined on the map";
  return `${linkSwatch(busiest.line)}<span class="fact-body">
    <span class="fact-main">${escapeHtml(busiest.from)} ↔ ${escapeHtml(busiest.to)}</span>
    <span class="fact-sub">${plural(busiest.packets, "packet")} · ${note}</span></span>`;
}

export function endedHtml(ended, siteTypes) {
  if (!ended) return "";
  const born = ended.bornDay === 0 ? "There from the start" : `Joined on day ${ended.bornDay + 1}`;
  return `${siteSwatch(siteTypes[ended.type])}<span class="fact-body">
    <span class="fact-main">${escapeHtml(ended.name)}</span>
    <span class="fact-sub">${born} · ${plural(ended.links, "link")} · down ${ended.when}</span></span>`;
}

