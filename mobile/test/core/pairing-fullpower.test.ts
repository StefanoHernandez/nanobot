import { listDevices, setFullPower, mintPairingCode } from "../../src/core/pairing";

describe("pairing full power and url minting", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  test("listDevices parses full_power correctly", async () => {
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
      get: jest.fn(async () => ({
        devices: [
          { id: "d1", name: "Device 1", created: 1000, last_seen: 2000, revoked: false, full_power: true },
          { id: "d2", name: "Device 2", created: 1000, last_seen: null, revoked: false, full_power: false },
          { id: "d3", name: "Device 3", created: 1000, last_seen: null, revoked: false },
        ],
      })),
    } as any;

    const result = await listDevices(session);
    expect(result).toHaveLength(3);
    expect(result[0]!.full_power).toBe(true);
    expect(result[1]!.full_power).toBe(false);
    expect(result[2]!.full_power).toBe(false);
  });

  test("setFullPower posts to /api/ext/devices/full-power with { id, enabled }", async () => {
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
    } as any;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await setFullPower(session, "d1", true);

    expect(fetchMock).toHaveBeenCalledWith("https://srv.test/api/ext/devices/full-power", {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      headers: {
        Authorization: "Bearer mock-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: "d1", enabled: true }),
    });
  });

  test("setFullPower throws error with error code on failure (e.g. local_browser_only)", async () => {
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
    } as any;

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "local_browser_only" }),
    });

    await expect(setFullPower(session, "d1", true)).rejects.toMatchObject({
      status: 403,
      error: "local_browser_only",
    });
  });

  test("mintPairingCode sends optional url in request body when provided", async () => {
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
    } as any;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "1234-5678", qr: '{"v":1,"url":"https://arduino.tailnet.ts.net:8765","code":"1234-5678"}' }),
    });

    const res = await mintPairingCode(session, "https://arduino.tailnet.ts.net:8765");
    expect(res.code).toBe("1234-5678");

    expect(fetchMock).toHaveBeenCalledWith("https://srv.test/api/ext/devices/codes", {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      headers: {
        Authorization: "Bearer mock-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://arduino.tailnet.ts.net:8765" }),
    });
  });

  test("mintPairingCode does not send body when url is omitted", async () => {
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
    } as any;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "1234-5678", qr: '{"v":1,"url":"https://srv.test","code":"1234-5678"}' }),
    });

    const res = await mintPairingCode(session);
    expect(res.code).toBe("1234-5678");

    expect(fetchMock).toHaveBeenCalledWith("https://srv.test/api/ext/devices/codes", {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      headers: {
        Authorization: "Bearer mock-token",
      },
      body: undefined,
    });
  });

  test("mintPairingCode parses invalid_url error from server", async () => {
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
    } as any;

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_url" }),
    });

    await expect(mintPairingCode(session, "bad-url")).rejects.toMatchObject({
      status: 400,
      error: "invalid_url",
    });
  });
});
