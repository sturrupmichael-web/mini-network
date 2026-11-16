/**
 * The online parts of the UI: the account line on the title screen, the
 * leaderboard card (one board per map), the pick-a-name card, and the
 * line on the game-over card that says where the run placed.
 * DOM only; talks to the leaderboard through the object it's given.
 */
import { NAME_MAX } from "../online/leaderboard.js";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const dayText = (days) => {
  const d = Math.floor(days);
  return `${d} day${d === 1 ? "" : "s"}`;
};

/**
 * @param {HTMLElement} root      Where the leaderboard and name cards go.
 * @param {object} opts
 * @param {object} opts.auth
 * @param {object} opts.leaderboard
 * @param {object[]} opts.maps    MAPS
 * @param {HTMLElement} opts.accountSlot  The title screen's account line.
 * @param {HTMLElement} opts.overSlot     The game-over card's leaderboard line.
 * @param {() => string} opts.currentMapId  The map to open the leaderboard on.
 * @param {(open: boolean) => void} [opts.onCardChange]  A card opened or closed.
 */
export function createOnlineUi(root, opts) {
  const { auth, leaderboard, maps, accountSlot, overSlot, currentMapId, onCardChange = () => {} } = opts;
  let boardMap = maps[0].id;
  let boardRequest = 0;
  let afterName = null; // what to do once a name is picked
  let lastRun = null; // { map, mapName, score, days, seed } for the game-over line
  let returnFocus = null;

  root.innerHTML = `
    <div class="overlay board-overlay" data-online="board" hidden>
      <div class="card board-card" role="dialog" aria-modal="true" aria-labelledby="board-heading">
        <p class="card-kicker">Leaderboard · Classic</p>
        <h2 id="board-heading" data-online="board-title"></h2>
        <div class="segmented small board-maps" role="radiogroup" aria-label="Map">
          ${maps.map((m) => `<button type="button" role="radio" data-board-map="${esc(m.id)}" aria-checked="false">${esc(m.name)}</button>`).join("")}
        </div>
        <ol class="board-list" data-online="board-list" aria-live="polite"></ol>
        <p class="board-mine" data-online="board-mine"></p>
        <div class="board-account" data-online="board-account"></div>
        <button type="button" class="primary-btn" data-online="board-close">Done</button>
      </div>
    </div>
    <div class="overlay" data-online="name" hidden>
      <form class="card name-card" role="dialog" aria-modal="true" aria-labelledby="name-heading" data-online="name-form">
        <h2 id="name-heading">Pick a leaderboard name</h2>
        <p class="card-text">It shows next to your scores, and it's the same name you use in Michael's other games.</p>
        <input class="name-input" data-online="name-input" maxlength="${NAME_MAX}" autocomplete="nickname" aria-label="Leaderboard name" required />
        <p class="name-error" data-online="name-error" role="alert"></p>
        <div class="card-actions">
          <button type="submit" class="primary-btn" data-online="name-save">Save</button>
          <button type="button" class="secondary-btn" data-online="name-cancel">Not now</button>
        </div>
      </form>
    </div>
  `;
  const q = (name) => root.querySelector(`[data-online="${name}"]`);
  const el = {
    board: q("board"),
    boardTitle: q("board-title"),
    boardList: q("board-list"),
    boardMine: q("board-mine"),
    boardAccount: q("board-account"),
    boardClose: q("board-close"),
    name: q("name"),
    nameForm: q("name-form"),
    nameInput: q("name-input"),
    nameError: q("name-error"),
    nameSave: q("name-save"),
    nameCancel: q("name-cancel"),
  };
  const mapBtns = [...root.querySelectorAll("[data-board-map]")];
  const mapName = (id) => maps.find((m) => m.id === id)?.name ?? id;

  // ---- Account line (title screen and leaderboard card) ----

  /** "Sign in with Google" or "Playing as Sam · Change name · Sign out". */
  function accountHtml() {
    if (!auth.available) {
      return `<p class="account-text">Sign in on michaelsturrup.com to post scores.</p>`;
    }
    if (!auth.user) {
      return `<button type="button" class="secondary-btn google-btn" data-act="sign-in">${GOOGLE_ICON}Sign in with Google</button>
        <p class="account-text">to post your Classic runs to the leaderboards</p>`;
    }
    const name = leaderboard.cachedName;
    const who = name ? `Playing as <strong>${esc(name)}</strong>` : name === "" ? "Signed in, no name yet" : "Signed in";
    return `<p class="account-text">${who}</p>
      <p class="account-links">
        <button type="button" class="text-btn" data-act="name">${name ? "Change name" : "Pick a name"}</button>
        <button type="button" class="text-btn" data-act="sign-out">Sign out</button>
      </p>`;
  }

  function renderAccount() {
    accountSlot.innerHTML = accountHtml();
    el.boardAccount.innerHTML = accountHtml();
  }

  function onAccountClick(e) {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "sign-in") ui.signIn();
    else if (act === "sign-out") {
      auth.signOut();
      renderAccount();
      if (!el.board.hidden) loadBoard();
    } else if (act === "name") openName();
  }
  accountSlot.addEventListener("click", onAccountClick);
  el.boardAccount.addEventListener("click", onAccountClick);

  // ---- Leaderboard card ----

  async function loadBoard() {
    const id = boardMap;
    const req = ++boardRequest;
    el.boardTitle.textContent = mapName(id);
    for (const b of mapBtns) b.setAttribute("aria-checked", String(b.dataset.boardMap === id));
    el.boardList.innerHTML = `<li class="board-empty">Loading…</li>`;
    el.boardMine.textContent = "";
    const [rows, mine] = await Promise.all([leaderboard.board(id), leaderboard.myBest(id)]);
    if (req !== boardRequest) return; // a newer map was picked meanwhile
    const myName = leaderboard.cachedName;
    if (rows.error) {
      el.boardList.innerHTML = `<li class="board-empty">${esc(rows.error)}</li>`;
    } else if (rows.length === 0) {
      el.boardList.innerHTML = `<li class="board-empty">No scores yet. Be the first!</li>`;
    } else {
      el.boardList.innerHTML = rows
        .map(
          (r) => `<li class="board-row${myName && r.name === myName ? " is-me" : ""}">
            <span class="board-rank">${r.rank}</span>
            <span class="board-name">${esc(r.name)}</span>
            <span class="board-score">${r.score}</span>
            <span class="board-days">${dayText(r.days)}</span></li>`,
        )
        .join("");
    }
    el.boardMine.textContent = mine ? `Your best: ${mine.score}, ${ordinal(mine.rank)} place` : "";
  }

  for (const b of mapBtns) {
    b.addEventListener("click", () => {
      boardMap = b.dataset.boardMap;
      loadBoard();
    });
  }
  el.boardClose.addEventListener("click", () => ui.closeBoard());
  el.board.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      ui.closeBoard();
    }
  });

  // ---- Name card ----

  function openName(then = null) {
    afterName = then;
    el.nameInput.value = leaderboard.cachedName ?? "";
    el.nameError.textContent = "";
    el.name.hidden = false;
    onCardChange(true);
    el.nameInput.focus();
  }
  function closeName() {
    el.name.hidden = true;
    afterName = null;
    if (el.board.hidden) onCardChange(false);
  }
  el.nameForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    el.nameSave.disabled = true;
    el.nameError.textContent = "";
    const r = await leaderboard.setName(el.nameInput.value);
    el.nameSave.disabled = false;
    if (r.error) {
      el.nameError.textContent = r.error;
      return;
    }
    const then = afterName;
    closeName();
    renderAccount();
    if (!el.board.hidden) loadBoard();
    then?.();
  });
  el.nameCancel.addEventListener("click", closeName);
  el.name.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeName();
    }
  });

  // ---- Game-over line ----

  function overLine(html) {
    overSlot.innerHTML = html;
    overSlot.hidden = !html;
  }

  async function post(run) {
    overLine(`<p class="over-online-text">Posting to the ${esc(run.mapName)} leaderboard…</p>`);
    // No name yet: ask for one first rather than have the post refused.
    const name = await leaderboard.name();
    const r = name === "" ? { needsName: true } : await leaderboard.submit(run);
    if (lastRun !== run) return; // a new game started meanwhile
    if (r.ok) {
      leaderboard.pending = null;
      const placed = r.rank ? `${ordinal(r.rank)} on ${esc(run.mapName)}` : `Posted to ${esc(run.mapName)}`;
      const note = r.best > run.score ? ` <span class="over-online-note">(your best there is ${r.best})</span>` : "";
      overLine(`<p class="over-online-text"><strong>${placed}</strong>${note}</p>
        <button type="button" class="link-btn" data-act="board">See leaderboard</button>`);
    } else if (r.needsName) {
      leaderboard.pending = run;
      overLine(`<button type="button" class="secondary-btn" data-act="name">Pick a name to post this score</button>`);
    } else {
      overLine(`<p class="over-online-text">${esc(r.error)}</p>
        <button type="button" class="link-btn" data-act="retry">Try again</button>`);
    }
  }

  overSlot.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "sign-in") {
      leaderboard.pending = lastRun;
      ui.signIn();
    } else if (act === "board") ui.openBoard(lastRun?.map);
    else if (act === "retry" && lastRun) post(lastRun);
    else if (act === "name" && lastRun) {
      const run = lastRun;
      openName(() => post(run));
    }
  });

  const ui = {
    /** Send the player to Google; the page comes back here afterwards. */
    signIn() {
      if (auth.available) auth.signIn();
    },
    /** Refresh the account line (looks up the name in the background). */
    async refresh() {
      renderAccount();
      if (auth.user && leaderboard.cachedName === null) {
        await leaderboard.name();
        renderAccount();
      }
    },
    /**
     * After coming back from Google: ask for a name if there isn't one,
     * then post the run that was waiting, if any.
     */
    async afterSignIn() {
      const name = await leaderboard.name();
      renderAccount();
      const pending = leaderboard.pending;
      const postPending = async () => {
        if (!pending) return;
        const r = await leaderboard.submit(pending);
        if (r.ok) {
          leaderboard.pending = null;
          ui.openBoard(pending.map);
        }
      };
      if (name === "") openName(postPending);
      else if (name) await postPending();
    },
    openBoard(mapId = currentMapId()) {
      returnFocus = document.activeElement;
      boardMap = maps.some((m) => m.id === mapId) ? mapId : maps[0].id;
      el.board.hidden = false;
      onCardChange(true);
      renderAccount();
      loadBoard();
      el.boardClose.focus();
    },
    closeBoard() {
      el.board.hidden = true;
      boardRequest++;
      if (el.name.hidden) onCardChange(false);
      if (returnFocus?.isConnected) returnFocus.focus();
    },
    get open() {
      return !el.board.hidden || !el.name.hidden;
    },
    /**
     * A run ended. `run` is { map, mapName, score, days, seed } for a
     * Classic run, or null for runs that don't go on the boards.
     */
    runEnded(run) {
      lastRun = run;
      if (!run) return overLine("");
      if (auth.user) return post(run);
      if (!auth.available) return overLine(`<p class="over-online-text">Play on michaelsturrup.com to post scores online.</p>`);
      overLine(`<button type="button" class="secondary-btn google-btn" data-act="sign-in">${GOOGLE_ICON}Sign in to post this score</button>
        <button type="button" class="link-btn" data-act="board">See leaderboard</button>`);
    },
  };
  renderAccount();
  return ui;
}

/** A plain one-colour "G" mark: UI chrome stays neutral (style guide). */
const GOOGLE_ICON = `<svg class="google-mark" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M16.2 8.6H10.4M16.4 10a6.4 6.4 0 1 1-1.9-4.6"/></svg>`;
