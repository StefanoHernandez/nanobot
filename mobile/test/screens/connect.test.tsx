import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../../src/i18n";
import { i18n } from "../../src/i18n";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { toast } from "../../src/ui/components";
import { ConnectScreen } from "../../src/screens/connect/ConnectScreen";
import { profiles, testConnection } from "../../src/core/profiles";
import { router, useLocalSearchParams } from "expo-router";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), canDismiss: jest.fn(() => true), dismissAll: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
const mockOpen = jest.fn(async () => {});
const mockClose = jest.fn();
jest.mock("../../src/state/sessionStore", () => ({ sessionStore: { getState: () => ({ open: mockOpen, close: mockClose }) } }));
jest.mock("../../src/core/profiles", () => ({
  normalizeBaseUrl: (s: string) => (/^https?:\/\/\S+$/.test(s) ? s.replace(/\/+$/, "") : null),
  testConnection: jest.fn(),
  profiles: {
    list: jest.fn(() => []),
    save: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
    setActive: jest.fn(),
    getSecret: jest.fn(async () => ""),
    activeId: jest.fn(() => null),
  },
}));

const mockTest = testConnection as jest.Mock;

const show = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <ThemeProvider>
        <ConnectScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage("en");
});

test("invalid URL shows error and skips testConnection", async () => {
  await show();
  await fireEvent.changeText(screen.getByLabelText("URL"), "not a url");
  await fireEvent.press(screen.getByText("Test & save"));
  expect(screen.getByText("Invalid URL")).toBeTruthy();
  expect(mockTest).not.toHaveBeenCalled();
});

test("auth failure shows secret error", async () => {
  mockTest.mockResolvedValue({ ok: false, kind: "auth", message: "x" });
  await show();
  await fireEvent.changeText(screen.getByLabelText("URL"), "https://a.ts.net");
  await fireEvent.press(screen.getByText("Test & save"));
  expect(screen.getByText("Secret required or wrong (needed for non-localhost access)")).toBeTruthy();
});

test("success: double tap saves once and navigates", async () => {
  let resolve!: (v: unknown) => void;
  mockTest.mockReturnValue(new Promise((r) => (resolve = r)));
  await show();
  await fireEvent.changeText(screen.getByLabelText("URL"), "https://a.ts.net");
  // fireEvent awaits the pending async handler (overlapping act), so trigger the host onClick directly, twice in a row
  const { onClick } = screen.getByRole("button", { name: "Test & save" }).props;
  const e = { stopPropagation() {}, preventDefault() {} };
  await act(async () => {
    onClick(e);
    onClick(e);
    resolve({ ok: true });
  });
  expect(mockTest).toHaveBeenCalledTimes(1);
  expect(profiles.save).toHaveBeenCalledTimes(1);
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith("/");
  expect(router.dismissAll).toHaveBeenCalledTimes(1); // no duplicate (main) left under the new one
  expect((router.dismissAll as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((router.replace as jest.Mock).mock.invocationCallOrder[0]);
});

test("long-press + confirm removes the profile", async () => {
  (profiles.list as jest.Mock).mockReturnValue([{ id: "p1", name: "Luffy", baseUrl: "https://l.ts.net", hasSecret: true }]);
  await show();
  await fireEvent(screen.getByText("Luffy"), "longPress");
  await fireEvent.press(screen.getByText("Delete"));
  expect(profiles.remove).toHaveBeenCalledTimes(1);
  expect(profiles.remove).toHaveBeenCalledWith("p1");
});

test("deleting the active profile closes the session; another one does not", async () => {
  (profiles.list as jest.Mock).mockReturnValue([{ id: "p1", name: "Luffy", baseUrl: "https://l.ts.net", hasSecret: true }]);
  (profiles.activeId as jest.Mock).mockReturnValue("p1");
  await show();
  await fireEvent(screen.getByText("Luffy"), "longPress");
  await fireEvent.press(screen.getByText("Delete"));
  expect(mockClose).toHaveBeenCalledTimes(1);
  mockClose.mockClear();
  (profiles.activeId as jest.Mock).mockReturnValue("other");
  (profiles.list as jest.Mock).mockReturnValue([{ id: "p1", name: "Luffy", baseUrl: "https://l.ts.net", hasSecret: true }]);
  await fireEvent(screen.getByText("Luffy"), "longPress");
  await fireEvent.press(screen.getByText("Delete"));
  expect(mockClose).not.toHaveBeenCalled();
});

test("save rejects: generic toast, no navigation, button usable again", async () => {
  (profiles.list as jest.Mock).mockReturnValue([]);
  (profiles.save as jest.Mock).mockRejectedValueOnce(new Error("secret-leak"));
  mockTest.mockResolvedValue({ ok: true });
  const spy = jest.spyOn(toast, "show").mockImplementation(() => {});
  await show();
  await fireEvent.changeText(screen.getByLabelText("URL"), "https://a.ts.net");
  await fireEvent.press(screen.getByText("Test & save"));
  expect(spy).toHaveBeenCalledWith("Error");
  expect(spy).not.toHaveBeenCalledWith(expect.stringContaining("secret-leak"));
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Test & save" }).props.accessibilityState.disabled).toBe(false);
  spy.mockRestore();
});

test("existing URL reuses id and stored secret", async () => {
  (profiles.list as jest.Mock).mockReturnValue([{ id: "p1", name: "Old", baseUrl: "https://h", hasSecret: true }]);
  (profiles.getSecret as jest.Mock).mockResolvedValue("stored");
  mockTest.mockResolvedValue({ ok: true });
  await show();
  await fireEvent.changeText(screen.getByLabelText("URL"), "https://h/");
  await fireEvent.press(screen.getByText("Test & save"));
  expect(mockTest).toHaveBeenCalledWith("https://h", "stored");
  expect(profiles.save).toHaveBeenCalledTimes(1);
  expect(profiles.save).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", baseUrl: "https://h" }), "stored");
  expect(profiles.setActive).toHaveBeenCalledWith("p1");
  expect(mockOpen).toHaveBeenCalledWith("p1");
});

test("redirected with reason=auth: active profile prefilled, secret empty and flagged", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ reason: "auth" });
  (profiles.list as jest.Mock).mockReturnValue([{ id: "p1", name: "Luffy", baseUrl: "https://l.ts.net", hasSecret: true }]);
  (profiles.activeId as jest.Mock).mockReturnValue("p1");
  await show();
  expect(screen.getByLabelText("URL").props.value).toBe("https://l.ts.net");
  expect(screen.getByDisplayValue("Luffy")).toBeTruthy();
  expect(screen.getByLabelText("Secret").props.value).toBe("");
  expect(screen.getByText("Secret required or wrong (needed for non-localhost access)")).toBeTruthy();
});
