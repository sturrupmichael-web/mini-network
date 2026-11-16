import { assert } from "./harness.mjs";
import { fakeJwt } from "./online.test.mjs";

export const browser = true;

const SUPABASE = "https://abeqdmurddrkrqbnfylb.supabase.co";

/**
 * Stand in for Supabase: a leaderboard with two players, a name table,
 * and score posting. Returns the requests seen.
 */
async function fakeSupabase(context, { name = "Sam" } = {}) {
  const seen = [];
  const state = { name, posted: [] };
  await context.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/(rest|auth)\/v1\//, "");
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    seen.push({ method: req.method(), path, body, auth: req.headers().authorization ?? null });
    const json = (status, data) =>
      route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: data === undefined ? "" : JSON.stringify(data) });
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    }
    if (path === "rpc/nn_leaderboard") {
      const rows = [
        { rank: 1, name: "Ada", score: 900, days: 21.5 },
        { rank: 2, name: "Linus", score: 700, days: 15 },
        ...state.posted.filter((p) => p.map === body.p_map).map((p) => ({ rank: 3, name: state.name, score: p.score, days: p.days })),
      ];
      return json(200, body.p_map === "campus" ? rows : []);
    }
    if (path === "rpc/nn_my_best") {
      const mine = state.posted.filter((p) => p.map === body.p_map);
      return json(200, mine.length ? { score: mine[0].score, days: mine[0].days, rank: 3 } : null);
    }
    if (path === "players" && req.method() === "GET") return json(200, state.name ? [{ name: state.name }] : []);
    if (path === "players") {
      state.name = body.name;
      return json(201, [{ name: body.name }]);
    }
    if (path === "nn_scores") {
      if (!state.name) return json(400, { message: "Pick a leaderboard name first." });
      state.posted.push(body);
      return json(201);
    }
    return json(404, { message: "Not found." });
  });
  return { seen, state };
}

/** End the current game by leaving everything unlinked until an office overloads. */
async function loseGame(page) {
  await page.evaluate(() => {
    const g = window.miniNetwork;
    for (let i = 0; i < 300 && !g.world.over; i++) {
      if (g.world.pendingReward) g.world.pendingReward = null;
      g.runTicks(60 * 10);
    }
  });
  await page.locator('[data-hud="over"]').waitFor({ state: "visible" });
}

/** Open the game as if Google just sent the player back signed in. */
async function openSignedIn(t, page) {
  const token = fakeJwt("00000000-0000-0000-0000-000000000001");
  await page.goto("about:blank"); // a fresh load, as when Google sends the player back
  await page.goto(`${t.target.url}#access_token=${token}&refresh_token=r1&expires_in=3600&token_type=bearer`);
  await page.waitForFunction(() => window.miniNetwork?.world);
}

export const tests = [
  ["the title screen offers Google sign-in and shows each map's leaderboard", async (t) => {
    const page = await t.open({ seed: null });
    const { seen } = await fakeSupabase(page.context());
    const account = page.locator('[data-title="account"]');
    if (t.target.name === "file") {
      assert(/michaelsturrup\.com/.test(await account.textContent()), "explains where sign-in works");
      return;
    }
    await account.locator('[data-act="sign-in"]').waitFor();
    await page.click('[data-map="campus"]');
    await page.click('[data-title="open-board"]');
    await page.locator('[data-online="board"]').waitFor({ state: "visible" });
    await page.locator(".board-row").first().waitFor();
    assert((await page.locator('[data-online="board-title"]').textContent()) === "Campus", "opens on the picked map");
    assert((await page.locator(".board-row").count()) === 2, "two players listed");
    assert(/Ada/.test(await page.locator(".board-row").first().textContent()), "top player first");
    await page.click('[data-board-map="florida-region"]');
    await page.locator(".board-empty").filter({ hasText: "No scores yet" }).waitFor();
    assert(seen.every((r) => r.auth === null), "signed out: no token sent");
    await page.click('[data-online="board-close"]');
    await page.locator('[data-online="board"]').waitFor({ state: "hidden" });
  }],
  ["signed in: a Classic run posts to its map's leaderboard", async (t) => {
    if (t.target.name === "file") return;
    const page = await t.open({ seed: null });
    const { seen, state } = await fakeSupabase(page.context());
    await openSignedIn(t, page);
    assert(!page.url().includes("access_token"), "tokens taken out of the address bar");
    await page.locator('[data-title="account"]').filter({ hasText: "Playing as Sam" }).waitFor();
    await page.click('[data-map="campus"]');
    await page.click('[data-title="play"]');
    await loseGame(page);
    await page.locator('[data-hud="over-online"]').filter({ hasText: "3rd on Campus" }).waitFor();
    assert(state.posted.length === 1 && state.posted[0].map === "campus", JSON.stringify(state.posted));
    const post = seen.find((r) => r.path === "nn_scores");
    assert(post.auth?.startsWith("Bearer "), "posted as the player");
    assert(!("name" in post.body) && !("user_id" in post.body), "the server decides who posted");
    await page.click('[data-hud="over-online"] [data-act="board"]');
    await page.locator(".board-row.is-me").waitFor();
  }],
  ["signed in on the main page: the game is already signed in", async (t) => {
    if (t.target.name === "file") return;
    const page = await t.open({ seed: null });
    await fakeSupabase(page.context());
    const token = fakeJwt("00000000-0000-0000-0000-000000000002");
    // What michaelsturrup.com's Sign in with Google leaves behind.
    await page.evaluate((s) => localStorage.setItem("michaelsturrup.auth.v1", JSON.stringify(s)), {
      access_token: token,
      refresh_token: "r-site",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "00000000-0000-0000-0000-000000000002", email: "p@example.com", guest: false },
    });
    await page.reload();
    await page.waitForFunction(() => window.miniNetwork?.world);
    await page.locator('[data-title="account"]').filter({ hasText: "Playing as Sam" }).waitFor();
  }],
  ["signed in without a name: pick one, then the run posts", async (t) => {
    if (t.target.name === "file") return;
    const page = await t.open({ seed: null, mobile: true });
    const { state } = await fakeSupabase(page.context(), { name: "" });
    await openSignedIn(t, page);
    // First sign-in asks for a name straight away; skip it for now.
    await page.locator('[data-online="name"]').waitFor({ state: "visible" });
    await page.click('[data-online="name-cancel"]');
    await page.click('[data-title="play"]');
    await loseGame(page);
    await page.click('[data-hud="over-online"] [data-act="name"]');
    await page.fill('[data-online="name-input"]', "Packet Pro");
    await page.click('[data-online="name-save"]');
    await page.locator('[data-hud="over-online"]').filter({ hasText: "on Florida Region" }).waitFor();
    assert(state.name === "Packet Pro" && state.posted.length === 1, JSON.stringify(state));
  }],
  ["signed out: the game-over card offers sign-in; Zen and daily runs don't post", async (t) => {
    const page = await t.open({ seed: "abc" });
    await fakeSupabase(page.context());
    await loseGame(page);
    const line = page.locator('[data-hud="over-online"]');
    if (t.target.name === "file") assert(/michaelsturrup\.com/.test(await line.textContent()), "explains where posting works");
    else await line.locator('[data-act="sign-in"]').waitFor();
    const daily = await t.open({ seed: null, query: "mode=daily" });
    await daily.click('[data-mode="daily"]');
    await daily.click('[data-title="play"]');
    await loseGame(daily);
    assert(await daily.locator('[data-hud="over-online"]').isHidden(), "no leaderboard line for the daily");
  }],
];
