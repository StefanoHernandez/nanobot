import "../../src/platform/install";
import React from "react";
import { act, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { chatsStore } from "../../src/state/chatsStore";
import { threadStore } from "../../src/state/threadStore";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";
import { ModelBadge, resolveChatModelPreset } from "../../src/screens/thread/ModelBadge";
import { fakeSession, flush, thread } from "../state/fake";

jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return {
    Markdown: ({ text }: { text: string }) => <Text>{text}</Text>,
  };
});

const p = (name: string, is_default = false, active = false) => ({
  name,
  provider: "openai",
  model: `m-${name}`,
  max_tokens: 1,
  context_window_tokens: 1,
  temperature: 0,
  reasoning_effort: null,
  is_default,
  active,
});

beforeAll(async () => {
  await i18n.changeLanguage("it");
});

describe("Part 3: Header and model pill", () => {
  test("resolveChatModelPreset follows precedence: session preset -> active -> is_default", async () => {
    // 1. Session preset
    const f1 = fakeSession({
      "/api/settings": () => ({ model_presets: [p("fast"), p("smart", true, false)] }),
      "/api/sessions": () => ({ sessions: [{ key: "websocket:c1", model_preset: "fast" }] }),
    });
    expect(await resolveChatModelPreset(f1.session, "websocket:c1")).toBe("fast");

    // 2. Active preset
    const f2 = fakeSession({
      "/api/settings": () => ({ model_presets: [p("fast"), p("active-one", false, true), p("def", true, false)] }),
      "/api/sessions": () => ({ sessions: [{ key: "websocket:c1", model_preset: null }] }),
    });
    expect(await resolveChatModelPreset(f2.session, "websocket:c1")).toBe("active-one");

    // 3. Default preset
    const f3 = fakeSession({
      "/api/settings": () => ({ model_presets: [p("fast"), p("default-one", true, false)] }),
      "/api/sessions": () => ({ sessions: [] }),
    });
    expect(await resolveChatModelPreset(f3.session, "websocket:c1")).toBe("default-one");

    // 4. Nothing
    const f4 = fakeSession({
      "/api/settings": () => ({ model_presets: [p("fast")] }),
      "/api/sessions": () => ({ sessions: [] }),
    });
    expect(await resolveChatModelPreset(f4.session, "websocket:c1")).toBeNull();
  });

  test("the header shows the chat title, falling back to Nuova chat", async () => {
    const KEY1 = "websocket:c-title";
    const KEY2 = "websocket:c-untitled";

    chatsStore.setState({
      chats: [
        {
          key: KEY1,
          channel: "websocket",
          chatId: "c-title",
          title: "Progetto Nanobot Mobile",
          preview: "",
          createdAt: "",
          updatedAt: "",
        },
        {
          key: KEY2,
          channel: "websocket",
          chatId: "c-untitled",
          title: "",
          preview: "",
          createdAt: "",
          updatedAt: "",
        },
      ],
    });

    const f = fakeSession({
      "/api/settings": () => ({ model_presets: [p("default-model", true)] }),
      "/api/sessions": () => ({ sessions: [] }),
      [`/api/sessions/${encodeURIComponent(KEY1)}/webui-thread`]: () => thread([]),
      [`/api/sessions/${encodeURIComponent(KEY2)}/webui-thread`]: () => thread([]),
    });
    sessionStore.setState({
      session: f.session,
      state: "open" as never,
      profile: { id: "p1", name: "luffy.tailfccacd.ts.net", baseUrl: "https://h", hasSecret: true },
    });

    const { unmount } = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <ThreadScreen chatKey={KEY1} onBack={() => {}} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByRole("header", { name: "Progetto Nanobot Mobile" })).toBeTruthy();
    expect(screen.queryByText("luffy.tailfccacd.ts.net")).toBeNull();
    unmount();

    await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <ThreadScreen chatKey={KEY2} onBack={() => {}} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByRole("header", { name: "Nuova chat" })).toBeTruthy();
  });

  test("the pill shows the default preset before any turn", async () => {
    const KEY = "websocket:c-pill";
    const f = fakeSession({
      "/api/settings": () => ({ model_presets: [p("fallback-default", true)] }),
      "/api/sessions": () => ({ sessions: [] }),
    });
    sessionStore.setState({
      session: f.session,
      state: "open" as never,
      profile: { id: "p1", name: "luffy.tailfccacd.ts.net", baseUrl: "https://h", hasSecret: true },
    });
    threadStore.setState({
      threads: {
        [KEY]: {
          messages: [],
          running: false,
          notices: [],
          preset: null,
          model: null,
          temporary: false,
          forkBoundary: null,
        } as never,
      },
    });

    await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <ModelBadge chatKey={KEY} preset={null} model={null} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    await act(async () => {
      await flush();
      await flush();
      await flush();
    });
    expect(screen.getByText("fallback-default")).toBeTruthy();
  });
});
