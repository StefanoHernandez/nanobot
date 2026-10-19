import type { NanobotSession } from "../../../core/session";
import {
  moveKanbanTask,
  reviewKanbanTask,
  saveKanbanTask,
  type KanbanStatus,
  type KanbanTask,
} from "../../../ecosystem/kanban";

/** Statuses a task can be started from: the editor's Start button and the "Start now" quick action. */
export const START_STATUSES = new Set<KanbanStatus>(["triage", "todo", "blocked", "done"]);

export type QuickAction = "startNow" | "approve" | "sendBack" | "done" | "block";

/** The moves that make sense for a card in its current status, in the order the sheet lists them. */
export function quickActions(task: KanbanTask, now: number = Date.now()): QuickAction[] {
  const waitingForSchedule = typeof task.scheduled_at_ms === "number" && task.scheduled_at_ms > now;
  const canStart = !!task.assignee_bot_id && (task.status === "ready" ? waitingForSchedule : START_STATUSES.has(task.status));
  const actions: QuickAction[] = [];
  if (canStart) actions.push("startNow");
  if (task.status === "review") actions.push("approve", "sendBack");
  if (task.status !== "done") actions.push("done");
  if (task.status !== "blocked") actions.push("block");
  return actions;
}

/** Runs a quick action with the same calls the editor makes. */
export async function runQuickAction(
  session: NanobotSession,
  boardId: string,
  task: KanbanTask,
  action: QuickAction,
  feedback = "",
): Promise<void> {
  switch (action) {
    case "startNow":
      return saveKanbanTask(session, {
        board_id: boardId,
        id: task.id,
        title: task.title,
        status: "ready",
        assignee_bot_id: task.assignee_bot_id,
        scheduled_at_ms: null,
      });
    case "approve":
      return reviewKanbanTask(session, task.id, true);
    case "sendBack":
      return reviewKanbanTask(session, task.id, false, feedback);
    case "done":
      return moveKanbanTask(session, task.id, "done");
    case "block":
      return moveKanbanTask(session, task.id, "blocked");
  }
}
