import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { SettingsPayload } from "@/lib/types";
import { toast } from "../ui/components/Toast";

export const LONG_MUTATION_MS = 150_000;
const INSTALL_FLAG = "tools.webui_allow_remote_package_install";

type Mutate = <T = unknown>(action: string, payload: object, opts?: { timeoutMs?: number }) => Promise<T>;

/** Host flag for remote package installs; fails closed when settings are missing. Read-only on mobile. */
export const installGate = (s: SettingsPayload | null | undefined): { allowed: boolean } => ({
  allowed: s?.runtime_config?.[INSTALL_FLAG] === true,
});

/** Host policy refusal (403): never retried, UI shows the "enable on host" copy. */
export const isPolicyError = (e: unknown): boolean => (e as { status?: number } | null)?.status === 403;

/** M8: Maps ecosystem error toasts to i18n generic messages, never raw e.message. */
export function toastEcosystemError(e: unknown, t: (...args: any[]) => any): void {
  if (isPolicyError(e)) {
    toast.show(t("apps.gateBanner"));
  } else if ((e as { timedOut?: boolean; status?: number } | null)?.timedOut || (e as { status?: number } | null)?.status === 504) {
    toast.show(t("apps.timedOut"));
  } else {
    toast.show(t("common.operationFailed", "Operazione non riuscita"));
  }
}

/** 150 s mutation. A 504 resolves `{ timedOut: true }` (the op may still have finished): caller re-fetches. */
export async function longMutation<T = unknown>(
  mutate: Mutate, action: string, payload: object,
): Promise<{ timedOut: false; result: T } | { timedOut: true }> {
  try {
    return { timedOut: false, result: await mutate<T>(action, payload, { timeoutMs: LONG_MUTATION_MS }) };
  } catch (e) {
    if ((e as { status?: number } | null)?.status === 504) return { timedOut: true };
    throw e;
  }
}

export type PollingOpts = {
  intervalMs: number;
  expiresAtMs?: number;
  tick: () => void | Promise<void>;
  enabled: boolean;
  onExpire?: () => void;
};

/** Interval poll: skips while the app is backgrounded, stops at expiry or unmount, never overlaps ticks. */
export function usePolling(o: PollingOpts): void {
  const ref = useRef(o);
  ref.current = o;
  const { enabled, intervalMs, expiresAtMs } = o;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let busy = false;
    let active = AppState.currentState !== "background" && AppState.currentState !== "inactive";
    const sub = AppState.addEventListener("change", (s) => void (active = s === "active"));
    const expired = () => expiresAtMs !== undefined && Date.now() >= expiresAtMs;
    const id = setInterval(async () => {
      if (stopped || busy) return;
      if (expired()) {
        stopped = true;
        clearInterval(id);
        return ref.current.onExpire?.();
      }
      if (!active) return;
      busy = true;
      try {
        await ref.current.tick();
      } finally {
        busy = false;
      }
    }, intervalMs);
    return () => {
      stopped = true;
      clearInterval(id);
      sub.remove();
    };
  }, [enabled, intervalMs, expiresAtMs]);
}
