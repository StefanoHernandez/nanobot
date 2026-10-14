import { useCallback, useEffect, useRef, useState } from "react";
import type { NanobotSession } from "../core/session";
import { chatIdOf, isWritable } from "../state/chatsStore";
import { useStore } from "zustand";
import { useSession } from "../state/sessionStore";
import { threadStore } from "../state/threadStore";
import { basePresetName, derivedPresetName, sortEfforts } from "./logic";

export type Preset = {
  name: string; provider: string; model: string; max_tokens: number;
  context_window_tokens: number; temperature: number;
  reasoning_effort: string | null; reasoning_effort_values?: string[];
  is_default: boolean; active: boolean;
};
export type EffortState = { base: Preset; current: string | null; levels: string[] };

export async function loadEffortState(session: NanobotSession, sessionKey: string): Promise<EffortState | null> {
  const [settings, sess] = await Promise.all([
    session.get<{ model_presets?: Preset[] }>("/api/settings"),
    session.get<{ sessions?: Array<{ key: string; model_preset?: string | null }> }>("/api/sessions"),
  ]);
  const presets = settings.model_presets ?? [];
  const row = (sess.sessions ?? []).find((s) => s.key === sessionKey);
  if (!row) return null;
  const preset =
    presets.find((p) => p.name === row.model_preset) ?? presets.find((p) => p.active) ?? presets.find((p) => p.is_default);
  if (!preset) return null;
  const base = presets.find((p) => p.name === basePresetName(preset.name)) ?? preset;
  const levels = sortEfforts(base.reasoning_effort_values ?? []);
  if (!levels.length) return null;
  return { base, current: preset.reasoning_effort, levels };
}

export async function applyEffort(session: NanobotSession, sessionKey: string, state: EffortState, level: string): Promise<string> {
  if (!isWritable(sessionKey)) throw new Error("no_chat");
  const { base } = state;
  const name = derivedPresetName(base.name, level);
  const latest = await session.get<{ model_presets?: Preset[] }>("/api/settings"); // re-read: may exist already
  if (!(latest.model_presets ?? []).some((p) => p.name === name)) {
    await session.mutate("settings.model_configuration.create", {
      name, provider: base.provider, model: base.model, max_tokens: base.max_tokens,
      context_window_tokens: base.context_window_tokens, temperature: base.temperature, reasoning_effort: level,
    });
  }
  session.client.sendMessage(chatIdOf(sessionKey), `/model ${name}`);
  return name;
}

/** Drops results of superseded async refreshes: ok(currentKey) is true only for the latest call on the same key. */
export class RefreshGuard {
  private n = 0;
  begin(key: string | null): (currentKey: string | null) => boolean {
    const id = ++this.n;
    return (cur) => id === this.n && key === cur;
  }
}

export function useEffort(chatKey: string) {
  const { session } = useSession();
  const [state, setState] = useState<EffortState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useRef(new RefreshGuard());
  const keyRef = useRef(chatKey);
  // turn_model_updated is projected into the thread slice; watching it avoids a second client.onChat subscriber.
  const modelSig = useStore(threadStore, (s) => `${s.threads[chatKey]?.preset ?? ""}|${s.threads[chatKey]?.model ?? ""}`);
  const firstSig = useRef(modelSig);
  keyRef.current = chatKey;

  const refresh = useCallback(async () => {
    if (!session || !isWritable(chatKey)) { guard.current.begin(null); setState(null); return; }
    const ok = guard.current.begin(chatKey);
    setLoading(true);
    try {
      const s = await loadEffortState(session, chatKey);
      if (ok(keyRef.current)) { setState(s); setError(null); }
    } catch (e) {
      if (ok(keyRef.current)) { setState(null); setError(e instanceof Error ? e.message : String(e)); }
    } finally {
      if (ok(keyRef.current)) setLoading(false);
    }
  }, [session, chatKey]);

  useEffect(() => {
    setState(null);
    setError(null);
    void refresh();
    if (!session || !isWritable(chatKey)) return;
    return session.client.onRuntimeModelUpdate(() => void refresh());
  }, [session, chatKey, refresh]);

  useEffect(() => {
    if (firstSig.current === modelSig) return;
    firstSig.current = modelSig;
    void refresh();
  }, [modelSig, refresh]);

  const apply = useCallback(
    async (level: string) => {
      if (!session || !state) return;
      setError(null);
      try {
        await applyEffort(session, chatKey, state, level);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [session, chatKey, state],
  );

  return { state, loading, apply, error };
}
