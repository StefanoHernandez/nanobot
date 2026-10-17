import type { NanobotSession } from "../core/session";

export type JournalIndex = {
  enabled: boolean;
  hour: number;
  model: string | null;
  days: string[];
};

export type JournalDay = {
  date: string;
  text: string;
};

export type JournalRun = {
  date: string;
  written: boolean;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function normalizeJournal(raw: unknown): JournalIndex {
  const rec = asRecord(raw);
  const hour = rec.hour;
  const days = Array.isArray(rec.days)
    ? rec.days.filter((day): day is string => typeof day === "string" && DAY.test(day))
    : [];
  const rawModel = rec.model;
  let model: string | null = null;
  if (rawModel === "default") {
    model = null;
  } else if (typeof rawModel === "string" && rawModel) {
    model = rawModel;
  }
  return {
    enabled: rec.enabled === true,
    hour: typeof hour === "number" && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 3,
    model,
    days,
  };
}

export function normalizeJournalDay(raw: unknown): JournalDay {
  const rec = asRecord(raw);
  return {
    date: typeof rec.date === "string" && DAY.test(rec.date) ? rec.date : "",
    text: typeof rec.text === "string" ? rec.text : "",
  };
}

export function normalizeJournalRun(raw: unknown): JournalRun {
  const rec = asRecord(raw);
  return {
    date: typeof rec.date === "string" && DAY.test(rec.date) ? rec.date : "",
    written: rec.written === true,
  };
}

function failedRequest(status: number, code: string): Error {
  const err = new Error(code) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

async function postJournal(session: NanobotSession, path: string, body: unknown): Promise<unknown> {
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
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const code =
      payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "journal failed";
    throw failedRequest(res.status, code);
  }
  return payload;
}

export async function fetchJournal(session: NanobotSession): Promise<JournalIndex> {
  return normalizeJournal(await session.get<unknown>("/api/ext/journal"));
}

export async function fetchJournalDay(session: NanobotSession, date: string): Promise<JournalDay> {
  return normalizeJournalDay(
    await session.get<unknown>(`/api/ext/journal/day?date=${encodeURIComponent(date)}`),
  );
}

export async function saveJournalSettings(
  session: NanobotSession,
  settings: { enabled: boolean; hour: number; model?: string | null },
): Promise<JournalIndex> {
  const saved = normalizeJournal(await postJournal(session, "/api/ext/journal/settings", settings));
  return { ...saved, days: saved.days };
}

export async function runJournal(session: NanobotSession, date?: string): Promise<JournalRun> {
  return normalizeJournalRun(
    await postJournal(session, "/api/ext/journal/run", date ? { date } : {}),
  );
}
