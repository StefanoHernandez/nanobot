import "../../src/platform/install";
import { i18n } from "../../src/i18n";
import { kv } from "../../src/platform/storage";
import { prefs } from "../../src/settings/prefs";
import { mutateSettings, refreshSettings, runRestart, settingsStore, SettingsError } from "../../src/settings/store";
import { notificationHandler } from "../../src/extras/notifications";
import { sessionStore } from "../../src/state/sessionStore";
import { NanobotSession } from "../../src/core/session";

jest.mock("expo-notifications", () => ({}));

const payload = (m: string) => ({ agent: { model: m }, requires_restart: false }) as never;

function mk(over: Record<string, unknown> = {}) {
  const handlers = new Set<(s: string) => void>();
  const client = {
    defaultChatId: "c1",
    onStatus: (h: (s: string) => void) => (handlers.add(h), () => void handlers.delete(h)),
    sendSystemCommand: jest.fn(async () => {}),
    newChat: jest.fn(async () => "n1"),
    ...over,
  };
  const session = {
    client,
    get: jest.fn(async () => payload("fresh")),
    mutate: jest.fn(async () => payload("m")),
  } as never as NanobotSession;
  return { session, client, emit: (s: string) => handlers.forEach((h) => h(s)) };
}

beforeEach(() => settingsStore.getState().reset());

test("mutate result replaces data", async () => {
  const { session } = mk();
  await mutateSettings(session, "a", {});
  expect((settingsStore.getState().data as never as { agent: { model: string } }).agent.model).toBe("m");
});

test("400 field extracted", async () => {
  const { session } = mk();
  (session.mutate as jest.Mock).mockRejectedValue(Object.assign(new Error("tools.exec.timeout: Input should be >= 1"), { status: 400 }));
  const e = await mutateSettings(session, "a", {}).catch((x) => x);
  expect(e).toBeInstanceOf(SettingsError);
  expect(e.field).toBe("tools.exec.timeout");
  expect(e.status).toBe(400);
});

test("dirty draft survives payload replacement", async () => {
  settingsStore.getState().setDraft("card1", { x: 1 });
  settingsStore.getState().setData(payload("other"));
  expect(settingsStore.getState().drafts.card1).toEqual({ x: 1 });
});

describe("restart", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  test("close -> open ends done and refreshes", async () => {
    const m = mk();
    const p = runRestart(m.session);
    await flush();
    expect(m.client.sendSystemCommand).toHaveBeenCalledWith("c1", "/restart");
    m.emit("reconnecting");
    m.emit("open");
    await p;
    expect(settingsStore.getState().restartState).toBe("done");
    expect(m.session.get).toHaveBeenCalledWith("/api/settings");
  });

  test("no reopen within 60 s -> timeout", async () => {
    const m = mk();
    const p = runRestart(m.session);
    await flush();
    m.emit("reconnecting");
    jest.advanceTimersByTime(60_000);
    await p;
    expect(settingsStore.getState().restartState).toBe("timeout");
  });

  test("no chat at all -> timeout, nothing sent", async () => {
    const m = mk({ defaultChatId: null });
    await runRestart(m.session);
    expect(m.client.newChat).not.toHaveBeenCalled();
    expect(settingsStore.getState().restartState).toBe("timeout");
  });

  test("no drop and no open within 1.5 s is not done; open at 2 s is", async () => {
    const m = mk();
    const p = runRestart(m.session);
    await flush();
    jest.advanceTimersByTime(1_600);
    await flush();
    expect(settingsStore.getState().restartState).toBe("restarting");
    jest.advanceTimersByTime(400);
    m.emit("open");
    await p;
    expect(settingsStore.getState().restartState).toBe("done");
  });

  test("send failure -> timeout, listener cleared; run while restarting is a no-op", async () => {
    const m = mk({ sendSystemCommand: jest.fn(async () => { throw new Error("x"); }) });
    await runRestart(m.session);
    expect(settingsStore.getState().restartState).toBe("timeout");
    const m2 = mk();
    const p = runRestart(m2.session);
    await flush();
    await runRestart(m2.session);
    expect(m2.client.sendSystemCommand).toHaveBeenCalledTimes(1);
    m2.emit("reconnecting");
    m2.emit("open");
    await p;
  });

  test("failed refresh after reopen still done, sets error", async () => {
    const m = mk();
    (m.session.get as jest.Mock).mockRejectedValue(new Error("boom"));
    const p = runRestart(m.session);
    await flush();
    m.emit("reconnecting");
    m.emit("open");
    await p;
    expect(settingsStore.getState().restartState).toBe("done");
    expect(settingsStore.getState().error).toBe("boom");
  });
});

test("language persists and switches", () => {
  prefs.setLanguage("en");
  expect(i18n.language).toBe("en");
  expect(kv.get("pref.language")).toBe("en");
  expect(prefs.language()).toBe("en");
  prefs.setLanguage("it");
  expect(i18n.language).toBe("it");
});

test("sound pref default false, handler uses it", async () => {
  kv.del("pref.notificationSound");
  expect((await notificationHandler()).shouldPlaySound).toBe(false);
  prefs.setNotificationSound(true);
  expect((await notificationHandler()).shouldPlaySound).toBe(true);
});

test("session.get parses {error} and keeps status", async () => {
  const s = new NanobotSession({ id: "p", name: "p", baseUrl: "http://h" } as never, "sec", {
    fetch: (async () => new Response(JSON.stringify({ error: "x" }), { status: 400 })) as never,
  });
  const e = (await s.get("/api/a").catch((x) => x)) as Error & { status: number };
  expect(e.message).toBe("x");
  expect(e.status).toBe(400);
});

test("session.get non-JSON body keeps raw text and status", async () => {
  const s = new NanobotSession({ id: "p", name: "p", baseUrl: "http://h" } as never, "sec", {
    fetch: (async () => new Response("oops", { status: 502 })) as never,
  });
  const e = (await s.get("/api/a").catch((x) => x)) as Error & { status: number };
  expect(e.message).toBe("oops");
  expect(e.status).toBe(502);
});

test("close resets settings store", () => {
  settingsStore.getState().setData(payload("z"));
  sessionStore.getState().close();
  expect(settingsStore.getState().data).toBeNull();
});
