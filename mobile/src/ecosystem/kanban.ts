import type { NanobotSession } from "../core/session";

export const KANBAN_COLUMNS = [
  "triage",
  "todo",
  "ready",
  "running",
  "review",
  "blocked",
  "done",
] as const;

export type KanbanColumnStatus = (typeof KANBAN_COLUMNS)[number];
export type KanbanStatus = KanbanColumnStatus | "archived";
export type KanbanPriority = "low" | "medium" | "high" | "urgent";
export type KanbanWorkspace = "scratch" | "worktree" | "dir";
export type RecurrenceUnit = "minutes" | "hours" | "days";

export type KanbanBoard = {
  id: string;
  title: string;
};

export type KanbanBot = {
  id: string;
  name: string;
  icon: string;
  role_prompt: string;
  model_preset: string;
  max_concurrent: number;
};

export type KanbanMessage = {
  id: string;
  author_name: string;
  content: string;
};

export type KanbanTask = {
  id: string;
  title: string;
  status: KanbanStatus;
  priority: KanbanPriority;
  assignee_bot_id: string | null;
  description: string;
  reviewer_bot_id: string | null;
  workspace_mode: KanbanWorkspace;
  recurrence_expr: string;
  scheduled_at_ms: number | null;
  max_retries: number;
  retries: number;
  summary: string;
  review_feedback: string;
  blocked_reason: string;
  artifacts: string[];
};

export type KanbanRun = {
  id: string;
  bot_id: string;
  status: string;
  summary: string;
  error: string;
  started_at_ms: number | null;
  finished_at_ms: number | null;
};

export type KanbanTaskDetail = {
  task: KanbanTask;
  parents: KanbanTask[];
  children: KanbanTask[];
  runs: KanbanRun[];
  messages: KanbanMessage[];
};

export type KanbanSnapshot = {
  boards: KanbanBoard[];
  active_board: KanbanBoard;
  bots: KanbanBot[];
  tasks: KanbanTask[];
  links: { parent_id: string; child_id: string }[];
  messages: KanbanMessage[];
};

export const DEFAULT_BOARD_ID = "main";

export function validateTaskTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 200) return false;
  return !/[\u0000-\u001f\u007f]/.test(trimmed);
}

export function validateBoardMessageContent(content: string): boolean {
  if (content.length < 1 || content.length > 4000) return false;
  return proseOk(content);
}

export function validateBotName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 40) return false;
  return !/[\u0000-\u001f\u007f]/.test(trimmed);
}

export function validateBotIcon(icon: string): boolean {
  return icon.length <= 8 && !/[\u0000-\u001f\u007f]/.test(icon);
}

export function validateRolePrompt(text: string): boolean {
  return text.length <= 8000 && proseOk(text);
}

export function validateReviewFeedback(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= 4000 && proseOk(trimmed);
}

function proseOk(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 127) return false;
  }
  return true;
}

const PRIORITIES = new Set<KanbanPriority>(["low", "medium", "high", "urgent"]);
const STATUSES = new Set<KanbanStatus>([...KANBAN_COLUMNS, "archived"]);
const WORKSPACES = new Set<KanbanWorkspace>(["scratch", "worktree", "dir"]);
const RECURRENCE_MIN_SECONDS = 60;
const RECURRENCE_MAX_SECONDS = 2_592_000;
const UNIT_SECONDS: Record<RecurrenceUnit, number> = { minutes: 60, hours: 3600, days: 86400 };

export function recurrenceToExpr(n: number, unit: RecurrenceUnit): string {
  const raw = Number.isFinite(n) ? Math.round(n * UNIT_SECONDS[unit]) : RECURRENCE_MIN_SECONDS;
  const seconds = Math.min(RECURRENCE_MAX_SECONDS, Math.max(RECURRENCE_MIN_SECONDS, raw));
  return `every:${seconds}s`;
}

