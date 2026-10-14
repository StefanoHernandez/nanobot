import "../../src/platform/install";
import { normalizeBaseUrl, profiles, testConnection } from "../../src/core/profiles";
import { wsUrlFor } from "../../src/core/session";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));

const resp = (status: number, body: unknown = {}) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => "" }) as unknown as Response;

test("normalizeBaseUrl", () => {
  expect(normalizeBaseUrl(" myhost.example-tailnet.ts.net ")).toBe("http://myhost.example-tailnet.ts.net");
  expect(normalizeBaseUrl("https://myhost.example-tailnet.ts.net/?x=1#f")).toBe("https://myhost.example-tailnet.ts.net");
  expect(normalizeBaseUrl("ftp://x")).toBeNull();
});

test("wsUrlFor", () => {
  expect(wsUrlFor("https://h", "/", "t k")).toBe("wss://h/?token=t%20k");
  expect(wsUrlFor("http://h:8765", "/ws", "t")).toBe("ws://h:8765/ws?token=t");
  expect(wsUrlFor("https://h:443", "/", "t")).toBe("wss://h/?token=t");
});

test("profiles keep secret in secure mockStore only", async () => {
  await profiles.save({ id: "a", name: "A", baseUrl: "http://h" }, "s3cret");
  expect(profiles.list()).toEqual([{ id: "a", name: "A", baseUrl: "http://h", hasSecret: true }]);
  expect(JSON.stringify(profiles.list())).not.toContain("s3cret");
  expect(await profiles.getSecret("a")).toBe("s3cret");
  profiles.setActive("a");
  expect(profiles.activeId()).toBe("a");
  await profiles.remove("a");
  expect(profiles.list()).toEqual([]);
  expect(profiles.activeId()).toBeNull();
  expect(await profiles.getSecret("a")).toBe("");
});

describe("testConnection", () => {
  afterEach(() => jest.restoreAllMocks());
  test("ok", async () => {
    globalThis.fetch = jest.fn(async () => resp(200, { ws_path: "/", token: "t" })) as never;
    expect(await testConnection("http://h", "s")).toEqual({ ok: true });
  });
  test("403 -> auth", async () => {
    globalThis.fetch = jest.fn(async () => resp(403)) as never;
    expect(await testConnection("http://h", "s")).toMatchObject({ ok: false, kind: "auth" });
  });
  test("network -> unreachable", async () => {
    globalThis.fetch = jest.fn(async () => { throw new TypeError("Network request failed"); }) as never;
    expect(await testConnection("http://h", "s")).toMatchObject({ ok: false, kind: "unreachable" });
  });
  test("500 -> http", async () => {
    globalThis.fetch = jest.fn(async () => resp(500)) as never;
    expect(await testConnection("http://h", "s")).toMatchObject({ ok: false, kind: "http" });
  });
});
