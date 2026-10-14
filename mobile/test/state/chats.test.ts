import "../../src/platform/install";
import { createChatsStore, isWritable } from "../../src/state/chatsStore";
import { fakeSession, flush } from "./fake";

const rows = (titles: string[]) => ({
  sessions: titles.map((t, i) => ({
    key: `websocket:c${i}`, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
    title: t, preview: `p${i}`, model_preset: null,
  })),
});

function mockFetch(getBody: () => unknown) {
  globalThis.fetch = jest.fn(async () => ({
    ok: true, status: 200, json: async () => getBody(), text: async () => "",
  })) as never;
}

test("isWritable only for websocket: keys", () => {
  expect(isWritable("websocket:abc")).toBe(true);
  expect(isWritable("telegram:1")).toBe(false);
});

test("refresh maps /api/sessions rows; session_updated refreshes title", async () => {
  let titles = ["First"];
  mockFetch(() => rows(titles));
  const f = fakeSession({ "/api/webui/sidebar-state": { title_overrides: {} } });
  const store = createChatsStore();
  store.getState().bind(f.session);
  await store.getState().refresh();
  expect(store.getState().chats).toMatchObject([
    { key: "websocket:c0", channel: "websocket", chatId: "c0", title: "First", preview: "p0" },
  ]);
  titles = ["Renamed"];
  f.sessionUpdated("c0");
  await flush(); await flush();
  expect(store.getState().chats[0].title).toBe("Renamed");
});

test("sidebar title overrides apply; rename writes sidebar state; search; remove", async () => {
  mockFetch(() => rows(["Alpha", "Beta"]));
  const f = fakeSession({ "/api/webui/sidebar-state": { schema_version: 1, title_overrides: { "websocket:c1": "Gamma" } } });
  const store = createChatsStore();
  store.getState().bind(f.session);
  await store.getState().refresh();
  expect(store.getState().chats.map((c) => c.title)).toEqual(["Alpha", "Gamma"]);
  expect(store.getState().search("gam").map((c) => c.key)).toEqual(["websocket:c1"]);
  await store.getState().rename("websocket:c0", "Zed");
  expect(f.client.setSidebarState).toHaveBeenCalledWith(
    expect.objectContaining({ title_overrides: { "websocket:c1": "Gamma", "websocket:c0": "Zed" } }),
  );
  expect(store.getState().chats[0].title).toBe("Zed");
  await store.getState().remove("websocket:c0");
  expect(f.client.requestMutation).toHaveBeenCalledWith("session.delete", { key: "websocket:c0" }, expect.any(Number));
  expect(store.getState().chats.map((c) => c.key)).toEqual(["websocket:c1"]);
});

test("newChat returns websocket: key and lists it optimistically", async () => {
  mockFetch(() => rows([]));
  const f = fakeSession({ "/api/webui/sidebar-state": {} });
  const store = createChatsStore();
  store.getState().bind(f.session);
  const key = await store.getState().newChat();
  expect(key).toBe("websocket:new-1");
  expect(store.getState().chats.map((c) => c.key)).toContain(key);
  expect(await store.getState().newTemporaryChat()).toBe("websocket:tmp-1");
});

test("rename trims; empty title clears the override", async () => {
  mockFetch(() => rows(["Alpha"]));
  const f = fakeSession({ "/api/webui/sidebar-state": { schema_version: 1, title_overrides: { "websocket:c0": "Old" } } });
  const store = createChatsStore();
  store.getState().bind(f.session);
  await store.getState().refresh();
  await store.getState().rename("websocket:c0", "  New  ");
  expect(f.client.setSidebarState).toHaveBeenLastCalledWith(expect.objectContaining({ title_overrides: { "websocket:c0": "New" } }));
  await store.getState().rename("websocket:c0", "   ");
  expect(f.client.setSidebarState).toHaveBeenLastCalledWith(expect.objectContaining({ title_overrides: {} }));
});

test("a refresh in flight for session A does not block session B after bind(B)", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let call = 0;
  globalThis.fetch = jest.fn(async () => {
    if (++call === 1) await gate; // session A's list request hangs
    return { ok: true, status: 200, json: async () => rows(call === 1 ? ["A"] : ["B"]), text: async () => "" };
  }) as never;
  const a = fakeSession({ "/api/webui/sidebar-state": { title_overrides: {} } });
  const b = fakeSession({ "/api/webui/sidebar-state": { title_overrides: {} } });
  const store = createChatsStore();
  store.getState().bind(a.session);
  const pa = store.getState().refresh();
  store.getState().bind(b.session);
  await store.getState().refresh();
  expect(store.getState().chats.map((c) => c.title)).toEqual(["B"]);
  release();
  await pa;
  expect(store.getState().chats.map((c) => c.title)).toEqual(["B"]);
});
