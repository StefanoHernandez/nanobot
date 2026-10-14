import { useCallback, useEffect } from "react";
import { createStore, useStore } from "zustand";
import type { WorkspaceDirectoriesPayload, WorkspaceScopePayload, WorkspacesPayload } from "@/lib/types";
import type { NanobotSession } from "../core/session";
import { chatIdOf, chatsStore } from "./chatsStore";

type W = {
  scopes: Record<string, WorkspaceScopePayload>;
  /** Last rejection per chat key (e.g. "workspace_scope_rejected:<reason>"); cleared by the next setScope. */
  errors: Record<string, string | null>;
  info: WorkspacesPayload | null;
  setScope(key: string, scope: WorkspaceScopePayload): void;
  setError(key: string, error: string | null): void;
};

export const workspaceStore = createStore<W>((set) => ({
  scopes: {},
  errors: {},
  info: null,
  setScope: (key, scope) => set((s) => ({ scopes: { ...s.scopes, [key]: scope } })),
  setError: (key, error) => set((s) => ({ errors: { ...s.errors, [key]: error } })),
}));

export const withAccessMode = (scope: WorkspaceScopePayload, mode: "restricted" | "full"): WorkspaceScopePayload => ({
  ...scope,
  access_mode: mode,
  restrict_to_workspace: mode === "restricted",
});

/** The chat awaiting a set_workspace_scope reply; errors without a chat id are attributed to it. */
let awaiting: { key: string; scope: WorkspaceScopePayload; done(): void } | null = null;
const same = (a: WorkspaceScopePayload, b: WorkspaceScopePayload) => a.project_path === b.project_path && a.access_mode === b.access_mode;

// Global hooks (never onChat, wiki/known-issues.md): follow the chats store's session.
let unsubs: (() => void)[] = [];
chatsStore.subscribe((s, prev) => {
  if (s.session === prev.session) return;
  unsubs.forEach((u) => u());
  unsubs = [];
  awaiting = null;
  workspaceStore.setState({ scopes: {}, errors: {}, info: null });
  const c = s.session?.client;
  if (!c) return;
  unsubs.push(
    c.onSessionUpdate((chatId, _scope, ws) => {
      if (!ws) return;
      const key = `websocket:${chatId}`;
      workspaceStore.getState().setScope(key, ws);
      if (awaiting?.key === key && same(awaiting.scope, ws)) awaiting.done();
    }),
    c.onError((e) => {
      if (e.kind !== "workspace_scope_rejected") return;
      const key = e.chatId ? `websocket:${e.chatId}` : awaiting?.key;
      if (!key) return;
      workspaceStore.getState().setError(key, `workspace_scope_rejected:${e.reason ?? ""}`);
      if (awaiting?.key === key) awaiting.done();
    }),
  );
});

const SCOPE_TIMEOUT_MS = 8_000;

/** Resolves on the session_updated that matches `scope`; a rejection keeps the old scope, sets `errors[key]` and resolves; rejects on timeout. */
export async function setWorkspaceScope(session: NanobotSession, key: string, scope: WorkspaceScopePayload): Promise<void> {
  workspaceStore.getState().setError(key, null);
  await new Promise<void>((resolve, reject) => {
    const me = {
      key,
      scope,
      done: () => {
        clearTimeout(timer);
        if (awaiting === me) awaiting = null;
        resolve();
      },
    };
    const timer = setTimeout(() => {
      if (awaiting === me) awaiting = null;
      const cur = chatsStore.getState().session;
      if (!cur || cur === session) {
        workspaceStore.getState().setError(key, "workspace_scope_timeout");
      }
      reject(new Error("workspace_scope_timeout"));
    }, SCOPE_TIMEOUT_MS);
    awaiting = me;
    session.client.setWorkspaceScope(chatIdOf(key), scope);
  });
}

export function useWorkspace(key: string) {
  const session = useStore(chatsStore, (s) => s.session);
  const temporary = useStore(chatsStore, (s) => s.isTemporary(key));
  const stored = useStore(workspaceStore, (s) => s.scopes[key] ?? null);
  const listed = useStore(chatsStore, (s) => s.chats.find((c) => c.key === key)?.workspaceScope ?? null);
  const info = useStore(workspaceStore, (s) => s.info);
  const error = useStore(workspaceStore, (s) => s.errors[key] ?? null);
  const off = temporary || !session;

  useEffect(() => {
    if (off || info) return;
    session!
      .get<WorkspacesPayload>("/api/workspaces")
      .then(
        (p) => {
          const cur = chatsStore.getState().session;
          if (!cur || cur === session) workspaceStore.setState({ info: p });
        },
        () => {},
      );
  }, [off, session, info]);

  const browse = useCallback(
    (path: string, q = ""): Promise<WorkspaceDirectoriesPayload> =>
      session!.get(`/api/workspaces/directories?${new URLSearchParams({ path, q, hidden: "0", partial: "0" })}`),
    [session],
  );

  const setScope = useCallback(
    (scope: WorkspaceScopePayload) => (off ? Promise.resolve() : setWorkspaceScope(session!, key, scope)),
    [off, session, key],
  );

  return { scope: off ? null : stored ?? listed, info: off ? null : info, error, browse, setScope };
}
