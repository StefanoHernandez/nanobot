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
  messages: unknown[];
};

export const DEFAULT_BOARD_ID = "main";

export function validateTaskTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 200) return false;
  return !/[\u0000-\u001f\u007f]/.test(trimmed);
}

const PRIORITIES = new Set<KanbanPriority>(["low", "medium", "high", "urgent"]);
const STATUSES = new Set<KanbanStatus>([...KANBAN_COLUMNS, "archived"]);

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
      if (!row || typeof row.id !== "string" || typeof row.name !== "string") continue;
      bots.push({ id: row.id, name: row.name });
    }
  }
  return {
    boards: Array.isArray(rec.boards) ? rec.boards.filter((b) => b && typeof b.id === "string") : [],
    active_board: { id: board.id, title: typeof board.title === "string" ? board.title : board.id },
    bots,
    tasks,
    links: [],
    messages: [],
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
