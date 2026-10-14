export interface KV {
  get(k: string): string | null;
  set(k: string, v: string): void;
  del(k: string): void;
  keys(): string[];
}

type MmkvModule = typeof import("react-native-mmkv");

export function createKv(loadMmkv: () => MmkvModule, isTest: boolean): KV {
  try {
    const m = loadMmkv().createMMKV({ id: "nanobot" });
    return {
      get: (k) => m.getString(k) ?? null,
      set: (k, v) => m.set(k, v),
      del: (k) => void m.remove(k),
      keys: () => m.getAllKeys(),
    };
  } catch (e) {
    if (!isTest) {
      throw new Error(
        `MMKV unavailable: native module missing (use a dev/release build, not Expo Go): ${String(e)}`,
      );
    }
    // In-memory fallback ONLY under jest, where the native Nitro module cannot load.
    const mem = new Map<string, string>();
    return {
      get: (k) => mem.get(k) ?? null,
      set: (k, v) => void mem.set(k, v),
      del: (k) => void mem.delete(k),
      keys: () => [...mem.keys()],
    };
  }
}

// lazy require: importing react-native-mmkv throws without the native Nitro module.
export const kv: KV = createKv(
  () => require("react-native-mmkv") as MmkvModule,
  !!process.env.JEST_WORKER_ID,
);
