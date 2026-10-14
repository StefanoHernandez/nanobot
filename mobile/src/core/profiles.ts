import * as SecureStore from "expo-secure-store";
import { BootstrapAuthRequiredError, fetchBootstrap } from "@/lib/bootstrap";
import { kv } from "../platform/storage";

export type Profile = { id: string; name: string; baseUrl: string; hasSecret: boolean };

export function normalizeBaseUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.host) return null;
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
}

const LIST_KEY = "profiles";
const ACTIVE_KEY = "profiles.active";
const secretKey = (id: string) => `secret.${id}`;

function read(): Profile[] {
  try {
    return JSON.parse(kv.get(LIST_KEY) ?? "[]") as Profile[];
  } catch {
    return [];
  }
}

export const profiles = {
  list: (): Profile[] => read(),
  async save(p: Omit<Profile, "hasSecret">, secret: string): Promise<void> {
    if (secret) await SecureStore.setItemAsync(secretKey(p.id), secret);
    else await SecureStore.deleteItemAsync(secretKey(p.id));
    const next = read().filter((x) => x.id !== p.id);
    next.push({ ...p, hasSecret: !!secret });
    kv.set(LIST_KEY, JSON.stringify(next));
  },
  async remove(id: string): Promise<void> {
    await SecureStore.deleteItemAsync(secretKey(id));
    kv.set(LIST_KEY, JSON.stringify(read().filter((x) => x.id !== id)));
    if (kv.get(ACTIVE_KEY) === id) kv.del(ACTIVE_KEY);
  },
  async getSecret(id: string): Promise<string> {
    return (await SecureStore.getItemAsync(secretKey(id))) ?? "";
  },
  activeId: (): string | null => kv.get(ACTIVE_KEY),
  setActive: (id: string): void => kv.set(ACTIVE_KEY, id),
};

export type ConnResult =
  | { ok: true }
  | { ok: false; kind: "auth" | "unreachable" | "http"; message: string };

export async function testConnection(baseUrl: string, secret: string): Promise<ConnResult> {
  try {
    await fetchBootstrap(baseUrl, secret, 10_000);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof BootstrapAuthRequiredError) return { ok: false, kind: "auth", message };
    // vendor throws "bootstrap failed: HTTP <n>" / "bootstrap response missing ws_path" for reachable-but-wrong servers
    if (/^bootstrap (failed: HTTP|response)/.test(message)) return { ok: false, kind: "http", message };
    return { ok: false, kind: "unreachable", message };
  }
}
