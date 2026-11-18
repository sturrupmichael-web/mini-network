// Live counts for michaelsturrup.com: while this page is open it counts as one person
// playing this game (Realtime presence channel "site:presence"), and it adds one visit
// to the site's visit counter once per tab session. The home page and /stats/ read both.
// No library, no cookies. See docs/live-counts.md in sturrupmichael-web.github.io.
// Best effort: if Supabase can't be reached nothing happens and the game is unaffected.

const SB_URL = 'https://abeqdmurddrkrqbnfylb.supabase.co';
const SB_KEY = 'sb_publishable_8WUpbX-clRvdKgset72mkQ_C_NFL5E8';
const TOPIC = 'realtime:site:presence';

/** @param {string} game the game's slug in the site's games.json */
export function joinSiteLive(game) {
  try {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    // Only on the real site: local dev and the test suites stay offline.
    if (!/(^|\.)michaelsturrup\.com$/.test(location.hostname)) return;
    recordVisit(game);
    track(game);
  } catch {
    /* never break the game */
  }
}

function recordVisit(game) {
  try {
    const k = `michaelsturrup.visit.${game}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, '1');
  } catch {
    /* storage blocked: still count */
  }
  fetch(`${SB_URL}/rest/v1/rpc/record_visit`, {
    method: 'POST',
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_page: game }),
    keepalive: true,
  }).catch(() => {});
}

function track(game) {
  const key = Math.random().toString(36).slice(2, 12);
  let ws = null;
  let ref = 0;
  let joinRef = null;
  let beat = null;
  let retry = 0;
  const send = (topic, event, payload, jr) => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic, event, payload, ref: String(++ref), join_ref: jr }));
  };
  const connect = () => {
    if (ws) return;
    ws = new WebSocket(`${SB_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${SB_KEY}&vsn=1.0.0`);
    ws.onopen = () => {
      retry = 0;
      joinRef = String(++ref);
      send(TOPIC, 'phx_join', { config: { broadcast: { ack: false, self: false }, presence: { key, enabled: true }, postgres_changes: [], private: false }, access_token: SB_KEY }, joinRef);
      beat = setInterval(() => send('phoenix', 'heartbeat', {}, null), 25000);
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.topic === TOPIC && m.event === 'phx_reply' && m.ref === joinRef && m.payload && m.payload.status === 'ok') {
          send(TOPIC, 'presence', { type: 'presence', event: 'track', payload: { g: game, r: 'play' } }, joinRef);
        }
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      clearInterval(beat);
      ws = null;
      if (document.visibilityState === 'hidden') return;
      setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    };
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') connect();
  });
  connect();
}
