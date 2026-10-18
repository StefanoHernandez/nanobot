import { browserKv } from "../../src/platform/secretStoreShared";

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
  const kv = browserKv(storage);
  storage.setItem("nanobot.secret.secret.a", "s");
  kv.set("foo", "bar");
  expect(kv.keys()).toEqual(["foo"]);
  expect(kv.get("secret.a")).toBeNull();
});

test("secret written directly does not appear in browserKv keys or values", async () => {
  const storage = fakeStorage();
  const kv = browserKv(storage);
  storage.setItem("nanobot.secret.secret.x", "hidden");
  kv.set("visible", "yes");
  expect(kv.keys()).toEqual(["visible"]);
  for (const k of kv.keys()) {
    expect(kv.get(k)).not.toBe("hidden");
  }
});
