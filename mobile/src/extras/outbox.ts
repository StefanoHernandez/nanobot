import { createStore } from "zustand";
import { kv } from "../platform/storage";
import { sessionStore } from "../state/sessionStore";
import type { SendOpts } from "../state/threadStore";

export type OutboxItem = {
  id: string;
  text: string;
  opts?: SendOpts;
  createdAt: number;
  /** True when loaded from disk after a cold start or profile switch; prevents auto-send until user taps Send or a same-session reconnect occurs. */
  paused?: boolean;
};

export type OutboxState = {
  activeProfileId: string | null;
  queues: Record<string, OutboxItem[]>;
  syncProfile(profileId: string | null): void;
  enqueue(chatKey: string, text: string, opts?: SendOpts): OutboxItem | null;
  cancel(chatKey: string, itemId: string): void;
  resumeItem(chatKey: string, itemId: string): void;
  flushNext(chatKey: string): boolean;
};

function storageKey(profileId: string): string {
  return `outbox:v1:${profileId}`;
}

function loadQueues(profileId: string): Record<string, OutboxItem[]> {
  try {
    const raw = kv.get(storageKey(profileId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, OutboxItem[]> = {};
    for (const [chatKey, items] of Object.entries(parsed)) {
      if (Array.isArray(items)) {
        result[chatKey] = items.map((it: OutboxItem) => ({
          ...it,
          paused: true,
        }));
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveQueues(profileId: string, queues: Record<string, OutboxItem[]>): void {
  try {
    kv.set(storageKey(profileId), JSON.stringify(queues));
  } catch {}
}

export const outboxStore = createStore<OutboxState>((set, get) => ({
  activeProfileId: null,
  queues: {},

  syncProfile(profileId: string | null) {
    const current = get().activeProfileId;
    if (profileId === current) return;
    if (!profileId) {
      set({ activeProfileId: null, queues: {} });
      return;
    }
    const loaded = loadQueues(profileId);
    set({ activeProfileId: profileId, queues: loaded });
  },

  enqueue(chatKey: string, text: string, opts?: SendOpts) {
    const { activeProfileId, queues } = get();
    if (!activeProfileId) return null;
    const item: OutboxItem = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      opts,
      createdAt: Date.now(),
      paused: false,
    };
    const list = [...(queues[chatKey] ?? []), item];
    const nextQueues = { ...queues, [chatKey]: list };
    set({ queues: nextQueues });
    saveQueues(activeProfileId, nextQueues);
    return item;
  },

  cancel(chatKey: string, itemId: string) {
    const { activeProfileId, queues } = get();
    if (!activeProfileId) return;
    const list = (queues[chatKey] ?? []).filter((it) => it.id !== itemId);
    const nextQueues = { ...queues, [chatKey]: list };
    set({ queues: nextQueues });
    saveQueues(activeProfileId, nextQueues);
  },

  resumeItem(chatKey: string, itemId: string) {
    const { activeProfileId, queues } = get();
    if (!activeProfileId) return;
    // Unpause the whole chat queue: flushing is head-first, so unpausing only a later item would do nothing.
    const list = (queues[chatKey] ?? []).map((it) => ({ ...it, paused: false }));
    if (!list.some((it) => it.id === itemId)) return;
    const nextQueues = { ...queues, [chatKey]: list };
    set({ queues: nextQueues });
    saveQueues(activeProfileId, nextQueues);
    if (sessionStore.getState().state === "open") {
      get().flushNext(chatKey);
    }
  },

  flushNext(chatKey: string): boolean {
    const s = sessionStore.getState();
    if (s.state !== "open" || !s.session) return false;
    const { activeProfileId, queues } = get();
    if (!activeProfileId || s.profile?.id !== activeProfileId) return false;

    const { threadStore } = require("../state/threadStore");
    const slice = threadStore.getState().threads[chatKey];
    if (!slice || !slice.loaded || slice.hydrating || slice.running || slice.uploading) return false;

    const list = queues[chatKey] ?? [];
    if (list.length === 0) return false;
    const head = list[0];
    if (head.paused) return false;

    // Dequeue only after send() accepted it: a refused send stays queued (paused) instead of being lost.
    const sent = threadStore.getState().send(s.session, chatKey, head.text, head.opts);
    const cur = get().queues[chatKey] ?? [];
    const remaining = sent ? cur.filter((it) => it.id !== head.id) : cur.map((it) => (it.id === head.id ? { ...it, paused: true } : it));
    const nextQueues = { ...get().queues, [chatKey]: remaining };
    set({ queues: nextQueues });
    saveQueues(activeProfileId, nextQueues);
    return sent;
  },
}));

// Do not send to chats that are not open: their thread isn't loaded, so ordering and hydrate can't be guaranteed.
let lastActiveProfileId: string | null = null;
let lastQueues: Record<string, OutboxItem[]> | null = null;
let lastResult: Record<string, number> = {};

export function pendingByChat(state: OutboxState): Record<string, number> {
  if (state.activeProfileId === lastActiveProfileId && state.queues === lastQueues) {
    return lastResult;
  }
  lastActiveProfileId = state.activeProfileId;
  lastQueues = state.queues;
  if (!state.activeProfileId) {
    lastResult = {};
    return lastResult;
  }
  const result: Record<string, number> = {};
  for (const [chatKey, items] of Object.entries(state.queues)) {
    if (items && items.length > 0) {
      result[chatKey] = items.length;
    }
  }
  lastResult = result;
  return lastResult;
}

