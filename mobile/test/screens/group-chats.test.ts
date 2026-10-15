import { chatGroup, groupChats, recentProjects } from "../../src/screens/chats/groupChats";
import type { ChatSummary } from "@/lib/types";

const now = new Date(2026, 9, 15, 12, 0, 0); // Thursday 15 Oct 2026

const chat = (key: string, updatedAt: string | null): ChatSummary =>
  ({ key, channel: "websocket", chatId: key, createdAt: updatedAt, updatedAt, preview: key }) as ChatSummary;

test("buckets chats by local day, with Monday as the start of the week", () => {
  expect(chatGroup("2026-10-15T08:00:00", now)).toBe("today");
  expect(chatGroup("2026-10-14T23:00:00", now)).toBe("yesterday");
  expect(chatGroup("2026-10-13T10:00:00", now)).toBe("week");
  expect(chatGroup("2026-10-12T10:00:00", now)).toBe("week");
  expect(chatGroup("2026-10-11T10:00:00", now)).toBe("older");
  expect(chatGroup(null, now)).toBe("older");
  const monday = new Date(2026, 9, 12, 12, 0, 0);
  expect(chatGroup("2026-10-11T12:00:00", monday)).toBe("yesterday");
  expect(chatGroup("2026-10-10T12:00:00", monday)).toBe("older");
});

test("groupChats drops empty sections and sorts newest first", () => {
  const groups = groupChats(
    [chat("old", "2026-10-01T00:00:00"), chat("new", "2026-10-15T09:00:00"), chat("mid", "2026-10-15T08:00:00")],
    now,
  );
  expect(groups.map((g) => g.id)).toEqual(["today", "older"]);
  expect(groups[0].chats.map((c) => c.key)).toEqual(["new", "mid"]);
});

test("recentProjects keeps the three most recently updated", () => {
  const projects = [1, 4, 2, 3].map((updated_at) => ({
    id: String(updated_at),
    name: String(updated_at),
    path: "/",
    created_at: 0,
    updated_at,
    file_count: 0,
    size_bytes: 0,
  }));
  expect(recentProjects(projects).map((p) => p.id)).toEqual(["4", "3", "2"]);
});
