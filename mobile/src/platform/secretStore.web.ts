import { browserSecretStore, type SecretStore } from "./secretStoreShared";

function localStorageOrThrow(): Storage {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error("localStorage unavailable");
  return storage;
}

export const secretStore: SecretStore = {
  get: (key) => browserSecretStore(localStorageOrThrow()).get(key),
  set: (key, value) => browserSecretStore(localStorageOrThrow()).set(key, value),
  del: (key) => browserSecretStore(localStorageOrThrow()).del(key),
};
