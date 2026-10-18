import { sessionPost } from "../sessionPost";
import type { NanobotSession } from "../../src/core/session";
import {
  exprToRecurrence,
  normalizeKanban,
  normalizeTaskDetail,
  recurrenceToExpr,
  saveKanbanTask,
} from "../../src/ecosystem/kanban";

const session = {
  baseUrl: "https://srv.test/",
  apiToken: () => "tok",
  post: sessionPost,
  get: jest.fn(),
} as unknown as NanobotSession;

test("normalizeKanban keeps the new task fields, links and board titles", () => {
  const snap = normalizeKanban({
    active_board: { id: "main", title: "Main" },
    boards: [{ id: "main", title: "Main", description: "hidden" }, { nope: true }],
    tasks: [
      {
        id: "t1",
        title: "Ship",
        status: "ready",
        priority: "nope",
        assignee_bot_id: "",
        reviewer_bot_id: "rev",
        workspace_mode: "dir",
        recurrence_expr: "every:3600s",
        scheduled_at_ms: 50,
        max_retries: 4,
        retries: 1,
        summary: "did it",
        review_feedback: "ok",
        blocked_reason: "stuck",
        artifacts: ["a.txt", 1],
        description: "d",
      },
    ],
    links: [
      { parent_id: "p", child_id: "t1" },
      { parent_id: "", child_id: "t1" },
    ],
  });

  expect(snap.boards).toEqual([{ id: "main", title: "Main" }]);
  expect(snap.links).toEqual([{ parent_id: "p", child_id: "t1" }]);
  expect(snap.tasks[0]).toMatchObject({
    priority: "medium",
    assignee_bot_id: null,
    reviewer_bot_id: "rev",
    workspace_mode: "dir",
    recurrence_expr: "every:3600s",
    scheduled_at_ms: 50,
    max_retries: 4,
    retries: 1,
    summary: "did it",
    review_feedback: "ok",
    blocked_reason: "stuck",
    artifacts: ["a.txt"],
    description: "d",
  });
});

test("a task with no extra fields uses safe defaults", () => {
  const snap = normalizeKanban({
    active_board: { id: "main" },
    tasks: [{ id: "t", title: "T", status: "todo", scheduled_at_ms: true, workspace_mode: "nope", max_retries: false }],
  });
  expect(snap.tasks[0]).toMatchObject({
    workspace_mode: "scratch",
    recurrence_expr: "",
    scheduled_at_ms: null,
    max_retries: 2,
    retries: 0,
    summary: "",
    review_feedback: "",
    blocked_reason: "",
    artifacts: [],
    reviewer_bot_id: null,
  });
  expect(snap.links).toEqual([]);
  expect(snap.boards).toEqual([]);
});

test("normalizeTaskDetail reads the task, runs and messages", () => {
  const detail = normalizeTaskDetail({
    task: { id: "t", title: "T", status: "blocked" },
    parents: [{ id: "p", title: "Parent", status: "done" }],
    children: [],
    runs: [{ id: "r1", bot_id: "bot", status: "failed", error: "boom", started_at_ms: 10, finished_at_ms: 20, summary: "" }],
    messages: [{ id: "m1", author_name: "You", content: "hi" }],
  });
  expect(detail.task.blocked_reason).toBe("");
  expect(detail.parents.map((task) => task.id)).toEqual(["p"]);
  expect(detail.runs).toEqual([
    { id: "r1", bot_id: "bot", status: "failed", summary: "", error: "boom", started_at_ms: 10, finished_at_ms: 20 },
  ]);
  expect(detail.messages).toEqual([{ id: "m1", author_name: "You", content: "hi" }]);
});

test("recurrence helpers round-trip and clamp to the server bounds", () => {
  expect(recurrenceToExpr(1, "minutes")).toBe("every:60s");
  expect(recurrenceToExpr(2, "hours")).toBe("every:7200s");
  expect(recurrenceToExpr(1, "days")).toBe("every:86400s");
  expect(recurrenceToExpr(0, "minutes")).toBe("every:60s");
  expect(recurrenceToExpr(100, "days")).toBe("every:2592000s");
  expect(exprToRecurrence("")).toBeNull();
  expect(exprToRecurrence("every:7200s")).toEqual({ n: 2, unit: "hours" });
  expect(exprToRecurrence("every:2592000s")).toEqual({ n: 30, unit: "days" });
});

test("a failed kanban POST throws the server code", async () => {
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: "cycle" }),
  })) as unknown as typeof fetch;

  await expect(saveKanbanTask(session, { board_id: "main", title: "Hi" })).rejects.toMatchObject({
    status: 409,
    code: "cycle",
  });
});
