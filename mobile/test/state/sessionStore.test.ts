import "../../src/platform/install";

const mockSecret = jest.fn(async (_id: string) => "sec");
jest.mock("../../src/core/profiles", () => ({
  profiles: {
    list: () => [{ id: "a", name: "A", baseUrl: "http://a", hasSecret: true }, { id: "b", name: "B", baseUrl: "http://b", hasSecret: true }],
    activeId: () => "a",
    getSecret: (id: string) => mockSecret(id),
  },
}));
const mockStart = jest.fn(async () => {});
const mockStop = jest.fn();
jest.mock("../../src/core/session", () => ({
  NanobotSession: jest.fn().mockImplementation(() => ({
    state: "open", start: mockStart, stop: mockStop, onState: () => () => {},
    client: { onSessionUpdate: () => () => {}, onError: () => () => {}, onSidebarStateUpdate: () => () => {} },
  })),
}));

import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { chatsStore } from "../../src/state/chatsStore";

beforeEach(() => {
  jest.clearAllMocks();
  sessionStore.getState().close();
  jest.spyOn(chatsStore.getState(), "refresh").mockResolvedValue();
});

test("opening another profile resets all threads", async () => {
  await sessionStore.getState().open("a");
  threadStore.setState({ threads: { "websocket:x": { messages: [], running: false, model: null, preset: null, notices: [], draft: "old", loaded: true, stopped: false, sendError: null, uploading: false, pendingFiles: [], forkBoundary: null, temporary: false } } });
  await sessionStore.getState().open("b");
  expect(threadStore.getState().threads).toEqual({});
  expect(sessionStore.getState().profile?.id).toBe("b");
});

test("close() resets threads", async () => {
  await sessionStore.getState().open("a");
  threadStore.setState({ threads: { k: {} as never } });
  sessionStore.getState().close();
  expect(threadStore.getState().threads).toEqual({});
});

test("a SecureStore read failure ends in auth_error with the profile, not a dead screen", async () => {
  mockSecret.mockRejectedValueOnce(new Error("keystore invalidated"));
  await sessionStore.getState().open("a");
  expect(sessionStore.getState().state).toBe("auth_error");
  expect(sessionStore.getState().profile?.id).toBe("a");
  expect(sessionStore.getState().session).toBeNull();
});
