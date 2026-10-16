import { renderHook, waitFor } from "@testing-library/react-native";

// A fresh session per test: the hook remembers which session it already asked.
let mockSession = { get: jest.fn() };
jest.mock("../../src/state/sessionStore", () => ({
  useSession: () => ({ session: mockSession }),
}));
let mockServerBrowser = false;
jest.mock("../../src/platform/serverMode", () => ({ isServerBrowser: () => mockServerBrowser }));

import { installGate } from "../../src/ecosystem/common";
import { usePrivileged } from "../../src/ecosystem/privilege";

const flagOff = { runtime_config: { "tools.webui_allow_remote_package_install": false } } as never;

beforeEach(() => {
  mockServerBrowser = false;
  mockSession = { get: jest.fn() };
});

test("a full-power device opens the install gate with the host flag off", async () => {
  mockSession.get.mockResolvedValue({ self: { id: "d1", full_power: true } });
  const { result } = await renderHook(() => usePrivileged());
  await waitFor(() => expect(result.current).toBe(true));
  expect(mockSession.get).toHaveBeenCalledWith("/api/ext/devices");
  expect(installGate(flagOff, result.current).allowed).toBe(true);
});

test("an ordinary device, or an old server without the endpoint, stays gated", async () => {
  mockSession.get.mockRejectedValue(Object.assign(new Error("nf"), { status: 404 }));
  const { result } = await renderHook(() => usePrivileged());
  await waitFor(() => expect(mockSession.get).toHaveBeenCalled());
  expect(result.current).toBe(false);
  expect(installGate(flagOff, result.current).allowed).toBe(false);
});

test("the server's own browser is privileged without asking", async () => {
  mockServerBrowser = true;
  mockSession.get.mockReturnValue(new Promise(() => {}));
  const { result } = await renderHook(() => usePrivileged());
  expect(result.current).toBe(true);
});
