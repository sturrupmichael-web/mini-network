/**
 * Fixed-timestep game loop. The simulation always advances in whole ticks
 * of 1 / tickRate game seconds; rendering happens once per animation frame
 * at whatever rate the screen runs. Speed (1×/2×) scales how much game time
 * passes per real second; pause stops it.
 *
 * `advance(realMs)` holds all the logic and is what tests drive directly.
 * `start()` just feeds it from requestAnimationFrame.
 */

/** Longest real gap we'll honour in one frame (a backgrounded tab returning). */
const MAX_FRAME_MS = 250;

export function createLoop({ tickRate, maxTicksPerFrame, onTick, onRender, raf, now }) {
  const tickMs = 1000 / tickRate;
  const requestFrame = raf ?? ((cb) => globalThis.requestAnimationFrame(cb));
  const clock = now ?? (() => globalThis.performance.now());

  const loop = {
    paused: false,
    speed: 1,
    accumulator: 0,
    ticks: 0,
    running: false,

    /** Feed `realMs` of real time; runs zero or more ticks, then renders. */
    advance(realMs) {
      const elapsed = Math.min(Math.max(realMs, 0), MAX_FRAME_MS);
      if (!loop.paused) loop.accumulator += elapsed * loop.speed;
      let ran = 0;
      while (loop.accumulator >= tickMs && ran < maxTicksPerFrame) {
        onTick();
        loop.accumulator -= tickMs;
        loop.ticks++;
        ran++;
      }
      // Too far behind: drop the backlog rather than fast-forwarding.
      if (loop.accumulator >= tickMs) loop.accumulator = 0;
      onRender?.(loop.accumulator / tickMs);
      return ran;
    },

    start() {
      if (loop.running) return;
      loop.running = true;
      let last = clock();
      const frame = () => {
        if (!loop.running) return;
        const t = clock();
        loop.advance(t - last);
        last = t;
        requestFrame(frame);
      };
      requestFrame(frame);
    },

    stop() {
      loop.running = false;
    },
  };
  return loop;
}
