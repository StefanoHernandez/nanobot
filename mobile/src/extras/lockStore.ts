import { createStore } from "zustand";
import { kv } from "../platform/storage";

export const LOCK_KEY = "lock.enabled";

export const lockStore = createStore<{ enabled: boolean; locked: boolean }>(() => {
  const enabled = kv.get(LOCK_KEY) === "1";
  return { enabled, locked: enabled }; // cold start with lock on -> locked
});
