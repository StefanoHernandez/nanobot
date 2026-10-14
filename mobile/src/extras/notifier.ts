export type NotifierDeps = { notify(title: string, body: string): void; isForeground(): boolean };
type Ev = { event?: string; chat_id?: string; text?: string; content?: string; outcome?: string };

/** One notification per turn (incl. tool-only turns); skips cancelled/failed turns and foreground. Platform-free. */
export class TurnNotifier {
  private preview = new Map<string, string>();
  private ended = new Set<string>(); // chats whose last turn_end already handled
  private titles = new Map<string, string>();
  constructor(private deps: NotifierDeps) {}

  setTitle(chatId: string, title: string) { this.titles.set(chatId, title); }

  handle(ev: Ev): void {
    const id = ev?.chat_id;
    if (!id) return;
    if (ev.event !== "turn_end") this.ended.delete(id);
    if (ev.event === "delta" || ev.event === "message") {
      const text = ev.text ?? ev.content;
      if (typeof text === "string" && text) this.preview.set(id, ev.event === "delta" ? (this.preview.get(id) ?? "") + text : text);
    } else if (ev.event === "turn_end") {
      if (this.ended.has(id)) return;
      this.ended.add(id);
      const body = (this.preview.get(id) ?? "").trim().slice(0, 120);
      this.preview.delete(id);
      if (ev.outcome && ev.outcome !== "completed") return;
      if (this.deps.isForeground()) return;
      this.deps.notify(this.titles.get(id) ?? "nanobot", body);
    }
  }
}
