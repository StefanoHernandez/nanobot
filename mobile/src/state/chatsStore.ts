import { createStore, useStore } from "zustand";
import { ApiError, deleteSession, listSessions } from "@/lib/api";
import type { ChatSummary, SidebarStatePayload, WorkspaceScopePayload } from "@/lib/types";
import type { NanobotSession } from "../core/session";

export const isWritable = (key: string): boolean => key.startsWith("websocket:");
export const chatIdOf = (key: string): string => key.slice("websocket:".length);

type Overrides = Record<string, string>;
type S = {
  chats: ChatSummary[];
  loading: boolean;
  session: NanobotSession | null;
  overrides: Overrides;
  bind(session: NanobotSession | null): void;
  refresh(): Promise<void>;
  newChat(scope?: WorkspaceScopePayload | null): Promise<string>;
  newTemporaryChat(): Promise<string>;
  /** Fork before the user message with ordinal `beforeUserIndex`; resolves to the new chat key. */
  fork(key: string, beforeUserIndex: number, title?: string): Promise<string>;
  /** Temporary chats are connection-owned and local-only: never fetched, never persisted. */
  isTemporary(key: string): boolean;
  /** Title a temporary chat from its first user message (no-op once titled). */
  titleTemporary(key: string, firstUserText: string): void;
  /** Forget a temporary chat locally (after discard). Returns whether it was one. */
  dropTemporary(key: string): boolean;
  rename(key: string, title: string): Promise<void>;
  remove(key: string): Promise<void>;
  search(q: string): ChatSummary[];
};

const SIDEBAR = "/api/webui/sidebar-state";
const apply = (rows: ChatSummary[], o: Overrides): ChatSummary[] =>
  rows.map((r) => (o[r.key] ? { ...r, title: o[r.key] } : r));

/** Inlined from upstream lib/temporary-chat.ts: first line of the first user message, capped. */
export function deriveTemporaryChatTitle(text: string): string {
  const line = text.trim().split(/\r?\n/)[0] ?? "";
  return line.length > 40 ? `${line.slice(0, 40).trimEnd()}…` : line;
}

function optimistic(key: string): ChatSummary {
  const now = new Date().toISOString();
  return { key, channel: "websocket", chatId: chatIdOf(key), createdAt: now, updatedAt: now, title: "", preview: "" };
}

