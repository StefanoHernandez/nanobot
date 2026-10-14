import { useCallback, useEffect, useRef, useState } from "react";
import type { CliAppInfo, CliAppsPayload, NanobotFeatureInfo, NanobotFeaturesPayload } from "@/lib/types";
import { useSession } from "../state/sessionStore";
import { useSettings } from "../settings/store";
import { installGate, longMutation } from "./common";

const policyError = () =>
  Object.assign(new Error("Remote package installation is disabled on the host"), { policy: true, status: 403 });

export function useCliApps() {
  const { session } = useSession();
  const { data: settings, mutate } = useSettings();
  const [apps, setApps] = useState<CliAppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const refresh = useCallback(async () => {
    if (!session) return;
    const my = ++gen.current;
    setLoading(true);
    try {
      const p = await session.get<CliAppsPayload>("/api/settings/cli-apps");
      if (gen.current !== my) return;
      setApps(p.apps ?? []);
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

  const mutateWithGate = useCallback(
    async (action: "install" | "update" | "uninstall", name: string) => {
      if (!installGate(settings).allowed) {
        throw policyError();
      }
      const res = await longMutation<CliAppsPayload>(mutate, `settings.cli_app.${action}`, { name });
      if (res.timedOut) {
        await refresh();
      } else if (res.result) {
        setApps(res.result.apps ?? []);
      }
      return res;
    },
    [settings, mutate, refresh],
  );

  const install = useCallback((name: string) => mutateWithGate("install", name), [mutateWithGate]);
  const update = useCallback((name: string) => mutateWithGate("update", name), [mutateWithGate]);
  const uninstall = useCallback((name: string) => mutateWithGate("uninstall", name), [mutateWithGate]);

  const testApp = useCallback(
    async (name: string) => {
      const r = await mutate<CliAppsPayload>("settings.cli_app.test", { name });
      if (r?.apps) setApps(r.apps);
      return r;
    },
    [mutate],
  );

  return { apps, loading, error, refresh, install, update, uninstall, test: testApp };
}

export function useFeatures() {
  const { session } = useSession();
  const { data: settings, mutate } = useSettings();
  const [payload, setPayload] = useState<NanobotFeaturesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const refresh = useCallback(async () => {
    if (!session) return;
    const my = ++gen.current;
    setLoading(true);
    try {
      const p = await session.get<NanobotFeaturesPayload>("/api/settings/nanobot-features");
      if (gen.current !== my) return;
      setPayload(p);
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
    async (name: string, instanceId?: string) => {
      if (!installGate(settings).allowed) {
        throw policyError();
      }
      const res = await longMutation<NanobotFeaturesPayload>(mutate, "settings.feature.enable", {
        name,
        ...(instanceId ? { instance_id: instanceId } : {}),
      });
      if (res.timedOut) {
        await refresh();
      } else if (res.result) {
        setPayload(res.result);
      }
      return res;
    },
    [settings, mutate, refresh],
  );

  const disable = useCallback(
    async (name: string, instanceId?: string) => {
      const p = await mutate<NanobotFeaturesPayload>("settings.feature.disable", {
        name,
        ...(instanceId ? { instance_id: instanceId } : {}),
      });
      setPayload(p);
      return p;
    },
    [mutate],
  );

  const features: NanobotFeatureInfo[] = (payload?.features ?? []).filter((f) => f.type !== "channel");

  return {
    features,
    requiresRestart: !!payload?.requires_restart,
    loading,
    error,
    refresh,
    enable,
    disable,
  };
}
