import "../../src/platform/install";
import { NanobotSession } from "../../src/core/session";

jest.mock("expo-secure-store", () => ({}));

const resp = (status: number, body: unknown = {}) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => "" }) as unknown as Response;

const profile = { id: "a", name: "A", baseUrl: "http://h:8765", hasSecret: true };

function setup(apiStatuses: (number | undefined)[] = []) {
  let boots = 0;
  const bootFetch = jest.fn(async () => resp(200, { token: `ws${++boots}`, api_token: `api${boots}`, ws_path: "/", expires_in: 300 }));
  globalThis.fetch = bootFetch as never;
  const timers: { fn: () => void; ms: number; cleared?: boolean }[] = [];
  const sockets: string[] = [];
  const apiFetch = jest.fn(async (_u: unknown, init?: RequestInit) => {
    const tok = (init?.headers as Record<string, string>).Authorization;
    const forced = apiStatuses.shift();
    if (forced) return resp(forced);
    return resp(200, { tok });
  });
  const s = new NanobotSession(profile, "sec", {
    fetch: apiFetch as never,
    setTimeout: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    clearTimeout: (h) => { (h as { cleared?: boolean }).cleared = true; },
    socketFactory: (u) => { sockets.push(u); return { readyState: 0, send() {}, close() {} } as unknown as WebSocket; },
  });
  return { s, boots: () => boots, timers, sockets, apiFetch };
}

test("start bootstraps, connects with ws token, schedules refresh at 270s", async () => {
  const { s, timers, sockets, boots } = setup();
  await s.start();
  expect(boots()).toBe(1);
  expect(sockets).toEqual(["ws://h:8765/?token=ws1"]);
  expect(s.apiToken()).toBe("api1");
  expect(timers.filter((t) => !t.cleared).map((t) => t.ms)).toEqual([270_000]);
  s.stop();
  expect(timers.every((t) => t.cleared)).toBe(true);
});

test("timer refresh rotates api token and keeps a single timer", async () => {
  const { s, timers, boots } = setup();
  await s.start();
  timers[0].cleared = true; // fired
  timers[0].fn();
  await new Promise<void>((r) => setImmediate(() => r()));
  expect(boots()).toBe(2);
  expect(s.apiToken()).toBe("api2");
  expect(timers.filter((t) => !t.cleared)).toHaveLength(1);
  s.stop();
});

test("3 concurrent 401s -> exactly one extra bootstrap, all retried", async () => {
  const { s, boots } = setup([401, 401, 401]);
  await s.start();
  const r = await Promise.all([s.get("/api/a"), s.get("/api/b"), s.get("/api/c")]);
  expect(boots()).toBe(2);
  expect(r).toEqual(Array(3).fill({ tok: "Bearer api2" }));
  s.stop();
});

test("second 401 after refresh -> rejects and auth_error", async () => {
  const { s } = setup([401, 401]);
  await s.start();
  const states: string[] = [];
  s.onState((x) => states.push(x));
  await expect(s.get("/api/a")).rejects.toThrow();
  expect(s.state).toBe("auth_error");
  expect(states).toContain("auth_error");
  s.stop();
});

test("bootstrap 403 -> auth_error; network failure -> offline", async () => {
  const a = setup();
  globalThis.fetch = jest.fn(async () => resp(403)) as never;
  await expect(a.s.start()).rejects.toThrow();
  expect(a.s.state).toBe("auth_error");
  const b = setup();
  globalThis.fetch = jest.fn(async () => { throw new TypeError("nope"); }) as never;
  await expect(b.s.start()).rejects.toThrow();
  expect(b.s.state).toBe("offline");
});

test("mutate surfaces server error.message", async () => {
  const { s } = setup();
  jest.spyOn(s.client, "requestMutation").mockRejectedValue({ status: 409, message: "exists" });
  await expect(s.mutate("x", {})).rejects.toThrow(new Error("exists"));
});

// ---- fix round 1 ----
const tick = () => new Promise<void>((r) => setImmediate(() => r()));
function setup2(now: { t: number }) {
  const o = setup();
  const socks: { onopen?: () => void }[] = [];
  const s = new NanobotSession(profile, "sec", {
    fetch: o.apiFetch as never,
    now: () => now.t,
    setTimeout: (fn, ms) => { const t = { fn, ms }; o.timers.push(t); return t; },
    clearTimeout: (h) => { (h as { cleared?: boolean }).cleared = true; },
    socketFactory: (u) => { o.sockets.push(u); const k = { readyState: 0, send() {}, close() {} } as { onopen?: () => void }; socks.push(k); return k as unknown as WebSocket; },
  });
  return { ...o, s, socks };
}

