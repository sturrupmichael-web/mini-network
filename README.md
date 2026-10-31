# Mini Network

A minimal network-building puzzle game for the browser. Sites pop up on a
map and generate traffic; you draw links to keep it flowing to the data
center.

Work in progress (Phase 3 of 5). See [docs/architecture.md](docs/architecture.md).

## Run locally

```sh
npm install
npm run serve        # python3 -m http.server 8000
```

Open <http://localhost:8000/dev.html>. Add `?seed=anything` to replay a game.

Controls:

- Drag from a site to another to link them; keep dragging to chain more.
- Tap or click a link, then its × to remove it (you get the link back).
  Right-click or Delete also removes.
- Drag a link onto another site to reroute it through that site.
- Drag equipment from the tray at the bottom onto the map (or tap it, then
  tap where it goes): bandwidth upgrades and firewalls go on links, SD-WAN
  boxes on sites, switches on empty map or on a link to split it. Tap a
  switch, then its ×, to take it back.
- Space pauses, 1 and 2 set the speed. Escape cancels.

## Build and test

```sh
npm run lint
npm run build        # writes index.html (not committed)
npm test             # all tests, including browser tests
npm test -- node     # skip browser tests
```

Browser tests need Playwright's Chromium: `npx playwright install chromium`.
