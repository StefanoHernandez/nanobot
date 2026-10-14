import "../../src/platform/install";
import { NanobotClient } from "@/lib/nanobot-client";
import { createThreadStore } from "../../src/state/threadStore";
import { flush, thread } from "./fake";
import type { NanobotSession } from "../../src/core/session";

const KEY = "websocket:c1";
const PATH = `/api/sessions/${encodeURIComponent(KEY)}/webui-thread`;

class Sock {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  push(o: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify({ chat_id: "c1", ...o }) }); }
  drop() { this.readyState = 3; this.onclose?.({ code: 1006, reason: "" }); }
}

const T1 = { turn_id: "t1" };
const T2 = { turn_id: "t2" };
const start = (t: { turn_id: string }, text = "hi") =>
  ({ event: "user_message", text, starts_turn: true, active_turn_id: t.turn_id, started_at: 1000, ...t });

async function setup() {
  jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  const socks: Sock[] = [];
  const client = new NanobotClient({ url: "ws://x", socketFactory: () => (socks.push(new Sock()), socks.at(-1) as unknown as WebSocket) });
  let snapshot: unknown = thread([]);
  let gate: Promise<void> | null = null;
  const session = {
    client, apiToken: () => "t", baseUrl: "http://h", state: "open",
    get: async (path: string) => { if (path !== PATH) throw new Error(path); const g = gate; if (g) await g; return snapshot; },
  } as unknown as NanobotSession;
  const store = createThreadStore();
  client.connect();
  socks[0].open();
  await store.getState().load(session, KEY);
  socks[0].push({ event: "ready", client_id: "me" });
  socks[0].push({ event: "attached" });
  const reconnect = async () => {
    socks.at(-1)!.drop();
    jest.advanceTimersByTime(600);
    await flush();
    return socks.at(-1)!;
  };
  return {
    client, socks, store, reconnect,
    setSnapshot: (s: unknown) => (snapshot = s),
    hold: () => { let r!: () => void; gate = new Promise((x) => (r = x)); return () => { gate = null; r(); }; },
  };
}
const slice = (st: ReturnType<typeof createThreadStore>) => st.getState().threads[KEY];
const assistants = (st: ReturnType<typeof createThreadStore>) => slice(st).messages.filter((m) => m.role === "assistant" && m.kind !== "trace");
afterEach(() => jest.useRealTimers());

test("(a) mid-stream drop, active snapshot: partial once, then one assistant message", async () => {
  const h = await setup();
  const s0 = h.socks[0];
  s0.push(start(T1));
  s0.push({ event: "delta", text: "Hel", ...T1 });
  s0.push({ event: "delta", text: "lo ", ...T1 });
  expect(slice(h.store).running).toBe(true);
  h.setSnapshot(thread([
    { event: "user_message", chat_id: "c1", text: "hi", starts_turn: true, ...T1 },
    { event: "message", chat_id: "c1", text: "Hello ", ...T1 },
  ], { active_turn_id: "t1", has_pending_tool_calls: true }));
  const s1 = await h.reconnect();
  s1.open();
  await flush(); await flush();
  expect(assistants(h.store).map((m) => m.content)).toEqual(["Hello "]);
  expect(slice(h.store).running).toBe(true);
  s1.push({ event: "delta", text: "world", ...T1 });
  s1.push({ event: "stream_end", ...T1 });
  s1.push({ event: "turn_end", ...T1 });
  expect(assistants(h.store)).toHaveLength(1);
  expect(assistants(h.store)[0].content).toBe("Hello world");
  expect(slice(h.store).running).toBe(false);
});

test("(b) turn_end missed offline, settled snapshot -> running false, one message", async () => {
  const h = await setup();
  h.socks[0].push(start(T1));
  h.socks[0].push({ event: "delta", text: "Hello", ...T1 });
  h.setSnapshot(thread([
    { event: "user_message", chat_id: "c1", text: "hi", starts_turn: true, ...T1 },
    { event: "message", chat_id: "c1", text: "Hello world", ...T1 },
    { event: "turn_end", chat_id: "c1", ...T1 },
  ], { completed_turn_ids: ["t1"] }));
  const s1 = await h.reconnect();
  s1.open();
  await flush(); await flush();
  expect(slice(h.store).running).toBe(false);
  expect(h.client.getRunStartedAt("c1")).toBeNull();
  expect(assistants(h.store).map((m) => m.content)).toEqual(["Hello world"]);
});

