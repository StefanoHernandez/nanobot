import "../../src/platform/install";
import { act, renderHook } from "@testing-library/react-native";
import { useEffort } from "../../src/extras/effort";
import { sessionStore } from "../../src/state/sessionStore";
import { threadStore } from "../../src/state/threadStore";
import { fakeSession, flush } from "../state/fake";

const KEY = "websocket:c1";
const preset = { name: "m", provider: "p", model: "x", max_tokens: 1, context_window_tokens: 1, temperature: 0, reasoning_effort: "low", reasoning_effort_values: ["low", "high"], is_default: true, active: true };

test("never subscribes client.onChat; refreshes when the thread preset changes", async () => {
  const f = fakeSession({
    "/api/settings": { model_presets: [preset] },
    "/api/sessions": { sessions: [{ key: KEY, model_preset: "m" }] },
  });
  const onChat = jest.spyOn(f.client, "onChat");
  sessionStore.setState({ session: f.session, state: "open" as never });
  threadStore.setState({ threads: {} });
  const { result } = await renderHook(() => useEffort(KEY));
  await act(flush);
  expect(result.current.state?.levels).toEqual(["low", "high"]);
  const settingsGets = () => f.get.mock.calls.filter(([p]) => p === "/api/settings").length;
  const before = settingsGets();
  await act(async () => {
    threadStore.setState({ threads: { [KEY]: { messages: [], running: false, model: "x", preset: "m-high", notices: [], draft: "", loaded: true, stopped: false, sendError: null, uploading: false, pendingFiles: [], forkBoundary: null, temporary: false } } });
    await flush();
  });
  expect(settingsGets()).toBeGreaterThan(before);
  expect(onChat).not.toHaveBeenCalled();
});
