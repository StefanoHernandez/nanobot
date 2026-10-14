import "../../src/platform/install";
import { chatsStore } from "../../src/state/chatsStore";
import { threadStore } from "../../src/state/threadStore";
import { act, renderHook } from "@testing-library/react-native";
import { useWorkspace, setWorkspaceScope, withAccessMode, workspaceStore } from "../../src/state/workspace";
import { fakeSession, flush, thread } from "./fake";

const path = (k: string) => `/api/sessions/${encodeURIComponent(k)}/webui-thread`;
const user = (t: string, id: string) => ({ event: "user_message", chat_id: "c1", text: t, starts_turn: true, turn_id: id });
const asst = (t: string, id: string) => ({ event: "message", chat_id: "c1", text: t, turn_id: id });
const scope = { project_path: "/p", access_mode: "restricted" as const };

beforeEach(() => {
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ sessions: [] }), text: async () => "" })) as never;
  chatsStore.getState().bind(null);
  threadStore.getState().reset();
});

test("fork resolves to the new key, lists it, and forkBoundary is the projected message count before the boundary", async () => {
  const events = [user("a", "t1"), asst("A", "t1"), user("b", "t2"), asst("B", "t2")];
  const f = fakeSession({ [path("websocket:fork-1")]: thread(events, { fork_boundary_event_index: 2 }), "/api/webui/sidebar-state": {} });
  chatsStore.getState().bind(f.session);
  const key = await chatsStore.getState().fork("websocket:c1", 1, "T");
  expect(f.client.forkChat).toHaveBeenCalledWith("c1", 1, "T");
  expect(key).toBe("websocket:fork-1");
  expect(chatsStore.getState().chats[0]).toMatchObject({ key, title: "T" });
  await threadStore.getState().load(f.session, key);
  expect(threadStore.getState().threads[key].forkBoundary).toBe(2);
});

test("temporary chat: no history fetch, listed locally with derived title, not rehydrated on reconnect", async () => {
  const f = fakeSession({ "/api/webui/sidebar-state": {} });
  chatsStore.getState().bind(f.session);
  const key = await chatsStore.getState().newTemporaryChat();
  expect(chatsStore.getState().isTemporary(key)).toBe(true);
  await threadStore.getState().load(f.session, key);
  expect(threadStore.getState().threads[key]).toMatchObject({ temporary: true, loaded: true });
  threadStore.getState().send(f.session, key, "hello there\nsecond");
  expect(chatsStore.getState().chats[0].title).toBe("hello there");
  await chatsStore.getState().refresh(); // list refresh keeps it, never fetches it
  expect(chatsStore.getState().chats.map((c) => c.key)).toContain(key);
  f.setStatus("closed");
  f.setStatus("open");
  await flush();
  expect(f.get.mock.calls.filter(([p]) => p.includes("webui-thread"))).toEqual([]);
  expect(f.attached).toEqual([chatsStore.getState().chats[0].chatId]); // subscribed once, never re-attached
});

test("leave on a temporary chat discards exactly once; normal chats are untouched", async () => {
  const f = fakeSession({ "/api/webui/sidebar-state": {}, [path("websocket:c1")]: thread([]) });
  chatsStore.getState().bind(f.session);
  const key = await chatsStore.getState().newTemporaryChat();
  threadStore.getState().leave(f.session, key);
  threadStore.getState().leave(f.session, key);
  expect(f.client.discardTemporaryChat).toHaveBeenCalledTimes(1);
  expect(f.client.discardTemporaryChat).toHaveBeenCalledWith("tmp-1");
  expect(chatsStore.getState().chats).toEqual([]);
  threadStore.getState().leave(f.session, "websocket:c1");
  expect(f.client.discardTemporaryChat).toHaveBeenCalledTimes(1);
});

test("setScope sends set_workspace_scope; only the matching session_updated acks", async () => {
  const f = fakeSession({ "/api/webui/sidebar-state": {} });
  chatsStore.getState().bind(f.session);
  const want = withAccessMode(scope, "full");
  const p = setWorkspaceScope(f.session, "websocket:c1", want);
  expect(f.client.setWorkspaceScope).toHaveBeenCalledWith("c1", want);
  let settled = false;
  void p.then(() => (settled = true));
  f.sessionUpdated("c1", { ...want, project_path: "/other" }); // different scope: no ack
  await flush();
  expect(settled).toBe(false);
  f.sessionUpdated("c1", want);
  await p;
  expect(workspaceStore.getState().scopes["websocket:c1"]).toEqual(want);
});

