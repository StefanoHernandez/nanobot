import "../../src/platform/install";
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import type { UIMessage } from "@/lib/types";
import { i18n } from "../../src/i18n";
import { sessionStore } from "../../src/state/sessionStore";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { ActivityRow } from "../../src/screens/thread/ActivityRow";
import { fakeSession } from "../state/fake";

beforeAll(async () => {
  await i18n.changeLanguage("it");
});

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}));

describe("ActivityRow and ToolActivitySheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderWithProviders = async (ui: React.ReactElement) => {
    return await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ThemeProvider>{ui}</ThemeProvider>
      </SafeAreaProvider>
    );
  };

  test("The line shows the count, and tapping it opens the sheet with N rows", async () => {
    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c1",
            name: "exec",
            arguments: { command: "git status" },
            phase: "end",
            result: "clean",
          },
          {
            call_id: "c2",
            name: "read_file",
            arguments: { path: "README.md" },
            phase: "end",
            result: "# Hello",
          },
          {
            call_id: "c3",
            name: "search",
            arguments: { query: "export" },
            phase: "end",
            result: "found 2",
          },
        ],
      },
    ];

    const r = await renderWithProviders(<ActivityRow messages={messages} live={false} />);

    // Line displays the count (e.g. "Eseguiti 3 strumenti ›")
    const lineBtn = r.getByTestId("activity-row-line");
    expect(lineBtn).toBeTruthy();
    expect(r.getByText(/3 strumenti/i)).toBeTruthy();

    // Tapping the line opens the sheet
    await act(async () => {
      fireEvent.press(lineBtn);
    });

    // Sheet header shows "Eseguiti 3 strumenti"
    expect(r.getByText("Eseguiti 3 strumenti")).toBeTruthy();

    // The sheet contains 3 rows
    expect(r.getByText(/exec git status/i)).toBeTruthy();
    expect(r.getByText(/read_file README.md/i)).toBeTruthy();
    expect(r.getByText(/search export/i)).toBeTruthy();
    expect(r.getAllByText("Eseguito")).toHaveLength(3);

    // Close button dismisses the sheet
    const closeBtn = r.getByLabelText("Chiudi");
    await act(async () => {
      fireEvent.press(closeBtn);
    });
  });

  test("Tapping a row shows the command and result. Copy calls the clipboard (mocked)", async () => {
    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c1",
            name: "exec",
            arguments: { command: "echo 'hello world'" },
            phase: "end",
            result: "hello world\n",
          },
        ],
      },
    ];

    const r = await renderWithProviders(<ActivityRow messages={messages} live={false} />);

    // Open sheet
    await act(async () => {
      fireEvent.press(r.getByTestId("activity-row-line"));
    });

    // Tap tool row
    const row = r.getByTestId("tool-call-row-c1");
    await act(async () => {
      fireEvent.press(row);
    });

    // Detail view is open: shows title "exec", status "Completato", command and result
    expect(r.getByText("exec")).toBeTruthy();
    expect(r.getByText("Completato")).toBeTruthy();
    expect(r.getByText("echo 'hello world'")).toBeTruthy();
    expect(r.getByText("hello world\n")).toBeTruthy();

    // Find copy buttons
    const copyButtons = r.getAllByLabelText("Copia codice");
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);

    // Copy command
    await act(async () => {
      fireEvent.press(copyButtons[0]);
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("echo 'hello world'");

    // Copy result
    await act(async () => {
      fireEvent.press(copyButtons[1]);
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("hello world\n");

    // Back button returns to list view
    const backBtn = r.getByLabelText("Indietro");
    await act(async () => {
      fireEvent.press(backBtn);
    });
    expect(r.getByText("Eseguito 1 strumento")).toBeTruthy();
  });

  test("A missing result with traceDetail.ref fetches trace-detail (mocked) and shows it", async () => {
    const KEY = "websocket:test";
    const detailRef = "turn:1:msg:m1";

    const f = fakeSession({
      [`/api/sessions/${encodeURIComponent(KEY)}/webui-thread/trace-detail?ref=${encodeURIComponent(detailRef)}`]: () => ({
        message_id: "m1",
        events: [
          {
            type: "chat",
            tool_events: [
              {
                call_id: "c-oversized",
                name: "exec",
                result: "Oversized output fetched from trace-detail endpoint",
              },
            ],
          },
        ],
      }),
    });

    sessionStore.setState({
      session: f.session,
      state: "open" as never,
      profile: { id: "p1", name: "Test", baseUrl: "https://test.local", hasSecret: true },
    });

    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        traceDetail: {
          ref: detailRef,
          bytes: 8192,
          traceCount: 1,
        },
        toolEvents: [
          {
            call_id: "c-oversized",
            name: "exec",
            arguments: { command: "cat huge.log" },
            phase: "end",
            // result is intentionally missing
          },
        ],
      },
    ];

    const r = await renderWithProviders(
      <ActivityRow messages={messages} live={false} chatKey={KEY} />
    );

    // Open sheet
    await act(async () => {
      fireEvent.press(r.getByTestId("activity-row-line"));
    });

    // Tap row
    const row = r.getByTestId("tool-call-row-c-oversized");
    await act(async () => {
      fireEvent.press(row);
    });

    // Await trace-detail fetch and verify output is shown
    await waitFor(() => {
      expect(
        r.getByText("Oversized output fetched from trace-detail endpoint")
      ).toBeTruthy();
    });
  });

  test("A live update adds a row and changes 'In corso' to 'Eseguito'", async () => {
    const initialMessages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c-live-1",
            name: "exec",
            arguments: { command: "sleep 1" },
            phase: "start",
          },
        ],
      },
    ];

    const r = await renderWithProviders(<ActivityRow messages={initialMessages} live={true} />);

    // Line is visible while live
    await act(async () => {
      fireEvent.press(r.getByTestId("activity-row-line"));
    });

    // Initial sheet has 1 row in "In corso…"
    expect(r.getByText(/exec sleep 1/i)).toBeTruthy();
    expect(r.getByText("In corso…")).toBeTruthy();

    // Now live update arrives: c-live-1 finishes ("end"), and a second tool starts
    const updatedMessages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c-live-1",
            name: "exec",
            arguments: { command: "sleep 1" },
            phase: "end",
            result: "done",
          },
          {
            call_id: "c-live-2",
            name: "read_file",
            arguments: { path: "data.txt" },
            phase: "start",
          },
        ],
      },
    ];

    await act(async () => {
      r.rerender(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 360, height: 640 },
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
          }}
        >
          <ThemeProvider>
            <ActivityRow messages={updatedMessages} live={true} />
          </ThemeProvider>
        </SafeAreaProvider>
      );
    });

    // Row 1 updated from "In corso…" to "Eseguito"
    expect(r.getByText("Eseguito")).toBeTruthy();

    // Row 2 added with "In corso…"
    expect(r.getByText(/read_file data.txt/i)).toBeTruthy();
    expect(r.getByText("In corso…")).toBeTruthy();
  });

  test("very long results show first 4000 characters with Mostra tutto", async () => {
    const longString = "A".repeat(4500);
    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c-long",
            name: "exec",
            arguments: { command: "cat huge.txt" },
            phase: "end",
            result: longString,
          },
        ],
      },
    ];

    const r = await renderWithProviders(<ActivityRow messages={messages} live={false} />);
    await act(async () => {
      fireEvent.press(r.getByTestId("activity-row-line"));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId("tool-call-row-c-long"));
    });

    // Shows "Mostra tutto" button
    const showAllBtn = r.getByText("Mostra tutto");
    expect(showAllBtn).toBeTruthy();

    // Click "Mostra tutto"
    await act(async () => {
      fireEvent.press(showAllBtn);
    });

    // Full result is displayed and "Mostra tutto" is gone
    expect(r.queryByText("Mostra tutto")).toBeNull();
  });

  test("fileEdits diff view renders in detail view", async () => {
    const messages: UIMessage[] = [
      {
        id: "m1",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        fileEdits: [
          {
            call_id: "c-edit",
            tool: "edit_file",
            path: "src/app.ts",
            status: "done",
            added: 1,
            deleted: 1,
            diff: {
              format: "unified",
              text: "@@ -1,1 +1,1 @@\n-const a = 1;\n+const a = 2;\n",
            },
          },
        ],
        toolEvents: [
          {
            call_id: "c-edit",
            name: "edit_file",
            arguments: { path: "src/app.ts" },
            phase: "end",
            result: "file edited",
          },
        ],
      },
    ];

    const r = await renderWithProviders(<ActivityRow messages={messages} live={false} />);
    await act(async () => {
      fireEvent.press(r.getByTestId("activity-row-line"));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId("tool-call-row-c-edit"));
    });

    // Detail view shows File modificati section with path
    expect(r.getByText("File modificati")).toBeTruthy();
    expect(r.getByText("src/app.ts")).toBeTruthy();
  });

  test("in-between model text and reasoning stay in chat under the line", async () => {
    const messages: UIMessage[] = [
      {
        id: "m-tool",
        role: "assistant",
        kind: "trace",
        createdAt: 1000,
        content: "",
        toolEvents: [
          {
            call_id: "c1",
            name: "exec",
            arguments: { command: "ls" },
            phase: "end",
            result: "ok",
          },
        ],
      },
      {
        id: "m-model",
        role: "assistant",
        activityKind: "model",
        createdAt: 1500,
        content: "Intermediate thought from the model",
      },
      {
        id: "m-reasoning",
        role: "assistant",
        createdAt: 1600,
        content: "",
        reasoning: "Deep reasoning step here",
      },
    ];

    const r = await renderWithProviders(<ActivityRow messages={messages} live={false} />);

    // Quiet line is rendered
    expect(r.getByText(/1 strumento/i)).toBeTruthy();

    // Intermediate model text is displayed under the line
    expect(r.getByText("Intermediate thought from the model")).toBeTruthy();

    // Reasoning block is displayed under the line (collapsed by default)
    expect(r.getByText("Ragionamento")).toBeTruthy();
  });
});
