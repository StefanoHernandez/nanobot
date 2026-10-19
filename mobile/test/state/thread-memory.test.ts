import "../../src/i18n";
import { threadStore } from "../../src/state/threadStore";

describe("Thread memory: visited chats eviction (PF-A)", () => {
  const mockSession = {
    id: "s1",
    get: jest.fn().mockResolvedValue({ events: [] }),
    client: {
      onChat: jest.fn(() => () => {}),
      onRunStatus: jest.fn(() => () => {}),
      onStatus: jest.fn(() => () => {}),
    },
  } as any;

  beforeEach(() => {
    threadStore.getState().reset();
    jest.clearAllMocks();
  });

  test("unload keeps messages of last 5 visited chats plus any running one, evicting the rest", async () => {
    // Visit 7 chats sequentially
    for (let i = 1; i <= 7; i++) {
      const key = `chat-${i}`;
      await threadStore.getState().load(mockSession, key);
      // Give each chat a sample message
      threadStore.setState((s) => ({
        threads: {
          ...s.threads,
          [key]: {
            ...s.threads[key],
            messages: [{ id: `m-${i}`, role: "user", content: `Hello from ${key}`, createdAt: Date.now() }],
            running: i === 1, // chat-1 is running!
          },
        },
      }));
      threadStore.getState().unload(key);
    }

    const state = threadStore.getState().threads;

    // Last 5 visited are chat-3, chat-4, chat-5, chat-6, chat-7
    for (let i = 3; i <= 7; i++) {
      expect(state[`chat-${i}`].messages.length).toBeGreaterThan(0);
    }

    // chat-1 is running, so it must also keep its messages
    expect(state["chat-1"].messages.length).toBeGreaterThan(0);

    // chat-2 was visited earlier (not in last 5) and is not running -> messages evicted
    expect(state["chat-2"].messages.length).toBe(0);
  });
});