export function exprToRecurrence(expr: string): { n: number; unit: RecurrenceUnit } | null {
  const text = expr.trim();
  if (!text) return null;
  const match = /^every:(\d+)s$/.exec(text);
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isInteger(seconds) || seconds < RECURRENCE_MIN_SECONDS || seconds > RECURRENCE_MAX_SECONDS) return null;
  if (seconds % UNIT_SECONDS.days === 0) return { n: seconds / UNIT_SECONDS.days, unit: "days" };
  if (seconds % UNIT_SECONDS.hours === 0) return { n: seconds / UNIT_SECONDS.hours, unit: "hours" };
  return { n: seconds / UNIT_SECONDS.minutes, unit: "minutes" };
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asId(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function asInt(value: unknown, fallback: number, low: number, high: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < low || value > high) return fallback;
  return value;
}

function asMillis(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value;
}

function normalizeTask(row: unknown): KanbanTask | null {
  if (!row || typeof row !== "object") return null;
  const task = row as Partial<KanbanTask>;
  if (typeof task.id !== "string" || !task.id || typeof task.title !== "string" || !task.title) return null;
  if (typeof task.status !== "string" || !STATUSES.has(task.status as KanbanStatus)) return null;
  const priority = PRIORITIES.has(task.priority as KanbanPriority) ? (task.priority as KanbanPriority) : "medium";
  const workspace = WORKSPACES.has(task.workspace_mode as KanbanWorkspace) ? (task.workspace_mode as KanbanWorkspace) : "scratch";
  return {
    id: task.id,
    title: task.title,
    status: task.status as KanbanStatus,
    priority,
    assignee_bot_id: asId(task.assignee_bot_id),
    description: asText(task.description),
    reviewer_bot_id: asId(task.reviewer_bot_id),
    workspace_mode: workspace,
    recurrence_expr: asText(task.recurrence_expr),
    scheduled_at_ms: asMillis(task.scheduled_at_ms),
    max_retries: asInt(task.max_retries, 2, 0, 20),
    retries: asInt(task.retries, 0, 0, 1_000_000),
    summary: asText(task.summary),
    review_feedback: asText(task.review_feedback),
    blocked_reason: asText(task.blocked_reason),
    artifacts: Array.isArray(task.artifacts) ? task.artifacts.filter((item): item is string => typeof item === "string") : [],
  };
}

function normalizeMessages(rows: unknown): KanbanMessage[] {
  if (!Array.isArray(rows)) return [];
  const messages: KanbanMessage[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const msg = row as Partial<KanbanMessage>;
    if (typeof msg.id !== "string" || !msg.id) continue;
    if (typeof msg.author_name !== "string" || typeof msg.content !== "string") continue;
    messages.push({ id: msg.id, author_name: msg.author_name, content: msg.content });
  }
  return messages;
}

function normalizeMaxConcurrent(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20) {
    return value;
  }
  return 1;
}

export function normalizeKanban(data: unknown): KanbanSnapshot {
  if (!data || typeof data !== "object") throw new Error("kanban failed");
  const rec = data as Partial<KanbanSnapshot>;
  const board = rec.active_board;
  if (!board || typeof board.id !== "string" || !board.id || !Array.isArray(rec.tasks)) {
    throw new Error("kanban failed");
  }
  const tasks: KanbanTask[] = [];
  for (const row of rec.tasks) {
    const task = normalizeTask(row);
    if (task) tasks.push(task);
  }
  const bots: KanbanBot[] = [];
  if (Array.isArray(rec.bots)) {
    for (const row of rec.bots) {
      if (!row || typeof row !== "object") continue;
      const bot = row as Partial<KanbanBot>;
      if (typeof bot.id !== "string" || !bot.id || typeof bot.name !== "string" || !bot.name) continue;
      bots.push({
        id: bot.id,
        name: bot.name,
        icon: typeof bot.icon === "string" ? bot.icon : "",
        role_prompt: typeof bot.role_prompt === "string" ? bot.role_prompt : "",
        model_preset: typeof bot.model_preset === "string" ? bot.model_preset : "",
        max_concurrent: normalizeMaxConcurrent(bot.max_concurrent),
      });
    }
  }
  const boards: KanbanBoard[] = [];
  if (Array.isArray(rec.boards)) {
    for (const row of rec.boards) {
      if (!row || typeof row !== "object") continue;
      const item = row as Partial<KanbanBoard>;
      if (typeof item.id !== "string" || !item.id) continue;
      boards.push({ id: item.id, title: typeof item.title === "string" && item.title ? item.title : item.id });
    }
  }
  const links: { parent_id: string; child_id: string }[] = [];
  if (Array.isArray(rec.links)) {
    for (const row of rec.links) {
      if (!row || typeof row !== "object") continue;
      const link = row as { parent_id?: unknown; child_id?: unknown };
      if (typeof link.parent_id !== "string" || !link.parent_id) continue;
      if (typeof link.child_id !== "string" || !link.child_id) continue;
      links.push({ parent_id: link.parent_id, child_id: link.child_id });
    }
  }
  return {
    boards,
    active_board: { id: board.id, title: typeof board.title === "string" ? board.title : board.id },
    bots,
    tasks,
    links,
    messages: normalizeMessages(rec.messages),
  };
}