test("setScope rejects on timeout", async () => {
  jest.useFakeTimers();
  try {
    const f = fakeSession({ "/api/webui/sidebar-state": {} });
    chatsStore.getState().bind(f.session);
    const p = setWorkspaceScope(f.session, "websocket:c1", scope);
    const check = expect(p).rejects.toThrow("workspace_scope_timeout");
    jest.advanceTimersByTime(8_001);
    await check;
    expect(workspaceStore.getState().errors["websocket:c1"]).toBe("workspace_scope_timeout");
  } finally {
    jest.useRealTimers();
  }
});

test("workspace_scope_rejected keeps the old scope and sets an error", async () => {
  const f = fakeSession({ "/api/webui/sidebar-state": {} });
  chatsStore.getState().bind(f.session);
  workspaceStore.getState().setScope("websocket:c1", scope);
  const p = setWorkspaceScope(f.session, "websocket:c1", { ...scope, project_path: "/nope" });
  f.error({ kind: "workspace_scope_rejected", reason: "outside", chatId: "c1" });
  await p;
  expect(workspaceStore.getState().scopes["websocket:c1"]).toEqual(scope);
  expect(workspaceStore.getState().errors["websocket:c1"]).toBe("workspace_scope_rejected:outside");
});

test("newChat(scope) passes the scope to the client", async () => {
  const f = fakeSession({ "/api/webui/sidebar-state": {} });
  chatsStore.getState().bind(f.session);
  await chatsStore.getState().newChat(scope);
  expect(f.client.newChat).toHaveBeenCalledWith(undefined, scope);
});

test("useWorkspace: scope from the store, setScope sends set_workspace_scope", async () => {
  const f = fakeSession({ "/api/webui/sidebar-state": {}, "/api/workspaces": { default_access_mode: "restricted" } });
  chatsStore.getState().bind(f.session);
  workspaceStore.getState().setScope("websocket:c1", scope);
  const { result } = await renderHook(() => useWorkspace("websocket:c1"));
  await act(flush);
  expect(result.current.scope).toEqual(scope);
  expect(result.current.info).toMatchObject({ default_access_mode: "restricted" });
  const want = withAccessMode(scope, "full");
  let p!: Promise<void>;
  await act(async () => { p = result.current.setScope(want); });
  expect(f.client.setWorkspaceScope).toHaveBeenCalledWith("c1", want);
  await act(async () => { f.sessionUpdated("c1", want); await p; });
  expect(result.current.scope).toEqual(want);
});

describe("deferred temporary-chat discard", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("unmount then immediate remount does not discard", async () => {
    const f = fakeSession({ "/api/webui/sidebar-state": {} });
    chatsStore.getState().bind(f.session);
    const key = await chatsStore.getState().newTemporaryChat();
    threadStore.getState().scheduleLeave(f.session, key);
    await threadStore.getState().load(f.session, key);
    jest.advanceTimersByTime(1000);
    expect(f.client.discardTemporaryChat).not.toHaveBeenCalled();
    expect(chatsStore.getState().chats.map((c) => c.key)).toEqual([key]);
  });

  test("unmount alone discards exactly once after the delay", async () => {
    const f = fakeSession({ "/api/webui/sidebar-state": {} });
    chatsStore.getState().bind(f.session);
    const key = await chatsStore.getState().newTemporaryChat();
    threadStore.getState().scheduleLeave(f.session, key);
    jest.advanceTimersByTime(100);
    expect(f.client.discardTemporaryChat).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(f.client.discardTemporaryChat).toHaveBeenCalledTimes(1);
    expect(chatsStore.getState().chats).toEqual([]);
  });

  test("reset cancels a pending discard", async () => {
    const f = fakeSession({ "/api/webui/sidebar-state": {} });
    chatsStore.getState().bind(f.session);
    const key = await chatsStore.getState().newTemporaryChat();
    threadStore.getState().scheduleLeave(f.session, key);
    threadStore.getState().reset();
    jest.advanceTimersByTime(1000);
    expect(f.client.discardTemporaryChat).not.toHaveBeenCalled();
  });
});
