import { sweepOldSecrets, secretStore } from "../../src/platform/secretStore.web";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
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
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("secretStore.web", () => {
  test("set is a no-op and saves nothing to storage", async () => {
    const storage = fakeStorage();
    const orig = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
    try {
      await secretStore.set("my-secret", "super-secret-value");
      expect(await secretStore.get("my-secret")).toBeNull();
      expect(storage.length).toBe(0);
      expect(storage.getItem("nanobot.secret.my-secret")).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "localStorage", { value: orig, configurable: true, writable: true });
    }
  });

  test("startup removes old nanobot.secret.* keys and leaves other kv keys alone", () => {
    const storage = fakeStorage({
      "nanobot.secret.p1": "secret-1",
      "nanobot.secret.p2": "secret-2",
      "nanobot.kv.profiles": JSON.stringify([{ id: "p1", name: "srv" }]),
      "nanobot.kv.profiles.active": "p1",
      "other.app.key": "preserve-me",
    });

    sweepOldSecrets(storage);

    expect(storage.getItem("nanobot.secret.p1")).toBeNull();
    expect(storage.getItem("nanobot.secret.p2")).toBeNull();
    expect(storage.getItem("nanobot.kv.profiles")).toBe(JSON.stringify([{ id: "p1", name: "srv" }]));
    expect(storage.getItem("nanobot.kv.profiles.active")).toBe("p1");
    expect(storage.getItem("other.app.key")).toBe("preserve-me");
    expect(storage.length).toBe(3);
  });
});
