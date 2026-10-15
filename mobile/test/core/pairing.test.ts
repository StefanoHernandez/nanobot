import { claimDevice, pairingDeviceName, pairingQrValue, parsePairingQr } from "../../src/core/pairing";

const payload = (v: unknown) => JSON.stringify(v);

test("parsePairingQr accepts v1 payload", () => {
  const raw = payload({ v: 1, url: "https://myhost.example-tailnet.ts.net/", code: "ABCD-2345" });
  expect(parsePairingQr(raw)).toEqual({ url: "https://myhost.example-tailnet.ts.net", code: "ABCD-2345" });
});

test("parsePairingQr rejects url with path segment", () => {
  const raw = payload({ v: 1, url: "https://host.example.com/extra", code: "X" });
  expect(parsePairingQr(raw)).toBeNull();
});

test("parsePairingQr rejects code with whitespace", () => {
  const raw = payload({ v: 1, url: "https://host.example.com", code: "AB CD" });
  expect(parsePairingQr(raw)).toBeNull();
});

test("parsePairingQr rejects v2", () => {
  const raw = payload({ v: 2, url: "https://host.example.com", code: "OK" });
  expect(parsePairingQr(raw)).toBeNull();
});

test("pairingQrValue uses this phone origin, not a path", () => {
  expect(pairingQrValue("https://myhost.example-tailnet.ts.net/", "ABCD-2345")).toBe(
    JSON.stringify({ v: 1, url: "https://myhost.example-tailnet.ts.net", code: "ABCD-2345" }),
  );
  expect(pairingQrValue("https://host.example.com/extra", "X")).toBeNull();
});

test("pairingDeviceName falls back when the name is not acceptable", () => {
  expect(pairingDeviceName("  Cucina  ")).toBe("Cucina");
  expect(pairingDeviceName("")).toBe("Telefono");
  expect(pairingDeviceName("a".repeat(41))).toBe("Telefono");
  expect(pairingDeviceName("line\nname")).toBe("Telefono");
});

test("claimDevice posts without Authorization header", async () => {
  const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    json: async () => ({ device_token: "nbdev_x", id: "d1", name: "phone" }),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;

  await claimDevice("https://srv.test", "CODE", "phone");

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect(init.credentials).toBe("omit");
  const headers = init.headers as Record<string, string>;
  expect(headers.Authorization).toBeUndefined();
  expect(headers.authorization).toBeUndefined();
});
