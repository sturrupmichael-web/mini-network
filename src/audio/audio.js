/**
 * Generative audio with the Web Audio API: a soft ambient pad, and a
 * gentle note for each delivered packet, snapped to a beat so a busy
 * network turns into a calm rhythm. Settings live in data/audio.js.
 *
 * The audio context can only start after a user gesture, so call
 * `unlock()` from a click/tap. Everything is wrapped so a browser without
 * Web Audio just stays silent.
 */

/** Frequency of a scale step: root × 2^(semitones / 12), wrapping up octaves. */
export function stepFrequency(settings, step) {
  const { root, scale } = settings.notes;
  const octave = Math.floor(step / scale.length);
  const semis = scale[((step % scale.length) + scale.length) % scale.length] + 12 * octave;
  return root * 2 ** (semis / 12);
}

/**
 * Note scheduler: given the current time, returns the time to play a
 * note at (the next beat with room), or null if this beat is full.
 * Pure, so it can be tested without audio.
 */
export function createBeatQueue({ beat, maxPerBeat }) {
  const counts = new Map();
  return {
    slot(now) {
      const first = Math.ceil(now / beat);
      for (let b = first; b < first + 2; b++) {
        const n = counts.get(b) ?? 0;
        if (n < maxPerBeat) {
          counts.set(b, n + 1);
          // Forget old beats.
          for (const k of counts.keys()) if (k < first - 4) counts.delete(k);
          return b * beat;
        }
      }
      return null;
    },
  };
}

export function createAudio(settings, { muted = false } = {}) {
  let ctx = null;
  let master = null;
  let ambient = null;
  let isMuted = muted;
  const queue = createBeatQueue(settings.notes);

  function ensure() {
    if (ctx) return true;
    try {
      const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Ctx) return false;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = isMuted ? 0 : settings.masterVolume;
      master.connect(ctx.destination);
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function startAmbient() {
    if (!ctx || ambient) return;
    const a = settings.ambient;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    const oscs = [-a.detune, a.detune].map((cents) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = a.root;
      o.detune.value = cents;
      o.connect(filter);
      o.start();
      return o;
    });
    // A very slow swell.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / a.swell;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = a.volume * 0.5;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(a.volume, ctx.currentTime + 3);
    filter.connect(gain).connect(master);
    ambient = { oscs, lfo, gain };
  }

  function tone(freq, volume, decay, when = ctx.currentTime, type = "sine") {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(volume, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    o.connect(g).connect(master);
    o.start(when);
    o.stop(when + decay + 0.05);
  }

  const ready = () => ctx && ctx.state === "running" && !isMuted;

  return {
    /** Call from a user gesture: creates/resumes the context and starts the pad. */
    unlock() {
      if (!ensure()) return;
      try {
        if (ctx.state === "suspended") ctx.resume();
        startAmbient();
      } catch {
        // Ignore: stay silent.
      }
    },
    get muted() {
      return isMuted;
    },
    setMuted(m) {
      isMuted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : settings.masterVolume, ctx.currentTime, 0.05);
    },
    /** A delivered packet of this traffic type. */
    delivered(trafficId) {
      if (!ready()) return;
      const when = queue.slot(ctx.currentTime + 0.02);
      if (when === null) return;
      const step = settings.trafficSteps[trafficId] ?? 0;
      const n = settings.notes;
      tone(stepFrequency(settings, step), n.volume, n.decay, when, "triangle");
    },
    /** A named cue from settings.cues ("event", "drop", "outage", "reward"). */
    cue(name) {
      if (!ready()) return;
      const c = settings.cues[name];
      if (c) tone(c.freq, c.volume, c.decay);
    },
  };
}
