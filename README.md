# Mini Network

A minimal network-building puzzle game for the browser. Offices, warehouses
and shops pop up on a map and start sending traffic; you draw links to keep
it flowing to the data center before any site's queue overflows. Plays on a
phone or a computer. No server, no accounts, no tracking: one HTML file.

How the code is laid out: [docs/architecture.md](docs/architecture.md).

## Run locally

```sh
npm install
npm run serve        # python3 -m http.server 8000
```

Open <http://localhost:8000/dev.html>. `dev.html` loads the source files
directly, so just reload after an edit.

The title screen lets you pick a mode (Classic, Zen, Daily challenge) and a
map (Florida Region, Coast to Coast, Campus). The gear opens settings
(sound, and an Auto/Light/Dark theme). In a game, the moon/sun button
at the top switches between light and dark mode.

URL options:

| Parameter | Effect |
| --- | --- |
| `?seed=abc` | Skip the title and play that exact game (same seed + same moves = same game) |
| `&map=campus` | Pick the map (`florida-region`, `coast-to-coast`, `campus`) |
| `&mode=zen` | Pick the mode (`classic`, `zen`, `daily`) |
| `?debug` | Open the debug panel at start |

### On a phone

Run `npm run serve` on your computer, find its address on your Wi-Fi (for
example `192.168.1.20`; on macOS `ipconfig getifaddr en0`, on Windows
`ipconfig`), and open `http://192.168.1.20:8000/dev.html` on a phone on the
same network. Or open the deployed site (below).

### Controls

- Drag from a site to another to link them. The link follows your finger
  square by square across the dotted grid, so you can steer it around
  things; drag back over it to undo squares. Each square between the two
  sites uses one link (the counter shows how many). Links can't cross
  water, parks or hills. Keep dragging past a site to chain on to the next
  one.
