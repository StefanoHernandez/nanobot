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
