import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AutomationChatsPayload,
  AutomationChatUpdate,
  AutomationsPayload,
  AutomationUpdatePayload,
  SessionAutomationJob,
} from "@/lib/types";
import type { NanobotSession } from "../core/session";
import { useSession } from "../state/sessionStore";
import { useSettings } from "../settings/store";

export type DayGroupKey = "today" | "tomorrow" | "later";

export type DayGroup = {
  day: DayGroupKey;
  jobs: SessionAutomationJob[];
};

export type GroupedJobs = DayGroup[] & {
  today: SessionAutomationJob[];
  tomorrow: SessionAutomationJob[];
  later: SessionAutomationJob[];
};

export function groupByDay(jobs: SessionAutomationJob[], now: number | Date = Date.now()): GroupedJobs {
  const nowDate = typeof now === "number" ? new Date(now) : now;
  const startOfToday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const endOfToday = startOfToday + 24 * 3600 * 1000;
  const endOfTomorrow = endOfToday + 24 * 3600 * 1000;

  const today: SessionAutomationJob[] = [];
  const tomorrow: SessionAutomationJob[] = [];
  const later: SessionAutomationJob[] = [];

  for (const job of jobs) {
    const runTime = job.state?.next_run_at_ms ?? job.schedule?.at_ms ?? 0;
    if (runTime < endOfToday) {
      today.push(job);
    } else if (runTime < endOfTomorrow) {
      tomorrow.push(job);
    } else {
      later.push(job);
    }
  }

  const sortByTime = (a: SessionAutomationJob, b: SessionAutomationJob) => {
    const timeA = a.state?.next_run_at_ms ?? a.schedule?.at_ms ?? 0;
    const timeB = b.state?.next_run_at_ms ?? b.schedule?.at_ms ?? 0;
    return timeA - timeB;
  };

  today.sort(sortByTime);
  tomorrow.sort(sortByTime);
  later.sort(sortByTime);

  const list: any = [
    { day: "today", jobs: today },
    { day: "tomorrow", jobs: tomorrow },
    { day: "later", jobs: later },
  ];
  list.today = today;
  list.tomorrow = tomorrow;
  list.later = later;

  return list;
}

export async function fetchAutomationChats(
  session: NanobotSession,
  id: string,
  signal?: AbortSignal,
): Promise<AutomationChatsPayload> {
  return session.get<AutomationChatsPayload>(`/api/webui/automations/chats?id=${encodeURIComponent(id)}`);
}

export async function fetchAutomationRunResult(
  session: NanobotSession,
  id: string,
  runAtMs: number,
  kind: "cron" | "local_trigger",
  signal?: AbortSignal,
): Promise<{ response: string | null }> {
  const query = new URLSearchParams({ id, run_at_ms: String(runAtMs), kind });
  return session.get<{ response: string | null }>(`/api/webui/automations/result?${query}`);
}

function toSnakeCaseUpdate(values: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (values.name !== undefined) out.name = values.name;
  if (values.message !== undefined) out.message = values.message;
  if (values.schedule) {
    const s = values.schedule;
    const sched: Record<string, unknown> = { kind: s.kind };
    if (s.at_ms !== undefined || s.atMs !== undefined) sched.at_ms = s.at_ms ?? s.atMs;
    if (s.every_ms !== undefined || s.everyMs !== undefined) sched.every_ms = s.every_ms ?? s.everyMs;
    if (s.expr !== undefined) sched.expr = s.expr;
    if (s.tz !== undefined) sched.tz = s.tz;
    out.schedule = sched;
  }
  return out;
}

export function useAutomations() {
  const { session } = useSession();
  const { mutate } = useSettings();
  const [data, setData] = useState<AutomationsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const refresh = useCallback(async () => {
    if (!session) return;
    const my = ++gen.current;
    setLoading(true);
    try {
      const p = await session.get<AutomationsPayload>("/api/webui/automations");
      if (gen.current !== my) return;
      setData(p);
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

  const run = useCallback(
    async (id: string) => {
      const clickedAtMs = Date.now();
      const payload = await mutate<AutomationsPayload>("automation.run", { id });
      setData(payload);

      let currentPayload = payload;
      let res: { response: string | null } | null = null;

      if (session) {
        const maxAttempts = 30;
        for (let i = 0; i < maxAttempts; i++) {
          const job = currentPayload.jobs?.find((j) => j.id === id);
          if (!job) {
            // job was deleted (e.g. delete_after_run one-shot)
            break;
          }
          const runs = job.state?.run_history;
          const newestRun = runs && runs.length > 0 ? runs[runs.length - 1] : undefined;
          if (newestRun && newestRun.run_at_ms >= clickedAtMs) {
            try {
              res = await fetchAutomationRunResult(
                session,
                id,
                newestRun.run_at_ms,
                (job.kind as "cron" | "local_trigger") ?? "cron",
              );
            } catch {
              // continue
            }
            break;
          }

          if (i < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            try {
              currentPayload = await session.get<AutomationsPayload>("/api/webui/automations");
              setData(currentPayload);
            } catch {
              // continue
            }
          }
        }
      }
      return { payload: currentPayload, result: res?.response ?? null };
    },
    [mutate, session],
  );

  const enable = useCallback(
    async (id: string) => {
      const p = await mutate<AutomationsPayload>("automation.enable", { id });
      setData(p);
      return p;
    },
    [mutate],
  );

  const disable = useCallback(
    async (id: string) => {
      const p = await mutate<AutomationsPayload>("automation.disable", { id });
      setData(p);
      return p;
    },
    [mutate],
  );

  const deleteAction = useCallback(
    async (id: string) => {
      const p = await mutate<AutomationsPayload>("automation.delete", { id });
      setData(p);
      return p;
    },
    [mutate],
  );

  const update = useCallback(
    async (id: string, values: AutomationUpdatePayload) => {
      const cleanValues = toSnakeCaseUpdate(values);
      const p = await mutate<AutomationsPayload>("automation.update", { id, values: cleanValues });
      setData(p);
      return p;
    },
    [mutate],
  );

  const changeChat = useCallback(
    async (id: string, values: AutomationChatUpdate) => {
      const p = await mutate<AutomationsPayload>("automation.change_chat", { id, values });
      setData(p);
      return p;
    },
    [mutate],
  );

  const result = useCallback(
    (id: string, runAtMs: number, kind: "cron" | "local_trigger") => {
      if (!session) throw new Error("No session");
      return fetchAutomationRunResult(session, id, runAtMs, kind);
    },
    [session],
  );

  const jobs = (data?.jobs ?? []).filter((j) => !j.protected);

  return {
    jobs,
    loading,
    error,
    refresh,
    run,
    enable,
    disable,
    delete: deleteAction,
    update,
    changeChat,
    result,
  };
}
