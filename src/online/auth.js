/**
 * Google sign-in through Michael's Supabase project, the same way his other
 * games do it: no SDK, just the Supabase auth and REST endpoints.
 *
 *   signIn()  sends the page to Google (via Supabase), which comes back to
 *             this same page with the session in the URL hash.
 *   init()    picks that session out of the hash (call once at start).
 *   rest()    calls the REST API as the signed-in player, refreshing the
 *             session first when it is about to expire.
 *
 * The session is kept in storage under "auth". Everything takes its fetch,
 * location and storage from the caller so the tests can stand in for them.
 */
export const ONLINE = {
  url: "https://abeqdmurddrkrqbnfylb.supabase.co",
  key: "sb_publishable_8WUpbX-clRvdKgset72mkQ_C_NFL5E8",
  timeout: 8000,
};

/** Turn a token response (or the hash after sign-in) into a session, or null. */
export function parseSession(raw) {
  try {
    const access = String(raw.access_token);
    const payload = JSON.parse(atob(access.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.sub) return null;
    return {
      access_token: access,
      refresh_token: String(raw.refresh_token ?? ""),
      expires_at: Number(raw.expires_at) || payload.exp,
      user: { id: payload.sub, email: payload.email ?? "" },
    };
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {object} opts.storage     createStorage() instance
 * @param {typeof fetch} [opts.fetch]
 * @param {Location} [opts.location]
 * @param {History} [opts.history]
 * @param {object} [opts.config]    ONLINE by default
 */
export function createAuth({ storage, fetch: doFetch = globalThis.fetch?.bind(globalThis), location = globalThis.location, history = globalThis.history, config = ONLINE }) {
  let session = storage.get("auth", null);
  if (session && !session.user?.id) session = null;
  const listeners = new Set();

  function save(next) {
    session = next;
    if (next) storage.set("auth", next);
    else storage.remove("auth");
    for (const fn of listeners) fn(session?.user ?? null);
  }

  /** fetch with the API key, a timeout, and a parsed JSON body. Never throws. */
  async function call(url, init = {}) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), config.timeout);
    try {
      const res = await doFetch(url, {
        ...init,
        signal: abort.signal,
        headers: { apikey: config.key, "Content-Type": "application/json", ...init.headers },
      });
      const text = res.status === 204 ? "" : await res.text().catch(() => "");
      let body;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = undefined;
      }
      return { ok: res.ok, status: res.status, body };
    } catch {
      return { ok: false, status: 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  const here = () => location.origin + location.pathname;

  const auth = {
    lastError: "",
    get user() {
      return session?.user ?? null;
    },
    /**
     * Sign-in needs a real top-level page: Google refuses to show inside a
     * frame (like the claude.ai preview), and file:// can't be returned to.
     */
    get available() {
      try {
        return window.top === window && location.protocol !== "file:";
      } catch {
        return false;
      }
    },
    /** Call when the user changes (signed in, out, or the session lapsed). */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /**
     * Pick up a sign-in that just came back in the URL.
     * Returns "signed-in", "error", or null if there was nothing to pick up.
     */
    init() {
      const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
      if (!params.has("access_token") && !params.has("error")) return null;
      // Take the tokens out of the address bar (keep any ?seed=… etc).
      const keep = new URLSearchParams(location.search);
      for (const k of [...keep.keys()]) if (/^(error|error_code|error_description)$/.test(k)) keep.delete(k);
      const qs = keep.toString();
      history?.replaceState?.(null, "", here() + (qs ? `?${qs}` : ""));
      if (params.has("error")) {
        auth.lastError = (params.get("error_description") ?? params.get("error") ?? "").slice(0, 160);
        return "error";
      }
      const next = parseSession(Object.fromEntries(params));
      if (!next) {
        auth.lastError = "The sign-in came back in a form the game didn't understand.";
        return "error";
      }
      save(next);
      return "signed-in";
    },
    /** True if there's a session that's good for at least another minute. */
    async ensure() {
      if (!session) return false;
      if (session.expires_at - 60 > Date.now() / 1000) return true;
      const r = await call(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      const next = r.ok && r.body ? parseSession(r.body) : null;
      if (next) {
        save(next);
        return true;
      }
      // Offline: keep the session for later. Refused: it's gone, sign out.
      if (r.status !== 0) save(null);
      return false;
    },
    /** A REST call as the signed-in player (401 if not signed in). */
    async rest(path, init = {}) {
      if (!(await auth.ensure())) return { ok: false, status: 401 };
      return call(`${config.url}/rest/v1/${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${session.access_token}`, ...init.headers },
      });
    },
    /** A REST call that doesn't need anyone signed in (uses the session if there is one). */
    async publicRest(path, init = {}) {
      if (session && (await auth.ensure())) return auth.rest(path, init);
      return call(`${config.url}/rest/v1/${path}`, init);
    },
    signIn() {
      location.assign(`${config.url}/auth/v1/authorize?${new URLSearchParams({ provider: "google", redirect_to: here() })}`);
    },
    signOut() {
      if (session) {
        call(`${config.url}/auth/v1/logout`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
      }
      save(null);
    },
  };
  return auth;
}
