import type { ChatSummary } from "@/lib/types";
import type { Project } from "../../projects/api";

export type ChatGroupId = "today" | "yesterday" | "week" | "older";

const DAY = 86_400_000;

/** Local calendar bucket. Week starts on Monday. Missing dates are "older". */
export function chatGroup(updatedAt: string | null | undefined, now: Date): ChatGroupId {
  const ms = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(ms)) return "older";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ms >= startOfToday) return "today";
  if (ms >= startOfToday - DAY) return "yesterday";
  const mondayOffset = (now.getDay() + 6) % 7;
  const startOfWeek = startOfToday - mondayOffset * DAY;
  if (ms >= startOfWeek) return "week";
  return "older";
}

export function groupChats(chats: ChatSummary[], now: Date): { id: ChatGroupId; chats: ChatSummary[] }[] {
  const buckets: Record<ChatGroupId, ChatSummary[]> = { today: [], yesterday: [], week: [], older: [] };
  const sorted = [...chats].sort(
    (a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0),
  );
  for (const chat of sorted) buckets[chatGroup(chat.updatedAt, now)].push(chat);
  return (["today", "yesterday", "week", "older"] as const)
    .filter((id) => buckets[id].length > 0)
    .map((id) => ({ id, chats: buckets[id] }));
}

export function recentProjects(projects: Project[], limit = 3): Project[] {
  return [...projects].sort((a, b) => b.updated_at - a.updated_at).slice(0, limit);
}
