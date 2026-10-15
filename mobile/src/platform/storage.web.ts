import type { KV } from "./kv";
import { browserKv } from "./secretStoreShared";

export type { KV } from "./kv";

function localStorageOrThrow(): Storage {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error("localStorage unavailable");
  return storage;
}

export const kv: KV = {
  get: (k) => browserKv(localStorageOrThrow()).get(k),
  set: (k, v) => browserKv(localStorageOrThrow()).set(k, v),
  del: (k) => browserKv(localStorageOrThrow()).del(k),
  keys: () => browserKv(localStorageOrThrow()).keys(),
};
