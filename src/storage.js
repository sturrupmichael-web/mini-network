/**
 * Tiny localStorage wrapper. Every key gets the "miniNetwork:" prefix so
 * saves never collide with other games on the same domain. If storage is
 * blocked (private mode, disabled cookies, file:// quirks) it falls back
 * to memory for the session, and the game carries on.
 */
export const PREFIX = "miniNetwork:";

export function createStorage(backend = defaultBackend()) {
  const memory = new Map();

  function read(key) {
    try {
      const value = backend ? backend.getItem(PREFIX + key) : null;
      if (value !== null && value !== undefined) return value;
    } catch {
      // Storage blocked: fall through to memory.
    }
    return memory.has(key) ? memory.get(key) : null;
  }

  function write(key, value) {
    memory.set(key, value);
    try {
      if (backend) backend.setItem(PREFIX + key, value);
    } catch {
      // Quota exceeded or blocked: keep the in-memory copy.
    }
  }

  return {
    /** Read a JSON value, or `fallback` if it's missing or unreadable. */
    get(key, fallback = null) {
      const raw = read(key);
      if (raw === null || raw === undefined) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      write(key, JSON.stringify(value));
    },
    remove(key) {
      memory.delete(key);
      try {
        if (backend) backend.removeItem(PREFIX + key);
      } catch {
        // Ignore.
      }
    },
  };
}

function defaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
