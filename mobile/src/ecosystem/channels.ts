import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChannelConnectPayload, ChannelSetupContract, ChannelSetupContractField, NanobotFeatureInfo,
  NanobotFeaturesPayload, PairingPayload,
} from "@/lib/types";
import { useSession } from "../state/sessionStore";
import { useSettings } from "../settings/store";
import { isPolicyError, longMutation, usePolling } from "./common";

type Mutate = ReturnType<typeof useSettings>["mutate"];

// ---- features / instances -------------------------------------------------

export function useChannels() {
  const { session } = useSession();
  const [payload, setPayload] = useState<NanobotFeaturesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setPayload(await session.get<NanobotFeaturesPayload>("/api/settings/nanobot-features"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => void refresh(), [refresh]);
  const channels: NanobotFeatureInfo[] = (payload?.features ?? []).filter((f) => f.type === "channel");
  return { channels, requiresRestart: !!payload?.requires_restart, loading, error, refresh, apply: setPayload };
}

export const channelEnable = (mutate: Mutate, name: string, instanceId?: string) =>
  longMutation<NanobotFeaturesPayload>(mutate, "settings.feature.enable", {
    name, ...(instanceId ? { instance_id: instanceId } : {}),
  });

export const channelDisable = (mutate: Mutate, name: string, instanceId?: string) =>
  mutate<NanobotFeaturesPayload>("settings.feature.disable", { name, ...(instanceId ? { instance_id: instanceId } : {}) });

// ---- credential form ------------------------------------------------------

/** Plain data (no Set) so it can live in React state. Secret values are never pre-filled. */
export type ChannelForm = { values: Record<string, string>; configured: string[]; touched: string[]; cleared: string[] };

const fieldDefault = (f: ChannelSetupContractField) => f.default_value ?? f.choices?.[0] ?? "";

export function channelFormFromContract(
  contract: ChannelSetupContract, values: Record<string, string> = {}, configuredFields: string[] = [],
): ChannelForm {
  return {
    values: Object.fromEntries(
      contract.fields.map((f) => [f.key, f.kind === "secret" ? "" : values[f.key] ?? fieldDefault(f)]),
    ),
    configured: configuredFields,
    touched: [],
    cleared: [],
  };
}

export const setChannelValue = (form: ChannelForm, key: string, value: string): ChannelForm => ({
  ...form,
  values: { ...form.values, [key]: value },
  touched: form.touched.includes(key) ? form.touched : [...form.touched, key],
  cleared: form.cleared.filter((k) => k !== key),
});

export const setSecretCleared = (form: ChannelForm, key: string, clear: boolean): ChannelForm => ({
  ...form,
  values: clear ? { ...form.values, [key]: "" } : form.values,
  cleared: clear ? [...new Set([...form.cleared, key])] : form.cleared.filter((k) => k !== key),
});

const truthy = (v: string) => ["true", "1", "yes", "on"].includes(v.trim().toLowerCase());
const splitList = (v: string) => v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

/** Wire values for `settings.channel.configure`: untouched secrets omitted, cleared ones `null`, typed coercion. */
export function channelConfigurePayload(contract: ChannelSetupContract, form: ChannelForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of contract.fields) {
    const raw = form.values[f.key] ?? "";
    if (f.kind === "secret") {
      if (form.cleared.includes(f.key)) out[f.key] = null;
      else if (raw.trim()) out[f.key] = raw;
      continue;
    }
    const touched = form.touched.includes(f.key);
    if (!touched && !raw.trim()) continue;
    if (!touched && f.kind === "enum") continue;
    if (f.kind === "int") {
      if (raw.trim() && Number.isInteger(Number(raw))) out[f.key] = Number(raw);
    } else if (f.kind === "bool") out[f.key] = truthy(raw);
    else if (f.kind === "list") out[f.key] = splitList(raw);
    else out[f.key] = raw;
  }
  return out;
}

export type ChannelFieldError = "required" | "int" | "choice";

export function validateChannelForm(contract: ChannelSetupContract, form: ChannelForm): Record<string, ChannelFieldError> {
  const errors: Record<string, ChannelFieldError> = {};
  for (const f of contract.fields) {
    const raw = (form.values[f.key] ?? "").trim();
    const savedSecret = f.kind === "secret" && form.configured.includes(f.key) && !form.cleared.includes(f.key);
    if (!raw) {
      if (f.required && f.kind !== "bool" && !savedSecret) errors[f.key] = "required";
    } else if (f.kind === "int" && !Number.isInteger(Number(raw))) errors[f.key] = "int";
    else if (f.kind === "enum" && f.choices?.length && !f.choices.includes(raw)) errors[f.key] = "choice";
  }
  return errors;
}

export const validateChannel = (mutate: Mutate, name: string, values?: Record<string, unknown>, instanceId?: string) =>
  mutate("settings.channel.validate", {
    name, ...(values ? { values } : {}), ...(instanceId ? { instance_id: instanceId } : {}),
  });

export const configureChannel = (
  mutate: Mutate, name: string, values: Record<string, unknown>, o: { enable?: boolean; instanceId?: string } = {},
) =>
  longMutation(mutate, "settings.channel.configure", {
    name, values, ...(o.enable ? { enable: true } : {}), ...(o.instanceId ? { instance_id: o.instanceId } : {}),
  });

