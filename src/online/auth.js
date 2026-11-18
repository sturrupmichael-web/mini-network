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
 * The session lives in localStorage under SITE_KEY, the one Google sign-in
 * shared by every game on michaelsturrup.com (and the main page's "Sign in
 * with Google" button), so signing in anywhere on the site signs in here too.
 * It is read fresh before each use because another page may have refreshed it
 * (Supabase hands out a new refresh token each time and the old one stops
 * working). See docs/site-sign-in.md in the sturrupmichael-web.github.io repo.
 *
 * Everything takes its fetch, location and storage from the caller so the
 * tests can stand in for them.
 */
export const SITE_KEY = "michaelsturrup.auth.v1";
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
      user: { id: payload.sub, email: payload.email ?? "", guest: false },
    };
  } catch {
    return null;
  }
}

function defaultSite() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The shared session slot. Falls back to memory when storage is blocked, so
 * sign-in still lasts for this page.
 */
function siteSlot(backend) {
  let memory = null;
  const valid = (s) => (s && s.user?.id && s.access_token && !s.user.guest ? s : null);
  return {
    get() {
      try {
        const raw = backend?.getItem(SITE_KEY);
        if (raw !== null && raw !== undefined) return valid(JSON.parse(raw));
        if (backend) return null;
      } catch {
        // Unreadable or blocked: use memory.
      }
      return memory;
    },
    set(s) {
      memory = s;
      try {
        if (!backend) return;
        if (s) backend.setItem(SITE_KEY, JSON.stringify(s));
        else backend.removeItem(SITE_KEY);
      } catch {
        // Blocked: memory only.
      }
    },
  };
}

/**
 * @param {object} opts
 * @param {object} opts.storage     createStorage() instance (the game's own saves)
 * @param {Storage} [opts.site]     where the shared session lives; localStorage by default
 * @param {typeof fetch} [opts.fetch]
 * @param {Location} [opts.location]
 * @param {History} [opts.history]
 * @param {object} [opts.config]    ONLINE by default
 */
export function createAuth({ storage, site = defaultSite(), fetch: doFetch = globalThis.fetch?.bind(globalThis), location = globalThis.location, history = globalThis.history, config = ONLINE }) {
  const slot = siteSlot(site);
  const listeners = new Set();
  const current = () => slot.get();

  // Before the site-wide sign-in the game kept its own copy under "auth".
  // Move it into the shared slot unless someone is already signed in there.
  const own = storage.get("auth", null);
  if (own) {
    if (!current() && own.user?.id) slot.set({ ...own, user: { ...own.user, guest: false } });
    storage.remove("auth");
  }

  let lastId = current()?.user?.id ?? null;
  function announce() {
    const user = current()?.user ?? null;
    if ((user?.id ?? null) === lastId) return;
    lastId = user?.id ?? null;
    for (const fn of listeners) fn(user);
  }

  function save(next) {
    slot.set(next);
    announce();
  }

  // Signed in or out on another page of the site (another tab): follow along.
  if (site && site === defaultSite()) {
    globalThis.addEventListener?.("storage", (e) => {
      if (e.key === SITE_KEY || e.key === null) announce();
    });
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
      return current()?.user ?? null;
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
      const session = current();
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
      // Offline: keep the session for later.
      if (r.status === 0) return false;
      // Refused. Another page may have refreshed it a moment ago: use theirs.
      const now = current();
      if (now && now.refresh_token !== session.refresh_token) return now.expires_at - 60 > Date.now() / 1000;
      save(null);
      return false;
    },
    /** A REST call as the signed-in player (401 if not signed in). */
    async rest(path, init = {}) {
      if (!(await auth.ensure())) return { ok: false, status: 401 };
      return call(`${config.url}/rest/v1/${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${current().access_token}`, ...init.headers },
      });
    },
    /** A REST call that doesn't need anyone signed in (uses the session if there is one). */
    async publicRest(path, init = {}) {
      if (current() && (await auth.ensure())) return auth.rest(path, init);
      return call(`${config.url}/rest/v1/${path}`, init);
    },
    signIn() {
      location.assign(`${config.url}/auth/v1/authorize?${new URLSearchParams({ provider: "google", redirect_to: here() })}`);
    },
    /** Signs out everywhere on the site: the session is shared. */
    signOut() {
      const session = current();
      if (session) {
        call(`${config.url}/auth/v1/logout`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
      }
      save(null);
    },
  };
  return auth;
}
