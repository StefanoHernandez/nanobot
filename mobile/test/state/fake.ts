import type { InboundEvent } from "@/lib/types";
import type { NanobotSession } from "../../src/core/session";

type Routes = Record<string, unknown | (() => unknown)>;

export function fakeSession(routes: Routes = {}, pending: Record<string, Record<string, unknown>[]> = {}) {
  const chat = new Map<string, Set<(e: InboundEvent) => void>>();
  const status = new Set<(s: string) => void>();
  const upd = new Set<(chatId: string, scope?: string, ws?: unknown) => void>();
  const errs = new Set<(e: unknown) => void>();
  const side = new Set<(s: unknown) => void>();
  const run = new Set<(chatId: string, at: number | null) => void>();
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
    onRunStatus: (h: (c: string, a: number | null) => void) => (run.add(h), () => void run.delete(h)),
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
      if (runAt !== null) { runAt = null; runGen++; run.forEach((h) => h(id, null)); }
      return true;
    }),
  };
  const get = jest.fn(async (path: string) => {
    const r = routes[path];
    if (r === undefined) throw new Error(`404 ${path}`);
    return typeof r === "function" ? (r as () => unknown)() : r;
  });
  const session = { client, get, apiToken: () => "tok", baseUrl: "http://h", state: "open", capabilities: new Set<string>() } as unknown as NanobotSession;
  return {
    session, client, get, sent, attached, routes,
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
    runStatus: (c: string, a: number | null) => run.forEach((h) => h(c, a)),
  };
}

export const flush = () => new Promise<void>((r) => setImmediate(() => r()));

export const thread = (events: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  projection: "events",
  events,
  ...extra,
});
