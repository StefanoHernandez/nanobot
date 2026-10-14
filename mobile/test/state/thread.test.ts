import "../../src/platform/install";
import { createThreadStore } from "../../src/state/threadStore";
import { fakeSession, flush, thread } from "./fake";
import type { UIMessage } from "@/lib/types";
import { prepareImage, uploadFiles } from "../../src/core/upload";

jest.mock("../../src/core/upload", () => ({
  ...jest.requireActual("../../src/core/upload"),
  prepareImage: jest.fn(async (f: unknown) => f),
  uploadFiles: jest.fn(),
}));

const KEY = "websocket:c1";
const slice = (s: ReturnType<typeof createThreadStore>) => s.getState().threads[KEY];

async function setup(history: unknown = thread([])) {
  const f = fakeSession({ [`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`]: () => history });
  const store = createThreadStore();
  await store.getState().load(f.session, KEY);
  return { f, store };
}

const turn = { turn_id: "t1" };
function completeTurn(f: ReturnType<typeof fakeSession>) {
  f.emit("c1", { event: "user_message", text: "hi", starts_turn: true, ...turn });
  for (const text of ["Hel", "lo ", "world"]) f.emit("c1", { event: "delta", text, stream_id: "s1", ...turn });
  f.emit("c1", { event: "stream_end", stream_id: "s1", ...turn });
  f.emit("c1", { event: "turn_end", ...turn });
}

test("user_message + deltas + stream_end + turn_end -> one user, one assistant", async () => {
  const { f, store } = await setup();
  completeTurn(f);
  const m = slice(store).messages;
  expect(m.map((x) => x.role)).toEqual(["user", "assistant"]);
  expect(m[0].content).toBe("hi");
  expect(m[1].content).toBe("Hello world");
  expect(m[1].isStreaming).toBeFalsy();
  expect(slice(store).running).toBe(false);
});

test("reasoning_delta fills reasoning; tool_hint lands in activity row", async () => {
  const { f, store } = await setup();
  f.emit("c1", { event: "user_message", text: "go", starts_turn: true, ...turn });
  f.emit("c1", { event: "reasoning_delta", text: "think", ...turn });
  f.emit("c1", { event: "reasoning_delta", text: "ing", ...turn });
  f.emit("c1", { event: "message", text: "read_file(a.py)", kind: "tool_hint", ...turn });
  const m = slice(store).messages;
  expect(m.some((x) => x.reasoning === "thinking")).toBe(true);
  const trace = m.find((x) => x.kind === "trace");
  expect(trace?.traces).toEqual(["read_file(a.py)"]);
  expect(slice(store).running).toBe(true);
});

test("reconnect + /webui-thread with completed turn -> still one assistant message", async () => {
  const history = thread([
    { event: "user_message", chat_id: "c1", text: "hi", starts_turn: true, ...turn },
    { event: "message", chat_id: "c1", text: "Hello world", ...turn },
    { event: "turn_end", chat_id: "c1", ...turn },
  ], { completed_turn_ids: ["t1"] });
  const { f, store } = await setup();
  f.emit("c1", { event: "user_message", text: "hi", starts_turn: true, ...turn });
  f.emit("c1", { event: "delta", text: "Hello ", ...turn });
  f.emit("c1", { event: "delta", text: "world", ...turn });
  f.routes[`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`] = history;
  f.setStatus("reconnecting");
  f.setStatus("open");
  await flush(); await flush();
  const m = slice(store).messages;
  expect(m.filter((x) => x.role === "assistant" && x.kind !== "trace")).toHaveLength(1);
  expect(m.filter((x) => x.role === "user")).toHaveLength(1);
  expect(slice(store).running).toBe(false);
  expect(m.every((x) => !x.isStreaming)).toBe(true);
});

test("delta changes identity of the streaming message only", async () => {
  const { f, store } = await setup();
  f.emit("c1", { event: "user_message", text: "a", starts_turn: true, ...turn });
  f.emit("c1", { event: "delta", text: "x", ...turn });
  const before = slice(store).messages;
  f.emit("c1", { event: "delta", text: "y", ...turn });
  const after = slice(store).messages;
  expect(after).toHaveLength(before.length);
  const changed = after.filter((m: UIMessage, i: number) => m !== before[i]);
  expect(changed).toHaveLength(1);
  expect(changed[0].isStreaming).toBe(true);
  expect(changed[0].content).toBe("xy");
});

test("send: optimistic user row, /stop frame, guidance while running, drafts", async () => {
  const { f, store } = await setup();
  const s = store.getState();
  s.setDraft(KEY, "typing");
  expect(slice(store).draft).toBe("typing");
  s.send(f.session, KEY, "hello");
  expect(f.sent[0]).toMatchObject({ chatId: "c1", content: "hello" });
  expect(slice(store).messages[0]).toMatchObject({ role: "user", content: "hello", deliveryStatus: "sending" });
  expect(slice(store).running).toBe(true);
  s.send(f.session, KEY, "also this"); // guidance while running
  expect(f.sent[1].options).toMatchObject({ startsNewRun: false });
  s.stop(f.session, KEY);
  expect(f.sent[2].content).toBe("/stop");
  expect(f.client.finishRunLocally).toHaveBeenCalledWith("c1");
  expect(slice(store).running).toBe(false);
});

