import type { NanobotSession } from "../core/session";

export type SearchSource = "chats" | "journal" | "kanban";

export type SearchResult = {
  source: SearchSource;
  ref: string;
  title: string;
  snippet: string;
  excerpt?: string;
  ts?: string | number | null;
  date?: string | null;
  session_key?: string;
  position?: number;
  task_id?: string;
};

export type SearchResponse = {
  results: SearchResult[];
  query: string;
};

export async function fetchSearch(
  session: NanobotSession,
  query: string,
  sources?: SearchSource[],
  limit = 20,
): Promise<SearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  const params = new URLSearchParams();
  params.set("q", clean);
  if (sources && sources.length > 0) {
    params.set("sources", sources.join(","));
  }
  if (limit) {
    params.set("limit", String(limit));
  }

  const raw = await session.get<SearchResponse | SearchResult[]>(`/api/ext/search?${params.toString()}`);
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as SearchResponse).results)) {
    return (raw as SearchResponse).results;
  }
  return [];
}
