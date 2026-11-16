import assert from "node:assert/strict";
import { createAuth, parseSession } from "../src/online/auth.js";
import { cleanName, createLeaderboard } from "../src/online/leaderboard.js";
import { createStorage } from "../src/storage.js";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export const fakeJwt = (sub, exp = Math.floor(Date.now() / 1000) + 3600) => `${b64({ alg: "none" })}.${b64({ sub, exp, email: "p@example.com" })}.sig`;

function memoryBackend() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

/** A pretend Supabase: answers by "METHOD path" with handler(body, headers). */
function fakeServer(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method ?? "GET"} ${u.pathname.replace(/^\/(rest|auth)\/v1\//, "")}`;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ key, url, body, headers: init.headers });
    const handler = routes[key];
    const [status, out] = handler ? handler(body, init.headers, u) : [404, { message: "Not found." }];
    return { ok: status < 300, status, text: async () => (out === undefined ? "" : JSON.stringify(out)) };
  };
  return { fetch, calls };
}

function fakeLocation(hash = "", search = "") {
  return { origin: "https://michaelsturrup.com", pathname: "/mini-network/", hash, search, protocol: "https:", assigned: null, assign(u) { this.assigned = u; } };
}

function setup({ routes = {}, hash = "", session = null } = {}) {
  const storage = createStorage(memoryBackend());
  if (session) storage.set("auth", session);
  const server = fakeServer(routes);
  const location = fakeLocation(hash);
  const replaced = [];
  const history = { replaceState: (_s, _t, url) => replaced.push(url) };
  const auth = createAuth({ storage, fetch: server.fetch, location, history });
  const lb = createLeaderboard({ auth, storage });
  return { storage, server, location, replaced, auth, lb };
}

const signedIn = (id = "u1") => parseSession({ access_token: fakeJwt(id), refresh_token: "r1" });

