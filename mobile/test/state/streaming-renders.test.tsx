import "../../src/i18n";
import React, { useRef } from "react";
import { act, render } from "@testing-library/react-native";
import { ThemeProvider } from "../../src/ui/ThemeProvider";
import { Composer } from "../../src/screens/thread/Composer";
import { threadStore } from "../../src/state/threadStore";
import { sessionStore } from "../../src/state/sessionStore";

describe("Streaming re-renders (PF-A)", () => {
  const CHAT_KEY = "chat-perf-1";

  beforeEach(() => {
    sessionStore.setState({
      session: {
        id: "s1",
        client: {
          loadPrompts: jest.fn().mockResolvedValue([]),
          loadSkills: jest.fn().mockResolvedValue({ skills: [] }),
          loadCliApps: jest.fn().mockResolvedValue({ apps: [] }),
          loadMcpPresets: jest.fn().mockResolvedValue({ presets: [] }),
          loadSessions: jest.fn().mockResolvedValue([]),
        },
      } as any,
      profile: { id: "p1", baseUrl: "http://h:8765" } as any,
      state: "open",
    });

    threadStore.setState({
      threads: {
        [CHAT_KEY]: {
          messages: [
            { id: "msg-1", role: "assistant", content: "Starting answer", isStreaming: true, createdAt: Date.now() },
          ],
          running: true,
          draft: "",
          pendingFiles: [],
          notices: [],
          stopped: false,
          sendError: null,
          uploading: false,
          loaded: true,
          temporary: false,
          forkBoundary: null,
          hasMoreBefore: false,
          loadingOlder: false,
          beforeCursor: null,
          queuedMessages: [],
          replyingTo: null,
          model: null,
          preset: null,
        },
      },
    });
  });

  test("render-count: streaming delta does not re-render Composer; running flip does", async () => {
    let renderCount = 0;

    await render(
      <ThemeProvider>
        <Composer chatKey={CHAT_KEY} onRender={() => renderCount++} />
      </ThemeProvider>
    );

    const initialRenders = renderCount;
    expect(initialRenders).toBeGreaterThanOrEqual(1);

    // Simulate 5 streaming deltas (changing message text only)
    for (let i = 1; i <= 5; i++) {
      await act(async () => {
        threadStore.setState((s) => ({
          threads: {
            ...s.threads,
            [CHAT_KEY]: {
              ...s.threads[CHAT_KEY],
              messages: [
                {
                  id: "msg-1",
                  role: "assistant",
                  content: `Starting answer delta ${i}`,
                  isStreaming: true,
                  createdAt: Date.now(),
                },
              ],
            },
          },
        }));
      });
    }

    // Composer harness should NOT have re-rendered during streaming deltas
    expect(renderCount).toBe(initialRenders);

    // Now simulate running flipping from true to false (streaming completed)
    await act(async () => {
      threadStore.setState((s) => ({
        threads: {
          ...s.threads,
          [CHAT_KEY]: {
            ...s.threads[CHAT_KEY],
            running: false,
          },
        },
      }));
    });

    // Composer MUST have re-rendered because `running` changed
    expect(renderCount).toBe(initialRenders + 1);
  });
});
