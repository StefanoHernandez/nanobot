import type { InboundEvent } from "@/lib/types";
import type { NanobotSession } from "../../src/core/session";

// The client reports a RunState; tests still speak in startedAt-or-null.
type RunState = { active: boolean; generation: number; latestTurnId: string | null; startedAt: number | null; unsettled: boolean };
const runState = (startedAt: number | null): RunState => ({ active: startedAt !== null, generation: 0, latestTurnId: null, startedAt, unsettled: false });

type Routes = Record<string, unknown | (() => unknown)>;

export function fakeSession(routes: Routes = {}, pending: Record<string, Record<string, unknown>[]> = {}) {
  const chat = new Map<string, Set<(e: InboundEvent) => void>>();
  const status = new Set<(s: string) => void>();
  const upd = new Set<(chatId: string, scope?: string, ws?: unknown) => void>();
  const errs = new Set<(e: unknown) => void>();
  const side = new Set<(s: unknown) => void>();
  const run = new Set<(chatId: string, state: RunState) => void>();
  const sent: { chatId: string; content: string; options?: Record<string, unknown> }[] = [];
  const attached: string[] = [];
  // Realistic run tracking: live from the first user_message/delta until turn_end or reconcile.
  let runAt: number | null = null;
  let runGen = 0;
  const fences = new Set<string>();
  const client = {
    status: "open",
    onChat(id: string, h: (e: InboundEvent) => void) {
      attached.push(id);
      if (!chat.has(id)) chat.set(id, new Set());
      chat.get(id)!.add(h);
      for (const e of pending[id]?.splice(0) ?? []) h({ chat_id: id, ...e } as InboundEvent); // synchronous flush like the vendor

      return () => void chat.get(id)!.delete(h);
    },
    sendMessage(chatId: string, content: string, _m?: unknown, options?: Record<string, unknown>) {
      sent.push({ chatId, content, options });
      return true;
    },
    onStatus: (h: (s: string) => void) => (status.add(h), () => void status.delete(h)),
    onSessionUpdate: (h: (c: string, s?: string, ws?: unknown) => void) => (upd.add(h), () => void upd.delete(h)),
    onSidebarStateUpdate: (h: (s: unknown) => void) => (side.add(h), () => void side.delete(h)),
    onRunStatus: (h: (c: string, s: RunState) => void) => (run.add(h), () => void run.delete(h)),
    onError: (h: (e: unknown) => void) => (errs.add(h), () => void errs.delete(h)),
    forkChat: jest.fn(async () => "fork-1"),
    discardTemporaryChat: jest.fn(),
    setWorkspaceScope: jest.fn(),
    onRuntimeModelUpdate: () => () => {},
    newChat: jest.fn(async () => "new-1"),
    newTemporaryChat: jest.fn(async () => "tmp-1"),
    finishRunLocally: jest.fn(),
    setSidebarState: jest.fn(async (s: unknown) => s),
    requestMutation: jest.fn(async () => ({})),
    getRunStartedAt: (_id?: string): number | null => runAt,
    getRunGeneration: (_id?: string) => runGen,
    fenceCanonicalCompletedTurns: jest.fn((_id: string, ids: readonly string[]) => ids.forEach((i) => fences.add(i))),
    canReconcileCanonicalCompletion: jest.fn((_id: string, _g: number, _ids: readonly string[], snap?: { activeTurnId?: string | null; hasPendingToolCalls: boolean }) =>
      !snap?.activeTurnId && !snap?.hasPendingToolCalls),
    reconcileCanonicalCompletion: jest.fn((id: string, _g: number, ids: readonly string[], snap?: { activeTurnId?: string | null; hasPendingToolCalls: boolean }) => {
      ids.forEach((i) => fences.add(i));
      if (snap?.activeTurnId || snap?.hasPendingToolCalls) return false;
      if (runAt !== null) { runAt = null; runGen++; run.forEach((h) => h(id, runState(null))); }
      return true;
    }),
  };
  const get = jest.fn(async (path: string) => {
    const r = routes[path];
    if (r !== undefined) return typeof r === "function" ? (r as () => unknown)() : r;
    const res = await globalThis.fetch(`http://h${path}`, {
      method: "GET",
      headers: { Authorization: "Bearer tok" },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    return (await res.json()) as unknown;
  });
  const post = jest.fn(async (path: string, body?: unknown) => {
    const r = routes[path];
    if (r !== undefined) return typeof r === "function" ? (r as (b?: unknown) => unknown)(body) : r;
    const res = await globalThis.fetch(`http://h${path}`, {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let code = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data?.error) code = data.error;
      } catch {}
      const err = new Error(code);
      (err as any).status = res.status;
      throw err;
    }
    return (await res.json()) as unknown;
  });
  const session = { client, get, post, apiToken: () => "tok", baseUrl: "http://h", state: "open", capabilities: new Set<string>() } as unknown as NanobotSession;
  return {
    session, client, get, post, sent, attached, routes,
    emit: (chatId: string, ev: Record<string, unknown>) => {
      if (ev.event === "turn_end") runAt = null;
      else if (ev.event === "user_message" || ev.event === "delta") runAt = runAt ?? 1;
      const t = ev.turn_id as string | undefined;
      if (t && fences.has(t)) return; // client drops frames for fenced completed turns
      chat.get(chatId)?.forEach((h) => h({ chat_id: chatId, ...ev } as InboundEvent));
    },
    setStatus: (s: string) => status.forEach((h) => h(s)),
    sessionUpdated: (chatId: string, ws?: unknown) => upd.forEach((h) => h(chatId, "metadata", ws)),
    error: (e: unknown) => errs.forEach((h) => h(e)),
    sidebar: (s: unknown) => side.forEach((h) => h(s)),
    runStatus: (c: string, a: number | null) => run.forEach((h) => h(c, runState(a))),
  };
}

export const flush = () => new Promise<void>((r) => setImmediate(() => r()));

export const thread = (events: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  projection: "events",
  events,
  ...extra,
});
