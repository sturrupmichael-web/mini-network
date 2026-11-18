/**
 * The online leaderboards: one per map, Classic mode only (Zen has no
 * outages and the daily is the same map for everyone that day).
 *
 * Players pick a name once in the shared `players` table, the same one
 * Michael's other games use, so their name follows them between games.
 * Scores go into `nn_scores`; the database fills in who posted and their
 * name. See supabase/migrations/ for the tables and functions.
 */
export const NAME_MAX = 16;

/** Trim and squash spaces; returns "" if nothing usable is left. */
export function cleanName(raw) {
  return String(raw ?? "")
    .replace(/\p{Cc}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

/** The database's error message ("Pick a leaderboard name first.") or a fallback. */
function reason(r, fallback) {
  if (r.status === 0) return "Couldn't reach the leaderboard. Check your connection.";
  const msg = typeof r.body?.message === "string" ? r.body.message : "";
  return /^[A-Z][^<>]{0,120}\.$/.test(msg) ? msg : fallback;
}

/**
 * @param {object} opts
 * @param {object} opts.auth     createAuth() instance
 * @param {object} opts.storage  createStorage() instance (holds a score waiting to post)
 */
export function createLeaderboard({ auth, storage }) {
  let name = null; // null: not looked up yet; "": signed in without a name
  let nameFor = null;

  auth.onChange(() => {
    name = null;
    nameFor = null;
  });

  const lb = {
    /** Top runs on a map: [{ rank, name, score, days }] or { error }. */
    async board(mapId, limit = 20) {
      const r = await auth.publicRest("rpc/nn_leaderboard", {
        method: "POST",
        body: JSON.stringify({ p_map: mapId, p_limit: limit }),
      });
      if (!r.ok || !Array.isArray(r.body)) return { error: reason(r, "The leaderboard isn't available right now.") };
      return r.body.map((row) => ({
        rank: Number(row.rank),
        name: String(row.name ?? ""),
        score: Number(row.score),
        days: Number(row.days),
      }));
    },
    /** The signed-in player's best on a map: { score, days, rank } or null. */
    async myBest(mapId) {
      if (!auth.user) return null;
      const r = await auth.rest("rpc/nn_my_best", { method: "POST", body: JSON.stringify({ p_map: mapId }) });
      if (!r.ok || !r.body || typeof r.body !== "object") return null;
      return { score: Number(r.body.score), days: Number(r.body.days), rank: Number(r.body.rank) };
    },
    /** The signed-in player's leaderboard name ("" if they haven't picked one), or null if unknown. */
    async name() {
      const user = auth.user;
      if (!user) return null;
      if (name !== null && nameFor === user.id) return name;
      const r = await auth.rest(`players?select=name&user_id=eq.${encodeURIComponent(user.id)}`);
      if (!r.ok || !Array.isArray(r.body)) return null;
      name = r.body[0]?.name ?? "";
      nameFor = user.id;
      return name;
    },
    /** The name we last looked up, without asking the server. */
    get cachedName() {
      return auth.user && nameFor === auth.user.id ? name : null;
    },
    /** Pick or change the leaderboard name. Returns { ok } or { error }. */
    async setName(raw) {
      const user = auth.user;
      if (!user) return { error: "Sign in first." };
      const next = cleanName(raw);
      if (!next) return { error: "Type a name first." };
      const current = await lb.name();
      const r = current
        ? await auth.rest(`players?user_id=eq.${encodeURIComponent(user.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ name: next }),
            headers: { Prefer: "return=representation" },
          })
        : await auth.rest("players", {
            method: "POST",
            body: JSON.stringify({ user_id: user.id, name: next }),
            headers: { Prefer: "return=representation" },
          });
      if (!r.ok) return { error: reason(r, "That name didn't save. Try another.") };
      if (Array.isArray(r.body) && r.body.length === 0) return { error: "This account can't change its name." };
      name = next;
      nameFor = user.id;
      return { ok: true };
    },
    /**
     * Post a finished run: { map, score, days, seed }. Returns
     * { ok, rank, best } (rank and best on that map) or { error, needsName }.
     */
    async submit(run) {
      if (!auth.user) return { error: "Sign in to post your score." };
      const r = await auth.rest("nn_scores", {
        method: "POST",
        body: JSON.stringify({
          map: run.map,
          score: Math.max(0, Math.round(run.score)),
          days: Math.round(run.days * 10) / 10,
          seed: String(run.seed).slice(0, 40),
        }),
        headers: { Prefer: "return=minimal" },
      });
      if (!r.ok) {
        const error = reason(r, "Your score didn't post. Try again later.");
        return { error, needsName: /name first/i.test(error) };
      }
      const best = await lb.myBest(run.map);
      return { ok: true, rank: best?.rank ?? null, best: best?.score ?? run.score };
    },
    /** A run kept while the player goes off to sign in (or picks a name), so it can post after. */
    get pending() {
      const p = storage.get("pendingScore", null);
      return p && typeof p.map === "string" && Number.isFinite(p.score) ? p : null;
    },
    set pending(run) {
      if (run) storage.set("pendingScore", run);
      else storage.remove("pendingScore");
    },
  };
  return lb;
}