export const tests = [
  ["sign-in goes to Supabase's Google page and comes back to this page", () => {
    const { auth, location } = setup();
    auth.signIn();
    const u = new URL(location.assigned);
    assert.equal(u.origin + u.pathname, "https://abeqdmurddrkrqbnfylb.supabase.co/auth/v1/authorize");
    assert.equal(u.searchParams.get("provider"), "google");
    assert.equal(u.searchParams.get("redirect_to"), "https://michaelsturrup.com/mini-network/");
  }],
  ["the session in the URL hash is kept and the address bar cleaned", () => {
    const token = fakeJwt("user-123");
    const { auth, replaced, storage } = setup({ hash: `#access_token=${token}&refresh_token=abc&expires_in=3600` });
    assert.equal(auth.init(), "signed-in");
    assert.equal(auth.user.id, "user-123");
    assert.deepEqual(replaced, ["https://michaelsturrup.com/mini-network/"]);
    assert.equal(storage.get("auth").refresh_token, "abc");
  }],
  ["a refused sign-in reports the reason", () => {
    const { auth } = setup({ hash: "#error=access_denied&error_description=User+cancelled" });
    assert.equal(auth.init(), "error");
    assert.equal(auth.lastError, "User cancelled");
    assert.equal(auth.user, null);
  }],
  ["no hash, nothing to pick up", () => {
    assert.equal(setup().auth.init(), null);
  }],
  ["an expired session is refreshed before a call", async () => {
    const old = { ...signedIn(), expires_at: 10 };
    const fresh = fakeJwt("u1");
    const { auth, server } = setup({
      session: old,
      routes: {
        "POST token": () => [200, { access_token: fresh, refresh_token: "r2" }],
        "GET players": () => [200, [{ name: "Sam" }]],
      },
    });
    const r = await auth.rest("players?select=name");
    assert.equal(r.ok, true);
    assert.equal(server.calls[0].key, "POST token");
    assert.equal(server.calls[1].headers.Authorization, `Bearer ${fresh}`);
  }],
  ["a refresh the server refuses signs the player out", async () => {
    const { auth } = setup({ session: { ...signedIn(), expires_at: 10 }, routes: { "POST token": () => [400, { message: "Invalid Refresh Token." }] } });
    assert.equal(await auth.ensure(), false);
    assert.equal(auth.user, null);
  }],
  ["the leaderboard can be read without signing in", async () => {
    const { lb, server } = setup({
      routes: { "POST rpc/nn_leaderboard": (b) => [200, [{ rank: 1, name: "Ada", score: 900, days: 21.5, map: b.p_map }]] },
    });
    const rows = await lb.board("campus");
    assert.deepEqual(rows, [{ rank: 1, name: "Ada", score: 900, days: 21.5 }]);
    assert.deepEqual(server.calls[0].body, { p_map: "campus", p_limit: 20 });
    assert.equal(server.calls[0].headers.Authorization, undefined);
  }],
  ["an unreachable leaderboard gives a friendly error", async () => {
    const storage = createStorage(memoryBackend());
    const auth = createAuth({ storage, fetch: async () => { throw new Error("offline"); }, location: fakeLocation(), history: null });
    const r = await createLeaderboard({ auth, storage }).board("campus");
    assert.match(r.error, /Couldn't reach/);
  }],
  ["posting a run sends only the run; rank comes back", async () => {
    const { lb, server } = setup({
      session: signedIn(),
      routes: {
        "POST nn_scores": () => [201, undefined],
        "POST rpc/nn_my_best": () => [200, { score: 640, days: 12.3, rank: 4 }],
      },
    });
    const r = await lb.submit({ map: "campus", mapName: "Campus", score: 512.4, days: 9.26, seed: "abc" });
    assert.deepEqual(r, { ok: true, rank: 4, best: 640 });
    assert.deepEqual(server.calls[0].body, { map: "campus", score: 512, days: 9.3, seed: "abc" });
  }],
  ["posting without a name says so", async () => {
    const { lb } = setup({
      session: signedIn(),
      routes: { "POST nn_scores": () => [400, { message: "Pick a leaderboard name first." }] },
    });
    const r = await lb.submit({ map: "campus", score: 5, days: 1, seed: "x" });
    assert.equal(r.needsName, true);
    assert.equal(r.error, "Pick a leaderboard name first.");
  }],
  ["posting signed out does nothing", async () => {
    const { lb, server } = setup();
    assert.match((await lb.submit({ map: "campus", score: 5, days: 1, seed: "x" })).error, /Sign in/);
    assert.equal(server.calls.length, 0);
  }],
  ["picking a name claims it; changing it updates it", async () => {
    let stored = null;
    const { lb, server } = setup({
      session: signedIn("u9"),
      routes: {
        "GET players": () => [200, stored ? [{ name: stored }] : []],
        "POST players": (b) => ((stored = b.name), [201, [{ name: b.name }]]),
        "PATCH players": (b) => ((stored = b.name), [200, [{ name: b.name }]]),
      },
    });
    assert.equal(await lb.name(), "");
    assert.deepEqual(await lb.setName("  Net   Ninja  "), { ok: true });
    assert.deepEqual(server.calls.at(-1).body, { user_id: "u9", name: "Net Ninja" });
    assert.deepEqual(await lb.setName("Packet Pro"), { ok: true });
    assert.equal(server.calls.at(-1).key, "PATCH players");
    assert.equal(lb.cachedName, "Packet Pro");
  }],
  ["names are trimmed to 16 characters with no control characters", () => {
    assert.equal(cleanName("  a\u0007b  c "), "ab c");
    assert.equal(cleanName("x".repeat(30)).length, 16);
    assert.equal(cleanName("   "), "");
  }],
  ["a run waiting for sign-in is kept in storage", () => {
    const { lb } = setup();
    lb.pending = { map: "campus", score: 10, days: 2, seed: "s" };
    assert.equal(lb.pending.score, 10);
    lb.pending = null;
    assert.equal(lb.pending, null);
  }],
];
