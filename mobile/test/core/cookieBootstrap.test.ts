import { BootstrapAuthRequiredError } from "@/lib/bootstrap";
import { fetchCookieBootstrap, webLogout } from "../../src/core/cookieBootstrap";
import { NanobotSession } from "../../src/core/session";
import type { Profile } from "../../src/core/profiles";

describe("cookieBootstrap", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  test("fetchCookieBootstrap sends X-Nanobot-Cookie-Auth: 1 and credentials: same-origin, without X-Nanobot-Auth", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        token: "tok123",
        api_token: "api123",
        ws_path: "/ws",
        expires_in: 300,
      }),
    });

    const res = await fetchCookieBootstrap("https://server.test", 5000);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://server.test/webui/bootstrap",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-Nanobot-Cookie-Auth": "1",
        },
      }),
    );
    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders["X-Nanobot-Auth"]).toBeUndefined();
    expect(callHeaders["Authorization"]).toBeUndefined();
    expect(res.token).toBe("tok123");
    expect(res.ws_path).toBe("/ws");
  });

  test("fetchCookieBootstrap throws BootstrapAuthRequiredError on 401 and 403", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(fetchCookieBootstrap("https://server.test", 5000)).rejects.toThrow(BootstrapAuthRequiredError);

    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(fetchCookieBootstrap("https://server.test", 5000)).rejects.toThrow(BootstrapAuthRequiredError);
  });

  test("webLogout posts to /api/ext/devices/web-logout with X-Nanobot-Cookie-Auth: 1 and same-origin", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await webLogout("https://server.test");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://server.test/api/ext/devices/web-logout",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-Nanobot-Cookie-Auth": "1",
        },
      }),
    );
  });

  test("NanobotSession with profile.auth === 'cookie' uses fetchCookieBootstrap and sets auth_error on 401", async () => {
    const profile: Profile = {
      id: "p-web",
      name: "Web Profile",
      baseUrl: "https://server.test",
      hasSecret: false,
      auth: "cookie",
    };

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const session = new NanobotSession(profile, "");
    await expect(session.start()).rejects.toThrow();
    expect(session.state).toBe("auth_error");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://server.test/webui/bootstrap",
      expect.objectContaining({
        headers: {
          "X-Nanobot-Cookie-Auth": "1",
        },
      }),
    );
    session.stop();
  });

  test("NanobotSession with cookie profile refreshes at expires_in - 30 seconds", async () => {
    const profile: Profile = {
      id: "p-web",
      name: "Web Profile",
      baseUrl: "https://server.test",
      hasSecret: false,
      auth: "cookie",
    };

    let scheduledMs = 0;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        token: "tok1",
        api_token: "api1",
        ws_path: "/ws",
        expires_in: 300,
      }),
    });

    const fakeSocket = {
      readyState: 1,
      send: jest.fn(),
      close: jest.fn(),
      addEventListener: jest.fn(),
    } as unknown as WebSocket;

    const session = new NanobotSession(profile, "", {
      setTimeout: ((fn: () => void, ms: number) => {
        scheduledMs = ms;
        return 1;
      }) as unknown as typeof setTimeout,
      clearTimeout: jest.fn(),
      socketFactory: () => fakeSocket,
    });

    await session.start();
    expect(scheduledMs).toBe((300 - 30) * 1000);
    session.stop();
  });
});
