# Mini Network

A minimal network-building puzzle game for the browser. Sites pop up on a
map and generate traffic; you draw links to keep it flowing to the data
center.

Work in progress (Phase 2 of 5). See [docs/architecture.md](docs/architecture.md).

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
- Space pauses, 1 and 2 set the speed.

## Build and test

```sh
npm run lint
npm run build        # writes index.html (not committed)
npm test             # all tests, including browser tests
npm test -- node     # skip browser tests
```

Browser tests need Playwright's Chromium: `npx playwright install chromium`.
