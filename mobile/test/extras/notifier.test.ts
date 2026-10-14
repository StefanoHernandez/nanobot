import { TurnNotifier } from "../../src/extras/notifier";

const mk = (fg = false) => {
  const notify = jest.fn();
  return { notify, n: new TurnNotifier({ notify, isForeground: () => fg }) };
};

describe("TurnNotifier", () => {
  it("dedupes identical turn_end", () => {
    const { n, notify } = mk();
    n.handle({ event: "delta", chat_id: "a", text: "hi" });
    n.handle({ event: "turn_end", chat_id: "a" });
    n.handle({ event: "turn_end", chat_id: "a" });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("nanobot", "hi");
  });
  it("notifies again for next turn", () => {
    const { n, notify } = mk();
    n.handle({ event: "turn_end", chat_id: "a" });
    n.handle({ event: "delta", chat_id: "a", text: "x" });
    n.handle({ event: "turn_end", chat_id: "a" });
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it("tool-only turn (no delta) still notifies each turn", () => {
    const { n, notify } = mk();
    n.handle({ event: "turn_end", chat_id: "a" });
    n.handle({ event: "user_message", chat_id: "a", text: "go" });
    n.handle({ event: "turn_end", chat_id: "a" });
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it("foreground, cancelled and failed are silent", () => {
    const f = mk(true);
    f.n.handle({ event: "turn_end", chat_id: "a" });
    const c = mk();
    c.n.handle({ event: "turn_end", chat_id: "a", outcome: "cancelled" });
    c.n.handle({ event: "turn_end", chat_id: "b", outcome: "failed" });
    expect(f.notify).not.toHaveBeenCalled();
    expect(c.notify).not.toHaveBeenCalled();
  });
  it("uses title set for the chat", () => {
    const { n, notify } = mk();
    n.setTitle("a", "My chat");
    n.handle({ event: "turn_end", chat_id: "a" });
    expect(notify).toHaveBeenCalledWith("My chat", "");
  });
});
