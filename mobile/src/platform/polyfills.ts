import * as Crypto from "expo-crypto";
import { kv } from "./storage";

type G = Record<string, unknown>;

/** Vendor bootstrap.ts persists the bootstrap secret under this localStorage key. kv is plain
 * (unencrypted) MMKV, so the shim must never store it; secrets live in SecureStore (src/core/profiles). */
export const VENDOR_SECRET_KEY = "nanobot-webui.bootstrap-secret";

let installed = false;

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
  const c = g.crypto as { randomUUID?: () => string };
  if (!c.randomUUID) c.randomUUID = () => Crypto.randomUUID();

  // bootstrap.ts reads window.location / history only in browser-URL helpers; inert stubs. NanobotSession sets location.href = baseUrl (vendor readers of window.location.href).
  if (!g.location) {
    g.location = { href: "", hash: "", pathname: "/", search: "", host: "", hostname: "", port: "", protocol: "https:" };
  }
  if (!g.history) g.history = { replaceState: () => {} };
}
