import type { KV } from "./kv";

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

type WebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function browserSecretStore(storage: WebStorage): SecretStore {
  const prefix = "nanobot.secret.";
  return {
    async get(key) {
      return storage.getItem(prefix + key);
    },
    async set(key, value) {
      storage.setItem(prefix + key, value);
    },
    async del(key) {
      storage.removeItem(prefix + key);
    },
  };
}

type WebKvStorage = WebStorage & {
  length: number;
  key(index: number): string | null;
};

export function browserKv(storage: WebKvStorage): KV {
  const prefix = "nanobot.kv.";
  return {
    get(k) {
      return storage.getItem(prefix + k);
    },
    set(k, v) {
      storage.setItem(prefix + k, v);
    },
    del(k) {
      storage.removeItem(prefix + k);
    },
    keys() {
      const out: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const full = storage.key(i);
        if (full !== null && full.startsWith(prefix)) out.push(full.slice(prefix.length));
      }
      return out;
    },
  };
}
