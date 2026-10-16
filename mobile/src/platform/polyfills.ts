import * as Crypto from "expo-crypto";
import { kv } from "./storage";

type G = Record<string, unknown>;

/** Vendor bootstrap.ts persists the bootstrap secret under this localStorage key. kv is plain
 * (unencrypted) MMKV, so the shim must never store it; secrets live in SecureStore (src/core/profiles). */
export const VENDOR_SECRET_KEY = "nanobot-webui.bootstrap-secret";

let installed = false;

/** RFC 4122 v4 UUID from 16 random bytes. */
export function uuidFrom(b: Uint8Array): string {
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Browser globals the vendored nanobot code expects. Idempotent; call first in app/_layout.tsx. */
export function installPolyfills(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as unknown as G;

  if (!g.window) g.window = globalThis;

  if (!g.localStorage) {
    const storage = {
      get length() {
        return kv.keys().length;
      },
      key: (i: number) => kv.keys()[i] ?? null,
      getItem: (k: string) => (k === VENDOR_SECRET_KEY ? null : kv.get(k)),
      setItem: (k: string, v: string) => {
        if (k !== VENDOR_SECRET_KEY) kv.set(k, String(v));
      },
      removeItem: (k: string) => kv.del(k),
      clear: () => kv.keys().forEach((k) => kv.del(k)),
    };
    g.localStorage = storage;
  }

  if (!g.crypto) g.crypto = {};
  const c = g.crypto as { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };
  // A browser on plain http (e.g. http://arduino:8765) has getRandomValues but no randomUUID, and
  // expo-crypto's web randomUUID calls crypto.randomUUID: it would recurse into this shim.
  if (!c.randomUUID) c.randomUUID = c.getRandomValues ? () => uuidFrom(c.getRandomValues!(new Uint8Array(16))) : () => Crypto.randomUUID();

  // bootstrap.ts reads window.location / history only in browser-URL helpers; inert stubs. NanobotSession sets location.href = baseUrl (vendor readers of window.location.href).
  if (!g.location) {
    g.location = { href: "", hash: "", pathname: "/", search: "", host: "", hostname: "", port: "", protocol: "https:" };
  }
  if (!g.history) g.history = { replaceState: () => {} };
}
