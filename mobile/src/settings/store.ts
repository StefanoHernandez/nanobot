import { useCallback, useState } from "react";
import { createStore, useStore } from "zustand";
import type { SettingsPayload } from "@/lib/types";
import type { NanobotSession } from "../core/session";
import { chatsStore, chatIdOf, isWritable } from "../state/chatsStore";
import { sessionStore, useSession } from "../state/sessionStore";

export class SettingsError extends Error {
  constructor(public status: number | undefined, message: string, public field?: string) {
    super(message);
    this.name = "SettingsError";
  }
}

type S = {
  data: SettingsPayload | null;
  loading: boolean;
  error: string | null;
  drafts: Record<string, unknown>;
  restartState: "idle" | "restarting" | "done" | "timeout";
  setData(d: SettingsPayload): void;
  setDraft(id: string, v: unknown): void;
  resetDraft(id: string): void;
  reset(): void;
};

const init = { data: null, loading: false, error: null, drafts: {}, restartState: "idle" as const };

/** Whole-payload replacement (upstream applyPayload); drafts live apart so a replacement never clobbers them. */
export const settingsStore = createStore<S>((set) => ({
  ...init,
  setData: (data) => set({ data, error: null }),
  setDraft: (id, v) => set((s) => ({ drafts: { ...s.drafts, [id]: v } })),
  resetDraft: (id) =>
    set((s) => {
      const { [id]: _, ...drafts } = s.drafts;
      return { drafts };
    }),
  reset: () => set({ ...init }),
}));

const isPayload = (x: unknown): x is SettingsPayload => !!x && typeof x === "object" && "agent" in x;

export async function refreshSettings(session: NanobotSession): Promise<void> {
  settingsStore.setState({ loading: true });
  try {
    const d = await session.get<SettingsPayload>("/api/settings");
    const cur = sessionStore.getState().session;
    if (!cur || cur === session) settingsStore.setState({ data: d, loading: false, error: null });
  } catch (e) {
    const cur = sessionStore.getState().session;
    if (!cur || cur === session) {
      settingsStore.setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

export async function mutateSettings<T = SettingsPayload>(
  session: NanobotSession,
  action: string,
  payload: object,
  opts?: { timeoutMs?: number },
): Promise<T> {
  try {
    const r = await session.mutate<T>(action, payload as Record<string, unknown>, opts?.timeoutMs);
    if (isPayload(r)) settingsStore.getState().setData(r);
    return r;
  } catch (e) {
    const status = (e as { status?: number }).status;
    const message = e instanceof Error ? e.message : String(e);
    const field = status === 400 ? /^([A-Za-z0-9_.\[\]-]+): /.exec(message)?.[1] : undefined;
    throw new SettingsError(status, message, field);
  }
}

export function useSettings() {
  const { session } = useSession();
  const data = useStore(settingsStore, (s) => s.data);
  const loading = useStore(settingsStore, (s) => s.loading);
  const error = useStore(settingsStore, (s) => s.error);
  const refresh = useCallback(async () => void (session && (await refreshSettings(session))), [session]);
  const mutate = useCallback(
    <T = SettingsPayload>(action: string, payload: object, opts?: { timeoutMs?: number }) => {
      if (!session) return Promise.reject(new SettingsError(503, "no session"));
      return mutateSettings<T>(session, action, payload, opts);
    },
    [session],
  );
  return { data, loading, error, refresh, mutate };
}

export const RESTART_TIMEOUT_MS = 60_000;
const MIN_DOWN_MS = 1_500;

export async function runRestart(session: NanobotSession): Promise<void> {
  if (settingsStore.getState().restartState === "restarting") return;
  const set = (restartState: S["restartState"]) => settingsStore.setState({ restartState });
  const c = session.client;
  const first = chatsStore.getState().chats.find((x) => isWritable(x.key));
  const chatId = c.defaultChatId ?? (first ? chatIdOf(first.key) : null);
  if (!chatId) return set("timeout");
  set("restarting");
  const t0 = Date.now();
  let sawClose = false;
  let finish: (ok: boolean) => void = () => {};
  const wait = new Promise<boolean>((resolve) => {
    finish = (ok) => {
      clearTimeout(to);
      off();
      resolve(ok);
    };
    const to = setTimeout(() => finish(false), RESTART_TIMEOUT_MS);
    // upstream App.tsx: done on `open` after a seen disconnect, or once MIN_DOWN_MS has passed since the command
    const off: () => void = c.onStatus((st) => {
      if (st !== "open") sawClose = true;
      else if (sawClose || Date.now() - t0 >= MIN_DOWN_MS) finish(true);
    });
  });
  try {
    await c.sendSystemCommand(chatId, "/restart");
  } catch {
    finish(false);
    return set("timeout");
  }
  if (!(await wait)) return set("timeout");
  await refreshSettings(session); // a failure sets `error` but the restart itself is done
  set("done");
  setTimeout(() => {
    if (settingsStore.getState().restartState === "done") set("idle");
  }, 3_000);
}

export function useRestart() {
  const { session } = useSession();
  const state = useStore(settingsStore, (s) => s.restartState);
  const sections = useStore(settingsStore, (s) => s.data?.restart_required_sections) ?? [];
  const pending = useStore(settingsStore, (s) => !!s.data?.requires_restart);
  const run = useCallback(async () => void (session && (await runRestart(session))), [session]);
  return { pending, sections: sections as string[], state, run };
}

export function useDraft<T>(cardId: string, initial: T): [T, (v: T) => void, { dirty: boolean; reset(): void }] {
  const stored = useStore(settingsStore, (s) => s.drafts[cardId]) as T | undefined;
  const dirty = stored !== undefined;
  const setDraft = useCallback((v: T) => settingsStore.getState().setDraft(cardId, v), [cardId]);
  const reset = useCallback(() => settingsStore.getState().resetDraft(cardId), [cardId]);
  return [dirty ? stored : initial, setDraft, { dirty, reset }];
}
