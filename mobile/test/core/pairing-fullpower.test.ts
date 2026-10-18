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
    const postMock = jest.fn().mockResolvedValueOnce({ ok: true });
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
      post: postMock,
    } as any;

    await setFullPower(session, "d1", true);

    expect(postMock).toHaveBeenCalledWith("/api/ext/devices/full-power", { id: "d1", enabled: true });
  });

  test("setFullPower throws error with error code on failure (e.g. local_browser_only)", async () => {
    const postMock = jest.fn().mockRejectedValueOnce(
      Object.assign(new Error("local_browser_only"), { status: 403, error: "local_browser_only" }),
    );
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
      post: postMock,
    } as any;

    await expect(setFullPower(session, "d1", true)).rejects.toMatchObject({
      status: 403,
      error: "local_browser_only",
    });
  });

  test("mintPairingCode sends optional url in request body when provided", async () => {
    const postMock = jest.fn().mockResolvedValueOnce({
      code: "1234-5678",
      qr: '{"v":1,"url":"https://arduino.tailnet.ts.net:8765","code":"1234-5678"}',
    });
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
      post: postMock,
    } as any;

    const res = await mintPairingCode(session, "https://arduino.tailnet.ts.net:8765");
    expect(res.code).toBe("1234-5678");

    expect(postMock).toHaveBeenCalledWith("/api/ext/devices/codes", {
      url: "https://arduino.tailnet.ts.net:8765",
    });
  });

  test("mintPairingCode does not send body when url is omitted", async () => {
    const postMock = jest.fn().mockResolvedValueOnce({
      code: "1234-5678",
      qr: '{"v":1,"url":"https://srv.test","code":"1234-5678"}',
    });
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
      post: postMock,
    } as any;

    const res = await mintPairingCode(session);
    expect(res.code).toBe("1234-5678");

    expect(postMock).toHaveBeenCalledWith("/api/ext/devices/codes", undefined);
  });

  test("mintPairingCode parses invalid_url error from server", async () => {
    const postMock = jest.fn().mockRejectedValueOnce(
      Object.assign(new Error("invalid_url"), { status: 400, error: "invalid_url" }),
    );
    const session = {
      baseUrl: "https://srv.test",
      apiToken: () => "mock-token",
      post: postMock,
    } as any;

    await expect(mintPairingCode(session, "bad-url")).rejects.toMatchObject({
      status: 400,
      error: "invalid_url",
    });
  });
});
