import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MarketplaceProvider,
  SkillActionPayload,
  SkillDetail,
  SkillInstallPayload,
  SkillsPayload,
  SkillsSearchPayload,
  SkillsTrendingPayload,
  SkillSummary,
} from "@/lib/types";
import { useSession } from "../state/sessionStore";
import { useSettings } from "../settings/store";
import { installGate, longMutation } from "./common";

const policyError = () =>
  Object.assign(new Error("Remote package installation is disabled on the host"), { policy: true, status: 403 });

export function useSkills() {
  const { session } = useSession();
  const { data: settings, mutate } = useSettings();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const refresh = useCallback(async () => {
    if (!session) return;
    const my = ++gen.current;
    setLoading(true);
    try {
      const p = await session.get<SkillsPayload>("/api/webui/skills");
      if (gen.current !== my) return;
      setSkills(p.skills ?? []);
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

  const search = useCallback(
    async (query: string, provider: MarketplaceProvider = "all") => {
      if (!session) return { skills: [] };
      const q = encodeURIComponent(query);
      return session.get<SkillsSearchPayload>(`/api/webui/skills/search?q=${q}&provider=${provider}`);
    },
    [session],
  );

  const trending = useCallback(
    async (provider: MarketplaceProvider = "all") => {
      if (!session) return { skills: [] };
      return session.get<SkillsTrendingPayload>(`/api/webui/skills/trending?provider=${provider}`);
    },
    [session],
  );

  const discover = useCallback(() => trending("all"), [trending]);

  const detail = useCallback(
    async (name: string) => {
      if (!session) throw new Error("No session");
      return session.get<SkillDetail>(`/api/webui/skills/${encodeURIComponent(name)}`);
    },
    [session],
  );

  const install = useCallback(
    async (provider: string, source: string, skill: string, version?: string) => {
      if (!installGate(settings).allowed) {
        throw policyError();
      }
      const res = await longMutation<SkillInstallPayload>(mutate, "skill.install", {
        provider,
        source,
        skill,
        ...(version ? { version } : {}),
      });
      if (res.timedOut) {
        await refresh();
      } else if (res.result) {
        setSkills(res.result.skills ?? []);
      }
      return res;
    },
    [settings, mutate, refresh],
  );

  const update = useCallback(
    async (name: string, enabled: boolean) => {
      const p = await mutate<SkillActionPayload>("skill.update", { name, enabled });
      if (p?.skills) setSkills(p.skills);
      return p;
    },
    [mutate],
  );

  return {
    skills,
    loading,
    error,
    refresh,
    discover,
    search,
    trending,
    detail,
    install,
    update,
  };
}