test("stop() while start bootstrap pending -> no socket, not open", async () => {
  const { s, sockets } = setup();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const inner = globalThis.fetch;
  globalThis.fetch = (async (...a: unknown[]) => { await gate; return (inner as never as (...x: unknown[]) => Promise<Response>)(...a); }) as never;
  const p = s.start();
  s.stop();
  release();
  await p;
  expect(sockets).toEqual([]);
  expect(s.state).not.toBe("open");
});

test("after stop: onReauth returns null and the socket factory opens nothing", async () => {
  const { s, sockets } = setup();
  await s.start();
  s.stop();
  const n = sockets.length;
  const opts = (s.client as unknown as { options: { onReauth: () => Promise<string | null> } }).options;
  expect(await opts.onReauth()).toBeNull();
  (s.client as unknown as { socketFactory: (u: string) => WebSocket }).socketFactory("ws://x");
  expect(sockets.length).toBe(n);
});

test("resume after 301s refreshes once; concurrent get uses new token, no 401", async () => {
  const now = { t: 0 };
  const { s, boots, apiFetch, socks } = setup2(now);
  await s.start();
  socks[0].onopen?.();
  expect(s.state).toBe("open");
  now.t = 301_000;
  s.resume();
  const r = await s.get<{ tok: string }>("/api/x");
  expect(boots()).toBe(2);
  expect(r.tok).toBe("Bearer api2");
  expect(apiFetch).toHaveBeenCalledTimes(1);
  s.stop();
});

test("resume at 100s with open socket does not bootstrap", async () => {
  const now = { t: 0 };
  const { s, boots, socks } = setup2(now);
  await s.start();
  socks[0].onopen?.();
  now.t = 100_000;
  s.resume();
  await tick();
  expect(boots()).toBe(1);
  s.stop();
});

test("proactive refresh network failure while open: state stays open, retry scheduled with backoff", async () => {
  const now = { t: 0 };
  const { s, timers, socks } = setup2(now);
  await s.start();
  socks[0].onopen?.();
  globalThis.fetch = jest.fn(async () => { throw new TypeError("net"); }) as never;
  timers[0].cleared = true;
  timers[0].fn();
  await tick();
  expect(s.state).toBe("open");
  const live = timers.filter((t) => !t.cleared);
  expect(live.map((t) => t.ms)).toEqual([1000]);
  live[0].cleared = true;
  live[0].fn();
  await tick();
  expect(timers.filter((t) => !t.cleared).map((t) => t.ms)).toEqual([2000]);
  s.stop();
});

test("wsUrlFor keeps base path prefix", () => {
  const { wsUrlFor } = require("../../src/core/session");
  expect(wsUrlFor("https://h/nb", "/", "t")).toBe("wss://h/nb/?token=t");
  expect(wsUrlFor("https://h/nb/", "/ws", "t")).toBe("wss://h/nb/ws?token=t");
});

test("offline at first boot retries with backoff, then connects once the server is reachable", async () => {
  const { s, timers, sockets, boots } = setup();
  const ok = globalThis.fetch;
  let up = false;
  globalThis.fetch = jest.fn(async (...a: unknown[]) => {
    if (!up) throw new TypeError("Network request failed");
    return (ok as (...x: unknown[]) => Promise<Response>)(...a);
  }) as never;
  await expect(s.start()).rejects.toThrow();
  expect(s.state).toBe("offline");
  expect(timers.filter((t) => !t.cleared).map((t) => t.ms)).toEqual([1000]);
  const fire = async () => {
    const t = timers.filter((x) => !x.cleared).at(-1)!;
    t.cleared = true;
    t.fn();
    await new Promise<void>((r) => setImmediate(() => r()));
  };
  await fire(); // still down: backoff doubles
  expect(timers.filter((t) => !t.cleared).map((t) => t.ms)).toEqual([2000]);
  expect(sockets).toEqual([]);
  up = true;
  await fire();
  expect(boots()).toBe(1);
  expect(sockets).toEqual(["ws://h:8765/?token=ws1"]);
  expect(s.state).not.toBe("offline");
  s.stop();
});

test("frameLimit comes from bootstrap limits.transport.max_frame_bytes", async () => {
  const { s } = setup();
  expect(s.frameLimit).toBeNull();
  globalThis.fetch = (async () => resp(200, { token: "w", api_token: "a", ws_path: "/", expires_in: 300, limits: { transport: { max_frame_bytes: 1234 } } })) as never;
  await s.start();
  expect(s.frameLimit).toBe(1234);
  s.stop();
});

test("on web the session never assigns the page location (it would reload the page forever)", () => {
  const { Platform } = require("react-native");
  const os = Platform.OS;
  const g = globalThis as { location?: { href: string } };
  const saved = g.location;
  g.location = { href: "http://page/" };
  Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
  try {
    setup();
    expect(g.location.href).toBe("http://page/");
  } finally {
    Object.defineProperty(Platform, "OS", { value: os, configurable: true });
    g.location = saved;
  }
});
