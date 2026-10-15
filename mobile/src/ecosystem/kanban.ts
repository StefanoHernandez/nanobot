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

export type KanbanBoard = {
  id: string;
  title: string;
  description?: string;
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
    if (!row || typeof row !== "object") continue;
    const task = row as Partial<KanbanTask>;
    if (typeof task.id !== "string" || !task.id || typeof task.title !== "string" || !task.title) continue;
    if (typeof task.status !== "string" || !STATUSES.has(task.status as KanbanStatus)) continue;
    const priority = PRIORITIES.has(task.priority as KanbanPriority) ? (task.priority as KanbanPriority) : "medium";
    tasks.push({
      id: task.id,
      title: task.title,
      status: task.status as KanbanStatus,
      priority,
      assignee_bot_id: typeof task.assignee_bot_id === "string" && task.assignee_bot_id ? task.assignee_bot_id : null,
      description: typeof task.description === "string" ? task.description : "",
    });
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
  const messages: KanbanMessage[] = [];
  if (Array.isArray(rec.messages)) {
    for (const row of rec.messages) {
      if (!row || typeof row !== "object") continue;
      const msg = row as Partial<KanbanMessage>;
      if (typeof msg.id !== "string" || !msg.id) continue;
      if (typeof msg.author_name !== "string") continue;
      if (typeof msg.content !== "string") continue;
      messages.push({ id: msg.id, author_name: msg.author_name, content: msg.content });
    }
  }
  return {
    boards: Array.isArray(rec.boards) ? rec.boards.filter((b) => b && typeof b.id === "string") : [],
    active_board: { id: board.id, title: typeof board.title === "string" ? board.title : board.id },
    bots,
    tasks,
    links: [],
    messages,
  };
}

export async function fetchKanban(session: NanobotSession, boardId: string): Promise<KanbanSnapshot> {
  return normalizeKanban(await session.get<unknown>(`/api/ext/kanban?board_id=${encodeURIComponent(boardId)}`));
}

async function postKanban(session: NanobotSession, path: string, body: unknown): Promise<void> {
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
    throw new Error("request failed");
  }
}

export async function moveKanbanTask(session: NanobotSession, id: string, status: KanbanStatus): Promise<void> {
  await postKanban(session, "/api/ext/kanban/tasks/move", { id, status });
}

export type SaveKanbanTaskInput = {
  board_id: string;
  title: string;
  description?: string;
  priority?: KanbanPriority;
  assignee_bot_id?: string | null;
};

export async function saveKanbanTask(session: NanobotSession, input: SaveKanbanTaskInput): Promise<void> {
  if (!validateTaskTitle(input.title)) {
    throw new Error("invalid title");
  }
  await postKanban(session, "/api/ext/kanban/tasks/save", input);
}

export async function postKanbanMessage(session: NanobotSession, boardId: string, content: string): Promise<void> {
  if (!validateBoardMessageContent(content)) {
    throw new Error("invalid content");
  }
  await postKanban(session, "/api/ext/kanban/messages/post", { board_id: boardId, content });
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
