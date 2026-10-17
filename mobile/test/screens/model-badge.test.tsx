import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { ModelBadge, pickablePresets } from "../../src/screens/thread/ModelBadge";
import { fakeSession, flush } from "../state/fake";

const p = (name: string) => ({ name, provider: "openai", model: `m-${name}`, max_tokens: 1, context_window_tokens: 1, temperature: 0, reasoning_effort: null, is_default: false, active: false });

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

test("pickablePresets hides effort-derived presets", () => {
  expect(pickablePresets([p("fast"), p("fast·high"), p("smart")]).map((x) => x.name)).toEqual(["fast", "smart"]);
});

test("pickablePresets respects call order and hides disabled presets", () => {
  const presets = [p("fast"), p("smart"), p("c")];
  const settings = { model_call_order: ["smart", "fast"] };
  expect(pickablePresets(presets, settings).map((x) => x.name)).toEqual(["smart", "fast"]);
});

test("pickablePresets keeps current chat preset even if disabled", () => {
  const presets = [p("fast"), p("smart"), p("c")];
  const settings = { model_call_order: ["fast"] };
  expect(pickablePresets(presets, settings, "c").map((x) => x.name)).toEqual(["fast", "c"]);
});

test("tapping the badge lists base presets and sends /model <name> to the chat", async () => {
  const f = fakeSession({ "/api/settings": () => ({ model_presets: [p("fast"), p("fast·high"), p("smart")] }) });
  sessionStore.setState({ session: f.session, state: "open" as never, profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true } });
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider><ModelBadge chatKey="websocket:c1" preset="fast·high" model="m-fast" /></ThemeProvider>
    </SafeAreaProvider>,
  );
  await act(async () => fireEvent.press(screen.getByLabelText("Change model")));
  await act(flush);
  expect(screen.queryByText("fast·high", { exact: true })).toBeTruthy(); // the badge label itself
  expect(screen.getByText("smart")).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByText("smart")));
  expect(f.sent.at(-1)).toMatchObject({ chatId: "c1", content: "/model smart" });
});

test("the chat picker hides disabled presets but keeps the chat's current one, marked", async () => {
  // fast is active in call order, disabled-model is not in call order
  const f = fakeSession({
    "/api/settings": () => ({
      model_presets: [p("fast"), p("disabled-model"), p("hidden-disabled")],
      model_call_order: ["fast"],
    }),
  });
  sessionStore.setState({ session: f.session, state: "open" as never, profile: { id: "p1", name: "U", baseUrl: "https://h", hasSecret: true } });
  const { unmount } = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider><ModelBadge chatKey="websocket:c1" preset="disabled-model" model="m-disabled" /></ThemeProvider>
    </SafeAreaProvider>,
  );
  await act(async () => fireEvent.press(screen.getByLabelText("Change model")));
  await act(flush);
  expect(screen.getByText("fast")).toBeTruthy();
  expect(screen.getByText("disabled-model (disabled)")).toBeTruthy();
  expect(screen.queryByText("hidden-disabled")).toBeNull();
  unmount();

  // Also test in Italian
  await i18n.changeLanguage("it");
  try {
    await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider><ModelBadge chatKey="websocket:c1" preset="disabled-model" model="m-disabled" /></ThemeProvider>
      </SafeAreaProvider>,
    );
    await act(async () => fireEvent.press(screen.getByLabelText("Cambia modello")));
    await act(flush);
    expect(screen.getByText("disabled-model (disattivato)")).toBeTruthy();
  } finally {
    await i18n.changeLanguage("en");
  }
});
