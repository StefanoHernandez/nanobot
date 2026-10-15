import { type ReactNode } from "react";
import { createStore } from "zustand";
import { kv } from "../platform/storage";

const KEY = "lock.enabled";
const RELOCK_MS = 300_000;

/** True after > 5 min in background, and on cold start (no background timestamp yet). */
export const isRelockDue = (lastBackgroundAt: number | null, now: number): boolean =>
  lastBackgroundAt === null || now - lastBackgroundAt > RELOCK_MS;

export const lockStore = createStore<{ enabled: boolean; locked: boolean }>(() => {
  const enabled = kv.get(KEY) === "1";
  return { enabled, locked: false };
});

export const lockSettings = {
  enabled: (): boolean => kv.get(KEY) === "1",
  async setEnabled(v: boolean): Promise<{ ok: boolean; reason?: "no_hardware" | "not_enrolled" }> {
    if (v) {
      return { ok: false, reason: "no_hardware" };
    }
    kv.del(KEY);
    lockStore.setState({ enabled: false, locked: false });
    return { ok: true };
  },
};

export function LockGate({ children }: { children: ReactNode }) {
  return children;
}
