import "../../src/platform/install";
import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { installGate, isPolicyError, longMutation, usePolling } from "../../src/ecosystem/common";
import {
  channelConfigurePayload, channelFormFromContract, setChannelValue, setSecretCleared, useChannelConnect,
  usePairing, validateChannelForm,
} from "../../src/ecosystem/channels";

const mockSession = { get: jest.fn() };
jest.mock("../../src/state/sessionStore", () => ({ useSession: () => ({ session: mockSession }) }));
const mockMutate = jest.fn();
jest.mock("../../src/settings/store", () => ({ useSettings: () => ({ mutate: mockMutate }) }));
jest.mock("expo-notifications", () => ({}));

beforeEach(() => { mockMutate.mockReset(); mockSession.get.mockReset(); jest.useRealTimers(); });

test("install gate fails closed", () => {
  expect(installGate(null).allowed).toBe(false);
  expect(installGate({ runtime_config: { "tools.webui_allow_remote_package_install": false } } as never).allowed).toBe(false);
  expect(installGate({ runtime_config: { "tools.webui_allow_remote_package_install": true } } as never).allowed).toBe(true);
});

test("403 is a policy error; 504 resolves timedOut", async () => {
  expect(isPolicyError({ status: 403 })).toBe(true);
  expect(isPolicyError({ status: 500 })).toBe(false);
  await expect(longMutation(() => Promise.reject({ status: 504 }), "a", {})).resolves.toEqual({ timedOut: true });
  await expect(longMutation(() => Promise.reject({ status: 403 }), "a", {})).rejects.toEqual({ status: 403 });
  const m = jest.fn().mockResolvedValue(1);
  await longMutation(m, "a", { x: 1 });
  expect(m).toHaveBeenCalledWith("a", { x: 1 }, { timeoutMs: 150_000 });
});

describe("usePolling", () => {
  test("pauses in background, stops at expiry", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    let appListener: (s: string) => void = () => {};
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, l: (s: string) => void) => ((appListener = l), { remove })) as never);
    const tick = jest.fn(async () => {});
    const onExpire = jest.fn();
    const { unmount } = await renderHook(() => usePolling({ intervalMs: 1000, expiresAtMs: 5500, tick, enabled: true, onExpire }));
    await act(async () => void (await jest.advanceTimersByTimeAsync(2000)));
    expect(tick).toHaveBeenCalledTimes(2);
    appListener("background");
    await act(async () => void (await jest.advanceTimersByTimeAsync(2000)));
    expect(tick).toHaveBeenCalledTimes(2);
    appListener("active");
    await act(async () => void (await jest.advanceTimersByTimeAsync(1000)));
    expect(tick).toHaveBeenCalledTimes(3);
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(tick.mock.calls.length).toBeLessThanOrEqual(5);
    await act(async () => void unmount());
    expect(remove).toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

const contract = {
  fields: [
    { key: "channels.x.token", field: "token", kind: "secret", choices: [], required: true },
    { key: "channels.x.port", field: "port", kind: "int", choices: [], required: false },
    { key: "channels.x.allow", field: "allow", kind: "list", choices: [], required: false },
    { key: "channels.x.on", field: "on", kind: "bool", choices: [], required: false },
    { key: "channels.x.mode", field: "mode", kind: "enum", choices: ["a", "b"], required: false },
  ],
} as never;

describe("channel form", () => {
  const base = () => channelFormFromContract(contract, { "channels.x.port": "80", "channels.x.mode": "b" }, ["channels.x.token"]);
  test("untouched secret omitted, cleared sent as null", () => {
    const f = base();
    expect(f.values["channels.x.token"]).toBe("");
    expect(channelConfigurePayload(contract, f)).not.toHaveProperty("channels.x.token");
    expect(channelConfigurePayload(contract, setSecretCleared(f, "channels.x.token", true))["channels.x.token"]).toBeNull();
    expect(channelConfigurePayload(contract, setChannelValue(f, "channels.x.token", "s3"))["channels.x.token"]).toBe("s3");
  });
  test("coercion", () => {
    let f = base();
    f = setChannelValue(f, "channels.x.port", "8080");
    f = setChannelValue(f, "channels.x.allow", "a, b\nc,");
    f = setChannelValue(f, "channels.x.on", "true");
    const p = channelConfigurePayload(contract, f);
    expect(p).toMatchObject({ "channels.x.port": 8080, "channels.x.allow": ["a", "b", "c"], "channels.x.on": true });
    expect(p).not.toHaveProperty("channels.x.mode");
  });
  test("validation", () => {
    const f = channelFormFromContract(contract, {}, []);
    expect(validateChannelForm(contract, f)).toEqual({ "channels.x.token": "required" });
    expect(validateChannelForm(contract, base())).toEqual({});
    expect(validateChannelForm(contract, setChannelValue(base(), "channels.x.port", "1.5"))).toEqual({ "channels.x.port": "int" });
  });
});

describe("connect", () => {
  const pending = { session_id: "s1", status: "pending", qr_url: "https://qr/x", interval_ms: 1000, expires_at_ms: Date.now() + 600_000 };
  test("start -> waiting with qrUrl -> poll done", async () => {
    jest.useFakeTimers();
    mockMutate.mockResolvedValueOnce(pending).mockResolvedValueOnce({ session_id: "s1", status: "succeeded" });
    const { result } = await renderHook(() => useChannelConnect("weixin", "i1"));
    await act(async () => void (await result.current.start({ force: true })));
    expect(mockMutate.mock.calls[0]).toEqual([
      "settings.channel.connect.start", { channel: "weixin", instance_id: "i1", force: true }, { timeoutMs: 150_000 },
    ]);
    expect(result.current.state).toBe("waiting");
    expect(result.current.qrUrl).toBe("https://qr/x");
    expect(result.current.linkUrl).toBe("https://qr/x");
    await act(async () => void (await jest.advanceTimersByTimeAsync(2600)));
    expect(mockMutate.mock.calls[1][0]).toBe("settings.channel.connect.poll");
    expect(mockMutate.mock.calls[1][1]).toEqual({ channel: "weixin", session_id: "s1" });
    expect(result.current.state).toBe("done");
  });
  test("verify code is sent with poll; cancel sends cancel", async () => {
    mockMutate.mockResolvedValueOnce(pending).mockResolvedValue({ ...pending, status: "pending" });
    const { result } = await renderHook(() => useChannelConnect("weixin"));
    await act(async () => void (await result.current.start()));
    await act(async () => void (await result.current.submitVerifyCode("123456")));
    expect(mockMutate.mock.calls[1][1]).toEqual({ channel: "weixin", session_id: "s1", verify_code: "123456" });
    mockMutate.mockResolvedValue({});
    await act(async () => void (await result.current.cancel()));
    expect(mockMutate).toHaveBeenLastCalledWith("settings.channel.connect.cancel", { channel: "weixin", session_id: "s1" });
    expect(result.current.state).toBe("idle");
  });
});

test("pairing approve sends the code", async () => {
  mockSession.get.mockResolvedValue({ requests: [{ code: "ABC", channel: "tg", sender_id: "1" }] });
  mockMutate.mockResolvedValue({ requests: [] });
  const { result } = await renderHook(() => usePairing());
  await act(async () => void (await Promise.resolve()));
  expect(result.current.requests).toHaveLength(1);
  await act(async () => void (await result.current.approve("ABC")));
  expect(mockMutate).toHaveBeenCalledWith("settings.pairing.approve", { code: "ABC" });
  expect(result.current.requests).toHaveLength(0);
});