export function normalizeTaskDetail(data: unknown): KanbanTaskDetail {
  if (!data || typeof data !== "object") throw new Error("kanban failed");
  const rec = data as Partial<KanbanTaskDetail>;
  const task = normalizeTask(rec.task);
  if (!task) throw new Error("kanban failed");
  const list = (rows: unknown): KanbanTask[] =>
    Array.isArray(rows) ? rows.flatMap((row) => { const item = normalizeTask(row); return item ? [item] : []; }) : [];
  const runs: KanbanRun[] = [];
  if (Array.isArray(rec.runs)) {
    for (const row of rec.runs) {
      if (!row || typeof row !== "object") continue;
      const run = row as Partial<KanbanRun>;
      if (typeof run.id !== "string" || !run.id) continue;
      runs.push({
        id: run.id,
        bot_id: asText(run.bot_id),
        status: asText(run.status),
        summary: asText(run.summary),
        error: asText(run.error),
        started_at_ms: asMillis(run.started_at_ms),
        finished_at_ms: asMillis(run.finished_at_ms),
      });
    }
  }
  return {
    task,
    parents: list(rec.parents),
    children: list(rec.children),
    runs,
    messages: normalizeMessages(rec.messages),
  };
}

export async function fetchKanban(session: NanobotSession, boardId: string): Promise<KanbanSnapshot> {
  return normalizeKanban(await session.get<unknown>(`/api/ext/kanban?board_id=${encodeURIComponent(boardId)}`));
}

export async function fetchKanbanTask(session: NanobotSession, id: string): Promise<KanbanTaskDetail> {
  return normalizeTaskDetail(await session.get<unknown>(`/api/ext/kanban/task?id=${encodeURIComponent(id)}`));
}

