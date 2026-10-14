import "../../src/platform/install";
import { chatsStore } from "../../src/state/chatsStore";
import { threadStore } from "../../src/state/threadStore";
import { cancelSubagent, refreshSubagents, subagentsAvailable, subagentsStore, loadSubagentThread } from "../../src/state/subagentsStore";
import type { NanobotSession } from "../../src/core/session";
import type { SubagentTaskSnapshot } from "@/lib/types";
import { fakeSession, flush, thread } from "./fake";

const KEY = "websocket:c1";
const task = (id: string, o: Record<string, unknown> = {}): SubagentTaskSnapshot => ({
  task_id: id, revision: 1, label: id, task_description: "d", phase: "p", state: "running", elapsed_seconds: 1, iteration: 0,
  created_at: 1, completed_at: null, origin_turn_id: null, origin_message_id: null, result: null, error: null, stop_reason: null,
  partial: false, tool_events: [], receipts: {}, usage: null, ...o,
} as SubagentTaskSnapshot);
const threadRoute = { [`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`]: () => thread([]) };
const listRoute = (tasks: unknown[]) => ({ [`/api/sessions/${encodeURIComponent(KEY)}/subagents`]: () => ({ tasks }) });
const withCaps = (s: NanobotSession, caps: string[]) => Object.assign(s, { capabilities: new Set(caps) });
const tasks = () => subagentsStore.getState().tasks[KEY] ?? [];

beforeEach(() => {
  threadStore.getState().reset();
  subagentsStore.getState().reset();
});

test("live subagent_task updates the store and merges by revision", async () => {
  const f = fakeSession(threadRoute);
  await threadStore.getState().load(f.session, KEY);
  f.emit("c1", { event: "subagent_task", task: task("a") });
  f.emit("c1", { event: "subagent_task", task: task("a", { revision: 2, state: "done" }) });
  f.emit("c1", { event: "subagent_task", task: task("a", { revision: 1, state: "queued" }) }); // stale
  expect(tasks().map((t) => [t.task_id, t.state])).toEqual([["a", "done"]]);
});

test("fetched on open plus live update: no duplicates", async () => {
  const f = fakeSession({ ...threadRoute, ...listRoute([task("a")]) });
  withCaps(f.session, ["webui.subagents.v1"]);
  await threadStore.getState().load(f.session, KEY);
  await refreshSubagents(f.session, KEY);
  f.emit("c1", { event: "subagent_task", task: task("a", { revision: 2 }) });
  f.emit("c1", { event: "subagent_task", task: task("b", { created_at: 2 }) });
  await refreshSubagents(f.session, KEY);
  expect(tasks().map((t) => t.task_id)).toEqual(["a", "b"]);
});

test("events buffered by the vendor before the chat opens reach the store; the store never calls onChat", async () => {
  const f = fakeSession(threadRoute, { c1: [{ event: "subagent_task", task: task("p") }] });
  const spy = jest.spyOn(f.client, "onChat");
  await threadStore.getState().load(f.session, KEY);
  await flush();
  expect(spy).toHaveBeenCalledTimes(1); // threadStore's own subscription only
  expect(tasks().map((t) => t.task_id)).toEqual(["p"]);
});

test("cancel sends subagent.cancel and merges the reply", async () => {
  const f = fakeSession(threadRoute);
  const mutate = jest.fn(async () => task("a", { revision: 2, state: "cancelled" }));
  await cancelSubagent(Object.assign(f.session, { mutate }), KEY, "a");
  expect(mutate).toHaveBeenCalledWith("subagent.cancel", { session_key: KEY, task_id: "a" });
  expect(tasks()[0].state).toBe("cancelled");
});

test("availability: capability, websocket key, non-temporary", async () => {
  const f = fakeSession(threadRoute);
  withCaps(f.session, []);
  expect(subagentsAvailable(f.session, KEY)).toBe(false);
  withCaps(f.session, ["webui.subagents.v1"]);
  expect(subagentsAvailable(f.session, KEY)).toBe(true);
  expect(subagentsAvailable(f.session, "cli:x")).toBe(false);
  chatsStore.getState().bind(f.session);
  const tmp = await chatsStore.getState().newTemporaryChat();
  expect(subagentsAvailable(f.session, tmp)).toBe(false);
  chatsStore.getState().bind(null);
});

test("loadSubagentThread projects the read-only transcript", async () => {
  const f = fakeSession({ [`/api/sessions/${encodeURIComponent(KEY)}/subagents/a/webui-thread`]: thread([{ event: "user_message", chat_id: "c1", text: "hi", starts_turn: true, turn_id: "t" }]) });
  const m = await loadSubagentThread(f.session, KEY, "a");
  expect(m.map((x) => x.content)).toEqual(["hi"]);
});

test("sessionStore.close resets tasks", () => {
  const { sessionStore } = require("../../src/state/sessionStore");
  subagentsStore.getState().ingest(KEY, [task("a")]);
  sessionStore.getState().close();
  expect(tasks()).toEqual([]);
});

test("a refresh in flight when reset() runs does not repopulate the store", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const f = fakeSession({ ...listRoute([]), [`/api/sessions/${encodeURIComponent(KEY)}/subagents`]: async () => (await gate, { tasks: [task("late")] }) });
  withCaps(f.session, ["webui.subagents.v1"]);
  const p = refreshSubagents(f.session, KEY);
  subagentsStore.getState().reset();
  release();
  await p;
  expect(tasks()).toEqual([]);
});
