import { useCallback, useEffect } from "react";
import { createStore, useStore } from "zustand";
import { cancelSubagentTask, parseWebuiThreadPayload } from "@/lib/api";
import { isSubagentTask, mergeSubagentTasks, type ObservedSubagentTask } from "@/lib/subagent-tasks";
import { projectThreadEvents } from "@/lib/thread-event-projection";
import type { SubagentTaskSnapshot, UIMessage } from "@/lib/types";
import type { NanobotSession } from "../core/session";
import { chatsStore, isWritable } from "./chatsStore";
import { useSession } from "./sessionStore";

type S = {
  tasks: Record<string, ObservedSubagentTask[]>;
  /** Merge snapshots (live event, list read, cancel reply) into a chat's tasks. */
  ingest(key: string, incoming: SubagentTaskSnapshot[]): void;
  reset(): void;
};

let gen = 0;

/** Fed ONLY from threadStore's onChat handler and from reads; never subscribes to the client itself (wiki/known-issues.md). */
export const subagentsStore = createStore<S>((set) => ({
  tasks: {},
  ingest: (key, incoming) =>
    set((s) => {
      const cur = s.tasks[key] ?? [];
      const next = mergeSubagentTasks(cur, incoming);
      return next === cur ? s : { tasks: { ...s.tasks, [key]: next } };
    }),
  reset: () => {
    gen++; // drops any refresh still in flight
    set({ tasks: {} });
  },
}));

const isTemporary = (key: string) => chatsStore.getState().isTemporary(key);

export const subagentsAvailable = (session: NanobotSession | null, key: string): boolean =>
  !!session && isWritable(key) && !isTemporary(key) && session.capabilities.has("webui.subagents.v1");

const path = (key: string) => `/api/sessions/${encodeURIComponent(key)}/subagents`;
const EMPTY: ObservedSubagentTask[] = [];

async function refresh(session: NanobotSession, key: string) {
  if (!subagentsAvailable(session, key)) return;
  const g = gen;
  const p = await session.get<{ tasks?: unknown[] }>(path(key));
  if (g !== gen) return;
  const tasks = p?.tasks;
  if (!Array.isArray(tasks) || !tasks.every(isSubagentTask)) throw new Error("Invalid subagent tasks response");
  subagentsStore.getState().ingest(key, tasks);
}

export async function cancelSubagent(session: NanobotSession, key: string, taskId: string) {
  const snap = await cancelSubagentTask({ requestMutation: (a: string, p: Record<string, unknown>) => session.mutate(a, p) } as never, key, taskId);
  subagentsStore.getState().ingest(key, [snap]);
}

export function useSubagents(key: string) {
  const { session } = useSession();
  const tasks = useStore(subagentsStore, (s) => s.tasks[key] ?? EMPTY);
  const doRefresh = useCallback(() => (session ? refresh(session, key) : Promise.resolve()), [session, key]);
  useEffect(() => {
    doRefresh().catch(() => {});
  }, [doRefresh]);
  const cancel = useCallback(async (taskId: string) => void (session && (await cancelSubagent(session, key, taskId))), [session, key]);
  return { tasks, refresh: doRefresh, cancel };
}

/** Read-only transcript of one subagent task. */
export async function loadSubagentThread(session: NanobotSession, key: string, taskId: string): Promise<UIMessage[]> {
  const raw = await session.get<unknown>(`${path(key)}/${encodeURIComponent(taskId)}/webui-thread`);
  return projectThreadEvents(parseWebuiThreadPayload(raw).events);
}

export { refresh as refreshSubagents };
