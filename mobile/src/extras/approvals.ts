import { useEffect } from "react";
import { AppState } from "react-native";
import { createStore, useStore } from "zustand";
import * as Notifications from "expo-notifications";
import type { NanobotSession } from "../core/session";
import { sessionStore } from "../state/sessionStore";
import { usePolling } from "../ecosystem/common";
import { CHANNEL } from "./notifications";
import { i18n } from "../i18n";

export type ApprovalItem = {
  id: string;
  session_key: string;
  tool: string;
  summary: string;
  created_at: number;
  expires_in: number;
};

export type ApprovalsPayload = {
  enabled: boolean;
  pending: ApprovalItem[];
  allow: Record<string, string[]>;
};

export type ApprovalsState = {
  enabled: boolean;
  pending: ApprovalItem[];
  allow: Record<string, string[]>;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  reset: () => void;
  removePending: (id: string, alwaysSessionKey?: string) => void;
  setEnabled: (enabled: boolean) => void;
  removeAllow: (session_key: string) => void;
};

let generation = 0;
const notifiedIds = new Set<string>();

export async function fetchApprovals(session: NanobotSession): Promise<ApprovalsPayload> {
  if (typeof session.get === "function") {
    return await session.get<ApprovalsPayload>("/api/ext/approvals");
  }
  const root = session.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}/api/ext/approvals`, {
    headers: { Authorization: `Bearer ${session.apiToken()}` },
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return (await res.json()) as ApprovalsPayload;
}

async function postApprovals<T = unknown>(session: NanobotSession, path: string, body: unknown): Promise<T> {
  const root = session.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}${path}`, {
    method: "POST",
    redirect: "error",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${session.apiToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export async function decideApproval(
  session: NanobotSession,
  id: string,
  allow: boolean,
  always: boolean,
): Promise<boolean> {
  const res = await postApprovals<{ ok: boolean }>(session, "/api/ext/approvals/decide", { id, allow, always });
  return res.ok;
}

export async function setApprovalsEnabled(session: NanobotSession, enabled: boolean): Promise<boolean> {
  const res = await postApprovals<{ ok: boolean }>(session, "/api/ext/approvals/settings", { enabled });
  return res.ok;
}

export async function forgetApproval(session: NanobotSession, session_key: string): Promise<boolean> {
  const res = await postApprovals<{ ok: boolean }>(session, "/api/ext/approvals/forget", { session_key });
  return res.ok;
}

export function chatLabelFor(
  session_key: string,
  chats: { key: string; title?: string }[],
  t: (key: any, options?: any) => any,
): string {
  if (session_key.startsWith("kanban:")) return t("approvals.chatKanban", { defaultValue: "Kanban" }) || "Kanban";
  if (session_key.startsWith("cron:")) return t("approvals.chatCron", { defaultValue: "Automazione" }) || "Automazione";
  const found = chats.find((c) => c.key === session_key);
  if (found?.title?.trim()) return found.title.trim();
  return session_key;
}

export const approvalsStore = createStore<ApprovalsState>((set, get) => ({
  enabled: false,
  pending: [],
  allow: {},
  error: null,
  loading: false,

  refresh: async () => {
    const currentGen = generation;
    const session = sessionStore?.getState ? sessionStore.getState()?.session : null;
    const profileId = sessionStore?.getState ? sessionStore.getState()?.profile?.id : null;
    if (!session) {
      if (currentGen !== generation) return;
      set({ enabled: false, pending: [], allow: {}, error: null, loading: false });
      return;
    }

    set({ loading: true, error: null });
    try {
      const data = await fetchApprovals(session);
      if (currentGen !== generation) return;
      const currentProfileId = sessionStore?.getState ? sessionStore.getState()?.profile?.id : null;
      if (profileId !== currentProfileId) return;

      // Background notification for new pending items
      const isBackground = AppState.currentState !== "active";
      for (const item of data.pending ?? []) {
        if (!notifiedIds.has(item.id)) {
          notifiedIds.add(item.id);
          if (isBackground) {
            void Notifications.scheduleNotificationAsync({
              content: {
                title: i18n.t("approvals.notify", "Comando da approvare"),
              },
              trigger: { channelId: CHANNEL },
            });
          }
        }
      }

      set({
        enabled: !!data.enabled,
        pending: Array.isArray(data.pending) ? data.pending : [],
        allow: data.allow && typeof data.allow === "object" ? data.allow : {},
        error: null,
        loading: false,
      });
    } catch (e: any) {
      if (currentGen !== generation) return;
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  reset: () => {
    generation++;
    notifiedIds.clear();
    set({
      enabled: false,
      pending: [],
      allow: {},
      error: null,
      loading: false,
    });
  },

  removePending: (id: string, alwaysSessionKey?: string) => {
    set((state) => {
      const newPending = state.pending.filter((p) => p.id !== id);
      const newAllow = { ...state.allow };
      if (alwaysSessionKey) {
        const tools = newAllow[alwaysSessionKey] ? [...newAllow[alwaysSessionKey]] : [];
        if (!tools.includes("exec")) tools.push("exec");
        newAllow[alwaysSessionKey] = tools;
      }
      return { pending: newPending, allow: newAllow };
    });
  },

  setEnabled: (enabled: boolean) => {
    set({ enabled });
  },

  removeAllow: (session_key: string) => {
    set((state) => {
      const nextAllow = { ...state.allow };
      delete nextAllow[session_key];
      return { allow: nextAllow };
    });
  },
}));

// Clear on profile switch
if (sessionStore && typeof sessionStore.subscribe === "function") {
  sessionStore.subscribe((state, prev) => {
    if (state.profile?.id !== prev?.profile?.id) {
      approvalsStore.getState().reset();
    }
  });
}

export function useApprovals<T>(selector: (state: ApprovalsState) => T): T {
  return useStore(approvalsStore, selector);
}

/** Hook polling every 3s when session open and enabled; every 60s when disabled. Refreshes once on mount / open. */
export function useApprovalsPolling(): void {
  const isOpen = useStore(sessionStore, (s) => s.state === "open");
  const enabled = useStore(approvalsStore, (s) => s.enabled);

  useEffect(() => {
    if (isOpen) {
      void approvalsStore.getState().refresh();
    }
  }, [isOpen]);

  usePolling({
    enabled: isOpen,
    intervalMs: enabled ? 3000 : 60000,
    tick: () => approvalsStore.getState().refresh(),
  });
}