test("non-writable key never attaches or sends", async () => {
  const f = fakeSession({ [`/api/sessions/${encodeURIComponent("telegram:1")}/webui-thread`]: thread([
    { event: "user_message", chat_id: "1", text: "yo", starts_turn: true },
  ]) });
  const store = createThreadStore();
  await store.getState().load(f.session, "telegram:1");
  store.getState().send(f.session, "telegram:1", "x");
  store.getState().stop(f.session, "telegram:1");
  expect(f.attached).toEqual([]);
  expect(f.sent).toEqual([]);
  expect(store.getState().threads["telegram:1"].messages).toHaveLength(1);
});

test("notices: retry, compaction, fallback model", async () => {
  const { f, store } = await setup();
  f.emit("c1", { event: "retry_status", state: "waiting", attempt: 1, max_attempts: 3, error_kind: "rate_limit", ...turn });
  expect(slice(store).notices.map((n) => n.kind)).toEqual(["retry"]);
  f.emit("c1", { event: "delta", text: "ok", ...turn });
  expect(slice(store).notices).toEqual([]);
  f.emit("c1", { event: "context_compaction", compaction_id: "k1", phase: "succeeded", ...turn });
  f.emit("c1", { event: "turn_model_updated", model_name: "m2", model_preset: "fast", fallback: true });
  expect(slice(store).notices.map((n) => n.kind)).toEqual(["compaction", "fallback"]);
  expect(slice(store)).toMatchObject({ model: "m2", preset: "fast" });
});

test("mid-stream drop: live snapshot keeps live messages, no duplicate, full text after resume", async () => {
  const { f, store } = await setup();
  f.client.reconcileCanonicalCompletion.mockClear(); // initial load reconciles too
  f.emit("c1", { event: "user_message", text: "hi", starts_turn: true, ...turn });
  f.emit("c1", { event: "delta", text: "Hel", ...turn });
  f.emit("c1", { event: "delta", text: "lo ", ...turn });
  f.routes[`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`] = thread([
    { event: "user_message", chat_id: "c1", text: "hi", starts_turn: true, ...turn },
    { event: "message", chat_id: "c1", text: "Hello ", ...turn },
  ], { active_turn_id: "t1" });
  f.setStatus("reconnecting");
  f.setStatus("open");
  await flush(); await flush();
  const assistants = () => slice(store).messages.filter((x) => x.role === "assistant" && x.kind !== "trace");
  expect(assistants()).toHaveLength(1);
  expect(assistants()[0].content).toBe("Hello ");
  expect(slice(store).running).toBe(true);
  expect(f.client.reconcileCanonicalCompletion).not.toHaveBeenCalled();
  f.emit("c1", { event: "delta", text: "world", ...turn });
  f.emit("c1", { event: "turn_end", ...turn });
  expect(assistants()).toHaveLength(1);
  expect(assistants()[0].content).toBe("Hello world");
  expect(slice(store).running).toBe(false);
});

test("turn_end missed while offline: complete snapshot adopted, reconcile once, running false", async () => {
  const { f, store } = await setup();
  f.client.reconcileCanonicalCompletion.mockClear(); // initial load reconciles too
  f.emit("c1", { event: "user_message", text: "hi", starts_turn: true, ...turn });
  f.emit("c1", { event: "delta", text: "Hello", ...turn });
  expect(f.client.getRunStartedAt()).not.toBeNull();
  f.routes[`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`] = thread([
    { event: "user_message", chat_id: "c1", text: "hi", starts_turn: true, ...turn },
    { event: "message", chat_id: "c1", text: "Hello world", ...turn },
    { event: "turn_end", chat_id: "c1", ...turn },
  ], { completed_turn_ids: ["t1"] });
  f.setStatus("reconnecting");
  f.setStatus("open");
  await flush(); await flush();
  expect(f.client.fenceCanonicalCompletedTurns).toHaveBeenCalledWith("c1", ["t1"]);
  expect(f.client.reconcileCanonicalCompletion).toHaveBeenCalledTimes(1);
  expect(f.client.reconcileCanonicalCompletion.mock.calls[0][2]).toContain("t1");
  expect(f.client.getRunStartedAt()).toBeNull();
  expect(slice(store).running).toBe(false);
  expect(slice(store).messages.find((m) => m.role === "assistant")?.content).toBe("Hello world");
  f.emit("c1", { event: "delta", text: "late", ...turn }); // fenced: dropped by client
  expect(slice(store).messages.filter((m) => m.role === "assistant")).toHaveLength(1);
});

test("frames flushed synchronously at subscribe are not lost to hydrate", async () => {
  const f = fakeSession(
    { [`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`]: thread([]) },
    { c1: [
      { event: "user_message", text: "queued", starts_turn: true, turn_id: "t9" },
      { event: "delta", text: "partial", turn_id: "t9" },
    ] },
  );
  const store = createThreadStore();
  await store.getState().load(f.session, KEY);
  const m = slice(store).messages;
  expect(m.map((x) => x.content)).toEqual(["queued", "partial"]);
  expect(slice(store).running).toBe(true);
});

