import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderOAuthAuthorizationRequired, ProviderOAuthCompletionResult, ProviderOAuthLoginResult } from "@/lib/types";
import { useSettings } from "./store";

export type OAuthState = "idle" | "awaiting_user" | "polling" | "done" | "error";
export const OAUTH_POLL_MS = 1000;

const isAuth = (r: ProviderOAuthLoginResult): r is ProviderOAuthAuthorizationRequired =>
  (r as ProviderOAuthAuthorizationRequired).status === "authorization_required";
const isPending = (r: ProviderOAuthCompletionResult) => (r as { status?: string }).status === "pending";

export function useOAuthFlow(provider: string) {
  const { mutate } = useSettings();
  const [state, setState] = useState<OAuthState>("idle");
  const [flow, setFlow] = useState<ProviderOAuthAuthorizationRequired | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<"expired" | null>(null);
  const expiresAt = useRef(Infinity);
  const gen = useRef(0); // bumped by cancel/unmount to stop any poll loop
  const flowRef = useRef<ProviderOAuthAuthorizationRequired | null>(null);
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  useEffect(
    () => () => {
      gen.current++;
      const f = flowRef.current; // live device_code flow closed with the sheet: tell the server (code/callback flows just stop polling)
      if (f?.completion_input === "device_code")
        void mutateRef.current("settings.provider.oauth_complete", { provider, flow_id: f.flow_id, cancel: true }).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const poll = useCallback(
    async (f: ProviderOAuthAuthorizationRequired, response?: string) => {
      const my = ++gen.current;
      setState("polling");
      let resp = response;
      const expire = () => {
        setErrorCode("expired");
        setError("expired");
        setState("error");
      };
      try {
        for (;;) {
          if (Date.now() >= expiresAt.current) return expire();
          const r = await mutate<ProviderOAuthCompletionResult>("settings.provider.oauth_complete", {
            provider, flow_id: f.flow_id, ...(resp ? { authorization_response: resp } : {}),
          });
          if (gen.current !== my) return;
          if (!isPending(r)) return void ((flowRef.current = null), setState("done"));
          resp = undefined;
          await new Promise((res) => setTimeout(res, OAUTH_POLL_MS));
          if (gen.current !== my) return;
          if (Date.now() >= expiresAt.current) return expire();
        }
      } catch (e) {
        if (gen.current !== my) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    },
    [mutate, provider],
  );

  const start = useCallback(async () => {
    const my = ++gen.current;
    setError(null);
    setErrorCode(null);
    try {
      const r = await mutate<ProviderOAuthLoginResult>("settings.provider.oauth_login", { provider, remote_browser: true });
      if (gen.current !== my) return;
      if (!isAuth(r)) return void setState("done");
      flowRef.current = r;
      expiresAt.current = Date.now() + ((r.expires_in > 0 ? r.expires_in : 15 * 60) * 1000);
      setFlow(r);
      setState("awaiting_user");
      if (r.completion_input === "device_code") void poll(r); // nothing to paste: the server completes it
    } catch (e) {
      if (gen.current !== my) return;
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, [mutate, provider, poll]);

  const submit = useCallback(
    async (response: string) => {
      const r = response.trim();
      if (flowRef.current && r) await poll(flowRef.current, r);
    },
    [poll],
  );

  const cancel = useCallback(async () => {
    gen.current++;
    const f = flowRef.current;
    flowRef.current = null;
    setFlow(null);
    setState("idle");
    if (f?.completion_input === "device_code")
      await mutate("settings.provider.oauth_complete", { provider, flow_id: f.flow_id, cancel: true }).catch(() => {});
  }, [mutate, provider]);

  return {
    state, error, errorCode,
    authUrl: flow?.authorization_url,
    userCode: flow?.user_code,
    completionInput: flow?.completion_input,
    start, submit, cancel,
  };
}
