import { useCallback, useEffect, useRef, useState } from "react";
import type { McpOAuthFlowPayload, McpPresetInfo, McpPresetsPayload } from "@/lib/types";
import { useSession } from "../state/sessionStore";
import { useSettings } from "../settings/store";

export function compactMcpValues(values?: Record<string, string>): Record<string, string> {
  if (!values) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    const trimmed = typeof v === "string" ? v.trim() : "";
    if (trimmed) out[k] = trimmed;
  }
  return out;
}

export function useMcp() {
  const { session } = useSession();
  const { mutate } = useSettings();
  const [presets, setPresets] = useState<McpPresetInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const refresh = useCallback(async () => {
    if (!session) return;
    const my = ++gen.current;
    setLoading(true);
    try {
      const p = await session.get<McpPresetsPayload>("/api/settings/mcp-presets");
      if (gen.current !== my) return;
      setPresets(p.presets ?? []);
      setError(null);
    } catch (e) {
      if (gen.current !== my) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen.current === my) setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(
    async (name: string, values?: Record<string, string>) => {
      const p = await mutate<McpPresetsPayload>("settings.mcp.enable", {
        name,
        ...compactMcpValues(values),
      });
      if (p?.presets) setPresets(p.presets);
      return p;
    },
    [mutate],
  );

  const disable = useCallback(
    async (name: string) => {
      const p = await mutate<McpPresetsPayload>("settings.mcp.disable", { name });
      if (p?.presets) setPresets(p.presets);
      return p;
    },
    [mutate],
  );

  const remove = useCallback(
    async (name: string) => {
      const p = await mutate<McpPresetsPayload>("settings.mcp.remove", { name });
      if (p?.presets) setPresets(p.presets);
      return p;
    },
    [mutate],
  );

  const testPreset = useCallback(
    (name: string) => mutate<McpPresetsPayload>("settings.mcp.test", { name }),
    [mutate],
  );

  const reconnect = useCallback(
    (name: string) => mutate<McpPresetsPayload>("settings.mcp.reconnect", { name }),
    [mutate],
  );

  const tools = useCallback(
    async (name: string, enabledTools: string[]) => {
      const p = await mutate<McpPresetsPayload>("settings.mcp.tools", {
        name,
        enabled_tools: enabledTools,
      });
      if (p?.presets) setPresets(p.presets);
      return p;
    },
    [mutate],
  );

  return {
    presets,
    loading,
    error,
    refresh,
    enable,
    disable,
    remove,
    test: testPreset,
    reconnect,
    tools,
  };
}

import { usePolling } from "./common";

export type McpOAuthState = "idle" | "awaiting_user" | "polling" | "done" | "error";
export const MCP_OAUTH_POLL_MS = 1000;

export function useMcpOAuth(name: string, onDone?: () => void) {
  const { session } = useSession();
  const { mutate } = useSettings();
  const [state, setState] = useState<McpOAuthState>("idle");
  const [flow, setFlow] = useState<McpOAuthFlowPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expiresAt = useRef(Infinity);
  const gen = useRef(0);
  const flowRef = useRef<McpOAuthFlowPayload | null>(null);
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const consecutiveErrors = useRef(0);

  useEffect(
    () => () => {
      gen.current++;
      const f = flowRef.current;
      if (f?.flow_id) {
        Promise.resolve(mutateRef.current("settings.mcp.oauth_cancel", { flow_id: f.flow_id })).catch(() => {});
      }
    },
    [],
  );

  const pollTick = useCallback(async () => {
    const my = gen.current;
    const f = flowRef.current;
    if (!f?.flow_id || !session) return;
    try {
      const st = await session.get<McpOAuthFlowPayload>(
        `/api/settings/mcp-oauth/status?flow_id=${encodeURIComponent(f.flow_id)}`,
      );
      if (gen.current !== my) return;
      consecutiveErrors.current = 0;
      if (st.status === "connected") {
        flowRef.current = null;
        setState("done");
        onDoneRef.current?.();
        return;
      }
      if (st.status === "failed" || st.status === "cancelled") {
        flowRef.current = null;
        setError(st.status);
        setState("error");
        return;
      }
    } catch (e) {
      if (gen.current !== my) return;
      consecutiveErrors.current++;
      if (consecutiveErrors.current >= 3) {
        flowRef.current = null;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    }
  }, [session]);

  usePolling({
    enabled: state === "polling",
    intervalMs: MCP_OAUTH_POLL_MS,
    expiresAtMs: flow ? expiresAt.current : undefined,
    tick: pollTick,
    onExpire: () => {
      const f = flowRef.current;
      flowRef.current = null;
      if (f?.flow_id) {
        Promise.resolve(mutateRef.current("settings.mcp.oauth_cancel", { flow_id: f.flow_id })).catch(() => {});
      }
      setError("expired");
      setState("error");
    },
  });

  const start = useCallback(
    async (reset: boolean = false) => {
      const my = ++gen.current;
      consecutiveErrors.current = 0;
      setError(null);
      try {
        const r = await mutate<McpOAuthFlowPayload>(
          "settings.mcp.oauth_start",
          { name, ...(reset ? { reset: true } : {}) },
          { timeoutMs: 30_000 },
        );
        if (gen.current !== my) return;
        if (r.status === "connected") {
          flowRef.current = null;
          setState("done");
          onDoneRef.current?.();
          return;
        }
        flowRef.current = r;
        expiresAt.current = Date.now() + ((r.expires_in && r.expires_in > 0 ? r.expires_in : 15 * 60) * 1000);
        setFlow(r);
        if (r.completion_input === "callback_url") {
          setState("awaiting_user");
        } else {
          setState("polling");
        }
      } catch (e) {
        if (gen.current !== my) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    },
    [mutate, name],
  );

  const submit = useCallback(
    async (callbackUrl: string) => {
      const f = flowRef.current;
      if (!f) return;
      const my = ++gen.current;
      consecutiveErrors.current = 0;
      setState("polling");
      try {
        const r = await mutate<McpOAuthFlowPayload>("settings.mcp.oauth_complete", {
          flow_id: f.flow_id,
          callback_url: callbackUrl.trim(),
        });
        if (gen.current !== my) return;
        if (r?.status === "connected") {
          flowRef.current = null;
          setState("done");
          onDoneRef.current?.();
          return;
        }
      } catch (e) {
        if (gen.current !== my) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    },
    [mutate],
  );

  const cancel = useCallback(async () => {
    gen.current++;
    const f = flowRef.current;
    flowRef.current = null;
    setFlow(null);
    setState("idle");
    if (f?.flow_id) {
      await mutate("settings.mcp.oauth_cancel", { flow_id: f.flow_id }).catch(() => {});
    }
  }, [mutate]);

  return {
    state,
    error,
    authUrl: flow?.authorization_url,
    completionInput: flow?.completion_input,
    start,
    submit,
    cancel,
  };
}
