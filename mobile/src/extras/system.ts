import { useEffect } from "react";
import { createStore, useStore } from "zustand";
import type { NanobotSession } from "../core/session";
import { sessionStore } from "../state/sessionStore";
import { usePolling } from "../ecosystem/common";
import type { Theme } from "../ui/theme";

export interface SystemMemory {
  total_mb: number;
  used_mb: number;
  swap_total_mb: number;
  swap_used_mb: number;
}

export interface SystemDisk {
  total_gb: number;
  used_gb: number;
  free_gb: number;
}

export interface SystemSnapshot {
  cpu_percent: number | null;
  load: [number, number, number] | null;
  cores: number | null;
  memory: SystemMemory | null;
  temperature_c: number | null;
  disk: SystemDisk | null;
  uptime_s: number | null;
  gateway_uptime_s: number | null;
  log_errors: string[];
}

export interface SystemStatsState {
  data: SystemSnapshot | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  reset: () => void;
}

/** Pure helper to format uptime duration into readable string using translated unit keys. */
export function formatDuration(
  seconds: number | null | undefined,
  t?: (key: string, opts?: any) => any,
): string {
  if (seconds == null || isNaN(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const sUnit = t ? t("machine.units.s") : "s";
  const minUnit = t ? t("machine.units.min") : "min";
  const hUnit = t ? t("machine.units.h") : "h";
  if (s < 60) return `${s} ${sUnit}`;
  if (s < 86400) return `${Math.floor(s / 60)} ${minUnit}`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const dayUnit = t
    ? (d === 1 ? t("machine.units.day") : t("machine.units.days"))
    : (d === 1 ? "day" : "days");
  return `${d} ${dayUnit} ${h} ${hUnit}`;
}

/** Temperature color thresholds: >= 75 °C danger, >= 65 °C warning (brand), normal otherwise. */
export function temperatureColor(tempC: number | null | undefined, theme: Theme): string {
  if (tempC == null) return theme.colors.mutedForeground;
  if (tempC >= 75) return theme.colors.destructive;
  if (tempC >= 65) return theme.colors.brand;
  return theme.colors.foreground;
}

export async function fetchSystem(session: NanobotSession): Promise<SystemSnapshot> {
  const root = session.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}/api/ext/system`, {
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
  return (await res.json()) as SystemSnapshot;
}

let generation = 0;

export const systemStore = createStore<SystemStatsState>((set) => ({
  data: null,
  error: null,
  loading: false,

  refresh: async () => {
    const thisGen = ++generation;
    const session = sessionStore.getState().session;
    const profileId = sessionStore.getState().profile?.id;
    if (!session) {
      if (thisGen !== generation) return;
      set({ data: null, error: null, loading: false });
      return;
    }

    set({ loading: true });
    try {
      const data = await fetchSystem(session);
      if (thisGen !== generation) return;
      const currentProfileId = sessionStore.getState().profile?.id;
      if (profileId !== currentProfileId) return;

      set({
        data,
        error: null,
        loading: false,
      });
    } catch (e: any) {
      if (thisGen !== generation) return;
      const currentProfileId = sessionStore.getState().profile?.id;
      if (profileId !== currentProfileId) return;

      const status = e?.status;
      const errorKey = status === 401 || status === 403 ? "machine.noAccess" : "common.operationFailed";
      set((state) => ({
        data: state.data,
        error: errorKey,
        loading: false,
      }));
    }
  },

  reset: () => {
    generation++;
    set({
      data: null,
      error: null,
      loading: false,
    });
  },
}));

// Clear on profile switch
sessionStore.subscribe((state, prev) => {
  if (state.profile?.id !== prev?.profile?.id) {
    systemStore.getState().reset();
  }
});

/** Hook polling every 5s while screen mounted and session open, foreground only. */
export function useSystemStats(): { data: SystemSnapshot | null; error: string | null } {
  const isOpen = useStore(sessionStore, (s) => s.state === "open");
  const data = useStore(systemStore, (s) => s.data);
  const error = useStore(systemStore, (s) => s.error);

  useEffect(() => {
    if (isOpen) {
      void systemStore.getState().refresh();
    }
  }, [isOpen]);

  usePolling({
    enabled: isOpen,
    intervalMs: 5000,
    tick: () => systemStore.getState().refresh(),
    background: false,
  });

  return { data, error };
}
