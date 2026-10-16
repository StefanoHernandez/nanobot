import "../../src/platform/install";
import { i18n } from "../../src/i18n";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { chatsStore } from "../../src/state/chatsStore";
import { fakeSession, thread } from "../state/fake";
import { ThreadScreen } from "../../src/screens/thread/ThreadScreen";
import * as exportChatModule from "../../src/extras/exportChat";

jest.mock("../../src/ui/markdown/Markdown", () => {
  const { Text } = require("react-native");
  return { Markdown: ({ text }: { text: string }) => <Text>{text}</Text> };
});

jest.mock("../../src/ui/components/Toast", () => {
  const actual = jest.requireActual("../../src/ui/components/Toast");
  return {
    ...actual,
    toast: {
      show: jest.fn(),
      setLift: jest.fn(),
    },
  };
});

jest.mock("../../src/extras/exportChat", () => {
  const actual = jest.requireActual("../../src/extras/exportChat");
  return {
    ...actual,
    exportChat: jest.fn(),
  };
});

describe("ThreadScreen export status text", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
    jest.clearAllMocks();
    threadStore.setState({ threads: {} });
    chatsStore.setState({
      chats: [{ key: "websocket:c1", title: "Test Chat", channel: "websocket", id: "c1" } as any],
    });
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
      threadStore.setState({ threads: {} });
    });
    jest.useRealTimers();
  });

  test("while exporting, shows export.exporting text in the header", async () => {
    let resolveExport!: () => void;
    const exportPromise = new Promise<void>((r) => {
      resolveExport = r;
    });
    (exportChatModule.exportChat as jest.Mock).mockReturnValue(exportPromise);

    const f = fakeSession({
      [`/api/sessions/${encodeURIComponent("websocket:c1")}/webui-thread`]: () => thread([]),
    });
    sessionStore.setState({ session: f.session, state: "open" as never });

    await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <ThreadScreen chatKey="websocket:c1" onBack={() => {}} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );

    expect(screen.queryByText(i18n.t("export.exporting"))).toBeNull();

    // Open menu
    const moreBtn = screen.getByLabelText(i18n.t("thread.more"));
    await act(async () => {
      fireEvent.press(moreBtn);
    });

    // Tap "Esporta come Markdown" / "Export as Markdown"
    const exportMdItem = screen.getByText(i18n.t("export.markdown"));
    await act(async () => {
      fireEvent.press(exportMdItem);
    });

    // While export is pending, export.exporting text must be visible
    expect(screen.getByText(i18n.t("export.exporting"))).toBeTruthy();

    // Resolve export
    await act(async () => {
      resolveExport();
    });

    // After completion, export.exporting text disappears
    expect(screen.queryByText(i18n.t("export.exporting"))).toBeNull();
  });
});