// Port of upstream validationMessages.ts: server message -> i18n key suffix (`settings.channels.validationMessages.*`).
const MESSAGE_KEYS: Record<string, string> = {
  "Connection verified.": "connected",
  "Configuration is present, but full verification was not possible.": "unverified",
  "Required setup is missing.": "missing",
  "Configuration was checked and looks invalid.": "invalid",
  "This channel is not supported by the WebUI setup checker.": "unsupported",
  "Configured.": "present",
  "Required.": "required",
  "This channel can be checked from saved fields, but not fully verified in-browser.": "manual",
};
export const validationMessageKey = (message: string): string | undefined => MESSAGE_KEYS[message];

// ---- connect (QR / browser authorization) -----------------------------------

export type ConnectState = "idle" | "waiting" | "done" | "expired" | "error";
const MIN_POLL_MS = 2500;
const DEFAULT_POLL_MS = 5000;

/** qr_url and the link are live login credentials: kept in memory only while pending, never logged. */
export function useChannelConnect(channel: string, instanceId?: string, onFeatures?: (p: NanobotFeaturesPayload) => void) {
  const { mutate } = useSettings();
  const [state, setState] = useState<ConnectState>("idle");
  const [info, setInfo] = useState<ChannelConnectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const sid = useRef<string | null>(null);
  const gen = useRef(0);
  const verify = useRef<string | undefined>(undefined);
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const featuresRef = useRef(onFeatures);
  featuresRef.current = onFeatures;

  const apply = useCallback((p: ChannelConnectPayload) => {
    setInfo((cur) => ({ ...(cur ?? p), ...p, qr_url: p.qr_url ?? cur?.qr_url }));
    setVerificationFailed(!!(p as { verification_failed?: boolean }).verification_failed);
    if (p.nanobot_features) featuresRef.current?.(p.nanobot_features);
    if (p.status === "succeeded") (sid.current = null), setState("done");
    else if (p.status === "expired") (sid.current = null), setState("expired");
    else if (p.status === "failed") (sid.current = null), setState("error"), setError(p.message ?? "failed");
    else if (p.status === "cancelled") (sid.current = null), setState("idle"), setInfo(null);
  }, []);

  const start = useCallback(async (params: Record<string, string | boolean> = {}) => {
    const my = ++gen.current;
    setError(null);
    verify.current = undefined;
    try {
      const p = await mutateRef.current<ChannelConnectPayload>(
        "settings.channel.connect.start",
        { channel, ...(instanceId ? { instance_id: instanceId } : {}), ...params },
        { timeoutMs: 150_000 },
      );
      if (gen.current !== my) {
        // cancelled/unmounted mid-start: don't orphan the host session
        if (p.session_id) void mutateRef.current("settings.channel.connect.cancel", { channel, session_id: p.session_id }).catch(() => {});
        return;
      }
      sid.current = p.session_id;
      setInfo(p);
      setState("waiting");
      apply(p);
    } catch (e) {
      if (gen.current !== my) return;
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, [channel, instanceId, apply]);

  const poll = useCallback(async () => {
    const my = gen.current;
    const id = sid.current;
    if (!id) return;
    const code = verify.current;
    verify.current = undefined; // a verify code is sent once
    try {
      const p = await mutateRef.current<ChannelConnectPayload>(
        "settings.channel.connect.poll",
        { channel, session_id: id, ...(code ? { verify_code: code } : {}) },
        { timeoutMs: 150_000 },
      );
      if (gen.current === my) apply(p);
    } catch (e) {
      if (gen.current !== my) return;
      setError(e instanceof Error ? e.message : String(e));
      if (isPolicyError(e)) (sid.current = null), setState("error"); // permanent; other errors are transient: keep polling
    }
  }, [channel, apply]);

  /** weixin: submit the verification code shown on the phone; sent with the next poll immediately. */
  const submitVerifyCode = useCallback((code: string) => {
    verify.current = code.trim();
    return poll();
  }, [poll]);

  const cancel = useCallback(async () => {
    gen.current++;
    const id = sid.current;
    sid.current = null;
    setInfo(null);
    setState("idle");
    if (id) await mutateRef.current("settings.channel.connect.cancel", { channel, session_id: id }).catch(() => {});
  }, [channel]);

  useEffect(
    () => () => {
      gen.current++;
      const id = sid.current;
      if (id) void mutateRef.current("settings.channel.connect.cancel", { channel, session_id: id }).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channel],
  );

  usePolling({
    enabled: state === "waiting",
    intervalMs: Math.max(MIN_POLL_MS, info?.interval_ms ?? DEFAULT_POLL_MS),
    expiresAtMs: info?.expires_at_ms,
    tick: poll,
    onExpire: () => void ((sid.current = null), setState("expired")),
  });

  const url = info?.qr_url;
  return {
    state, error, verificationFailed, message: info?.message,
    qrUrl: url,
    linkUrl: url && /^https?:\/\//i.test(url) ? url : undefined,
    start, cancel, submitVerifyCode,
  };
}

// ---- pairing --------------------------------------------------------------

export function usePairing() {
  const { session } = useSession();
  const { mutate } = useSettings();
  const [data, setData] = useState<PairingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setData(await session.get<PairingPayload>("/api/settings/pairing"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session]);
  useEffect(() => void refresh(), [refresh]);
  const act = useCallback(
    async (action: "approve" | "deny", code: string) => {
      const r = await mutate<PairingPayload>(`settings.pairing.${action}`, { code });
      setData(r);
      return r;
    },
    [mutate],
  );
  const approve = useCallback((code: string) => act("approve", code), [act]);
  const deny = useCallback((code: string) => act("deny", code), [act]);
  return { requests: data?.requests ?? [], lastAction: data?.last_action, error, refresh, approve, deny };
}