- The game starts zoomed in around HQ. Each new site opens up more of the
  map (the shaded part isn't open yet) and the view zooms out to match.
- Tap or click a link, then its × to remove it (you get the link back).
  Right-click or Delete also removes.
- Drag a link onto another site to reroute it through that site.
- Drag equipment from the tray at the bottom onto the map (or tap it, then
  tap where it goes). Hover over a tool (or press it on a phone) to see what
  it does.
- Space pauses, 1 and 2 set the speed, M mutes, Escape opens the menu.

## Build and test

```sh
npm run lint
npm run build        # writes index.html: one file, everything inlined (not committed)
npm test             # all tests, including browser tests
npm test -- node     # skip the browser tests
npm test -- debug    # only test files or test names containing "debug"
```

Browser tests need Playwright's Chromium once: `npx playwright install chromium`.
They run against `dev.html`, the built `index.html` over http, and
`index.html` opened straight from disk (`file://`).

## Tuning

### Debug panel

Press **`** (the backquote key, left of 1) in a game, or add `?debug` to the
URL. It shows live stats (score, delivered and dropped, queued and moving
packets, sites by type, worst overload ring, traffic scale, active events,
inventory) and has:

- **Add site** of any type, and **Burst ×3** (three packets at every site).
- **Trigger** any event now.
- **Skip** 10 seconds, a day, or a week (stops at the weekly reward).
- **+5 links**, **+1 each item**, and an **outages** switch.
- Live **knobs** for packet interval, link bandwidth, packet speed and the
  overload timer. They change only the current game; copy a value you like
  into `data/config.js` to keep it.
- **Copy stats** puts the stats on the clipboard as JSON.

Using the panel changes the game's random draws, so a game you touched won't
replay the same from its seed.

### Balance knobs (`data/config.js`)

Every field is commented in the file. The ones that matter most:

| Knob | What it does |
| --- | --- |
| `links.startingCount`, `links.perDay` | How many links (grid squares of link) you start with and get each day |
| `growth.viewStart`, `growth.viewPerSite`, `growth.viewPadding` | How much of the map is open at the start, how much each new site opens up, and the room kept around every site |
| `grid.cellSize` | Size of one grid square; smaller squares mean finer routes and more links per connection |
| `links.bandwidth`, `links.packetSpeed` | How much a link carries and how fast packets move |
| `inventory` | Starting equipment (upgrades, switches, firewalls, SD-WAN, leased lines) |
| `spawn.packetIntervalScale` | Global traffic rate: lower is busier |
| `spawn.warmupDays`, `spawn.warmupScale` | The calm start: traffic begins this many times sparser and eases to normal over these days |
| `spawn.newSiteGrace` | Seconds a new site waits before sending, so you can connect it |
| `spawn.weeklyIntervalMultiplier`, `spawn.minIntervalScale` | How much busier each week gets, and the cap |
| `growth.firstSiteAt`, `growth.interval`, `growth.intervalDecay`, `growth.minInterval` | How often new sites appear, and how fast that speeds up |
| `growth.startRadius`, `growth.radiusGrowthPerDay` | How far from the data center new sites can appear |
| `growth.types` | Odds of each kind of new site |
| `sites.minSpacing`, `sites.linkClearance` | How far new sites keep from other sites and from your links |
| `overload.seconds`, `overload.recoveryRate` | How long a site can stay over capacity before an outage, and how fast it recovers |
| `failover.convergenceSeconds` | How long sites without SD-WAN take to notice a cut link |
| `time.secondsPerDay`, `time.daysPerWeek` | Length of a day and of a week (rewards come weekly) |
| `routing.*` | How strongly packets avoid busy links and full queues |

Per-site numbers (capacity, packet rate, day/night activity, bursts) are in
`data/sites.js`; per-traffic numbers (size, points, hop limits) in
`data/traffic.js`; weekly reward odds in `data/rewards.js`.

### Adding content

Everything is data. After any change, `npm test -- node` runs the data
validator, which names the exact field that's wrong.

- **A map:** add an entry to `MAPS` in `data/maps.js`: `id`, `name`,
  `description`, `width`, `height`, `start` (the sites at the start: one
  `datacenter` plus a few others, at least `sites.minSpacing` apart),
  `boundaries` (carrier boundaries as lists of points; links crossing them
  need leased lines), optional `terrain` (shapes of water, park or hills
  that links must go around: `{ kind, points: [[x, y], …] }`; kinds are in
  `data/terrain.js`, colours in `data/theme.js`) and optional `tuning`
  (config overrides for this map only, e.g. `{ links: { startingCount: 50 } }`).
  It shows up on the title screen and in the daily rotation.
- **A traffic type:** add it to `TRAFFIC_TYPES` in `data/traffic.js`
  (colour, shape, size, destination `to`, points, `unlockDay`, `hours`),
  then give it a weight in the `traffic` of the site types that send it in
  `data/sites.js`. Add a scale step for its delivery note in
  `data/audio.js` `trafficSteps` if you like.
- **A site type:** add it to `SITE_TYPES` in `data/sites.js` (shape, colour,
  capacity, packet rate, traffic weights) and to `growth.types` in
  `data/config.js` so it appears.
- **An event:** add it to `EVENTS` in `data/events.js` with a schedule,
  toasts and one of the existing effects (`linkCut`, `broadcast`,
  `acquisition`, `cloudMigration`, `securityRules`, `ddos`) and its params.
  A new kind of effect needs a handler in `src/sim/events.js` `EFFECTS`.

## Deploy to michaelsturrup.com/mini-network/

The site is GitHub Pages. `michaelsturrup.com` is the custom domain of the
`sturrupmichael-web.github.io` repo, so any other repo's Pages site appears
under it at `/<repo-name>/`.

1. Create a repo named `mini-network` under `sturrupmichael-web` (done) and
   push this code to its `main` branch.
2. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
   Don't set a custom domain and don't add a `CNAME` file: the project site
   inherits `michaelsturrup.com` from the main site.
3. Push to `main`. The **Tests** workflow runs lint, build and every test.
   When it passes, the **Deploy** workflow builds `index.html` and publishes
   it. The game is then at <https://michaelsturrup.com/mini-network/>.

You can also run Deploy by hand from the Actions tab (**Run workflow**).
If a deploy fails, the Actions tab shows which step; the usual cause is
Pages not being set to GitHub Actions yet.

## The card on the main site

`npm run build && npm run screenshot -- images/mini-network.webp` makes the
1200×630 card image (`tools/screenshot.mjs` plays a seeded game for a few
days and saves a WebP). It goes in `sturrupmichael-web.github.io` at
`images/mini-network.webp`, with this entry at the top of `games.json`:

```json
{
  "title": "Mini Network",
  "slug": "mini-network",
  "description": "Keep a growing company online: draw links between offices, warehouses and shops, add switches and firewalls, and survive cut cables, patch days and a DDoS before a site's queue overflows.",
  "url": "https://michaelsturrup.com/mini-network/",
  "thumbnail": "images/mini-network.webp",
  "thumbnailAlt": "A minimal network map: coloured links run from a dark HQ square out to blue office circles, orange warehouse squares and green shop triangles, with packets moving along them",
  "tags": ["Strategy", "Minimal", "Phone + desktop"],
  "status": "new"
}
```
