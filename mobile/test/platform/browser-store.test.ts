import { browserKv, browserSecretStore } from "../../src/platform/secretStoreShared";

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      const keys = [...map.keys()];
      return keys[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test("browserSecretStore set/get/del roundtrip", async () => {
  const storage = fakeStorage();
  const store = browserSecretStore(storage);
  await store.set("secret.a", "top-secret");
  expect(await store.get("secret.a")).toBe("top-secret");
  await store.del("secret.a");
  expect(await store.get("secret.a")).toBeNull();
});

test("browserSecretStore uses nanobot.secret. prefix", async () => {
  const storage = fakeStorage();
  const store = browserSecretStore(storage);
  await store.set("secret.a", "v");
  expect(storage.getItem("secret.a")).toBeNull();
  expect(storage.getItem("nanobot.secret.secret.a")).toBe("v");
});

test("browserKv set/get/del/keys", () => {
  const storage = fakeStorage();
  const kv = browserKv(storage);
  kv.set("profiles", "[]");
  kv.set("profiles.active", "a");
  expect(kv.get("profiles")).toBe("[]");
  expect(kv.get("missing")).toBeNull();
  kv.del("profiles.active");
  expect(kv.get("profiles.active")).toBeNull();
  expect(kv.keys().sort()).toEqual(["profiles"]);
});

test("browserKv keys exclude secret prefix entries when storage is shared", async () => {
  const storage = fakeStorage();
  const secrets = browserSecretStore(storage);
  const kv = browserKv(storage);
  await secrets.set("secret.a", "s");
  kv.set("foo", "bar");
  expect(kv.keys()).toEqual(["foo"]);
  expect(kv.get("secret.a")).toBeNull();
});

test("secret written via browserSecretStore does not appear in browserKv keys or values", async () => {
  const storage = fakeStorage();
  const secrets = browserSecretStore(storage);
  const kv = browserKv(storage);
  await secrets.set("secret.x", "hidden");
  kv.set("visible", "yes");
  expect(kv.keys()).toEqual(["visible"]);
  for (const k of kv.keys()) {
    expect(kv.get(k)).not.toBe("hidden");
  }
});
