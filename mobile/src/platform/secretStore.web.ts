import type { SecretStore } from "./secretStoreShared";

/**
 * Migration from older builds: remove all leftover secrets from localStorage at startup.
 * The browser NEVER stores credentials.
 */
export function sweepOldSecrets(storage?: Storage): void {
  try {
    const s = storage ?? (typeof globalThis !== "undefined" ? globalThis.localStorage : null);
    if (!s) return;
    const toRemove: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key && key.startsWith("nanobot.secret.")) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      s.removeItem(key);
    }
  } catch {}
}

// Sweep leftover secrets on startup
sweepOldSecrets();

/**
 * On web, credentials live in an HttpOnly cookie and are never saved to localStorage.
 * set is a no-op, get always returns null.
 */
export const secretStore: SecretStore = {
  get: async (_key: string): Promise<string | null> => null,
  set: async (_key: string, _value: string): Promise<void> => {},
  del: async (key: string): Promise<void> => {
    try {
      globalThis.localStorage?.removeItem(`nanobot.secret.${key}`);
    } catch {}
  },
};
