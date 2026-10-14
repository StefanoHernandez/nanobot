import "../../src/platform/install";
import { NanobotSession } from "../../src/core/session";
import { uploadFiles, validateFiles, type LocalFile } from "../../src/core/upload";

jest.mock("expo-file-system", () => ({ File: class { size = 1; } }));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: "jpeg" } }));

const MiB = 2 ** 20;
const limits = { max_count: 4, max_file_bytes: 6 * MiB, max_total_bytes: 24 * MiB };
const f = (name: string, size = 1, mime = "image/png"): LocalFile => ({ uri: `file:///${name}`, name, mime, size });

test("validateFiles", () => {
  expect(validateFiles([f("a"), f("b")], limits)).toEqual({ ok: true });
  expect(validateFiles([1, 2, 3, 4, 5].map((i) => f(`${i}`)), limits)).toEqual({ ok: false, reason: "count" });
  expect(validateFiles([f("big", 7 * MiB)], limits)).toEqual({ ok: false, reason: "file_size", name: "big" });
  expect(validateFiles([1, 2, 3, 4].map((i) => f(`${i}`, 6.25 * MiB)), { ...limits, max_file_bytes: 7 * MiB })).toEqual({ ok: false, reason: "total_size" });
  expect(validateFiles([f("x.svg", 1, "image/svg+xml")], limits)).toEqual({ ok: false, reason: "type", name: "x.svg" });
});

function sessionWithSocket() {
  const socks: { listeners: Record<string, ((e: unknown) => void)[]>; readyState: number }[] = [];
  const s = new NanobotSession({ id: "p", name: "p", baseUrl: "http://h" } as never, "sec", {
    socketFactory: () => {
      const k = { listeners: {} as Record<string, ((e: unknown) => void)[]>, readyState: 0, send() {}, close() {},
        addEventListener(t: string, cb: (e: unknown) => void) { (k.listeners[t] ??= []).push(cb); } };
      socks.push(k);
      return k as unknown as WebSocket;
    },
  });
  const ready = (i: number, token: string) =>
    socks[i].listeners.message.forEach((cb) => cb({ data: JSON.stringify({ event: "ready", chat_id: "c", upload: { path: "/api/attachments", token } }) }));
  const open = () => (s.client as unknown as { socketFactory: (u: string) => WebSocket }).socketFactory("ws://x");
  return { s, socks, ready, open };
}

test("uploadFiles uses the token of the latest ready frame; cleared on close; no logging", async () => {
  const logs = ["log", "info", "warn", "error"].map((m) => jest.spyOn(console, m as "log").mockImplementation(() => {}));
  const { s, socks, ready, open } = sessionWithSocket();
  open(); ready(0, "tok-1");
  open(); ready(1, "tok-2");
  const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ reference: "r1" }) }));
  global.fetch = fetchMock as never;
  await expect(uploadFiles(s, [f("a.png")])).resolves.toEqual([{ reference: "r1", name: "a.png" }]);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; method: string }];
  expect(url).toBe("http://h/api/attachments");
  expect(init.headers.Authorization).toBe("Bearer tok-2");
  expect(init.headers["Content-Type"]).toBe("image/png");
  socks[1].listeners.close.forEach((cb) => cb({}));
  fetchMock.mockClear();
  await expect(uploadFiles(s, [f("a.png")])).rejects.toThrow("upload_unavailable");
  expect(fetchMock).not.toHaveBeenCalled();
  for (const l of logs) { expect(JSON.stringify(l.mock.calls)).not.toMatch(/tok-|api\/attachments/); l.mockRestore(); }
});