export function createChatsStore() {
  let unsubs: (() => void)[] = [];
  const optimisticKeys = new Set<string>();
  const tempKeys = new Set<string>();
  let inflight: Promise<void> | null = null;
  let pending = false;

  return createStore<S>((set, get) => {
    const need = (): NanobotSession => {
      const s = get().session;
      if (!s) throw new Error("no session");
      return s;
    };
    return {
      chats: [],
      loading: false,
      session: null,
      overrides: {},

      bind(session) {
        unsubs.forEach((u) => u());
        unsubs = [];
        optimisticKeys.clear();
        tempKeys.clear();
        inflight = null; // a refresh still running for the previous session must not serve this one
        pending = false;
        set({ session, chats: [], overrides: {}, loading: false });
        if (!session) return;
        unsubs.push(
          session.client.onSessionUpdate(() => void get().refresh()),
          session.client.onSidebarStateUpdate((st: SidebarStatePayload) => {
            const overrides = st.title_overrides ?? {};
            set((x) => ({ overrides, chats: apply(x.chats, overrides) }));
          }),
        );
      },

      // Single-flight with a trailing re-run, like WebUI useSessions.refresh (useSessions.ts:233).
      refresh() {
        pending = true;
        if (inflight) return inflight;
        const session = get().session;
        if (!session) return Promise.resolve();
        set({ loading: true });
        let mine!: Promise<void>;
        mine = (async () => {
          try {
            while (pending && get().session === session) {
              pending = false;
              try {
                let rows: ChatSummary[];
                try {
                  rows = await listSessions(session.apiToken(), session.baseUrl);
                } catch (e) {
                  if (!(e instanceof ApiError && e.status === 401)) throw e;
                  await session.get(SIDEBAR).catch(() => {}); // rotates the api token on 401
                  rows = await listSessions(session.apiToken(), session.baseUrl);
                }
                const side = await session.get<Partial<SidebarStatePayload>>(SIDEBAR).catch(() => null);
                if (get().session !== session) return;
                const overrides = side?.title_overrides ?? get().overrides;
                const keys = new Set(rows.map((r) => r.key));
                for (const k of optimisticKeys) if (keys.has(k)) optimisticKeys.delete(k);
                const extra = get().chats.filter((c) => optimisticKeys.has(c.key));
                set({ chats: apply([...rows, ...extra], overrides), overrides });
              } catch {
                // keep the previous list; the next session_updated or resume retries
              }
            }
          } finally {
            if (inflight === mine) inflight = null;
            if (get().session === session) set({ loading: false });
          }
        })();
        inflight = mine;
        return mine;
      },

      async newChat(scope) {
        const key = `websocket:${await need().client.newChat(undefined, scope)}`;
        optimisticKeys.add(key);
        set((x) => ({ chats: [optimistic(key), ...x.chats] }));
        return key;
      },

      async newTemporaryChat() {
        // Temporary chats are connection-owned and never listed by the server.
        const key = `websocket:${await need().client.newTemporaryChat()}`;
        optimisticKeys.add(key);
        tempKeys.add(key);
        set((x) => ({ chats: [optimistic(key), ...x.chats] }));
        return key;
      },

      async fork(key, beforeUserIndex, title) {
        const nk = `websocket:${await need().client.forkChat(chatIdOf(key), beforeUserIndex, title)}`;
        optimisticKeys.add(nk);
        set((x) => ({ chats: [{ ...optimistic(nk), title: title ?? "" }, ...x.chats] }));
        return nk;
      },

      isTemporary: (key) => tempKeys.has(key),

      titleTemporary(key, text) {
        if (!tempKeys.has(key)) return;
        const title = deriveTemporaryChatTitle(text);
        if (!title) return;
        set((x) => ({ chats: x.chats.map((c) => (c.key === key && !c.title ? { ...c, title, preview: title } : c)) }));
      },

      dropTemporary(key) {
        if (!tempKeys.delete(key)) return false;
        optimisticKeys.delete(key);
        set((x) => ({ chats: x.chats.filter((c) => c.key !== key) }));
        return true;
      },

      // Rename = sidebar.update with title_overrides, as WebUI useSidebarState does.
      async rename(key, title) {
        const s = need();
        const current = await s.get<SidebarStatePayload>(SIDEBAR);
        const overrides = { ...(current.title_overrides ?? {}) };
        const t = title.trim();
        if (t) overrides[key] = t;
        else delete overrides[key]; // empty title clears the override, as in the WebUI
        const saved = await s.client.setSidebarState({ ...current, title_overrides: overrides });
        const next = saved?.title_overrides ?? overrides;
        set((x) => ({ overrides: next, chats: apply(x.chats, next) }));
        if (!t) await get().refresh(); // restore the server title
      },

      async remove(key) {
        if (tempKeys.has(key)) {
          need().client.discardTemporaryChat(chatIdOf(key));
          get().dropTemporary(key);
          return;
        }
        await deleteSession(need().client, key);
        optimisticKeys.delete(key);
        set((x) => ({ chats: x.chats.filter((c) => c.key !== key) }));
      },

      search(q) {
        const n = q.trim().toLowerCase();
        if (!n) return get().chats;
        return get().chats.filter((c) => `${c.title ?? ""} ${c.preview} ${c.key}`.toLowerCase().includes(n));
      },
    };
  });
}

export const chatsStore = createChatsStore();
export const useChats = <T = S>(selector: (s: S) => T = (s) => s as unknown as T): T => useStore(chatsStore, selector);
