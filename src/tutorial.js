/**
 * The first-game tutorial: three short prompts, each cleared by doing it.
 * Pure logic; the HUD shows the text (hud.coach) and game.js feeds in what
 * happened. Once finished or skipped, storage remembers ("tutorialDone")
 * and it never shows again.
 */
export const TUTORIAL_STEPS = [
  {
    id: "link",
    text: "Drag from HQ to a site to link them.",
    done: (s) => s.links >= 1,
  },
  {
    id: "around",
    text: "Water, parks and hills block links. Link the next site, steering around them.",
    done: (s) => s.links >= 2,
  },
  {
    id: "gear",
    text: "Drag gear from the tray onto a link or site to boost it.",
    done: (s) => s.placed >= 1,
  },
];

/**
 * @param {object} storage  createStorage() instance.
 * @param {boolean} active  Whether this game should show it at all.
 */
export function createTutorial(storage, active) {
  let step = active && !storage.get("tutorialDone", false) ? 0 : -1;
  const stats = { links: 0, placed: 0 };

  function finish() {
    step = -1;
    storage.set("tutorialDone", true);
  }

  return {
    /** The prompt to show now, or null. */
    get text() {
      return step >= 0 ? TUTORIAL_STEPS[step].text : null;
    },
    get stepId() {
      return step >= 0 ? TUTORIAL_STEPS[step].id : null;
    },
    get active() {
      return step >= 0;
    },
    /** Update with the current link count; moves on when a step is done. */
    update({ links }) {
      if (step < 0) return;
      stats.links = links;
      while (step >= 0 && TUTORIAL_STEPS[step].done(stats)) {
        step++;
        if (step >= TUTORIAL_STEPS.length) finish();
      }
    },
    /** A tray item was used successfully. */
    placed() {
      stats.placed++;
    },
    skip: finish,
  };
}
