import "../src/platform/install";
import { NanobotClient } from "@/lib/nanobot-client";
import { projectThreadEvents, type ThreadProjectionEvent } from "@/lib/thread-event-projection";

function fakeSocket(): WebSocket {
  return { readyState: 0, send() {}, close() {} } as unknown as WebSocket;
}

test("vendor client constructs with injected socket", () => {
  const sockets: string[] = [];
  const c = new NanobotClient({
    url: "wss://h/?token=t",
    socketFactory: (u) => {
      sockets.push(u);
      return fakeSocket();
    },
  });
  c.connect();
  expect(sockets).toEqual(["wss://h/?token=t"]);
});

test("projection turns delta events into one assistant message", () => {
  const events = [
    { event: "user_message", chat_id: "c", text: "hi", starts_turn: true, turn_id: "t1" },
    { event: "delta", chat_id: "c", text: "Hel", turn_id: "t1" },
    { event: "delta", chat_id: "c", text: "lo", turn_id: "t1" },
    { event: "stream_end", chat_id: "c", turn_id: "t1" },
    { event: "turn_end", chat_id: "c", turn_id: "t1" },
  ] as ThreadProjectionEvent[];
  const msgs = projectThreadEvents(events);
  const assistant = msgs.filter((m) => m.role === "assistant");
  expect(assistant).toHaveLength(1);
  expect(assistant[0].content).toBe("Hello");
});

test("crypto.randomUUID exists", () => expect(typeof crypto.randomUUID()).toBe("string"));