test("(c) new run starts during the history fetch: live kept, nothing duplicated", async () => {
  const h = await setup();
  const s0 = h.socks[0];
  s0.push(start(T1));
  s0.push({ event: "delta", text: "one", ...T1 });
  s0.push({ event: "turn_end", ...T1 });
  h.setSnapshot(thread([
    { event: "user_message", chat_id: "c1", text: "hi", starts_turn: true, ...T1 },
    { event: "message", chat_id: "c1", text: "one", ...T1 },
    { event: "turn_end", chat_id: "c1", ...T1 },
  ], { completed_turn_ids: ["t1"] }));
  const s1 = await h.reconnect();
  const release = h.hold();
  s1.open(); // hydrate starts, get() pending
  s1.push(start(T2, "again"));
  s1.push({ event: "delta", text: "par", ...T2 });
  release();
  await flush(); await flush();
  const m = slice(h.store).messages;
  expect(m.filter((x) => x.role === "user").map((x) => x.content)).toEqual(["hi", "again"]);
  expect(assistants(h.store).map((x) => x.content)).toEqual(["one", "par"]);
  expect(slice(h.store).running).toBe(true);
});

test("(d) server replays frames of a completed turn after reconnect: fenced, no duplicates", async () => {
  const h = await setup();
  const s0 = h.socks[0];
  s0.push(start(T1));
  s0.push({ event: "delta", text: "done", ...T1 });
  s0.push({ event: "turn_end", ...T1 });
  h.setSnapshot(thread([
    { event: "user_message", chat_id: "c1", text: "hi", starts_turn: true, ...T1 },
    { event: "message", chat_id: "c1", text: "done", ...T1 },
    { event: "turn_end", chat_id: "c1", ...T1 },
  ], { completed_turn_ids: ["t1"] }));
  const s1 = await h.reconnect();
  s1.open();
  await flush(); await flush();
  s1.push(start(T1));
  s1.push({ event: "delta", text: "done", ...T1 });
  s1.push({ event: "stream_end", ...T1 });
  s1.push({ event: "turn_end", ...T1 });
  expect(slice(h.store).messages.filter((x) => x.role === "user")).toHaveLength(1);
  expect(assistants(h.store).map((x) => x.content)).toEqual(["done"]);
  expect(slice(h.store).running).toBe(false);
});

const order = (st: ReturnType<typeof createThreadStore>) =>
  slice(st).messages.filter((m) => m.role !== "user").map((m) => (m.kind === "trace" ? `tool:${m.traces?.join(",")}` : m.content));

test("(e) text, tool row, drop, resume: order text1, tool, text2 (no merge into text1)", async () => {
  const h = await setup();
  const s0 = h.socks[0];
  s0.push(start(T1));
  s0.push({ event: "delta", text: "text1", ...T1 });
  s0.push({ event: "message", text: "read_file(a)", kind: "tool_hint", ...T1 });
  h.setSnapshot(thread([
    { event: "user_message", chat_id: "c1", text: "hi", starts_turn: true, ...T1 },
    { event: "message", chat_id: "c1", text: "text1", ...T1 },
    { event: "message", chat_id: "c1", text: "read_file(a)", kind: "tool_hint", ...T1 },
  ], { active_turn_id: "t1", has_pending_tool_calls: true }));
  const s1 = await h.reconnect();
  s1.open();
  await flush(); await flush();
  s1.push({ event: "delta", text: "text2", ...T1 });
  s1.push({ event: "turn_end", ...T1 });
  expect(order(h.store)).toEqual(["text1", "tool:read_file(a)", "text2"]);
});

test("(f) text1 + stream_end, drop, resume, new deltas: text1 not reopened", async () => {
  const h = await setup();
  const s0 = h.socks[0];
  s0.push(start(T1));
  s0.push({ event: "delta", text: "text1", ...T1 });
  s0.push({ event: "stream_end", resuming: true, ...T1 });
  h.setSnapshot(thread([
    { event: "user_message", chat_id: "c1", text: "hi", starts_turn: true, ...T1 },
    { event: "message", chat_id: "c1", text: "text1", ...T1 },
  ], { active_turn_id: "t1", has_pending_tool_calls: true }));
  const s1 = await h.reconnect();
  s1.open();
  await flush(); await flush();
  s1.push({ event: "delta", text: "text2", ...T1 });
  s1.push({ event: "turn_end", ...T1 });
  expect(order(h.store)).toEqual(["text1", "text2"]);
});