test("stale snapshot lacking a just-sent local message does not replace it", async () => {
  const { f, store } = await setup();
  store.getState().send(f.session, KEY, "unsaved question");
  f.routes[`/api/sessions/${encodeURIComponent(KEY)}/webui-thread`] = thread([]);
  f.setStatus("reconnecting");
  f.setStatus("open");
  await flush(); await flush();
  expect(slice(store).messages.map((m) => m.content)).toEqual(["unsaved question"]);
});

test("stop sets stopped flag, next send clears it", async () => {
  const { f, store } = await setup();
  store.getState().stop(f.session, KEY);
  expect(slice(store).stopped).toBe(true);
  store.getState().send(f.session, KEY, "again");
  expect(slice(store).stopped).toBe(false);
});

describe("send with files", () => {
  const file = { uri: "file:///a.png", name: "a.png", mime: "image/png", size: 10 };
  const withLimits = (f: ReturnType<typeof fakeSession>) =>
    Object.assign(f.session, { limits: { max_count: 4, max_file_bytes: 6 * 2 ** 20, max_total_bytes: 24 * 2 ** 20 } });

  test("uploads, sends refs in media, optimistic row has previews, draft/pendingFiles cleared", async () => {
    const { f, store } = await setup();
    withLimits(f);
    (uploadFiles as jest.Mock).mockResolvedValue([{ reference: "ref1", name: "a.png" }]);
    store.getState().setDraft(KEY, "hi");
    store.getState().setPendingFiles(KEY, [file]);
    const sendSpy = jest.spyOn(f.client, "sendMessage");
    expect(store.getState().send(f.session, KEY, "hi", { files: [file] })).toBe(true);
    expect(slice(store).draft).toBe("hi"); // kept until success
    expect(slice(store).messages[0].media).toEqual([{ kind: "image", url: "file:///a.png", name: "a.png" }]);
    await flush();
    expect(sendSpy).toHaveBeenCalledWith("c1", "hi", [{ reference: "ref1", name: "a.png" }], expect.objectContaining({ turnId: expect.any(String) }));
    expect(slice(store).draft).toBe("");
    expect(slice(store).pendingFiles).toEqual([]);
  });

  test("upload failure keeps draft and chips, sets sendError, marks row failed, never logs", async () => {
    const { f, store } = await setup();
    withLimits(f);
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    (uploadFiles as jest.Mock).mockRejectedValue(new Error("upload_unavailable"));
    store.getState().setDraft(KEY, "hi");
    store.getState().setPendingFiles(KEY, [file]);
    store.getState().send(f.session, KEY, "hi", { files: [file] });
    await flush();
    expect(slice(store).sendError).toBe("upload_unavailable");
    expect(slice(store).draft).toBe("hi");
    expect(slice(store).pendingFiles).toEqual([file]);
    expect(slice(store).messages[0].deliveryStatus).toBe("failed");
    expect(f.sent).toHaveLength(0);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test("validation failure (5 files) sets sendError=count without uploading", async () => {
    const { f, store } = await setup();
    withLimits(f);
    (uploadFiles as jest.Mock).mockClear();
    store.getState().send(f.session, KEY, "x", { files: [file, file, file, file, file] });
    await flush();
    expect(slice(store).sendError).toBe("count");
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  test("oversized jpeg is re-encoded before the size check and accepted; oversized non-image rejected", async () => {
    const { f, store } = await setup();
    withLimits(f);
    const big = { uri: "file:///b.jpg", name: "b.jpg", mime: "image/jpeg", size: 8 * 2 ** 20 };
    (prepareImage as jest.Mock).mockImplementationOnce(async (x: typeof big) => ({ ...x, size: 1000 }));
    (uploadFiles as jest.Mock).mockResolvedValue([{ reference: "r" }]);
    store.getState().send(f.session, KEY, "x", { files: [big] });
    await flush();
    expect(slice(store).sendError).toBeNull();
    expect(f.sent).toHaveLength(1);
    const pdf = { uri: "file:///c.pdf", name: "c.pdf", mime: "application/pdf", size: 8 * 2 ** 20 };
    store.getState().send(f.session, KEY, "y", { files: [pdf] });
    await flush();
    expect(slice(store).sendError).toBe("file_size");
  });

  test("second send while uploading is a no-op", async () => {
    const { f, store } = await setup();
    withLimits(f);
    let done!: (v: unknown) => void;
    (uploadFiles as jest.Mock).mockReturnValue(new Promise((r) => (done = r)));
    expect(store.getState().send(f.session, KEY, "a", { files: [file] })).toBe(true);
    expect(slice(store).uploading).toBe(true);
    expect(store.getState().send(f.session, KEY, "b")).toBe(false);
    done([{ reference: "r" }]);
    await flush();
    expect(slice(store).uploading).toBe(false);
    expect(f.sent).toHaveLength(1);
  });
});
