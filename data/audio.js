/**
 * Generative audio settings. All sound is made live with the Web Audio
 * API; there are no sound files.
 *
 *   masterVolume   Overall level, 0–1.
 *   ambient        The soft background pad: two slightly detuned tones that
 *                  slowly swell. { volume, root (Hz), detune (cents), swell (seconds) }
 *   notes          Delivery notes. Each traffic type plays one step of the
 *                  scale (scaleSteps), so the network builds a calm tune.
 *     root         Frequency (Hz) of scale step 0.
 *     scale        Semitone offsets of the scale (a major pentatonic).
 *     beat         Notes snap to this grid (seconds), so bursts become a rhythm.
 *     maxPerBeat   At most this many notes per beat; extras are skipped.
 *     volume       Level of one note.
 *     decay        Seconds for a note to fade out.
 *   trafficSteps   Scale step per traffic type id (missing types use 0).
 *   cues           Short sounds for moments: { freq (Hz), volume, decay }.
 */
export const AUDIO = {
  masterVolume: 0.7,
  ambient: { volume: 0.05, root: 110, detune: 7, swell: 9 },
  notes: {
    root: 330,
    scale: [0, 2, 4, 7, 9, 12, 14, 16],
    beat: 0.18,
    maxPerBeat: 2,
    volume: 0.08,
    decay: 0.9,
  },
  trafficSteps: {
    email: 0,
    erp: 1,
    payments: 2,
    voip: 4,
    video: 3,
    web: 5,
    backup: 6,
    patch: 7,
    allhands: 3,
  },
  cues: {
    event: { freq: 196, volume: 0.1, decay: 1.6 },
    drop: { freq: 155, volume: 0.06, decay: 0.4 },
    outage: { freq: 98, volume: 0.14, decay: 2.5 },
    reward: { freq: 523, volume: 0.08, decay: 1.2 },
  },
};
