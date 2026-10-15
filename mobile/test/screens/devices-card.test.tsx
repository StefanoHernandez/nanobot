import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../../src/i18n";
import { i18n } from "../../src/i18n";
import type { NanobotSession } from "../../src/core/session";
import { DevicesCard } from "../../src/screens/settings/DevicesCard";
import { ThemeProvider } from "../../src/ui/ThemeProvider";

const fetchMock = jest.fn();
const mockGet = jest.fn();

const session = {
  baseUrl: "https://srv.test",
  apiToken: () => "api-token-secret",
  get: mockGet,
} as unknown as NanobotSession;

beforeEach(async () => {
  jest.clearAllMocks();
  global.fetch = fetchMock as typeof fetch;
  await i18n.changeLanguage("en");
});

const show = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <ThemeProvider>
        <DevicesCard session={session} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

test("renders two live devices and hides a revoked one", async () => {
  mockGet.mockResolvedValue({
    devices: [
      { id: "d1", name: "Kitchen", created: 1, last_seen: 1_700_000_000, revoked: false },
      { id: "d2", name: "Bedroom", created: 2, last_seen: null, revoked: false },
      { id: "d3", name: "Old phone", created: 3, last_seen: 1, revoked: true },
    ],
  });

  show();

  await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());
  expect(screen.getByText("Bedroom")).toBeTruthy();
  expect(screen.getByText("Never seen")).toBeTruthy();
  expect(screen.queryByText("Old phone")).toBeNull();
  expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
});

test("revoke opens confirm and posts only after confirm", async () => {
  mockGet.mockResolvedValue({
    devices: [{ id: "d1", name: "Kitchen", created: 1, last_seen: null, revoked: false }],
  });
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

  show();
  await waitFor(() => expect(screen.getByText("Kitchen")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getAllByRole("button", { name: "Revoke" })[0]!);
  });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByText("Kitchen will no longer be able to connect.")).toBeTruthy();

  const confirmButtons = screen.getAllByRole("button", { name: "Revoke" });
  await act(async () => {
    fireEvent.press(confirmButtons[confirmButtons.length - 1]!);
  });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith(
    "https://srv.test/api/ext/devices/revoke",
    expect.objectContaining({
      method: "POST",
      credentials: "omit",
      headers: expect.objectContaining({ Authorization: "Bearer api-token-secret" }),
      body: JSON.stringify({ id: "d1" }),
    }),
  );
  const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
  expect(body.token).toBeUndefined();
  expect(body.device_token).toBeUndefined();
});

test("a payload without a device list shows an error instead of crashing", async () => {
  mockGet.mockResolvedValue({});

  show();

  await waitFor(() => expect(screen.getByText("Error")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
});

test("GET 404 renders no revoke button", async () => {
  const err = new Error("not found");
  (err as Error & { status?: number }).status = 404;
  mockGet.mockRejectedValue(err);

  show();

  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
  expect(screen.queryByText("Paired phones")).toBeNull();
});
