import { kv } from "../platform/storage";

export const MAX_STATE_BYTES = 64 * 1024; // 64 KB = 65,536 bytes

// In-memory fallback for artifacts without chatKey or without artifactId (session only)
const sessionMemory = new Map<string, string>();

// In-memory cache for pending debounced writes: key -> serialized string
const pendingWrites = new Map<string, string>();
// Debounce timers: key -> NodeJS.Timeout
const debounceTimers = new Map<string, NodeJS.Timeout>();
// Last write timestamps: key -> number
const lastWriteTimes = new Map<string, number>();

export function artifactStorageKey(chatKey: string, artifactId: string): string {
  return `artifact-state:${chatKey}:${artifactId}`;
}

export function hasArtifactState(chatKey?: string, artifactId?: string): boolean {
  if (!chatKey || !artifactId) {
    const memKey = `mem:${chatKey || ""}:${artifactId || ""}`;
    return sessionMemory.has(memKey);
  }
  const key = artifactStorageKey(chatKey, artifactId);
  if (pendingWrites.has(key)) return true;
  return kv.get(key) !== null;
}

export async function getArtifactState(chatKey?: string, artifactId?: string): Promise<any> {
  if (!chatKey || !artifactId) {
    const memKey = `mem:${chatKey || ""}:${artifactId || ""}`;
    const raw = sessionMemory.get(memKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const key = artifactStorageKey(chatKey, artifactId);
  const pending = pendingWrites.get(key);
  const raw = pending !== undefined ? pending : kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setArtifactState(
  chatKey: string | undefined,
  artifactId: string | undefined,
  value: any,
): Promise<void> {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (err: any) {
    throw new Error(`State must be serializable JSON: ${err?.message || err}`);
  }

  if (typeof serialized !== "string") {
    throw new Error("State must be serializable JSON");
  }

  const byteLength = new TextEncoder().encode(serialized).length;
  if (byteLength > MAX_STATE_BYTES) {
    throw new Error(`State size exceeds 64 KB limit (${byteLength} bytes)`);
  }

  if (!chatKey || !artifactId) {
    const memKey = `mem:${chatKey || ""}:${artifactId || ""}`;
    sessionMemory.set(memKey, serialized);
    return;
  }

  const key = artifactStorageKey(chatKey, artifactId);
  pendingWrites.set(key, serialized);

  const now = Date.now();
  const lastWrite = lastWriteTimes.get(key) || 0;
  const timeSinceLastWrite = now - lastWrite;

  const existingTimer = debounceTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
    debounceTimers.delete(key);
  }

  if (timeSinceLastWrite >= 500) {
    // Immediate write on leading edge if 500ms has elapsed
    try {
      kv.set(key, serialized);
      lastWriteTimes.set(key, now);
      pendingWrites.delete(key);
    } catch {
      // Storage error
    }
  } else {
    // Debounce: schedule write after remaining interval (up to 500ms)
    const delay = Math.max(0, 500 - timeSinceLastWrite);
    const timer = setTimeout(() => {
      debounceTimers.delete(key);
      const latest = pendingWrites.get(key);
      if (latest !== undefined) {
        try {
          kv.set(key, latest);
          lastWriteTimes.set(key, Date.now());
          pendingWrites.delete(key);
        } catch {
          // Storage error
        }
      }
    }, delay);
    debounceTimers.set(key, timer);
  }
}

export function flushArtifactState(chatKey?: string, artifactId?: string): void {
  if (!chatKey || !artifactId) return;
  const key = artifactStorageKey(chatKey, artifactId);
  const timer = debounceTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(key);
  }
  const pending = pendingWrites.get(key);
  if (pending !== undefined) {
    try {
      kv.set(key, pending);
      lastWriteTimes.set(key, Date.now());
      pendingWrites.delete(key);
    } catch {
      // Storage error
    }
  }
}

export function clearArtifactState(chatKey?: string, artifactId?: string): void {
  if (!chatKey || !artifactId) {
    const memKey = `mem:${chatKey || ""}:${artifactId || ""}`;
    sessionMemory.delete(memKey);
    return;
  }
  const key = artifactStorageKey(chatKey, artifactId);
  const timer = debounceTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(key);
  }
  pendingWrites.delete(key);
  lastWriteTimes.delete(key);
  try {
    kv.del(key);
  } catch {
    // Storage error
  }
}

export function clearArtifactStateForChat(chatKey: string): void {
  if (!chatKey) return;
  const prefix = `artifact-state:${chatKey}:`;
  // Clear any in-memory debounce timers and pending writes matching prefix
  for (const [k, timer] of debounceTimers.entries()) {
    if (k.startsWith(prefix)) {
      clearTimeout(timer);
      debounceTimers.delete(k);
    }
  }
  for (const k of pendingWrites.keys()) {
    if (k.startsWith(prefix)) {
      pendingWrites.delete(k);
    }
  }
  for (const k of lastWriteTimes.keys()) {
    if (k.startsWith(prefix)) {
      lastWriteTimes.delete(k);
    }
  }

  // Clear MMKV keys
  try {
    const allKeys = kv.keys();
    for (const k of allKeys) {
      if (k.startsWith(prefix)) {
        kv.del(k);
      }
    }
  } catch {
    // Storage error
  }
}