function failedRequest(status: number, code: string): Error {
  const err = new Error(code) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

async function postKanban(session: NanobotSession, path: string, body: unknown): Promise<Response> {
  const root = session.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${root}${path}`, {
    method: "POST",
    redirect: "error",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${session.apiToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let code = "kanban failed";
    try {
      const data = (await res.json()) as { error?: unknown };
      if (data && typeof data.error === "string" && data.error) code = data.error;
    } catch {
      // The body was not JSON. Keep the fallback code.
    }
    throw failedRequest(res.status, code);
  }
  return res;
}

export async function moveKanbanTask(session: NanobotSession, id: string, status: KanbanStatus): Promise<void> {
  await postKanban(session, "/api/ext/kanban/tasks/move", { id, status });
}

export type SaveKanbanTaskInput = {
  board_id: string;
  title: string;
  id?: string;
  description?: string;
  priority?: KanbanPriority;
  status?: KanbanStatus;
  assignee_bot_id?: string | null;
  reviewer_bot_id?: string | null;
  workspace_mode?: KanbanWorkspace;
  recurrence_expr?: string;
  scheduled_at_ms?: number | null;
  max_retries?: number;
  parent_ids?: string[];
};

export async function saveKanbanTask(session: NanobotSession, input: SaveKanbanTaskInput): Promise<void> {
  if (!validateTaskTitle(input.title)) {
    throw new Error("invalid title");
  }
  const body: Record<string, unknown> = { board_id: input.board_id, title: input.title.trim() };
  if (input.id) body.id = input.id;
  if (input.description !== undefined) body.description = input.description;
  if (input.priority !== undefined) body.priority = input.priority;
  if (input.status !== undefined) body.status = input.status;
  if (input.assignee_bot_id !== undefined) body.assignee_bot_id = input.assignee_bot_id;
  if (input.reviewer_bot_id !== undefined) body.reviewer_bot_id = input.reviewer_bot_id;
  if (input.workspace_mode !== undefined) body.workspace_mode = input.workspace_mode;
  if (input.recurrence_expr !== undefined) body.recurrence_expr = input.recurrence_expr;
  if (input.scheduled_at_ms !== undefined) body.scheduled_at_ms = input.scheduled_at_ms;
  if (input.max_retries !== undefined) body.max_retries = input.max_retries;
  if (input.parent_ids !== undefined) body.parent_ids = input.parent_ids;
  await postKanban(session, "/api/ext/kanban/tasks/save", body);
}

export async function deleteKanbanTask(session: NanobotSession, id: string): Promise<void> {
  await postKanban(session, "/api/ext/kanban/tasks/delete", { id });
}

export async function createKanbanBoard(
  session: NanobotSession,
  input: { title: string; description?: string; max_concurrent?: number },
): Promise<string> {
  const body: Record<string, unknown> = { title: input.title };
  if (input.description !== undefined) body.description = input.description;
  if (input.max_concurrent !== undefined) body.max_concurrent = input.max_concurrent;
  const res = await postKanban(session, "/api/ext/kanban/boards/create", body);
  const data = (await res.json()) as { board?: { id?: unknown } };
  if (!data.board || typeof data.board.id !== "string" || !data.board.id) throw new Error("kanban failed");
  return data.board.id;
}

export async function postKanbanMessage(
  session: NanobotSession,
  boardId: string,
  content: string,
  taskId?: string,
): Promise<void> {
  if (!validateBoardMessageContent(content)) {
    throw new Error("invalid content");
  }
  const body: Record<string, unknown> = { board_id: boardId, content };
  if (taskId) body.task_id = taskId;
  await postKanban(session, "/api/ext/kanban/messages/post", body);
}

const KANBAN_ERROR_CODES = new Set([
  "invalid_recurrence",
  "invalid_scheduled_at",
  "task_limit",
  "dependency_cycle",
  "invalid_id",
  "not_found",
  "invalid_parent_ids",
  "cycle",
]);

export function kanbanErrorKey(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string" || !KANBAN_ERROR_CODES.has(code)) return null;
  if (code === "cycle") return "kanban.error.dependency_cycle";
  return `kanban.error.${code}`;
}

export type SaveKanbanBotInput = {
  id?: string;
  name: string;
  icon: string;
  role_prompt: string;
  model_preset?: string;
  max_concurrent?: number;
};

export async function saveKanbanBot(session: NanobotSession, input: SaveKanbanBotInput): Promise<void> {
  if (!validateBotName(input.name) || !validateBotIcon(input.icon) || !validateRolePrompt(input.role_prompt)) {
    throw new Error("invalid bot");
  }
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    icon: input.icon,
    role_prompt: input.role_prompt,
  };
  if (input.id) body.id = input.id;
  if (input.model_preset !== undefined) body.model_preset = input.model_preset;
  if (input.max_concurrent !== undefined) body.max_concurrent = input.max_concurrent;
  await postKanban(session, "/api/ext/kanban/bots/save", body);
}

export async function deleteKanbanBot(session: NanobotSession, id: string): Promise<void> {
  await postKanban(session, "/api/ext/kanban/bots/delete", { id });
}

export async function reviewKanbanTask(
  session: NanobotSession,
  id: string,
  approved: boolean,
  feedback?: string,
): Promise<void> {
  const body: { id: string; approved: boolean; feedback?: string } = { id, approved };
  if (feedback !== undefined) {
    if (!validateReviewFeedback(feedback)) throw new Error("invalid feedback");
    body.feedback = feedback.trim();
  }
  await postKanban(session, "/api/ext/kanban/tasks/review", body);
}
