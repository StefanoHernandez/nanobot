import { useEffect, useCallback } from "react";
import { AppState } from "react-native";
import { createStore, useStore } from "zustand";
import * as Notifications from "expo-notifications";
import type { NanobotSession } from "../core/session";
import { sessionStore } from "../state/sessionStore";
import { usePolling } from "../ecosystem/common";
import { CHANNEL } from "./notifications";
import { kv } from "../platform/storage";
import { i18n } from "../i18n";

export type ModelPrice = {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
};

export type ModelUsage = {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cost_usd: number | null;
};

export type DayUsage = {
  date: string;
  cost_usd: number;
  models: ModelUsage[];
};

export type CostsPayload = {
  currency: string;
  today: string;
  today_cost_usd: number;
  total_cost_usd: number;
  days: DayUsage[];
  unpriced_models: string[];
  prices: Record<string, ModelPrice>;
  daily_cap_usd: number | null;
  alert_pct: number;
  alert: boolean;
  over_cap: boolean;
};

export type CostSettingsPayload = {
  prices?: Record<string, ModelPrice>;
  daily_cap_usd?: number | null;
  alert_pct?: number;
};

export type CostsState = {
  data: CostsPayload | null;
  loading: boolean;
  error: string | null;
  days: number;
  onCostsScreen: boolean;
  refresh: (days?: number) => Promise<void>;
  saveSettings: (partial: CostSettingsPayload) => Promise<boolean>;
  setOnCostsScreen: (on: boolean) => void;
  reset: () => void;
};

export function formatCost(amount: number): string {
  if (amount <= 0) return "$0.00";
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }
  return `$${amount.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number(m.toFixed(1))}M`;
  }
  const k = tokens / 1000;
  return `${Number(k.toFixed(1))}k`;
}

let generation = 0;
let onCostsScreen = false;

export async function fetchCosts(session: NanobotSession, days: number = 30): Promise<CostsPayload> {
  const root = session.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}/api/ext/costs?days=${days}`, {
    method: "GET",
    redirect: "error",
    credentials: "omit",
    headers: { Authorization: `Bearer ${session.apiToken()}` },
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return (await res.json()) as CostsPayload;
}

export async function saveCostSettings(
  session: NanobotSession,
  partial: CostSettingsPayload,
): Promise<{ ok: boolean }> {
  const root = session.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}/api/ext/costs/settings`, {
    method: "POST",
    redirect: "error",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${session.apiToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(partial),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return (await res.json()) as { ok: boolean };
}

export const costsStore = createStore<CostsState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  days: 30,
  onCostsScreen: false,

  setOnCostsScreen: (on: boolean) => {
    onCostsScreen = on;
  },

  refresh: async (daysCount?: number) => {
    const thisGen = ++generation;
    const session = sessionStore?.getState ? sessionStore.getState()?.session : null;
    const profileId = sessionStore?.getState ? sessionStore.getState()?.profile?.id : null;
    const queryDays = daysCount ?? get().days;

    if (!session) {
      if (thisGen !== generation) return;
      set({ data: null, loading: false, error: null });
      return;
    }

    set({ loading: true, error: null });
    try {
      const data = await fetchCosts(session, queryDays);
      if (thisGen !== generation) return;
      const currentProfileId = sessionStore?.getState ? sessionStore.getState()?.profile?.id : null;
      if (profileId !== currentProfileId) return;

      const isBackground = AppState.currentState !== "active";
      if ((isBackground || !onCostsScreen) && data.daily_cap_usd != null) {
        if (data.over_cap) {
          const key = `costs.notified.${data.today}.over_cap`;
          if (!kv.get(key)) {
            kv.set(key, "1");
            void Notifications.scheduleNotificationAsync({
              content: {
                title: i18n.t("costs.overNotify"),
              },
              trigger: { channelId: CHANNEL },
            });
          }
        } else if (data.alert) {
          const key = `costs.notified.${data.today}.alert`;
          if (!kv.get(key)) {
            kv.set(key, "1");
            void Notifications.scheduleNotificationAsync({
              content: {
                title: i18n.t("costs.alertNotify"),
              },
              trigger: { channelId: CHANNEL },
            });
          }
        }
      }

      set({
        data,
        days: queryDays,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      if (thisGen !== generation) return;
      set({
        error: i18n.t("common.operationFailed"),
        loading: false,
      });
    }
  },

  saveSettings: async (partial: CostSettingsPayload) => {
    const session = sessionStore?.getState ? sessionStore.getState()?.session : null;
    if (!session) return false;
    try {
      await saveCostSettings(session, partial);
      await get().refresh();
      return true;
    } catch {
      return false;
    }
  },

  reset: () => {
    generation++;
    set({
      data: null,
      loading: false,
      error: null,
      days: 30,
      onCostsScreen: false,
    });
  },
}));

if (sessionStore && typeof sessionStore.subscribe === "function") {
  sessionStore.subscribe((state, prev) => {
    if (state.profile?.id !== prev?.profile?.id) {
      costsStore.getState().reset();
    }
  });
}

export function useCosts(days: number = 30) {
  const data = useStore(costsStore, (s) => s.data);
  const loading = useStore(costsStore, (s) => s.loading);
  const error = useStore(costsStore, (s) => s.error);
  const isOpen = useStore(sessionStore, (s) => s.state === "open");

  useEffect(() => {
    if (isOpen) {
      void costsStore.getState().refresh(days);
    }
  }, [isOpen, days]);

  const onRefresh = useCallback(async () => {
    await costsStore.getState().refresh(days);
  }, [days]);

  return {
    data,
    loading,
    error,
    refresh: onRefresh,
  };
}

export function useCostsBackgroundWatcher(): void {
  const isOpen = useStore(sessionStore, (s) => s.state === "open");
  const profileId = useStore(sessionStore, (s) => s.profile?.id);
  const dailyCap = useStore(costsStore, (s) => s.data?.daily_cap_usd);

  useEffect(() => {
    if (isOpen) {
      void costsStore.getState().refresh(1);
    }
  }, [isOpen, profileId]);

  usePolling({
    enabled: isOpen && dailyCap != null,
    intervalMs: 600000,
    tick: () => costsStore.getState().refresh(1),
    background: true,
  });
}

export const useCostsWatcher = useCostsBackgroundWatcher;

